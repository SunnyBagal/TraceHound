# The Cal.com test-set run: results (decision 062)

This is job 062 executing decision 061's pre-registered plan, as amended by 061a
(`docs/bench/test-plan.md`). The configuration was pool-verify-v1 (059): Super, reasoning on,
temperature 0, no reviewer or verifier cache reads. Frozen code: tag `review-freeze-1` (tag object
`f3283894`, target `6b4276e`, the merge commit of PR #33). Every run ran from `main` @ `e7309a5`
(PR #34's merge, which changes only `.github/actions/` and `packages/action/test/`). The
frozen-paths diff `git diff review-freeze-1 HEAD -- packages/analyzer/src scripts/bench config`
printed nothing. The scorer of record is bench-judge-v1; bench-judge-x1 is report only. Counts
only: the full records are in `~/Projects/tracehound-bench/` and never enter this repo. Run on
2026-10-17, 16:44–21:27 UTC.

## Headline: Cal.com run 1 (10 pull requests, n = 23)

Run 1 completed with no rerun and no void run, so it is the headline (not run 1r).

### bench-judge-v1 (scorer of record)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| pool-verify-v1 | 30 | 14 | 11 | 4 | 1 | 9 | 0 | 56.0% (14/25) | 60.9% (14/23) | 58.3% |
| review-diff-v1 | 34 | 14 | 15 | 4 | 1 | 9 | 0 | 48.3% (14/29) | 60.9% (14/23) | 53.8% |
| pool-raw | 43 | 16 | 23 | 3 | 1 | 7 | 0 | 41.0% (16/39) | 69.6% (16/23) | 51.6% |
| greptile | 24 | 10 | 7 | 1 | 6 | 13 | 0 | 58.8% (10/17) | 43.5% (10/23) | 50.0% |
| coderabbit | 31 | 9 | 17 | 3 | 2 | 14 | 0 | 34.6% (9/26) | 39.1% (9/23) | 36.7% |
| augment | 23 | 15 | 3 | 4 | 1 | 8 | 0 | 83.3% (15/18) | 65.2% (15/23) | 73.2% |
| cursor | 21 | 13 | 3 | 4 | 1 | 10 | 0 | 81.3% (13/16) | 56.5% (13/23) | 66.7% |
| copilot | 49 | 15 | 27 | 6 | 1 | 8 | 0 | 35.7% (15/42) | 65.2% (15/23) | 46.2% |

### bench-judge-x1 (report only)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| pool-verify-v1 | 30 | 14 | 11 | 3 | 2 | 9 | 0 | 56.0% (14/25) | 60.9% (14/23) | 58.3% |
| review-diff-v1 | 34 | 15 | 12 | 4 | 3 | 8 | 0 | 55.6% (15/27) | 65.2% (15/23) | 60.0% |
| pool-raw | 43 | 16 | 18 | 6 | 3 | 7 | 0 | 47.1% (16/34) | 69.6% (16/23) | 56.1% |
| greptile | 24 | 11 | 6 | 1 | 6 | 12 | 0 | 64.7% (11/17) | 47.8% (11/23) | 55.0% |
| coderabbit | 31 | 9 | 16 | 3 | 3 | 14 | 0 | 36.0% (9/25) | 39.1% (9/23) | 37.5% |
| augment | 23 | 15 | 3 | 4 | 1 | 8 | 0 | 83.3% (15/18) | 65.2% (15/23) | 73.2% |
| cursor | 21 | 13 | 3 | 4 | 1 | 10 | 0 | 81.3% (13/16) | 56.5% (13/23) | 66.7% |
| copilot | 49 | 16 | 24 | 5 | 4 | 7 | 0 | 40.0% (16/40) | 69.6% (16/23) | 50.8% |

Under bench-judge-v1, the six reviewers rank by F as follows: augment 73.2%, cursor 66.7%,
pool-verify-v1 58.3%, greptile 50.0%, copilot 46.2%, coderabbit 36.7%. bench-judge-x1 gives the
same order, with pool-verify-v1 again 3rd. Under bench-judge-x1, review-diff-v1 alone (60.0%)
scores above pool-verify-v1 (58.3%).

## Spread (runs at temperature 0)

### Cal.com, runs 1–3 (all three complete; n = 23, except Cal.com run 2 pool-verify-v1 under v1, n = 21, one JUDGE_FAILED pull request)

bench-judge-v1:

| row | runs done | F run 1 / 2 / 3 | P min / median / max | R min / median / max | F min / median / max |
|---|---|---|---|---|---|
| pool-verify-v1 | 3 | 58.3% / 51.3% / 52.8% | 46.7% / 55.6% / 56.0% | 47.6% / 60.9% / 60.9% | 51.3% / 52.8% / 58.3% |
| review-diff-v1 | 3 | 53.8% / 38.5% / 42.6% | 34.2% / 34.5% / 48.3% | 43.5% / 56.5% / 60.9% | 38.5% / 42.6% / 53.8% |
| pool-raw | 3 | 51.6% / 40.0% / 44.1% | 32.4% / 33.3% / 41.0% | 52.2% / 65.2% / 69.6% | 40.0% / 44.1% / 51.6% |

bench-judge-x1:

| row | runs done | F run 1 / 2 / 3 | P min / median / max | R min / median / max | F min / median / max |
|---|---|---|---|---|---|
| pool-verify-v1 | 3 | 58.3% / 57.1% / 47.3% | 40.6% / 56.0% / 63.2% | 52.2% / 56.5% / 60.9% | 47.3% / 57.1% / 58.3% |
| review-diff-v1 | 3 | 60.0% / 53.1% / 52.6% | 44.1% / 50.0% / 55.6% | 56.5% / 65.2% / 65.2% | 52.6% / 53.1% / 60.0% |
| pool-raw | 3 | 56.1% / 50.0% / 52.5% | 42.1% / 44.8% / 47.1% | 56.5% / 69.6% / 69.6% | 50.0% / 52.5% / 56.1% |

### Dev, runs 1–3 (40 pull requests, n = 74; run 1 is 059's, run 2 is the restart 2r, run 3 not done)

bench-judge-v1:

| row | runs done | F run 1 / 2 / 3 | P min / median / max | R min / median / max | F min / median / max |
|---|---|---|---|---|---|
| pool-verify-v1 | 2 | 35.6% / 48.0% (restarted) / not done | 36.1% / 41.7% / 47.4% | 35.1% / 41.9% / 48.6% | 35.6% / 41.8% / 48.0% |
| review-diff-v1 | 2 | 32.2% / 35.6% (restarted) / not done | 25.6% / 29.1% / 32.6% | 39.2% / 41.2% / 43.2% | 32.2% / 33.9% / 35.6% |
| pool-raw | 2 | 33.2% / 37.1% (restarted) / not done | 24.5% / 27.3% / 30.0% | 48.6% / 50.0% / 51.4% | 33.2% / 35.2% / 37.1% |

bench-judge-x1:

| row | runs done | F run 1 / 2 / 3 | P min / median / max | R min / median / max | F min / median / max |
|---|---|---|---|---|---|
| pool-verify-v1 | 2 | 44.6% / 53.4% (restarted) / not done | 47.7% / 50.9% / 54.2% | 41.9% / 47.3% / 52.7% | 44.6% / 49.0% / 53.4% |
| review-diff-v1 | 2 | 35.7% / 36.0% (restarted) / not done | 28.7% / 31.0% / 33.3% | 39.2% / 43.2% / 47.3% | 35.7% / 35.9% / 36.0% |
| pool-raw | 2 | 40.2% / 41.8% (restarted) / not done | 30.0% / 31.8% / 33.6% | 55.4% / 58.1% / 60.8% | 40.2% / 41.0% / 41.8% |

With two runs, the "median" is the mean of the two (as `spread.ts` prints it).

## Cost and time per pull request

| run | pull requests | reruns | cost median | cost max | wall time median | wall time max | run spend (run.json) |
|---|---|---|---|---|---|---|---|
| Cal.com 1 | 10 | 0 | $0.0391 | $0.0556 | 158 s | 288 s | $0.4112 |
| Cal.com 2 | 10 | 0 | $0.0422 | $0.0859 | 133 s | 312 s | $0.4776 |
| Cal.com 3 | 10 | 0 | $0.0432 | $0.0647 | 123 s | 209 s | $0.4378 |
| dev 2r | 40 | 0 | $0.0270 | $0.2469 | 86 s | 777 s | $1.7707 |

Run spend includes both judges. No pull request in any run needed the one allowed rerun.

## Spend by plan item (ledger, `pnpm spend`)

The ledger was $12.45236 before and $17.76195 after, so 062 spent $5.30959 (1,139 requests).

| plan item | allowance | spent | runs |
|---|---|---|---|
| 1. Cal.com run 1 + judges | $15 (planned ≤ $6) | $0.4112 | run 1 complete |
| 2. Cal.com runs 2–3 | $5 | $0.9154 | run 2 $0.4776, run 3 $0.4378, both complete |
| 3. Dev runs 2–3 | $4 | $3.9830 | void run 2 $1.4429, run 2r $1.7707, run 3 $0.7694 (run.json $0.7581), stopped at the cap |

Run 1 stayed under the planned $6.

## Void runs, restarts, items not done

- **Dev run 2: void, then restarted once as run 2r.** It was not killed by the runner or the
  provider. The relay session ran items 2–3 as one background shell command, and the session's
  2-hour limit on background commands killed that command while dev run 2 was at pull request 30
  of 40. The process had exited, `run.json` status was `running`, and `scores/` did not exist.
  This is test-plan.md's "process died" case. The void run spent $1.4429 (run.json $1.4396,
  ledger since its start $1.4429), stopped at pull request 30 of 40, with error "none recorded
  (the process died)". It was never scored, and `run-2/` is untouched. The restart (2r) ran
  detached from the session, completed (exit 0), and stands for dev run 2.
- **Dev run 3: stopped at the cap (exit 2), not done.** Its allowance was $0.7864, which is $4
  minus $1.4429 minus $1.7707. It stopped at pull request 16 of 40 after spending $0.7581 (run.json),
  with error `refusing review on nvidia/nemotron-3-super-120b-a12b: estimated $0.0170 would bring
  this run to $0.7907, over TRACEHOUND_BUDGET_RUN_USD=0.7864…`. It has no score, so the dev spread
  is over two runs. The ledger rose $0.7694 across this run, $0.0113 more than its run.json; that
  gap is reported, not explained.
- **JUDGE_FAILED:** 1 pull request, in Cal.com run 2, pool-verify-v1, under bench-judge-v1. It is
  left out of that cell's totals (n = 21) and was not re-judged. The ledger shows one failed
  Super judge request with no usage reported. Its exact error is stored only in the Cal.com
  score record, which this session did not open.

## Deviations from 061

- Dev run 2 was void and restarted, because the session's background-command limit killed the
  process (above). 061a allows the restart; the cause was the relay setup, not the runner.
- Dev run 3 was not done (it stopped at the cap). The cap rule is 061's; the cut was larger than
  061's cost estimate expected, partly because the void dev run 2 spent $1.4429 of the $4.
- Step 0 of the 062 prompt said `git rev-parse --short eval-freeze-2^{commit}` prints `acefcf9`.
  It printed `b5cafde`. `acefcf9` is the annotated tag's object (local and on origin) and
  `b5cafde` is its target, the commit decision 049's context names for `eval-freeze-2`. The tag
  was not moved, and the run went ahead. This is a deviation from the prompt's check, not from 061.
- The runs ran from `e7309a5` (PR #34's merge), not from the tagged `6b4276e`. The frozen-paths
  diff between them was empty, which is 061's condition.
- Cal.com run 1 did not go over $6.

## Predictions (061), scored

- **(a) pool-verify-v1's F on Cal.com is above review-diff-v1's: right.** Run 1 under
  bench-judge-v1: 58.3% vs 53.8%. Under bench-judge-x1 (report only) it is the other way round:
  58.3% vs 60.0%.
- **(b) pool-verify-v1 ranks 5th of the six reviewers under bench-judge-v1: wrong.** It ranked
  3rd (58.3%), below augment (73.2%) and cursor (66.7%) and above greptile (50.0%), copilot (46.2%)
  and coderabbit (36.7%).
- **(c) pool-verify-v1's Cal.com F is not within 5 points of its dev F (outside 30.6–40.6%):
  right.** Run 1 F was 58.3%, 22.7 points above the dev 35.6%.

## Limits

Copied from 061:
- There is one pre-registered primary run. The repeats measure spread; they are not extra chances.
- The configuration was the fourth reviewer variant chosen on the same dev set.
- The judge is the same model family as the reviewer (060: the gap is small).
- The golden set was built from the tools' comments (060).
- n is small (a test set of 10 pull requests, n = 23).
- The pull requests have been public since 2025, so models may have seen them.

Added by this run:
- Run-to-run spread at temperature 0 is large compared with the margins the reviewer was chosen
  on. Across two dev runs, pool-verify-v1's F was 35.6% and 48.0% under bench-judge-v1, while 059
  adopted it at a 0.6-point margin over the 35.0% bar. On Cal.com, review-diff-v1's F ranged from
  38.5% to 53.8% across three runs.
- The five tools were judged once, on their recorded reviews, and TraceHound's rows were run three
  times. So run 1's rank against the tools carries the TraceHound rows' run-to-run spread, which
  the tools' rows do not show.
- The dev spread has two runs, not three (dev run 3 was not done).
- Cal.com is one TypeScript repo. pool-verify-v1's run 1 F there (58.3%) is above its F on every
  dev repo (27.3% to 44.4%, 061), so the absolute numbers say little about other repos.
