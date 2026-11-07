# claude r1 — tie-breaking facts (orchestrator lane)

## TL;DR
1. Frozen = `review-freeze-2` (`0aeef06`); 2.1 (`86fd5d7`) changes only the Action install step (072). Nothing in the review path changed since.
2. Cal.com is spent (062 + 069 = two looks; 069 "the plan allows one look"; 069b limits "no further Cal.com run is allowed").
3. Dev 3.5 runs 7r+8, per golden-run (148 = 74 × 2): **hit 69, generator miss 56, verifier drop 23.** Generator misses are 71% of recall loss.
4. 16 of the 56 generator misses are in PRs where a reviewer chunk failed (upper bound for "chunk failures cost recall").
5. Verifier on 3.5 dev: removed 42 FP and 22 TP comment-instances (raw 91 TP / 99 FP → verified 69 / 57).
6. Verified FPs (57) are mostly *stable*: ~38 of them are 19 findings that recur in both runs → FPs are systematic, not sampling noise (explains why voting (064, levers-v2) can't remove them).
7. ~14 of 57 verified FPs are "symbol X is undefined / not imported / not declared" claims — checkable without a model (grep/resolver at head).
8. Cost split, 3.5 dev 2 runs (81 PR attempts, $5.94 pipeline): diff reviewer 39%, ctx reviewer 48%, verifier 13%. Output tokens (mostly reasoning) dominate.
9. Graph is not used in the review path: no snapshot/impact import in `packages/analyzer/src/review/*.ts` or `packages/action/src/pipeline.ts` (grep at HEAD).
10. Source: `~/Projects/tracehound-bench/reviews/dev-repeat/run-7-…vlr`, `run-8-…` (dev repos only; Cal.com files never opened). Counts only below.

## 1. Recall attribution (bench-judge-v1, Medium+, 3.5 runs 7r + 8)
| outcome per golden-run | count | share |
|---|---:|---:|
| credited in pool-verify-v1 (hit) | 69 | 46.6% (= published mean R) |
| in pool-raw, dropped by verifier | 23 | 15.5% |
| not in pool-raw, PR had no failed chunk | 40 | 27.0% |
| not in pool-raw, PR had ≥1 failed reviewer chunk | 16 | 10.8% |
Raw-miss in both runs: 24 goldens (sentry 8, discourse 8, grafana 6, keycloak 2; 10 High, 14 Medium).
Verifier-dropped in both runs: 6 goldens.
By hand, the 24 never-generated goldens are (approximate, my reading): security/authz/origin validation ~9;
wrong key / naming / consistency ~3; concurrency/process ~3; data migration/normalisation ~3; nil handling ~2;
test-code bugs ~2; compile error ~1. Several of the security ones span files outside the hunk (context-reach misses).

## 2. Chunk failures (attempt records)
diff reviewer 6 of 97 chunks CHUNK_FAILED; ctx reviewer 11 of 97. 17 PR-stage failures over 2 runs
(7r: diff 4, ctx 5; 8: diff 2, ctx 6). DiffIndex drops: 3 findings total (line-not-in-new-version), so
anchoring is not a loss source.

## 3. Verified FPs (57 over 2 runs), my categorisation, approximate
| category | ~count | model-free check possible? |
|---|---:|---|
| changed-behaviour/semantics claims (flags, offsets, ordering, permissions) | ~25 | no |
| "symbol undefined / not imported / not declared / wrong type" | ~14 | **yes** (grep / ts-morph / compiler at head) |
| missing nil / exception handling (defensive) | ~13 | partly |
| security (injection, regex, decoding) | ~5 | no |
Caveat (060 validity-v1): 187 (Super) / 265 (Qwen) of 324 deduplicated v1 FPs were judged valid issues →
part of "FP" is the golden set's incompleteness, not reviewer error. Precision has a soft ceiling under this judge.

## 4. Stage cost (same records; usage fields in attempt files)
| stage | calls | input tok | output tok | $ | share |
|---|---:|---:|---:|---:|---:|
| review-diff-v1 | 115 | 1.15M | 2.19M | 2.32 | 39% |
| review-ctx-v1 | 122 | 2.57M | 2.33M | 2.87 | 48% |
| verify-ctx-v1 (diff findings) | 185 | 0.87M | 0.35M | 0.58 | 10% |
| verify-ctx-v1 (ctx-only findings) | 57 | 0.23M | 0.13M | 0.18 | 3% |
Per PR attempt: median $0.0623, mean $0.0734 (matches dev-3.5.md). Reviewers emit ~19k output tokens per call
(reasoning on) vs ~6k for the verifier. The cheapest lever is reviewer reasoning length, not the verifier.

## 5. Facts for adjudication
- Verifier on/off on 3.5: inconclusive (levers-v2: 7r −1.6 [−10.0, +5.5], 8 −5.4 [−14.7, +3.3]); on Cal.com run 4 it lowered F 58.5 → 57.1.
  So "the verifier cuts recall 61.5 → 46.6" is a correct *recall* statement but not an F loss that's been shown.
- Every lever since 059 except the 3.5 model swap lost or was report-only. The 3.5 gain was precision (half the FPs), not recall.
- Dev set: 40 PRs reused by ≥17 decisions; any further dev selection is weak evidence.
