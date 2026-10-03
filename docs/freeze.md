# Evaluation freeze

Frozen on 2026-10-04 at the commit tagged **`eval-freeze-2`** (branch `build/agent-v6`, PR #9;
prompts `docs/prompts/agent-v6.md` and `docs/prompts/agent-v6-amendment-1.md`, decision 047,
`docs/build-log.md`). Nothing below changes until the evaluation is over. A change to any item
means a new freeze with a new tag.

**`eval-freeze` (agent-v5, 2026-10-03, PR #8) is superseded.** Its tag stays where it is, for
reproducing agent-v5 runs; it is not the evaluation's freeze. What changed since then: the agent
loop (agent-v5 → agent-v6: the `str_replace_editor` alias and the edit retry for trailing
whitespace and line endings), the run record (`faultFileRead`, `limits`), the runner (end reason,
failed edits, unknown-tool calls, time to fault file, baseline tests and the baseline-anomaly flag,
`--model`, `--cost-limit-usd`) and the test config (Docker test files one at a time). The prompt
file, the model settings, the sandbox, the verification gates and the tasks are unchanged.

## Versions

| Item | Frozen value | Where |
|---|---|---|
| Analyzer | `0.10.0` | `packages/analyzer/src/version.ts` (`ANALYZER_VERSION`) |
| Graph snapshot (Recall `57d920e`) | `eval/snapshots/57d920e4c93b9185c8dbe7350d98633c4732c78e/0.10.0.json`, sha256 `cafd869c2650f4f156cf1c377d5ad1f79addf0c2aad75d9fbac18d545bd43de5` | named by each task's `snapshot`; recorded per graph-on run |
| Agent | **`agent-v6`** (`LOOP_VERSION`), the `nemotron` agent (`RepairLoopAgent`) | `packages/analyzer/src/harness/loop.ts`, decision 047 |
| Decider for the injected packet and the `context_packet` tool | `lexical` (default; `decider-v1` is the frozen nemotron decider, not used by default) | `--decider`, `src/agent/decider.ts` |
| Evaluation runner | `packages/analyzer/src/harness/evaluate.ts` (decisions 046, 047), concurrency 1, nothing else running on the machine during a batch | — |
| Sandbox image | `tracehound-sandbox:bun1.4.2-ts5.9.3-2`, image id `sha256:857f16d26f2573f1a42e90e35242f773ddb82caa4802aa5d93bbcfedd7d77eed` (as built locally and recorded in the agent-v6 dev runs) | `harness/sandbox.Dockerfile` (sha256 `a4680f25dc8374b93afd676bedf7af8ac5dfc2d787b63c8ba274ec0aa6b3f3d8`, digest-pinned bases `oven/bun:1.4.2@sha256:9114c058…`, `buildpack-deps:bookworm-scm@sha256:b42f74a5…`) |
| Sandbox provider | `docker-provider@2`, local Docker (engine 29.8.0 in the dev runs); uid 1000, caps dropped, 2 GB / 2 CPUs / 512 pids, network off after setup and proven off | `src/harness/docker.ts`, decision 036 |

## Prompt files (sha256 of the file bytes)

| File | sha256 | Role |
|---|---|---|
| `harness/prompts/agent-v5.md` | `556861d40ba86940a72c05d15b08cf07eea15a6d8a5508c6c7d3d352b92222b6` | **the frozen prompt**, used by agent-v6 byte-identical (round 1 of decision 045) |
| `harness/prompts/agent-v4.md` | `2b2c3215b4a1f2ffb1811013ddf717b531e8eea741a3534024d2b13fd5b00aca` | kept, not used |
| `harness/prompts/agent-v3.md` | `77b1ca717dbd58efb45ed74b410b536cd66a1bc2a415690e50dae591f6147577` | kept, not used |
| `harness/prompts/agent-v2.md` | `a024e1289c9bc04bce45833bdd9e5b20f89163a627c54ed7dea057ab0546927d` | kept, not used |
| `harness/prompts/agent-v1.md` | `d2223f17c7193b77b7f2eaed8f609ae20fe7d7b9875cc6260054b34e453ef42c` | kept, not used |

Each run record carries `loopVersion` (`agent-v6`), `promptFile` (`agent-v5.md`), `promptSha256`
(the file) and `renderedPromptSha256` (with the task's test commands filled in and the `GRAPH:`
lines kept or dropped by arm).

## Agent tools (agent-v6, decision 047)

| Item | Frozen behaviour |
|---|---|
| Tools offered | repo tools `list_dir`, `read_file`, `search`, `edit_file`, `write_file`, `run`, `finish`; graph on adds `context_packet`, `search_components`, `get_neighbors`, `get_edge_evidence`, `get_related_tests` |
| `str_replace_editor` | never offered; accepted as an alias for exactly the eight argument shapes in decision 047 (→ `read_file`, `list_dir`, `edit_file`); any other shape or unknown tool gets the one-line `error: unknown tool "<name>". Available: <names>` |
| `edit_file` matching | exact once → applied; exact more than once → error; else trailing whitespace and line endings ignored, exactly one location → applied; else indentation and trailing spaces ignored (agent-v2), exactly one → applied; else an error with the closest region of the current text, line-numbered, at most 40 lines |
| Loop guards (agent-v3/v4, unchanged) | repeat guard (3rd identical call on an unchanged repo refused), stuck stop after 3 refused calls in a row, one no-edit nudge at step 15, empty-finish confirmation, tool output cap 4,000 chars (head 2,000 + tail 1,500), /scratch outside the repo, base-file edit accounting |

## Model and settings

| Setting | Value |
|---|---|
| Model (the evaluation) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (Nemotron Nano, Nebius Token Factory), the default; through `src/llm/client.ts` (cache reads off for repair runs, budget caps, ledger) |
| Other model | `nvidia/nemotron-3-super-120b-a12b` (Nemotron Super) only when named with `--model`; probed on the dev tasks (build log, agent-v6 Phase 4), not the evaluation's model |
| Reasoning | on: `chat_template_kwargs.enable_thinking: true` |
| Temperature | 0 |
| `max_tokens` per call | 4096 |
| `tool_choice` | `"auto"` |
| Arms | graph-on: the context packet (`tracehound context` text, default budget 2,000 estimated tokens) in the first user message, the graph tools, two `GRAPH:` prompt lines. graph-off: none of these. Same budgets |
| Price table | `config/prices.json` (sha256 `4d75d87624024be894e47dfe1e30a5da894b62f030dfc5b93ddf228d629839ab`): Nano $0.06 / $0.24, Super $0.30 / $0.90 per 1M input / output tokens, from third-party trackers, not verified in the Nebius console |
| Spend caps | `TRACEHOUND_BUDGET_RUN_USD` = 1 (per process, so per run under the runner), `TRACEHOUND_BUDGET_TOTAL_USD` = 45 |

### Per-model limits per run

| Model | Steps | Tokens | Wall clock | Command timeout | Cost limit per run | How it is set |
|---|---|---|---|---|---|---|
| Nano (default) | 40 | 300,000 | 900 s | 300 s | **$0.10** | the task's `limits` (`task.json`), unchanged |
| Super | 40 | 300,000 | 900 s | 300 s | **$0.60** | the task's limits with `--cost-limit-usd 0.6` (runner and `tracehound repair`), so the step and token limits are what bind; the record's `limits` shows it |

In the Super probe no run reached the cost limit (most expensive run $0.10090).

## Verification on Recall

| Item | Frozen value |
|---|---|
| Repo | `SunnyBagal/Recall`, branch `testable-baseline`, commit `57d920e4c93b9185c8dbe7350d98633c4732c78e`, backend `recall-backend/` |
| Profile | `configs/recall.profile.json` (sha256 `82214604503b72f2c3ae00cafef3d1827fe0c26b5e75e8a2af1177edc336c514`): install `bun install --frozen-lockfile`, test `bun test`, typecheck `$TSC --noEmit`, test report JUnit |
| Regression gate granularity | **per test** (decision 043): `comparison.granularity` is `"test"`. bun's JUnit report; at the base commit, and at every seeded dev base, 62 tests, keyed by file + full name. UNRESOLVED if any test that passed at baseline fails, is skipped or is missing after the patch, or if the suite exited 0 at baseline and no longer does |
| Typecheck gate | baseline-matched (decision 041): the repo's own tsc (5.9.3, run with bun); only errors not in the baseline (file + TS code + message) fail; Recall has 5 at baseline |
| Reproduction | the task's `repro.test.ts`, copied in only while reproducing and verifying, must fail at the seeded base and pass after the patch; agent-added test files are removed before verification (decision 034) |
| Baseline validity | the runner reports baseline tests passed / total per run and flags `baselineAnomaly` when a run's passed-count is not the most common one for its task in the batch (amendment 1); a flag only, the verdict is unchanged. All 24 agent-v6 dev runs: 62 / 62, no flag |
| Known weakness | under CPU/memory load Recall's own tests can time out and a correct patch can come out UNRESOLVED (decision 045): run evaluations with concurrency 1 and nothing else on the machine. The Docker test files run one at a time (`packages/analyzer/vitest.config.ts`); the cause of the earlier red gates is unproven (decision 047) |

## Tasks

- Dev tasks (tuned on, never evaluation results): `eval/tasks/recall-dev-short-summary`,
  `recall-dev-search-description`, `recall-dev-session-expiry`, `recall-dev-chat-recent`
  (decision 044). Task limits: 40 steps, 300,000 tokens, 900 s, command timeout 300 s, $0.10.
- Smoke tasks (`recall-smoke-*`, `toy-*`) check the harness only.
- Held-out evaluation tasks are not in this repo and were not created, read or looked for here.
