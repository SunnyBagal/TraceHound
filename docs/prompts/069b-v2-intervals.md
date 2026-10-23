# 069b: intervals for the v2 Cal.com and all-50 gaps (no model calls)

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops` in a **plain terminal**:

```
cd ~/Projects/tracehound-ops && caffeinate -i bun src/relay.ts start tracehound briefs/069b-v2-intervals.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/069b-v2-intervals.md`.
- Set `nebiusCapUsd` to **0** in `ops/lanes.json`. This job makes **no** model call.

Decision 069, continued. **$0.** Deadline: before 24 Oct 17:00 IST.

## Why
069 (#59, main `5fb8cdc`) measured v2 on Cal.com: pool-verify-v1 on 3.5, v1 F 57.1% (n = 23). On all 50 PRs (dev 7r + Cal.com run 4), it is 3rd of 6 under both judges **as a point estimate**. Under x1 it is 0.3 points above Greptile. Before any public sentence uses these numbers, every gap to a tool needs a 95% interval. 066 published intervals from the cc-01 audit's method (`docs/bench/audit-cc01.md` §3.2: a comment-level multinomial bootstrap, inflated by a design effect). 066 also said per-PR Cal.com counts weren't in the repo. The bench folder does have them per PR, so this job adds a **PR-level paired bootstrap**.

## Pre-registered method (commit it as `docs/bench/v2-intervals-plan.md` and push before computing anything)
- **Gaps:** TraceHound v2 (pool-verify-v1, 3.5) minus each of the five tools, in F, under v1 (scorer of record) and x1. Also v2 minus 3 Super's pool-verify-v1 (Cal.com run 1, and all-50 row (i)). Two sets: **Cal.com** (run 4 vs run 1's tool rows, 10 PRs) and **all 50** (dev 7r + Cal.com run 4, vs the tools' all-50 rows).
- **Primary interval:** a **PR-level paired bootstrap**. Resample PRs with replacement, the same PRs for both reviewers, and recompute micro F from summed TP/FP/FN. 10,000 resamples, seed **69**. Report the 2.5 / 97.5 percentiles and the share of resamples > 0. JUDGE_FAILED PRs are dropped from both sides of that pair's resample, and you say how many.
- **Secondary, for continuity with 066:** the audit's §3.2 method on the same gaps, exactly as its appendix describes. If you can't reproduce its published 3 Super numbers to 0.1, say so and skip it.
- **Wording rule, fixed now:**
  - "ahead of X" or "behind X" only if the **primary** 95% interval excludes 0;
  - otherwise "statistically tied with X";
  - ranks only as "a point estimate".
  - This holds whatever the numbers show.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` is empty; main fast-forwards to `origin/main`, which contains `5fb8cdc`.
- Cal.com run 4 (`test/run-4-nvidia-nemotron-3-5-super-vl/`), run 1, dev 7r and dev 8 records exist, with per-PR score files. **Check existence and counts only.**
- Read `docs/bench/v2-calcom.md`, `docs/bench/audit-cc01.md` (§3 and the appendix), `docs/bench/results.md` and decision 066.
- The `GIT_*` env check prints nothing.

## Steps (one commit each; gates as their own commands)
1. Branch `build/069b-v2-intervals`. Save this brief as `docs/prompts/069b-v2-intervals.md`.
2. Commit and push the plan above, `docs/bench/v2-intervals-plan.md`, **before** running any bootstrap.
3. Write the script as `scripts/bench/intervals.ts`, with tests on synthetic counts: a known-gap fixture, seed determinism, and the JUDGE_FAILED drop. It reads score files and prints **counts and intervals only**.
   - Run 4's freeze check excludes only the runner files, and run 4 is complete. Adding a new file under `scripts/bench` now is fine because no further Cal.com run happens. Say so in the plan.
4. Run it. Write `docs/bench/v2-intervals.md` with:
   - for each gap: observed, primary 95% interval, share > 0, secondary inflated interval, and the sentence the wording rule allows;
   - the all-50 rank table with the intervals beside it.
5. Append a dated **069b** note under decision 069 in `docs/decisions.md`. Don't edit `results.md`, the README or `viewer/`.
6. Push. Open a **draft** PR `069b: intervals for the v2 gaps`. Wait for CI; one fix attempt. Never merge.

## Rules
- **Cal.com is blind:** counts only. Never print, paste or commit comment text, golden text, PR titles or diffs.
- No model or network calls. No ReviewBench data. No seeded repos.
- May touch: `scripts/bench/intervals.ts` and its test, `docs/bench/v2-intervals-plan.md`, `docs/bench/v2-intervals.md`, `docs/decisions.md` (append under 069), `docs/prompts/069b-v2-intervals.md`.
- Don't touch: `packages/*/src`, `config/`, `.github/`, `viewer/`, `docs/bench/results.md`, `README.md`.

## STOP AND REPORT
Final message:
- step 0;
- the plan commit sha and its time against the first bootstrap;
- the gap table (both sets, both judges, both methods);
- the allowed sentences;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-069b.md` (rules in `inbox/README.md`).
