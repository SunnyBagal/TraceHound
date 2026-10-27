# Nemotron 3 Ultra on dev via the NVIDIA API: result (decision 071, report only)

Plan: `docs/bench/dev-ultra-plan.md`, committed in `cb58934` and pushed at 2026-10-24T06:19:48Z; the
first Ultra call (the probe) was sent at 06:19:54Z. Dev only: Cal.com was not opened, run or scored.
Script: `node scripts/bench/dev-ultra.ts` (no model call); the numbers below are from its output on both
runs, `runs/071-report-final-2.txt`. Run 10 was first reported alone, before run 11 had finished.
**Nothing is adopted.**

**Plain answer:** no. On two runs Ultra's pool-verify-v1 v1 mean F is 47.1, against 42.3 (3 Super, 5
runs) and 50.4 (3.5 Super, 2 runs); there is no interval-backed difference from either. The only
interval that excludes 0 is pool-raw under v1: there **Ultra is worse than 3.5 Super** (−10.2 points,
[−17.7, −3.2]). Every other comparison, under v1 and x1, shows no interval-backed difference. Ultra
comments more (143–146 kept against 79–107) with higher recall and lower precision. Its two runs differ:
pool-verify-v1 v1 F 42.3 on run 10 and 51.9 on run 11.

## Probe and smoke

- Probe (one call through the client, reasoning on, `max_tokens` 2,000): HTTP 200, `finish_reason`
  stop, 23 prompt / 16 completion tokens, 1.3 s. `usage` reports no reasoning tokens; the reply
  carried 53 characters of reasoning.
- Smoke (sentry/0, grafana/0, keycloak/0 through run 10's pipeline, no judge): 1 of 3 pull requests
  had a failed chunk (keycloak/0 diff#0, `request failed: The operation was aborted due to timeout`,
  the 300 s client timeout, not an HTTP error); 0 4xx, 0 429, 0 `finish_reason: length`; kept
  findings 6 / 5 / 1. No stop rule fired.

## P / R / F per run and mean, against the baselines

n = 74 golden comments per run, 0 JUDGE_FAILED. Baselines are the plan's means (3 Super runs 1, 2r, 4,
5, 6; 3.5 Super runs 7r, 8), recomputed from the records: 42.28, 50.36, 38.16, 53.87 (all within 0.1 of
the stated values). Per-run baseline rows are in `docs/bench/dev-3.5.md` and `docs/bench/v3-recall.md`.

| row | judge | 3 Super mean (5) P / R / F | 3.5 Super mean (2) P / R / F | Ultra run 10 P / R / F | Ultra run 11 P / R / F | Ultra mean (2) P / R / F |
|---|---|---|---|---|---|---|
| pool-verify-v1 | v1 (record) | 40.5 / 44.3 / 42.3 | 54.8 / 46.6 / 50.4 | 34.8 / 54.1 / 42.3 | 43.2 / 64.9 / 51.9 | 39.0 / 59.5 / 47.1 |
| pool-verify-v1 | x1 | 50.9 / 51.9 / 51.3 | 60.5 / 50.7 / 55.1 | 45.9 / 67.6 / 54.6 | 47.1 / 66.2 / 55.1 | 46.5 / 66.9 / 54.9 |
| pool-raw | v1 (record) | 30.0 / 52.7 / 38.2 | 48.0 / 61.5 / 53.9 | 31.2 / 64.9 / 42.1 | 34.3 / 66.2 / 45.2 | 32.7 / 65.5 / 43.6 |
| pool-raw | x1 | 37.3 / 63.8 / 47.0 | 49.2 / 62.2 / 54.9 | 39.0 / 77.0 / 51.8 | 40.0 / 70.3 / 51.0 | 39.5 / 73.6 / 51.4 |

Ultra counts (comments, TP / FP / FN):

| row | judge | run 10 | run 11 |
|---|---|---|---|
| pool-verify-v1 | v1 | 146 (40 / 75 / 34) | 143 (48 / 63 / 26) |
| pool-verify-v1 | x1 | 146 (50 / 59 / 24) | 143 (49 / 55 / 25) |
| pool-raw | v1 | 192 (48 / 106 / 26) | 182 (49 / 94 / 25) |
| pool-raw | x1 | 192 (57 / 89 / 17) | 182 (52 / 78 / 22) |

Run 10's review-diff-v1 row (not a planned row): v1 F 45.4, x1 53.8. Run 11's (`runs/071-dev11.log`): v1 F
47.1, x1 51.9.

## Paired bootstrap (10,000 resamples, seed 71, 40 pull requests, Ultra runs 10 and 11)

Each resample draws the 40 pull requests with replacement; on it, each side is the mean of its runs'
per-run F on the drawn pull requests (the baseline side averages its 5 or 2 runs, the Ultra side its 2),
and the difference is Ultra minus baseline. The interval is the 2.5th and 97.5th percentiles.

| row | judge | comparison | mean F difference | 95% interval | below 0 | interval excludes 0 |
|---|---|---|---|---|---|---|
| pool-verify-v1 | v1 | Ultra − 3.5 Super | −3.3 | [−12.8, +6.8] | 74.4% | no |
| pool-verify-v1 | v1 | Ultra − 3 Super | +4.8 | [−2.0, +12.0] | 8.6% | no |
| pool-verify-v1 | x1 | Ultra − 3.5 Super | −0.3 | [−9.6, +9.5] | 52.5% | no |
| pool-verify-v1 | x1 | Ultra − 3 Super | +3.6 | [−3.1, +10.2] | 14.7% | no |
| pool-raw | v1 | Ultra − 3.5 Super | **−10.2** | **[−17.7, −3.2]** | 99.8% | **yes, below 0** |
| pool-raw | v1 | Ultra − 3 Super | +5.5 | [−0.8, +12.1] | 4.3% | no |
| pool-raw | x1 | Ultra − 3.5 Super | −3.5 | [−12.8, +5.6] | 78.2% | no |
| pool-raw | x1 | Ultra − 3 Super | +4.4 | [−2.1, +10.7] | 9.3% | no |

The bootstrap resamples pull requests, not runs: run-to-run spread enters only through the runs
averaged on each side (12.4 F points across the five 3 Super runs).

## Operations

From the report (`dev-ultra.ts` with calls without reported usage counted apart from truncations, as
changed in `0dec002`, and verifier truncations counted since 071b). "At max_tokens" is reviewer calls at
32,000; "verifier at max_tokens" is verify-ctx calls at 16,000.

| model | run | PRs with a failed chunk | failed chunks | VERIFY_FAILED | calls (ledger) | at max_tokens | verifier at max_tokens | wall s median | wall s max |
|---|---|---|---|---|---|---|---|---|---|
| 3 Super | 2r | 1 | 1 | 0 | 249 | 6 | 0 | 86 | 777 |
| 3 Super | 4 | 0 | 0 | 0 | 260 | 2 | 0 | 96 | 496 |
| 3 Super | 5 | 0 | 0 | 0 | 252 | 3 | 0 | 100 | 700 |
| 3 Super | 6 | 0 | 0 | 0 | 276 | 5 | 0 | 108 | 805 |
| 3.5 Super | 7r | 7 | 8 | 1 | 244 | 31 | 0 | 121 | 766 |
| 3.5 Super | 8 | 7 | 8 | 0 | 236 | 25 | 1 | 130 | 657 |
| Ultra | 10 | 0 | 0 | 0 | 306 | 0 | 0 | 233 | 1066 |
| Ultra | 11 | 1 | 1 | 0 | 304 | 0 | 0 | 252 | 1475 |

(The run-10-only version of this doc gave 3.5 Super run 7r 32 calls at max_tokens; the report gives 31.)

- **Ultra run 10:** 06:37:14Z → 09:51:33Z (3 h 14 min). 306 NVIDIA API requests, 0 HTTP 429. 306
  ledgered Ultra calls, 3 failed without reported usage (the 300 s timeout). 3 pull requests were rerun
  under the rule (`runs/071-dev10.log`; the run-10-only doc said 2), none still failing after the rerun.
- **Ultra run 11:** 09:52:04Z → 14:08:05Z (4 h 16 min). 361 NVIDIA API requests, **57 HTTP 429**
  (each waited out and resent; run 10 had 0). 304 ledgered Ultra calls, 5 failed without reported usage
  (timeout, network error or 5xx). 4 pull requests were rerun under the rule (`runs/071-dev11.log`), 1
  still had a failed request after the rerun: 1 failed chunk, `request failed: HTTP 500: Internal error
  while making inference request`. 0 VERIFY_FAILED, 0 reviewer and 0 verifier calls at max_tokens.
- **Tokens per pull request** (pipeline, every attempt): Ultra over both runs (n = 80) input median
  48,316, output median 14,151 / mean 17,465 (run 10 alone: 50,158 / 15,536 / 17,215), against 3 Super
  (runs 2r, 4, 5, 6; n = 160) 41,287 / 20,025 / 27,250 and 3.5 Super (runs 7r, 8; n = 80) 49,357 /
  50,064 / 62,471.
- **Ultra token totals** (calls with reported usage), at $0: run 10 2,491,296 in / 688,589 out; run 11
  2,537,506 in / 708,583 out; together 5,028,802 in / 1,397,172 out.

## Spend

Nebius (judges only): run 10 $0.1011, run 11 $0.0923; 071 total $0.1934. Ultra calls: $0 (free NVIDIA
API, ledgered at 0 / 0).

## Fixed after review (Devin, PR #63)

None of these changes a score, an interval or run 10's numbers.

1. A baseline that differs from the plan's by more than 0.1 now prints its check line and nothing after
   it, and the script exits 1 (it used to print STOP and go on).
2. The lowercase Ultra id's $0 price holds only on the NVIDIA route (`TRACEHOUND_NVIDIA_API=1`); sent to
   Token Factory it is priced at `placeholderFallback`, so the budget caps apply.
3. Verifier truncations are counted: verify-ctx ledgers as `review`, so the report tells verifier calls
   apart by matching their token counts to the attempt records' verdict usage (the new "verifier at
   max_tokens" column; 1 call, in 3.5 Super run 8; 0 in either Ultra run).
4. NVIDIA API replies are cached under their own key namespace, so they never share an entry with a
   Token Factory request for the same id; Token Factory keys are unchanged.
