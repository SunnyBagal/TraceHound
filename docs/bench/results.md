# PR reviewer benchmark: results (v2; decisions 069, 066)

The product is **pool-verify-v1 on Nemotron 3.5 Super (`nvidia/Nemotron-3.5-Super-VL`) at tag
`review-freeze-2` (`0aeef06`)**, via Nebius Token Factory. Every TraceHound v2 row on this page is
that configuration.

On 10 blind Cal.com pull requests (n = 23 golden comments), TraceHound v2 is statistically tied
with Augment, Cursor, Greptile and Copilot, and ahead of CodeRabbit, under both judges
([section 2](#2-blind-test-calcom-v2)). That is only 10 pull requests. Across all 50 pull requests
it is behind Augment, statistically tied with Cursor and Greptile, and ahead of Copilot and
CodeRabbit, under both judges: 3rd of 6 as a point estimate ([section 3](#3-all-50-prs)). 40 of the
50 are the dev set it was tuned on. Against v1 (pool-verify-v1 on 3 Super) on all 50, v2 is ahead
under bench-judge-v1, the scorer of record (+11.0 points [+1.8, +20.1]), and statistically tied
under bench-judge-x1. "Ahead" and "behind" are used only where the 95% interval of the F
difference excludes 0. Every loss is published ([section 8](#8-losses)).

Every number on this page is copied from `docs/bench/v2-calcom.md`, `v2-intervals.md`,
`dev-3.5.md`, `dev-ultra.md`, `v3-recall.md`, `levers-v2.md` and `reviewbench.md` (decisions
067–071 and the levers v2 replay), or, for the v1 history and the first six levers, from the v1
version of this page at [`e91a268`](https://github.com/SunnyBagal/TraceHound/blob/e91a268/docs/bench/results.md)
(decisions 054–066). Counts only; no review or golden comment text is in this repository.

## 1. What was measured

TraceHound's pull-request reviewer and five recorded commercial tools were scored against
`ai-code-review-evaluations/golden_comments` @ `3f2c8ab` (5 repos × 10 pull requests; 054): four
repos are the dev set (40 pull requests, n = 74), Cal.com is the blind test set (10 pull requests,
n = 23). The scorer of record is an LLM judge, bench-judge-v1 (Nemotron 3 Super, temperature 0); a
second judge, bench-judge-x1 (Qwen3-235B-A22B-Instruct-2507, same prompt), is reported alongside
(060). The tools' scores come from their recorded reviews in the dataset, judged once; we did not
run the tools.

Metrics are micro-averaged precision (P), recall (R) and F over the Medium-or-higher golden
comments (n). A matched Low golden comment counts as nothing; duplicates are neither TP nor FP.

The pipeline is pool-verify-v1 (059): review-diff-v1 and review-ctx-v1 findings pooled, then
filtered by verify-ctx-v1. v2 runs every stage on Nemotron 3.5 Super. It was chosen on dev (067:
3.5 Super met all three pre-registered conditions over 2 dev runs), adopted as the product (068),
and its Cal.com run was pre-registered (069; plan pushed at 13:38:03Z on 23 Oct, the first 3.5 call
on Cal.com at 13:38:51Z). **This is the second blind look at Cal.com.** The first was v1 (3 Super,
062, from `review-freeze-1`). Nothing was tuned after the v2 run, and there is no second v2 run.

## 2. Blind test: Cal.com, v2

10 pull requests, n = 23. Under bench-judge-v1 (scorer of record), with bench-judge-x1's F
alongside. The tool rows and the v1 row are Cal.com run 1's judged rows, unchanged.

| reviewer | comments | TP | FP | FN | P (n) | R (n) | F (v1) | F (x1) |
|---|---|---|---|---|---|---|---|---|
| **TraceHound v2 (pool-verify-v1, 3.5, run 4)** | 30 | 12 | 7 | 11 | 63.2% (12/19) | 52.2% (12/23) | **57.1%** | 58.5% |
| TraceHound v1 (pool-verify-v1, 3 Super, run 1) | 30 | 14 | 11 | 9 | 56.0% (14/25) | 60.9% (14/23) | 58.3% | 58.3% |
| augment | 23 | 15 | 3 | 8 | 83.3% (15/18) | 65.2% (15/23) | 73.2% | 73.2% |
| cursor | 21 | 13 | 3 | 10 | 81.3% (13/16) | 56.5% (13/23) | 66.7% | 66.7% |
| greptile | 24 | 10 | 7 | 13 | 58.8% (10/17) | 43.5% (10/23) | 50.0% | 55.0% |
| copilot | 49 | 15 | 27 | 8 | 35.7% (15/42) | 65.2% (15/23) | 46.2% | 50.8% |
| coderabbit | 31 | 9 | 17 | 14 | 34.6% (9/26) | 39.1% (9/23) | 36.7% | 37.5% |
| *review-diff-v1 (3.5, run 4) (secondary, not ranked)* | 30 | 12 | 6 | 11 | 66.7% (12/18) | 52.2% (12/23) | 58.5% | 60.0% |
| *pool-raw (3.5, run 4) (secondary, not ranked)* | 34 | 13 | 9 | 10 | 59.1% (13/22) | 56.5% (13/23) | 57.8% | 60.5% |

P and R are bench-judge-v1 counts. 11 of v2's 30 comments were judged duplicates (v1's run 1: 4),
which count neither as TP nor as FP. On this run the verifier did not raise F over review-diff-v1
alone (57.1% vs 58.5%). review-diff-v1 and pool-raw are stages of the same pipeline, declared as
secondary rows (061). 0 JUDGE_FAILED in any row under either judge; 1 of 10 pull requests had both
reviewer chunks fail on invalid JSON and was scored with no findings, as pre-registered
(`v2-calcom.md`).

### Cal.com: v2 minus each reviewer, 95% intervals

F(v2) − F(row) in points; PR-level paired bootstrap, 10,000 resamples, seed 69 (`v2-intervals.md`).
The sentence is the one the pre-registered rule allows; it is the same under both judges.

| v2 minus | v1: observed [95%] | x1: observed [95%] | sentence the rule allows |
|---|---|---|---|
| Augment | −16.0 [−30.9, +3.5] | −14.6 [−28.5, +4.4] | statistically tied with Augment |
| Cursor | −9.5 [−30.2, +16.7] | −8.1 [−27.9, +17.5] | statistically tied with Cursor |
| Greptile | +7.1 [−15.8, +36.8] | +3.5 [−17.1, +31.2] | statistically tied with Greptile |
| Copilot | +11.0 [−6.2, +27.7] | +7.7 [−8.3, +20.5] | statistically tied with Copilot |
| CodeRabbit | +20.4 [+11.8, +34.3] | +21.0 [+1.4, +37.0] | ahead of CodeRabbit |
| 3 Super pool-verify-v1 (run 1) | −1.2 [−16.0, +12.2] | +0.2 [−13.4, +13.1] | statistically tied with 3 Super |

A percentile bootstrap over 10 pull requests probably under-covers, so these intervals are likely
too narrow (`v2-intervals.md`, Limits).

## 3. All 50 PRs

All five repos together (40 dev + 10 Cal.com pull requests), micro-averaged over the 97 golden
comments of Medium or higher (74 dev + 23 Cal.com); FN = 97 − TP; 066's method. Counts are from
`v2-calcom.md` ("All 50 pull requests"), intervals from `v2-intervals.md` ("All-50 rank table"):
the primary 95% interval of TraceHound v2 (dev run 7r + Cal.com run 4) minus that row. The
pre-registered v2 row uses dev run 7r; the dev run 8 row is a second dev draw. Each TraceHound row
is ranked against the five tools only. Ranks are point estimates.

### All 50 PRs, bench-judge-v1 (scorer of record)

| reviewer | rank of 6 (point estimate) | TP | FP | FN | P (n) | R (n) | F | v2 minus row [95%] |
|---|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 16 | 41 | 77.8% (56/72) | 57.7% (56/97) | 66.3% | −14.0 [−22.6, −4.7] |
| Cursor | 2 | 42 | 17 | 55 | 71.2% (42/59) | 43.3% (42/97) | 53.8% | −1.6 [−12.6, +10.7] |
| **TraceHound v2: dev run 7r + Cal.com run 4 (pre-registered)** | 3 | 47 | 36 | 50 | 56.6% (47/83) | 48.5% (47/97) | **52.2%** | – |
| TraceHound v2: dev run 8 + Cal.com run 4 (second dev draw) | 3 | 46 | 35 | 51 | 56.8% (46/81) | 47.4% (46/97) | 51.7% | – |
| Greptile | 4 | 45 | 40 | 52 | 52.9% (45/85) | 46.4% (45/97) | 49.5% | +2.8 [−7.1, +13.2] |
| CodeRabbit | 5 | 41 | 67 | 56 | 38.0% (41/108) | 42.3% (41/97) | 40.0% | +12.2 [+3.8, +20.6] |
| Copilot | 6 | 43 | 104 | 54 | 29.3% (43/147) | 44.3% (43/97) | 35.2% | +17.0 [+6.0, +28.0] |
| *3 Super pool-verify-v1, row (i) (not ranked)* | – | 40 | 57 | 57 | 41.2% (40/97) | 41.2% (40/97) | 41.2% | +11.0 [+1.8, +20.1] |

### All 50 PRs, bench-judge-x1 (report only)

| reviewer | rank of 6 (point estimate) | TP | FP | FN | P (n) | R (n) | F | v2 minus row [95%] |
|---|---|---|---|---|---|---|---|---|
| Augment | 1 | 56 | 17 | 41 | 76.7% (56/73) | 57.7% (56/97) | 65.9% | −10.5 [−19.8, −0.3] |
| Cursor | 2 | 45 | 11 | 52 | 80.4% (45/56) | 46.4% (45/97) | 58.8% | −3.5 [−13.7, +8.3] |
| **TraceHound v2: dev run 7r + Cal.com run 4 (pre-registered)** | 3 | 49 | 31 | 48 | 61.3% (49/80) | 50.5% (49/97) | **55.4%** | – |
| TraceHound v2: dev run 8 + Cal.com run 4 (second dev draw) | 3 | 50 | 30 | 47 | 62.5% (50/80) | 51.5% (50/97) | 56.5% | – |
| Greptile | 4 | 49 | 32 | 48 | 60.5% (49/81) | 50.5% (49/97) | 55.1% | +0.3 [−9.5, +10.7] |
| CodeRabbit | 5 | 45 | 58 | 52 | 43.7% (45/103) | 46.4% (45/97) | 45.0% | +10.4 [+1.1, +19.2] |
| Copilot | 6 | 50 | 91 | 47 | 35.5% (50/141) | 51.5% (50/97) | 42.0% | +13.4 [+1.2, +25.6] |
| *3 Super pool-verify-v1, row (i) (not ranked)* | – | 45 | 45 | 52 | 50.0% (45/90) | 46.4% (45/97) | 48.1% | +7.2 [−3.0, +17.4] |

Row (i) is 066's v1 scorer-of-record line (dev run 1 + Cal.com run 1). **Robustness (report only,
pre-registered):** with dev run 8 in place of 7r, every all-50 sentence is the same under
bench-judge-v1. Under bench-judge-x1 one changes: the Augment interval becomes [−19.2, +1.3], which
includes 0. The 3 Super interval under bench-judge-v1 becomes [+0.5, +20.3], still above 0
(`v2-intervals.md`). The dev part of all 50 is the set v2 was selected on, so the all-50 gaps are
not held-out results.

## 4. Dev set

40 pull requests, n = 74, the set every variant was tuned on. Means per model from `dev-ultra.md`'s
first table (per-run rows: `dev-3.5.md`, `v3-recall.md`, `dev-ultra.md`). 0 JUDGE_FAILED in any run.

| row | judge | 3 Super, mean of 5: P / R / F | 3.5 Super, mean of 2: P / R / F | Ultra, mean of 2 (report only): P / R / F |
|---|---|---|---|---|
| pool-verify-v1 | v1 | 40.5 / 44.3 / 42.3 | 54.8 / 46.6 / 50.4 | 39.0 / 59.5 / 47.1 |
| pool-verify-v1 | x1 | 50.9 / 51.9 / 51.3 | 60.5 / 50.7 / 55.1 | 46.5 / 66.9 / 54.9 |
| pool-raw | v1 | 30.0 / 52.7 / 38.2 | 48.0 / 61.5 / 53.9 | 32.7 / 65.5 / 43.6 |
| pool-raw | x1 | 37.3 / 63.8 / 47.0 | 49.2 / 62.2 / 54.9 | 39.5 / 73.6 / 51.4 |

- 3 Super runs 1, 2r, 4, 5, 6; 3.5 Super runs 7r, 8; Ultra runs 10, 11.
- **3.5 − 3 Super, pool-verify-v1** (067, paired bootstrap, 10,000 resamples, seed 67,
  `dev-3.5.md`): v1 +8.1 points [+1.4, +14.4]; x1 +3.9 [−4.2, +11.1].
- **Ultra** (071, `dev-ultra.md`): the only interval that excludes 0 is pool-raw under v1,
  Ultra − 3.5 = −10.2 [−17.7, −3.2]. Every other comparison shows no interval-backed difference.
  Ultra is report only: free NVIDIA API, not Token Factory, not the product.
- Run-to-run spread at temperature 0: 35.6–48.0 F over the five 3 Super pool-verify-v1 runs.
- 3.5 fails to return valid JSON on about 7 of 40 pull requests per run (7 in run 7r, 7 in run 8);
  a failed chunk contributes no findings, and those scores include that cost.
- The five tools' dev F under v1: augment 64.1, cursor 49.6, greptile 49.3, coderabbit 41.0,
  copilot 31.3 (060).

## 5. ReviewBench test runs

ReviewBench (`review-bench/ReviewBench`), 25 pull requests, one round, ReviewBench's own judge;
image `9b9a5127` (P008). From `reviewbench.md`, "Test runs (portal, 23–24 Oct)".

| # | config | grounded F1 | G P | G R | augmented F1 | A P | findings |
|---|---|---|---|---|---|---|---|
| 331 | **pool-raw-x2 · 3 Super** (pre-registered winner) | **21.3** | 76.3 | 12.4 | 30.6 | 50.6 | 222 |
| 333 | pool-raw-missed · 3 Super | 20.4 | 64.5 | 12.1 | 28.9 | 43.9 | 194 |
| 328 | pool-raw · 3 Super | 16.0 | 70.6 | 9.0 | 23.0 | 52.5 | 124 |
| 330 | pool-verify-v1 · 3 Super | 13.9 | 79.5 | 7.6 | 22.3 | 67.2 | 99 |
| 329 | pool-raw · 3.5 | 13.5 | 56.3 | 7.7 | 19.0 | 44.0 | 86 |
| 332 | pool-verify-v1 · 3.5 (= the product) | 12.2 | 69.2 | 6.7 | 17.6 | 57.2 | 60 |

- These are test runs, **not a leaderboard submission**, and they imply no leaderboard rank.
- There is no final run: the final (219 pull requests × 3 rounds) would cost about $107 with VAT
  (measured from #331: $3.45 per 25-PR round) against a $43.52 balance (P008 amendment 8).
- Six configurations on the same 25 pull requests: the top score among them carries selection
  bias.
- 3.5 lost to 3 Super on ReviewBench in both pipelines (pool-verify-v1 12.2 vs 13.9; pool-raw 13.5
  vs 16.0), the reverse of the dev result.
- ReviewBench's grounded metric rewards volume (findings), which the product's verifier cuts.

## 6. v1 history: every Cal.com run (3 Super)

v1 (pool-verify-v1 on 3 Super, `review-freeze-1`, 062) is superseded by v2. Its F in each Cal.com
run and its point-estimate rank among the six reviewers. The full v1 page (dev tables, all-50
tables, predictions) is [`results.md` at `e91a268`](https://github.com/SunnyBagal/TraceHound/blob/e91a268/docs/bench/results.md).

| Cal.com run | bench-judge-v1: F, point-estimate rank | bench-judge-x1: F, point-estimate rank |
|---|---|---|
| 1 (headline) | 58.3%, 3rd | 58.3%, 3rd |
| 2 | 51.3%, 3rd (n = 21, one JUDGE_FAILED) | 57.1%, 3rd |
| 3 | 52.8%, 3rd | 47.3%, 5th (below greptile 55.0 and copilot 50.8) |

These ranks are point estimates: for v1's run 1 no gap to another tool was outside its 95%
interval ([audit-cc01 §3.2](audit-cc01.md#32-bootstrap-95-ci-over-prs-for-the-calcom-f-difference)).

## 7. Precision levers tried on dev

Every idea tried after the diff-only baseline review-diff-v1 (055: F 32.2% / P 25.6% on dev run 1).
056–059 are single dev runs (40 pull requests, n = 74); 064 and 065 compare 5-run means over dev
runs 1, 2r, 4, 5 and 6. The levers v2 rows replay saved dev records ($0, no model call); their
intervals are exploratory and unadjusted. All values are under bench-judge-v1 unless marked x1.

| decision | idea | bar | result (F / P on dev) | verdict |
|---|---|---|---|---|
| 056 verify-v1 | A second Super pass gives each review-diff-v1 finding a confidence of 1–5; findings below a threshold are dropped. | The threshold with the highest dev F, ties to the higher; no bar against the baseline. | Threshold 1, which keeps every finding: 32.2% / 25.6%. Thresholds 2–5: F 32.1, 31.2, 29.2, 29.1%; P 29.5, 30.0, 31.7, 44.4%. | No gain: the rule chose the threshold that removes nothing. |
| 057 review-ctx-v1 | The reviewer also sees repository context: the changed files and git grep references. | None pre-registered; compared with review-diff-v1 (32.2% / 25.6%). | 31.8% / 36.2% | F did not move. Used later only as a second source for 059's pool. |
| 058 verify-ctx-v1 | A verifier that sees repository context answers keep or drop for each review-diff-v1 finding. | F ≥ 35.0% | 32.8% / 38.9% | Loss; not used on its own. |
| 059 pool-verify-v1 | Pool review-diff-v1's findings with review-ctx-v1's ctx-only findings, then filter with verify-ctx-v1. | F ≥ 35.0% | Run 1: 35.6% / 36.1%. 5-run mean (064): 42.3% / 40.5%. | **Adopted**, at a 0.6-point margin on run 1. |
| 064 vote | Keep only findings that recur across five independent runs (best variant: vote-k3of5). | v1 F ≥ the baseline's 5-run mean + 5.0 points; v1 P above the baseline's mean; x1 F ≥ the baseline's x1 mean. | vote-k3of5: 47.8% / 53.3%, against the baseline's 42.3% / 40.5%; x1 F 50.4%, against 51.3%. | Loss: fails the x1 condition. |
| 065 evidence verifier + gate | B: a verifier that must quote the failing code, then a deterministic gate that checks the quote. A: the gate alone, on pool-verify-v1. | A: mean P above the baseline's, and mean F at least the baseline's under v1 and x1. B: mean v1 F +3.0 points, mean v1 P +8.0 points, mean x1 F at least the baseline's. | 5-run means: A 41.6% / 40.3%; B 38.3% / 37.2%; baseline 42.3% / 40.5%. | Loss: A and B both fail every condition. |
| 067 3.5 Super | Run every stage of pool-verify-v1 on Nemotron 3.5 Super instead of 3 Super. | Mean over the completed runs: v1 F ≥ 45.28%, v1 P ≥ 40.52%, x1 F ≥ 51.29%. | 2-run mean (7r, 8): 50.4% / 54.8%; x1 F 55.1%. | **Adopted** (068), on 2 runs (the plan's fallback: the cap stopped run 9). |
| 070 recall-v3 | Two lenses per chunk (A: correctness, reliability, security, performance, API; B: tests, docs, typos, maintainability, completeness) plus a missed-issue pass; arm S on 3 Super, arm V on 3.5. | P009: v1 precision ≥ the model's pool-raw dev mean − 10.0 points (S 20.0, V 38.0); pick the qualifying arm with the higher recall. | S 21.8% / 14.0%; V 31.4% / 20.9%. | Loss: both arms below P009's precision floor. Measured partly hampered by truncated replies and the $0.12 per-PR cap. |
| 071 Nemotron 3 Ultra | Run every stage of pool-verify-v1 on Nemotron 3 Ultra via the free NVIDIA API. | None (report only); compared with the 3 Super and 3.5 Super means. | 2-run mean (10, 11): 47.1% / 39.0%; pool-raw 43.6% / 32.7%, against 3.5's 53.9% (−10.2 [−17.7, −3.2]). | Report only, not adopted: no interval-backed gain; worse than 3.5 on pool-raw. |
| levers v2: per-PR cap | Keep at most k findings per pull request (k = 1–5), ranked by agreement or by order, replayed on saved dev runs of 3 Super, 3.5 and Ultra. | Report only; a cell counts only if its 95% interval excludes 0. | 3.5 verified, uncapped 50.4%: k = 1–5 F 39.8 to 50.9% (agreement), 33.7 to 51.5% (order). Pool-raw: 4 cells above 0 (3 Super k = 4–5, 3.5 k = 5). | No cap on the verified pipeline improves F with an interval excluding 0; small gains only on the unverified pool at k = 4–5. Hypothesis, not adopted. |
| levers v2: verifier on/off | Verified (pool-verify-v1) minus raw (pool-raw) F on the same 9 saved dev runs. | Report only; interval rule as above. | Interval above 0 in 2 of 9 runs (3 Super 2r +10.9, Ultra 11 +6.7). 3.5: 7r −1.6 [−10.0, +5.5], 8 −5.4 [−14.7, +3.3]. | Inconclusive on 3.5: an open question, not a finding. On ReviewBench raw scores higher in both models. |
| levers v2: 2-of-3 vote | Keep 3 Super verified findings that recur in 2 of 3 runs. | Report only; vote F against the mean of its three runs. | Runs 4, 5, 6: 38.4% / 37.7% (mean 42.6; −4.2 [−10.5, +1.9]). Runs 1, 2r, 4: 48.9% / 56.1% (mean 42.5; +6.3 [−0.3, +12.6]). | No gain established. |

The run-to-run spread of the 3 Super reviewer (35.6–48.0 F over 5 runs at temperature 0) is larger
than most effects we tried to measure. NVIDIA recommends temperature 1.0 and top_p 0.95 for 3 Super
([model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16),
[NIM reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b)). All
our runs used 0, which is a limit, not a tuned choice.

Where v2's misses are (`levers-v2.md`, v1): both 3.5 dev runs miss 35 of 74 Medium-or-higher golden
comments; none of the 7 Critical ones is missed by both; the most missed repo is sentry (14 of 21
Medium-or-higher).

## 8. Losses

- **The graph did not help the repair agent** (050).
- **Context-aware verifier** (058), **vote across runs** (064), **evidence verifier** (065):
  losses (section 7).
- **recall-v3** (070): both arms below P009's precision floor. The measurement was partly hampered
  by truncated replies and the $0.12 per-PR cap. Two v3 defects found by Bugbot on PR #62 are
  documented, not fixed (`v3-recall.md`).
- **Nemotron 3 Ultra** (071): no interval-backed gain; worse than 3.5 on pool-raw.
- **No ReviewBench final** (money; section 5). 3.5 lost to 3 Super on ReviewBench in both pipelines.
- **On v2's Cal.com run the verifier did not raise F** over review-diff-v1 alone (57.1% vs 58.5%
  under v1; 58.5% vs 60.0% under x1).
- **v1 dev run 2 was void.** The relay session's 2-hour limit on background commands killed the
  process at pull request 30 of 40, after $1.4429; it was never scored. It was restarted once as
  2r (complete), which stands for dev run 2 (061a).
- **v1 dev run 3 was not done.** It stopped at the cap at pull request 16 of 40 after $0.7581.
- **One JUDGE_FAILED:** v1 Cal.com run 2, pool-verify-v1, bench-judge-v1; left out of that cell
  (n = 21) and not re-judged.
- **Ledger gap:** across v1 dev run 3 the ledger rose $0.7694, $0.0113 more than its run.json
  ($0.7581). The gap is reported, not explained.

## 9. Limits

From 061:
- There is one pre-registered primary run. The repeats measure spread; they are not extra chances.
- The configuration was the fourth reviewer variant chosen on the same dev set (v1).
- The judge is the same model (Nemotron 3 Super) as v1's reviewer and verifier. v2's reviewer is
  Nemotron 3.5 Super: the same family, no longer the same model.
- The golden set was built from the tools' comments (060).
- n is small (a test set of 10 pull requests, n = 23).
- The pull requests have been public since 2025, so models may have seen them.

Added by 062:
- Run-to-run spread at temperature 0 is large compared with the margins the reviewer was chosen
  on. On Cal.com, v1's pool-verify-v1 F moved 7 points over three runs (51.3–58.3%), and
  review-diff-v1's ranged from 38.5% to 53.8%.
- The five tools were judged once, on their recorded reviews; TraceHound's rows carry run-to-run
  spread that the tools' rows do not show.
- Cal.com is one TypeScript repo, so the absolute numbers say little about other repos.

Added for v2:
- v2 was chosen on the same dev set (067), which earlier decisions had already been tuned on, and
  the all-50 tables include those 40 pull requests.
- There is one v2 Cal.com run, and it is the second look at Cal.com. One 3.5 run cannot separate
  3.5 from 3 Super on Cal.com: the −1.2-point difference to v1's run 1 is well inside v1's spread.
- 3.5 returns partial reviews: a reviewer chunk that fails on invalid JSON contributes no findings
  (about 7 of 40 dev pull requests per run, 1 of 10 on Cal.com).
- The intervals cover pull-request sampling only, not run-to-run spread or judge error, and are not
  corrected for multiplicity (24 gaps tested in `v2-intervals.md`).

## 10. Cost

Prices are the third-party rates in `config/prices.json`; costs are pre-VAT.

- **Product (v2):** about $0.06–0.07 per pull request on 3.5, about 2 minutes wall time median.
  Cal.com run 4: median $0.0717, max $0.1298 per pull request; wall time median 128 s, max 285 s;
  the whole run $0.7228 (pipeline $0.7086, judging $0.0142) (`v2-calcom.md`).
- **Dev, pipeline only** (judges excluded, every attempt counted; `dev-3.5.md`):

| pipeline per pull request | n | input tokens median | output tokens median | output tokens mean | cost median | cost mean | cost max |
|---|---|---|---|---|---|---|---|
| 3 Super (runs 1, 2r, 4, 5, 6) | 200 | 41,393 | 19,688 | 27,546 | $0.0307 | $0.0430 | $0.2724 |
| 3.5 Super (runs 7r, 8) | 80 | 49,357 | 50,064 | 62,471 | $0.0626 | $0.0743 | $0.3031 |
| 3.5 Super (runs 7r, 8 and the 23 PRs of run 9) | 103 | 50,151 | 52,510 | 63,497 | $0.0642 | $0.0756 | $0.3397 |

- **v1 history (062):** per pull request on Cal.com (all pipeline stages plus both judges) median
  $0.0391 / $0.0422 / $0.0432 in runs 1 / 2 / 3, max $0.0859; the whole of 062 spent $5.31 against
  a $15 cap.
- **Whole project:** $57.05 + VAT of Nebius spend over the 30 days to 24 Oct (Nebius console,
  owner's record).
