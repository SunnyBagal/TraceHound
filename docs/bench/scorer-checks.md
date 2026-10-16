# Scorer checks: a second judge and augmented precision (decision 060)

**Report only.** `bench-judge-v1` stays the scorer of record; no adoption changes and no headline
number changes. The rules were pre-registered in decision 060 and frozen in commit `b98f014`
before the first completion call.

- **bench-judge-x1:** `Qwen/Qwen3-235B-A22B-Instruct-2507`, temperature 0, no reasoning field;
  system prompt byte-identical to bench-judge-v1's (sha256 `23de4e9e…058460`), same
  per-pull-request request, same rules. Fresh requests; bench-judge-v1 matches were not reused.
- **validity-v1** (prompt sha256 `c11d8fb6…48721c6`): every comment bench-judge-v1 labelled FP, in
  the eleven runs below, deduplicated by pull request, path, line and body, judged once by Super
  (reasoning on) and once by Qwen (no reasoning field). It sees the title, the description (cut at
  8,000 characters), the comment and the diff of the comment's file only.

Runs: the five recorded tools and six TraceHound runs (all Super). Dev repos only (sentry,
grafana, keycloak, discourse; 40 pull requests, n = 74 golden comments of Medium or higher).
Cal.com was not read, fetched, cloned, reviewed or scored. Counts only; per-comment detail and
reasons stay in `~/Projects/tracehound-bench/scores/judge-x1/` and `scores/validity-v1/`.
One run of each judge; no significance claims.

Reproduce: `node scripts/bench/scorer-checks.ts judge`, `… fps`, `… validity`, `… tables` (prints
everything below).

Note on the agreement share: "same label" compares the golden id. A comment that both judges
matched to *different* Low golden comments has a different label but the same outcome class, which
is why review-ctx-v1 (71 low-matched comments under v1) has a low share and a higher kappa.

### Under bench-judge-v1 (Super, reasoning on; the scorer of record)

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| coderabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |
| review-diff-v1 | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| review-ctx-v1 | 133 | 21 | 37 | 4 | 71 | 53 | 0 | 36.2% (21/58) | 28.4% (21/74) | 31.8% |
| verify-ctx-v1 | 63 | 21 | 33 | 3 | 6 | 53 | 0 | 38.9% (21/54) | 28.4% (21/74) | 32.8% |
| agree-diff-ctx | 33 | 15 | 11 | 2 | 5 | 59 | 0 | 57.7% (15/26) | 20.3% (15/74) | 30.0% |
| pool-raw | 243 | 38 | 117 | 10 | 78 | 36 | 0 | 24.5% (38/155) | 51.4% (38/74) | 33.2% |
| pool-verify-v1 | 83 | 26 | 46 | 4 | 7 | 48 | 0 | 36.1% (26/72) | 35.1% (26/74) | 35.6% |

### Under bench-judge-x1 (Qwen3-235B-A22B-Instruct-2507, no reasoning field)

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| greptile | 84 | 38 | 26 | 5 | 15 | 36 | 0 | 59.4% (38/64) | 51.4% (38/74) | 55.1% |
| coderabbit | 93 | 36 | 42 | 5 | 10 | 38 | 0 | 46.2% (36/78) | 48.6% (36/74) | 47.4% |
| augment | 69 | 41 | 14 | 6 | 8 | 33 | 0 | 74.5% (41/55) | 55.4% (41/74) | 63.6% |
| cursor | 55 | 32 | 8 | 3 | 12 | 42 | 0 | 80.0% (32/40) | 43.2% (32/74) | 56.1% |
| copilot | 131 | 34 | 67 | 7 | 23 | 40 | 0 | 33.7% (34/101) | 45.9% (34/74) | 38.9% |
| review-diff-v1 | 143 | 35 | 87 | 8 | 13 | 39 | 0 | 28.7% (35/122) | 47.3% (35/74) | 35.7% |
| review-ctx-v1 | 133 | 24 | 40 | 2 | 67 | 50 | 0 | 37.5% (24/64) | 32.4% (24/74) | 34.8% |
| verify-ctx-v1 | 63 | 24 | 28 | 4 | 7 | 50 | 0 | 46.2% (24/52) | 32.4% (24/74) | 38.1% |
| agree-diff-ctx | 33 | 14 | 11 | 2 | 6 | 60 | 0 | 56.0% (14/25) | 18.9% (14/74) | 28.3% |
| pool-raw | 243 | 45 | 105 | 17 | 76 | 29 | 0 | 30.0% (45/150) | 60.8% (45/74) | 40.2% |
| pool-verify-v1 | 83 | 31 | 34 | 6 | 12 | 43 | 0 | 47.7% (31/65) | 41.9% (31/74) | 44.6% |

#### sentry: F under v1 / x1

| run | v1 P (n) | v1 R (n) | v1 F | x1 P (n) | x1 R (n) | x1 F |
|---|---|---|---|---|---|---|
| greptile | 37.5% (9/24) | 42.9% (9/21) | 40.0% | 39.1% (9/23) | 42.9% (9/21) | 40.9% |
| coderabbit | 40.9% (9/22) | 42.9% (9/21) | 41.9% | 42.9% (9/21) | 42.9% (9/21) | 42.9% |
| augment | 78.6% (11/14) | 52.4% (11/21) | 62.9% | 84.6% (11/13) | 52.4% (11/21) | 64.7% |
| cursor | 81.8% (9/11) | 42.9% (9/21) | 56.3% | 72.7% (8/11) | 38.1% (8/21) | 50.0% |
| copilot | 19.4% (6/31) | 28.6% (6/21) | 23.1% | 27.6% (8/29) | 38.1% (8/21) | 32.0% |
| review-diff-v1 | 22.9% (8/35) | 38.1% (8/21) | 28.6% | 30.3% (10/33) | 47.6% (10/21) | 37.0% |
| review-ctx-v1 | 28.6% (6/21) | 28.6% (6/21) | 28.6% | 22.7% (5/22) | 23.8% (5/21) | 23.3% |
| verify-ctx-v1 | 31.3% (5/16) | 23.8% (5/21) | 27.0% | 37.5% (6/16) | 28.6% (6/21) | 32.4% |
| agree-diff-ctx | 40.0% (4/10) | 19.0% (4/21) | 25.8% | 50.0% (5/10) | 23.8% (5/21) | 32.3% |
| pool-raw | 22.2% (10/45) | 47.6% (10/21) | 30.3% | 29.5% (13/44) | 61.9% (13/21) | 40.0% |
| pool-verify-v1 | 26.1% (6/23) | 28.6% (6/21) | 27.3% | 30.4% (7/23) | 33.3% (7/21) | 31.8% |

#### grafana: F under v1 / x1

| run | v1 P (n) | v1 R (n) | v1 F | x1 P (n) | x1 R (n) | x1 F |
|---|---|---|---|---|---|---|
| greptile | 72.7% (8/11) | 50.0% (8/16) | 59.3% | 90.0% (9/10) | 56.3% (9/16) | 69.2% |
| coderabbit | 66.7% (6/9) | 37.5% (6/16) | 48.0% | 66.7% (6/9) | 37.5% (6/16) | 48.0% |
| augment | 72.7% (8/11) | 50.0% (8/16) | 59.3% | 72.7% (8/11) | 50.0% (8/16) | 59.3% |
| cursor | 63.6% (7/11) | 43.8% (7/16) | 51.9% | 87.5% (7/8) | 43.8% (7/16) | 58.3% |
| copilot | 46.2% (6/13) | 37.5% (6/16) | 41.4% | 53.8% (7/13) | 43.8% (7/16) | 48.3% |
| review-diff-v1 | 38.5% (5/13) | 31.3% (5/16) | 34.5% | 40.0% (6/15) | 37.5% (6/16) | 38.7% |
| review-ctx-v1 | 50.0% (3/6) | 18.8% (3/16) | 27.3% | 80.0% (4/5) | 25.0% (4/16) | 38.1% |
| verify-ctx-v1 | 50.0% (2/4) | 12.5% (2/16) | 20.0% | 75.0% (3/4) | 18.8% (3/16) | 30.0% |
| agree-diff-ctx | 100.0% (1/1) | 6.3% (1/16) | 11.8% | 100.0% (1/1) | 6.3% (1/16) | 11.8% |
| pool-raw | 33.3% (6/18) | 37.5% (6/16) | 35.3% | 50.0% (9/18) | 56.3% (9/16) | 52.9% |
| pool-verify-v1 | 57.1% (4/7) | 25.0% (4/16) | 34.8% | 83.3% (5/6) | 31.3% (5/16) | 45.5% |

#### keycloak: F under v1 / x1

| run | v1 P (n) | v1 R (n) | v1 F | x1 P (n) | x1 R (n) | x1 F |
|---|---|---|---|---|---|---|
| greptile | 50.0% (6/12) | 33.3% (6/18) | 40.0% | 50.0% (6/12) | 33.3% (6/18) | 40.0% |
| coderabbit | 34.8% (8/23) | 44.4% (8/18) | 39.0% | 43.5% (10/23) | 55.6% (10/18) | 48.8% |
| augment | 91.7% (11/12) | 61.1% (11/18) | 73.3% | 84.6% (11/13) | 61.1% (11/18) | 71.0% |
| cursor | 85.7% (6/7) | 33.3% (6/18) | 48.0% | 85.7% (6/7) | 33.3% (6/18) | 48.0% |
| copilot | 27.6% (8/29) | 44.4% (8/18) | 34.0% | 30.0% (9/30) | 50.0% (9/18) | 37.5% |
| review-diff-v1 | 17.3% (9/52) | 50.0% (9/18) | 25.7% | 17.6% (9/51) | 50.0% (9/18) | 26.1% |
| review-ctx-v1 | 41.2% (7/17) | 38.9% (7/18) | 40.0% | 52.9% (9/17) | 50.0% (9/18) | 51.4% |
| verify-ctx-v1 | 33.3% (7/21) | 38.9% (7/18) | 35.9% | 35.0% (7/20) | 38.9% (7/18) | 36.8% |
| agree-diff-ctx | 100.0% (6/6) | 33.3% (6/18) | 50.0% | 71.4% (5/7) | 27.8% (5/18) | 40.0% |
| pool-raw | 18.0% (11/61) | 61.1% (11/18) | 27.8% | 22.2% (12/54) | 66.7% (12/18) | 33.3% |
| pool-verify-v1 | 32.0% (8/25) | 44.4% (8/18) | 37.2% | 47.6% (10/21) | 55.6% (10/18) | 51.3% |

#### discourse: F under v1 / x1

| run | v1 P (n) | v1 R (n) | v1 F | x1 P (n) | x1 R (n) | x1 F |
|---|---|---|---|---|---|---|
| greptile | 57.1% (12/21) | 63.2% (12/19) | 60.0% | 73.7% (14/19) | 73.7% (14/19) | 73.7% |
| coderabbit | 32.1% (9/28) | 47.4% (9/19) | 38.3% | 44.0% (11/25) | 57.9% (11/19) | 50.0% |
| augment | 64.7% (11/17) | 57.9% (11/19) | 61.1% | 61.1% (11/18) | 57.9% (11/19) | 59.5% |
| cursor | 50.0% (7/14) | 36.8% (7/19) | 42.4% | 78.6% (11/14) | 57.9% (11/19) | 66.7% |
| copilot | 25.0% (8/32) | 42.1% (8/19) | 31.4% | 34.5% (10/29) | 52.6% (10/19) | 41.7% |
| review-diff-v1 | 40.0% (10/25) | 52.6% (10/19) | 45.5% | 43.5% (10/23) | 52.6% (10/19) | 47.6% |
| review-ctx-v1 | 35.7% (5/14) | 26.3% (5/19) | 30.3% | 30.0% (6/20) | 31.6% (6/19) | 30.8% |
| verify-ctx-v1 | 53.8% (7/13) | 36.8% (7/19) | 43.8% | 66.7% (8/12) | 42.1% (8/19) | 51.6% |
| agree-diff-ctx | 44.4% (4/9) | 21.1% (4/19) | 28.6% | 42.9% (3/7) | 15.8% (3/19) | 23.1% |
| pool-raw | 35.5% (11/31) | 57.9% (11/19) | 44.0% | 32.4% (11/34) | 57.9% (11/19) | 41.5% |
| pool-verify-v1 | 47.1% (8/17) | 42.1% (8/19) | 44.4% | 60.0% (9/15) | 47.4% (9/19) | 52.9% |

### Agreement, bench-judge-v1 against bench-judge-x1 (comments in pull requests both judges scored)

| run | comments | same label | share | kappa (outcome class) |
|---|---|---|---|---|
| greptile | 84 | 73 | 86.9% | 0.838 |
| coderabbit | 93 | 84 | 90.3% | 0.825 |
| augment | 69 | 66 | 95.7% | 0.901 |
| cursor | 55 | 46 | 83.6% | 0.763 |
| copilot | 131 | 114 | 87.0% | 0.788 |
| review-diff-v1 | 143 | 125 | 87.4% | 0.780 |
| review-ctx-v1 | 133 | 66 | 49.6% | 0.733 |
| verify-ctx-v1 | 63 | 57 | 90.5% | 0.848 |
| agree-diff-ctx | 33 | 28 | 84.8% | 0.772 |
| pool-raw | 243 | 160 | 65.8% | 0.788 |
| pool-verify-v1 | 83 | 69 | 83.1% | 0.755 |
| **all runs** | 1130 | 888 | 78.6% | 0.809 |

Comments left out (pull request JUDGE_FAILED under either judge): 0. Kappa over all runs: observed 0.872, expected 0.327, n 1130.

Outcome class, v1 (rows) against x1 (columns), all runs:

| v1 \ x1 | tp | fp | low | duplicate |
|---|---|---|---|---|
| tp | 301 | 12 | 0 | 5 |
| fp | 46 | 427 | 32 | 19 |
| low | 2 | 17 | 217 | 1 |
| duplicate | 5 | 6 | 0 | 40 |

### Ranking by F (11 runs)

| run | v1 F | v1 rank | x1 F | x1 rank |
|---|---|---|---|---|
| greptile | 49.3% | 3 | 55.1% | 3 |
| coderabbit | 41.0% | 4 | 47.4% | 4 |
| augment | 64.1% | 1 | 63.6% | 1 |
| cursor | 49.6% | 2 | 56.1% | 2 |
| copilot | 31.3% | 10 | 38.9% | 7 |
| review-diff-v1 | 32.2% | 8 | 35.7% | 9 |
| review-ctx-v1 | 31.8% | 9 | 34.8% | 10 |
| verify-ctx-v1 | 32.8% | 7 | 38.1% | 8 |
| agree-diff-ctx | 30.0% | 11 | 28.3% | 11 |
| pool-raw | 33.2% | 6 | 40.2% | 6 |
| pool-verify-v1 | 35.6% | 5 | 44.6% | 5 |

Kendall's tau-b between the two F-rankings: 0.891 (n = 11 runs).

### Precision gap, v1 minus x1 (points)

| run | kind | v1 precision | x1 precision | gap |
|---|---|---|---|---|
| greptile | tool | 51.5% | 59.4% | -7.9 |
| coderabbit | tool | 39.0% | 46.2% | -7.1 |
| augment | tool | 75.9% | 74.5% | 1.4 |
| cursor | tool | 67.4% | 80.0% | -12.6 |
| copilot | tool | 26.7% | 33.7% | -7.0 |
| review-diff-v1 | tracehound | 25.6% | 28.7% | -3.1 |
| review-ctx-v1 | tracehound | 36.2% | 37.5% | -1.3 |
| verify-ctx-v1 | tracehound | 38.9% | 46.2% | -7.3 |
| agree-diff-ctx | tracehound | 57.7% | 56.0% | 1.7 |
| pool-raw | tracehound | 24.5% | 30.0% | -5.5 |
| pool-verify-v1 | tracehound | 36.1% | 47.7% | -11.6 |

Mean gap, TraceHound runs (6): -4.5 points. Mean gap, five tools: -6.6 points.

pool-verify-v1 F under x1: 44.6%; at or above 35.0%.

bench-judge-x1 usage: {"calls":360,"cached":57,"inputTokens":371835,"outputTokens":16897,"costUSD":0.0757}

### Validity check (validity-v1): 324 deduplicated bench-judge-v1 FPs

| run | v1 FP comments | distinct FPs | Super valid / invalid / unsure | Qwen valid / invalid / unsure |
|---|---|---|---|---|
| greptile | 33 | 33 | 25 / 7 / 1 | 28 / 5 / 0 |
| coderabbit | 50 | 50 | 37 / 7 / 6 | 46 / 4 / 0 |
| augment | 13 | 13 | 9 / 2 / 2 | 13 / 0 / 0 |
| cursor | 14 | 14 | 10 / 2 / 2 | 14 / 0 / 0 |
| copilot | 77 | 77 | 26 / 40 / 11 | 47 / 21 / 9 |
| review-diff-v1 | 93 | 93 | 48 / 17 / 28 | 76 / 16 / 1 |
| review-ctx-v1 | 37 | 37 | 27 / 6 / 4 | 34 / 3 / 0 |
| verify-ctx-v1 | 33 | 33 | 26 / 0 / 7 | 33 / 0 / 0 |
| agree-diff-ctx | 11 | 11 | 7 / 2 / 2 | 11 / 0 / 0 |
| pool-raw | 117 | 117 | 65 / 22 / 30 | 97 / 19 / 1 |
| pool-verify-v1 | 46 | 46 | 38 / 0 / 8 | 46 / 0 / 0 |

super (nvidia/nemotron-3-super-120b-a12b, reasoning on, prompt c11d8fb6…): completed true; judged 324/324; valid 187, invalid 82, unsure 55; answered 316, invalid reply after retry 0, no diff 8, failed 0, retried 3, partial diff 0; usage {"calls":319,"cached":0,"inputTokens":789735,"outputTokens":179340,"costUSD":0.3983}; latency per comment median 3379 ms, max 16734 ms

qwen (Qwen/Qwen3-235B-A22B-Instruct-2507, reasoning off, prompt c11d8fb6…): completed true; judged 324/324; valid 265, invalid 49, unsure 10; answered 315, invalid reply after retry 1, no diff 8, failed 0, retried 1, partial diff 0; usage {"calls":317,"cached":0,"inputTokens":751469,"outputTokens":17880,"costUSD":0.161}; latency per comment median 2118 ms, max 15029 ms

### Validity judges' agreement (deduplicated FPs)

| Super \ Qwen | valid | invalid | unsure |
|---|---|---|---|
| valid | 180 | 6 | 1 |
| invalid | 42 | 40 | 0 |
| unsure | 43 | 3 | 9 |

Same verdict: 229/324 (70.7%); kappa 0.395 (expected 0.516).

### Augmented precision ((TP + FPs judged valid) / (TP + FP), bench-judge-v1 counts)

| run | TP | FP | v1 precision (n) | valid (Super) | AP Super | valid (Qwen) | AP Qwen | valid (both) | AP both |
|---|---|---|---|---|---|---|---|---|---|
| greptile | 35 | 33 | 51.5% (35/68) | 25 | 88.2% | 28 | 92.6% | 24 | 86.8% |
| coderabbit | 32 | 50 | 39.0% (32/82) | 37 | 84.1% | 46 | 95.1% | 37 | 84.1% |
| augment | 41 | 13 | 75.9% (41/54) | 9 | 92.6% | 13 | 100.0% | 9 | 92.6% |
| cursor | 29 | 14 | 67.4% (29/43) | 10 | 90.7% | 14 | 100.0% | 10 | 90.7% |
| copilot | 28 | 77 | 26.7% (28/105) | 26 | 51.4% | 47 | 71.4% | 22 | 47.6% |
| review-diff-v1 | 32 | 93 | 25.6% (32/125) | 48 | 64.0% | 76 | 86.4% | 46 | 62.4% |
| review-ctx-v1 | 21 | 37 | 36.2% (21/58) | 27 | 82.8% | 34 | 94.8% | 27 | 82.8% |
| verify-ctx-v1 | 21 | 33 | 38.9% (21/54) | 26 | 87.0% | 33 | 100.0% | 26 | 87.0% |
| agree-diff-ctx | 15 | 11 | 57.7% (15/26) | 7 | 84.6% | 11 | 100.0% | 7 | 84.6% |
| pool-raw | 38 | 117 | 24.5% (38/155) | 65 | 66.5% | 97 | 87.1% | 63 | 65.2% |
| pool-verify-v1 | 26 | 46 | 36.1% (26/72) | 38 | 88.9% | 46 | 100.0% | 38 | 88.9% |


### Calls, tokens, cost (ledger, this job)

| model | purpose | requests (uncached) | failed | input tokens | output tokens | cost |
|---|---|---|---|---|---|---|
| Qwen3-235B-A22B-Instruct-2507 | bench-judge (x1) | 303 | 0 | 337,292 | 13,779 | $0.0757 |
| Nemotron Super | bench-validity | 319 | 0 | 789,735 | 179,340 | $0.3983 |
| Qwen3-235B-A22B-Instruct-2507 | bench-validity | 317 | 0 | 751,469 | 17,880 | $0.1610 |
| **total** | | **939** | **0** | | | **$0.6350** |

bench-judge-x1 made 360 requests for 359 pull requests that needed one (1 retry after an invalid
reply, then valid; 0 JUDGE_FAILED); 57 of them were byte-identical to an earlier request in this
job and came from the response cache (cost $0). Plus one `GET /v1/models` (free). Ledger
$11.81728 before, $12.45236 after. Qwen is priced from a third-party listing (models.dev via
mastra.ai, 2026-10-16), not verified in the console.

### pool-verify-v1 under x1

pool-verify-v1's F under bench-judge-x1 is 44.6% (P 31/65, R 31/74), at or above 35.0%. This
changes nothing: the adoption in 059 was made under bench-judge-v1, which stays the scorer of
record.

### Limits

- The second judge is one other model, not ground truth.
- The validity judges see only the diff.
- Super is both the reviewer of every TraceHound run and one validity judge.
- Augmented precision has no matching recall: valid defects not in the golden list can't be
  counted as found or missed, so augmented precision is not comparable with recall or F.
- n = 74 golden comments; one run per judge.
