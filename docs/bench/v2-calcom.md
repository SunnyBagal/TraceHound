# v2 blind Cal.com run: result (decision 069)

**This is the second look at Cal.com.** The first was 062 (`review-freeze-1`, 3 Super). The
configuration was chosen on dev (067, 068) before this look. Nothing is tuned after it, and there
is no second v2 run. Plan: `docs/bench/v2-calcom-plan.md`, pre-registered in `b2ec214` and pushed
at 13:38:03Z on 23 Oct. The first 3.5 call on Cal.com came after that, at 13:38:51Z. Counts only:
no titles, comments, golden text or code. Records are in the bench folder, under
`test/run-4-nvidia-nemotron-3-5-super-vl/`.

## The run

| | |
|---|---|
| configuration | pool-verify-v1 at `review-freeze-2` (`0aeef06`); every stage on `nvidia/Nemotron-3.5-Super-VL` (us-north1); prompts `f77c2031…` / `0c4dcdcf…` / `75703fc6…`; temperature 0, reasoning on |
| runner head | `b2ec214` (freeze check 069 passed: `packages/analyzer/src`, `config` and `scripts/bench` minus the runner equal the tag) |
| gate / decision in run.json | `069` / `069` |
| status | complete, 10 of 10 pull requests, 23 min 36 s wall (13:38:51Z–14:02:27Z) |
| reruns (061) / restarts (061a) | 0 / 0 |
| JUDGE_FAILED | 0 in every row under both judges |
| spend | run $0.7228 of the $3 allowance (pipeline $0.7086, judging $0.0142); routing check $0.0057 |

## Headline: Cal.com, n = 23 golden comments

The 3.5 rows are Cal.com run 4. Every other row is Cal.com run 1's judged row, unchanged
(`test-results.md`).

### bench-judge-v1 (scorer of record)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **pool-verify-v1 (3.5, run 4)** | 30 | 12 | 7 | 11 | 0 | 11 | 0 | 63.2% (12/19) | 52.2% (12/23) | **57.1%** |
| review-diff-v1 (3.5, run 4) | 30 | 12 | 6 | 12 | 0 | 11 | 0 | 66.7% (12/18) | 52.2% (12/23) | 58.5% |
| pool-raw (3.5, run 4) | 34 | 13 | 9 | 12 | 0 | 10 | 0 | 59.1% (13/22) | 56.5% (13/23) | 57.8% |
| pool-verify-v1 (3 Super, run 1) | 30 | 14 | 11 | 4 | 1 | 9 | 0 | 56.0% (14/25) | 60.9% (14/23) | 58.3% |
| augment | 23 | 15 | 3 | 4 | 1 | 8 | 0 | 83.3% (15/18) | 65.2% (15/23) | 73.2% |
| cursor | 21 | 13 | 3 | 4 | 1 | 10 | 0 | 81.3% (13/16) | 56.5% (13/23) | 66.7% |
| greptile | 24 | 10 | 7 | 1 | 6 | 13 | 0 | 58.8% (10/17) | 43.5% (10/23) | 50.0% |
| copilot | 49 | 15 | 27 | 6 | 1 | 8 | 0 | 35.7% (15/42) | 65.2% (15/23) | 46.2% |
| coderabbit | 31 | 9 | 17 | 3 | 2 | 14 | 0 | 34.6% (9/26) | 39.1% (9/23) | 36.7% |

3 Super pool-verify-v1, Cal.com runs 1–3 (min / median / max): P 46.7% / 55.6% / 56.0%, R 47.6% /
60.9% / 60.9%, F 51.3% / 52.8% / 58.3%.

### bench-judge-x1 (report only)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **pool-verify-v1 (3.5, run 4)** | 30 | 12 | 6 | 12 | 0 | 11 | 0 | 66.7% (12/18) | 52.2% (12/23) | **58.5%** |
| review-diff-v1 (3.5, run 4) | 30 | 12 | 5 | 13 | 0 | 11 | 0 | 70.6% (12/17) | 52.2% (12/23) | 60.0% |
| pool-raw (3.5, run 4) | 34 | 13 | 7 | 13 | 1 | 10 | 0 | 65.0% (13/20) | 56.5% (13/23) | 60.5% |
| pool-verify-v1 (3 Super, run 1) | 30 | 14 | 11 | 3 | 2 | 9 | 0 | 56.0% (14/25) | 60.9% (14/23) | 58.3% |
| augment | 23 | 15 | 3 | 4 | 1 | 8 | 0 | 83.3% (15/18) | 65.2% (15/23) | 73.2% |
| cursor | 21 | 13 | 3 | 4 | 1 | 10 | 0 | 81.3% (13/16) | 56.5% (13/23) | 66.7% |
| greptile | 24 | 11 | 6 | 1 | 6 | 12 | 0 | 64.7% (11/17) | 47.8% (11/23) | 55.0% |
| copilot | 49 | 16 | 24 | 5 | 4 | 7 | 0 | 40.0% (16/40) | 69.6% (16/23) | 50.8% |
| coderabbit | 31 | 9 | 16 | 3 | 3 | 14 | 0 | 36.0% (9/25) | 39.1% (9/23) | 37.5% |

3 Super pool-verify-v1, Cal.com runs 1–3 (min / median / max): P 40.6% / 56.0% / 63.2%, R 52.2% /
56.5% / 60.9%, F 47.3% / 57.1% / 58.3%.

What the tables show, as point estimates:
- v2 pool-verify-v1 is 3rd of six on F under both judges, behind Augment and Cursor and ahead of
  Greptile, Copilot and CodeRabbit.
- Its F (57.1% under v1) is inside 3 Super's Cal.com range (51.3–58.3%) and 1.2 points below 3 Super's
  run 1.
- Precision is higher (63.2% vs 56.0%) and recall lower (12 vs 14 TP).
- 11 of its 30 comments were judged duplicates (3 Super run 1: 4). Duplicates count neither as TP nor
  as FP.
- On this run, verify-ctx-v1 did not raise F over review-diff-v1 alone (57.1% vs 58.5% under v1).

## Predictions

| | prediction | result | |
|---|---|---|---|
| (a) | pool-verify-v1 F (v1) ≥ 52.8% | 57.1% | **right** |
| (b) | pool-verify-v1 precision (v1) ≥ 55.6% | 63.2% (12/19) | **right** |
| (c) | at most 3 of 10 pull requests with a failed reviewer chunk | 1 of 10 | **right** |

## Failed chunks, kept counts, tokens and cost

| pull request (order in the run) | stage | chunks | failure (first 120 characters) |
|---|---|---|---|
| PR 4 | review-diff-v1 | chunk 0 of 1 | `the reply is not valid JSON; after one retry: the reply is not valid JSON` |
| PR 4 | review-ctx-v1 | chunk 0 of 1 | `the reply is not valid JSON; after one retry: the reply is not valid JSON` |

- 2 of 20 reviewer chunks failed, both in one pull request. Both of its reviewers failed, so it was
  scored with no findings, as pre-registered. 0 request failures, 0 VERIFY_FAILED.
- 10 of the 64 3.5 responses (63 in the run, plus the routing check) had exactly 32,000 completion
  tokens, the request's `max_tokens`.
- **Kept findings per pull request (pool-verify-v1):** 4, 2, 1, 0, 9, 2, 6, 2, 3, 1 (total 30). More
  than 10: **0**. More than 15: 0. So neither the Action's default `max-comments` (15) nor the
  dogfood workflow's 10 would have cut anything on this set.
- **Cost per pull request:** median $0.0717, max $0.1298, against 3 Super's run 1 median of $0.0391.
- **Tokens per pull request (all stages):** input median 55,800, max 97,400; output median 55,933, max
  128,000.
- **Wall time per pull request:** median 128 s, max 285 s.

## All 50 pull requests (v2), report only

This uses 066's method: micro sums of TP and FP over the 40 dev and 10 Cal.com pull requests, with
FN = 97 − TP. The TraceHound rows are Cal.com run 4 plus dev run 7r (pre-registered) or dev run 8
(a second dev draw), with dev counts from `dev-3.5.md:44-45` and `:53-54`. The tool rows are 066's
(`results.md` section 5), unchanged. Ranks are point estimates. Each TraceHound row is ranked against
the five tools, and the tools are ranked with the 7r row.

The sums were done by a throwaway script under `runs/` (not committed). 066 had no script either.
On run 1 the same script gives 066's row (i) exactly: TP 40, FP 57.

### bench-judge-v1

| reviewer | rank of 6 | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 16 | 41 | 77.8% (56/72) | 57.7% (56/97) | 66.3% |
| Cursor | 2 | 42 | 17 | 55 | 71.2% (42/59) | 43.3% (42/97) | 53.8% |
| **TraceHound v2: dev run 7r + Cal.com run 4** | 3 | 47 | 36 | 50 | 56.6% (47/83) | 48.5% (47/97) | **52.2%** |
| TraceHound v2: dev run 8 + Cal.com run 4 (second dev draw) | 3 | 46 | 35 | 51 | 56.8% (46/81) | 47.4% (46/97) | 51.7% |
| Greptile | 4 | 45 | 40 | 52 | 52.9% (45/85) | 46.4% (45/97) | 49.5% |
| CodeRabbit | 5 | 41 | 67 | 56 | 38.0% (41/108) | 42.3% (41/97) | 40.0% |
| Copilot | 6 | 43 | 104 | 54 | 29.3% (43/147) | 44.3% (43/97) | 35.2% |

### bench-judge-x1

| reviewer | rank of 6 | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 17 | 41 | 76.7% (56/73) | 57.7% (56/97) | 65.9% |
| Cursor | 2 | 45 | 11 | 52 | 80.4% (45/56) | 46.4% (45/97) | 58.8% |
| **TraceHound v2: dev run 7r + Cal.com run 4** | 3 | 49 | 31 | 48 | 61.3% (49/80) | 50.5% (49/97) | **55.4%** |
| TraceHound v2: dev run 8 + Cal.com run 4 (second dev draw) | 3 | 50 | 30 | 47 | 62.5% (50/80) | 51.5% (50/97) | 56.5% |
| Greptile | 4 | 49 | 32 | 48 | 60.5% (49/81) | 50.5% (49/97) | 55.1% |
| CodeRabbit | 5 | 45 | 58 | 52 | 43.7% (45/103) | 46.4% (45/97) | 45.0% |
| Copilot | 6 | 50 | 91 | 47 | 35.5% (50/141) | 51.5% (50/97) | 42.0% |

For comparison, 066's 3 Super row (i), dev run 1 + Cal.com run 1, was 4th of 6: v1 F 41.2%, x1
48.1%. Under x1 the v2 row is 0.3 points above Greptile (55.4% vs 55.1%), which is a tie at this n.

## Where this measurement and the Action differ

These are as pre-registered. Contracts and fixes are not run here, and learn is off. The bench reruns
a pull request once on a request failure (none happened). The Action marks partial reviews. On
max-comments, no Cal.com pull request had more than 10 kept findings, so here that difference did
not change what would have been posted.

## Limits

- n = 23 golden comments, one run, and this is the **second look** at Cal.com. The configuration was
  selected on dev, so this run tests that choice and is not a basis for another one.
- At temperature 0, 3 Super's three Cal.com runs spread 7 F points under v1 (51.3–58.3%). One 3.5 run
  cannot separate 3.5 from 3 Super on Cal.com. The F difference to 3 Super's run 1 (−1.2 points) is
  well inside that spread.
- The tools' rows are single recorded reviews, judged once in Cal.com run 1. No interval is computed
  here. 066 found that, for 3 Super's run 1, no gap to a tool was outside its 95% interval. With 23
  golden comments, gaps of a few points like the ones here are not separable either.
- bench-judge-v1 is Nemotron 3 Super, and the reviewer is now Nemotron 3.5 Super: the same family,
  but no longer the same model as the judge of record.
- `docs/bench/results.md`, the README and the viewer are not updated here. That is a separate job.
