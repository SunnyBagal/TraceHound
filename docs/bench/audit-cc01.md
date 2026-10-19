# Independent audit of the benchmark claims (cc-01)

An outside audit of the public PR-reviewer benchmark claims, written as a hostile but fair
reviewer would write it. The auditor had no part in producing the results. Inputs: the repo at
`e4e3e3a` (2026-10-18), specifically `README.md` (`## PR reviewer benchmark`),
`docs/bench/results.md`, `test-results.md`, `test-plan.md`, `scorer-validation.md`,
`scorer-checks.md`, `pool-verify.md`, and decisions 054–063 in `docs/decisions.md`.
Nothing was fetched: no Cal.com pull request, golden comment, or tool review was read from
anywhere. Every number below comes from counts already in this repo, or is computed from them.
No model call was made.

"TraceHound" means pool-verify-v1 (decision 059). v1 means bench-judge-v1, the scorer of record.
x1 means bench-judge-x1, which is report only. F is in percent unless marked as points.

## Verdict

- **Arithmetic: clean.** I recomputed 486 `x% (a/b)` figures and 219 table rows. I found no
  mismatch in any P, R or F, or in comments = TP + FP + dup + low, TP + FN = n, per-repo sums,
  per-PR sums, the spread tables, kappa, tau-b, augmented precision, ranks, spend arithmetic or
  the "published" deltas.
- **Text: five inconsistencies or overstatements**, all in `results.md` (section 1). None
  changes a number. Three soften a weakness: the judge being the reviewer's own model, the
  second judge's effect, and what "blind" covered.
- **The headline is a correct point estimate, not a demonstrated ranking.** "3rd of six" is
  what the Cal.com run 1 table says. But that set has 10 pull requests and n = 23. Two judge
  decisions tie TraceHound with Greptile, and no gap to any tool is distinguishable from zero
  with the data in the repo (section 3.2). The README's "approximate" undersells this.
- **A critic's headline would be "4th of six"**: all 50 PRs under the scorer of record give
  TraceHound F 41.2%, behind Greptile's 49.5% (section 3.1). Averaging the three Cal.com runs
  under the second judge also puts it 4th, behind Greptile.

## 1. Recomputation of every P / R / F

**Method.** A script scanned the listed files (decisions.md from `## 054` on). For every
`x% (a/b)` it checked that a/b rounds to x. For every table row with a precision (n) cell, a
recall (n) cell and an F cell it checked:

- that P's numerator equals R's numerator;
- that F = 2PR/(P + R) rounds to the printed F;
- where count columns exist, that TP + FP equals P's denominator, TP + FN equals n, and
  comments = TP + FP + dup + low.

Separately I checked:

- that per-repo rows sum to the overall rows (pool-verify.md, scorer-checks.md v1 and x1);
- that the 40 per-PR TP/FP rows sum to each overall row (pool-verify.md:88-131);
- that the tools' dev rows plus their Cal.com rows equal scorer-validation.md's all-50 rows;
- that the spread tables are internally consistent (the min/median/max of P and R recover
  unique per-run counts that reproduce every printed F);
- that the run × judge ranks are right, and that the kappas (from the confusion matrices),
  tau-b (from the rank table), precision gaps, augmented precision, "published" deltas,
  ledger differences and plan-item sums are right.

**Result: 0 numeric mismatches.** Examples of what reproduces exactly:

- kappa 0.809 (observed 0.872, expected 0.327, n 1,130);
- validity kappa 0.395 (expected 0.516);
- tau-b 0.891;
- mean precision gaps −4.5 / −6.6;
- 062 spend $0.4112 + $0.9154 + $3.9830 = $5.3096 (ledger $17.76195 − $12.45236 = $5.30959);
- dev run 3 allowance $4 − $1.4429 − $1.7707 = $0.7864;
- the claim that "one TP fewer gives 34.2%" (25/72, 25/74 → 34.25%).

The derived per-run counts that back the spread tables (not printed in the repo, but uniquely
implied by it) are as follows. pool-verify-v1, Cal.com, v1: run 2 TP 10 / FP 8 / n 21; run 3
TP 14 / FP 16. pool-verify-v1, dev run 2r: v1 TP 36 / FP 40; x1 TP 39 / FP 33.

**Textual inconsistencies (no number is wrong):**

| # | where | says | but |
|---|---|---|---|
| T1 | `docs/bench/results.md:19-20` | "pre-registered before any Cal.com result existed (061)" | The five tools' Cal.com counts and F were scored on 2026-10-14 and are in the repo: `scorer-validation.md:62-70` (decision 054), before the reviewer was built. Accurate wording: "before any TraceHound result on Cal.com existed". |
| T2 | `docs/bench/results.md:20` | "ran once from frozen code, tag `review-freeze-1` → `6b4276e`" | Cal.com ran three times (runs 2–3 are repeats; `results.md:50-54`), and every run ran from `e7309a5`, not `6b4276e`. The frozen-paths diff was empty (`test-results.md:6-9`, `:142-143`). |
| T3 | `docs/bench/results.md:112` | "The judge is the same model family as the reviewer" | It is the same model, `nvidia/nemotron-3-super-120b-a12b`, for the reviewer, the verifier and the scorer of record (`decisions.md:3017-3018`, `:3051`; `scorer-validation.md:3-4`). The same wording is at `test-results.md:162` and `decisions.md:3154`. |
| T4 | `docs/bench/results.md:112` | "(060: the gap is small)" | 060's rule was "Report the numbers; draw no conclusion beyond them" (`decisions.md:2956`). The numbers are not small for the adopted row: pool-verify-v1's gap is −11.6 points, against −6.6 for the tools' mean (`scorer-checks.md:184-186`). |
| T5 | `docs/bench/results.md:18-19` | x1 "is reported alongside and changes nothing (060)" | Under x1, prediction (a) fails in Cal.com run 1 (`results.md:94-95`) and in run 3, holding in 1 of 3 runs (`test-results.md:64-65`). x1 also moves run 3 to 5th (`results.md:54`). x1 changes no *decision*, but it does change results. |

## 2. Are the claims supported?

| claim (quoted) | where | supported by | verdict |
|---|---|---|---|
| "On the pre-registered blind test, TraceHound ranked 3rd of six under the scorer of record, behind Augment and Cursor, ahead of Greptile, Copilot and CodeRabbit." | `README.md:24`, `results.md:3-4` | `test-results.md:21-28` | **Supported as a point estimate; overstated as a ranking.** No interval is given. 2 judge flips tie Greptile and 2 flips the other way tie Cursor (section 3.2). |
| "On the dev set it ranked 5th of six." | `README.md:24`, `results.md:4` | `scorer-checks.md:32-42` | Supported for dev run 1 (the pre-registered dev run). Dev run 2r ranked 4th (`results.md:68`), which the README does not say. |
| "Run-to-run spread at temperature 0 is larger than the margins the reviewer was chosen on, so treat single-run ranks as approximate." | `README.md:24`, `results.md:5-6` | `test-results.md:74`; `decisions.md:2905-2908` | Supported (12.4-point dev spread against a 0.6-point adoption margin). **Understated**: the ranks are not just approximate; on this data they cannot be separated from ties (section 3.2). |
| README table, both columns | `README.md:26-33` | `test-results.md:21-28`; `scorer-checks.md:32-42` | Supported; every cell matches. |
| "a second judge … is reported alongside and changes nothing (060)" | `results.md:17-19` | — | **Overstated** (T5). |
| "pre-registered before any Cal.com result existed (061) and ran once from frozen code, tag `review-freeze-1` → `6b4276e` (062)" | `results.md:19-20` | — | **Inaccurate** (T1, T2). |
| "Every number on this page is copied from …" | `results.md:8-9` | — | Mostly. The run × judge ranks in section 3 are computed, not copied; they recompute correctly. |
| "3rd in 5 of 6 run × judge cells, 5th in one. Under v1 the margin over greptile (50.0%) was 1.3 to 8.3 points." | `results.md:56-57` | `test-results.md:56`, `:64`; `:24`, `:37` | Supported. Not said: under x1, the mean of the three runs (54.2%) is below Greptile's 55.0%. |
| "Under bench-judge-x1, review-diff-v1 alone (60.0%) scores above pool-verify-v1 (58.3%) on Cal.com run 1, so prediction (a) holds only under the scorer of record." | `results.md:94-95` | `test-results.md:34-35` | Supported, but **incomplete**: under x1 the filter also loses in run 3 (47.3% against 52.6%). The x1 3-run means are pool-verify-v1 54.2% and review-diff-v1 55.2%. |
| "The judge is the same model family as the reviewer (060: the gap is small)." | `results.md:112` | — | **Understated / unsupported** (T3, T4). |
| "pool-verify-v1's run 1 F there (58.3%) is above its F on every dev repo (27.3% to 44.4%)" | `results.md:126-127` | `pool-verify.md:46,57,68,79` | Supported. |
| Predictions (a), (b), (c) scored | `results.md:83-89` | `test-results.md:21-22`; `decisions.md:3109-3119` | Supported as scored. (c) was a two-sided "not within 5 points" guess and came true because Cal.com was much *higher*. |
| Cost lines | `results.md:131-136` | `test-results.md:90-107`; `pool-verify.md:191-193` | Supported. |

## 3. What a critic would compute

### 3.1 All 50 pull requests (dev run 1 + Cal.com run 1), micro-averaged, n = 97

The tools' all-50 rows under v1 already exist (`scorer-validation.md:24-28`), and dev + Cal.com
reproduces them exactly. TraceHound's row is the sum of `pool-verify.md:35` and
`test-results.md:21`.

**Under bench-judge-v1 (scorer of record):**

| rank | reviewer | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| 1 | Augment | 56 | 16 | 41 | 77.8% (56/72) | 57.7% (56/97) | 66.3% |
| 2 | Cursor | 42 | 17 | 55 | 71.2% (42/59) | 43.3% (42/97) | 53.8% |
| 3 | Greptile | 45 | 40 | 52 | 52.9% (45/85) | 46.4% (45/97) | 49.5% |
| **4** | **TraceHound (pool-verify-v1)** | 40 | 57 | 57 | 41.2% (40/97) | 41.2% (40/97) | **41.2%** |
| 5 | CodeRabbit | 41 | 67 | 56 | 38.0% (41/108) | 42.3% (41/97) | 40.0% |
| 6 | Copilot | 43 | 104 | 54 | 29.3% (43/147) | 44.3% (43/97) | 35.2% |
| – | *pool-raw (secondary)* | 54 | 140 | 43 | 27.8% (54/194) | 55.7% (54/97) | 37.1% |
| – | *review-diff-v1 (secondary)* | 46 | 108 | 51 | 29.9% (46/154) | 47.4% (46/97) | 36.7% |

**Under bench-judge-x1 (report only):**

| rank | reviewer | TP | FP | FN | P (n) | R (n) | F |
|---|---|---|---|---|---|---|---|
| 1 | Augment | 56 | 17 | 41 | 76.7% (56/73) | 57.7% (56/97) | 65.9% |
| 2 | Cursor | 45 | 11 | 52 | 80.4% (45/56) | 46.4% (45/97) | 58.8% |
| 3 | Greptile | 49 | 32 | 48 | 60.5% (49/81) | 50.5% (49/97) | 55.1% |
| **4** | **TraceHound (pool-verify-v1)** | 45 | 45 | 52 | 50.0% (45/90) | 46.4% (45/97) | **48.1%** |
| 5 | CodeRabbit | 45 | 58 | 52 | 43.7% (45/103) | 46.4% (45/97) | 45.0% |
| 6 | Copilot | 50 | 91 | 47 | 35.5% (50/141) | 51.5% (50/97) | 42.0% |
| – | *pool-raw (secondary)* | 61 | 123 | 36 | 33.2% (61/184) | 62.9% (61/97) | 43.4% |
| – | *review-diff-v1 (secondary)* | 50 | 99 | 47 | 33.6% (50/149) | 51.5% (50/97) | 40.7% |

**Sensitivity (derived counts, not pre-registered).** Replace dev run 1 with dev run 2r, whose
counts are implied by `test-results.md:74,82`:

- under v1, TraceHound becomes TP 50 / FP 51 / FN 47, F 50.5%. That is 3rd, 1.0 point above
  Greptile;
- under x1 it becomes TP 53 / FP 44 / FN 44, F 54.6%. That is 4th, 0.5 below Greptile.

The 50-PR rank therefore swings between 3rd and 4th with which dev run is used. The
pre-registered view (run 1 on both sets) is 4th under both judges.

The critic's reading: the "3rd of six" headline uses the 10 of 50 PRs that are TraceHound's
best repo. Its Cal.com F, 58.3%, is 13.9 points above its best dev repo (44.4%). The tools'
Cal.com F compared with their best dev repo (`scorer-validation.md:41-70`):

- Greptile and Augment are inside their dev range;
- CodeRabbit is 1.6 points below its range;
- Copilot is 4.8 points above its best dev repo;
- Cursor is 10.4 points above its best dev repo.

So Cal.com is easier for most reviewers, and most of all for TraceHound. On the whole benchmark
TraceHound is 4th, 8.3 points behind Greptile and 1.2 points ahead of CodeRabbit.
The pre-registration does justify Cal.com as *the* test set. But it guards against selecting a
configuration on dev, not against reading one repo as the product's general standing.

### 3.2 Bootstrap 95% CI over PRs for the Cal.com F difference

**Per-PR counts are not in the repo, so a PR-level bootstrap cannot be computed.**

- For Cal.com there is no per-PR TP/FP/FN for any reviewer. `test-results.md` holds totals
  only, and `scorer-validation.md:117-129` gives changed-file counts, not scores.
- For dev there are per-PR TP/FP for the six TraceHound rows (`pool-verify.md:88-131`), but no
  per-PR FN and no per-PR golden counts. There are no per-PR rows for the tools at all.

Below are the best bounds I can give from the aggregate counts.

**(a) Fragility: how many single judge decisions reverse an order (v1, Cal.com run 1).**
Relabelling one TraceHound TP as FP also turns that golden comment into an FN.

| tool | F gap (points) | TraceHound relabels to tie or reverse | tool relabels to tie or reverse |
|---|---|---|---|
| Augment | −14.8 | 4 FP→TP (F 75.0%) | – |
| Cursor | −8.3 | 2 FP→TP (tie, 66.7%) | – |
| Greptile | +8.3 | 2 TP→FP (tie, 50.0%) | 2 FP→TP |
| Copilot | +12.2 | 3 TP→FP (45.8%) | 4 FP→TP |
| CodeRabbit | +21.6 | 6 TP→FP (33.3%) | 6 FP→TP |

How plausible are flips this size? Across 1,130 dev comments the two judges disagreed on the
outcome class of 145, or 12.8% (`scorer-checks.md:145-150`). Of those, 58 (5.1%) were
TP↔FP flips. TraceHound's Cal.com run 1 has 30 comments. At those rates a second, comparable
judge would relabel about 4 of them, about 1.5 as TP↔FP. The 2 flips needed to tie Greptile or
Cursor are well within one judge swap.

**(b) Comment-level bootstrap with a clustering correction.** Each reviewer's TP/FP/FN events
are resampled as a multinomial (200,000 resamples, seed 20261018), and the two reviewers are
resampled independently. This ignores clustering by PR, which makes it too narrow. To correct
for that, I estimated a design effect from the only per-PR data in the repo: a PR-level
bootstrap of dev precision for the six TraceHound rows, compared with the binomial variance.
The design effect ranged from 1.16 to 2.69, median 1.63. The "inflated" column widens the
interval by √1.63 = 1.27.

| TraceHound − tool (v1) | observed | comment-level 95% | inflated 95% | share of resamples > 0 |
|---|---|---|---|---|
| Augment | −14.8 | [−38.1, +8.4] | [−44.0, +14.3] | 0.10 |
| Cursor | −8.3 | [−32.3, +16.1] | [−39.2, +22.5] | 0.24 |
| Greptile | +8.3 | [−17.0, +33.9] | [−24.0, +40.7] | 0.74 |
| Copilot | +12.2 | [−11.1, +33.6] | [−16.6, +40.9] | 0.86 |
| CodeRabbit | +21.6 | [−3.0, +45.6] | [−9.1, +52.3] | 0.96 |

Under x1 the Greptile gap is +3.3 (95% [−21.7, +28.9]) and the Copilot gap is +7.5
([−15.7, +29.4]). The other three are as under v1.

**(c) Pairing.** Both reviewers see the same 10 PRs, so a paired bootstrap would be narrower
than (b) if their per-PR results are positively correlated. With no clustering, the correlation
needed for the 95% interval to exclude 0 is:

| tool | correlation needed (no clustering) | correlation needed (design effect 1.63) |
|---|---|---|
| Augment | 0.58 | 0.74 |
| Cursor | 0.88 | 0.93 |
| Greptile | 0.90 | 0.94 |
| Copilot | 0.71 | 0.83 |
| CodeRabbit | 0.19 | 0.51 |

Only the CodeRabbit gap is likely to be distinguishable from zero. The Greptile and Cursor
gaps would need near-perfect correlation.

**(d) An empirical floor that needs no model.** TraceHound's own Cal.com F moved 7.0 points over
three runs under v1 (51.3 to 58.3%) and 11.0 points under x1 (47.3 to 58.3%)
(`test-results.md:56`, `:64`). That is with the PRs, golden set and judge held fixed. This
spread is as large as the gaps to Greptile and Cursor. The headline run 1 is also the best of
the three under v1. It was pre-registered as primary, so this is not cherry-picking, but the
3-run means are lower:

- under v1: 54.1% (still 3rd);
- under x1: 54.2%, which is **below Greptile's 55.0% (4th)**.

**Bottom line for 3.2.** With the counts in the repo, the defensible statement is: "On Cal.com,
TraceHound's F was clearly above CodeRabbit's, and not distinguishable from Augment, Cursor,
Greptile or Copilot." A real PR-level CI needs per-PR TP/FP/FN for every Cal.com row. That is
counts only, so it would be compatible with the blindness rules.

## 4. Threats to validity, ranked by severity

| # | threat | severity | already disclosed? |
|---|---|---|---|
| 1 | **No uncertainty on a 10-PR, n = 23 test set.** The ranking rests on gaps of 2–4 judge decisions, every gap except CodeRabbit's is within noise (3.2), and no interval is reported. | High | Partly. "n is small" (`results.md:114`), "approximate" (`README.md:24`), and 054's "a difference of a few points between tools is within what one judge can move" (`decisions.md:2581-2582`, not carried into results.md). No CI or fragility figure anywhere. |
| 2 | **The reviewer grades itself.** Nemotron Super writes the findings, filters them (verify-ctx-v1), and is the scorer of record. So the filter optimises toward the judge's notion of a valid finding. Under the independent x1 judge, the filter's advantage over review-diff-v1 shows in 1 of 3 Cal.com runs, against 3 of 3 under v1, and TraceHound's 3-run mean falls below Greptile. On Cal.com run 1, v1 − x1 precision is 0.0 for TraceHound and −2.3 points on average for the tools. That is the self-preference direction, though small and with n tiny. | High | Partly, and softened: "same model family … gap is small" (`results.md:112`; T3, T4). The run-1 flip is disclosed (`results.md:94-95`). Super as both reviewer and validity judge is disclosed (`scorer-checks.md:264`, `decisions.md:2997-2998`). |
| 3 | **The headline subset against the whole benchmark.** "3rd of six" comes from the Cal.com 20% of the benchmark, TraceHound's best repo by 13.9 F points. On all 50 PRs it is 4th under both judges, 8.3 F points behind Greptile (3.1). The tool-vs-TraceHound order also flips between dev and test (Greptile and CodeRabbit both go from ahead to behind). | High–medium | Partly. The dev rank is in the README and the one-repo caveat is at `results.md:126-127`. No combined table is given. The tools' 50-PR rows are in `scorer-validation.md:24-28`, but not next to TraceHound. |
| 4 | **Unequal conditions for the tools.** The tools are fixed historical reviews: recording date not stated in the repo, tool versions since superseded, judged once. TraceHound ran in Oct 2026 on a current model, three times. The counting rule keeps only top-level line-level comments, which matches TraceHound's output format exactly but drops the tools' review bodies and summaries (for example, 56 issue comments and 10 reviews in `coderabbit-cal_dot_com`, `scorer-validation.md:87`). | Medium | Partly. "Judged once, on their recorded reviews" (`results.md:122-124`); the counting rule is at `scorer-validation.md:10-11` and `decisions.md:2560-2562`. Staleness and the format fit are not discussed. |
| 5 | **The golden set was curated by Augment (ranked 1st) from the tools' own comments.** A valid finding no tool made counts as FP. This biases *against* TraceHound, so a fair critic must grant it; it also means the benchmark measures agreement with these five tools. | Medium | Yes: `results.md:113`, `decisions.md:2586-2587`, `:2935-2937`. results.md does not name Augment as the curator. |
| 6 | **Contamination.** The PRs, golden comments and tool reviews are public, so Super may have seen them. This could inflate Cal.com F and would be undetectable here. | Medium | Yes: `results.md:115`, `decisions.md:3157`. |
| 7 | **Blindness is self-attested and incomplete.** The benchmark data and per-comment records live outside the repo (`~/Projects/tracehound-bench/`), so blindness cannot be checked from outside. The tools' Cal.com scores and file-type mix were in the repo from 054 on (T1). | Low–medium | Partly. The procedure is described (`decisions.md:2546-2548`, `:3133-3135`); the Cal.com tool table is visible but not flagged as prior knowledge. |
| 8 | **This judge is more lenient than published scoring.** It gives every tool a higher F than Augment's write-up, by 1.0 to 10.2 points, so absolute F values (for example "58.3%") are not comparable with vendor leaderboards. The judge also sees no diff, and golden comments carry no location. | Low–medium | In `scorer-validation.md:30-35` and `decisions.md:2584-2585`; not in README or results.md. |
| 9 | **Selection on dev.** pool-verify-v1 was the fourth variant, adopted at a 0.6-point margin that its own dev rerun moved by 12.4 points. | Low (the blind test addresses it) | Yes: `results.md:111`, `:118-121`; `decisions.md:2922-2923`. |
| 10 | **Run mechanics.** Run 2 lost one PR to JUDGE_FAILED (n = 21, a different PR set from the tools). A hosted endpoint at temperature 0 is nondeterministic and its weights may change. Judge calls may come from the response cache, so the tools' Cal.com rows in 062 equal 054's rather than being a fresh judgement. | Low | Mostly: `results.md:102-103`, `decisions.md:3072-3074`. The cache-replay point is implicit only. |

## 5. What would make the claims hold up

1. Fix T1–T5 in `results.md`. Say "same model", drop "the gap is small", and replace "changes
   nothing" with "changes no decision; under x1 prediction (a) fails in runs 1 and 3".
2. Add the 50-PR table (3.1) and the fragility table (3.2a) to `results.md`, and add one
   sentence to the README: "4th of six on all 50 PRs".
3. Publish per-PR TP/FP/dup/low/FN counts for every Cal.com row (counts only) so a PR-level
   paired bootstrap can be run.
4. Reword the headline from "ranked 3rd of six" to something like "3rd of six on the blind test
   (10 PRs); only the gap to CodeRabbit is outside noise".

## Appendix: reproduction

All inputs are the counts quoted above, and nothing reads outside this repo. The bootstrap is
as follows:

- each reviewer is `rng.multinomial(TP + FP + FN, [TP, FP, FN] / total)`, 200,000 draws, numpy
  `default_rng(20261018)`;
- F = 2TP / (2TP + FP + FN), and the two reviewers are drawn independently;
- the design effect is the variance of a 40-PR bootstrap of the summed precision, using the
  per-PR TP/FP in `pool-verify.md:92-131`, divided by p(1 − p)/N. It is computed per TraceHound
  row, and the median (1.63) is applied as √1.63 to the standard error of the difference;
- the correlation needed solves |Δ| = 1.96 · √(deff · (σa² + σb² − 2ρσaσb)) for ρ, that is
  ρ = (σa² + σb² − (Δ/1.96)²/deff) / (2σaσb). Here σ is the comment-level bootstrap SD of F
  (TraceHound 0.085; Augment 0.079, Cursor 0.089, Greptile 0.097, Copilot 0.077, CodeRabbit
  0.088), and deff is 1 or 1.63.
