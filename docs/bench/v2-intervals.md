# v2 intervals: result (decision 069, note 069b)

Plan: `docs/bench/v2-intervals-plan.md`, pre-registered in `5e16e2b` and pushed at 16:07:42Z on
23 Oct. The first bootstrap ran at 16:09:13Z. No model or network call, $0. Counts and intervals
only: no titles, comments, golden text or code. Script: `node scripts/bench/intervals.ts`
(`--json` for every number), tests in `packages/analyzer/test/intervals.test.ts`.

Gaps are F(TraceHound v2) − F(other) in points. TraceHound v2 is pool-verify-v1 on Nemotron 3.5,
which is Cal.com run 4, plus dev run 7r on all 50. The other rows are as in `v2-calcom.md`: Cal.com run
1's tool rows, the tools' all-50 rows, and 3 Super's pool-verify-v1 (Cal.com run 1, all-50 row (i)).
Every per-PR input sums to its published total. 0 JUDGE_FAILED PRs were dropped from any pair.

## Methods

- **Primary:** PR-level paired bootstrap, 10,000 resamples, seed 69, the same PRs for both rows,
  micro F from summed counts, 2.5 / 97.5 percentiles. 10 PRs on Cal.com, 50 on all 50.
- **Secondary (the cc-01 audit's §3.2 (b)): not reproduced, so skipped.** The script recomputed the
  audit's 3 Super Cal.com run 1 table first. All ten v1 comment-level bounds matched to 0.0. Four
  of the ten inflated bounds were 0.1 off, and two were 0.2 off (Greptile's upper, 40.9 vs 40.7;
  Copilot's lower, −16.8 vs −16.6). Under x1, Greptile's lower bound was −21.3 vs −21.7 and Copilot's
  upper bound was 29.2 vs 29.4. The plan's bar was 0.1 on every bound, so the secondary column is
  "not reproduced" for every v2 gap. The likely cause is that the audit's draws were numpy's and these
  are mulberry32's, which matters most in the inflated bounds (they use the SD, not the lattice of
  F values). That is a guess, not checked.

## Cal.com, 10 PRs, n = 23

| judge | TraceHound v2 − | TP/FP/FN v2 | TP/FP/FN other | observed | primary 95% | share > 0 | secondary | allowed sentence |
|---|---|---|---|---|---|---|---|---|
| v1 | Augment | 12/7/11 | 15/3/8 | −16.0 | [−30.9, +3.5] | 0.044 | not reproduced | statistically tied with Augment |
| v1 | Cursor | 12/7/11 | 13/3/10 | −9.5 | [−30.2, +16.7] | 0.220 | not reproduced | statistically tied with Cursor |
| v1 | Greptile | 12/7/11 | 10/7/13 | +7.1 | [−15.8, +36.8] | 0.725 | not reproduced | statistically tied with Greptile |
| v1 | Copilot | 12/7/11 | 15/27/8 | +11.0 | [−6.2, +27.7] | 0.905 | not reproduced | statistically tied with Copilot |
| v1 | CodeRabbit | 12/7/11 | 9/17/14 | +20.4 | [+11.8, +34.3] | 1.000 | not reproduced | **ahead of CodeRabbit** |
| v1 | 3 Super pool-verify-v1 (run 1) | 12/7/11 | 14/11/9 | −1.2 | [−16.0, +12.2] | 0.414 | not reproduced | statistically tied with 3 Super |
| x1 | Augment | 12/6/11 | 15/3/8 | −14.6 | [−28.5, +4.4] | 0.054 | not reproduced | statistically tied with Augment |
| x1 | Cursor | 12/6/11 | 13/3/10 | −8.1 | [−27.9, +17.5] | 0.252 | not reproduced | statistically tied with Cursor |
| x1 | Greptile | 12/6/11 | 11/6/12 | +3.5 | [−17.1, +31.2] | 0.621 | not reproduced | statistically tied with Greptile |
| x1 | Copilot | 12/6/11 | 16/24/7 | +7.7 | [−8.3, +20.5] | 0.850 | not reproduced | statistically tied with Copilot |
| x1 | CodeRabbit | 12/6/11 | 9/16/14 | +21.0 | [+1.4, +37.0] | 0.981 | not reproduced | **ahead of CodeRabbit** |
| x1 | 3 Super pool-verify-v1 (run 1) | 12/6/11 | 14/11/9 | +0.2 | [−13.4, +13.1] | 0.506 | not reproduced | statistically tied with 3 Super |

## All 50 PRs, n = 97

| judge | TraceHound v2 − | TP/FP/FN v2 | TP/FP/FN other | observed | primary 95% | share > 0 | secondary | allowed sentence |
|---|---|---|---|---|---|---|---|---|
| v1 | Augment | 47/36/50 | 56/16/41 | −14.0 | [−22.6, −4.7] | 0.001 | not reproduced | **behind Augment** |
| v1 | Cursor | 47/36/50 | 42/17/55 | −1.6 | [−12.6, +10.7] | 0.400 | not reproduced | statistically tied with Cursor |
| v1 | Greptile | 47/36/50 | 45/40/52 | +2.8 | [−7.1, +13.2] | 0.709 | not reproduced | statistically tied with Greptile |
| v1 | Copilot | 47/36/50 | 43/104/54 | +17.0 | [+6.0, +28.0] | 0.999 | not reproduced | **ahead of Copilot** |
| v1 | CodeRabbit | 47/36/50 | 41/67/56 | +12.2 | [+3.8, +20.6] | 0.996 | not reproduced | **ahead of CodeRabbit** |
| v1 | 3 Super pool-verify-v1 (row (i)) | 47/36/50 | 40/57/57 | +11.0 | [+1.8, +20.1] | 0.991 | not reproduced | **ahead of 3 Super** |
| x1 | Augment | 49/31/48 | 56/17/41 | −10.5 | [−19.8, −0.3] | 0.022 | not reproduced | **behind Augment** |
| x1 | Cursor | 49/31/48 | 45/11/52 | −3.5 | [−13.7, +8.3] | 0.275 | not reproduced | statistically tied with Cursor |
| x1 | Greptile | 49/31/48 | 49/32/48 | +0.3 | [−9.5, +10.7] | 0.520 | not reproduced | statistically tied with Greptile |
| x1 | Copilot | 49/31/48 | 50/91/47 | +13.4 | [+1.2, +25.6] | 0.984 | not reproduced | **ahead of Copilot** |
| x1 | CodeRabbit | 49/31/48 | 45/58/52 | +10.4 | [+1.1, +19.2] | 0.985 | not reproduced | **ahead of CodeRabbit** |
| x1 | 3 Super pool-verify-v1 (row (i)) | 49/31/48 | 45/45/52 | +7.2 | [−3.0, +17.4] | 0.918 | not reproduced | statistically tied with 3 Super |

### All-50 rank table with the intervals

Ranks are point estimates. The interval is the primary 95% interval of TraceHound v2 minus that row.

| reviewer | v1 rank of 6 | v1 F | v2 − row, v1 | x1 rank of 6 | x1 F | v2 − row, x1 |
|---|---|---|---|---|---|---|
| Augment | 1 | 66.3% | −14.0 [−22.6, −4.7] | 1 | 65.9% | −10.5 [−19.8, −0.3] |
| Cursor | 2 | 53.8% | −1.6 [−12.6, +10.7] | 2 | 58.8% | −3.5 [−13.7, +8.3] |
| **TraceHound v2 (dev 7r + Cal.com run 4)** | 3 | 52.2% | – | 3 | 55.4% | – |
| Greptile | 4 | 49.5% | +2.8 [−7.1, +13.2] | 4 | 55.1% | +0.3 [−9.5, +10.7] |
| CodeRabbit | 5 | 40.0% | +12.2 [+3.8, +20.6] | 5 | 45.0% | +10.4 [+1.1, +19.2] |
| Copilot | 6 | 35.2% | +17.0 [+6.0, +28.0] | 6 | 42.0% | +13.4 [+1.2, +25.6] |
| *3 Super pool-verify-v1, row (i) (not ranked)* | – | 41.2% | +11.0 [+1.8, +20.1] | – | 48.1% | +7.2 [−3.0, +17.4] |

**Report only (pre-registered):** with dev run 8 in place of 7r, every all-50 sentence is the same
under v1. Under x1, one changes: the Augment interval becomes [−19.2, +1.3], which includes 0 (share >
0 0.041). The 3 Super interval under v1 becomes [+0.5, +20.3], still above 0.

## The sentences the rule allows

- **Cal.com (10 blind PRs), both judges:** TraceHound v2 is statistically tied with Augment,
  Cursor, Greptile and Copilot, and ahead of CodeRabbit. It is statistically tied with 3 Super's
  run 1. Its rank, 3rd of 6, is a point estimate.
- **All 50 PRs, both judges:** TraceHound v2 is behind Augment, statistically tied with Cursor and
  Greptile, and ahead of Copilot and CodeRabbit. It is 3rd of 6 as a point estimate.
- **Against 3 Super on all 50:** ahead under bench-judge-v1, the scorer of record (+11.0
  [+1.8, +20.1]). Statistically tied under bench-judge-x1 (+7.2 [−3.0, +17.4]). Any sentence has
  to name the judge.

## Limits

- **The 10-PR Cal.com intervals are probably too narrow.** A percentile bootstrap over 10 clusters is
  known to under-cover. The Cal.com CodeRabbit interval under v1 ([+11.8, +34.3]) is narrower than
  the audit's comment-level one for 3 Super ([−3.0, +45.6]). Pairing and the small number of
  clusters both narrow it, and which of the two matters more was not measured. The rule was fixed before the numbers, and it allows "ahead of CodeRabbit".
  Under x1 that interval's lower bound is +1.4.
- The intervals cover PR sampling only. They do not cover run-to-run spread: 3 Super's Cal.com F
  moved 7 points over three runs at temperature 0, and five dev runs spread 12.4 points. They also
  do not cover judge error. Each TraceHound row here is one run, and the tools' rows are single
  recorded reviews.
- This is the second look at Cal.com. The dev part of all 50 (40 PRs) is the set that v2's
  configuration was selected on (067, 068), so the all-50 gaps are not held-out results.
- The all-50 resample is unstratified: the 40 / 10 dev / Cal.com split varies across resamples.
- 24 gaps were tested, and none of the intervals is corrected for multiplicity.
