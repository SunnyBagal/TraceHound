# v2 blind Cal.com run: pre-registered plan (decision 069)

Written and pushed before any Nemotron 3.5 call on Cal.com. Brief: `docs/prompts/069-v2-calcom.md`.
This file is not edited after that push; anything that changes later is reported in
`docs/bench/v2-calcom.md` as a deviation.

## Configuration

- **pool-verify-v1 at `review-freeze-2`** (`0aeef06fa8742cc8a36581c3894e554b8748c965`, the #57
  merge). The runner (`scripts/bench/run-test-set.ts`, `scripts/bench/test-set.ts`) is the only
  change; its freeze check (`freezeCheck069`) refuses to start unless `packages/analyzer/src` and
  `config` equal the tag and `scripts/bench` equals it except those two files, all committed.
- **Every stage on `nvidia/Nemotron-3.5-Super-VL`** (review-diff-v1, review-ctx-v1, verify-ctx-v1),
  served from us-north1 through #55's routing (`baseUrlFor` in `packages/analyzer/src/llm/client.ts`).
- **Prompts byte-identical to 061's pins,** recomputed as the sha256 of each system prompt at this
  commit:
  - review-diff-v1 `f77c203105111e02222d8f1c985a4629d9ac8cdd07b465fdb526cf1dddea4849`
  - review-ctx-v1 `0c4dcdcf4d764919b87c581278943e1c6d7b0714aa72b0f3cf60aa0f728089e0`
  - verify-ctx-v1 `75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70`
- Temperature 0, reasoning on, `max_tokens` unchanged (32,000 for both reviewers, 16,000 for the
  verifier, as the runner's tests pin).
- Command, once: `TRACEHOUND_BUDGET_RUN_USD=3 TRACEHOUND_TEST_RUN=069 node scripts/bench/run-test-set.ts
  --set cal_dot_com --run 4 --model nvidia/Nemotron-3.5-Super-VL`. Records go to
  `test/run-4-nvidia-nemotron-3-5-super-vl/` in the bench folder; `run.json` records the model, the
  gate id `069` and the freeze tag. Cap `CAP_069_USD` = $3, planned $1.50.
- 061's rerun rule (a pull request with a failed **request** is rerun once, the first attempt kept)
  and 061a's restart rule (a crashed run, status `running` with nothing under `scores/`, may be
  restarted once into `run-4r-…`, which stands for run 4) apply unchanged. Low scores and invalid-JSON
  chunks are the result, never a reason to restart.

## Failed chunks

A reviewer chunk whose reply is invalid after one retry is `CHUNK_FAILED` and contributes no
findings; the pull request is scored on the findings the other chunks produced. If every chunk fails,
the pull request is scored with no findings. That is how this runner and the dev runs already score
them:

- `packages/analyzer/src/review/review.ts:192-196` (review-diff-v1) and
  `packages/analyzer/src/review/review-ctx.ts:111-114` (review-ctx-v1): the chunk is marked
  `CHUNK_FAILED` and skipped (`continue`); the comments of the other chunks are returned.
- `scripts/bench/run-test-set.ts:426-428`: the three rows are written from those comments, with no
  check on `chunkFailed`.

It is also the Action's rule since decision 068.

## Rows

- **Primary:** pool-verify-v1 (3.5).
- **Declared secondaries:** review-diff-v1 (3.5) and pool-raw (3.5).
- **Comparison table:** Cal.com run 1's judged rows, unchanged: the five tools and 3 Super's
  pool-verify-v1, with 3 Super's Cal.com runs 1–3 as its spread (`docs/bench/test-results.md`).
  Nothing else.

Run 4 judges only the three TraceHound rows; the tools' reviews do not change between runs.

## Scorer and metrics

As 061: bench-judge-v1 is the scorer of record, bench-judge-x1 is shown alongside. Micro precision,
recall and F over the 23 golden comments of Medium or higher. JUDGE_FAILED pull requests are left out
and counted.

## One run

This is the **second look** at Cal.com (the first was 062, from `review-freeze-1`), and the results
say so. There is no second v2 run, and no configuration change follows from it, whatever it shows.

## Predictions (written by chat, 23 Oct, before any v2 Cal.com call)

- **(a)** v2 pool-verify-v1 F under v1 ≥ **52.8%**, the median of 3 Super's Cal.com runs 1–3
  (51.3% / 52.8% / 58.3%).
- **(b)** v2 pool-verify-v1 precision under v1 ≥ **55.6%**, 3 Super's median P on Cal.com runs 1–3
  (46.7% / 55.6% / 56.0%). On dev, the gain was precision.
- **(c)** **At most 3 of the 10** pull requests have a failed reviewer chunk (dev: 7 of 40 per run;
  Cal.com pull requests are larger).

## All 50 pull requests (v2), report only

Cal.com run 4 plus **dev run 7r** (the first complete 3.5 dev run), under both judges, built with
066's method: micro sums of TP and FP over the 40 dev and 10 Cal.com pull requests, FN = 97 − TP,
P = TP / (TP + FP), R = TP / 97. 066 used no script for this: its tables are sums of published counts
(decision 066; `docs/bench/audit-cc01.md` §3.1, "the sum of `pool-verify.md:35` and
`test-results.md:21`"). This job does the same sum, with dev run 7r's counts from
`docs/bench/dev-3.5.md:44` (v1) and `:53` (x1) and Cal.com run 4's from its `scores/*.summary.json`.
Dev run 8 (`dev-3.5.md:45`, `:54`) is shown alongside as a second dev draw. The tools' all-50 rows
come from 066 (`docs/bench/results.md` section 5) unchanged.

## Where this measurement and the Action differ

- **contracts:** the Action posts contract findings in the review body, about files the pull request
  didn't edit (`contracts` input, default `on`); the bench doesn't run them.
- **max-comments:** the Action includes at most `max-comments` findings per pull request (its default
  is **15**, `.github/actions/tracehound-review/action.yml:15-18`; this repo's dogfood workflow sets
  **10**); the bench scores every kept finding. The results report how many Cal.com pull requests had
  more than 10 kept, and more than 15.
- **reruns:** the bench reruns a pull request once on a request failure; the Action doesn't.
- **fixes and learn:** not scored; learn is off by default. Fixes stay on 3 Super in the Action (068).
- **partial-review note:** the Action marks a review with a failed reviewer chunk as partial
  (failed/total in the footer, 068); the bench scores the findings without that note.
