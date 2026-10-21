# Nemotron 3.5 Super on dev: result (decision 067)

Plan: `docs/bench/dev-3.5-plan.md`, frozen before the first model call, with Amendment 1 (region
fix, run 7 void, new stop rule) committed in `164ead6` and pushed at 2026-10-21T16:41:45Z. The first
3.5 call (the probe) was sent at 16:42:15Z. Dev only: Cal.com was not opened, run or scored.
Script: `node scripts/bench/dev-3-5.ts` (no model call). The $8 cap stopped run 9, so under the plan's
fallback **runs 7r and 8 decide**.

**Verdict: adopt 3.5 Super as the Action's default (on 2 completed runs: the plan's fallback).** All
three conditions hold. v1 mean F is 50.4% against the 45.28% needed, and both 3.5 runs (50.7%, 50.0%)
are above every one of the five 3 Super runs (best 48.0%). v1 mean P is 54.8% against 40.52%. x1 mean
F is 55.1% against 51.29%. The x1 gain is smaller and its bootstrap interval includes 0. 3.5 also
costs about twice as much per pull request and fails to return valid JSON on about 7 of 40 pull
requests per run (below).

## Runs

| run | status | spend | allowance | wall time | reruns (failed request) |
|---|---|---|---|---|---|
| 7 | void: 35 × HTTP 404, wrong region (job 067, 20 Oct) | $0 | $8 | n/a | n/a |
| 7r | complete (061a restart, stands for run 7) | $3.1463 | $7.9943 | 123.6 min | 1 |
| 8 | complete | $2.9410 | $4.8480 | 108.9 min | 0 |
| 9 | stopped at the cap at pull request 24 of 40 | $1.8906 | $1.9070 | 69.6 min | 0 |

Run 7r's allowance is $8 minus $0.0057. The runner's void-run report counts ledger spend since the
void run started, and that includes the probe. The one rerun was grafana/3. Its attempt 1 had
`the reply is not valid JSON; retry request failed: fetch failed`, a transport error and not an HTTP
4xx/5xx. Attempt 2 is the one used, and it has no failure.

Amendment 1's stop rule, checked after run 7r and before run 8: 0 findings on 3 of 40 pull requests
(not all); no request-error failure string in the attempt used; 7 of 40 pull requests with a failed
reviewer chunk (≤ 10). Result: continue.

## pool-verify-v1, per run and mean

| judge | model | run | comments | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|---|---|---|
| judge-v1 | 3 Super | 1 | 83 | 26 | 46 | 48 | 36.1 | 35.1 | 35.6 |
| judge-v1 | 3 Super | 2r | 91 | 36 | 40 | 38 | 47.4 | 48.6 | 48.0 |
| judge-v1 | 3 Super | 4 | 100 | 35 | 50 | 39 | 41.2 | 47.3 | 44.0 |
| judge-v1 | 3 Super | 5 | 97 | 33 | 50 | 41 | 39.8 | 44.6 | 42.0 |
| judge-v1 | 3 Super | 6 | 107 | 34 | 55 | 40 | 38.2 | 45.9 | 41.7 |
| judge-v1 | 3 Super | **mean (5)** | | | | | **40.5** | **44.3** | **42.3** |
| judge-v1 | 3.5 Super | 7r | 79 | 35 | 29 | 39 | 54.7 | 47.3 | 50.7 |
| judge-v1 | 3.5 Super | 8 | 82 | 34 | 28 | 40 | 54.8 | 45.9 | 50.0 |
| judge-v1 | 3.5 Super | **mean (2)** | | | | | **54.8** | **46.6** | **50.4** |
| judge-x1 | 3 Super | 1 | 83 | 31 | 34 | 43 | 47.7 | 41.9 | 44.6 |
| judge-x1 | 3 Super | 2r | 91 | 39 | 33 | 35 | 54.2 | 52.7 | 53.4 |
| judge-x1 | 3 Super | 4 | 100 | 40 | 41 | 34 | 49.4 | 54.1 | 51.6 |
| judge-x1 | 3 Super | 5 | 97 | 39 | 38 | 35 | 50.6 | 52.7 | 51.7 |
| judge-x1 | 3 Super | 6 | 107 | 43 | 39 | 31 | 52.4 | 58.1 | 55.1 |
| judge-x1 | 3 Super | **mean (5)** | | | | | **50.9** | **51.9** | **51.3** |
| judge-x1 | 3.5 Super | 7r | 79 | 37 | 25 | 37 | 59.7 | 50.0 | 54.4 |
| judge-x1 | 3.5 Super | 8 | 82 | 38 | 24 | 36 | 61.3 | 51.4 | 55.9 |
| judge-x1 | 3.5 Super | **mean (2)** | | | | | **60.5** | **50.7** | **55.1** |

n = 74 golden comments per run, with 0 JUDGE_FAILED in any run. The rule is F (v1) 50.4 ≥ 45.3 pass,
P (v1) 54.8 ≥ 40.5 pass, and F (x1) 55.1 ≥ 51.3 pass.

The gain is in precision. Recall moves by +2.3 points under v1 and −1.2 under x1. 3.5 Super makes
fewer comments (79 and 82 against 83–107) and about half the FPs (28–29 against 40–55).

## Paired bootstrap (10,000 resamples, seed 67, 40 pull requests)

| judge | mean F difference (3.5 − 3) | 95% interval | resamples below 0 |
|---|---|---|---|
| judge-v1 (scorer of record) | +8.1 points | [+1.4, +14.4] | 0.9% |
| judge-x1 | +3.9 points | [−4.2, +11.1] | 16.8% |

The bootstrap is reported and is not part of the rule. It resamples pull requests, not runs. With only 2
candidate runs, it does not capture the run-to-run spread, which was 12.4 F points across the five 3
Super runs.

## Tokens and cost per pull request (pipeline only, judges excluded, every attempt counted)

| pipeline per pull request | n | input tokens median | output tokens median | output tokens mean | cost median | cost mean | cost max |
|---|---|---|---|---|---|---|---|
| 3 Super (runs 1, 2r, 4, 5, 6) | 200 | 41,393 | 19,688 | 27,546 | $0.0307 | $0.0430 | $0.2724 |
| 3.5 Super (runs 7r, 8) | 80 | 49,357 | 50,064 | 62,471 | $0.0626 | $0.0743 | $0.3031 |
| 3.5 Super (runs 7r, 8 and the 23 PRs of run 9) | 103 | 50,151 | 52,510 | 63,497 | $0.0642 | $0.0756 | $0.3397 |

3.5 Super writes about 2.5 times as many output tokens, and its median cost per pull request is
about 2 times 3 Super's (the prices in `config/prices.json`). Wall time per pull request: median
121 s (7r) and 130 s (8).

## Failed reviewer chunks (attempt used; all invalid JSON after one retry)

| run | PRs with a failed chunk | failed chunks | VERIFY_FAILED |
|---|---|---|---|
| 7r | 7 of 40 | 8 | 1 |
| 8 | 7 of 40 | 8 | 0 |
| 9 (partial) | 4 of 23 | 4 | 2 |
| 3 Super runs 2r, 4, 5, 6 (for comparison) | 1, 0, 0, 0 of 40 | 1, 0, 0, 0 | n/a |

Every failure string, chunk and verifier alike, is
`the reply is not valid JSON; after one retry: the reply is not valid JSON`. Per pull request:

| run | PR | chunks |
|---|---|---|
| 7r | grafana/0 | diff#0, ctx#0 |
| 7r | grafana/1 | diff#0 |
| 7r | grafana/2 | diff#0 |
| 7r | grafana/6 | ctx#0 |
| 7r | keycloak/6 | ctx#0 |
| 7r | sentry/2 | ctx#0 |
| 7r | sentry/5 | ctx#0 |
| 8 | discourse/8 | ctx#0 |
| 8 | grafana/1 | diff#0, ctx#0 |
| 8 | grafana/6 | ctx#0 |
| 8 | keycloak/6 | ctx#0 |
| 8 | sentry/4 | ctx#0 |
| 8 | sentry/5 | ctx#0 |
| 8 | sentry/9 | diff#0 |
| 9 | grafana/1 | ctx#0 |
| 9 | keycloak/0 | ctx#0 |
| 9 | sentry/4 | ctx#2 |
| 9 | sentry/5 | ctx#0 |

The chunk records do not hold per-chunk token counts. The ledger shows that 79 of the 624 3.5 calls
in this job returned exactly 32,000 output tokens, the reviewers' `max_tokens`. This is consistent with
reasoning using up the budget before the JSON is written, but it was not checked call by call. A
further 15 / 12 / 16 chunks (7r / 8 / 9) were invalid on the first reply and valid on the retry. Under
Amendment 1 these failures are the candidate's result: a failed chunk contributes no findings, and
its pull request is scored on whatever comments remain. The scores above include that cost.

## Spend

Nebius ledger: $25.82199 before the job and $33.80558 after, so **$7.98359**. That is under the $8 cap
and includes the probe ($0.0057). By model: 3.5 Super 624 calls, $7.870 (623 ok, 1 transport
failure); bench-judge-v1 (3 Super) 130 calls, $0.094; bench-judge-x1 (Qwen) 130 calls, $0.020.

## Limits

- 2 candidate runs, not the 3 planned. The cap stopped run 9, so the mean rests on two runs.
- bench-judge-v1 is Nemotron 3 Super, the baseline's own reviewer model. Opinion: if that biases
  anything, it favours the baseline, and the x1 judge also puts 3.5 ahead, by less.
- Dev only, the same 40 pull requests the pipeline was built on. Nothing here is a Cal.com result.
