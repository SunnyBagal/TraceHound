# 071 follow-up: fold dev run 11 (Ultra) into PR #63

Folder: `~/Projects/TraceHound`. **Fresh session.** This is a follow-up to decision 071; it has no new decision number. Nebius: **$0 from this session** (no model calls). Run 11's judges are run by the already-running chain script, inside the runner's own $3 cap.

## Context
- Draft PR #63 (`build/071-dev-ultra`, head `6bd72e1`, CI green) reports Ultra dev run 10 alone, under the plan's fallback.
- Dev run 11 was started unattended at 09:52Z by the detached script `runs/071-chain.sh`. When it finishes, it writes `runs/071-report-final.txt` (from `node scripts/bench/dev-ultra.ts`) and appends `chain done` to `runs/071-chain.log`.
- Your job: wait for that, then update the docs and the PR. **Don't change any code**, including `scripts/bench/dev-ultra.ts`. Its scoring and bootstrap rule were committed before the first Ultra call.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`. `git status --porcelain` prints nothing.
- Switch to `build/071-dev-ultra`. It equals `origin/build/071-dev-ultra`, and HEAD is `6bd72e1` (fast-forward with `merge --ff-only` only if origin is ahead and it's this lane's own commit).
- `grep -c '^## 071' docs/decisions.md` prints 1.
- The GIT_* env check prints nothing: `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. Repeat it before every gate.

## Steps (one commit each; messages `area: what changed`)
1. Save this prompt verbatim as `docs/prompts/071-followup-run11.md`. Commit.
2. **Wait for the chain. Don't touch it.**
   - Don't kill, restart or relaunch anything, and don't start any other process that calls a model.
   - Wait with a background command that polls `runs/071-chain.log` for the line `chain done` every 300 s, with the longest allowed timeout. Re-arm it if it times out. Spend as few turns as possible while waiting.
   - **Deadline 2026-10-24T17:00Z.** If `chain done` hasn't appeared by then, STOP AND REPORT the last lines of `runs/071-chain.log` and `runs/071-dev11.log`, and change no files.
   - Once it's done, read `runs/071-chain.log`, `runs/071-dev11.log` and `runs/071-report-final.txt`.
     - STOP AND REPORT if run 11's exit isn't 0, if its status isn't complete, or if any `baseline check` line says it differs by more than 0.1.
     - If run 11 has more than 10 of 40 PRs with failed chunks, don't stop. Report it as a finding, as the plan says.
3. **Update `docs/bench/dev-ultra.md` from `runs/071-report-final.txt` only.**
   - Show runs 10 and 11 per run, plus the 2-run Ultra mean, under v1 and x1, for both rows, next to both baselines.
   - Use the paired-bootstrap table as the committed script computes it with both Ultra runs (10,000 resamples, seed 71).
   - Add run 11's operations: failed chunks, truncations, HTTP 429s, request timeouts and reruns, wall time, and tokens per PR.
   - Add run 11's Nebius judge spend, from `run.json` `costUSD` as the report prints it.
   - Say "Ultra is better/worse" only where an interval excludes 0. Otherwise say "no interval-backed difference".
   - Remove the "fallback in force" statements and keep one line saying run 10 was first reported alone.
   - Replace "It was the most reliable model on the pipeline" with counts only.
   - Add one sentence on how the baseline side of the bootstrap is formed: the mean of per-run F on each resample (from the script's header comment).
   - Rewrite the plain answer to cover both runs.
   - No numbers that aren't in the report file or the existing doc. Commit.
4. **Decision 071 in `docs/decisions.md`.**
   - You may edit only the existing `## 071` entry, which is the last entry and is unmerged in this PR. Update its result to both runs. Change nothing above it.
   - In `FEEDBACK.md`, update only the 2026-10-24 job 071 entry: add run 11's judge spend and run 11's NVIDIA API counts, kept separate from Nebius.
   - Commit.
5. Run `pnpm test` and `pnpm typecheck` as separate commands, only after the chain is done. Read each result. If the only failures are `Test timed out in 5000ms`, rerun just those files with `--testTimeout 30000` and record it.
6. Push. Update PR #63's body to cover both runs. Keep the PR a **draft**. Wait for CI and make one fix attempt if it's red. **Never merge.**
7. Write the report verbatim to `~/Projects/tracehound-brain/inbox/2026-10-24-sunny-071b.md`, following `inbox/README.md`: only that file, then `git pull --rebase`, commit and push.

## Rules
- **Cal.com is blind:** open, run or score nothing under `~/Projects/tracehound-bench/test/`, and never use `--set cal_dot_com`. Don't open anything of ReviewBench, `linea-seeded`, `recall-seeded` or `tracehound-seeds`.
- **May touch:** `docs/bench/dev-ultra.md`, the `## 071` entry of `docs/decisions.md`, the 071 entry of `FEEDBACK.md`, `docs/prompts/071-followup-run11.md`, and `runs/` (read only, apart from your own logs).
- **Don't touch:** `scripts/`, `packages/`, `config/`, `.github/`, `viewer/`, `AGENTS.md`, `pnpm-lock.yaml`, `.env`, `docs/bench/dev-ultra-plan.md`, any other doc, anything under `~/Projects/tracehound-bench/` (read records only if a number you need isn't in the report file, and say which), or anything in `~/Projects/tracehound-ops/`.
- **Spend:** $0 from this session, with no model calls of any kind. Never print, log or commit `NVIDIA_API_KEY` or `NEBIUS_API_KEY`.
- **Git:** no tag operations, no history rewriting, no destructive git commands. Stage by explicit path.
- Nothing else runs on the machine during a gate.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the time `chain done` appeared, run 11's exit and status, and its baseline-check lines;
- the updated tables: per run and mean, v1 and x1, both rows, both baselines;
- the intervals, and which of them exclude 0;
- run 11's failed chunks, truncations, 429s, timeouts and reruns, and wall time;
- run 11's Nebius judge spend, and the total for 071;
- Ultra token totals across both runs;
- the diff stat;
- the gate results;
- PR #63's head sha and CI state;
- anything not done.
