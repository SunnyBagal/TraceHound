# AGENTS.md: rules for every coding agent in this repo

This file is for agents that are not Claude Code (Codex, Grok Build, others). Claude Code reads CLAUDE.md; the rules below repeat the ones that matter for everyone. Where they disagree, CLAUDE.md wins.

**Read .agents/STATE.md first; rewrite it at the end of every session.**
**At the end of every session, add what was done and decided to tracehound-brain (`~/Projects/tracehound-brain`, github.com/SunnyBagal/tracehound-brain; public: no held-out, no testset case details), alongside LOG.md.** Agents may edit its curated notes (decisions, NOW, timeline, lessons, index); `inbox/` is for raw agent reports only; every brain change needs a codex GO before push (vault `inbox/README.md`).
**Plans from any model are hypotheses. Verify a task's premises against repo data (file:line) before executing it; report contradictions instead of working around them.**

Herdr commands: docs/herdr.md

## Who owns which files (decision 076c item 14; `docs/plan/team-process.md` §3)

One owner per path; everyone else proposes through a note or a branch the owner merges. "Owns" means writes and merges;
reading is open except where the firewall says otherwise.

| path | owner | others change it by |
|---|---|---|
| `.agents/STATE.md`, `.agents/LOG.md`, `docs/decisions.md`, `docs/budget.md`, `docs/live-setup.md`, `CLAUDE.md`, `AGENTS.md`, `tracehound-testset/run/briefs/` | artu1 | a note in `tracehound-testset/run/comms/` |
| `~/Projects/tracehound-brain` (curated notes) | artu1 writes; codex GO before every push | a raw report in the brain's `inbox/` |
| `docs/plan/` (except the two below), `docs/specs/`, `docs/runbooks/` | Planner A | `run/comms/<lane>-to-planner-a.<task>.md` |
| `docs/plan/premortem.md`, `docs/plan/team-process.md`, `run/comms/planner.b.*.md` | Planner B | a note to artu1 |
| `docs/eval/ts-protocol.md` | codex | Sunny's ruling recorded by artu1; a planner's note |
| `packages/`, `scripts/` (code and tests), `docs/bench/ts-dev.md` | bunny builds on a branch; codex reviews; artu1 merges the reviewed sha | a finding in the review report |
| `tracehound-testset`: `labels/`, overlays, `heldout/`, the held-out window directory | codex (grok as second) | counts-only reports in `run/out/` |
| `tracehound-testset`: `cases/dev/`, `repos/` (dev clones), `scripts/` | bunny builds; codex reviews; artu1 commits | the same |
| `run/out/<lane>.*` | the lane named in the file | never edited by anyone else |
| `run/comms/<from>-to-<to>.*` | the sender; the answer file belongs to the receiver | — |
| `docs/bench/ts-heldout.*`, `docs/bench/ts-freeze.md` | codex (held-out side), artu1 (freeze file) | — |
| money: any paid call | only artu1 approves; never delegated | — |

### Pane names (Sunny, 2026-11-14)
Display names only. Every file, brief, claim, report path, ruling and brain note keeps using the internal id.

| pane name | internal id |
|---|---|
| Holt | artu1 |
| Terry | bunny |
| Amy | codex |
| Rosa | grok |
| Jake | devin (joins when its quota resets; no lane yet) |
| Boyle | Planner A |
| Kevin | Planner B |

A planner writes documents and never executes; a worker writes only the paths its brief lists; nobody commits in another
lane's checkout; a file with no row belongs to artu1 until a row is added. Exceptions are one dated line here (who, which
file, which lines, until when). Never force-push or rewrite history.
Exceptions: (1) 2026-11-13, decision 076g item 4 (Sunny): an Anthropic provider in `packages/analyzer/src/llm`, selected by
config, never the default, mocked tests only, for report-only Claude rows on dev (Haiku 5.5, Sonnet 5.5; Sunny's own money);
never in `packages/action/`, `.github/actions/` or the held-out primary; until Sunny withdraws it. It overrides "Models and
keys" and the "Build and safety" review rule for that provider only.

## Process (decision 076c item 14; `docs/plan/team-process.md` §1)

1. **One brief, one session.** A brief's first line names its one recipient. Before starting, the recipient creates
   `run/out/<lane>.<task>.claim` (session name, UTC time); if it exists, stop and tell Sunny. A brief addressed to someone
   else is not acted on.
2. **Ownership:** the table above; other files point to it.
3. **Every ruling lists the files it changes** ("Touches:" in its decision entry, with owners). artu1 copies it to STATE's
   open tasks; a file leaves the list when its owner's commit is on main; then grok greps for the old wording.
4. **A GO names a commit:** the reviewer's first line is `GO <full sha>` or `NO-GO <full sha>`. A branch under review gets no
   new commit until the verdict; a commit after a GO voids it. Only that sha is merged. A spec written after its code says
   "as built at <sha>".
5. **Cite a symbol or a commit,** not a bare line: `file:line@<7-char sha>` or `file` + function name; STATE, LOG, budget
   and decisions are cited by section heading or decision number.
6. **A stuck lane has a deadline and a stand-in.** A brief lists under "Needs approval" every command class that can raise
   a prompt, and a "Report by" time. With no `.done` by then, artu1 reads the pane once (never a held-out pane), writes one
   line to Sunny, and reassigns: review codex → grok; methodology devin → grok, then Planner B; build bunny → codex;
   held-out operation codex → grok. A lane with no stand-in who may read held-out does not start a held-out task.
7. **Nothing longer than 90 minutes lives in a session:** cut into resumable pieces of ≤ 90 min, or start detached with its
   own log and `.done`. A clock (the hourly triggers) is owned by a detached scheduler, not an agent's turn.
8. **The orchestrator hands over in writing:** when artu1 will be away it writes `run/comms/orchestrator.handover.md` (who
   stands in, until when; may: send briefs, merge a sha codex gave GO on; may not: approve spend, change a ruling, touch
   held-out; what waits for artu1). The stand-in appends what it did. Spend approval never transfers.
9. **The firewall is in every instruction file** (Blindness below), and a tuning-side agent reads the header and runs the
   dry run of any script another lane wrote before its first real run.
10. **One brain review per day:** brain edits collect in the working tree and go to codex once a day, last in its queue,
    never ahead of a review that blocks a merge or a paid job.
Briefs use the template in `docs/plan/team-process.md` §2: `run/briefs/<lane>.<task>.md` → `run/out/<lane>.<task>.md` + `.done`.

## Blindness (non-negotiable)

- Cal.com is the benchmark's test set. Never open, fetch, print or summarise anything about the Cal.com pull requests, their golden comments, other tools' review comments on them, or per-comment score detail.
- Never open `~/Projects/tracehound-bench`, `~/Projects/tracehound-ops`, `~/Projects/TraceHound-eval`, `~/Projects/tracehound-heldout` or `~/Projects/Recall`.
- Never copy text from the benchmark dataset into code, tests or docs. Counts only.
- **Track B held-out (tracehound-testset):** artu1 and bunny (the tuning side) never open, list, grep or diff
  `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note; never run git on `heldout/repos/` (including
  as an alternate object store); never pass `--heldout-ok` or a held-out side flag; never `hc read` the pane of an agent
  doing held-out work. Numbers-only files in `run/out/` are their only held-out input. codex, grok (and devin) may read
  held-out; their held-out reports are counts only.
- **Git in tracehound-testset (076e addendum d):** every agent except codex runs git there only with explicit paths outside
  `heldout/` (`git status --short -- run/out/x.md`, `git add <paths>`); never a bare `git status`, `git add` or `git diff`,
  which print the names of untracked files under `heldout/`.
- **From the window's start (T0) until the firewall lifts** (076a: sheet hashed → unblind → score files hashed and
  committed → lift): artu1 and bunny make no `gh` or browser read of pulls, issues or notifications on the four forks
  (SunnyBagal/medusa, twenty, payload, bullmq) (076c item 12).

## Models and keys

- The product's model calls go to Nemotron on Nebius Token Factory (hackathon rule). Do not add calls to any other model provider in product code.
- Never print, log or commit `NEBIUS_API_KEY` or any other secret. Tests never hit the network.

## Gates

- Before any test, typecheck or build, this must print nothing:
  `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`
- Run gates in a plain shell, never through git hooks or `git rebase --exec`.
- `pnpm test` and `pnpm typecheck` must pass before you open a PR.
- Stage files by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`.

## Stack

- pnpm workspaces, Node >= 24, TypeScript run through Node's native type stripping: `.ts` import extensions, erasable-only syntax (no enums, no parameter properties, no namespaces).
- Ask the owner before adding a dependency.

## Reporting

End every task with: PR number and head sha, test and typecheck results with counts, files changed, and anything not done. No claims beyond what ran.

## Code Review Rules

Treat every rule below as P1 when it is broken.

### Blindness
- Any text that looks copied from benchmark golden comments or from another tool's review comments, in code, tests, fixtures or docs.
- Any code path that could read, fetch, clone, review or score Cal.com pull requests or data (for example a repo list or fetch script that does not refuse calcom/cal.com).
- Any reference to `~/Projects/tracehound-bench`, `tracehound-ops`, `TraceHound-eval`, `tracehound-heldout` or `Recall` paths from product code under `packages/action/`, `.github/actions/` or `docs/action/`.

### Lanes
- A change by a lane to a path the ownership table gives to another owner, without that owner's merge or a dated exception.
- A commit on a branch after its GO, merged without a new GO on the new sha.

### Benchmark integrity
- A change to a frozen prompt or to the judge `bench-judge-v1` (prompt text, model, temperature, matching rules) without a new decision entry in `docs/decisions.md`.
- In `docs/bench/*.md` and `docs/decisions.md`: a precision, recall or F value that does not follow from the counts in the same row (precision = TP/(TP+FP), recall = TP/(TP+FN), F = harmonic mean).
- A results claim that calls a difference of a few points on one run with n under 100 an improvement or a win without saying it is within noise.

### Build and safety
- A new dependency in any package.json.
- Product code that calls a model provider other than Nebius Token Factory.
- A secret (`NEBIUS_API_KEY`, `GITHUB_TOKEN` or any token) that can reach a log, an error message, a file or a commit.
- A test that can reach the network.
