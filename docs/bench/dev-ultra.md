# Nemotron 3 Ultra on dev via the NVIDIA API: result (decision 071, report only)

Plan: `docs/bench/dev-ultra-plan.md`, committed in `cb58934` and pushed at 2026-10-24T06:19:48Z; the
first Ultra call (the probe) was sent at 06:19:54Z. Dev only: Cal.com was not opened, run or scored.
Script: `node scripts/bench/dev-ultra.ts` (no model call). **Fallback in force: run 10 alone.** Run 11
was started unattended at 09:52Z, after run 10 passed the stop rule, but this session's own budget ran
out before it finished; its result is not in this report. **Nothing is adopted.**

**Plain answer:** on one run, no. Ultra's pool-verify-v1 v1 F is 42.3, the same as 3 Super's 5-run mean
(42.3) and below 3.5 Super's 2-run mean (50.4). The only interval that excludes 0 is pool-raw under v1:
there **Ultra is worse than 3.5 Super** (−11.8 points, [−19.6, −4.0]). Ultra comments more (146 kept
against 79–107) with higher recall and lower precision. It was the most reliable model on the
pipeline: 0 failed chunks and 0 truncations.

## Probe and smoke

- Probe (one call through the client, reasoning on, `max_tokens` 2,000): HTTP 200, `finish_reason`
  stop, 23 prompt / 16 completion tokens, 1.3 s. `usage` reports no reasoning tokens; the reply
  carried 53 characters of reasoning.
- Smoke (sentry/0, grafana/0, keycloak/0 through run 10's pipeline, no judge): 1 of 3 pull requests
  had a failed chunk (keycloak/0 diff#0, `request failed: The operation was aborted due to timeout`,
  the 300 s client timeout, not an HTTP error); 0 4xx, 0 429, 0 `finish_reason: length`; kept
  findings 6 / 5 / 1. No stop rule fired.

## v1 F means (the plan's baselines) and run 10

| row | judge | 3 Super (5 runs) P / R / F | 3.5 Super (2 runs) P / R / F | Ultra run 10 P / R / F | Ultra comments |
|---|---|---|---|---|---|
| pool-verify-v1 | v1 (record) | 40.5 / 44.3 / 42.3 | 54.8 / 46.6 / 50.4 | 34.8 / 54.1 / 42.3 | 146 (TP 40, FP 75, FN 34) |
| pool-verify-v1 | x1 | 50.9 / 51.9 / 51.3 | 60.5 / 50.7 / 55.1 | 45.9 / 67.6 / 54.6 | 146 (TP 50, FP 59, FN 24) |
| pool-raw | v1 (record) | 30.0 / 52.7 / 38.2 | 48.0 / 61.5 / 53.9 | 31.2 / 64.9 / 42.1 | 192 (TP 48, FP 106, FN 26) |
| pool-raw | x1 | 37.3 / 63.8 / 47.0 | 49.2 / 62.2 / 54.9 | 39.0 / 77.0 / 51.8 | 192 (TP 57, FP 89, FN 17) |

Baselines recomputed from the records: 42.28, 50.36, 38.16, 53.87 (all within 0.1 of the stated
values). Per-run baseline rows are in `docs/bench/dev-3.5.md` and `docs/bench/v3-recall.md`. n = 74
golden comments, 0 JUDGE_FAILED. Run 10's review-diff-v1 row (not a planned row): v1 F 45.4, x1 53.8.

## Paired bootstrap (10,000 resamples, seed 71, 40 pull requests, Ultra = run 10 only)

| row | judge | comparison | mean F difference | 95% interval | below 0 |
|---|---|---|---|---|---|
| pool-verify-v1 | v1 | Ultra − 3.5 Super | −8.0 | [−18.3, +2.7] | 92.8% |
| pool-verify-v1 | v1 | Ultra − 3 Super | +0.0 | [−8.7, +8.9] | 49.2% |
| pool-verify-v1 | x1 | Ultra − 3.5 Super | −0.5 | [−11.2, +10.3] | 53.9% |
| pool-verify-v1 | x1 | Ultra − 3 Super | +3.4 | [−5.1, +11.5] | 22.4% |
| pool-raw | v1 | Ultra − 3.5 Super | **−11.8** | **[−19.6, −4.0]** | 99.9% |
| pool-raw | v1 | Ultra − 3 Super | +3.9 | [−3.1, +11.5] | 15.2% |
| pool-raw | x1 | Ultra − 3.5 Super | −3.1 | [−14.0, +7.7] | 71.8% |
| pool-raw | x1 | Ultra − 3 Super | +4.8 | [−3.2, +12.6] | 11.9% |

With one Ultra run the bootstrap does not capture run-to-run spread (12.4 F points across the five 3
Super runs).

## Operations

| model | runs | PRs with a failed chunk (per run) | calls at max_tokens (per run) | wall s per PR, median |
|---|---|---|---|---|
| 3 Super | 2r, 4, 5, 6 | 1, 0, 0, 0 | 6, 2, 3, 5 | 86–108 |
| 3.5 Super | 7r, 8 | 7, 7 | 32, 25 | 121, 130 |
| Ultra | 10 | 0 (0 VERIFY_FAILED) | 0 | 233 (max 1,066) |

Ultra run 10: 06:37:14Z → 09:51:33Z (3 h 14 min), 306 NVIDIA API requests, **0 HTTP 429**, 3 requests
hit the 300 s timeout (ledgered without usage; 2 pull requests were rerun under the rule, none still
failing after the rerun). Tokens per pull request (pipeline, every attempt): input median 50,158, output
median 15,536 / mean 17,215, against 3 Super 41,287 / 20,025 / 27,250 and 3.5 Super 49,357 / 50,064 /
62,471. Ultra token totals (calls with reported usage): 2,491,296 in, 688,589 out, at $0.

## Spend

Nebius (judges only): run 10 $0.1011. Ultra calls: $0 (free NVIDIA API, ledgered at 0 / 0). Run 11's
judge spend is not included.
