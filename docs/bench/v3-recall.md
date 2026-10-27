# recall-v3 on dev: result (decision 070)

Plan: `docs/bench/v3-recall-plan.md`. P009's rules are copied verbatim. The plan's builder details (lens prompt shas
`0a1a29c9…` / `804e9552…`, knobs) were pushed in `2f9d3cf` at 2026-10-23T21:09:05Z, before the first v3 model
call (the reasoning probe, 21:09:28Z). The probe result was pushed in `8ffc2a6` (21:13:39Z), before arm S started (21:13:42Z).
Dev only: the 40 dev pull requests. Cal.com, `test/` and ReviewBench data were not read, run or scored. Tables come from
`node scripts/bench/v3-results.ts`, which reads only the records and the judges' summaries/matches and prints counts.

**Verdict: neither arm qualifies, so v3 stops here (P009 "Dev selection"), and the P008 winner gets the final.**
Arm S: v1 precision 14.0 against a floor of 20.0. Arm V: 20.9 against 38.0. Arm V raises recall over 3.5's
pool-raw dev mean (63.5 vs 61.5); arm S does not (50.0 vs 52.7). Both pay with precision far below the floor.
There is no ReviewBench image, smoke run or portal run for v3.

Runs: arm S 2026-10-23T21:13:42Z–22:50:33Z, arm V 22:51:17Z–2026-10-24T00:18:47Z, one run each, reviewer cache
reads off, one pull request at a time. Records are in `~/Projects/tracehound-bench/reviews/dev-v3/<arm>/` (outside the repo).

Stop rule before arm V: arm S had 1 pull request with 0 findings (not more than 10). It had no HTTP 4xx/5xx and no global
budget refusal (ledger: 0 calls with `ok: false` in the whole job). The runner's status file listed 15 "request errors"
for arm S, counted per failure string (9 lens calls plus the missed passes of 6 pull requests), but every one of them is recall-v3's own pre-registered per-pull-request cap ($0.12, P009 8): the
string `per-pull-request budget $0.12 reached`, on 6 pull requests. They were flagged because the runner's filter matched the
`TRACEHOUND_BUDGET_RUN_USD` name inside that message. The builder read the rule's "budget refusal" as the client's
global/run cap, not the pipeline's own cap, and continued to arm V. **This is the builder's reading, disclosed here.**
It did not change the outcome: neither arm qualifies.

Reasoning: Token Factory honoured no reasoning token budget for either model (plan, probe table), so both arms used
P009's fallback: max_tokens 16,000, one retry with reasoning off on `finish_reason=length`. "Truncated" below
counts lens replies cut at 16,000 tokens. Most retries after a cut still failed with invalid JSON (see "lens failure").

## pool-raw dev baselines (recomputed from the run records)

### 3 Super, bench-judge-v1

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| run 1 | 243 | 38 | 117 | 36 | 24.5 | 51.4 | 33.2 |
| run 2r | 146 | 36 | 84 | 38 | 30.0 | 48.6 | 37.1 |
| run 4 | 159 | 43 | 83 | 31 | 34.1 | 58.1 | 43.0 |
| run 5 | 151 | 42 | 83 | 32 | 33.6 | 56.8 | 42.2 |
| run 6 | 163 | 36 | 94 | 38 | 27.7 | 48.6 | 35.3 |
| **mean of 5** | | | | | 30.0 | 52.7 | 38.2 |

### 3 Super, bench-judge-x1

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| run 1 | not scored by this judge | | | | | | |
| run 2r | 146 | 41 | 81 | 33 | 33.6 | 55.4 | 41.8 |
| run 4 | 159 | 51 | 75 | 23 | 40.5 | 68.9 | 51.0 |
| run 5 | 151 | 49 | 74 | 25 | 39.8 | 66.2 | 49.7 |
| run 6 | 163 | 50 | 67 | 24 | 42.7 | 67.6 | 52.4 |
| **mean of 4** | | | | | 39.2 | 64.5 | 48.7 |

### 3.5 Super, bench-judge-v1

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| run 7r | 116 | 45 | 53 | 29 | 45.9 | 60.8 | 52.3 |
| run 8 | 117 | 46 | 46 | 28 | 50.0 | 62.2 | 55.4 |
| **mean of 2** | | | | | 48.0 | 61.5 | 53.9 |

### 3.5 Super, bench-judge-x1

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| run 7r | 116 | 45 | 49 | 29 | 47.9 | 60.8 | 53.6 |
| run 8 | 117 | 47 | 46 | 27 | 50.5 | 63.5 | 56.3 |
| **mean of 2** | | | | | 49.2 | 62.2 | 54.9 |

## arm S (nvidia/nemotron-3-super-120b-a12b)

### bench-judge-v1 (JUDGE_FAILED 0)

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| all | 313 | 37 | 228 | 37 | 14.0 | 50.0 | 21.8 |
| without missed | 279 | 29 | 207 | 45 | 12.3 | 39.2 | 18.7 |
| without lens B | 194 | 24 | 144 | 50 | 14.3 | 32.4 | 19.8 |
| lens A only | 160 | 16 | 123 | 58 | 11.5 | 21.6 | 15.0 |

### bench-judge-x1 (JUDGE_FAILED 0)

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| all | 313 | 42 | 216 | 32 | 16.3 | 56.8 | 25.3 |
| without missed | 279 | 32 | 198 | 42 | 13.9 | 43.2 | 21.1 |
| without lens B | 194 | 31 | 135 | 43 | 18.7 | 41.9 | 25.8 |
| lens A only | 160 | 20 | 117 | 54 | 14.6 | 27.0 | 19.0 |

- pull requests 40; findings 313 (lens A 160, lens B 119, missed 34); per PR median 6, max 60; PRs with 0 findings 1; capped at 60 1
- lens calls 124 (counts per lens call): OK 94, FAILED 30, SKIPPED 0; truncated replies 27 (calls with one 27); retries 38
  - lens failure ×21: the reply is not valid JSON
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0190 would bring this run to $0.1326, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0189 would bring this run to $0.1331, over TRACEHOUND
  - lens failure ×3: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0189 would bring this run to $0.1330, over TRACEHOUND
  - lens failure ×2: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0186 would bring this run to $0.1328, over TRACEHOUND
  - lens failure ×2: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0188 would bring this run to $0.1330, over TRACEHOUND
- missed pass (one per pull request; counts per pull request): OK 35, FAILED 5, SKIPPED 0; chunks failed 12 (per chunk); the 6 failure strings below include 1 pull request whose pass was OK with failed chunks
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0399 would bring this run to $0.1480, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0397 would bring this run to $0.1289, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0368 would bring this run to $0.1258, ov
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0396 would bring this run to $0.1232, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0384 would bring this run to $0.1252, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0347 would bring this run to $0.1213, over TRACEHOUND_BUDGET_RUN_USD=0.12)
- skipped files 10 ({"deleted":3,"chunk-cap":1,"no-hunks":3,"lockfile":2,"generated":1}); chunks 62; per-PR budget refusals (per refused request) 21 on 6 PRs; guard hit 0; errors 0
- cost per PR median $0.0499, mean $0.0552, max $0.1081, total $2.2095; seconds per PR median 132, max 361
- ReviewBench final estimate: mean $36.29 (median $32.78) for 657 PRs

## arm V (nvidia/Nemotron-3.5-Super-VL)

### bench-judge-v1 (JUDGE_FAILED 0)

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| all | 271 | 47 | 178 | 27 | 20.9 | 63.5 | 31.4 |
| without missed | 254 | 40 | 169 | 34 | 19.1 | 54.1 | 28.3 |
| without lens B | 141 | 35 | 90 | 39 | 28.0 | 47.3 | 35.2 |
| lens A only | 124 | 28 | 81 | 46 | 25.7 | 37.8 | 30.6 |

### bench-judge-x1 (JUDGE_FAILED 0)

| row | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|
| all | 271 | 53 | 149 | 21 | 26.2 | 71.6 | 38.4 |
| without missed | 254 | 45 | 142 | 29 | 24.1 | 60.8 | 34.5 |
| without lens B | 141 | 39 | 74 | 35 | 34.5 | 52.7 | 41.7 |
| lens A only | 124 | 31 | 67 | 43 | 31.6 | 41.9 | 36.0 |

- pull requests 40; findings 271 (lens A 124, lens B 130, missed 17); per PR median 6, max 18; PRs with 0 findings 1; capped at 60 0
- lens calls 124 (counts per lens call): OK 79, FAILED 45, SKIPPED 0; truncated replies 38 (calls with one 38); retries 43
  - lens failure ×29: the reply is not valid JSON
  - lens failure ×2: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0190 would bring this run to $0.1316, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0190 would bring this run to $0.1310, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0190 would bring this run to $0.1232, over TRACEHOUND
  - lens failure ×4: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0189 would bring this run to $0.1315, over TRACEHOUND
  - lens failure ×2: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0186 would bring this run to $0.1312, over TRACEHOUND
  - lens failure ×2: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0188 would bring this run to $0.1314, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0178 would bring this run to $0.1206, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0177 would bring this run to $0.1210, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0174 would bring this run to $0.1313, over TRACEHOUND
  - lens failure ×1: request failed: PrBudgetError: per-pull-request budget $0.12 reached (refusing review-recall: estimated $0.0185 would bring this run to $0.1279, over TRACEHOUND
- missed pass (one per pull request; counts per pull request): OK 18, FAILED 22, SKIPPED 0; chunks failed 30 (per chunk); the 23 failure strings below include 1 pull request whose pass was OK with failed chunks
  - missed failure ×12: the reply is not valid JSON; after one retry: the reply is not valid JSON
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0399 would bring this run to $0.1441, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0398 would bring this run to $0.1217, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0342 would bring this run to $0.1213, ov
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0388 would bring this run to $0.1488, ov
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0369 would bring this run to $0.1362, ov
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0369 would bring this run to $0.1288, ov
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0391 would bring this run to $0.1220, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0386 would bring this run to $0.1260, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0397 would bring this run to $0.1247, over TRACEHOUND_BUDGET_RUN_USD=0.12)
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0370 would bring this run to $0.1371, ov
  - missed failure ×1: the reply is not valid JSON; retry request failed: per-pull-request budget $0.12 reached (refusing review: estimated $0.0359 would bring this run to $0.1251, ov
- skipped files 10 ({"deleted":3,"chunk-cap":1,"no-hunks":3,"lockfile":2,"generated":1}); chunks 62; per-PR budget refusals (per refused request) 34 on 11 PRs; guard hit 0; errors 0
- cost per PR median $0.0931, mean $0.0833, max $0.1178, total $3.3303; seconds per PR median 134, max 206
- ReviewBench final estimate: mean $54.70 (median $61.15) for 657 PRs

## P009 dev selection

- arm S: v1 precision 14.0 vs floor 20.0 (pool-raw mean 30.0 − 10.0) → does not qualify; v1 recall 50.0; cost per PR mean $0.0552
- arm V: v1 precision 20.9 vs floor 38.0 (pool-raw mean 48.0 − 10.0) → does not qualify; v1 recall 63.5; cost per PR mean $0.0833
- pick: none qualifies → v3 stops here; the P008 winner gets the final

## Notes (builder; opinions labelled)

- Judges: bench-judge-v1 is the scorer of record, and x1 is shown alongside it. Neither judge put either arm's F at its model's pool-raw mean.
- The ablation rows are recomputed from the judge's per-comment matches with the scorer's own `scorePull` on
  the comments left. There is no new judge call, so a removed comment's duplicate can become the TP. The "all" rows equal the judges' summaries (checked by the script).
- Per-PR cap refusals (per refused request): S 21 on 6 PRs, V 34 on 11 PRs. They are mostly lens calls on multi-chunk pull requests and the
  missed pass, whose worst-case reservation (32,000 max_tokens) is about $0.04.
- Invalid JSON: S 21 and V 29 lens calls failed after their retry; the 3.5 missed pass failed on 12 PRs with invalid JSON
  after one retry (the same failure dev-3.5 reported).
- Opinion: lens B adds recall but costs precision on both models (V: without lens B P 28.0 / R 47.3 / F 35.2,
  against P 20.9 / R 63.5 / F 31.4). Even V's lens A alone (P 25.7) is under V's floor.
- Measured ReviewBench final cost (cost per PR × 657): S $36.29 (mean) / $32.78 (median); V $54.70 / $61.15.
  This replaces R16's unmeasured ~$33. Not run, because neither arm qualifies.

## Known defects (found by Bugbot on PR #62, not fixed: v3 never runs again)

1. The wall-clock guard drops lens findings already completed, so a guarded review is empty
   (`packages/analyzer/src/review/recall/run.ts` ~l. 299). The guard was hit 0 times in both arms, so
   this had no dev impact.
2. Lens findings are collected in completion order, so the dedup survivors and the 60-finding cap
   depend on timing (~l. 257–260). Small dev impact: the cap was hit on 1 arm-S pull request.
