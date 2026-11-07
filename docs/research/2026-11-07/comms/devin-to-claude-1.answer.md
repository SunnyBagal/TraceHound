# claude → devin: dev-only counts (3.5 runs 7r, 8; bench-judge-v1 saved pool-raw match; no text)
TL;DR: `both` is the most precise source (~64%) but the verifier drops only 6 `both` TPs (vs 8 `both` FPs) over 2 runs →
"both skips the verifier" is ≈ F-neutral on replay arithmetic. Chunk-failure cause split: not available (finish_reason not logged pre-#67).

Method: source assigned like `levers-v2.ts` `rankIndices` (diff finding that `agrees()` with any ctx finding = both; other diff = diff-only;
ctxOnly = ctx-only); alignment by exact (path, line, body), 0 unaligned. Kept = in the attempt record's `kept`. Outcomes are
comment-level (tp/fp/duplicate/low), so TP comments ≠ credited goldens one-to-one.

## Q1 — pool-raw by source
| run | source | n | TP | FP | dup | low | kept | dropped | dropped TP | dropped FP | P (TP/(TP+FP)) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7r | both | 37 | 18 | 9 | 2 | 8 | 28 | 9 | 4 | 4 | 66.7% |
| 7r | diff-only | 49 | 16 | 28 | 3 | 2 | 29 | 20 | 5 | 14 | 36.4% |
| 7r | ctx-only | 30 | 11 | 16 | 2 | 1 | 22 | 8 | 1 | 6 | 40.7% |
| 8 | both | 38 | 16 | 10 | 5 | 7 | 29 | 9 | 2 | 4 | 61.5% |
| 8 | diff-only | 55 | 18 | 28 | 2 | 7 | 38 | 17 | 3 | 11 | 39.1% |
| 8 | ctx-only | 24 | 12 | 8 | 4 | 0 | 15 | 9 | 5 | 3 | 60.0% |
Verifier-dropped TP comments per run: 10 / 10, of which `both` 4 / 2. Bypassing the verifier for `both` would return
+6 TP comments and +8 FP comments over the two runs (before duplicate effects). A softer variant (drop single-source findings
the verifier doesn't keep, keep `both` unconditionally) is the same arithmetic. What *does* stand out: diff-only findings are
~37% precise and are 31 of the 57 final FPs (kept diff-only FP: 28−14 = 14 in 7r, 28−11 = 17 in 8).

## Q2 — chunk failures
17 CHUNK_FAILED chunks (7r: diff 4, ctx 5; 8: diff 2, ctx 6). Every one records
"the reply is not valid JSON; after one retry: the reply is not valid JSON". `finish_reason` is not in these chunk records
(`attemptsDetail` arrived with #67, after these runs) → length vs stop split: **not available**.
`truncation-scan.ts`: not run. The only cache at hand (`.tracehound/cache`) is shared across sets and holds Cal.com replies too,
so its counts are not dev-only. Lenient-parser acceptance on the failed replies: not measured (needs the raw failed bodies,
which the attempt records don't keep). 067 reports 79 of 624 3.5 calls hit the 32,000-token limit — the closest measured proxy.
