# Repository context for the reviewer: review-ctx-v1 (decision 057)

review-ctx-v1 is review-diff-v1 (decision 055) with one change: after the diff, each chunk's
request also holds a block of repository context, built without a model at the pull request's head
commit (`tracehound review-ctx`, `packages/analyzer/src/review/context.ts`). The block holds the
changed files with new-version line numbers, then lines elsewhere in the repository that mention the
functions and classes the diff changes. It is capped at 40,000 characters per chunk. Run 2026-10-15
on the 40 dev pull requests (sentry, grafana, keycloak, discourse); Cal.com was not read, fetched,
cloned, reviewed or scored. Nemotron Super, temperature 0, reasoning on, one run. The system prompt's
sha256 is `0c4dcdcf…728089e0`; the prompt was frozen before the first run. Scored with `bench-judge-v1`
unchanged (one judge). Counts only: comment text, context text and per-comment detail stay in
`~/Projects/tracehound-bench/`.

Precision = TP / (TP + FP), recall = TP / (TP + FN), and F is their harmonic mean, all from summed
counts. "low" counts comments that matched a Low golden comment (they score nothing). n = 74 golden
comments of Medium or higher (sentry 21, grafana 16, keycloak 18, discourse 19). Every review file
mapped to its golden entry (40 of 40), with 0 JUDGE_FAILED. The review-diff-v1 rows are 055's,
unchanged.

## Repositories (step 2)

Each dev repo has a bare clone of the `ai-code-review-evaluations/greptile-<repo>` fork, plus
`refs/pull/<n>/head` for its 10 pull requests (`scripts/bench/fetch-repos.ts`). Sizes on disk:
sentry 582 MB, grafana 955 MB, keycloak 517 MB, discourse 729 MB. The first clone pass took 311 s.
Each head matches the fork's `headRefOid`. Each head's `git diff <merge base> <head>` was compared
with the diff saved in 055: 0 of 40 match by exact sha256, and 40 of 40 match once `index` lines
and the function context after each hunk header's second `@@` are dropped from both. git's default
funcname rule and GitHub's language-aware rule label hunks differently; every other line is equal.
The reviewer is still sent the saved diff, as in 055.

## Overall and per repo, Super

| run · repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **review-diff-v1 · overall** | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| review-diff-v1 · sentry | 40 | 8 | 27 | 2 | 3 | 13 | 0 | 22.9% (8/35) | 38.1% (8/21) | 28.6% |
| review-diff-v1 · grafana | 20 | 5 | 8 | 3 | 4 | 11 | 0 | 38.5% (5/13) | 31.3% (5/16) | 34.5% |
| review-diff-v1 · keycloak | 53 | 9 | 43 | 1 | 0 | 9 | 0 | 17.3% (9/52) | 50.0% (9/18) | 25.7% |
| review-diff-v1 · discourse | 30 | 10 | 15 | 2 | 3 | 9 | 0 | 40.0% (10/25) | 52.6% (10/19) | 45.5% |
| **review-ctx-v1 · overall** | 133 | 21 | 37 | 4 | 71 | 53 | 0 | 36.2% (21/58) | 28.4% (21/74) | 31.8% |
| review-ctx-v1 · sentry | 24 | 6 | 15 | 2 | 1 | 15 | 0 | 28.6% (6/21) | 28.6% (6/21) | 28.6% |
| review-ctx-v1 · grafana | 9 | 3 | 3 | 1 | 2 | 13 | 0 | 50.0% (3/6) | 18.8% (3/16) | 27.3% |
| review-ctx-v1 · keycloak | 18 | 7 | 10 | 1 | 0 | 11 | 0 | 41.2% (7/17) | 38.9% (7/18) | 40.0% |
| review-ctx-v1 · discourse | 82 | 5 | 9 | 0 | 68 | 14 | 0 | 35.7% (5/14) | 26.3% (5/19) | 30.3% |

Precision rose from 25.6% to 36.2%, and FP fell from 93 to 37. Recall fell from 43.2% to 28.4% (TP
32 → 21), and F did not change by more than noise (32.2% → 31.8%). In discourse, 66 of the 82
comments come from one pull request (golden index 6, which has no Medium-or-higher golden comment).
64 of those 66 matched Low golden comments, which count as nothing, and 2 were FP. With one run, one judge and n = 74, differences of a few points are not
separated from noise.

## Per pull request (TP and FP)

| repo | golden index | diff-v1 TP | diff-v1 FP | ctx-v1 TP | ctx-v1 FP |
|---|---|---|---|---|---|
| sentry | 0 | 1 | 0 | 1 | 0 |
| sentry | 1 | 2 | 4 | 0 | 4 |
| sentry | 2 | 0 | 2 | 0 | 1 |
| sentry | 3 | 1 | 1 | 0 | 2 |
| sentry | 4 | 0 | 12 | 1 | 2 |
| sentry | 5 | 0 | 2 | 1 | 1 |
| sentry | 6 | 2 | 0 | 1 | 2 |
| sentry | 7 | 0 | 1 | 0 | 2 |
| sentry | 8 | 1 | 3 | 1 | 1 |
| sentry | 9 | 1 | 2 | 1 | 0 |
| grafana | 0 | 0 | 1 | 0 | 0 |
| grafana | 1 | 1 | 1 | 0 | 0 |
| grafana | 2 | 0 | 1 | 0 | 0 |
| grafana | 3 | 0 | 0 | 0 | 2 |
| grafana | 4 | 1 | 1 | 0 | 1 |
| grafana | 5 | 1 | 1 | 1 | 0 |
| grafana | 6 | 0 | 2 | 0 | 0 |
| grafana | 7 | 1 | 0 | 0 | 0 |
| grafana | 8 | 1 | 1 | 2 | 0 |
| grafana | 9 | 0 | 0 | 0 | 0 |
| keycloak | 0 | 1 | 0 | 1 | 1 |
| keycloak | 1 | 1 | 0 | 0 | 3 |
| keycloak | 2 | 1 | 18 | 1 | 0 |
| keycloak | 3 | 0 | 2 | 0 | 0 |
| keycloak | 4 | 1 | 2 | 0 | 4 |
| keycloak | 5 | 1 | 2 | 1 | 0 |
| keycloak | 6 | 1 | 19 | 1 | 1 |
| keycloak | 7 | 2 | 0 | 1 | 1 |
| keycloak | 8 | 0 | 0 | 1 | 0 |
| keycloak | 9 | 1 | 0 | 1 | 0 |
| discourse | 0 | 1 | 1 | 1 | 1 |
| discourse | 1 | 1 | 0 | 1 | 1 |
| discourse | 2 | 1 | 3 | 1 | 1 |
| discourse | 3 | 3 | 2 | 0 | 1 |
| discourse | 4 | 0 | 4 | 0 | 0 |
| discourse | 5 | 1 | 0 | 0 | 0 |
| discourse | 6 | 0 | 0 | 0 | 2 |
| discourse | 7 | 2 | 2 | 2 | 0 |
| discourse | 8 | 0 | 1 | 0 | 1 |
| discourse | 9 | 1 | 2 | 0 | 2 |

## Context statistics (review-ctx-v1)

| context statistic (review-ctx-v1, per chunk) | median | max | total |
|---|---|---|---|
| characters | 35919 | 39838 | 1602067 |
| changed names | 18 | 72 | 1037 |
| reference matches found | 712.5 | 8818 | 70494 |
| references selected (caps 8 / 30) | 30 | 30 | 1088 |
| references shown after the budget | 0 | 30 | 147 |

chunks 48 · budget cut something in 38 · references dropped in 36 · files cut to windows in 35 · files dropped in 33 · chunks with at least one reference shown 12 · chunks with no changed name 3

changed-file entries by status: cut-to-windows 147 · deleted 3 · dropped 278 · full 41 · windows 63

The budget cut something in 38 of 48 chunks. Under the job's cut order (references first, then
changed files to hunk windows), references were dropped in 36 chunks, and only 12 chunks kept at
least one reference: in most chunks the changed files alone filled the 40,000 characters. Once
every file was windowed and the block was still over budget, whole changed files were dropped,
last first. This last step is not in the job's text and was added so the cap always holds. It
happened in 33 chunks, to 278 of the 532 changed-file entries. So for most pull requests the
context was mostly the changed files near their hunks, with few references.

## Reviewer record

| run | pulls | chunks | calls (cached) | CHUNK_FAILED | findings | kept | dropped by reason | input tokens | output tokens | cost | wall per PR median / max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 40 | 48 | 51 (0) | 0 | 148 | 143 | malformed 1, path-not-in-diff 4, file-deleted 0, line-not-in-new-version 0 | 511657 | 383720 | $0.4988 | 31.5 s / 213.9 s |
| review-ctx-v1 | 40 | 48 | 51 (0) | 0 | 145 | 133 | malformed 0, path-not-in-diff 0, file-deleted 0, line-not-in-new-version 12 | 1112462 | 552847 | $0.8313 | 47.7 s / 330.9 s |

| judge on | calls | cost |
|---|---|---|
| review-diff-v1 | 37 | $0.0268 |
| review-ctx-v1 | 33 | $0.0260 |

Wall time is per pull request, with its chunks run in sequence and two pull requests in parallel.
The added context roughly doubled input tokens (511,657 → 1,112,462) and raised reviewer cost from
$0.4988 to $0.8313. In review-ctx-v1, 3 chunks needed the one retry for an invalid reply (51 calls for 48 chunks), and all 3 were valid on the retry. All 12 review-ctx-v1 drops were findings on a line that is not an added or
context line of the diff (055: 1 malformed, 4 path not in diff).

## The five recorded tools (dev only, from `docs/bench/baseline-diff.md`)

| Reviewer | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| CodeRabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| Augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| Cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| Copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |

| Reviewer | Repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | sentry | 26 | 9 | 15 | 1 | 1 | 12 | 0 | 37.5% (9/24) | 42.9% (9/21) | 40.0% |
| Greptile | grafana | 19 | 8 | 3 | 1 | 7 | 8 | 0 | 72.7% (8/11) | 50.0% (8/16) | 59.3% |
| Greptile | keycloak | 14 | 6 | 6 | 0 | 2 | 12 | 0 | 50.0% (6/12) | 33.3% (6/18) | 40.0% |
| Greptile | discourse | 25 | 12 | 9 | 2 | 2 | 7 | 0 | 57.1% (12/21) | 63.2% (12/19) | 60.0% |
| CodeRabbit | sentry | 25 | 9 | 13 | 1 | 2 | 12 | 0 | 40.9% (9/22) | 42.9% (9/21) | 41.9% |
| CodeRabbit | grafana | 11 | 6 | 3 | 0 | 2 | 10 | 0 | 66.7% (6/9) | 37.5% (6/16) | 48.0% |
| CodeRabbit | keycloak | 26 | 8 | 15 | 1 | 2 | 10 | 0 | 34.8% (8/23) | 44.4% (8/18) | 39.0% |
| CodeRabbit | discourse | 31 | 9 | 19 | 1 | 2 | 10 | 0 | 32.1% (9/28) | 47.4% (9/19) | 38.3% |
| Augment | sentry | 16 | 11 | 3 | 0 | 2 | 10 | 0 | 78.6% (11/14) | 52.4% (11/21) | 62.9% |
| Augment | grafana | 14 | 8 | 3 | 2 | 1 | 8 | 0 | 72.7% (8/11) | 50.0% (8/16) | 59.3% |
| Augment | keycloak | 14 | 11 | 1 | 2 | 0 | 7 | 0 | 91.7% (11/12) | 61.1% (11/18) | 73.3% |
| Augment | discourse | 25 | 11 | 6 | 3 | 5 | 8 | 0 | 64.7% (11/17) | 57.9% (11/19) | 61.1% |
| Cursor | sentry | 11 | 9 | 2 | 0 | 0 | 12 | 0 | 81.8% (9/11) | 42.9% (9/21) | 56.3% |
| Cursor | grafana | 14 | 7 | 4 | 1 | 2 | 9 | 0 | 63.6% (7/11) | 43.8% (7/16) | 51.9% |
| Cursor | keycloak | 8 | 6 | 1 | 0 | 1 | 12 | 0 | 85.7% (6/7) | 33.3% (6/18) | 48.0% |
| Cursor | discourse | 22 | 7 | 7 | 1 | 7 | 12 | 0 | 50.0% (7/14) | 36.8% (7/19) | 42.4% |
| Copilot | sentry | 33 | 6 | 25 | 0 | 2 | 15 | 0 | 19.4% (6/31) | 28.6% (6/21) | 23.1% |
| Copilot | grafana | 24 | 6 | 7 | 0 | 11 | 10 | 0 | 46.2% (6/13) | 37.5% (6/16) | 41.4% |
| Copilot | keycloak | 35 | 8 | 21 | 3 | 3 | 10 | 0 | 27.6% (8/29) | 44.4% (8/18) | 34.0% |
| Copilot | discourse | 39 | 8 | 24 | 1 | 6 | 11 | 0 | 25.0% (8/32) | 42.1% (8/19) | 31.4% |

## Prompt change

The system prompt is review-diff-v1's, byte for byte, plus one paragraph of three sentences. The
user message is review-diff-v1's, followed by the context block. review-diff-v1's sentence "You see
nothing else from the repository." is kept, because the job allowed no other change; the added
paragraph comes after it.

```diff
--- review-diff-v1
+++ review-ctx-v1
@@ -2,6 +2,8 @@
 
 You get the pull request's title, its description, and its unified diff (possibly one part of a larger diff). You see nothing else from the repository. In the diff, every added line ("+") and every unchanged context line (" ") is prefixed with its line number in the new version of the file; removed lines ("-") have no number.
 
+After the diff you also get a block between "<<<REPOSITORY CONTEXT" and "REPOSITORY CONTEXT>>>", taken from the repository at the pull request's head commit: the changed files with their line numbers in the new version, and lines elsewhere in the repository that mention the functions and classes the diff changes. Use it to check whether a problem you see in the diff is real and how callers use the changed code. Comment only on lines of the diff; a line that appears only in the context block is not a valid place for a finding.
+
 Report the defects in the changed code that you would block the merge for:
 - wrong behaviour: logic errors, wrong conditions, off-by-one errors, wrong values, missing cases, race conditions;
 - crashes: null or undefined access, unhandled errors, type errors at runtime;
```
