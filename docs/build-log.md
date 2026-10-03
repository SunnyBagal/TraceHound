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
