# Evaluation freeze

Frozen on 2026-10-03 at the commit tagged **`eval-freeze`** (branch `build/to-freeze`, PR #8;
prompt `docs/prompts/build-to-freeze.md`, decisions 044–046, `docs/build-log.md`). Nothing below
changes until the evaluation is over. A change to any item means a new freeze with a new tag.

## Versions

| Item | Frozen value | Where |
|---|---|---|
| Analyzer | `0.10.0` | `packages/analyzer/src/version.ts` (`ANALYZER_VERSION`) |
| Graph snapshot (Recall `57d920e`) | `eval/snapshots/57d920e4c93b9185c8dbe7350d98633c4732c78e/0.10.0.json`, sha256 `cafd869c2650f4f156cf1c377d5ad1f79addf0c2aad75d9fbac18d545bd43de5` | named by each task's `snapshot`; recorded per graph-on run |
| Agent | `agent-v5` (`LOOP_VERSION`), the `nemotron` agent (`RepairLoopAgent`) | `packages/analyzer/src/harness/loop.ts` |
| Decider for the injected packet and the `context_packet` tool | `lexical` (default; `decider-v1` is the frozen nemotron decider, not used by default) | `--decider`, `src/agent/decider.ts` |
| Evaluation runner | `packages/analyzer/src/harness/evaluate.ts` (decision 046), concurrency 1 | — |
| Sandbox image | `tracehound-sandbox:bun1.4.2-ts5.9.3-2`, image id `sha256:857f16d26f2573f1a42e90e35242f773ddb82caa4802aa5d93bbcfedd7d77eed` (as built locally and recorded in the dev runs) | `harness/sandbox.Dockerfile` (sha256 `a4680f25dc8374b93afd676bedf7af8ac5dfc2d787b63c8ba274ec0aa6b3f3d8`, digest-pinned bases `oven/bun:1.4.2@sha256:9114c058…`, `buildpack-deps:bookworm-scm@sha256:b42f74a5…`) |
| Sandbox provider | `docker-provider@2`, local Docker (engine 29.8.0 in the dev runs); uid 1000, caps dropped, 2 GB / 2 CPUs / 512 pids, network off after setup and proven off | `src/harness/docker.ts`, decision 036 |

## Prompt files (sha256 of the file bytes)

| File | sha256 | Role |
|---|---|---|
| `harness/prompts/agent-v5.md` | `556861d40ba86940a72c05d15b08cf07eea15a6d8a5508c6c7d3d352b92222b6` | **the frozen prompt** (round 1 of decision 045) |
| `harness/prompts/agent-v4.md` | `2b2c3215b4a1f2ffb1811013ddf717b531e8eea741a3534024d2b13fd5b00aca` | kept, not used |
| `harness/prompts/agent-v3.md` | `77b1ca717dbd58efb45ed74b410b536cd66a1bc2a415690e50dae591f6147577` | kept, not used |
| `harness/prompts/agent-v2.md` | `a024e1289c9bc04bce45833bdd9e5b20f89163a627c54ed7dea057ab0546927d` | kept, not used |
| `harness/prompts/agent-v1.md` | `d2223f17c7193b77b7f2eaed8f609ae20fe7d7b9875cc6260054b34e453ef42c` | kept, not used |

Each run record also carries `promptSha256` (the file) and `renderedPromptSha256` (with the
task's test commands filled in and the `GRAPH:` lines kept or dropped by arm).

## Model and settings

| Setting | Value |
|---|---|
| Model | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (Nemotron Nano, Nebius Token Factory), through `src/llm/client.ts` (cache reads off for repair runs, budget caps, ledger) |
| Reasoning | on: `chat_template_kwargs.enable_thinking: true` |
| Temperature | 0 |
| `max_tokens` per call | 4096 |
| Tools | `tool_choice: "auto"`; repo tools `list_dir`, `read_file`, `search`, `edit_file`, `write_file`, `run`, `finish`; graph on adds `context_packet`, `search_components`, `get_neighbors`, `get_edge_evidence`, `get_related_tests` |
| Arms | graph-on: the context packet (`tracehound context` text, default budget 2,000 estimated tokens) in the first user message, the graph tools, two `GRAPH:` prompt lines. graph-off: none of these. Same budgets |
| Loop guards (agent-v3/v4, unchanged) | repeat guard (3rd identical call on an unchanged repo refused), stuck stop after 3 refused calls in a row, one no-edit nudge at step 15, empty-finish confirmation, tool output cap 4,000 chars (head 2,000 + tail 1,500), /scratch outside the repo, base-file edit accounting |
| Price table | `config/prices.json` (sha256 `4d75d87624024be894e47dfe1e30a5da894b62f030dfc5b93ddf228d629839ab`): Nano $0.06 / $0.24 per 1M input / output tokens, from third-party trackers, not verified in the Nebius console |
| Spend caps | `TRACEHOUND_BUDGET_RUN_USD` = 1 (per process, so per run under the runner), `TRACEHOUND_BUDGET_TOTAL_USD` = 45; per task `limits.costUSD` |

## Verification on Recall

| Item | Frozen value |
|---|---|
| Repo | `SunnyBagal/Recall`, branch `testable-baseline`, commit `57d920e4c93b9185c8dbe7350d98633c4732c78e`, backend `recall-backend/` |
| Profile | `configs/recall.profile.json` (sha256 `82214604503b72f2c3ae00cafef3d1827fe0c26b5e75e8a2af1177edc336c514`): install `bun install --frozen-lockfile`, test `bun test`, typecheck `$TSC --noEmit`, test report JUnit |
| Regression gate granularity | **per test** (decision 043): `comparison.granularity` is `"test"`. bun's JUnit report; at the base commit, and at every seeded dev base, 62 tests, keyed by file + full name. UNRESOLVED if any test that passed at baseline fails, is skipped or is missing after the patch, or if the suite exited 0 at baseline and no longer does |
| Typecheck gate | baseline-matched (decision 041): the repo's own tsc (5.9.3, run with bun); only errors not in the baseline (file + TS code + message) fail; Recall has 5 at baseline |
| Reproduction | the task's `repro.test.ts`, copied in only while reproducing and verifying, must fail at the seeded base and pass after the patch; agent-added test files are removed before verification (decision 034) |
| Known weakness | under CPU/memory load Recall's own tests can time out and a correct patch can come out UNRESOLVED (decision 045, finding): run evaluations with concurrency 1 |

## Tasks

- Dev tasks (tuned on, never evaluation results): `eval/tasks/recall-dev-short-summary`,
  `recall-dev-search-description`, `recall-dev-session-expiry`, `recall-dev-chat-recent`
  (decision 044). Task limits: 40 steps, 300,000 tokens, 900 s, command timeout 300 s, $0.10.
- Smoke tasks (`recall-smoke-*`, `toy-*`) check the harness only.
- Held-out evaluation tasks are not in this repo and were not created, read or looked for here.
