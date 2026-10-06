# TraceHound

Analyzes a TypeScript repo and renders it as an interactive, evidence-backed component graph
on a canvas. A repair agent runs against it; in the held-out evaluation the graph did not help
it (decision 050).

## Current state (2026-10-06)
- **Live:** https://tracehound-tau.vercel.app (Vercel, Root Directory `viewer`, auto-deploys
  from `main`; leave Output Directory unset). CI (`.github/workflows/ci.yml`) runs the snapshot
  version guard, tests, typecheck, and the viewer build, and checks that `out/snapshots/index.json`
  exists.
- **Built:** analyzer 0.10.0 (imports, routes, Redis, Prisma, env, startup-call extractors;
  BullMQ queues; anchor-reach grouping; `tracehound.json` overrides, `ignore` and `entryPoints`;
  orphan and queue warnings; `proven` / `resolved-default` / `dynamic` labels; TESTS links from
  test files; non-test files under `test/`, `tests/`, `__tests__/` are test support, in no component; per-file `chars`; error-message literals) → static snapshots + manifest → viewer
  (React Flow + ELK, node/edge inspectors, GitHub permalinks, warnings panel, phone bottom sheet).
  Published snapshots (`snapshots/`; older files are kept): CEX @ `da0e3d6` and Recall @ `5d2165a`,
  both analyzer 0.10.0.
- **Snapshot index (decision 039):** `snapshots/index.json` has `repos[]` ({id, name, repoUrl,
  defaultRef, latest, versions}) and `defaultRepo` (`recall` since decision 040) next to the original
  `latest` / `snapshots`; since the 0.10.0 regeneration the top-level `latest` is Recall `5d2165a` too.
  `context` / `query` take `--repo-id`; every MCP tool takes an optional `repo`. Version guard:
  `node packages/analyzer/src/version-guard.ts snapshots` fails if any repo's latest snapshot isn't
  the current `ANALYZER_VERSION` and prints the cache-only regenerate command (temp clone).
- **Change sets (decisions 038, 039; schemaVersion 2; CLI only):** `pnpm tracehound changes --repo <path>
  --diff <base>..<head> [--config f] [--out f] [--json]` or `--run <run record>` → a
  declaration-level diff (functions, classes, methods, properties, React components, exported
  variables, types/interfaces/enums, inline route handlers, module code), modification kinds
  (`formatting` = whitespace/comments only, not counted as modified), +/- lines, added/removed
  `calls` / `route` / `produces` / `consumes` edges with evidence, a component rollup (files keep
  their base component at head; edges that only moved by regrouping are `regrouped`), and four
  warnings (queue orphaned by the diff, queue payload type changed, cross-component signature
  change, removed declaration still referenced). Worktrees get read-only symlinks to the source
  checkout's node_modules. Every call is resolved, external or dynamic (counted, never dropped).
  No model.
- **BullMQ (decisions 035, 042, detector `bullmq-queues@0.2`):** `new Queue` / `<queue>.add` (queue
  resolved through symbols) / `new Worker` → producer `-produces->` one broker node per queue
  name `-consumes->` worker; a file that constructs a Worker is a process entry point. Unpaired,
  unresolved and unsupported constructs are warnings. 0.2 also follows a queue through a factory's
  return value and through **one** function parameter to that function's call sites: one real
  Queue → `resolved-default`, citing the add site, the wiring call site and the construction;
  several → one `dynamic` edge each; more than one hop → no edge, a warning. An inline Worker
  processor that only calls one named function is labelled with it. Not frozen yet; Recall
  shaped both versions, so an unseen third repo checks it after it freezes (backlog).
- **Second repo, Recall** (`SunnyBagal/Recall` @ `5d2165a`, public, MIT since `9113ced`, which
  only adds LICENSE): config `configs/recall.tracehound.json`; snapshot in `snapshots/` as repo
  `recall` of the multi-repo index (decision 039; it is the `defaultRepo`, so the viewer opens on
  it) → 7 components, 6 edges (API -produces->
  `content-processing` queue -consumes-> worker, both proven), 2 orphan warnings.
- **Recall on the repair harness (decision 041, checked 2026-10-02):** branch `testable-baseline`
  @ `57d920e` (backend `recall-backend/`, frontend `recall-frontend/`; `main` is `9113ced`). In
  the sandbox image: `bun install --frozen-lockfile` 210 packages, `bun test` 62 pass with the
  network off, `tsc --noEmit` 5 pre-existing errors. Repo profile `configs/recall.profile.json`
  (workdir, install, test, typecheck; a task names it with `"profile"`); a task can seed a bug
  with `"seed": { "patch" }` (applied before the base commit; FAILED if it changes nothing). The
  typecheck gate fails only on tsc errors not in the baseline (file + TS code + message, line and
  column ignored) and records whether the repo's own tsc or the image's ran. Smoke task
  `eval/tasks/recall-smoke-trending` (`kind: smoke`, never an evaluation task): five scripted
  outcomes in `test/harness-recall.test.ts` (Docker + `TRACEHOUND_NETWORK_TESTS=1`). At
  `57d920e` the queue is injected through `createApp`; since `bullmq-queues@0.2` (decision 042)
  the API -produces-> queue edge is `resolved-default` with three evidence sites (it was missing
  at 0.9.0). The `57d920e` snapshot is `eval/snapshots/57d920e…/0.10.0.json` (7 components, 6 edges,
  2 orphan warnings; heuristic names, not published), which the smoke task names for `--graph on`.
- **Impact (feature 4, CLI only):** `pnpm tracehound impact --repo <path> --diff <base>..<head>
  [--depth 2] [--json]` → changed/affected components with evidence chains (decision 023).
  Needs a current-version snapshot of `<base>` in `snapshots/` (the error prints the regenerate
  command, `--cache-only` when the older snapshot had model names). `--out impacts/<name>.json`
  writes a report the viewer serves at `?impact=<name>` (changed/affected styling, dynamic
  edges flagged, chain panel). The viewer build fails if an impact cites an id missing from its
  base snapshot. Precomputed: `seed-queue-consumer`, `seed-rpc-bridge`, `seed-pending-registry`.
- **Repair harness (feature 6, decisions 026, 036):** `pnpm tracehound repair --task
  eval/tasks/<id>/task.json --agent oracle|noop|nemotron [--patch f] [--graph on|off]
  [--reasoning on|off] --provider docker` → `runs/<id>.json`. **Local Docker is the sandbox of
  record** (decision 036; Token Factory Sandboxes are not available on this account, Nebius case
  AISTUDIOSUP-1966; the spike is parked in `scripts/parked/`). Image
  `tracehound-sandbox:bun1.4.2-ts5.9.3-2` (`harness/sandbox.Dockerfile`, digest-pinned bases),
  `docker-provider@2`: uid 1000 (not root), caps dropped, 2 GB / 2 CPUs / 512 pids, no mounts or
  socket, network disconnected after setup and proven off, `--rm` plus a bounded lifetime so a
  crashed harness can't leak a container. A container that expires or disappears ends the run
  FAILED "sandbox lifetime expired (N s)" / "sandbox container disappeared", never UNRESOLVED and
  never a tool error the agent sees (decision 037); docker create/start/cp time out at
  60/60/120 s. Each test-backed property and the gaps are listed in
  decision 036 and the README's Sandbox section. Run records carry `sandboxEnv` (image id, Docker
  and provider versions) and `snapshot` (path, analyzerVersion, commit, sha256, or `"none"`).
  The sandbox's history is squashed to one fixed `base` commit after setup (no `git log -p`
  leak). Toy fixture: `node eval/fixtures/build-toy-repo.ts`, tasks
  `eval/tasks/toy-*`. **Dev tasks (decision 044):** four seeded Recall tasks, kind `dev`
  (tuned on, never evaluation results): `eval/tasks/recall-dev-{short-summary,search-description,
  session-expiry,chat-recent}`; each seed is one line in a different backend file and leaves
  Recall's 62 tests green; two have the symptom in the API and the fault elsewhere (one across
  the queue, in `processContent`). Oracle → RESOLVED, noop → UNRESOLVED for all four (Docker test
  block in `test/harness-recall.test.ts`). The ids `dev-01` / `dev-02` stay free for the user's
  CEX tasks.
  `--graph on` reads the snapshot named in task.json, on the host (toy-discount:
  `eval/snapshots/3582f35…/0.6.0.json`).
- **Repair agent (decisions 029, 030):** host-side loop with native tool calls, Nano by default.
  agent-v2 (environment facts, repeat guard, whitespace-tolerant edit_file, confirm-on-empty
  finish) **failed the toy gate: graph off resolved 2/5, needed 4/5**
  (`eval/dev-log/2026-09-30-toy-gate.md`). The toy is a single-file bug, so on/off there says
  nothing about the graph.
  agent-v3 (decision 033) added a 4,000-char output cap, a "stuck" stop and one no-edit nudge.
  agent-v4 (decision 034): reasoning on (`--reasoning off` to disable), scratch code in
  `/scratch` outside the repo, edits counted only on base files, agent-added test files removed
  before verification. agent-v5 (decision 045): graph on puts the
  `tracehound context` packet for the issue in the first message (graph tools stay; graph off
  has neither; same budgets); run records carry `arm`. Its prompt was tuned in two rounds on the
  dev tasks and **round 1's prompt is frozen** (round 2 was reverted). Graph tool calls were 0 in
  every graph-on dev run. Under load Recall's own tests can time out and turn a correct patch
  UNRESOLVED: evaluate with concurrency 1. v1–v4 prompts are kept.
  **agent-v6 is the default (decision 047):** agent-v5's prompt byte-identical; `str_replace_editor`
  (never offered) runs as `read_file` / `list_dir` / `edit_file` for the eight argument shapes Nano
  used, anything else gets the one-line unknown-tool error; `edit_file` retries with trailing
  whitespace and line endings ignored (exactly one match) before the agent-v2 fallback, and every
  edit error shows the closest region (≤ 40 lines). Run records add `faultFileRead` (step and tokens
  to the first read of a seeded file) and `limits`. The Docker test files run one at a time after
  the rest (`packages/analyzer/vitest.config.ts`); a failing Recall harness test keeps its run
  record in `runs/test-records/`.
- **Evaluation runner (decision 046):** `node packages/analyzer/src/harness/evaluate.ts --tasks
  <dir> [--arms on,off] [--repeats N] [--kind k] [--out dir] [--max-spend-usd x] [--model id]
  [--cost-limit-usd x]` → one `tracehound repair` per run, `results.json` + `results.md` (n beside
  every total, no significance claims; end reason, failed edits, unknown-tool calls, time to fault
  file, baseline tests passed / total with a `baselineAnomaly` flag). **Frozen for the evaluation:
  `docs/freeze.md`, tag `eval-freeze-2`** (analyzer 0.10.0, agent-v6, prompt sha256 `556861d4…`,
  image `tracehound-sandbox:bun1.4.2-ts5.9.3-2`, Nano, reasoning on, temperature 0, per-test gate
  on Recall; per-run cost limit Nano $0.10, Super $0.60). `eval-freeze` (agent-v5) is superseded
  and kept. Build log: `docs/build-log.md`. **Evaluation protocol: `docs/eval/protocol.md`**
  (written before any held-out task exists here); it decides which models run, freeze.md decides
  code, prompt and settings.
- **Held-out evaluation (decisions 049, 050):** Amendment 1 (049) added "verified at stop" (final
  patch passes repro, per-test and typecheck gates, whatever ended the run), five passes per batch
  with arms spread, and a canary after every pass. Ran 2026-10-05/06 from `eval-freeze-2`: 160
  counted runs ($5.72; the ledger total for the whole evaluation, void runs included, is $6.27). Results in `docs/eval/heldout-results.md` (050, recomputed from the run
  records by `docs/eval/heldout/recompute.mjs`). **The graph did not help:** resolved graph-on vs
  off, n = 40 each, Nano 11 vs 13, Super 28 vs 26; 0 graph tool calls in 80 graph-on runs; Nano
  verified at stop 11 vs 19. Tarballs (runs, results, driver scripts) are on a draft release; the
  evaluation prompt is `docs/prompts/heldout-eval-run.md`. Held-out task files are not in the repo yet.
- **Reproduce stage (decision 048, `repro-v1`):** `node packages/analyzer/src/harness/reproduce.ts
  run --claim <json> | batch --claims <dir> [--model] [--cost-limit-usd] [--max-ledger-usd] |
  oracle-check --record --patch | to-task --record`. A claim (`eval/claims/`: profile, source,
  baseSha, title, claim text, optional evidence and seed) → the frozen loop with
  `harness/prompts/repro-v1.md` writes one test → a check in a fresh sandbox, independent of the
  agent: (a) exactly one new test file and nothing else, (b) it loads and fails on an
  `AssertionError` (bun's JUnit `<failure type>`) with no new tsc error, (c) the same cases fail
  twice, (d) decision 043's per-test rule with the file in the suite. States REPRODUCED /
  NOT_REPRODUCED / REJECTED (check a–d) / FAILED (infrastructure, incl. model request errors).
  Records in `runs/`; the test text stays there and docs get states and counts. Dev results
  (2026-10-04, one run per cell, after one prompt change): Super reproduced 3 of 4 seeded claims
  (all true by oracle check) and 1 of 4 controls; Nano 0 of 4. `to-task` turns a REPRODUCED
  record into a repair task under `runs/`; the frozen repair agent on Nano resolved 1 of 3.
- **Finder phase 1 (decision 051, `finder-rules@1`, no model):** `pnpm tracehound find --repo
  <path> [--config f] [--out f] [--json]` → `runs/finder/<repo id>-<sha7>.json` (gitignored).
  Deterministic probes read the source only at the graph's route, mount and queue evidence; the
  rules are a pure function of snapshot + probes. Families: `route-without-auth`,
  `payload-field-missing`, `request-to-fetch`. Each hypothesis: one narrow question, the rule,
  snapshot evidence ids, excerpts, a stated input. Rules find only rule-shaped bugs. Recall
  `5d2165a`: 1 / 0 / 2. Sessions that build the finder never see Recall's real bug list; the
  repo gets counts only, never hypothesis text.
- **Finder → claims (decision 052, no model):** `tracehound find … --claims <dir under runs/>
  --profile <profile.json> [--git-url <url>]` also writes, per hypothesis, a Form A claim
  (question + stated input, `file:line` evidence) and a Form B claim (the same plus `excerpts`) in
  `form-a/` / `form-b/`, same id, baseSha = the commit the finder read. `ClaimSpec` has an optional
  `excerpts` field; without it the agent's prompt is byte-identical (pinned in
  `test/claim-excerpts.test.ts`). Claims target Recall `testable-baseline` @ `57d920e` (the
  profile's commit): 1 / 0 / 1 hypotheses, 4 claim files. The reproduce stage has not run on them.
- **Localizer (decision 027):** `tracehound context --decider lexical|nemotron` (default lexical).
  The nemotron decider is Nano, reasoning off, temperature 0, over deterministic facts only; it
  validates ids, retries once, then falls back to lexical visibly. **Frozen as `decider-v1`**
  (issuePhrase ≤ 6 words) until the evaluation is over; dev results in the dev log above.
- **Agent tools (feature 5):** `context` / `query` / `mcp` over a snapshot. Ranking v1 is lexical
  and deterministic, confidence is a labelled heuristic, and token counts are estimates (chars/4).
  See decision 025.
  Compared with dependency-cruiser `--reaches` on 3 seeded fork branches in
  `docs/impact-comparison.md` (it found nothing TraceHound missed; TraceHound over-reports at
  component granularity). A queue crossing costs one hop of depth (decision 024).
- **Demo:** `SunnyBagal/cex-v2-boilercode` (fork of `rahul-MyGit/cex-v2-boilercode`, used with
  the original author's agreement) @ `da0e3d6` → 9 components, 17 edges, 1 orphan warning
  (`engine/src/store/exchange-store.ts`). The fork's `main` must stay at `da0e3d6`; seeded
  changes live on `seed/<name>` branches based on `da0e3d6` and are never merged. Don't add a
  LICENSE file to the fork. Regenerate names without spending:
  `node src/cli.ts … --cache-only` (any cache miss aborts, no network).
- **Naming:** Nano with reasoning off (`chat_template_kwargs.enable_thinking=false`, decision
  020) plus deterministic checks (021). Nano beat Super on cost and tied on checks, so Nano
  stays the default. Naming spend was about $0.043; all-time spend is in `pnpm spend`
  ($3.024 on 2026-10-04, mostly repair-agent and reproduce-stage runs). A wrong name is fixed with a
  `tracehound.json` name override (never labelled model-written); a wrong summary is dropped with
  `summary: false`, never replaced by hand. Audited by hand on 2026-10-01: Recall 5 of 7
  summaries wrong (3 names), CEX 2 of 7 summaries wrong (0 names); fixes are in
  `configs/*.tracehound.json` (FEEDBACK.md). decider-v1 reads no names or summaries; the lexical
  ranking reads heuristic names and override names, never model names or summaries
  (`src/agent/rank.ts:54-55`).
- **Prices:** `config/prices.json` has Nano/Super rates from third-party trackers, not yet
  verified in the Nebius console.

### Open blockers
1. ~~**CEX has no license.**~~ Closed 2026-09-30: the demo repo is the fork
   `SunnyBagal/cex-v2-boilercode`, with the original author's agreement.
2. ~~**Sandbox: waiting on Sandboxes beta access.**~~ Closed 2026-10-01: Nebius support (case
   AISTUDIOSUP-1966) said Sandboxes are not yet ready to be used on this account. Docker is the
   sandbox of record (decision 036); the spike is parked in `scripts/parked/`.
3. ~~**Naming check bug (slash identifiers).**~~ Closed 2026-09-30: joined tokens are split
   and checked case-sensitively (decision 021 update). Prose is still unchecked, so the viewer
   labels model-written names/summaries "prose not verified". Naming work is closed.

## Product rule (non-negotiable)
Every edge in the graph must be backed by evidence: file, symbol, line range, extractor name,
confidence. Extraction, grouping and edges are deterministic — no model is involved. Never draw
an edge you can't point to in code. The one model call allowed is the optional naming pass
(`src/naming/llm.ts`, Nemotron Nano via Nebius Token Factory): it sees extracted facts only (no
source), may change only component `name`/`summary`, falls back to the heuristic name on any
failure, and every call is logged in `snapshot.llmCalls` (model, latency, tokens).

## Spending (hackathon credits, not ours)
All model calls go through `src/llm/client.ts`: response cache → budget reservation (run cap
`TRACEHOUND_BUDGET_RUN_USD`=1, total cap `TRACEHOUND_BUDGET_TOTAL_USD`=45) → request → ledger
(`.tracehound/spend.jsonl`, `pnpm spend`). Nano is the default; Super/Ultra only via explicit
`--model`. Super (`nvidia/nemotron-3-super-120b-a12b`) was probed on the dev tasks with
`--cost-limit-usd 0.6` (agent-v6 amendment 1, $0.39 for 8 runs). The evaluation runs Nano and Super: `docs/eval/protocol.md` decides the models, `docs/freeze.md` the code, prompt and settings (owner's ruling, 2026-10-04). Tests must never hit the network or need
`NEBIUS_API_KEY` (`test/setup.ts` enforces this). Keep `config/prices.json` placeholders until
real catalog prices are filled in. Unresolved facts (e.g. an import of a generated file that isn't in the
repo) are recorded as facts but never produce edges.

## Stack (fixed — ask before adding dependencies)
- pnpm workspaces, Node >= 24. TS runs via Node's native type stripping: use `.ts` import
  extensions and erasable-only syntax (no enums, no parameter properties, no namespaces).
- `packages/analyzer` — ts-morph + Zod. `@tracehound/analyzer/schema` is the zod-only subpath
  the web imports; keep `src/schema.ts` free of relative imports.
- No API server for now (hackathon): snapshots are static files. The analyzer writes
  `snapshots/<sha>/<analyzerVersion>.json` plus `snapshots/index.json` (manifest with a
  `latest` pointer); the viewer loads the manifest, then the snapshot file directly.
- `viewer/` — static Next.js export (App Router, React Flow `@xyflow/react`, elkjs, Tailwind).
  Loads `snapshots/index.json` then the latest snapshot; no server, API, auth or DB.
- Vitest for extractors and grouping; one viewer component test (jsdom) on the demo snapshot.
- Later: Postgres/Drizzle/BullMQ. For now the JSON snapshot file is the store.

## Commands
- `pnpm demo` — clone the pinned demo repo into `fixtures/demo-repo` and analyze it (uses
  `configs/cex-v2-boilercode.tracehound.json`; set `NEBIUS_API_KEY` in `.env` for LLM names).
- `pnpm tracehound impact --repo fixtures/demo-repo --diff da0e3d6..<ref>` — impact of a diff.
- `pnpm tracehound context --issue "<text>" [--budget 2000] [--json]` — context packet for an agent.
- `pnpm tracehound query <search_components|get_neighbors|get_edge_evidence|get_related_tests> ...`
  and `pnpm tracehound mcp` (stdio MCP server, same tools). All read one snapshot; no network.
- `pnpm test` / `pnpm typecheck` — all packages.
- `pnpm --filter @tracehound/viewer dev` — viewer on :3000 (copies ../snapshots first).
- `pnpm --filter @tracehound/viewer build` — static export in `viewer/out/`.

## Conventions
- Snapshots are keyed by commit SHA + `ANALYZER_VERSION` (`packages/analyzer/src/version.ts`).
  Bump the version when extractor or grouping output changes.
- Extractors return facts + `Evidence`; they never create component edges. Grouping is a pure
  function over `FileFacts`; edges are aggregated from facts afterwards.
- Confidence: 1.0 compiler-resolved · 0.9 pattern with import provenance · 0.7 value resolved
  via fallback/const indirection · 0.5 real op, dynamic/unresolved operand. Numbers are
  internal; every edge also carries `confidenceLabel` (`proven` · `resolved-default` ·
  `dynamic`), which is what the UI shows.
- The ten study S1 repos (mirlo, plunk, firecrawl, PeerTube, Flowise, logchimp, usesend, openpanel, midday, langfuse; decision 043) are a seen set: never tune the BullMQ detector on them.
- Record non-obvious choices in `docs/decisions.md` (choice + rejected alternative).
- Small, meaningful commits pushed to `main`.
- **Gates (tests, typecheck, build) run in a plain shell, never via `git rebase --exec` or a git
  hook.** Those export `GIT_DIR` & co., which override `git -C` in child processes (this once put
  fixture commits into a real worktree; decision 032). Before a gate, this must print nothing:
  `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`.
  Every git spawn in code passes `env: cleanGitEnv()` (`packages/analyzer/src/git-env.ts`).

## Roadmap
1. Slice: analyzer → static snapshot JSON + manifest → Railway-style canvas.
2. API (Fastify) + Postgres (Drizzle) persistence; analysis jobs on BullMQ; arbitrary repos.
3. More extractors (BullMQ, Kafka, fetch/axios calls between services, tRPC, Next routes).
4. Snapshot diffing across commits.
5. Graph-guided repair agent: trace an issue to affected components, propose tested fixes in a
   sandbox.
