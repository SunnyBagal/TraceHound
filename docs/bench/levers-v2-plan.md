# Levers v2: offline replay plan

Report only; no decision number and no adoption. The reviewer remains review-freeze-2,
pool-verify-v1 on Nemotron 3.5 Super. Commit and push this plan before computing any
replay result. No parameter may change after results are seen.

The 40 dev PRs have been used for 17 earlier decisions; any gain here is a hypothesis,
not a result, and none is adopted. Only the four dev repositories (sentry, grafana,
keycloak, discourse) are eligible. Never read the blind test set, ReviewBench,
linea-seeded, recall-seeded, or tracehound-seeds. No model or network calls during
replay; new inference cost is $0. Git transport is used only to deliver this report.

## Inputs and scoring

Use saved dev findings and saved per-comment matches and summaries for
bench-judge-v1 (scorer of record) and bench-judge-x1 (report only). Include 3 Super
runs 1, 2r, 4, 5, 6; 3.5 Super runs 7r, 8; Ultra runs 10, 11 if present and complete.
Run 1 uses the original pool/review directories and scores; other runs use
reviews/dev-repeat. Restarted runs replace their void predecessors. Both Ultra
runs and both judges' required files were present at Step 0.

Reuse score.ts's scorePull, metrics, addCounts and zeroCounts; never reimplement
the scoring rules. Convert saved golden IDs to indexes using each pull's saved
golden array. Rescore retained matches in retained output order, so a duplicate
can become the TP. Validate unfiltered rescoring against the saved summaries.
Pair by repository and review filename, validate golden identity/severity/order,
and use each representative finding's own run/source/judge match. Never transfer
a match from a nearby finding. Missing, failed, inconsistent, or unmapped records
cause an explicit failure; do not silently drop PRs or infer new judge matches.

JSON exposes every computed count, denominator, P/R/F, per-run result and interval;
Markdown prints four tables per judge, with sample sizes alongside totals. No
record titles, findings, golden text, or source excerpts appear in either output.
Summaries by model pool counts over its listed runs: n=40 distinct PRs and the
explicit PR-run exposure count. They are descriptive, not additional independent
PRs. No best-k selection, parameter search, or adoption test is added.

For reported differences use paired PR-level percentile bootstrap intervals:
10,000 resamples, seed 72, deterministic Mulberry32, sampling 40 PRs with
replacement, keeping all runs of a sampled PR together. Report the point
difference and the 2.5th and 97.5th percentiles using linear interpolation at
(B-1)*q, in percentage points. Reinitialize the seed for each comparison. Undefined
metrics remain null; if any bootstrap replicate is undefined the interval is
unavailable and cannot support a claim. These are unadjusted exploratory intervals,
not multiplicity-corrected evidence. Use "better" only if the 95% interval excludes
zero in the positive direction. Report a plain answer for each lever.

## 1. Per-PR cap (top-k)

For pool-verify-v1 and pool-raw in every listed run, keep at most k findings per PR,
for k in {1, 2, 3, 4, 5}. Two rankings, with no severity/confidence inference:

- Agreement first: a finding agreeing with any finding from the other generator
  ranks first; remaining review-diff-v1 findings precede review-ctx-only findings.
  Within each tier preserve original pool output order. Agreement uses
  agree-rule.ts unchanged (normalized path, non-null lines within three lines).
  Recover generators and full ctx output from the saved attempts (run 1 from its
  original diff and ctx records); align source findings exactly by path/line/body.
- Output order: the first k source findings, as a control.

Markdown reports model/source/ranking rows, uncapped F and k=1..5 F with paired
delta-F intervals versus that source's uncapped baseline. JSON additionally reports
P/R/F, all scorer counts and intervals per run and for pooled model totals.

## 2. Verifier on/off

For every listed run and both judges, tabulate existing pool-raw versus
pool-verify-v1 counts and P/R/F, n PRs, and their paired delta-P/R/F intervals
(verified minus raw). Bootstrap 10,000 PR-level samples with seed 72 as above.
Markdown includes P/R/F for both, delta-F and its interval; JSON includes all
counts and all three intervals. This is a comparison of saved numbers, not a
rerun of verification.

## 3. Cheaper vote

For 3 Super pool-verify-v1, keep-if-at-least-2-of-3 for the ordered run groups
(4, 5, 6) and (1, 2r, 4). Use vote.ts's voteKeep unchanged, including its
non-transitive matching, distinct-run rule and earliest-run representatives.
No extra cap. Score each representative using its own saved judge match.
Report vote counts/P/R/F, each constituent run's own F, and the arithmetic
three-run mean F beside it. Report paired delta-F and its interval versus that
mean, resampling PRs together across all three baselines and the vote result.
This measures the three-run alternative only; do not estimate new costs or calls.

## 4. Where the misses are

For 3.5 pool-verify-v1 runs 7r and 8, count golden comments missed in both runs,
separately under each judge. A golden is missed when no retained finding matches
its saved ID; count all severities, including Low, and identify the Medium-or-higher
scored subtotal separately. Report counts by repository and golden severity, with
n=10 PRs per repository and n=40 for totals, golden denominators, and no comment
text or identifiers. No model call, taxonomy, or inferred cause of a miss.

## Validation and delivery

One standalone script, scripts/bench/levers-v2.ts, prints Markdown or --json.
Fixture-only helper tests in scripts/bench/levers-v2.test.ts exercise rescoring,
ranking, vote provenance, pairing and deterministic bootstrap. No records or
network are needed by tests. Touch only these two files and this plan and
docs/bench/levers-v2.md. Record the plan commit timestamp and first computation
timestamp in the report. Run pnpm test and pnpm typecheck as separate plain-shell
commands with the clean-GIT-environment check before each; permitted timeout-only
failures get the specified --testTimeout 30000 file rerun. Stage explicit paths,
push and open a draft PR; never merge or tag.
