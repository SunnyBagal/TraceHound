# Levers v2: offline replay on dev

The 40 dev PRs have been used for 17 earlier decisions; any gain here is a hypothesis, not a result, and none is adopted.

Plan: 303994575368050f3edbd3d4ba5f30fb510605d9, committed 2026-10-27T16:01:36+05:30; pushed before computation. First computation: 2026-10-27T10:35:59.167Z. Report only, no decision number. Frozen reviewer: review-freeze-2, pool-verify-v1 on Nemotron 3.5 Super.

New model calls: 0; replay network calls: 0; new inference cost: $0. Only saved dev records and matches were read. Git transport delivers the report.

P/R/F are percentages; differences and 95% intervals are percentage points. Bootstrap: 10,000 paired PR resamples, seed 72, percentile intervals with linear interpolation; all runs of a PR stay together. Intervals are exploratory and unadjusted for the many comparisons. Undefined metrics/intervals print NA. Raw means pool-raw; verified means pool-verify-v1. Aggregate top-k rows pool scorer counts across the listed model's runs, with 40 distinct PRs and the PR-run exposure count shown. Per-run cap counts/P/R/F and all intervals are available with --json.

## bench-judge-v1 (scorer of record)

### 1. Per-PR cap

Each k cell is F; delta-F [95% interval] versus uncapped. Agreement uses full saved generator output; order is the control. Both preserve original order within tiers.

| Model (runs) | Source | Rank | n PRs / PR-runs | Uncapped F | k=1 | k=2 | k=3 | k=4 | k=5 |
|---|---|---|---:|---:|---|---|---|---|---|
| 3 Super (1,2r,4,5,6) | verified | agreement | 40 / 200 | 42.3 | 34.2; -8.09 [-13.23, -2.06] | 39.4; -2.90 [-6.16, 0.72] | 42.9; 0.62 [-1.64, 2.80] | 42.4; 0.12 [-1.69, 1.54] | 42.5; 0.15 [-0.93, 1.16] |
| 3 Super (1,2r,4,5,6) | verified | order | 40 / 200 | 42.3 | 27.9; -14.41 [-19.84, -8.77] | 38.2; -4.13 [-7.85, -0.11] | 42.9; 0.56 [-2.12, 2.93] | 42.1; -0.22 [-2.09, 1.37] | 42.1; -0.17 [-1.13, 0.64] |
| 3 Super (1,2r,4,5,6) | raw | agreement | 40 / 200 | 38.0 | 32.3; -5.73 [-13.17, 2.62] | 38.0; 0.03 [-5.33, 5.60] | 40.3; 2.30 [-2.00, 6.55] | 41.6; 3.62 [0.36, 6.81] | 40.9; 2.85 [0.02, 5.46] |
| 3 Super (1,2r,4,5,6) | raw | order | 40 / 200 | 38.0 | 26.2; -11.81 [-18.72, -4.49] | 35.5; -2.49 [-8.26, 3.46] | 39.8; 1.78 [-2.74, 6.04] | 41.1; 3.04 [-0.09, 6.03] | 40.8; 2.75 [0.03, 5.25] |
| 3.5 Super (7r,8) | verified | agreement | 40 / 80 | 50.4 | 39.8; -10.56 [-17.42, -3.48] | 49.8; -0.58 [-6.45, 4.57] | 48.6; -1.76 [-6.52, 2.37] | 50.6; 0.21 [-1.36, 1.77] | 50.9; 0.57 [-1.30, 2.57] |
| 3.5 Super (7r,8) | verified | order | 40 / 80 | 50.4 | 33.7; -16.70 [-24.42, -8.75] | 48.7; -1.65 [-8.10, 4.06] | 50.2; -0.17 [-5.75, 4.88] | 51.3; 0.98 [-2.59, 4.45] | 51.5; 1.13 [0.00, 2.88] |
| 3.5 Super (7r,8) | raw | agreement | 40 / 80 | 53.8 | 40.4; -13.47 [-22.00, -4.92] | 52.5; -1.34 [-9.33, 5.36] | 54.1; 0.25 [-6.21, 5.81] | 54.3; 0.46 [-2.58, 3.18] | 55.9; 2.03 [-0.18, 4.14] |
| 3.5 Super (7r,8) | raw | order | 40 / 80 | 53.8 | 34.6; -19.27 [-27.71, -10.53] | 52.1; -1.74 [-9.70, 5.19] | 55.1; 1.28 [-5.64, 7.24] | 55.8; 1.97 [-2.41, 6.15] | 56.3; 2.48 [0.69, 4.37] |
| Ultra (10,11) | verified | agreement | 40 / 80 | 47.1 | 39.6; -7.44 [-13.99, -0.37] | 44.4; -2.70 [-7.82, 2.17] | 48.6; 1.57 [-2.88, 5.41] | 48.0; 0.92 [-1.96, 3.61] | 47.8; 0.70 [-1.73, 3.01] |
| Ultra (10,11) | verified | order | 40 / 80 | 47.1 | 38.3; -8.74 [-16.30, -0.81] | 44.7; -2.36 [-8.26, 3.09] | 45.8; -1.27 [-4.77, 2.17] | 46.6; -0.47 [-3.54, 2.47] | 47.0; -0.04 [-2.33, 2.07] |
| Ultra (10,11) | raw | agreement | 40 / 80 | 43.6 | 40.0; -3.60 [-12.91, 6.16] | 44.6; 1.01 [-6.07, 8.19] | 47.1; 3.50 [-1.96, 8.68] | 46.4; 2.78 [-1.22, 6.73] | 46.1; 2.52 [-1.30, 5.92] |
| Ultra (10,11) | raw | order | 40 / 80 | 43.6 | 38.5; -5.06 [-13.63, 3.85] | 45.7; 2.06 [-6.80, 10.06] | 45.1; 1.55 [-4.08, 6.62] | 43.9; 0.28 [-4.68, 5.09] | 43.2; -0.40 [-4.44, 3.65] |

Answer: The following pooled cap comparisons are better than their own uncapped baseline by the stated interval rule: 3 Super/raw/agreement/k=4; 3 Super/raw/agreement/k=5; 3 Super/raw/order/k=5; 3.5 Super/raw/order/k=5. All k values are reported; no k is selected.

### 2. Verifier on/off

P/R/F columns describe existing numbers. Difference is verified minus raw. Counts, denominators and delta-P/R intervals are in --json.

| Model | Run | n PRs | Raw comments / TP / FP / FN | Verified comments / TP / FP / FN | Raw P/R/F | Verified P/R/F | Delta-F [95% interval] |
|---|---|---:|---|---|---|---|---|
| 3 Super | 1 | 40 | 243/38/117/36 | 83/26/46/48 | 24.5/51.4/33.2 | 36.1/35.1/35.6 | 2.43 [-7.49, 10.45] |
| 3 Super | 2r | 40 | 146/36/84/38 | 91/36/40/38 | 30.0/48.6/37.1 | 47.4/48.6/48.0 | 10.89 [3.69, 17.14] |
| 3 Super | 4 | 40 | 159/43/83/31 | 100/35/50/39 | 34.1/58.1/43.0 | 41.2/47.3/44.0 | 1.03 [-8.82, 9.91] |
| 3 Super | 5 | 40 | 151/42/83/32 | 97/33/50/41 | 33.6/56.8/42.2 | 39.8/44.6/42.0 | -0.17 [-4.90, 4.11] |
| 3 Super | 6 | 40 | 163/36/94/38 | 107/34/55/40 | 27.7/48.6/35.3 | 38.2/45.9/41.7 | 6.42 [-1.06, 14.37] |
| 3.5 Super | 7r | 40 | 116/45/53/29 | 79/35/29/39 | 45.9/60.8/52.3 | 54.7/47.3/50.7 | -1.60 [-9.99, 5.54] |
| 3.5 Super | 8 | 40 | 117/46/46/28 | 82/34/28/40 | 50.0/62.2/55.4 | 54.8/45.9/50.0 | -5.42 [-14.69, 3.34] |
| Ultra | 10 | 40 | 192/48/106/26 | 146/40/75/34 | 31.2/64.9/42.1 | 34.8/54.1/42.3 | 0.22 [-4.32, 4.59] |
| Ultra | 11 | 40 | 182/49/94/25 | 143/48/63/26 | 34.3/66.2/45.2 | 43.2/64.9/51.9 | 6.73 [1.02, 12.13] |

Answer: verification is better in 2/9 run comparisons by the interval rule (runs 2r, 11); 0 have intervals entirely below zero; the remaining 7 include zero or are unavailable.

### 3. Cheaper vote

3 Super, verified source; unchanged voteKeep, threshold 2 of 3, no cap. Each representative uses its own run's saved match. Delta compares vote F with the arithmetic mean of constituent-run F values, paired at PR level.

| Runs | n PRs | Vote comments / TP / FP / FN | Vote P/R/F | Individual run F (same order) | Three-run mean F | Delta-F [95% interval] |
|---|---:|---|---|---|---:|---|
| 4, 5, 6 | 40 | 88/29/48/45 | 37.7/39.2/38.4 | 44.0 / 42.0 / 41.7 | 42.6 | -4.18 [-10.54, 1.93] |
| 1, 2r, 4 | 40 | 69/32/25/42 | 56.1/43.2/48.9 | 35.6 / 48.0 / 44.0 | 42.5 | 6.31 [-0.33, 12.63] |

Answer: Neither three-run vote has a positive interval excluding zero against its three-run mean. This replay does not estimate the cost of new runs.

### 4. Where the misses are

3.5 verified, runs 7r and 8. Cells are missed-in-both / golden denominator. Low is shown separately from the Medium-or-higher scorer subtotal. Golden identity/order/severity is checked across runs. Counts only.

| Repo | n PRs | Low | Medium | High | Critical | Medium+ | All severities |
|---|---:|---:|---:|---:|---:|---:|---:|
| sentry | 10 | 10/11 | 9/10 | 5/10 | 0/1 | 14/21 | 24/32 |
| grafana | 10 | 5/6 | 4/6 | 5/9 | 0/1 | 9/16 | 14/22 |
| keycloak | 10 | 5/6 | 2/8 | 2/7 | 0/3 | 4/18 | 9/24 |
| discourse | 10 | 4/9 | 7/14 | 1/3 | 0/2 | 8/19 | 12/28 |
| total | 40 | 24/32 | 22/38 | 13/29 | 0/7 | 35/74 | 59/106 |

Answer: 35 of 74 Medium-or-higher goldens were missed in both runs across 40 PRs. The repository/severity counts localize persistent misses; they do not identify their causes.

## bench-judge-x1 (report only)

### 1. Per-PR cap

Each k cell is F; delta-F [95% interval] versus uncapped. Agreement uses full saved generator output; order is the control. Both preserve original order within tiers.

| Model (runs) | Source | Rank | n PRs / PR-runs | Uncapped F | k=1 | k=2 | k=3 | k=4 | k=5 |
|---|---|---|---:|---:|---|---|---|---|---|
| 3 Super (1,2r,4,5,6) | verified | agreement | 40 / 200 | 51.4 | 40.2; -11.17 [-17.70, -4.18] | 47.8; -3.64 [-8.66, 1.47] | 51.6; 0.19 [-3.44, 3.39] | 51.1; -0.33 [-2.78, 1.92] | 51.0; -0.36 [-2.00, 1.15] |
| 3 Super (1,2r,4,5,6) | verified | order | 40 / 200 | 51.4 | 33.9; -17.55 [-24.67, -10.62] | 46.8; -4.56 [-9.75, 0.89] | 51.5; 0.11 [-4.12, 3.61] | 50.7; -0.69 [-3.54, 1.70] | 50.7; -0.71 [-2.27, 0.71] |
| 3 Super (1,2r,4,5,6) | raw | agreement | 40 / 200 | 46.8 | 37.8; -9.07 [-17.82, 0.27] | 45.5; -1.34 [-7.67, 5.31] | 49.0; 2.18 [-2.87, 7.27] | 51.7; 4.88 [1.42, 8.32] | 50.5; 3.69 [0.44, 6.95] |
| 3 Super (1,2r,4,5,6) | raw | order | 40 / 200 | 46.8 | 30.9; -15.91 [-24.56, -7.15] | 43.3; -3.49 [-10.32, 3.42] | 48.9; 2.05 [-3.22, 7.00] | 51.5; 4.69 [0.97, 8.36] | 50.2; 3.35 [-0.05, 6.67] |
| 3.5 Super (7r,8) | verified | agreement | 40 / 80 | 55.1 | 44.2; -10.93 [-17.53, -3.61] | 52.6; -2.52 [-7.23, 1.94] | 53.1; -2.09 [-6.55, 1.59] | 55.8; 0.67 [-0.98, 2.40] | 55.8; 0.70 [-1.22, 2.91] |
| 3.5 Super (7r,8) | verified | order | 40 / 80 | 55.1 | 39.0; -16.15 [-22.54, -9.18] | 52.2; -2.97 [-7.78, 1.42] | 54.0; -1.11 [-6.31, 3.66] | 56.4; 1.22 [-2.34, 4.57] | 56.4; 1.24 [0.00, 3.19] |
| 3.5 Super (7r,8) | raw | agreement | 40 / 80 | 54.9 | 45.3; -9.64 [-18.98, 0.29] | 54.3; -0.59 [-8.72, 6.79] | 56.0; 1.07 [-5.50, 6.91] | 55.9; 0.97 [-2.30, 4.19] | 57.4; 2.49 [-0.03, 4.89] |
| 3.5 Super (7r,8) | raw | order | 40 / 80 | 54.9 | 40.4; -14.55 [-23.91, -4.57] | 54.1; -0.81 [-8.52, 6.23] | 56.4; 1.50 [-5.31, 7.43] | 57.2; 2.31 [-1.93, 6.37] | 57.9; 2.95 [0.79, 5.11] |
| Ultra (10,11) | verified | agreement | 40 / 80 | 54.8 | 44.8; -10.09 [-18.33, -1.45] | 53.8; -1.09 [-8.86, 6.55] | 56.1; 1.29 [-4.17, 6.39] | 55.8; 0.92 [-2.45, 4.37] | 55.6; 0.71 [-2.07, 3.57] |
| Ultra (10,11) | verified | order | 40 / 80 | 54.8 | 43.4; -11.45 [-21.14, -1.81] | 53.8; -1.00 [-9.72, 6.85] | 52.9; -1.93 [-7.87, 3.67] | 54.3; -0.53 [-4.73, 3.65] | 54.8; -0.08 [-2.81, 2.73] |
| Ultra (10,11) | raw | agreement | 40 / 80 | 51.4 | 44.1; -7.28 [-18.00, 3.58] | 52.1; 0.66 [-8.63, 9.42] | 54.1; 2.71 [-4.31, 9.05] | 54.3; 2.91 [-1.76, 7.53] | 54.6; 3.18 [-0.67, 7.15] |
| Ultra (10,11) | raw | order | 40 / 80 | 51.4 | 42.6; -8.82 [-18.75, 1.03] | 54.4; 3.00 [-6.44, 11.45] | 53.2; 1.79 [-4.65, 7.70] | 52.5; 1.09 [-4.66, 6.80] | 51.8; 0.40 [-3.96, 4.92] |

Answer: The following pooled cap comparisons are better than their own uncapped baseline by the stated interval rule: 3 Super/raw/agreement/k=4; 3 Super/raw/agreement/k=5; 3 Super/raw/order/k=4; 3.5 Super/raw/order/k=5. All k values are reported; no k is selected.

### 2. Verifier on/off

P/R/F columns describe existing numbers. Difference is verified minus raw. Counts, denominators and delta-P/R intervals are in --json.

| Model | Run | n PRs | Raw comments / TP / FP / FN | Verified comments / TP / FP / FN | Raw P/R/F | Verified P/R/F | Delta-F [95% interval] |
|---|---|---:|---|---|---|---|---|
| 3 Super | 1 | 40 | 243/45/105/29 | 83/31/34/43 | 30.0/60.8/40.2 | 47.7/41.9/44.6 | 4.43 [-8.01, 15.25] |
| 3 Super | 2r | 40 | 146/41/81/33 | 91/39/33/35 | 33.6/55.4/41.8 | 54.2/52.7/53.4 | 11.59 [3.59, 19.92] |
| 3 Super | 4 | 40 | 159/51/75/23 | 100/40/41/34 | 40.5/68.9/51.0 | 49.4/54.1/51.6 | 0.61 [-7.99, 7.93] |
| 3 Super | 5 | 40 | 151/49/74/25 | 97/39/38/35 | 39.8/66.2/49.7 | 50.6/52.7/51.7 | 1.91 [-4.72, 8.73] |
| 3 Super | 6 | 40 | 163/50/67/24 | 107/43/39/31 | 42.7/67.6/52.4 | 52.4/58.1/55.1 | 2.77 [-4.98, 10.54] |
| 3.5 Super | 7r | 40 | 116/45/49/29 | 79/37/25/37 | 47.9/60.8/53.6 | 59.7/50.0/54.4 | 0.84 [-8.49, 9.59] |
| 3.5 Super | 8 | 40 | 117/47/46/27 | 82/38/24/36 | 50.5/63.5/56.3 | 61.3/51.4/55.9 | -0.41 [-7.99, 6.98] |
| Ultra | 10 | 40 | 192/57/89/17 | 146/50/59/24 | 39.0/77.0/51.8 | 45.9/67.6/54.6 | 2.83 [-4.96, 10.46] |
| Ultra | 11 | 40 | 182/52/78/22 | 143/49/55/25 | 40.0/70.3/51.0 | 47.1/66.2/55.1 | 4.08 [0.19, 7.66] |

Answer: verification is better in 2/9 run comparisons by the interval rule (runs 2r, 11); 0 have intervals entirely below zero; the remaining 7 include zero or are unavailable.

### 3. Cheaper vote

3 Super, verified source; unchanged voteKeep, threshold 2 of 3, no cap. Each representative uses its own run's saved match. Delta compares vote F with the arithmetic mean of constituent-run F values, paired at PR level.

| Runs | n PRs | Vote comments / TP / FP / FN | Vote P/R/F | Individual run F (same order) | Three-run mean F | Delta-F [95% interval] |
|---|---:|---|---|---|---:|---|
| 4, 5, 6 | 40 | 88/36/36/38 | 50.0/48.6/49.3 | 51.6 / 51.7 / 55.1 | 52.8 | -3.48 [-9.38, 2.11] |
| 1, 2r, 4 | 40 | 69/35/20/39 | 63.6/47.3/54.3 | 44.6 / 53.4 / 51.6 | 49.9 | 4.38 [-0.57, 9.50] |

Answer: Neither three-run vote has a positive interval excluding zero against its three-run mean. This replay does not estimate the cost of new runs.

### 4. Where the misses are

3.5 verified, runs 7r and 8. Cells are missed-in-both / golden denominator. Low is shown separately from the Medium-or-higher scorer subtotal. Golden identity/order/severity is checked across runs. Counts only.

| Repo | n PRs | Low | Medium | High | Critical | Medium+ | All severities |
|---|---:|---:|---:|---:|---:|---:|---:|
| sentry | 10 | 10/11 | 7/10 | 5/10 | 0/1 | 12/21 | 22/32 |
| grafana | 10 | 4/6 | 4/6 | 5/9 | 0/1 | 9/16 | 13/22 |
| keycloak | 10 | 6/6 | 2/8 | 2/7 | 0/3 | 4/18 | 10/24 |
| discourse | 10 | 4/9 | 6/14 | 0/3 | 0/2 | 6/19 | 10/28 |
| total | 40 | 24/32 | 19/38 | 12/29 | 0/7 | 31/74 | 55/106 |

Answer: 31 of 74 Medium-or-higher goldens were missed in both runs across 40 PRs. The repository/severity counts localize persistent misses; they do not identify their causes.

## Reproduce and validation

`node scripts/bench/levers-v2.ts` prints these four tables per judge; `--json` prints all computed aggregate and per-run numbers without record text. `--bench <root>` may point to the saved benchmark root; reads stay within the dev paths and reject prohibited paths and symlink escapes. The script never calls the original run or judge entry points. Full unfiltered replay counts must equal every saved pull and repository summary before reporting.

Plan commit time in UTC: 2026-10-27 10:31:36; first computation started at
10:35:59.167 UTC, 4 minutes 23.167 seconds later. The plan push succeeded before
the script was run. The parameters in the pushed plan were unchanged.

Step 0: origin/main contained 36de717; the initial worktree was clean; the branch
was created from origin/main. Frozen-lockfile install exited 0 using cached
dependencies (pnpm's unrelated update check attempted a registry fetch and failed).
The baseline test run had only two 5-second timeouts: 944 analyzer tests passed,
2 timed out and 3 were skipped; rerunning the two files with --testTimeout 30000
passed all 41 tests in those files. Action had 237 passes; the subsequent viewer
run had 188 passes. Baseline typecheck passed in all 3 packages. Required records,
summaries and per-comment matches were present under both judges, including Ultra.

Final validation:

- `pnpm test`: 1,371 passed, 3 skipped, 0 failed (action 237, analyzer 946,
  viewer 188; 94 test files passed and 3 skipped). No timeout rerun was needed.
- `pnpm typecheck`: all 3 workspace packages passed.
- `node --test scripts/bench/levers-v2.test.ts`: 20 passed, 0 failed, 0 skipped.
  These standalone tests are run explicitly because workspace test globs do not
  include scripts/bench.
- Both new script files also passed a direct strict TypeScript check with the
  repository's compiler options; workspace tsconfigs do not include them.
- The required GIT environment check printed nothing before every gate.
- A second replay reproduced every numeric result exactly. Network and subprocess
  entry points were blocked for that replay, with 0 attempted calls.

No frozen prompt, helper, model, configuration, dependency, dataset or production
behavior was changed. No decision entry, tag, adoption or merge was made.
