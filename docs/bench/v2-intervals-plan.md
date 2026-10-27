# v2 intervals: plan (decision 069, note 069b)

Pre-registered: this file is committed and pushed before any bootstrap is computed. Brief:
`docs/prompts/069b-v2-intervals.md`. No model or network call. The inputs are score files that
already exist in the bench folder, read for their per-PR counts only (TP, FP, FN, status). Cal.com
is blind: no comment text, golden text, titles or diffs are read into this session, printed or
committed.

## Inputs (per-PR counts, `detail[].counts` and `detail[].status`)

| row | Cal.com (10 PRs) | dev (40 PRs) |
|---|---|---|
| TraceHound v2 (pool-verify-v1, Nemotron 3.5) | `test/run-4-nvidia-nemotron-3-5-super-vl/scores/judge-<j>/pool-verify-v1-cal_dot_com` | `reviews/dev-repeat/run-7-nvidia-nemotron-3-5-super-vlr/scores/judge-<j>/pool-verify-v1-<repo>` (dev run 7r) |
| 3 Super pool-verify-v1 | `test/run-1/scores/judge-<j>/pool-verify-v1-cal_dot_com` (Cal.com run 1) | `scores/[judge-x1/]pool-verify-v1-super-<repo>` (dev run 1; together: 066's row (i)) |
| each tool | `test/run-1/scores/judge-<j>/<tool>-cal_dot_com` (run 1's judged rows) | `scores/[judge-x1/]<tool>-<repo>` |

Step 0 checked that these per-PR counts sum to every published total in `v2-calcom.md`,
`test-results.md` and `audit-cc01.md` §3.1, under both judges, with 0 JUDGE_FAILED.

A pull request is identified by (repo, `goldenIndex`). The script refuses to pair two rows whose
PR sets differ.

## Gaps

F(TraceHound v2) − F(other), in points, with F = 2TP / (2TP + FP + FN) from summed counts (micro
F; FN as scored, which on these files equals golden − TP). "Other" is each of the five tools and 3
Super's pool-verify-v1. Each gap is computed under bench-judge-v1 (the scorer of record) and
bench-judge-x1, on two sets:

- **Cal.com:** run 4 against run 1's rows, 10 PRs, n = 23 golden comments;
- **all 50:** dev run 7r + Cal.com run 4 against the tools' all-50 rows (dev + Cal.com run 1) and 3
  Super's row (i) (dev run 1 + Cal.com run 1), 50 PRs, n = 97.

That is 6 gaps × 2 judges × 2 sets = 24 gaps.

## Primary interval: PR-level paired bootstrap

- Resample the set's PRs with replacement (as many draws as there are PRs in the pair, unstratified
  on all 50). Use the same draws for both reviewers. Recompute each reviewer's micro F from the
  summed TP / FP / FN of the drawn PRs, then take the difference. F = 0 if 2TP + FP + FN = 0.
- 10,000 resamples, seed **69**. The generator is the script's mulberry32, seeded once per gap from
  69, so each gap's draws are the same whatever order the gaps run in.
- Report the 2.5 and 97.5 percentiles (linear interpolation between order statistics) and the share
  of resamples with a difference > 0 (strictly).
- A PR that is JUDGE_FAILED in either row is dropped from that pair, on both sides, before
  resampling. The number dropped is reported for each pair. (Step 0 found none.)

## Secondary interval: the cc-01 audit's §3.2 (b), for continuity with 066

As its appendix describes:
- each reviewer is a multinomial over its TP / FP / FN events, with n = TP + FP + FN and
  probabilities equal to the observed shares;
- the two reviewers are drawn independently, 200,000 draws, F = 2TP / (2TP + FP + FN);
- the comment-level 95% interval is the 2.5 / 97.5 percentiles of the difference;
- the inflated interval is the mean difference ± 1.96 · SD · √1.63, with the audit's median design
  effect 1.63 reused unchanged.

The audit used numpy's `default_rng(20261018)`. This script is TypeScript with the same mulberry32
generator (seed 69), so its draws cannot be identical. **Reproduction check, run before any v2 gap:**
the script recomputes the audit's 3 Super Cal.com run 1 table (v1: five tools, comment-level and
inflated bounds, `audit-cc01.md` §3.2 (b)) and x1's Greptile and Copilot comment-level bounds. If any
bound differs from the published one by more than 0.1 point, the secondary method is reported as not
reproduced and skipped for every v2 gap. Shares > 0 are compared to 0.01 and reported, but they do not
decide the check.

## Wording rule (fixed now, whatever the numbers show)

- "ahead of X" or "behind X" only if the **primary** 95% interval excludes 0;
- otherwise "statistically tied with X";
- ranks only as "a point estimate".

The secondary interval never licenses a sentence on its own.

## Report only (decided now, does not change the wording)

- The all-50 primary interval with dev run 8 instead of 7r.

## Outputs

- `scripts/bench/intervals.ts` prints counts and intervals only. Its tests in
  `packages/analyzer/test/intervals.test.ts` use synthetic counts: a known-gap fixture, seed
  determinism and the JUDGE_FAILED drop.
- `docs/bench/v2-intervals.md`: for each gap, observed, primary interval, share > 0, secondary
  inflated interval (or "not reproduced"), and the sentence the rule allows; the all-50 rank table
  with the intervals beside it.
- A dated 069b note under decision 069. `results.md`, the README and `viewer/` are not edited.

## Freeze

Run 4's freeze check (`freezeCheck069`) compares `scripts/bench` minus the runner files with
`review-freeze-2`, so a new `scripts/bench/intervals.ts` makes it fail from now on. That is fine:
run 4 is complete and the 069 plan allows no further Cal.com run. Nothing under
`packages/*/src` or `config/` changes.
