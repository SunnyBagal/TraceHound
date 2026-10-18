# Vote across runs: plan (decision 064, pre-registered)

Written and pushed before any model call of job 064. Dev only: Cal.com is not opened, run or scored
in 064; it gets one pre-registered run in job 065.

The hypothesis: a real bug that the reviewer raises in most runs is more stable than a false positive
that appears once, so keeping only findings that recur across independent runs raises precision
without a new model. Prompts, models and temperatures stay exactly as in pool-verify-v1; voting is the
only new thing.

## Runs

Dev run 1 (decision 059's records), dev run 2 (its restart, `run-2r/`, which stands for run 2), and
dev runs 4, 5 and 6 (this job, `scripts/bench/run-test-set.ts --set dev --run 4|5|6`, the same
pipeline as runs 2–3, their own order 4 → 5 → 6 and their own $8.50 cap out of 064's $10 Nebius cap).
Dev run 3 (16 of 40, stopped at 061's cap) is not used and not restarted.

## Variants (as the brief states them)

All are scored on dev with bench-judge-v1 (the scorer of record), with bench-judge-x1 reported
alongside. Each takes the per-PR outputs of N dev runs (run 1, 2r, 4, 5, 6) and keeps a finding by
agreement, using `agree-rule.ts`'s `agrees` (same path, line within `AGREE_LINES`):

- **vote-k3of5** (pool-verify-v1 outputs): keep a finding if it agrees with findings in at least 3 of
  the 5 runs. Output one representative per cluster: the member from the earliest run.
- **vote-k2of5** (pool-verify-v1 outputs): the same, with at least 2 of 5.
- **vote-raw-k3of5** (pool-raw outputs): the same rule applied to the unfiltered pool, at least 3 of 5.
  This tests whether voting can replace the verifier.
- **vote-k3of5-cap2**: vote-k3of5, then at most 2 comments per PR. Rank by votes, then by earliest run.
- **Baseline:** pool-verify-v1, the mean F over the 5 runs individually, plus each run's F.

## Adoption rule (pre-registered, as the brief states it)

Adopt the variant with the highest F under v1, only if:

- its F is at least **5.0 points** above the baseline's 5-run mean F;
- its precision is above the baseline's mean precision;
- it is still at or above the baseline's mean under x1.

If no variant passes, the result is a **loss** and pool-verify-v1 stays. Report it plainly.

## Definitions fixed here (before the first model call)

- **Inputs per run and pull request.** pool-verify-v1: run 1 from
  `<bench>/reviews/pool-verify-v1/super/<repo>/<n>.json`, the others from
  `<bench>/reviews/dev-repeat/run-<n>/pool-verify-v1/<repo>/<n>.json`. pool-raw: run 1 from
  `<bench>/reviews/pool-raw/super/<repo>/<n>.json`, the others from `run-<n>/pool-raw/`. Findings of a
  run are taken in their file order. A comment with a null line agrees with nothing (`agrees`).
- **Votes.** A finding's votes are the number of runs (its own run included) that hold at least one
  finding that `agrees` with it. A variant `k of N` keeps the findings with votes ≥ k.
- **Clusters and representatives.** The kept findings of a pull request are taken in run order
  (1, 2r, 4, 5, 6), then file order. Each one joins the first cluster (in creation order) whose
  representative it agrees with and which has no member from its own run yet; otherwise it starts a
  new cluster and is its representative. So the representative is the member from the earliest run,
  and two findings of one run are never merged. The output is the representatives, unchanged (path,
  line, body), in cluster order.
- **cap2.** Of vote-k3of5's representatives, keep the 2 with the most votes (the representative's
  own votes); ties go to the earlier run, then the earlier position in its file.
- **Scoring.** Each variant's output is written in 054's neutral format and scored per repo with
  `scoreRepo` and `LlmJudge` (bench-judge-v1: Super, reasoning on; bench-judge-x1: Qwen3-235B, reasoning
  off; temperature 0; judge cache reads allowed, as in 061), summed over the four dev repos, P/R/F
  micro-averaged. JUDGE_FAILED pull requests are left out and counted, as everywhere else.
- **Baseline.** Each run's pool-verify-v1 counts under each judge: run 1 from 059's scoring
  (`<bench>/scores/pool-verify-v1-super-<repo>.summary.json` for v1,
  `<bench>/scores/judge-x1/pool-verify-v1-super-<repo>.summary.json` for x1), the others from
  `run-<n>/scores/<judge>/pool-verify-v1-<repo>.summary.json`. The baseline mean F (and mean P) is the
  plain mean of the per-run micro F (P) values. "Above" is strict for precision; the F margin is
  F_variant − mean F ≥ 5.0 points under v1; the x1 condition is F_variant(x1) ≥ mean F(x1).
- **Cost per pull request of a variant.** The sum over the voted runs of each run's pipeline cost for
  that pull request (runs 2r, 4–6 from `run.json`; run 1 summed from 059's records as in
  `docs/bench/pool-verify.md`); median and max over the 40 pull requests. Voting itself makes no
  model call.

## Fallback if the cap stops a run (fixed before the first model call)

A run counts if its `run.json` shows `complete`. A run stopped at the cap, or crashed and not
restarted to completion (one restart under 061a's rule), does not count; later runs are then not done.
The vote is over the runs that completed, run 1 and run 2r included:

- **4 runs:** vote-k3of4, vote-k2of4, vote-raw-k3of4, vote-k3of4-cap2 (k3of4 then at most 2 per PR);
  the baseline is the mean over those 4 runs.
- **3 runs:** vote-k2of3, vote-raw-k2of3, vote-k2of3-cap2; the baseline is the mean over those 3 runs.
- **Fewer than 3 runs:** no vote; the job reports the runs and stops.

The adoption rule is unchanged, applied to the variants and baseline of the runs that completed.
