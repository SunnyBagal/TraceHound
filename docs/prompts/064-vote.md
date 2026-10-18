# 064: precision push: vote across runs (dev only; Cal.com untouched)

Tool: relay (Claude Code builder + reviewer). Folder: `~/Projects/TraceHound`. Start from `~/Projects/tracehound-ops`:

```
bun src/relay.ts start tracehound briefs/064-vote.md
```

Before starting, set `nebiusCapUsd` to **10** in `~/Projects/tracehound-ops/ops/lanes.json`.

Decision number: 064. Nebius cap: **$10**. The ledger now stands at $17.76; the total cap is $45.

## Why
We need the top 2 on a blind test: Cursor scored 66.7 and Augment 73.2 on Cal.com.

- **The gap is precision.** On Cal.com run 1, pool-raw already had R 69.6% but P 41.0%. The verifier raised P only to 56.0% and cost recall (60.9%). The top two tools post fewer comments at P > 80%.
- **Run-to-run spread is large.** Dev F went from 35.6 to 48.0 across two runs at temperature 0. A real bug that the model raises in most runs is likely more stable than a false positive that appears once.
- **The hypothesis:** keep only findings that recur across independent runs. That raises precision without a new model.

**Selection happens on dev only.** Cal.com is not opened, run or scored in this job. It gets exactly one pre-registered run in job 065, after this one merges.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` prints nothing.
- If the current branch is main, run `git merge --ff-only origin/main`. If it isn't, run `git fetch origin main:main` (no plus sign), then `git switch main`.
- HEAD equals origin/main, and main contains `6058d53` (the merge of #39).
- `grep -c '^## 063' docs/decisions.md` prints 1; `grep -c '^## 064'` prints 0.
- The dev records exist: `~/Projects/tracehound-bench/reviews/dev-repeat/run-2r/` is complete; `run-3/` is partial (16 of 40, stopped at the cap). Run 1 is 059's records.
- The `GIT_*` env check prints nothing.

## Steps (one commit per step, each with `pnpm test` and `pnpm typecheck` green; messages in the form `area: what changed`)

1. Create the branch `build/064-vote`. Save this brief verbatim as `docs/prompts/064-vote.md`.

2. **Runner: allow more dev runs.** Extend `scripts/bench/run-test-set.ts` so that `--set dev` accepts `--run 4|5|6` with the same pipeline, records layout and cap behaviour as runs 2–3.
   - Leave the Cal.com path and its order rules byte-identical, and add a test that proves it.
   - Dev run 3 stays as it is (partial, not done). Do not restart it.

3. **Freeze commit (push it before any model call).** Write `docs/bench/vote-plan.md` with the variants, the rules and the adoption rule below, exactly as written, and push it.

   **Variants.** All are scored on dev with bench-judge-v1 (the scorer of record), with bench-judge-x1 reported alongside. Each takes the per-PR outputs of N dev runs (run 1, 2r, 4, 5, 6) and keeps a finding by agreement, using `agree-rule.ts`'s `agrees` (same path, line within `AGREE_LINES`):
   - **vote-k3of5** (pool-verify-v1 outputs): keep a finding if it agrees with findings in at least 3 of the 5 runs. Output one representative per cluster: the member from the earliest run.
   - **vote-k2of5** (pool-verify-v1 outputs): the same, with at least 2 of 5.
   - **vote-raw-k3of5** (pool-raw outputs): the same rule applied to the unfiltered pool, at least 3 of 5. This tests whether voting can replace the verifier.
   - **vote-k3of5-cap2**: vote-k3of5, then at most 2 comments per PR. Rank by votes, then by earliest run.
   - **Baseline:** pool-verify-v1, the mean F over the 5 runs individually, plus each run's F.

   **Adoption rule (pre-registered).** Adopt the variant with the highest F under v1, only if:
   - its F is at least **5.0 points** above the baseline's 5-run mean F;
   - its precision is above the baseline's mean precision;
   - it is still at or above the baseline's mean under x1.

   If no variant passes, the result is a **loss** and pool-verify-v1 stays. Report it plainly.

4. **Run dev runs 4, 5 and 6** with the extended runner.
   - Launch each one **detached** (`nohup … > runs/064-devN.log 2>&1 &`), never as a session background command. Our 2-hour session limit killed dev run 2 last time.
   - Poll `run.json` until it shows `complete` or `stopped-at-cap`.
   - Expected cost: about $1.8 per run. If the cap stops a run, vote over the runs that completed: for 4 runs use k3of4/k2of4, and for 3 runs use k2of3. Write this fallback into `vote-plan.md` before the first model call.

5. **Score the variants** with a new `scripts/bench/vote.ts`, which makes no model call except the two judges. Put its unit tests on the clustering and voting logic in `scripts/bench/vote.test.ts` or the existing test layout.
   - Write `docs/bench/vote.md` with:
     - one table per judge, with counts, P/R/F and comments per PR;
     - the baseline's per-run F (this shows the spread over 5 runs, a result on its own);
     - the adoption verdict;
     - the cost per PR of the adopted variant (5× the pipeline).
   - Append decision 064 to `docs/decisions.md`.

6. Push. Open the PR to main **as a draft**, because the dogfood workflow skips drafts and this keeps the ledger clean. Title it `064: vote across runs (decision 064)`. Wait for CI. Make one fix attempt if it's red; STOP if it's red twice. Never merge.

## Rules
- **Cal.com is blind.** Don't open, run or score anything under `~/Projects/tracehound-bench/test/`. Don't run `--set cal_dot_com` at all in this job.
- May touch: `scripts/bench/`, its tests, `docs/bench/`, `docs/decisions.md` (append only), `docs/prompts/064-vote.md`, `CLAUDE.md` (one line), `FEEDBACK.md` (one entry), `runs/`.
- Do not touch:
  - `packages/` (the analyzer and the Action);
  - `config/` prompts;
  - `.github/`, `viewer/`, `AGENTS.md`, `pnpm-lock.yaml`.
- Prompts, models and temperatures stay exactly as in pool-verify-v1. Voting is the only new thing.
- No tag operations and no destructive git. Stage only by explicit path.

## STOP AND REPORT (post as a PR comment via a file under `runs/`, then make it your final message)
- The step 0 results.
- The freeze commit sha and its push time, compared with the first model call's time.
- Runs 4–6: status, spend and wall time for each.
- Both judges' tables.
- The baseline's 5-run spread.
- The adoption verdict, with its numbers.
- Total spend, from the ledger delta.
- The PR number, head sha and CI result.
- Anything skipped.
