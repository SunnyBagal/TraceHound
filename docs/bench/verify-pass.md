# Verification pass: verify-v1 (decision 056)

A second model pass reads each finding that review-diff-v1 (Super) already wrote and gives it a
confidence from 1 to 5 (`tracehound verify run`). It sees the pull request's title and description,
the finding, and the diff of that finding's file with new-version line numbers; nothing else. No
reviewer was rerun: the input is 055's 40 Super review files (143 findings). Run 2026-10-15 on the
dev repos (sentry, grafana, keycloak, discourse); Cal.com was not read, fetched, verified or scored.
Verifier: Nemotron Super, temperature 0, reasoning on, one run, prompt sha256
`ab2d6105…3fac6586`, frozen before the first run. Scored with `bench-judge-v1` unchanged (one
judge). Counts only; finding text, reasons and per-comment detail stay in
`~/Projects/tracehound-bench/`.

Precision = TP / (TP + FP), recall = TP / (TP + FN), F = their harmonic mean, from summed counts.
"low" = comments that matched a Low golden comment (they count as nothing). n = 74 golden
comments of Medium or higher (sentry 21, grafana 16, keycloak 18, discourse 19). A threshold keeps
findings with confidence at least that value, and every VERIFY_FAILED finding (there were none).
Every threshold is scored by `tracehound bench score`: one judge request per pull request on the
comments kept; a pull request whose comments did not change is a judge-cache hit.

## Overall (dev repos)

| Threshold | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **1 (chosen; = 055)** | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| 2 | 103 | 26 | 62 | 7 | 8 | 48 | 0 | 29.5% (26/88) | 35.1% (26/74) | 32.1% |
| 3 | 89 | 24 | 56 | 4 | 5 | 50 | 0 | 30.0% (24/80) | 32.4% (24/74) | 31.2% |
| 4 | 72 | 20 | 43 | 4 | 5 | 54 | 0 | 31.7% (20/63) | 27.0% (20/74) | 29.2% |
| 5 | 42 | 16 | 20 | 2 | 4 | 58 | 0 | 44.4% (16/36) | 21.6% (16/74) | 29.1% |

Threshold 1 reproduces 055's Super row exactly (all 37 judge requests were cache hits). Raising
the threshold raises precision and lowers recall by about as much; F does not rise at any
threshold.

**Chosen threshold: 1.** The rule, fixed before any result: the threshold with the highest overall
dev F; on a tie, the higher one. 32.2% at 1 beats 32.1% at 2. At the chosen threshold the
verifier removes nothing, so verify-v1 as frozen leaves review-diff-v1's output unchanged.

### Beside the five recorded tools (chosen threshold)

The tools' rows are copied from `docs/bench/baseline-diff.md` (dev only, not re-judged).

| Reviewer | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **review-diff-v1 + verify-v1 @ 1, Super** | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| Greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| CodeRabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| Augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| Cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| Copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |

### Sensitivity: reusing the threshold-1 matches

Re-judging a smaller comment set can match differently than the full set did. Scoring each
threshold instead by dropping comments from the threshold-1 detail (same matches, the 054 rules
reapplied; printed by `scripts/bench/score-verify.ts`, no model call) gives:

| Threshold | comments | TP | FP | dup | low | FN | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 143 | 32 | 93 | 8 | 10 | 42 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| 2 | 103 | 27 | 61 | 7 | 8 | 47 | 30.7% (27/88) | 36.5% (27/74) | 33.3% |
| 3 | 89 | 26 | 52 | 5 | 6 | 48 | 33.3% (26/78) | 35.1% (26/74) | 34.2% |
| 4 | 72 | 22 | 41 | 4 | 5 | 52 | 34.9% (22/63) | 29.7% (22/74) | 32.1% |
| 5 | 42 | 17 | 19 | 2 | 4 | 57 | 47.2% (17/36) | 23.0% (17/74) | 30.9% |

On these numbers thresholds 2 and 3 would beat 1. The rule was applied to the scored rows above,
as written; the difference between the two readings is one or two TP per threshold, within one
judge's noise at n = 74. Neither reading moves Super's F near the four tools above Copilot.

## Per repo

| Threshold | Repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | sentry | 40 | 8 | 27 | 2 | 3 | 13 | 0 | 22.9% (8/35) | 38.1% (8/21) | 28.6% |
| **1** | grafana | 20 | 5 | 8 | 3 | 4 | 11 | 0 | 38.5% (5/13) | 31.3% (5/16) | 34.5% |
| **1** | keycloak | 53 | 9 | 43 | 1 | 0 | 9 | 0 | 17.3% (9/52) | 50.0% (9/18) | 25.7% |
| **1** | discourse | 30 | 10 | 15 | 2 | 3 | 9 | 0 | 40.0% (10/25) | 52.6% (10/19) | 45.5% |
| 2 | sentry | 36 | 6 | 25 | 2 | 3 | 15 | 0 | 19.4% (6/31) | 28.6% (6/21) | 23.1% |
| 2 | grafana | 14 | 4 | 6 | 2 | 2 | 12 | 0 | 40.0% (4/10) | 25.0% (4/16) | 30.8% |
| 2 | keycloak | 29 | 7 | 21 | 1 | 0 | 11 | 0 | 25.0% (7/28) | 38.9% (7/18) | 30.4% |
| 2 | discourse | 24 | 9 | 10 | 2 | 3 | 10 | 0 | 47.4% (9/19) | 47.4% (9/19) | 47.4% |
| 3 | sentry | 31 | 6 | 22 | 2 | 1 | 15 | 0 | 21.4% (6/28) | 28.6% (6/21) | 24.5% |
| 3 | grafana | 10 | 2 | 7 | 0 | 1 | 14 | 0 | 22.2% (2/9) | 12.5% (2/16) | 16.0% |
| 3 | keycloak | 26 | 7 | 18 | 1 | 0 | 11 | 0 | 28.0% (7/25) | 38.9% (7/18) | 32.6% |
| 3 | discourse | 22 | 9 | 9 | 1 | 3 | 10 | 0 | 50.0% (9/18) | 47.4% (9/19) | 48.6% |
| 4 | sentry | 24 | 5 | 16 | 2 | 1 | 16 | 0 | 23.8% (5/21) | 23.8% (5/21) | 23.8% |
| 4 | grafana | 9 | 2 | 6 | 0 | 1 | 14 | 0 | 25.0% (2/8) | 12.5% (2/16) | 16.7% |
| 4 | keycloak | 21 | 6 | 14 | 1 | 0 | 12 | 0 | 30.0% (6/20) | 33.3% (6/18) | 31.6% |
| 4 | discourse | 18 | 7 | 7 | 1 | 3 | 12 | 0 | 50.0% (7/14) | 36.8% (7/19) | 42.4% |
| 5 | sentry | 15 | 5 | 9 | 1 | 0 | 16 | 0 | 35.7% (5/14) | 23.8% (5/21) | 28.6% |
| 5 | grafana | 4 | 1 | 2 | 0 | 1 | 15 | 0 | 33.3% (1/3) | 6.3% (1/16) | 10.5% |
| 5 | keycloak | 12 | 4 | 8 | 0 | 0 | 14 | 0 | 33.3% (4/12) | 22.2% (4/18) | 26.7% |
| 5 | discourse | 11 | 6 | 1 | 1 | 3 | 13 | 0 | 85.7% (6/7) | 31.6% (6/19) | 46.2% |

## Confidence against outcome

From the threshold-1 score detail (every finding kept), each finding's confidence joined with its
outcome; 143 of 143 joined (path and line checked).

| Confidence | TP | FP | duplicate | low | total |
|---|---|---|---|---|---|
| 1 | 6 | 32 | 0 | 2 | 40 |
| 2 | 1 | 9 | 2 | 2 | 14 |
| 3 | 4 | 11 | 1 | 1 | 17 |
| 4 | 5 | 22 | 2 | 1 | 30 |
| 5 | 16 | 19 | 3 | 4 | 42 |
| VERIFY_FAILED | 0 | 0 | 0 | 0 | 0 |
| total | 32 | 93 | 8 | 10 | 143 |

Confidence 5 has the highest share of true positives (16 of 35 TP + FP, 45.7%) and confidence 1
the lowest (6 of 38, 15.8%), but 6 of the 32 true positives were given confidence 1, and
confidence 4 (5 of 27, 18.5%) is below confidence 3 (4 of 15, 26.7%).

## The verifier's own record

| | |
|---|---|
| pull requests / findings | 40 / 143 (3 pull requests had no finding) |
| verifier requests (ledger) | 143 (0 cached) |
| retries after an invalid reply | 0 |
| VERIFY_FAILED | 0 |
| file diffs cut to a part (over 60,000 characters) | 0 |
| confidence 1 / 2 / 3 / 4 / 5 | 40 / 14 / 17 / 30 / 42 |
| input / output tokens | 327,242 / 102,295 |
| cost (ledger) | $0.19024 |
| latency per finding (client-measured, one request each), median / max | 4.0 s / 9.8 s |
| judge requests for thresholds 2 to 5 (not cached) / cost | 46 / $0.02825 |

Findings were verified six at a time within a pull request, pull requests one after another.

## Spend

Ledger total before $10.19290, after $10.41140: $0.21850 for this job. Verifier (purpose
`verify`): 143 requests, $0.19024. Judge (purpose `bench-judge`): 46 requests, $0.02825 (26,982
input / 22,400 output tokens). Threshold 1's 37 judge requests and a later rerun of the scoring
script were all cache hits. Prices are third-party rates in `config/prices.json`, not confirmed in
the Nebius console.
