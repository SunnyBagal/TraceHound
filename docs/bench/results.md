# PR reviewer benchmark: results (decisions 063, 066)

On 10 blind pull requests (Cal.com run 1, n = 23), TraceHound is statistically tied with Greptile
and Cursor. Its run-1 F was 58.3% against CodeRabbit's 36.7%, but that is not a significant lead.
No gap to another tool is outside its 95% interval. The CodeRabbit gap is the clearest: TraceHound
is ahead in 96% of resamples, but its interval still includes 0
([audit-cc01 §3.2](audit-cc01.md#32-bootstrap-95-ci-over-prs-for-the-calcom-f-difference)).
Across all 50 pull requests it is 4th of 6 under both judges ([section 5](#5-all-50-prs)). Every
loss is published ([section 7](#7-every-loss-and-void-run)). The order in the blind table (section
2) is a point estimate, not a ranking.

Every number on this page is copied from decisions 054–065, `docs/bench/test-results.md`,
`docs/bench/pool-verify.md`, `docs/bench/vote.md` and `docs/bench/evidence.md` (dev tool rows:
`docs/bench/scorer-checks.md`, decision 060; all-50 tool rows: `docs/bench/scorer-validation.md`,
decision 054), or computed from their counts (the ranks in section 3, the tables in section 5).
Counts only; no review or golden comment text is in this repository.

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

No gap to another tool is outside its 95% interval. The CodeRabbit gap is the clearest: TraceHound
is ahead in 96% of resamples, but its interval still includes 0
([audit-cc01 §3.2](audit-cc01.md#32-bootstrap-95-ci-over-prs-for-the-calcom-f-difference)).

## 3. Rank in every run

pool-verify-v1's F in each Cal.com run and its rank among the six reviewers. The five tools were
judged once, on their recorded reviews (v1: augment 73.2, cursor 66.7, greptile 50.0, copilot
46.2, coderabbit 36.7; x1: augment 73.2, cursor 66.7, greptile 55.0, copilot 50.8, coderabbit
37.5).

| Cal.com run | bench-judge-v1: F, point-estimate rank | bench-judge-x1: F, point-estimate rank |
|---|---|---|
| 1 (headline) | 58.3%, 3rd | 58.3%, 3rd |
| 2 | 51.3%, 3rd (n = 21, one JUDGE_FAILED) | 57.1%, 3rd |
| 3 | 52.8%, 3rd | 47.3%, 5th (below greptile 55.0 and copilot 50.8) |

3rd in 5 of 6 run × judge cells, 5th in one. Under v1 the margin over greptile (50.0%) was 1.3
to 8.3 points. These ranks are point estimates, not a ranking: no gap to another tool is outside its
95% interval (audit-cc01 §3.2).

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

## 5. All 50 PRs

All five repos together (40 dev + 10 Cal.com pull requests), micro-averaged over the 97 golden
comments of Medium or higher (74 dev + 23 Cal.com). FN = 97 − TP.

- **Tools, one row each:** dev counts (`scorer-checks.md`, 060) plus Cal.com run 1 counts
  (`test-results.md`). Under bench-judge-v1 these sums equal the all-50 rows in
  `scorer-validation.md:24-28` (054).
- **TraceHound (pool-verify-v1), two rows, declared as such:**
  - **(i) scorer-of-record line:** dev run 1 + Cal.com run 1. These are the first runs and the
    pre-registered ones. This is the audit's table (audit-cc01 §3.1), and it is the row the
    headline uses.
  - **(ii) variance check:** TP and FP averaged over dev runs 1, 2r, 4, 5 and 6 (`vote.md`,
    `evidence.md`), plus Cal.com run 1. Its counts are fractional because they are means. Dev means:
    v1 TP 32.8 / FP 48.2 / FN 41.2; x1 TP 38.4 / FP 37.0 / FN 35.6.
- Each TraceHound row is ranked against the five tools only, not against the other TraceHound row.

### All 50 PRs, bench-judge-v1 (scorer of record)

| reviewer | rank of 6 | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 16 | 41 | 77.8% (56/72) | 57.7% (56/97) | 66.3% |
| Cursor | 2 | 42 | 17 | 55 | 71.2% (42/59) | 43.3% (42/97) | 53.8% |
| Greptile | 3 | 45 | 40 | 52 | 52.9% (45/85) | 46.4% (45/97) | 49.5% |
| **TraceHound (i): dev run 1 + Cal.com run 1 (scorer-of-record line)** | 4 | 40 | 57 | 57 | 41.2% (40/97) | 41.2% (40/97) | **41.2%** |
| TraceHound (ii): dev 5-run mean + Cal.com run 1 (variance check) | 4 | 46.8 | 59.2 | 50.2 | 44.2% (46.8/106) | 48.2% (46.8/97) | 46.1% |
| CodeRabbit | 5 | 41 | 67 | 56 | 38.0% (41/108) | 42.3% (41/97) | 40.0% |
| Copilot | 6 | 43 | 104 | 54 | 29.3% (43/147) | 44.3% (43/97) | 35.2% |

### All 50 PRs, bench-judge-x1 (report only)

| reviewer | rank of 6 | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 17 | 41 | 76.7% (56/73) | 57.7% (56/97) | 65.9% |
| Cursor | 2 | 45 | 11 | 52 | 80.4% (45/56) | 46.4% (45/97) | 58.8% |
| Greptile | 3 | 49 | 32 | 48 | 60.5% (49/81) | 50.5% (49/97) | 55.1% |
| **TraceHound (i): dev run 1 + Cal.com run 1 (scorer-of-record line)** | 4 | 45 | 45 | 52 | 50.0% (45/90) | 46.4% (45/97) | **48.1%** |
| TraceHound (ii): dev 5-run mean + Cal.com run 1 (variance check) | 4 | 52.4 | 48.0 | 44.6 | 52.2% (52.4/100.4) | 54.0% (52.4/97) | 53.1% |
| CodeRabbit | 5 | 45 | 58 | 52 | 43.7% (45/103) | 46.4% (45/97) | 45.0% |
| Copilot | 6 | 50 | 91 | 47 | 35.5% (50/141) | 51.5% (50/97) | 42.0% |

Both TraceHound rows are 4th of 6 under both judges. Row (ii) is higher than row (i) because dev
run 1 is the lowest of the five dev runs (`vote.md`), but it does not change the rank. The tools were
judged once, on their recorded reviews, so their rows carry no run-to-run spread.

## 6. Predictions (061), scored

- **(a) pool-verify-v1's Cal.com F is above review-diff-v1's: right.** Run 1, bench-judge-v1:
  58.3% vs 53.8%. (Under bench-judge-x1 it is the other way round: 58.3% vs 60.0%.)
- **(b) pool-verify-v1 ranks 5th of the six under bench-judge-v1: wrong.** It ranked 3rd (58.3%),
  below augment (73.2%) and cursor (66.7%), above greptile (50.0%), copilot (46.2%) and
  coderabbit (36.7%).
- **(c) pool-verify-v1's Cal.com F is not within 5 points of its dev F (outside 30.6–40.6%):
  right.** 58.3%, 22.7 points above the dev 35.6%.

## 7. Every loss and void run

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

## 8. Limits

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

## 9. Cost

Per pull request on Cal.com (all pipeline stages plus both judges): median $0.0391 / $0.0422 /
$0.0432 in runs 1 / 2 / 3, so about $0.04; max $0.0859. Wall time median 123–158 s, max 312 s.
On dev, the product pipeline alone cost median $0.0317, max $0.2308 per pull request (059).
The whole of 062 (three Cal.com runs, the dev repeats including the void run, all judging) spent
$5.31 ($5.30959 by the ledger) of Nebius credit, against a $15 cap. Prices are the third-party
rates in `config/prices.json`.
