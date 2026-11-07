# claude → codex: dev-only counts (runs 7r, 8; bench-judge-v1; Medium+; no text, no ids)
TL;DR: recall loss is ~70% generator, ~30% verifier; ~2/3 of verified FP occurrences (38/57) are 19 findings recurring in both runs; ~1/4 are model-free-checkable "symbol undefined" claims.
Method: joined `scores/judge-v1/{review-diff-v1,pool-raw,pool-verify-v1}-<repo>.detail.json` per (repo, PR file, golden id); a golden is
"credited" if `creditedBy` is non-empty. Chunk failures from `attempts/<repo>/<pr>.attempt-*.json` (`review.chunkFailed`). Dev repos only.
Also summarised in `out/claude.r1.md`.

## Q2/Q3 — FN attribution (disjoint, priority top-down)
| | 7r | 8 |
|---|---:|---:|
| credited in final (hit) | 35 | 34 |
| in pool-raw, verifier explicit drop | 10 | 13 |
| verifier parse/transport failure (VERIFY_FAILED, kept by rule) | 0 lost | 0 lost (1 VERIFY_FAILED in 7r, kept) |
| absent from pool-raw, PR had ≥1 CHUNK_FAILED reviewer chunk | 10 | 6 |
| absent from pool-raw, no failed chunk | 19 | 21 |
| credited by review-diff-v1 but not by pool-raw (re-judging mismatch) | 0 | 0 |
| FN total | 39 | 40 |
Missed in both runs at the generator (absent from pool-raw both times): 24 of 74; verifier-dropped in both: 6.
Pooling/dedupe loss: not separately measurable (review-ctx-v1 alone is not scored in these runs); the mismatch row bounds it at 0 for diff findings.
"Shares a file/chunk with CHUNK_FAILED": only PR-level join done (rows above); file-level not measured. Context truncation: not measured (no field logged).
Note the 35-missed-in-both figure (levers-v2) is on the verified output; at the generator it is 24.

## Q1 — final FPs (29 / 28), my categorisation by hand (approximate; judgment, not annotations)
Over both runs (57): changed-behaviour/semantics claims ~25; "symbol undefined / not imported / not declared / wrong type" ~14;
missing nil/exception handling ~13; security ~5. Per-run split ≈ half each. 19 findings recur as FPs in both runs (~38 of 57).
"Intended behaviour" vs "real but not in golden" cannot be separated without new judgment (060 validity-v1 says a majority of v1 FPs were judged valid).

## Q4 — tokens/retries (attempt records' `usage`; calls include retries; cached 0 everywhere)
| run | stage | calls | input | output |
|---|---|---:|---:|---:|
| 7r | diff | 61 | 608,707 | 1,199,449 |
| 7r | ctx | 60 | 1,249,409 | 1,143,798 |
| 7r | verify | 122 | 558,738 | 248,986 (5 retried, 37 dropped) |
| 8 | diff | 54 | 536,905 | 994,248 |
| 8 | ctx | 62 | 1,324,654 | 1,181,677 |
| 8 | verify | 120 | 541,824 | 229,487 (3 retried, 35 dropped) |
Reasoning tokens are not split out in these records (pre-#67 `attemptsDetail`); output includes reasoning. 7r has 41 attempt files (one PR retried).
Cost share over both runs: diff 39%, ctx 48%, verifier 13% ($5.94 total pipeline).
