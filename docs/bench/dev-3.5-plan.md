# Plan: Nemotron 3.5 Super on dev (decision 067), frozen before any model call

Question: with the same frozen prompts and pipeline (pool-verify-v1, decision 059), does swapping
only the reviewer and verifier model from `nvidia/nemotron-3-super-120b-a12b` (3 Super) to
`nvidia/Nemotron-3.5-Super-VL` (3.5 Super) raise F on the 40 dev pull requests? Dev only: no
Cal.com, no ReviewBench. The answer decides the Action's default model before freeze-2 (24 Oct).

This file is committed and pushed before the first model call of 067.

## What stays fixed

- Pipeline: `scripts/bench/run-test-set.ts` as in 064 (review-diff-v1, review-ctx-v1, the pool,
  verify-ctx-v1 on both parts), from the code of `review-freeze-1`. The freeze check for runs 7–9
  (`freezeCheck067`) refuses the run if any file the tag has under `packages/analyzer/src`,
  `scripts/bench` or `config` differs from the tag, except `config/prices.json` (adds the 3.5
  price), `packages/analyzer/src/bin.ts` and `packages/analyzer/src/config.ts` (not imported by any
  pipeline stage), and the runner and its gates (`run-test-set.ts`, `test-set.ts`, which gain
  `--model`). Files added after the tag are allowed; no tag file imports them.
- Prompts (sha256 `f77c2031…`, `0c4dcdcf…`, `75703fc6…`), temperature 0, reasoning on
  (`enable_thinking: true`), `max_tokens` 32,000 for the reviewers and 16,000 for the verifier:
  unchanged; `--model` changes only the `model` field of those requests (pinned by
  `test/test-set-run.test.ts`).
- Judges unchanged: bench-judge-v1 (3 Super, reasoning on) is the scorer of record; bench-judge-x1
  (Qwen3-235B-A22B-Instruct-2507) is reported alongside.
- Reviewer and verifier calls read no cache; a pull request with a failed request is rerun once,
  attempt 1 kept (061's rule).

## Baseline (recomputed from the records)

pool-verify-v1 on 3 Super, dev runs 1, 2r, 4, 5, 6 (decision 064's records; not re-run).
`node scripts/bench/dev-3-5.ts` on 2026-10-20, per-run counts summed over the four dev repos, mean of
the per-run values:

| judge | run 1 | 2r | 4 | 5 | 6 | mean |
|---|---|---|---|---|---|---|
| v1 F | 35.6 | 48.0 | 44.0 | 42.0 | 41.7 | **42.3** |
| v1 P | 36.1 | 47.4 | 41.2 | 39.8 | 38.2 | **40.5** |
| x1 F | 44.6 | 53.4 | 51.6 | 51.7 | 55.1 | **51.3** |

Unrounded: v1 F 42.28, v1 P 40.52, x1 F 51.29. All within 0.1 of the brief's 42.3 / 40.5 / 51.3.

## Candidate

pool-verify-v1 on `nvidia/Nemotron-3.5-Super-VL`, dev runs 7, 8 and 9, in that order:

```
TRACEHOUND_BUDGET_RUN_USD=8 nohup node scripts/bench/run-test-set.ts --set dev --run <N> \
  --model nvidia/Nemotron-3.5-Super-VL > runs/067-dev<N>.log 2>&1 &
```

Records: `~/Projects/tracehound-bench/reviews/dev-repeat/run-<N>-nvidia-nemotron-3-5-super-vl/`;
`run.json` records the model and decision 067. Runs 7–9 share one $8 cap (judging included), each
run getting $8 minus what the earlier ones spent.

Before run 8 starts, run 7 is checked: if any pull request has failed chunks (a reviewer chunk
`CHUNK_FAILED`, or a verifier `VERIFY_FAILED`, in the attempt used), or every pull request got 0
findings (truncation, a wrong model id), 067 stops and reports the first failure reason.

## The rule (from the brief, exactly as written)

- **Baseline:** pool-verify-v1 on 3 Super, the 5-run mean on dev (runs 1, 2r, 4, 5, 6): v1 F 42.3, P 40.5; x1 F 51.3. Recompute these from the records and state them. If they differ from these numbers by more than 0.1, STOP.
- **Candidate:** pool-verify-v1 on `nvidia/Nemotron-3.5-Super-VL`, dev runs 7, 8 and 9.
- **Adopt 3.5 as the Action's default** only if all of these hold:
  - its 3-run mean F (v1) is ≥ **baseline + 3.0**;
  - its mean P (v1) is ≥ the baseline's mean P;
  - its mean F under x1 is ≥ the baseline's x1 mean.

  Also report a per-PR paired bootstrap (10,000 resamples, seed 67) of the F difference, with its 95% interval. If the rule isn't met, it's a **loss** and 3 Super stays.
- **Fallback:** if the cap stops a run, decide on the runs that completed (at least 2), and say so. Write this fallback in the plan before the first call.

With the baseline above, the thresholds are: mean F (v1) ≥ 45.28%, mean P (v1) ≥ 40.52%, mean F
(x1) ≥ 51.29% (computed on unrounded values; `dev-3-5.ts` applies them).

## How the numbers are computed (`scripts/bench/dev-3-5.ts`)

- A run's P / R / F: TP, FP, FN summed over the four dev repos from that run's pool-verify-v1
  summary files (README rules: Low counts as nothing, duplicates neither TP nor FP; JUDGE_FAILED
  pull requests left out and counted). A mean is the plain mean of the per-run values.
- Bootstrap: the 40 dev pull requests are resampled with replacement, 10,000 times, with a
  mulberry32 generator seeded 67. In each resample every run's F is recomputed on the drawn pull
  requests (per-PR counts from the detail files; a pull request is drawn for every run at once,
  which is the pairing), and the statistic is mean F (3.5 runs) − mean F (3 Super runs). The 95%
  interval is the 2.5th and 97.5th percentiles (sorted values 250 and 9,750 of 10,000). Under v1
  (the scorer of record); the same under x1 is reported. The bootstrap is reported, not part of the
  rule.
- Tokens and cost per pull request: the pipeline's four stages (judges excluded), every attempt
  counted, from the stage records (run 1) and `attempts/` (the other runs).

## Fallback

If the cap stops a run, the runs that completed decide, provided there are at least 2; the report
says which runs that was. With fewer than 2 completed runs there is no verdict, and 3 Super stays.
A run that crashes may be restarted once into `run-<N>-<slug>r/` (061a), which then stands for it.
