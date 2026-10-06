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

## Phase 4 (decision 046): evaluation runner

Rules block and this log re-read at the start. CI for the Phase 3 commit `5f0f38a`: **success**,
https://github.com/SunnyBagal/TraceHound/actions/runs/37124103798.

**Done:**
- `packages/analyzer/src/harness/evaluate.ts`: `node packages/analyzer/src/harness/evaluate.ts
  --tasks <dir> [--arms on,off] [--repeats N] [--kind k] [--out dir] [--concurrency 1]
  [--max-spend-usd x]`. One `tracehound repair` process per (task, arm, repeat); writes
  `results.json`, `results.md` and the run records; spend stop; n beside every total; no
  significance claims.
- `test/harness-evaluate.test.ts` (7 tests, fake executor).
- Decision 046.

**Test on the dev tasks, repeats 1** (`--tasks eval/tasks --kind dev --arms on,off --repeats 1
--concurrency 1 --max-spend-usd 0.5`), exit 0, all 8 runs on the frozen prompt `556861d4…`.
Copied to `docs/eval/dev-runner-2026-10-03/` (the run records stay in `runs/phase4-runner/`, not
committed). The runner's output:

| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | RESOLVED | 31 | 255518 | $0.01738 | 226 s | 1 | 0 |
| recall-dev-chat-recent | graph-off | 1 | UNRESOLVED | 40 | 280433 | $0.01952 | 265 s | 4 | 0 |
| recall-dev-search-description | graph-on | 1 | UNRESOLVED | 28 | 311297 | $0.02266 | 304 s | 4 | 0 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | 40 | 284574 | $0.02634 | 583 s | 2 | 0 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | 24 | 153318 | $0.00999 | 145 s | 3 | 0 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | 25 | 109653 | $0.00748 | 171 s | 2 | 0 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | 28 | 313254 | $0.02337 | 380 s | 2 | 0 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | 32 | 306398 | $0.02159 | 298 s | 3 | 0 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 111 (27.8; n = 4) | 1033387 (258347; n = 4) | $0.07340 ($0.01835; n = 4) | 1055 s (264 s; n = 4) | 10 (2.5; n = 4) | 0 (n = 4) |
| graph-off | 4 | 1 of 4 | 3 of 4 | 0 of 4 | 137 (34.3; n = 4) | 981058 (245265; n = 4) | $0.07493 ($0.01873; n = 4) | 1317 s (329 s; n = 4) | 11 (2.8; n = 4) | 0 (n = 4) |

Counts and sums over the runs above, with the sample size beside each. No significance test was run and none is implied.

These are dev runs with the frozen settings, one per cell: not evaluation results, and no
statement about the graph follows from them. Graph tool calls were 0 again in all four graph-on
runs.

**Gates** (GIT_* env check printed nothing): version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1
pnpm test` exit 0, analyzer 337 passed (29 files), viewer 88 passed (11 files), 807 s;
`pnpm typecheck` exit 0; viewer build exit 0. CI: see the next phase's entry.

**Spend:** +$0.14833 (the runner's 8 runs); ledger $0.76885 → $0.91718 (this prompt so far:
$0.57506 of $1.50).

## Phase 5: freeze

Rules block and this log re-read at the start. CI for the Phase 4 commit `58efbc1`: **success**,
https://github.com/SunnyBagal/TraceHound/actions/runs/37127176921.

**Done:**
- `docs/freeze.md`: analyzer 0.10.0 and the graph snapshot's sha256; agent-v5; the sha256 of every
  prompt file (the frozen one: `agent-v5.md` `556861d4…`); image
  `tracehound-sandbox:bun1.4.2-ts5.9.3-2` with its id and Dockerfile hash; Nano
  (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`), reasoning on, temperature 0, `max_tokens` 4096; the
  per-test gate on Recall (granularity `test`, 62 tests) and the baseline-matched typecheck gate.
- CLAUDE.md (dev tasks, agent-v5, runner, freeze, spend) and `docs/backlog.md` (findings left for
  after the evaluation).
- The commit is tagged `eval-freeze` once its CI is green; PR #8 is marked ready for review and
  not merged.

**Gates** (GIT_* env check printed nothing): version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1
pnpm test` exit 0, analyzer 337 passed (29 files), viewer 88 passed (11 files), 868 s;
`pnpm typecheck` exit 0; viewer build exit 0. This commit's CI run is on PR #8.

**Spend:** $0. **Total for this prompt: $0.57506** (ledger $0.34212 → $0.91718), Nano only;
cap $1.50.

**Not done:**
- README.md still says agent-v4: it is outside the paths this prompt may touch (backlog).
- No evaluation task was created, read or looked for; dev results are not evaluation results.
- The graph's effect is untested: one run per cell, and the agent made no graph tool calls.

---

# Build log: agent-v6

Prompt: `docs/prompts/agent-v6.md` (saved verbatim, commit `5e60e05`). Branch `build/agent-v6` off
`origin/main` @ `ee23827`. Started 2026-10-03. Decision 047.

Ledger at the start (`pnpm spend`): **$0.91718**. This prompt may add at most $3.00 (cap: $3.91718).

## Step 0: contradictions with the prompt

Read: CLAUDE.md, decisions 043–046, `docs/freeze.md`, this log (build-to-freeze), `src/harness/loop.ts`,
`tools.ts`, `agents.ts`, `run.ts` (record fields), `cli.ts`, `evaluate.ts`, `harness/prompts/agent-v5.md`,
`test/harness-loop.test.ts`, `config/prices.json`.

None blocks a phase. Each is resolved as stated:

1. **Step 3's retry already exists, in a broader form.** agent-v2's edit fallback (decision 030)
   already retries an unmatched `oldText` with indentation *and* trailing whitespace ignored per
   line (`trim()` also drops `\r`), applies it only on exactly one match, and otherwise returns the
   closest region with line numbers, at most 40 lines. Resolution: add the narrower retry the prompt
   describes (trailing whitespace and line endings only) **before** the existing fallback, keep the
   existing fallback (removing it would change the agent beyond "edit mechanics", and it applied in
   13 of the 32 runs), and make the closest-region error complete: also on the ambiguous
   normalized match, never omitted for a non-empty file, and its line range equal to the lines shown.
2. **The measured failures are not whitespace failures** (Phase 1 below): in all 12 "oldText not
   found" errors the existing fallback, which ignores more whitespace than step 3's retry, found no
   match. The model's `oldText` differed in characters (dropped `)` in a long SQL line, a missing
   leading `.`), by a whole whitespace-only line it left out or added, or quoted lines its own
   earlier edit had already changed. Step 3 is built as written;
   it is not expected to turn those 12 into successes (checked by replay in Phase 2).
3. **"All 19 unresolved runs … with failed edits and calls to str_replace_editor."** In the records:
   8 of the 19 had a failed edit; 7 of the 19 made no edit call at all; 1 (round 2,
   search-description, graph on) had neither a failed edit nor an unknown-tool call. 18 of 19 made at
   least one `str_replace_editor` call. Of the 53 `str_replace_editor` calls, 47 were reads
   (`view` / `read` / a bare `path`), 2 directory listings, 1 an edit and 3 had no arguments.
4. **CLAUDE.md: "Super/Ultra only via explicit `--model`, reserved for the final evaluation"** vs the
   Super probe on dev tasks (step 7). The prompt is the owner's explicit instruction; it is followed.
   The Super id named in the repo is `nvidia/nemotron-3-super-120b-a12b` (`config/prices.json`, a
   real third-party rate, $0.30 / $0.90 per 1M input / output). `tracehound repair` has no `--model`
   flag, so one is added to `src/harness/cli.ts` and passed through by the runner. `cli.ts` is read as
   run-record code (it runs one repair and writes its record; the runner spawns it).
5. **Super and the task cost limit.** At Super's rates a run that reaches the 300,000-token limit
   costs about $0.09–0.12, so the tasks' `limits.costUSD` 0.10 may end a Super run before the token
   limit. "Same budgets" is followed: task limits are not changed, and a cost-limit end is recorded
   as such.
6. **CI runs only on pull requests and pushes to `main`** (build-to-freeze contradiction 11). "CI
   green after every phase" needs a PR from the first push, so the one PR is opened as a draft after
   the Phase 1 push and marked ready in Phase 5. Not merged.
7. **Step 0 is not a phase.** The prompt commit is its own (as the prompt says); this step's log
   goes into the Phase 1 commit.
8. **"Read" and "step" in Phase 3** are defined as: a successful `read_file` call (including a
   `str_replace_editor` call that ran as `read_file`) whose path, normalized to the repo root, is a
   file in the seed patch; `search` hits and `run cat …` are not reads. Steps are counted as the
   harness counts them (each executed tool call is one step, a reply without a tool call is one
   step). Tokens are input + output of every model call up to and including the call that made the
   read.
9. **Agent label vs prompt file name.** `LOOP_VERSION` becomes `agent-v6`; the prompt file stays
   `harness/prompts/agent-v5.md`, byte-identical, so records carry `loopVersion: agent-v6` with
   `promptFile: agent-v5.md`.
10. **Unknown tools.** The existing unknown-tool error is already one line listing the valid
    names; it is kept. A `str_replace_editor` call whose argument shape was not seen in Phase 1
    (including the empty `{}` that was seen, which names no file) gets that same line.

Spend in step 0: $0 (ledger $0.91718).

## Phase 1: measure (no code change)

Rules block re-read at the start. Source: the 32 dev run records (`runs/phase3-baseline`,
`phase3-round1`, `phase3-round2`, `phase4-runner/runs`; not committed), all `agent-v5`; prompt
`d1d07e8f…` (baseline), `556861d4…` (round 1 and runner, the frozen prompt), `644e6477…` (round 2).
"Failed" = an `edit_file` / `write_file` result with `ok: false`; "whitespace fallback" = an edit
applied by the existing indentation-ignoring fallback.

| Set | Task | Arm | State | End | Steps | Edit/write calls | Failed, by error | Whitespace fallback applied | Unknown-tool calls |
|---|---|---|---|---|---|---|---|---|---|
| baseline | chat-recent | off | UNRESOLVED | budget steps 40 | 40 | 0 | 0 | 0 | str_replace_editor 3 |
| baseline | chat-recent | on | UNRESOLVED | budget tokens 300000 | 33 | 0 | 0 | 0 | str_replace_editor 3 |
| baseline | search-description | off | UNRESOLVED | budget tokens 300000 | 30 | 1 | oldText not found 1 | 0 | str_replace_editor 2 |
| baseline | search-description | on | RESOLVED | finish | 20 | 1 | 0 | 0 | str_replace_editor 1 |
| baseline | session-expiry | off | RESOLVED | finish | 21 | 1 | 0 | 0 | str_replace_editor 2 |
| baseline | session-expiry | on | UNRESOLVED | stopped stuck | 27 | 1 | 0 | 1 | str_replace_editor 2 |
| baseline | short-summary | off | UNRESOLVED | budget tokens 300000 | 31 | 0 | 0 | 0 | str_replace_editor 3 |
| baseline | short-summary | on | UNRESOLVED | budget tokens 300000 | 29 | 2 | oldText not found 1 | 1 | str_replace_editor 2 |
| round1 | chat-recent | off | RESOLVED | finish | 25 | 2 | ambiguous (exact) 1 | 1 | 0 |
| round1 | chat-recent | on | RESOLVED | finish | 21 | 1 | 0 | 0 | str_replace_editor 1 |
| round1 | search-description | off | RESOLVED | finish | 26 | 1 | 0 | 0 | str_replace_editor 2 |
| round1 | search-description | on | UNRESOLVED | budget tokens 300000 | 29 | 2 | oldText not found 2 | 0 | str_replace_editor 1 |
| round1 | session-expiry | on | RESOLVED | finish | 30 | 1 | 0 | 0 | str_replace_editor 3 |
| round1 | session-expiry | off | RESOLVED | finish | 23 | 1 | 0 | 1 | str_replace_editor 2 |
| round1 | short-summary | on | UNRESOLVED | budget tokens 300000 | 27 | 1 | oldText not found 1 | 0 | str_replace_editor 2 |
| round1 | short-summary | off | UNRESOLVED | budget steps 40 | 40 | 3 | oldText not found 2 | 1 | str_replace_editor 1 |
| round2 | chat-recent | off | UNRESOLVED | budget steps 40 | 40 | 2 | oldText not found 1 | 0 | 0 |
| round2 | chat-recent | on | RESOLVED | finish | 22 | 1 | 0 | 1 | str_replace_editor 1 |
| round2 | search-description | on | UNRESOLVED | budget tokens 300000 | 25 | 0 | 0 | 0 | 0 |
| round2 | search-description | off | UNRESOLVED | budget tokens 300000 | 28 | 0 | 0 | 0 | str_replace_editor 1 |
| round2 | session-expiry | on | RESOLVED | finish | 29 | 3 | invalid arguments 1 | 1 | str_replace_editor 1 |
| round2 | session-expiry | off | RESOLVED | finish | 18 | 1 | 0 | 0 | str_replace_editor 1 |
| round2 | short-summary | off | UNRESOLVED | budget tokens 300000 | 34 | 1 | 0 | 1 | str_replace_editor 1 |
| round2 | short-summary | on | UNRESOLVED | budget tokens 300000 | 29 | 1 | oldText not found 1 | 0 | str_replace_editor 4 |
| runner | chat-recent | on | RESOLVED | finish | 31 | 1 | 0 | 1 | 0 |
| runner | chat-recent | off | UNRESOLVED | budget steps 40 | 40 | 0 | 0 | 0 | str_replace_editor 1 |
| runner | search-description | on | UNRESOLVED | budget tokens 300000 | 28 | 1 | 0 | 0 | str_replace_editor 6 |
| runner | search-description | off | UNRESOLVED | budget steps 40 | 40 | 3 | oldText not found 3 | 0 | 0 |
| runner | session-expiry | on | RESOLVED | finish | 24 | 1 | 0 | 1 | str_replace_editor 2 |
| runner | session-expiry | off | RESOLVED | finish | 25 | 2 | 0 | 1 | str_replace_editor 1 |
| runner | short-summary | on | UNRESOLVED | budget tokens 300000 | 28 | 1 | 0 | 1 | str_replace_editor 2 |
| runner | short-summary | off | UNRESOLVED | budget tokens 300000 | 32 | 0 | 0 | 0 | str_replace_editor 2 |

**Totals over 32 runs.** Ends: 13 `finish` (all 13 RESOLVED), 13 token budget, 5 step budget,
1 stuck (all 19 UNRESOLVED). Failed edit calls: 14, of them "oldText not found" (even ignoring
indentation and trailing spaces) 12, exact match more than once 1, invalid arguments 1. Unknown-tool
calls: 53, all `str_replace_editor` (no other unknown name occurred).

**Why the 12 "oldText not found" edits failed.** Replayed on a scratch clone of Recall at `57d920e`
with the four seeds applied (outside this repo, never pushed), applying each run's successful edits
in order with the agent-v5 edit logic; the replay reproduces every recorded edit outcome (12 not
found, 1 exact ×3, 19 applied). Causes:
- 6 (`db/schema.ts`): characters dropped in the long SQL line (`coalesce(title, '')` written as
  `coalesce(title, ''`);
- 3 (`worker.ts`): a whitespace-only line left out of, or added to, an otherwise exact block;
- 2 (`worker.ts`, round 1 short-summary graph off): `oldText` of lines the run's own earlier edit
  had already changed;
- 1 (`index.ts`): started at `orderBy(` without its leading `.`, the next line without its
  indentation.

None is a trailing-whitespace or line-ending difference.

**`str_replace_editor` argument shapes** (53 calls):

| Shape (keys; `command`) | Calls | Example | Maps to |
|---|---|---|---|
| `{command, path}`; `view` | 37 | `{"command": "view", "path": "/work/recall-backend/services/searchService.ts"}` | `read_file {path}` |
| `{command, path, startLine, endLine}`; `view` (line numbers as strings) | 4 | `{"command": "view", "path": "/work/recall-backend/index.ts", "startLine": "430", "endLine": "460"}` | `read_file {path, startLine, endLine}` |
| `{command, path}`; `read` | 2 | `{"command": "read", "path": "/work/recall-backend/middleware/middleware.ts"}` | `read_file {path}` |
| `{command, path, startLine, endLine}`; `read` (strings) | 1 | `{"path": "/work/recall-backend/test/content.test.ts", "command": "read", "startLine": "38", "endLine": "50"}` | `read_file {path, startLine, endLine}` |
| `{path}`, no command | 2 | `{"path": "recall-backend/middleware/middleware.ts"}` | `read_file {path}` |
| `{path, view_range}`, no command (`view_range` a string) | 1 | `{"path": "recall-backend/index.ts", "view_range": "[75, 90]"}` | `read_file {path, startLine, endLine}` |
| `{command, path}`; `list` | 2 | `{"command": "list", "path": "/work/recall-backend/middleware"}` | `list_dir {path}` |
| `{command, path, oldText, newText}`; `edit_file` | 1 | `{"path": "/work/recall-backend/drizzle/0002_fts_search_vector.sql", "oldText": "…", "newText": "…", "command": "edit_file"}` | `edit_file {path, oldText, newText}` |
| `{}` | 3 | `{}` | none (names no file): the unknown-tool line |

Analysis script: kept outside the repo (session scratchpad); the numbers above are its output.

**Gates** (GIT_* env check printed nothing):
- First run: version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1 pnpm test` **exit 1**, 2 of 337
  analyzer tests failed, both by the 300 s test timeout in `test/harness-recall.test.ts` (dev tasks:
  session-expiry empty patch, 642 s; chat-recent oracle fix, 914 s). The file took 2,256 s against
  about 600 s in the build-to-freeze gates; this phase changed no code. `pnpm typecheck` exit 0;
  viewer build exit 0.
- Diagnosis: the same test alone passed in 54 s right after; GitHub and the npm registry answered
  in under 1 s. Transient slowness of the host or network during setup, not a code fault.
- **Fix (the one attempt):** the test suite re-run unchanged: exit 0, analyzer 337 passed
  (29 files), viewer 88 passed (11 files), 839 s. Recorded as a loss: one gate run was red.
- Pushed; draft PR #9 opened (https://github.com/SunnyBagal/TraceHound/pull/9) so CI runs on
  every phase (step 0, item 6).

**Spend:** $0 (ledger $0.91718).

## Phase 2 (decision 047): edit tool

Rules block re-read at the start. CI for the Phase 1 commit `2b88f9e`: see the next phase's entry.

**Done** (both arms identically; prompt file unchanged):
- `str_replace_editor` alias (`aliasCall`, `ALIASED_TOOL`, `src/harness/loop.ts`) for the eight
  shapes seen in Phase 1 (table in decision 047), not in the tool schemas. An aliased call runs
  down the real tool's path (argument check, repeat guard, one step); the record keeps the model's
  name plus `ranAs`; `guards.aliasCalls`. Unmapped shapes and other unknown names get the existing
  one-line unknown-tool error.
- `edit_file` (`applyEdit` in the sandbox helper's JS, `src/harness/tools.ts`): exact → **new retry
  with trailing whitespace and line endings ignored, applied only at exactly one location** (CRLF
  kept for `newText` in CRLF files; `guards.editLineEndRetries`) → the agent-v2 indentation fallback
  (unchanged) → an error. Every error after the exact step ends with the closest region of the
  current text, with line numbers, at most 40 lines (now also on ambiguous matches and at
  similarity 0; its line range is the lines shown). The not-found message now says "even ignoring
  indentation, trailing whitespace and line endings" and "Closest region of the file as it is now".
- `LOOP_VERSION` = `agent-v6`. **Prompt file `harness/prompts/agent-v5.md` byte-identical:
  sha256 `556861d40ba86940a72c05d15b08cf07eea15a6d8a5508c6c7d3d352b92222b6`** (checked with
  `shasum -a 256`, by a unit test, and `git diff origin/main -- harness/prompts` is empty).
- Tests (`test/harness-loop.test.ts`): the prompt hash and label; every seen shape mapped, 14
  unseen shapes and names not mapped; an aliased call in a run, both arms (one step, shared repeat
  guard, `ranAs`, never in a request's tools, bad line numbers rejected by `read_file`'s own check,
  `{}` / `create` / an unknown name → the one-line error); `applyEdit`: exact unchanged, trailing
  whitespace in file or `oldText`, CRLF file with LF `oldText` and the reverse, two locations →
  error with lines and region, indentation still handled by the old fallback, not found → region
  of 40 lines with line numbers, similarity 0 → region still shown, and the two Phase 1 failure
  kinds (a dropped character, a missing whitespace-only line) still fail. The Docker test now also
  edits a CRLF file with LF `oldText` and reads it back through the alias.
- Decision 047.

**Replay** (scratch clone of Recall `57d920e` + the four seeds, outside this repo; every `edit_file`
call of the 32 runs, each run's successful edits applied in order), agent-v6 code as committed:

| Recorded outcome | agent-v5 logic | agent-v6 logic |
|---|---|---|
| applied (19) | exact 7, whitespace fallback 12 | exact 7, whitespace fallback 12 |
| failed: not found (12) | not found 12 | **not found 12** |
| failed: exact ×3 (1) | exact ×3 | exact ×3 |
| failed: run ended by the step budget before it ran (1) | whitespace fallback | whitespace fallback |

The new retry changes none of the recorded edit outcomes. Only the alias changes what the 32 runs
would have got (50 of 53 calls run as real tools).

**Gates** (GIT_* env check printed nothing):
- First run: version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1 pnpm test` **exit 1**, 2 of 350
  analyzer tests failed: `changes.test.ts` "a cross-component signature change lists the callers"
  (vitest's 5 s timeout) and `harness-recall.test.ts` test 1 (Recall's own `bun test` exited 1 **at
  baseline**, before any patch). Typecheck exit 0; viewer build exit 0.
- Diagnosis: both are load failures, in code this phase didn't touch. **My error:** while this gate
  ran I ran the Phase 3 unit tests in a second worktree on the same machine, the load decision 045
  warns about.
- **Fix (the one attempt):** the gate re-run with nothing else running: version guard exit 0;
  tests exit 0, analyzer 350 passed (29 files), viewer 88 passed (11 files), 802 s; typecheck exit
  0; viewer build exit 0. From here on nothing else runs during a gate.

**Spend:** $0 (ledger $0.91718).

## Phase 3: time to fault file

Rules block re-read at the start. CI for the Phase 1 commit `2b88f9e`: **success**,
https://github.com/SunnyBagal/TraceHound/actions/runs/37133622382. CI for Phase 2 (`01dc0f8`): see
the next phase's entry.

**Done:**
- `src/harness/run-metrics.ts`: `patchFiles` (the files a seed patch touches, from its
  `diff --git` headers), `faultFileRead` (walks the trace the way the harness counts steps: a reply
  without a tool call is one step, every executed call is one step, a call after `finish` in the
  same turn is none; a read is a successful `read_file` or a call run as one), `runMetrics` (end
  reason, failed edits, unknown-tool calls, aliased calls).
- Run record `faultFileRead { files, read: { step, turn, tokens, file } | null }`, computed on the
  host in `runRepair` after the agent stops, for seeded tasks and model agents only (`src/harness/run.ts`,
  not part of the verdict). The repair CLI prints a `fault file:` line.
- The runner's rows and `results.md` gain End, Failed edits, Unknown-tool calls and "Fault file
  first read: step (tokens)"; per arm: failed edits, unknown-tool calls, and "k of n (mean step)".
- `tracehound repair --model <id>` and the runner's `--model` (step 0, item 4); the runner records
  the model in `results.json`.
- Tests: `test/harness-metrics.test.ts` (patch files incl. the four dev seeds, path forms, step
  counting with a reply without a call, a failed read, a search hit, an aliased read, a call after
  `finish`; never read → null; the counts), `test/harness-loop.test.ts` (the field end to end
  through `runRepair` with a seeded fake task; no field without a seed or for a scripted agent),
  `test/harness-evaluate.test.ts` (rows, totals and the table's new columns).
- Check of the step walk: on all 32 existing agent-v5 records it ends at exactly the harness's
  recorded step count.

**The 16 frozen-prompt agent-v5 runs** (round 1 and the runner test, prompt `556861d4…`),
computed with the same code from the records and each task's `seed.patch`:

| Set | Task | Arm | State | End | Steps | Failed edits | Unknown-tool calls | First fault-file read: step | Tokens up to it | File |
|---|---|---|---|---|---|---|---|---|---|---|
| round1 | chat-recent | off | RESOLVED | finish | 25 | 1 | 0 | 12 | 30750 | recall-backend/index.ts |
| round1 | chat-recent | on | RESOLVED | finish | 21 | 0 | 1 | 9 | 42341 | recall-backend/index.ts |
| round1 | search-description | off | RESOLVED | finish | 26 | 0 | 2 | 12 | 46474 | recall-backend/db/schema.ts |
| round1 | search-description | on | UNRESOLVED | budget: tokens 300000 | 29 | 2 | 1 | 7 | 29128 | recall-backend/db/schema.ts |
| round1 | session-expiry | on | RESOLVED | finish | 30 | 0 | 3 | 16 | 86137 | recall-backend/middleware/middleware.ts |
| round1 | session-expiry | off | RESOLVED | finish | 23 | 0 | 2 | 10 | 23109 | recall-backend/middleware/middleware.ts |
| round1 | short-summary | on | UNRESOLVED | budget: tokens 300000 | 27 | 1 | 2 | 9 | 52170 | recall-backend/worker.ts |
| round1 | short-summary | off | UNRESOLVED | budget: steps 40 | 40 | 2 | 1 | 6 | 13290 | recall-backend/worker.ts |
| runner | chat-recent | on | RESOLVED | finish | 31 | 0 | 0 | 8 | 34031 | recall-backend/index.ts |
| runner | chat-recent | off | UNRESOLVED | budget: steps 40 | 40 | 0 | 1 | 20 | 65926 | recall-backend/index.ts |
| runner | search-description | on | UNRESOLVED | budget: tokens 300000 | 28 | 0 | 6 | 7 | 34044 | recall-backend/db/schema.ts |
| runner | search-description | off | UNRESOLVED | budget: steps 40 | 40 | 3 | 0 | 23 | 85808 | recall-backend/db/schema.ts |
| runner | session-expiry | on | RESOLVED | finish | 24 | 0 | 2 | 13 | 64320 | recall-backend/middleware/middleware.ts |
| runner | session-expiry | off | RESOLVED | finish | 25 | 0 | 1 | 9 | 20964 | recall-backend/middleware/middleware.ts |
| runner | short-summary | on | UNRESOLVED | budget: tokens 300000 | 28 | 0 | 2 | 7 | 37198 | recall-backend/worker.ts |
| runner | short-summary | off | UNRESOLVED | budget: tokens 300000 | 32 | 0 | 2 | 13 | 66545 | recall-backend/worker.ts |

Every one of the 16 read a fault file. Mean step of the first read: graph on 9.5, graph off 13.1
(n = 8 each); mean tokens up to it: graph on 47,421, graph off 44,108 (n = 8 each; the graph-on
first message carries the packet). Two runs per cell: a description of these records, not a
measured effect of the graph.

**Gates** (GIT_* env check printed nothing; nothing else ran during either run):
- First run: version guard exit 0; `TRACEHOUND_NETWORK_TESTS=1 pnpm test` **exit 1**, 1 of 358
  analyzer tests failed: `harness-recall.test.ts` test 1 ("correct patch → RESOLVED …"), whose
  assertion that Recall's own `cd "recall-backend" && bun test` exits 0 **at baseline** got exit 1.
  The baseline runs before any agent or patch. Typecheck exit 0; viewer build exit 0.
- **Fix (the one attempt):** re-run unchanged (the Phase 2 gate's red run was the same test and
  passed on re-run). **Still red:** the same test, the same assertion (exit 1 at baseline), 357 of
  358 passed, 826 s. Typecheck exit 0; viewer build exit 0.
- **STOPPED here** ("a gate is still red after one fix attempt"). Phase 4 (model runs), Phase 5
  (re-freeze, tag) were not started. No model call was made in this prompt.

**Diagnosis (no change made):**
- The test alone (`vitest run test/harness-recall.test.ts -t "1. correct patch"`) passed in 52 s.
- Control: the analyzer suite at the `eval-freeze` commit (`7b1c153`, a scratch worktree, same
  machine, nothing else running) exited 1 with 2 other failures (`changes.test.ts` "a removed call"
  by the 5 s timeout; `harness-docker.test.ts` "no host mounts, no host environment …", 190 ms,
  possibly because of the worktree's path). Recall test 1 **passed** there.
- Record of this test in full-suite runs this session: agent-v6 commits 3 failed of 4 (`01dc0f8`
  first run, `3922559` twice), 1 passed (`01dc0f8` re-run); `2b88f9e` (no code change) passed in
  its green re-run; `eval-freeze` control passed once. CI on `2b88f9e` and `01dc0f8`: success.
- No agent-v6 code runs before or during a run's baseline: the changes are in the agent's tools
  (used only by the model agent; this test uses the scripted oracle), the run record after the
  agent stops, the runner and the CLI. The tests added in Phases 2 and 3 add one short Docker run
  (two more commands) in `harness-loop.test.ts`, which runs in parallel with this file. The most
  likely cause is decision 045's known weakness (Recall's suite under parallel Docker load; bun's
  5 s default per-test timeout), but it is **not proven**, and the failure rate on these commits
  (3 of 4) is higher than before.
- Which Recall tests failed at baseline is not known: the test does not keep the run record.

**Spend:** $0 (ledger $0.91718).

## Amendment 1 (`docs/prompts/agent-v6-amendment-1.md`, commit `a2145e4`)

The owner chose option 2 (isolate the Docker test files) plus keeping the run record. The
amendment overrides the original where they differ: it adds the analyzer test config and
`test/harness-recall.test.ts` to the may-touch list, sets the prompt's spend cap to $4.00 (ledger cap
$4.91718), the Super probe's per-task cost limit to $0.60 (probe total at most $3.00), and says
nothing else runs on the machine during a gate or a model batch. CI on the stopped head `a145696`:
**success**, https://github.com/SunnyBagal/TraceHound/actions/runs/37138070516.

### A. The gate

**What changed in the test config** (`packages/analyzer/vitest.config.ts`): two vitest projects.
`unit` is every test file except the five that start Docker sandboxes, run in parallel as before
(`sequence.groupOrder` 0). `docker` is `harness-docker`, `harness-expiry`, `harness-infra`,
`harness-loop` and `harness-recall`, with `fileParallelism: false` and `groupOrder` 1: it starts
after the unit project has finished and runs its files one at a time. No timeout was raised, no
retry added, no test skipped. Checked first with four throwaway files (two per project): the unit
pair ran together, then the docker pair one after the other. `test/test-config.test.ts` fails if a
test file that uses `LocalDockerProvider` or `dockerAvailable` is missing from the list (or vice
versa), or if the projects lose these settings.

**Kept run records** (`test/harness-recall.test.ts`): every run record is written to
`runs/test-records/<runId>.json` as soon as its run returns. A passing test deletes its records; a
failing one keeps them and appends `run record kept: <path>` to its failure message. A test that
hits its timeout fails before its run returns, so its message can't name the file, but the record
still lands in that directory when the run ends. Checked once with a throwaway copy of the file
whose test 2 expected a wrong reason: the failure message ended with the kept record's path; the
copy and the record were then deleted.

**Cause of the earlier red gates: unproven.** No kept record exists for them (the records were
not kept then). The likely cause is still decision 045's (Recall's own suite under parallel Docker
load), but it is not shown.

### B. Runner validity flag

- Per run: baseline tests passed / total (`baselinePassed`, `baselineTotal`, from the per-test
  reports of all regression commands; absent without a report).
- `flagBaselineAnomalies`: a run whose baseline passed-count differs from the most common one for
  its task in the batch gets `baselineAnomaly: true` in `results.json`, and
  "**baseline-anomaly**" beside its count in `results.md`, plus a summary line naming the flagged
  runs (or "baseline-anomaly: none"). With a tie for most common, every run of that task is flagged.
  The verdict is not changed.
- For the Super probe: `--cost-limit-usd <usd>` on `tracehound repair` and on the runner (which
  also reserves that amount per run in its spend stop); every run record now carries `limits`, the
  limits it actually had. The end reason (`budget: cost $…`, `budget: tokens …`, `budget: steps …`)
  says which limit ended a run.
- Tests: `test/harness-evaluate.test.ts` (counts, a lone off count flagged, a tie flagging all
  four, no report → no flag, the table and summary line, bad `--cost-limit-usd` in both CLIs).

### Gate after amendment A and B (step A3)

GIT_* env check printed nothing; no container running at the start; nothing else ran. Commit
`b91b887`.

| Run | Analyzer suite (`TRACEHOUND_NETWORK_TESTS=1`) | Time |
|---|---|---|
| 1 | exit 0, 360 passed (30 files) | 944 s |
| 2 | exit 0, 360 passed | 960 s |
| 3 | exit 0, 360 passed | 829 s |

Then: version guard exit 0; viewer 88 passed; `pnpm typecheck` exit 0; viewer build exit 0. No
run record was kept (`runs/test-records/` empty), so no Recall test failed. Three green runs
with the Docker files serialized are consistent with the load explanation, but they don't prove
it: smoke test 1 had failed in 3 of the 6 unserialized full-suite runs on this branch, and the cause stays **unproven**.

**Spend:** $0 (ledger $0.91718).

## Phase 4: dev batches (agent-v6)

Rules block re-read at the start. CI for `8806d5a` (amendment gate): **success**,
https://github.com/SunnyBagal/TraceHound/actions/runs/37145415103. Nothing else ran during
either batch. Ledger before the first model step: $0.91718.

**Contradiction resolved (amendment 1 over the original):** the original stopped the Super probe if
its first run cost more than $0.30; the amendment sets a $0.60 per-run cost limit for the probe and
stops it only if its total passes $3.00. The amendment's limits were used.

### Step 6: Nano, agent-v6, 4 dev tasks × 2 arms × 2 repeats

`node packages/analyzer/src/harness/evaluate.ts --tasks eval/tasks --kind dev --arms on,off --repeats 2
--concurrency 1 --max-spend-usd 1.0 --out runs/phase4-v6-nano`. All runs: `loopVersion` agent-v6,
prompt `556861d4…`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, reasoning on, task limits (40 steps,
300,000 tokens, 900 s, $0.10).

**Loss: a network outage.** Runs 1–6 completed. From about 19:20 UTC the host could not resolve
`github.com`: runs 7–16 ended FAILED within a second each ("git clone … Could not resolve host:
github.com"), before any model call ($0). Run 6 (search-description, graph off, repeat 1) was in
progress when it started: its model request timed out after 26 turns ("The operation was aborted
due to timeout"), and the harness scored it UNRESOLVED (repro still fails). **That run is kept as
recorded, a loss to the outage, not re-run.** Once GitHub answered again, the 10 FAILED runs were
re-run once, same settings (`runs/phase4-v6-nano-b/`, one runner call per task; the
search-description call's repeat is repeat 2). A first attempt at this re-run failed instantly on
my own shell quoting (zsh did not split the arguments; nothing ran, $0) and was repeated with
explicit commands. Merged: `runs/phase4-v6-nano-merged/` (baseline flags recomputed over all 16),
copied to `docs/eval/agent-v6-dev-2026-10-04/nano/`.

**Baseline-anomaly flags: none** (every run's baseline was 62 / 62).

**v6 Nano beside the 16 frozen-prompt v5 runs** (v5: round 1 = rep 1, runner test = rep 2; their
counts computed from the records with the same code; "Aliased calls" did not exist in v5):
| Task | Arm | Set | Rep | State | End | Steps | Failed edits | Unknown-tool calls | Aliased calls | First fault-file read: step (tokens) | Tokens | Cost | Baseline passed / total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chat-recent | on | v5 round1 | 1 | RESOLVED | finish | 21 | 0 | 1 | — | 9 (42341) | 158603 | $0.01085 | 62 / 62 |
| chat-recent | on | v5 runner | 2 | RESOLVED | finish | 31 | 0 | 0 | — | 8 (34031) | 255518 | $0.01738 | 62 / 62 |
| chat-recent | on | v6 Nano | 1 | UNRESOLVED | budget: tokens 300000 | 35 | 0 | 0 | 0 | 9 (38231) | 307928 | $0.02156 | 62 / 62 |
| chat-recent | on | v6 Nano | 2 | UNRESOLVED | budget: tokens 300000 | 40 | 0 | 0 | 0 | 21 (104538) | 303195 | $0.02220 | 62 / 62 |
| chat-recent | off | v5 round1 | 1 | RESOLVED | finish | 25 | 1 | 0 | — | 12 (30750) | 107259 | $0.00761 | 62 / 62 |
| chat-recent | off | v5 runner | 2 | UNRESOLVED | budget: steps 40 | 40 | 0 | 1 | — | 20 (65926) | 280433 | $0.01952 | 62 / 62 |
| chat-recent | off | v6 Nano | 1 | RESOLVED | finish | 20 | 0 | 0 | 0 | 8 (20304) | 103347 | $0.00721 | 62 / 62 |
| chat-recent | off | v6 Nano | 2 | RESOLVED | finish | 23 | 0 | 0 | 0 | 11 (32136) | 100896 | $0.00810 | 62 / 62 |
| search-description | on | v5 round1 | 1 | UNRESOLVED | budget: tokens 300000 | 29 | 2 | 1 | — | 7 (29128) | 305616 | $0.02524 | 62 / 62 |
| search-description | on | v5 runner | 2 | UNRESOLVED | budget: tokens 300000 | 28 | 0 | 6 | — | 7 (34044) | 311297 | $0.02266 | 62 / 62 |
| search-description | on | v6 Nano | 1 | RESOLVED | finish | 19 | 0 | 0 | 7 | 7 (31273) | 146236 | $0.01158 | 62 / 62 |
| search-description | on | v6 Nano | 2 | UNRESOLVED | budget: tokens 300000 | 26 | 0 | 1 | 0 | 6 (25363) | 314568 | $0.02776 | 62 / 62 |
| search-description | off | v5 round1 | 1 | RESOLVED | finish | 26 | 0 | 2 | — | 12 (46474) | 229102 | $0.01592 | 62 / 62 |
| search-description | off | v5 runner | 2 | UNRESOLVED | budget: steps 40 | 40 | 3 | 0 | — | 23 (85808) | 284574 | $0.02634 | 62 / 62 |
| search-description | off | v6 Nano | 1 | UNRESOLVED | error: The operation was aborted due to timeout | 26 | 0 | 5 | 8 | 8 (24441) | 236425 | $0.02203 | 62 / 62 |
| search-description | off | v6 Nano | 2 | UNRESOLVED | budget: tokens 300000 | 27 | 0 | 0 | 7 | 6 (18095) | 313061 | $0.02845 | 62 / 62 |
| session-expiry | on | v5 round1 | 1 | RESOLVED | finish | 30 | 0 | 3 | — | 16 (86137) | 230149 | $0.01489 | 62 / 62 |
| session-expiry | on | v5 runner | 2 | RESOLVED | finish | 24 | 0 | 2 | — | 13 (64320) | 153318 | $0.00999 | 62 / 62 |
| session-expiry | on | v6 Nano | 1 | RESOLVED | finish | 23 | 0 | 1 | 4 | 7 (32948) | 178439 | $0.01182 | 62 / 62 |
| session-expiry | on | v6 Nano | 2 | RESOLVED | finish | 22 | 0 | 0 | 5 | 5 (22483) | 160043 | $0.01062 | 62 / 62 |
| session-expiry | off | v5 round1 | 1 | RESOLVED | finish | 23 | 0 | 2 | — | 10 (23109) | 103436 | $0.00701 | 62 / 62 |
| session-expiry | off | v5 runner | 2 | RESOLVED | finish | 25 | 0 | 1 | — | 9 (20964) | 109653 | $0.00748 | 62 / 62 |
| session-expiry | off | v6 Nano | 1 | RESOLVED | finish | 19 | 0 | 0 | 0 | 9 (20286) | 75890 | $0.00553 | 62 / 62 |
| session-expiry | off | v6 Nano | 2 | RESOLVED | finish | 20 | 0 | 0 | 4 | 5 (11127) | 119767 | $0.00836 | 62 / 62 |
| short-summary | on | v5 round1 | 1 | UNRESOLVED | budget: tokens 300000 | 27 | 1 | 2 | — | 9 (52170) | 309351 | $0.02281 | 62 / 62 |
| short-summary | on | v5 runner | 2 | UNRESOLVED | budget: tokens 300000 | 28 | 0 | 2 | — | 7 (37198) | 313254 | $0.02337 | 62 / 62 |
| short-summary | on | v6 Nano | 1 | UNRESOLVED | budget: tokens 300000 | 32 | 1 | 0 | 9 | 9 (44360) | 309009 | $0.02323 | 62 / 62 |
| short-summary | on | v6 Nano | 2 | UNRESOLVED | budget: tokens 300000 | 27 | 0 | 1 | 9 | 8 (43529) | 307227 | $0.02616 | 62 / 62 |
| short-summary | off | v5 round1 | 1 | UNRESOLVED | budget: steps 40 | 40 | 2 | 1 | — | 6 (13290) | 295163 | $0.02103 | 62 / 62 |
| short-summary | off | v5 runner | 2 | UNRESOLVED | budget: tokens 300000 | 32 | 0 | 2 | — | 13 (66545) | 306398 | $0.02159 | 62 / 62 |
| short-summary | off | v6 Nano | 1 | UNRESOLVED | budget: tokens 300000 | 36 | 0 | 0 | 12 | 6 (15011) | 304181 | $0.02337 | 62 / 62 |
| short-summary | off | v6 Nano | 2 | UNRESOLVED | budget: tokens 300000 | 35 | 0 | 1 | 6 | 16 (73758) | 301180 | $0.02321 | 62 / 62 |

| Set | Arm | n | Resolved | Ends: finish / tokens / steps / cost / stuck / error | Failed edits | Unknown-tool calls | Fault file read (mean step) | Cost |
|---|---|---|---|---|---|---|---|---|
| v5 (round 1 + runner test) | on | 8 | 4 of 8 | 4 / 4 / 0 / 0 / 0 / 0 | 3 | 17 | 8 of 8 (9.5) | $0.14719 |
| v5 (round 1 + runner test) | off | 8 | 4 of 8 | 4 / 1 / 3 / 0 / 0 / 0 | 6 | 9 | 8 of 8 (13.1) | $0.12650 |
| v6 Nano | on | 8 | 3 of 8 | 3 / 5 / 0 / 0 / 0 / 0 | 1 | 3 | 8 of 8 (9.0) | $0.15493 |
| v6 Nano | off | 8 | 4 of 8 | 4 / 3 / 0 / 0 / 0 / 1 | 0 | 6 | 8 of 8 (8.6) | $0.12626 |

What the v6 records show, and only that (n = 8 per arm and set; no significance test, none implied):
- Resolved: v6 Nano 7 of 16 (on 3 of 8, off 4 of 8); v5 8 of 16 (on 4 of 8, off 4 of 8).
- Every v6 run that called `finish` was RESOLVED (7 of 7); the other 9 ended on the token budget
  (8) or on the outage (1). No v6 run ended on the step budget (v5: 3) or the stuck stop.
- Failed edits: v6 1, v5 9. The new line-end retry applied **0** times in 16 runs (the replay in
  Phase 2 predicted it would not change the recorded failures); the agent-v2 fallback applied 6.
- Unknown-tool calls: v6 9 (`execute_bash` ×5, a name not seen before; `str_replace_editor` with
  `command: "edit"` ×3, a shape not seen in Phase 1 and so not mapped; `str_replace_editor {}` ×1);
  v5 26. **71 `str_replace_editor` calls ran as real tools** (70 `read_file`, 1 `list_dir`).
- Every run read a fault file; mean step of the first read: v6 on 9.0, off 8.6; v5 on 9.5, off 13.1.
- v6 Nano spend: the 16 records sum to $0.28119 ($0.15493 on, $0.12626 off); the ledger grew by
  $0.28298. The $0.00179 difference is one ledger entry with `ok: false` at 19:20:22 UTC, the model
  request that timed out in the outage, priced as an estimate and in no run record.

### Step 7: Super probe

`… --arms on,off --repeats 1 --concurrency 1 --model nvidia/nemotron-3-super-120b-a12b
--cost-limit-usd 0.6 --max-spend-usd 3.0 --out runs/phase4-v6-super`. Same agent (agent-v6, prompt
`556861d4…`, reasoning on, temperature 0), same step, token and time limits; the per-run cost limit
$0.60 for this probe only (recorded in each record's `limits`). Ledger before: $1.20016. The model
id is the one in `config/prices.json` ($0.30 / $0.90 per 1M input / output, third-party rate).
Copied to `docs/eval/agent-v6-dev-2026-10-04/super/`. Baseline-anomaly flags: none (62 / 62).
| Task | Arm | Set | Rep | State | End | Steps | Failed edits | Unknown-tool calls | Aliased calls | First fault-file read: step (tokens) | Tokens | Cost | Baseline passed / total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chat-recent | on | v6 Super | 1 | RESOLVED | finish | 26 | 0 | 0 | 0 | 13 (71627) | 213244 | $0.06560 | 62 / 62 |
| chat-recent | off | v6 Super | 1 | RESOLVED | finish | 14 | 0 | 0 | 0 | 6 (13584) | 56694 | $0.01789 | 62 / 62 |
| search-description | on | v6 Super | 1 | RESOLVED | finish | 16 | 1 | 0 | 0 | 3 (11771) | 132154 | $0.04145 | 62 / 62 |
| search-description | off | v6 Super | 1 | UNRESOLVED | budget: tokens 300000 | 27 | 0 | 0 | 0 | 5 (13084) | 311723 | $0.10090 | 62 / 62 |
| session-expiry | on | v6 Super | 1 | RESOLVED | finish | 9 | 0 | 0 | 0 | 3 (12914) | 52143 | $0.01632 | 62 / 62 |
| session-expiry | off | v6 Super | 1 | RESOLVED | finish | 8 | 0 | 0 | 0 | 5 (10241) | 19773 | $0.00626 | 62 / 62 |
| short-summary | on | v6 Super | 1 | UNRESOLVED | stopped: stuck | 16 | 0 | 0 | 0 | 4 (18068) | 127836 | $0.04202 | 62 / 62 |
| short-summary | off | v6 Super | 1 | UNRESOLVED | budget: tokens 300000 | 31 | 0 | 0 | 0 | 6 (15190) | 305522 | $0.10075 | 62 / 62 |

| Set | Arm | n | Resolved | Ends: finish / tokens / steps / cost / stuck / error | Failed edits | Unknown-tool calls | Fault file read (mean step) | Cost |
|---|---|---|---|---|---|---|---|---|
| v6 Super | on | 4 | 3 of 4 | 3 / 0 / 0 / 0 / 1 / 0 | 1 | 0 | 4 of 4 (5.8) | $0.16540 |
| v6 Super | off | 4 | 2 of 4 | 2 / 2 / 0 / 0 / 0 / 0 | 0 | 0 | 4 of 4 (5.5) | $0.22580 |

**Which limit ended each Super run:** chat-recent on / off, search-description on, session-expiry
on / off: none (`finish`, RESOLVED). search-description off: the **token** limit (311,723 tokens,
$0.10090). short-summary on: the **stuck stop** (3 refused calls in a row, 16 steps, $0.04202).
short-summary off: the **token** limit (305,522 tokens, $0.10075). The $0.60 cost limit ended none;
the most a run cost was $0.10090. Probe total **$0.39120** (8 runs; $0.00626–$0.10090 per run,
mean $0.04890), far under the $3.00 stop.

Super resolved 5 of 8 (on 3 of 4, off 2 of 4) with no unknown-tool calls and no aliased calls, and
read a fault file first at a mean step of 5.8 (on) / 5.5 (off). One run per cell, dev tasks:
this is a probe, not a comparison of models.

### Step 8

No tuning after these batches. Nothing in the agent, prompt or settings was changed in response to
them.

**Spend in Phase 4** (ledger): Nano $0.09448 (first batch, incl. the $0.00179 failed request) +
$0.18850 (re-run) = $0.28298; Super $0.39121; total **$0.67419**. Ledger $0.91718 → **$1.59137** (cap for this prompt: $4.00, ledger $4.91718).

**Gates** (GIT_* env check printed nothing; nothing else ran): version guard exit 0;
`TRACEHOUND_NETWORK_TESTS=1 pnpm test` exit 0, analyzer 360 passed (31 files), viewer 88 passed
(11 files), 844 s; `pnpm typecheck` exit 0; viewer build exit 0; no run record kept. Commit
`850ac4b`, pushed.

## Phase 5: re-freeze

Rules block re-read at the start. CI for the Phase 4 commit `850ac4b`: see the PR.

**Done:**
- `docs/freeze.md` rewritten for **agent-v6** (prompt `agent-v5.md` byte-identical, `556861d4…`),
  with a note that **`eval-freeze` is superseded** (its tag stays), the agent-v6 tool behaviour,
  and **per-model cost limits per run: Nano $0.10 (the task's limit), Super $0.60 (via
  `--cost-limit-usd 0.6`)**; every other frozen item re-checked by hash and unchanged (snapshot,
  prompt files, price table, profile, Dockerfile, image id).
- README: the agent version line (agent-v4 → agent-v6).
- CLAUDE.md: the line reserving Super (now: Super only via `--model`, probed on the dev tasks with
  `--cost-limit-usd 0.6`, not the evaluation's model), the agent-v6 and freeze lines, the spend
  figure.
- Tag `eval-freeze-2` on this phase's commit once its gate and CI are green; `eval-freeze` left in
  place. PR #9 marked ready for review, not merged.

**Scratch worktrees (amendment item 9): not removed.** `git worktree remove` (no `--force`)
refused all three, as it should: `scratchpad/wt` has uncommitted drafts of Phase 2 (identical to
what `01dc0f8` committed), `scratchpad/wt3` uncommitted drafts of Phase 3 plus `node_modules`
symlinks, `scratchpad/wtfreeze` (the `eval-freeze` control) only `node_modules` symlinks.
`git branch -d wip/agent-v6-phase2` refused because that branch is checked out in `scratchpad/wt`.
All four are left as they are.

# Build log: reproduce stage

Prompt: `docs/prompts/reproduce-stage.md` (verbatim, commit `ff069c1`). Branch `build/reproduce` off
`origin/main` at `ba07667` (PR #9 merged). Decision 048. Ledger at the start: **$1.59137**; the
prompt's cap is $3.00 of new spend, so the ledger must stay at or below **$4.59137**.

## Step 0: contradictions with the prompt

Read: CLAUDE.md, decisions 041, 043, 045–047, `docs/freeze.md`, `src/harness/{run,task,loop,evaluate}.ts`
(and `agents.ts`, `tools.ts`, `profile.ts`, `junit.ts`, `cli.ts`, `run-metrics.ts`, `vitest.config.ts`,
`test/test-config.test.ts`, which they depend on). None of the items below blocks a phase.

1. **The loop has two repair-only messages.** The prompt says to use "the existing loop and tools"
   and freezes the repair agent's behaviour. But the loop sends two repair-specific messages:
   - At step 15 with no base file changed: "no file has been changed. If you have found the bug,
     fix it now with edit_file."
   - On the first `finish` with no base file changed: "not finished: no file that existed at the
     start has been modified or deleted …".

   A correct reproduce agent changes no existing file, so it gets both. **Resolution:** the loop is
   unchanged. `repro-v1.md` tells the agent that these two messages are generic. It should not edit
   an existing file in response, and it should call `finish` a second time to confirm.
2. **Check 5d, "the decision 043 gate, unchanged", rejects every reproduction if applied
   literally.** The 043 gate has two halves:
   - per test: every test that passed at baseline must still pass;
   - per command: a suite that exited 0 at baseline must still exit 0.

   A reproducing test fails on purpose, so with it in the suite, the suite exits 1, and the second
   half fails every REPRODUCED candidate. **Resolution:** the per-test half runs unchanged (the
   same `compareRegression`). A suite exit 0 → non-zero is accepted only when every failing test in
   the report is in the new file, which is the failure check 5b already required. Anything else is
   still rejected: a baseline test that fails, is skipped or goes missing, or a failure outside the
   new file.
3. **Super as an evaluation model.** The Protocol block says "Models: Nano and Super … Both are
   always reported together". `docs/freeze.md` and CLAUDE.md say Super is "not the evaluation's
   model". Phase 1 writes the protocol verbatim, as asked. `docs/freeze.md` is **not** edited:
   by its own rule, a change to a frozen item means a new freeze and a new tag, and this prompt
   doesn't ask for one. The two documents disagree until the owner re-freezes or amends one of
   them. The protocol's canary and void re-runs are also not features of the frozen runner, so they
   are a manual procedure around it.
4. **What "a type error" means.** bun runs TypeScript without typechecking. **Resolution:** a
   test case that fails with anything other than an `AssertionError` (`TypeError`, `Error`,
   `TimeoutError`, `UnreachableError`, …) disqualifies the file. So does a tsc error that the base
   doesn't have: the decision 041 baseline-matched typecheck gate, run with the file added. Recall's
   `tsconfig.json` has no `include`, so tsc checks test files there.
5. **"The repo's test-file pattern".** Profiles have no pattern; tasks have `testFilePattern`,
   which defaults to bun's discovery pattern. **Resolution:** bun's discovery pattern
   (`BUN_TEST_FILE_PATTERN`), and the file must also be inside the profile's `workdir`, where the
   suite runs. A claim may override the pattern.
6. **The claim format needs more fields than listed.** A claim needs a repo and a commit to run
   at, but a profile has neither. **Resolution:** claims also carry `source` and `baseSha`, as tasks
   do.
7. **Limits for reproduce runs.** Claims carry no limits. **Resolution:** the dev tasks' limits
   (40 steps, 300,000 tokens, 900 s, 300 s per command), with the freeze's per-model cost limits:
   Nano $0.10 and Super $0.60 per run. Each run reserves its cost limit against the prompt's $3.00
   before it starts, so late Super runs can be NOT_RUN even though the ledger is below the cap.
8. **Phase 4, "the frozen repair agent once on Nano", names no arm.** **Resolution:** graph off,
   the `tracehound repair` default; the emitted task carries no snapshot.
9. **FAILED versus agent errors.** In repair runs, a model request error is recorded as
   `agentRun.error` and the run is still verified. The prompt makes model request timeouts FAILED
   for reproduce runs. **Resolution:** in a reproduce run, any agent error that is not a budget or
   stuck stop is FAILED.
10. **The prompt-file parameter already exists.** `LoopOptions.promptFile` predates this prompt,
    so no new parameter is added. A test still pins that a default repair run's first message is
    byte-identical to `main`'s.

**Graph tool calls, read only, from `docs/eval/agent-v6-dev-2026-10-04/`:** **0 in every run.**

| Batch | Runs | Graph tool calls per run | Total |
|---|---|---|---|
| Nano: 4 tasks × 2 arms × 2 repeats | 16 (8 graph-on) | 0 in all 16 | 0 |
| Super probe: 4 tasks × 2 arms × 1 | 8 (4 graph-on) | 0 in all 8 | 0 |

Every run in both batches read a fault file (Nano 16 of 16, Super 8 of 8). That agrees with the
Protocol block's stated expectation.

**How bun's report separates the cases** (bun 1.4.2 in the sandbox image, network off, one probe
file per case, checked before writing Phase 2):

| Case | Exit | JUnit report |
|---|---|---|
| `expect(…).toBe/toEqual` fails, also `.resolves` | 1 | `<testcase>` with `<failure type="AssertionError">` |
| `node:assert` fails | 1 | `<failure type="AssertionError">` |
| runtime `TypeError` / thrown `Error` / `expect.unreachable` | 1 | `<failure type="TypeError">` / `"Error"` / `"UnreachableError"` |
| bun per-test timeout | 1 | `<failure type="TimeoutError" message="test timed out">` |
| import of a missing module, syntax error, top-level throw | 1 | **no report file written** ("Unhandled error between tests") |
| file with zero `test(…)` calls | 0 | no report file written |
| error thrown between tests | 1 | attributed to the next test as `<failure type="Error">` |

So an assertion failure is a `<testcase>` whose `<failure>` has `type="AssertionError"`. A load
error writes no `<testcase>` for the file. **The report does separate the two; Phase 2 is not
blocked.**

## Phase 1: evaluation protocol (docs only)

Rules block re-read at the start. `docs/eval/protocol.md` written with exactly the Protocol
block's text. Commit `4b9fe61`.

**Gate** (GIT_* env check printed nothing; nothing else ran; the Phase 2 drafts were kept out of
the tree during the gate):
- version guard: exit 0;
- `TRACEHOUND_NETWORK_TESTS=1 pnpm test`: exit 0; analyzer 360 passed (31 files, 827 s), viewer
  88 passed (11 files);
- `pnpm typecheck`: exit 0;
- viewer build: exit 0.

Pushed (`build/reproduce`). Spend: $0.

## Phase 2 (decision 048): the reproduce stage

Rules block re-read at the start. Paths touched: `src/harness/reproduce.ts` (new),
`harness/prompts/repro-v1.md` (new), `test/reproduce.test.ts` and `test/harness-reproduce.test.ts`
(new), the Docker test-file list in `vitest.config.ts` (one line added), `docs/`. No frozen file
was changed: `loop.ts`, `run.ts`, `junit.ts`, `evaluate.ts`, `agent-v5.md` and `eval/tasks/` are
untouched. No existing test was modified. The pin for a repair run's first request messages
(`bc57c40b…`) was computed from the tree at `4b9fe61` before any reproduce-stage file was in it.

**How an assertion failure is told apart from a load error:** from bun's JUnit report (step 0
table):
- an assertion failure is a `<testcase>` with `<failure type="AssertionError">`;
- a file that fails to load (import, syntax, top-level error) writes no report when run alone;
- zero tests also writes none, but exits 0;
- a runtime error or timeout is a `<failure>` with another `type`.

The prompt's STOP condition does not apply.

**Scripted test results** (no model): the 8 Docker cases in decision 048's table all pass, as do
the 15 unit tests in `test/reproduce.test.ts`. Recall, scripted, before any model run:
- seeded claim + the task's repro → REPRODUCED;
- control → NOT_REPRODUCED;
- oracle-check → true reproduction;
- emitted task + oracle → RESOLVED.

One Docker test expectation was wrong at first: the edit-to-an-existing-file case's reason names
both problems ("modified existing file(s): tests/cart.test.ts; added 0 files, not exactly one").
The code was right; the expected string was corrected.

**Gate** (GIT_* env check printed nothing; nothing else ran):
- version guard: exit 0;
- `TRACEHOUND_NETWORK_TESTS=1 pnpm test`: exit 0; analyzer 383 passed (33 files, 871 s), viewer
  88 passed;
- `pnpm typecheck`: exit 0;
- viewer build: exit 0.

Commit `76307cd`, pushed. **CI runs on pull requests only** (`ci.yml`: `push` to `main`,
`pull_request`), so the one PR was opened as a draft now, **PR #10**, so that CI runs after each
phase. It stays the only PR and is not merged. CI on `76307cd`: test-and-build pass (9 m 8 s),
Vercel pass. Spend: $0.

## Phase 3: measure on the dev seeds

Rules block re-read at the start. `eval/claims/`: 8 claims, `recall-dev-<task>-{seeded,control}`.
Each claim's text is its task's `issue`, verbatim; the title is a short paraphrase, the same for
both cases. The seeded claims point at `../tasks/recall-dev-<task>/seed.patch`, read only. The
controls have no seed. Profile `configs/recall.profile.json`. Batches run one at a time, with
`--max-ledger-usd 4.59137` (the start ledger plus $3.00).

**Void batch: round 1 on Nano, first attempt (listed, not used).** The Mac's lid was closed at
04:49 IST, on battery. From then on, the machine went into Maintenance Sleep for about 15 minutes
at a time and woke only for seconds (`pmset -g log`). The batch ran through it:
- 5 of 8 runs FAILED: two model requests aborted on timeout; three setup commands passed their
  300 s timeout (bun timed one install at 919 s while the harness measured 227 s, and a
  `tsc --version` ran 900 s);
- the other 3 ran into budgets (NOT_REPRODUCED ×2, REJECTED a ×1).

The sleep was the machine's, not the stage's, so the whole batch is void. It was re-run once,
under `caffeinate -dimsu`, with the lid open. Records are kept in
`runs/repro-r1-nano-VOID-sleep/`. Spend in the void batch: **$0.07928** (ledger $1.59137 →
$1.67065). It counts against the $3.00.

### Round 1 (`repro-v1.md` sha256 `0e4d2ef8…`, as committed in `76307cd`)

Mac on AC power, lid open, `caffeinate -dimsu`; Nano, then Super (`--cost-limit-usd 0.6`); one
run at a time. Per claim, Nano:

| Claim | Case | State | Failed check | End | Steps | Cost |
|---|---|---|---|---|---|---|
| chat-recent | control | NOT_REPRODUCED (no file) | — | budget: tokens | 38 | $0.02275 |
| chat-recent | seeded | NOT_REPRODUCED (no file) | — | budget: tokens | 35 | $0.02119 |
| search-description | control | NOT_REPRODUCED (test passes) | — | budget: tokens | 40 | $0.02344 |
| search-description | seeded | REJECTED | b (a tsc error the base doesn't have) | finish | 27 | $0.01749 |
| session-expiry | control | NOT_REPRODUCED (test passes) | — | finish | 23 | $0.01392 |
| session-expiry | seeded | **REPRODUCED** | — | finish | 33 | $0.01853 |
| short-summary | control | REJECTED | b (a case failed with TypeError) | budget: tokens | 31 | $0.02269 |
| short-summary | seeded | REJECTED | a (file at `test/…`, outside `recall-backend/`) | budget: tokens | 29 | $0.02182 |

Super:

| Claim | Case | State | Failed check | End | Steps | Cost |
|---|---|---|---|---|---|---|
| chat-recent | control | REJECTED | b (a tsc error the base doesn't have) | finish | 29 | $0.07524 |
| chat-recent | seeded | NOT_REPRODUCED (no file) | — | budget: tokens | 37 | $0.09853 |
| search-description | control | NOT_REPRODUCED (test passes) | — | finish | 17 | $0.03423 |
| search-description | seeded | NOT_REPRODUCED (test passes) | — | finish | 18 | $0.03403 |
| session-expiry | control | NOT_REPRODUCED (test passes) | — | finish | 19 | $0.04414 |
| session-expiry | seeded | **REPRODUCED** | — | finish | 13 | $0.01992 |
| short-summary | control | NOT_REPRODUCED (test passes) | — | budget: tokens | 27 | $0.09755 |
| short-summary | seeded | REJECTED | b (a tsc error the base doesn't have) | finish | 21 | $0.05893 |

Totals:
- Nano: seeded 1 REPRODUCED, 1 NOT_REPRODUCED, 2 REJECTED (n = 4); control 0 REPRODUCED,
  3 NOT_REPRODUCED, 1 REJECTED (n = 4). $0.16184.
- Super: seeded 1 / 2 / 1 (n = 4); control 0 / 3 / 1 (n = 4). $0.46256.
- No FAILED and no NOT_RUN runs.

**Oracle check** (each REPRODUCED seeded test, the task's `fix.patch`, run alone):
- Nano session-expiry: **true reproduction**;
- Super session-expiry: **true reproduction**;
- false reproductions: 0.

**Controls that came out REPRODUCED: 0 of 8.** Ledger $1.67065 → $2.29505.

**What round 1 showed** (from the traces, all 16 runs):
- **0 of 16 runs ran the typecheck command**, and 3 runs were REJECTED at check b for a tsc
  error in a file that otherwise failed on an assertion. Those three are Nano search-description
  seeded, Super chat-recent control and Super short-summary seeded.
- Nano wrote its file late (first write at turn 16–36), and in 2 runs never wrote one; 5 of its 8
  runs ended on the token budget.
- The step-15 nudge fired in 15 of 16 runs, and no run edited an existing file after it.

### The one change to `repro-v1.md`

Chosen because it is the one loss mechanism that recurs in both models, and the check that
decides it is deterministic. Step 5 is new, and the old step 5 is now step 6. Nothing else
changed. sha256 `0e4d2ef8…` → `f70e63c2…`.

Before:
```
   - It passes: the claim does not reproduce. That is a valid and wanted outcome. Do not change the test to make it fail. Stop.
5. Call finish with one line: whether your test failed or passed, and on which assertion.
```
After:
```
   - It passes: the claim does not reproduce. That is a valid and wanted outcome. Do not change the test to make it fail. Stop.
5. Before you finish, run the typecheck command above. It also reports errors in other files that were there before you started: ignore those, and fix every error it reports in your test file (use only matchers and types that exist), then run your file again. A type error in your file counts as no reproduction, even when the test fails on an assertion.
6. Call finish with one line: whether your test failed or passed, and on which assertion.
```

### Round 2 (`repro-v1.md` sha256 `f70e63c2…`): interrupted by a restart, WIP

Started with the Mac on AC power, lid open, `caffeinate -dimsu`; Nano first, then Super. **The
batch was stopped part-way so the owner could restart the machine.** The batch and run processes
were killed and the remaining sandbox containers removed. No Super run had started.

Complete (6 of 16), Nano:

| Claim | Case | State | Failed check | End | Steps | Cost |
|---|---|---|---|---|---|---|
| chat-recent | control | NOT_REPRODUCED (no file) | — | stopped: stuck | 20 | $0.00657 |
| chat-recent | seeded | NOT_REPRODUCED (no file) | — | stopped: stuck | 35 | $0.01840 |
| search-description | control | NOT_REPRODUCED (test passes) | — | budget: tokens | 30 | $0.02656 |
| search-description | seeded | REJECTED | b (a tsc error the base doesn't have) | budget: tokens | 29 | $0.02236 |
| session-expiry | control | REJECTED | b (the file did not load) | budget: tokens | 34 | $0.02257 |
| session-expiry | seeded | FAILED | — | error: a model request aborted on timeout (machine awake, on AC; checked with `pmset`) | 12 | $0.00414 |

- **Void:** Nano short-summary control was in flight when the batch was stopped. Its process was
  killed while it waited on a model request, so it has no record, and it is void.
- **Not started:** Nano short-summary seeded, and all 8 Super runs.
- To finish round 2, after the restart: re-run the 2 Nano claims not done (short-summary control
  and seeded), then all 8 on Super. Re-run session-expiry seeded once (FAILED, infrastructure)
  and list both attempts.

Ledger $2.29505 → **$2.40769** (+$0.11264 in round 2, including the void run's calls). Spent
against this prompt's $3.00: $0.81632.

### Round 2, completed after the restart (same prompt, sha256 `f70e63c2…`)

Resumed from `82ce226` on the owner's instruction:
- `git worktree prune` was run once;
- Docker Desktop was started (engine 29.8.0, the same image id `857f16d26f25`);
- the Mac was on AC power with the lid open, and runs used `caffeinate -dimsu`.

What ran:
- On Nano: the 2 claims with no record (short-summary control and seeded), plus one re-run of
  session-expiry seeded, which had FAILED on a model request timeout. The ledger was read
  before each run.
- On Super: all 8 claims.

**A second interruption.** At 14:11 IST, during Super's first run, the main checkout was
switched to `ui/canvas-polish`, then `ui/canvas-polish-2`, from outside this session (reflog).
`eval/claims/` disappeared from the tree; the run in progress finished and wrote its record, but
the batch then crashed reading the next claim file. No other Super run had started. On the
owner's choice, the stage continued from a separate worktree, `../TraceHound-reproduce` on
`build/reproduce`. Its `.env`, `.tracehound/` (the spend ledger) and `runs/` are symlinks to the
main checkout's, so there is one ledger and one set of records. The 7 remaining Super claims ran
there, one `run` per claim, with the ledger checked before each.

Final round 2, per claim, Nano:

| Claim | Case | State | Failed check | End | Steps | Cost |
|---|---|---|---|---|---|---|
| chat-recent | control | NOT_REPRODUCED (no file) | — | stopped: stuck | 20 | $0.00657 |
| chat-recent | seeded | NOT_REPRODUCED (no file) | — | stopped: stuck | 35 | $0.01840 |
| search-description | control | NOT_REPRODUCED (test passes) | — | budget: tokens | 30 | $0.02656 |
| search-description | seeded | REJECTED | b (a tsc error) | budget: tokens | 29 | $0.02236 |
| session-expiry | control | REJECTED | b (the file did not load) | budget: tokens | 34 | $0.02257 |
| session-expiry | seeded | NOT_REPRODUCED (test passes) | — | budget: tokens | 34 | $0.02678 |
| short-summary | control | REJECTED | b (a case failed with a query error, not an assertion) | budget: tokens | 32 | $0.02258 |
| short-summary | seeded | REJECTED | b (a case failed with a TypeError) | budget: tokens | 32 | $0.02147 |

The first attempt at session-expiry seeded was FAILED (a model request aborted on timeout, 12
steps, $0.00414). The row above is its one re-run. The short-summary control run in flight at
the restart is void and has no record.

Super:

| Claim | Case | State | Failed check | End | Steps | Cost |
|---|---|---|---|---|---|---|
| chat-recent | control | REJECTED | b (a case failed with a ReferenceError) | budget: tokens | 36 | $0.10356 |
| chat-recent | seeded | **REPRODUCED** | — | finish | 29 | $0.08884 |
| search-description | control | NOT_REPRODUCED (test passes) | — | finish | 21 | $0.04593 |
| search-description | seeded | **REPRODUCED** | — | finish | 17 | $0.03189 |
| session-expiry | control | NOT_REPRODUCED (test passes) | — | finish | 23 | $0.03920 |
| session-expiry | seeded | **REPRODUCED** | — | finish | 20 | $0.03925 |
| short-summary | control | **REPRODUCED (a control)** | — | finish | 22 | $0.06176 |
| short-summary | seeded | REJECTED | b (a tsc error) | finish | 25 | $0.07439 |

Totals:
- Nano: seeded 0 REPRODUCED, 1 NOT_REPRODUCED, 3 REJECTED (n = 4); control 0 / 2 / 2 (n = 4).
  $0.16729, not counting the FAILED attempt.
- Super: seeded 3 REPRODUCED, 0 NOT_REPRODUCED, 1 REJECTED (n = 4); control 1 / 2 / 1 (n = 4).
  $0.48482.

**Oracle check, round 2** (each REPRODUCED seeded test, the task's `fix.patch`, run alone):
- Super chat-recent: **true reproduction**;
- Super search-description: **true reproduction** (both of its cases pass with the fix);
- Super session-expiry: **true reproduction**;
- false reproductions: 0.

**Controls that came out REPRODUCED in round 2: 1 of 8** (Super short-summary control). Its test
fails on an assertion at the unseeded base, the same way twice, and breaks no other test. The
stage's checks cannot tell whether that test asserts more than the claim states, or whether it
found real behaviour. Per the rules, this repo records only the state; nothing about Recall's
behaviour.

**Round 1 → round 2, one prompt change, one run per cell** (not a comparison anyone should draw
conclusions from):
- REPRODUCED on seeded claims: Nano 1 → 0, Super 1 → 3;
- REJECTED for a tsc error: 3 (round 1) → 2 (Nano search-description seeded, Super
  short-summary seeded);
- runs that ran the typecheck command: round 1 0 of 16; round 2 Nano 3 of 8, Super 8 of 8 (the FAILED attempt not counted);
- controls that came out REPRODUCED: 0 → 1.

Ledger $2.40769 → **$2.96335**, so round 2 cost $0.55566 in all, including the void and FAILED
runs. Spent against this prompt's $3.00: **$1.37198**. Phase 3 stops here, as written: no
further change to `repro-v1.md`.

**Gate, Phase 3** (in the worktree; GIT_* env check printed nothing; nothing else ran):
- version guard: exit 0;
- `TRACEHOUND_NETWORK_TESTS=1 pnpm test`: exit 0; analyzer 370 passed and 1 file skipped
  (33 files, 813 s); viewer 88 passed;
- `pnpm typecheck`: exit 0;
- viewer build: exit 0.

The skipped file is `demo-repo.test.ts`, which skips itself when the gitignored
`fixtures/demo-repo` is absent, and the new worktree didn't have it. `fixtures/` was then
symlinked from the main checkout and that file run alone: 13 passed. So 370 + 13 = 383, Phase 2's
count. Commit `83af568`, pushed. CI on PR #10: test-and-build pass (11 m 1 s), Vercel pass.

## Phase 4: reproduced finding → repair task

Rules block re-read at the start. The 3 true reproductions of the final batch (round 2) are all
Super's: chat-recent, search-description and session-expiry, seeded (at most 4 are allowed).
Each became a task with `reproduce.ts to-task`:
- written to `runs/tasks-from-repro/<claim>-from-repro/` (`runs/` is gitignored; nothing went to
  `eval/tasks/`);
- issue = the claim text; repro = the agent's test at its own path; the seed copied in;
  kind `dev`;
- all three load with the repair harness's `loadTask`.

The frozen repair agent then ran once on each, one at a time, with the ledger checked before
each: agent-v6, prompt `agent-v5.md`, Nano, reasoning on, graph off, the task's limits.

| Emitted task | State | End | Steps | Tokens | Cost | Fault file first read | Agent's repro after its patch |
|---|---|---|---|---|---|---|---|
| chat-recent (seeded) | UNRESOLVED | budget: steps 40 | 40 | 276,066 | $0.01910 | step 8 | passes (exit 0) |
| search-description (seeded) | UNRESOLVED | budget: tokens 300,000 | 29 | 314,046 | $0.02949 | step 9 | still fails (exit 1); no base file changed |
| session-expiry (seeded) | **RESOLVED** | finish | 33 | 176,874 | $0.01213 | step 12 | passes; 62 of 62 baseline tests still pass |

- In every run, the agent-written test failed at the seeded base (`repro.atBase` exit 1), and
  the baseline had 62 of 62 tests passing.
- In the chat-recent run, the agent's patch made the agent-written test pass, but the run ended
  on the step budget. By decision 026, the repair harness counts a run that ends on a budget as
  UNRESOLVED whatever the tests say. That is a loss, recorded as one.

Ledger $2.96335 → **$3.02408** (+$0.06072). Spent against this prompt's $3.00: **$1.43271**.

**Gate, Phase 4** (GIT_* env check printed nothing; nothing else ran):
- version guard: exit 0;
- `TRACEHOUND_NETWORK_TESTS=1 pnpm test`: exit 0; analyzer 383 passed (33 files, 904 s), viewer
  88 passed;
- `pnpm typecheck`: exit 0;
- viewer build: exit 0.

Commit `ae775de`, pushed. CI on PR #10: success.

## Phase 5: PR

Rules block re-read at the start.
- **Contradiction 3 settled by the owner:** `docs/eval/protocol.md` decides which models the
  evaluation runs, and `docs/freeze.md` decides code, prompt and settings. One line saying so was
  added at the top of `docs/freeze.md`. No retag: `eval-freeze-2` stays where it is.
- CLAUDE.md: the Super line now follows that ruling. Also added: the protocol pointer, a
  reproduce-stage entry, and the spend figure.
- PR #10 (opened as a draft in Phase 2 so that CI would run) marked ready for review. Not merged.

**Not done or not changed, on purpose:**
- the frozen code, prompt and runner;
- `eval/tasks/`;
- held-out tasks (none created, read or looked for);
- Recall (nothing changed or pushed).

# Build log: held-out results import (decision 050)

Prompt: `docs/prompts/050-results-import.md` (verbatim). Branch `docs/050-heldout-results` off
`origin/main` at `5a504e4` (PR #13 merged). Docs only; no model calls ($0).

- **Step 0:** on main, clean, level with `origin/main`; PR #13's merge is `5a504e4`.
- **Step 2:** both tarballs in `~/Projects/tracehound-heldout/archive/` match the handoff's sha256
  (runs `4baead15…`, results `83458ec1…`).
- **Step 3:** `drive.sh`, `passes.sh`, `rerun.sh`, `aggregate.mjs` and `check.mjs` were not found
  under `~/Projects/TraceHound-eval` or `~/Projects/tracehound-heldout`. No third tarball was made.
- **Step 4:** seven files copied byte-identical into `docs/eval/heldout/`; `b2-super/results.json`
  left out (one row quotes an agent-written scratch test's typecheck error naming a Recall file
  and symbol). Run records and task files stay out.
- **Step 5:** `docs/eval/heldout/recompute.mjs` over the 181 run records reproduces every count in
  the handoff's section 4. Two mean costs differ in the fourth decimal (the handoff rounded up):
  Nano graph-off $0.0202 (exact $0.020249; handoff $0.0203), Super graph-off $0.0478 (exact
  $0.047846; handoff $0.0479). The ledger check was refined: 4,134 lines in the evaluation window,
  4,128 successful calls matching the records and 6 failed requests (the six model timeouts).
- **Step 6:** not done. `TraceHound-eval/docs/prompts/` holds only the frozen tag's prompts, and
  `TraceHound_Handoff_Oct5.md` is not in the briefs folder.
- **Step 7:** decision 050, this entry, CLAUDE.md (049, 050), README rewritten to state the result.
- **Step 8:** draft release `heldout-eval-2026-10-06` with the two tarballs; GitHub's asset digests
  match the sha256 above. Not published.

# Build log: decision 050 follow-up

Prompt: `docs/prompts/050b-followup.md` (verbatim). Branch `docs/050b-followup` off `origin/main`
at `273d842` (PR #14 merged). Docs only; no model calls ($0). No new decision number.

- **Step 0:** on main, clean, level with `origin/main`; PR #14's merge is `273d842`.
- **Step 2:** done. The evaluation prompt was in the appendix of
  `~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct5.md`; the fenced block is copied
  byte-for-byte to `docs/prompts/heldout-eval-run.md`.
- **Step 3:** all five drivers present in `~/Projects/tracehound-heldout/drivers-2026-10-06/`
  (sizes and times in `docs/eval/heldout-results.md`). Key scan, matches not printed: one hit for a
  long-token pattern in `aggregate.mjs`, six lowercase words joined by slashes, not a key; no other
  hits. Packed unchanged (no xattrs, mtimes kept, extract diffed identical) into
  `archive/heldout-eval-drivers-2026-10-06.tar.gz`, sha256 `69798c38…21e8`.
- **Step 4:** from the records: 181 = 160 counted + 5 void originals + 16 Super pass-4; 177 reached
  baseline = 160 + 5 + 12. The six ledger failures map by timestamp to the five void originals and
  the Super pass-4 run on 06 graph-on; the page's "six timeouts that made runs void" was corrected.
  Costs: counted $5.72362 + void originals $0.04732 + pass 4 $0.47886 = record total $6.24980;
  + failed requests $0.01794 = ledger $6.26774.
- **Step 5:** README ("before anything is reported" replaced; no cost wording there), CLAUDE.md
  (cost wording, top line, drivers/prompt status), a dated note under decision 050, this entry.
- **Step 6:** drivers tarball added to the draft release `heldout-eval-2026-10-06`; still a draft.

# Build log: decision 051, finder phase 1 (graph rules → hypotheses, no model)

Prompt: `docs/prompts/051-finder-rules.md` (verbatim). Branch `build/051-finder-rules` off `main`
at `8ed9384` (PR #15 merged). No model calls ($0).

- **Step 0:** on main, clean, level with `origin/main`; PR #15's merge is `8ed9384`.
- **Steps 2–4:** decision 051; `packages/analyzer/src/finder/` and `tracehound find`;
  `test/finder.test.ts` (14 tests on fixtures written for it).
- **Step 5:** one run of `tracehound find` with `configs/recall.tracehound.json` on a temporary
  clone of `SunnyBagal/Recall` at `5d2165a` (no dependencies installed; `~/Projects/Recall` not
  touched). Output in `runs/finder/` (gitignored). Hypotheses per family:
  route-without-auth 1, payload-field-missing 0, request-to-fetch 2.
- **Step 6 (gates, plain shell; the `GIT_` check printed nothing before each):**
  `TRACEHOUND_NETWORK_TESTS=1 pnpm test` exit 0, analyzer 397 passed (34 files, Docker project
  included, 805 s), viewer 97 passed (11 files); `pnpm typecheck` exit 0; viewer build exit 0;
  version guard OK (every repo's latest snapshot is 0.10.0; no bump needed, snapshot output
  unchanged).

# Build log: decision 052, finder phase 2a (hypotheses → reproduce claims, no model)

Prompt: `docs/prompts/052-finder-claims.md` (verbatim). Branch `build/052-finder-claims` off `main`
at `075d645` (PR #16 merged). No model calls ($0); the reproduce stage was not run.

- **Step 0:** `git status --porcelain` empty; fetch, checkout main, fast-forward pull
  `8ed9384..075d645`; on main, clean, HEAD = `origin/main` = `075d645`, PR #16's merge in the log.
- **Steps 2–5:** decision 052; `finder/claims.ts`, `find --claims`; `excerpts` in `ClaimSpec`;
  `test/claim-excerpts.test.ts` (3; its pins were taken before `reproduce.ts` changed and still
  pass after), `test/finder-claims.test.ts` (8).
- **Step 6:** one run of `tracehound find --config configs/recall.tracehound.json --claims
  runs/finder/claims/recall-57d920e --profile configs/recall.profile.json` on a temporary clone of
  `SunnyBagal/Recall` at `57d920e4c93b9185c8dbe7350d98633c4732c78e` (testable-baseline; no
  dependencies installed; `~/Projects/Recall` not touched; clone deleted afterwards). Hypotheses
  per family: route-without-auth 1, payload-field-missing 0, request-to-fetch 1. Claim files
  written: 4 (2 Form A, 2 Form B); all 4 load with `loadClaim` (baseSha `57d920e…`, profile
  `recall`). Hypothesis and claim text were not opened.

- **Step 7 (gates, plain shell; the `GIT_` check printed nothing before each):**
  `TRACEHOUND_NETWORK_TESTS=1 pnpm test` exit 0, analyzer 408 passed (36 files, Docker project
  included, 856 s), viewer 97 passed (11 files); `pnpm typecheck` exit 0; viewer build exit 0;
  version guard OK (every repo's latest snapshot is 0.10.0; snapshot output unchanged, no bump).
