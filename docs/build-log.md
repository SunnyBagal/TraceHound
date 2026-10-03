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
- `test/harness-recall-dev.test.ts`: the eight scripted validations as a Docker + network test (merged into `test/harness-recall.test.ts` in Phase 3).
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

## Phase 3 (decision 045): graph-on arm, agent-v5

Rules block and this log re-read at the start. CI for the Phase 2 commit `8d503e6`: **success**,
https://github.com/SunnyBagal/TraceHound/actions/runs/37119378598. CI runs only on pull requests
and pushes to `main`, so the one PR (#8, https://github.com/SunnyBagal/TraceHound/pull/8) was
opened as a **draft** now rather than in Phase 5, to get CI on every phase (contradiction 11
below). It is still the only PR and is not merged.

11. **(found in Phase 2) "CI green after every phase" vs "open one PR" in Phase 5.** The workflow
    has no branch-push trigger. Resolved by opening the single PR early as a draft.

**Done:**
- agent-v5 (`LOOP_VERSION`, `harness/prompts/agent-v5.md`; v4 kept as `AGENT_PROMPT_V4_FILE`):
  graph on → the context tool's text packet for the issue (lexical decider unless `--decider
  nemotron`) after the issue in the first user message, plus one more `GRAPH:` prompt line; graph
  tools unchanged. Graph off → neither.
- Run record `arm { arm, packetInjected, packetChars, packetTokensEstimated, graphToolCalls }`
  via `Agent.armReport()`; trace `packet {…}`; CLI `arm:` line.
- Tests (`test/harness-loop.test.ts`): the first message with and without the packet (the packet
  equals `formatContext(buildContext(…))`), arm fields, graph tool calls counted, the packet
  counting against the token budget, no arm for scripted agents; prompt tests updated for v5;
  graph-on fakes now use the real Recall snapshot (`eval/snapshots/57d920e…`).
- Baseline + two tuning rounds (below), decision 045.

**Runs.** Nano, reasoning on, temperature 0, `--decider lexical`, task limits (40 steps, 300,000
tokens, 900 s, $0.10). Both arms of a task ran at the same time; tasks one after another. Records
in `runs/phase3-{baseline,round1,round2}/` (not committed).

### Baseline (prompt `d1d07e8f…`)

| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | UNRESOLVED | 33 | 306631 | $0.02066 | 166 s | 3 | 0 |
| recall-dev-chat-recent | graph-off | 1 | UNRESOLVED | 40 | 289538 | $0.02100 | 218 s | 3 | 0 |
| recall-dev-search-description | graph-on | 1 | RESOLVED | 20 | 177709 | $0.01235 | 177 s | 4 | 0 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | 30 | 304881 | $0.02496 | 352 s | 3 | 0 |
| recall-dev-session-expiry | graph-on | 1 | UNRESOLVED | 27 | 231029 | $0.01518 | 142 s | 2 | 0 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | 21 | 82433 | $0.00594 | 118 s | 3 | 0 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | 29 | 301590 | $0.02226 | 283 s | 3 | 0 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | 31 | 300466 | $0.02311 | 314 s | 4 | 0 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 1 of 4 | 3 of 4 | 0 of 4 | 109 (27.3; n = 4) | 1016959 (254240; n = 4) | $0.07045 ($0.01761; n = 4) | 767 s (192 s; n = 4) | 12 (3.0; n = 4) | 0 (n = 4) |
| graph-off | 4 | 1 of 4 | 3 of 4 | 0 of 4 | 122 (30.5; n = 4) | 977318 (244330; n = 4) | $0.07500 ($0.01875; n = 4) | 1002 s (250 s; n = 4) | 13 (3.3; n = 4) | 0 (n = 4) |

### Round 1 — change: one rule (both arms)

> - Your token limit usually runs out before your step limit: every call resends the whole
>   conversation so far, so a long output costs you again on every later call. Search for specific
>   names or strings in the narrowest directory that fits, read files in line ranges
>   (startLine/endLine) around what the search found, and do not re-read lines you have already seen.

Why: 5 of 8 baseline runs ended on the token budget at about 30 turns. Prompt `556861d4…`.
Before (baseline) → after: graph-on 1 → 2 of 4 resolved, graph-off 1 → 3 of 4.

| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | RESOLVED | 21 | 158603 | $0.01085 | 140 s | 2 | 0 |
| recall-dev-chat-recent | graph-off | 1 | RESOLVED | 25 | 107259 | $0.00761 | 137 s | 1 | 0 |
| recall-dev-search-description | graph-on | 1 | UNRESOLVED | 29 | 305616 | $0.02524 | 444 s | 3 | 0 |
| recall-dev-search-description | graph-off | 1 | RESOLVED | 26 | 229102 | $0.01592 | 216 s | 4 | 0 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | 30 | 230149 | $0.01489 | 172 s | 2 | 0 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | 23 | 103436 | $0.00701 | 144 s | 2 | 0 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | 27 | 309351 | $0.02281 | 285 s | 4 | 0 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | 40 | 295163 | $0.02103 | 263 s | 1 | 0 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 107 (26.8; n = 4) | 1003719 (250930; n = 4) | $0.07378 ($0.01845; n = 4) | 1041 s (260 s; n = 4) | 11 (2.8; n = 4) | 0 (n = 4) |
| graph-off | 4 | 3 of 4 | 1 of 4 | 0 of 4 | 114 (28.5; n = 4) | 734960 (183740; n = 4) | $0.05157 ($0.01289; n = 4) | 759 s (190 s; n = 4) | 8 (2.0; n = 4) | 0 (n = 4) |

### Round 2 — change: one more rule (both arms)

> - Every reply must call a tool. Think briefly (a few sentences), then make the call: a reply
>   without a tool call still costs a step, and long reasoning uses up your tokens.

Why: round 1 had 20 replies without a tool call, 6 of them at the 4,096-token output cap.
Prompt `644e6477…`. Before (round 1) → after: graph-on 2 → 2 of 4, graph-off 3 → 1 of 4.

| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | RESOLVED | 22 | 135823 | $0.00950 | 151 s | 1 | 0 |
| recall-dev-chat-recent | graph-off | 1 | UNRESOLVED | 40 | 268645 | $0.02246 | 331 s | 2 | 0 |
| recall-dev-search-description | graph-on | 1 | UNRESOLVED | 25 | 305730 | $0.02454 | 328 s | 6 | 0 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | 28 | 308140 | $0.02814 | 431 s | 6 | 0 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | 29 | 240367 | $0.01586 | 187 s | 2 | 0 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | 18 | 91791 | $0.00639 | 149 s | 2 | 0 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | 29 | 309192 | $0.02363 | 281 s | 3 | 0 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | 34 | 302689 | $0.02541 | 380 s | 4 | 0 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 105 (26.3; n = 4) | 991112 (247778; n = 4) | $0.07353 ($0.01838; n = 4) | 948 s (237 s; n = 4) | 12 (3.0; n = 4) | 0 (n = 4) |
| graph-off | 4 | 1 of 4 | 3 of 4 | 0 of 4 | 120 (30.0; n = 4) | 971265 (242816; n = 4) | $0.08240 ($0.02060; n = 4) | 1291 s (323 s; n = 4) | 14 (3.5; n = 4) | 0 (n = 4) |

Waste counted over each round's 8 runs:

| Round | Replies without a tool call | … of them at the output cap | Unknown-tool calls (`str_replace_editor`) |
|---|---|---|---|
| baseline | 17 | 7 | 18 |
| 1 | 20 | 6 | 12 |
| 2 | 38 | 17 | 9 |

**Stopped after two rounds.** Round 2's change increased the behaviour it targeted, so **the
frozen prompt is round 1's** (`556861d4…`, the exact file the round-1 runs used); round 2's line
was removed and nothing else changed. This is a judgment call between two tested states, recorded
in decision 045; it can be reversed by restoring that one line. **Graph tool calls were 0 in all
12 graph-on runs.** One run per cell: none of these differences is evidence for or against the
graph.

**Gates.** GIT_* env check printed nothing before each.
- First run: version guard exit 0; tests **exit 1**: 2 of 330 analyzer tests failed, both in the
  scripted Recall Docker tests, whose code Phase 3 does not touch:
  `harness-recall-dev` "recall-dev-session-expiry: oracle fix → RESOLVED" (UNRESOLVED, repro
  exit 1 after the correct patch) and `harness-recall` test 6 (five `worker.test.ts` tests
  "missing" after the patch, beside the two expected). The viewer suite did not run (pnpm stops
  at the first failing package); typecheck exit 0; viewer build exit 0.
- Diagnosis: the two Recall files ran sandboxes at the same time as the other Docker files
  (Docker VM 10 CPUs, 8 GB; 2 GB per sandbox). Unloaded, the repro takes ~3.5 s and Recall's suite
  ~10 s; bun's default timeout is 5 s, which Recall's PGlite setup can exceed when starved. Both
  had passed in the Phase 2 gate.
- **Fix (the one attempt):** the dev-task tests moved into `test/harness-recall.test.ts` (one
  file runs its tests one after another), `test/harness-recall-dev.test.ts` removed.
- Second run: version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1 pnpm test` exit 0, analyzer 330
  passed (28 files), viewer 88 passed (11 files), 856 s; typecheck exit 0; viewer build exit 0.
- Loss recorded: the per-test gate gave a false UNRESOLVED under load (decision 045, finding).
  Evaluation runs use concurrency 1.

**Spend:** baseline +$0.14545, round 1 +$0.12536, round 2 +$0.15592: Phase 3 total **$0.42673**;
ledger $0.34212 → $0.76885 (this prompt so far: $0.42673 of $1.50).
