# PR reviewer benchmark: results (decision 063)

On the pre-registered blind test, TraceHound ranked 3rd of six under the scorer of record, behind
Augment and Cursor, ahead of Greptile, Copilot and CodeRabbit. On the dev set it ranked 5th of six.
Run-to-run spread at temperature 0 is larger than the margins the reviewer was chosen on, so treat
single-run ranks as approximate.

Every number on this page is copied from decisions 054–062, `docs/bench/test-results.md` and
`docs/bench/pool-verify.md` (dev tool rows: `docs/bench/scorer-checks.md`, decision 060). Counts
only; no review or golden comment text is in this repository.

## 1. What was measured

TraceHound's pull-request reviewer (pool-verify-v1, decision 059) and five recorded commercial
tools were scored against `ai-code-review-evaluations/golden_comments` @ `3f2c8ab` (5 repos × 10
pull requests; 054): four repos are the dev set, Cal.com is the blind test set. The scorer of
record is an LLM judge, bench-judge-v1 (Nemotron Super, temperature 0); a second judge,
bench-judge-x1 (Qwen3-235B-A22B-Instruct-2507, same prompt), is reported alongside (060). x1
changes no decision, but it changes results: it reverses prediction (a) in Cal.com runs 1 and 3,
and drops run 3 to 5th. The blind test was pre-registered before any TraceHound Cal.com result
existed (061); the five tools' Cal.com scores were already in the repo (054). The headline is run 1
of three, all from `e7309a5`, whose frozen paths are identical to tag `review-freeze-1` (062).

Metrics are micro-averaged precision (P), recall (R) and F over the Medium-or-higher golden
comments (n). A matched Low golden comment counts as nothing; duplicates are neither TP nor FP.

## 2. Blind test: Cal.com run 1 (10 pull requests, n = 23)

Under bench-judge-v1 (scorer of record), with bench-judge-x1's F alongside:

| reviewer | comments | TP | FP | FN | P (n) | R (n) | F (v1) | F (x1) |
|---|---|---|---|---|---|---|---|---|
| augment | 23 | 15 | 3 | 8 | 83.3% (15/18) | 65.2% (15/23) | 73.2% | 73.2% |
| cursor | 21 | 13 | 3 | 10 | 81.3% (13/16) | 56.5% (13/23) | 66.7% | 66.7% |
| **TraceHound (pool-verify-v1)** | 30 | 14 | 11 | 9 | 56.0% (14/25) | 60.9% (14/23) | **58.3%** | 58.3% |
| greptile | 24 | 10 | 7 | 13 | 58.8% (10/17) | 43.5% (10/23) | 50.0% | 55.0% |
| copilot | 49 | 15 | 27 | 8 | 35.7% (15/42) | 65.2% (15/23) | 46.2% | 50.8% |
| coderabbit | 31 | 9 | 17 | 14 | 34.6% (9/26) | 39.1% (9/23) | 36.7% | 37.5% |
| *review-diff-v1 (secondary, not ranked)* | 34 | 14 | 15 | 9 | 48.3% (14/29) | 60.9% (14/23) | 53.8% | 60.0% |
| *pool-raw (secondary, not ranked)* | 43 | 16 | 23 | 7 | 41.0% (16/39) | 69.6% (16/23) | 51.6% | 56.1% |

review-diff-v1 (the diff-only reviewer, 055) and pool-raw (the unfiltered candidate pool, 059)
are stages of the same pipeline, declared as secondary rows in 061. 0 JUDGE_FAILED in run 1.

Apart from CodeRabbit, every gap to the tools is within noise
([audit-cc01 §3](audit-cc01.md#3-what-a-critic-would-compute)).

## 3. Rank in every run

pool-verify-v1's F in each Cal.com run and its rank among the six reviewers. The five tools were
judged once, on their recorded reviews (v1: augment 73.2, cursor 66.7, greptile 50.0, copilot
46.2, coderabbit 36.7; x1: augment 73.2, cursor 66.7, greptile 55.0, copilot 50.8, coderabbit
37.5).

| Cal.com run | bench-judge-v1 | bench-judge-x1 |
|---|---|---|
| 1 (headline) | 58.3%, 3rd | 58.3%, 3rd |
| 2 | 51.3%, 3rd (n = 21, one JUDGE_FAILED) | 57.1%, 3rd |
| 3 | 52.8%, 3rd | 47.3%, 5th (below greptile 55.0 and copilot 50.8) |

3rd in 5 of 6 run × judge cells, 5th in one. Under v1 the margin over greptile (50.0%) was 1.3
to 8.3 points.

## 4. Dev set (40 pull requests, n = 74)

pool-verify-v1's F against the tools' dev F (060; v1: augment 64.1, cursor 49.6, greptile 49.3,
coderabbit 41.0, copilot 31.3; x1: augment 63.6, cursor 56.1, greptile 55.1, coderabbit 47.4,
copilot 38.9). Dev run 1 is 059's run; dev run 2 is the restart 2r (062).

| dev run | bench-judge-v1 | bench-judge-x1 |
|---|---|---|
| 1 | 35.6%, 5th (above copilot only) | 44.6%, 5th (above copilot only) |
| 2r | 48.0%, 4th (below greptile 49.3, above coderabbit 41.0) | 53.4%, 4th (below greptile 55.1, above coderabbit 47.4) |

Dev spread over the two runs, F min / median / max (median = mean of two):

| row | bench-judge-v1 | bench-judge-x1 |
|---|---|---|
| pool-verify-v1 | 35.6 / 41.8 / 48.0% | 44.6 / 49.0 / 53.4% |
| review-diff-v1 | 32.2 / 33.9 / 35.6% | 35.7 / 35.9 / 36.0% |
| pool-raw | 33.2 / 35.2 / 37.1% | 40.2 / 41.0 / 41.8% |

Cal.com spread over three runs, F min / median / max, bench-judge-v1: pool-verify-v1 51.3 / 52.8 /
58.3%, review-diff-v1 38.5 / 42.6 / 53.8%, pool-raw 40.0 / 44.1 / 51.6%.

## 5. Predictions (061), scored

- **(a) pool-verify-v1's Cal.com F is above review-diff-v1's: right.** Run 1, bench-judge-v1:
  58.3% vs 53.8%. (Under bench-judge-x1 it is the other way round: 58.3% vs 60.0%.)
- **(b) pool-verify-v1 ranks 5th of the six under bench-judge-v1: wrong.** It ranked 3rd (58.3%),
  below augment (73.2%) and cursor (66.7%), above greptile (50.0%), copilot (46.2%) and
  coderabbit (36.7%).
- **(c) pool-verify-v1's Cal.com F is not within 5 points of its dev F (outside 30.6–40.6%):
  right.** 58.3%, 22.7 points above the dev 35.6%.

## 6. Every loss and void run

- **Prediction (b) was wrong** (above).
- **Under bench-judge-x1, review-diff-v1 alone (60.0%) scores above pool-verify-v1 (58.3%) on
  Cal.com run 1**, so prediction (a) holds only under the scorer of record. Under bench-judge-x1 it
  is also reversed in Cal.com run 3 (pool-verify-v1 47.3%, review-diff-v1 52.6%).
- **Under bench-judge-x1, Cal.com run 3 ranks 5th** (47.3%).
- **Dev run 2 was void.** The relay session's 2-hour limit on background commands killed the
  process at pull request 30 of 40, after $1.4429; it was never scored. It was restarted once as
  2r (complete), which stands for dev run 2 (061a).
- **Dev run 3 was not done.** It stopped at the cap at pull request 16 of 40 after $0.7581
  (run.json), so the dev spread covers two runs, not three.
- **One JUDGE_FAILED:** Cal.com run 2, pool-verify-v1, bench-judge-v1; left out of that cell
  (n = 21) and not re-judged.
- **Ledger gap:** across dev run 3 the ledger rose $0.7694, $0.0113 more than its run.json
  ($0.7581). The gap is reported, not explained.

## 7. Limits

From 061:
- There is one pre-registered primary run. The repeats measure spread; they are not extra chances.
- The configuration was the fourth reviewer variant chosen on the same dev set.
- The judge is the same model (Nemotron 3 Super) as the reviewer and the verifier.
- The golden set was built from the tools' comments (060).
- n is small (a test set of 10 pull requests, n = 23).
- The pull requests have been public since 2025, so models may have seen them.

Added by 062:
- Run-to-run spread at temperature 0 is large compared with the margins the reviewer was chosen
  on. Across two dev runs pool-verify-v1's F was 35.6% and 48.0% under bench-judge-v1, while 059
  adopted it at a 0.6-point margin over the 35.0% bar. On Cal.com, review-diff-v1's F ranged from
  38.5% to 53.8% across three runs.
- The five tools were judged once, on their recorded reviews, and TraceHound's rows were run three
  times. So run 1's rank against the tools carries the TraceHound rows' run-to-run spread, which
  the tools' rows do not show.
- The dev spread has two runs, not three.
- Cal.com is one TypeScript repo. pool-verify-v1's run 1 F there (58.3%) is above its F on every
  dev repo (27.3% to 44.4%), so the absolute numbers say little about other repos.

## 8. Cost

Per pull request on Cal.com (all pipeline stages plus both judges): median $0.0391 / $0.0422 /
$0.0432 in runs 1 / 2 / 3, so about $0.04; max $0.0859. Wall time median 123–158 s, max 312 s.
On dev, the product pipeline alone cost median $0.0317, max $0.2308 per pull request (059).
The whole of 062 (three Cal.com runs, the dev repeats including the void run, all judging) spent
$5.31 ($5.30959 by the ledger) of Nebius credit, against a $15 cap. Prices are the third-party
rates in `config/prices.json`.
