# Build log: build-to-freeze

Prompt: `docs/prompts/build-to-freeze.md` (saved verbatim, commit `74ae540`). Branch
`build/to-freeze` off `origin/main` @ `e9fa408`. Started 2026-10-03.

Ledger at the start (`pnpm spend`): **$0.34212**. This prompt may add at most $1.50 (cap: $1.84212).

## Step 0: contradictions with the prompt

Read: CLAUDE.md, decisions 034, 037, 041, 042, 043, `src/harness/*` (run, loop, tools, agents,
task, profile, cli, docker), `src/agent/*` (context, cli, query), `harness/prompts/agent-v4.md`,
the Recall smoke tasks, `.github/workflows/ci.yml`.

None of these blocks a phase. Each is resolved as stated:

1. **Task kind "dev" does not exist.** `TaskSpec.kind` is `"smoke" | "evaluation"` (decision 041).
   Phase 2 adds `"dev"` (harness code, may-touch). Dev runs are never evaluation results.
2. **CLAUDE.md says the user writes the dev tasks, on CEX** ("Dev tasks pending: the user writes
   the CEX tasks (`eval/tasks/dev-01`, `dev-02`) … validation and the 12 dev runs wait for them").
   The prompt has four seeded Recall dev tasks written here. The prompt is followed; the ids are
   `recall-dev-*` so `dev-01` / `dev-02` stay free. CLAUDE.md is updated at the freeze.
3. **"Model: Nano, agent-v4 defaults" vs "agent-v5" (Phase 3).** Read as: agent-v5 keeps every
   agent-v4 setting (Nano, reasoning on, temperature 0, guards, nudge, cap, /scratch, budgets) and
   adds only the graph-on packet injection, the record fields, and whatever the two tuning rounds
   change in the prompt.
4. **Decisions 030 / 034: "every change applies identically with and without the graph."** The
   packet injection is a difference between the arms by design (it is the arm). Prompt tuning
   (Phase 3, item 10) changes only lines both arms get; `GRAPH:` lines are not tuned.
5. **The phases are numbered 2–5 and the items 6–13; there is no Phase 1.** Step 0 counts as the
   first phase. It has two commits: the prompt (which it says to commit first) and this log.
6. **CLAUDE.md conventions say "small, meaningful commits pushed to `main`".** This run uses one
   branch, one commit per phase, and one PR that is not merged, as the prompt says.
7. **The runner's entry point.** The may-touch list has no analyzer CLI dispatcher (`src/bin.ts`)
   and no root `package.json`. The runner is therefore its own entry point under the harness code
   (`node packages/analyzer/src/harness/evaluate.ts …`), not `pnpm tracehound evaluate`.
8. **Which decider builds the injected packet.** "The existing context tool" defaults to the
   lexical decider (`tracehound context`, `--decider lexical`); decider-v1 (nemotron) is frozen
   and costs a model call. The injected packet uses the run's `--decider`, default lexical, so it
   is deterministic and costs nothing.
9. **Spend caps.** The shared client's per-process cap (`TRACEHOUND_BUDGET_RUN_USD` = 1) applies
   to a whole runner process, and each task has `limits.costUSD` 0.1. The prompt's $1.50 is read
   from the ledger before every model-spending step.
10. **CI already runs the Docker + network files** (`TRACEHOUND_NETWORK_TESTS=1`). The dev tasks'
    scripted validation becomes a Docker test file too, which adds several minutes to CI.

Spend in step 0: $0 (ledger $0.34212).

## Phase 2 (decision 044): four seeded dev tasks on Recall

Rules block and this log re-read at the start.

**Done:**
- `TaskSpec.kind` gains `"dev"` (`src/harness/task.ts`, `taskKind` in `src/harness/run.ts`).
- Four tasks under `eval/tasks/`, each with `task.json` (kind `dev`, profile, snapshot, seed),
  `seed.patch` (one line), `repro.test.ts`, `fix.patch` and a README:
  `recall-dev-short-summary` (`worker.ts`, symptom in the API, crosses the queue),
  `recall-dev-search-description` (`db/schema.ts`, symptom in the API, fault in shared),
  `recall-dev-session-expiry` (`middleware/middleware.ts`), `recall-dev-chat-recent` (`index.ts`).
  Seeds were made on a scratch clone of Recall at `57d920e` (outside this repo, never pushed).
- `test/harness-recall-dev.test.ts`: the eight scripted validations as a Docker + network test.
- Decision 044.

**Validation** (CLI, scripted, no model; records in `runs/dev-validation/`, not committed):

| Task | oracle + fix.patch | noop |
|---|---|---|
| recall-dev-short-summary | RESOLVED (granularity test, 62/62, tsc 5 → 5) | UNRESOLVED, repro still fails (exit 1) |
| recall-dev-search-description | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |
| recall-dev-session-expiry | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |
| recall-dev-chat-recent | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |

No task was replaced.

**Gates** (plain shell; GIT_* env check printed nothing): version guard exit 0;
`TRACEHOUND_NETWORK_TESTS=1 pnpm test` exit 0, analyzer 326 passed (29 files, none skipped),
viewer 88 passed (11 files), 515 s; `pnpm typecheck` exit 0; viewer build exit 0. CI: see the
next phase's entry.

**Spend:** $0 (ledger $0.34212).
