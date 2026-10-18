# Vote across runs: result (decision 064)

Plan: `docs/bench/vote-plan.md`, frozen in `57f0b91` and pushed at 2026-10-18T15:39:38Z. The first
model call of the job is in the ledger at 15:40:04Z. Dev only: Cal.com was not opened, run or scored.
Script: `node scripts/bench/vote.ts` (it makes no model call except the two judges). Every dev run
completed, so the plan's five-run variants apply and the fallback was not used.

**Verdict: a loss. pool-verify-v1 stays.** The best variant under bench-judge-v1, vote-k3of5,
clears the F margin (+5.5 points, needing 5.0) and the precision condition (53.3% against a mean of
40.5%). Under bench-judge-x1 it scores F 50.4%, below the baseline mean of 51.3%, so it fails the third
condition. Its v1 F (47.8%) is also below run 2r's single-run F (48.0%).

## Runs

| run | status | spend | wall time | reruns (failed request) |
|---|---|---|---|---|
| 1 | decision 059's records | n/a | n/a | n/a |
| 2r | complete (061a restart, job 062) | $1.7707 | n/a | 0 |
| 4 | complete | $1.7297 | 85.7 min | 0 |
| 5 | complete | $1.7184 | 86.4 min | 0 |
| 6 | complete | $1.8836 | 108.5 min | 1 |

Dev run 3 (16 of 40, stopped at 061's cap) was not used.

### bench-judge-v1 (scorer of record)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F | comments per PR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vote-k3of5 | 73 | 32 | 28 | 8 | 5 | 42 | 0 | 53.3% (32/60) | 43.2% (32/74) | 47.8% | 1.82 |
| vote-k2of5 | 133 | 37 | 69 | 17 | 10 | 37 | 0 | 34.9% (37/106) | 50.0% (37/74) | 41.1% | 3.33 |
| vote-raw-k3of5 | 128 | 38 | 66 | 10 | 14 | 36 | 0 | 36.5% (38/104) | 51.4% (38/74) | 42.7% | 3.20 |
| vote-k3of5-cap2 | 53 | 27 | 16 | 5 | 5 | 47 | 0 | 62.8% (27/43) | 36.5% (27/74) | 46.2% | 1.32 |
| baseline pool-verify-v1 run 1 | 83 | 26 | 46 | 4 | 7 | 48 | 0 | 36.1% (26/72) | 35.1% (26/74) | 35.6% | 2.08 |
| baseline pool-verify-v1 run 2r | 91 | 36 | 40 | 9 | 6 | 38 | 0 | 47.4% (36/76) | 48.6% (36/74) | 48.0% | 2.27 |
| baseline pool-verify-v1 run 4 | 100 | 35 | 50 | 8 | 7 | 39 | 0 | 41.2% (35/85) | 47.3% (35/74) | 44.0% | 2.50 |
| baseline pool-verify-v1 run 5 | 97 | 33 | 50 | 7 | 7 | 41 | 0 | 39.8% (33/83) | 44.6% (33/74) | 42.0% | 2.42 |
| baseline pool-verify-v1 run 6 | 107 | 34 | 55 | 8 | 10 | 40 | 0 | 38.2% (34/89) | 45.9% (34/74) | 41.7% | 2.67 |

baseline mean over 5 runs: F 42.3% · P 40.5%

### bench-judge-x1 (report only)

| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F | comments per PR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vote-k3of5 | 73 | 33 | 24 | 6 | 10 | 41 | 0 | 57.9% (33/57) | 44.6% (33/74) | 50.4% | 1.82 |
| vote-k2of5 | 133 | 42 | 50 | 21 | 20 | 32 | 0 | 45.7% (42/92) | 56.8% (42/74) | 50.6% | 3.33 |
| vote-raw-k3of5 | 128 | 43 | 49 | 16 | 20 | 31 | 0 | 46.7% (43/92) | 58.1% (43/74) | 51.8% | 3.20 |
| vote-k3of5-cap2 | 53 | 29 | 14 | 4 | 6 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% | 1.32 |
| baseline pool-verify-v1 run 1 | 83 | 31 | 34 | 6 | 12 | 43 | 0 | 47.7% (31/65) | 41.9% (31/74) | 44.6% | 2.08 |
| baseline pool-verify-v1 run 2r | 91 | 39 | 33 | 10 | 9 | 35 | 0 | 54.2% (39/72) | 52.7% (39/74) | 53.4% | 2.27 |
| baseline pool-verify-v1 run 4 | 100 | 40 | 41 | 11 | 8 | 34 | 0 | 49.4% (40/81) | 54.1% (40/74) | 51.6% | 2.50 |
| baseline pool-verify-v1 run 5 | 97 | 39 | 38 | 11 | 9 | 35 | 0 | 50.6% (39/77) | 52.7% (39/74) | 51.7% | 2.42 |
| baseline pool-verify-v1 run 6 | 107 | 43 | 39 | 10 | 15 | 31 | 0 | 52.4% (43/82) | 58.1% (43/74) | 55.1% | 2.67 |

baseline mean over 5 runs: F 51.3%

## Spread of the baseline over five runs (a result on its own)

pool-verify-v1 on the same 40 dev pull requests at temperature 0, five independent runs:

| judge | F run 1 / 2r / 4 / 5 / 6 | min | mean | max |
|---|---|---|---|---|
| bench-judge-v1 | 35.6 / 48.0 / 44.0 / 42.0 / 41.7 | 35.6 | 42.3 | 48.0 |
| bench-judge-x1 | 44.6 / 53.4 / 51.6 / 51.7 / 55.1 | 44.6 | 51.3 | 55.1 |

The F range is 12.4 points under v1 and 10.5 under x1. Run 1, the run that 059 used to choose the
reviewer, is the lowest under both judges.

## Adoption (pre-registered rule)

| condition | vote-k3of5 | needed | |
|---|---|---|---|
| F − baseline mean F (v1) | 47.8 − 42.3 = +5.5 points | ≥ 5.0 | pass |
| precision (v1) | 53.3% | > 40.5% (mean) | pass |
| F (x1) | 50.4% | ≥ 51.3% (mean) | **fail** |

Verdict: **loss**. No variant is adopted.

What the tables show (report only, not a basis for adoption):
- Voting raises precision. vote-k3of5 has P 53.3% against a per-run range of 36.1–47.4%, and
  vote-k3of5-cap2 has 62.8%, at 1.3 comments per PR. It also costs recall: vote-k3of5's
  43.2% is below four of the five runs, and cap2's is 36.5%.
- Under x1 the per-run precision is already higher (mean 50.9%), and the recall lost makes every
  variant's F sit within the per-run range rather than above it.
- vote-raw-k3of5, which votes on the unfiltered pool, has v1 F 42.7%. That equals the baseline mean,
  so voting on its own did not replace the verifier.

## Cost

Had vote-k3of5 been adopted, it would run the pipeline five times per pull request. Summed over the
five runs' pipelines (run 1 from 059's records), the cost per pull request is a median of $0.1535
and a max of $1.1848, about 5× pool-verify-v1. Judging the four variants cost $0.0773, with
cache reads allowed.

Spend for job 064 from the ledger: $17.76195 → $23.17092 = **$5.409** (1,442 requests: 788 reviewer
and verifier calls, 654 judge calls), against a $10 cap.
