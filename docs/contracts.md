# Cross-file contracts (contracts-v1)

TraceHound's reviewers see a pull request's diff and `git grep` references. They miss contracts the
pull request breaks in files it didn't edit. The contracts stage finds what the pull request changed
that unedited files depend on, and turns provable breaks into findings. It uses no model and makes
no network calls.

```
pnpm tracehound contracts --repo <git dir> --base <sha> --head <sha> --out <file.json> [--budget-s 120]
```

The base side is the **merge base** of `--base` and `--head`, the same as a pull request's diff.
The command makes two `git worktree`s (merge base and head) and removes them when it's done. It
doesn't install the target repo's dependencies. When the source checkout has `node_modules`, they
are symlinked into both worktrees read-only, as `tracehound changes` does. The output is
`{ refs, typed, keyed, dependents, findings, timings }`. The code is in
`packages/analyzer/src/contracts/`.

## The four parts

### typed: tsc diagnostics new at head (`typed.ts`)

- **Detects:** a type error that the pull request introduces, for example a new required parameter,
  a removed field or export, or a return type that becomes nullable under `strict`. The error must
  be one that TypeScript reports.
- **How:** it finds every `tsconfig.json` outside `node_modules` and build output, plus the configs
  those reference (`tsconfig.app.json` and similar). It builds a program from each config at both
  sides, using the TypeScript that ts-morph bundles. Settings are changed for checking only: no
  emit, `composite` off, and project references dropped, so an import of a referenced project
  resolves to its source. Each root file is checked once, by its nearest config.
- **Matching:** a head diagnostic is new when no base diagnostic has the same file, code and
  normalized message. The message is the full chain, with worktree paths removed and whitespace
  collapsed. Matching runs twice. The first pass compares base lines shifted through the diff. The
  second compares at any line. So a line shift is not a new error, but a second copy of an existing
  error in the same file is. A renamed file is compared under its head path. An external module that
  isn't installed fails the same way on both sides, so it cancels out. A test checks this.
- **Output:** new diagnostics split into `editedFiles` and `uneditedFiles`. Each unedited one has a
  `cause`, the edited site it points back to. The cause is found by trying these in order:
  1. related information in an edited file;
  2. the declaration of the symbol at the diagnostic;
  3. a removed line that names the word at the diagnostic, or a deleted file it names;
  4. the first change in an edited file it imports, else the first change in the diff.

### keyed: string-keyed contracts (`keyed.ts`, `shapes.ts`)

- **Detects:** a pull request that removes or renames one of these keys while a file it didn't edit
  still uses the old key:
  - an HTTP route path;
  - a queue or job name;
  - a Redis key or key prefix;
  - an env var name;
  - an event or channel name.
- **TypeScript files:** the analyzer's own extractors (`http-routes`, `bullmq-queues`, `redis`,
  `env`) run on each edited file at base and at head. Event names have no extractor, so they go
  through the literal diff.
- **Other files:** a conservative literal diff. A quoted string literal on a removed line counts
  when it matches a shape in `shapes.ts`. A shape needs both the literal's form and a context word on
  the same line, at a definition-style site. A route needs a registration (`@app.route`,
  `HandleFunc`, `router`), not a client call. An env name must be SCREAMING_SNAKE with an
  underscore, on a line that reads the environment. Dotenv files are read by name.
- **When a key counts as gone:** no edited file still has it at head, as an extractor fact or as
  the literal. A rename pairs the old key with a new key of the same kind in the same file, in line
  order. An env var counts only when it is renamed. Removing a read is not a break by itself. Test
  files don't count on the changed side: a test that stops using a key hasn't changed the key.
- **Stale uses:** `git grep -F` of the exact literal in the head worktree (`-w` for env names),
  filtered to whole-key uses and to files the pull request didn't edit. Docs, lockfiles and vendored
  code are never uses.
- **When the old key still works:** if an unedited TypeScript file at head still provides the key,
  its uses are not stale. That means a route that is still registered, a queue that is still both
  fed and consumed, or a Redis key that is still both written and read.

### dependents: use sites of changed exported declarations (`dependents.ts`)

- **What it lists:** exported declarations the pull request changes or removes, their signature at
  base and at head, and their use sites in unedited files.
- **TypeScript:** declarations come from `changes/` (decision 038) on the edited files of both
  sides, ignoring formatting. Use sites come from `git grep -w` of the name. Each site is confirmed
  through symbols. A same-named declaration elsewhere is rejected and counted.
- **Python, Go, JS, Rust, Ruby:** a definition-line regex on the diff's removed lines, and unconfirmed
  whole-word matches.
- **No findings.** This part is data for a later model specialist, which can judge behavioural
  changes.

### findings: deterministic candidates (`findings.ts`)

- `source: "tsc"`: one per new diagnostic in an unedited file.
- `source: "contract"`: one per stale use of a removed or renamed key.
- Each candidate has this shape:

  ```
  { path, line, body, source, evidence: [change, staleUse], severity: "high", category: "contract" }
  ```

- Each evidence item is `{ path, line, quote, side }`. The quote is the exact line text. `side`
  tells which revision the line number refers to: a removed line is on the base side.
- The body has three sentences: What breaks, Where, Evidence.
- The candidate type is local to `contracts/`. A later integration job unifies it with the
  reviewer's findings.

## What it can't detect

- **Behavioural changes that still compile.** A function that returns different values with the
  same signature is not seen. A change of units or a reordered side effect is not seen either.
  `dependents` lists the call sites for a later specialist, but makes no finding.
- **Dynamic keys.** A key built at runtime is not seen. Examples: ``fetch(`${base}/${path}`)``,
  `queue(name)` with `name` from config, or `process.env[key]`. A Redis key made from a template
  counts as its static prefix (`session:`) when that prefix is at least 3 characters.
- **Mounted routes.** Route paths are compared as written, without router mount prefixes. A client
  that calls the full mounted path (`/api/v1/users` for a router's `/users`) is not a match.
- **HTTP methods.** A route that keeps its path and changes its method is not a key change.
- **Types from uninstalled dependencies.** Without `node_modules`, every type imported from a
  package is `any` at both sides. A break that reaches an unedited file only through a package's
  types is invisible. Errors inside the repo's own code are still seen. On a scratch copy of
  excalidraw with no dependencies, one exported function was given a required parameter. All 31 of
  its call sites in unedited files came back as TS2554, with no other findings.
- **Messages of existing errors.** When an edited type changes the message of an error an unedited
  file already had, the error counts as new. Repos that already typecheck cleanly don't have such
  errors.
- **Other languages.** Keys come only from the literal diff, with no check that an unedited file
  still provides them. Dependents come only from definition lines the diff changed, so a body-only
  change is not listed.
- **Removed env vars.** An env var removed without a rename is reported with a note and is not
  searched.

## Budgets

| Part | Limit | When it's exceeded |
|---|---|---|
| typed | wall clock, 120 s by default (`--budget-s`); checked between configs and between files, so an overrun is bounded by one file's check | `{ skipped: "budget", reason }` |
| typed | 5,000 root files at either side; checked before any program is built | `{ skipped: "budget", reason }` |
| keyed | 200 searched keys | the rest are listed with a `note` |
| keyed | 50 stale uses per key | the rest are counted in `truncated` |
| dependents | 200 declarations | the rest are counted in `notSearched` |
| dependents | 50 use sites per declaration | the rest are counted in `truncated` |

A typed result is either complete (`complete: true`) or skipped. It is never a partial result
labelled as complete. A repo with no `tsconfig.json` gives `{ skipped: "no-tsconfig" }`, and keyed
and dependents still run.

## Overlap with CI

Where a repo already typechecks in CI, the typed part duplicates that check. It runs the same
compiler over the same files, and CI with installed dependencies sees more types. Diagnostics in
**edited** files are reported but make no findings. The value of the contracts stage is in two
places:

- new tsc errors in **unedited** files, for repos or packages that don't typecheck in CI, or before
  CI has run;
- **string keys** (routes, queues, Redis keys, env vars, events), which no type checker covers.

## Runtime

Measured on 2026-10-18 on 4 CPUs and Node 24.22, on fresh shallow clones with no `node_modules`.
Each run is `HEAD~1..HEAD` on a recent commit. "Keys / stale" is changed keys and stale uses. "Decls
/ sites" is changed exported declarations and use sites in unedited files. Times are in seconds.

| Repo | Range | Files changed | typed | Keys / stale | Decls / sites | Findings | worktrees | typed | keyed | dependents | total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SunnyBagal/Linea | `868f3f8..4f075a5` | 1 | complete, 35 files / 7 tsconfigs; new: 0 unedited, 2 edited | 0 / 0 | 0 / 0 | 0 | 0.1 | 4.9 | 0.5 | 0.1 | 5.6 |
| SunnyBagal/Linea | `ca8b1b1..868f3f8` | 23 | complete, 35 files / 7 tsconfigs; new: 0 unedited, 6 edited | 0 / 0 | 3 / 9 | 0 | 0.2 | 4.4 | 2.4 | 0.6 | 7.6 |
| SunnyBagal/Linea | `4105944..ca8b1b1` | 12 | complete, 35 files / 7 tsconfigs; new: 0 unedited, 9 edited | 0 / 0 | 3 / 15 | 0 | 0.2 | 4.3 | 1.5 | 0.3 | 6.2 |
| SunnyBagal/Recall | `3e39129..20ac149` | 4 | complete, 65 files / 4 tsconfigs; new: 0 unedited, 5 edited | 0 / 0 | 1 / 2 | 0 | 0.2 | 2.1 | 0.8 | 0.2 | 3.3 |
| SunnyBagal/Recall | `9113ced..3e39129` | 4 | complete, 63 files / 4 tsconfigs; new: 0 unedited, 13 edited | 0 / 0 | 1 / 2 | 0 | 0.2 | 2.0 | 0.2 | 0.2 | 2.6 |
| SunnyBagal/Recall | `2f958f7..9113ced` | 1 | complete, 61 files / 4 tsconfigs; new: 0 unedited, 0 edited | 0 / 0 | 0 / 0 | 0 | 0.2 | 2.1 | 0.0 | 0.0 | 2.3 |
| excalidraw/excalidraw | `4c37956..e1b7aac` | 31 | complete, 683 files / 11 tsconfigs; new: 0 unedited, 56 edited | 0 / 0 | 16 / 134 | 0 | 1.6 | 48.9 | 6.1 | 8.2 | 64.9 |
| excalidraw/excalidraw | `541653c..4c37956` | 2 | complete, 684 files / 11 tsconfigs; new: 0 unedited, 6 edited | 0 / 0 | 1 / 1 | 0 | 1.4 | 48.6 | 2.4 | 0.6 | 52.9 |
| excalidraw/excalidraw | `4f310b7..541653c` | 7 | complete, 684 files / 11 tsconfigs; new: 0 unedited, 14 edited | 0 / 0 | 6 / 19 | 0 | 1.3 | 47.8 | 5.4 | 2.6 | 57.1 |

- **Zero findings.** None of the nine commits produced a finding. These are merged commits, so no
  finding is the expected result. Nine runs say nothing about recall.
- **Edited-file diagnostics.** The new diagnostics in edited files come mostly from imports of
  packages that aren't installed (TS2307, TS2591, TS7006). They make no findings.
- **Typed time on excalidraw.** About 49 s of each run is the typed part: 11 programs at each side,
  each with about 540 to 760 files. That is inside the default budget.
