# 071b (resume): fold Ultra dev run 11 into PR #63 and fix Devin's 4 findings

Folder: `~/Projects/TraceHound`. **Fresh session.** This is a follow-up to decision **071** and takes no new decision number. Nebius: **$0**, with no model calls of any kind. PR **#63** is on `build/071-dev-ultra`; its origin head is `6bd72e1`.

## Context
- #63 reports Ultra dev run 10 alone. Run 11 ran unattended. Its chain script wrote `runs/071-report-final.txt` and logged `chain done` in `runs/071-chain.log`. Run 11 exited 0, its status is complete, and all four baseline checks say `ok`.
- An earlier stopped session left one unpushed local commit, `35df43a`, which adds only `docs/prompts/071-followup-run11.md`, a stale prompt that was never completed. **Don't rewrite history to drop it.** Step 0 removes the file with a normal commit instead.
- **Devin reviewed #63 and found 4 bugs.** All are real, and none changes run 10's numbers.
  1. **A baseline mismatch doesn't stop the script** (`scripts/bench/dev-ultra.ts:~177`). It logs "DIFFERS BY MORE THAN 0.1: STOP" and keeps printing tables.
  2. **Token Factory Ultra calls bypass the spending caps** (`config/prices.json:9`). `nvidia/nemotron-3-ultra-550b-a55b` is priced 0/0 whichever route it takes, so a request with that id that goes to Token Factory (flag unset) reserves $0.
  3. **Verifier truncations disappear from the run counts** (`dev-ultra.ts:~160`). Bugbot found the cause in the same PR:
     - `ledgerWindow` treats a call as a verifier call when its `purpose` starts with `verify`.
     - But verify-ctx ledgers its calls as `"review"` (`VERIFY_CTX_PURPOSE`).
     - So every call is checked against the reviewer's 32,000 cap, and verifier truncations at 16,000 are never counted.

     The fix can't rely on `purpose`. Tell verifier calls apart another way, for example from the attempt records' verdicts, or from the request's `max_tokens` if the ledger keeps it. Don't change any ledger format.
  4. **Ultra cache entries cross provider routes** (`packages/analyzer/src/llm/client.ts:~263`, `cache.ts`). The cache key is model plus request, not route.
- Two github-actions comments on `scripts/bench/ultra-smoke.ts` (lines 26 and 51) are **out of scope** for this job. Don't touch that file, and don't reply on those threads. Just list them in the report.

## Step 0 (if any check fails, STOP AND REPORT)
- Run `git fetch origin`. `git status --porcelain` must print nothing.
- Switch to `build/071-dev-ultra`. Local HEAD must be `35df43a` and `origin/build/071-dev-ultra` must be `6bd72e1`, with exactly that one local commit ahead. `git diff --stat 6bd72e1 35df43a` must show only `docs/prompts/071-followup-run11.md`. If anything else differs, STOP.
- Copy `docs/prompts/071-followup-run11.md` to `runs/071-followup-run11.stale.md`. Then remove it from the repo with `git rm docs/prompts/071-followup-run11.md` and commit it on its own, with the message `docs: drop the stale 071 follow-up prompt (session stopped before running it)`.
- `runs/071-chain.log` must contain `chain done`. Read it, `runs/071-dev11.log` and `runs/071-report-final.txt`. STOP if run 11's exit isn't 0, its status isn't complete, or any `baseline check` line says DIFFERS.
- Read Devin's 4 review comments on PR #63 with `gh pr view 63 --comments` and `gh api repos/SunnyBagal/TraceHound/pulls/63/comments`.
- The GIT_* env check must print nothing: `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. Repeat it before every gate.

## Steps (one commit each; run gates as their own commands; commit messages `area: what changed`)
1. Save this prompt verbatim as `docs/prompts/071b-run11-and-devin-fixes.md`. Commit.
2. **Fix 2 (caps) and fix 4 (cache), in the client.**
   - The $0 price and the NVIDIA cache namespace apply **only when the request is actually routed to the NVIDIA API**, which means the flag is set and the id is exactly the Ultra id.
   - With the flag unset, the lowercase Ultra id prices at `placeholderFallback` like any unknown id, and its cache key stays exactly what it is today.
   - Token Factory requests, prices and cache keys for every other model stay byte-identical, so the existing tests stay green.
   - Add tests for both fixes: an unflagged request with the lowercase id reserves the fallback estimate, and flagged and unflagged requests never share a cache entry.
   - Keep `prices.json`'s Ultra entry if the client needs it, but its `_readme` sentence must say the entry is honoured only on the NVIDIA route.
   - Commit.
3. **Fix 1 and fix 3, in `scripts/bench/dev-ultra.ts`.**
   - Fix 1: a baseline mismatch prints its line, sets a non-zero exit code and prints no tables.
   - Fix 3: reproduce the claim first. If it's real, fix it so verifier truncations are counted and shown. If it isn't, write one sentence explaining why in the PR reply.
   - **The scoring and the bootstrap rule must not change.** Add a test that the report's tables for run 10 are byte-identical before and after the change. Use the saved `runs/071-report-*.txt` as the expected output if the records aren't available to tests; otherwise use a fixture. Tests make no network calls and contain no dataset text.
   - Commit.
4. **Regenerate the report** with `node scripts/bench/dev-ultra.ts > runs/071-report-final-2.txt`. This makes no model calls. Its tables must equal those in `runs/071-report-final.txt` except for the counts that fix 3 adds. If anything else differs, STOP.
5. **Update `docs/bench/dev-ultra.md` from that report only.**
   - Show runs 10 and 11 per run plus the 2-run Ultra mean, under v1 and x1, for both rows, next to both baselines.
   - Include the paired-bootstrap table with both Ultra runs (10,000 resamples, seed 71).
   - Add run 11's operations: failed chunks, truncations including the verifier's, HTTP 429s (the report shows 57 of 361 requests, against 0 in run 10), timeouts and reruns, wall time, and tokens per PR.
   - Add run 11's Nebius judge spend.
   - Say "Ultra is better/worse" only where an interval excludes 0. Otherwise say "no interval-backed difference".
   - Replace "It was the most reliable model on the pipeline" with counts only.
   - Correct the scoring-change commit reference to `0dec002`.
   - Add one sentence on how the baseline side of the bootstrap is formed: the mean of per-run F on each resample.
   - Remove the "fallback in force" wording, keeping one line saying run 10 was first reported alone.
   - Add a short "Fixed after review (Devin)" list covering the 4 findings.
   - Use no numbers that aren't in the report files or the existing doc. Commit.
6. **Decision 071 and FEEDBACK.**
   - Decision 071 is the last entry in `docs/decisions.md` and is unmerged in this PR. Update its result to cover both runs, and change nothing above it.
   - In `FEEDBACK.md`, update only the 24 Oct job-071 entry: add run 11's judge spend and NVIDIA API counts, kept separate from Nebius.
   - Commit.
7. Run `pnpm test` and `pnpm typecheck` as separate commands and read each result. If the only failures are timeouts, rerun those files with `--testTimeout 30000` and record that you did.
8. **Push and update the PR.**
   - Push, as a normal fast-forward push.
   - Reply on each of Devin's 4 threads with the commit that fixes it, or the one-sentence reason.
   - Update PR #63's body to cover both runs and the fixes.
   - If the PR is still a draft, mark it ready for review with `gh pr ready 63`. If it is already ready, skip this and say so.
   - Wait for CI, and make one fix attempt if it's red. **Never merge.**

## Rules
- **$0, no model calls.** Never print, log or commit `NVIDIA_API_KEY` or `NEBIUS_API_KEY`.
- **Cal.com is blind:** open, run or score nothing under `~/Projects/tracehound-bench/test/`, and never use `--set cal_dot_com`. Don't open anything of ReviewBench, `linea-seeded`, `recall-seeded` or `tracehound-seeds`. Never read Recall's real bug list.
- **May touch:**
  - `packages/analyzer/src/llm/` and its tests;
  - `config/prices.json` (the Ultra entry and its `_readme` sentence only);
  - `scripts/bench/dev-ultra.ts` and its tests;
  - `docs/bench/dev-ultra.md`;
  - the `## 071` entry of `docs/decisions.md`;
  - the 071 entry of `FEEDBACK.md`;
  - `docs/prompts/071b-run11-and-devin-fixes.md`;
  - the removal of `docs/prompts/071-followup-run11.md` in step 0;
  - `runs/`.
- **Don't touch:**
  - `docs/bench/dev-ultra-plan.md`;
  - `scripts/bench/ultra-smoke.ts`;
  - `packages/action/`;
  - `packages/analyzer/src/review/`;
  - `scripts/reviewbench/`;
  - `.github/`;
  - `viewer/`;
  - `README.md`;
  - `docs/bench/results.md`;
  - `docs/freeze.md`, the evaluation protocol and any archived results;
  - `AGENTS.md`;
  - `pnpm-lock.yaml`;
  - `.env`;
  - anything in `~/Projects/tracehound-ops/`.
- **Git:** no tag operations, no history rewriting (no reset, rebase or amend on this branch), and no destructive git commands. Stage by explicit path. Don't move eval-freeze-2, review-freeze-1 or review-freeze-2.
- Nothing else runs on the machine during a gate.

## STOP AND REPORT
Make your final message the report:
- step 0 results, including the HEADs you found and the removal commit;
- run 11's exit, status and baseline-check lines;
- the updated tables: per run and mean, v1 and x1, both rows, both baselines;
- the intervals, and which of them exclude 0;
- run 11's operations;
- judge spend for run 11 and the 071 total;
- Ultra token totals;
- each Devin finding, with the commit that fixes it or the reason it doesn't need one;
- the two github-actions comments, listed as left open;
- the diff stat against `6bd72e1`;
- the gate results;
- PR #63's head sha, its draft or ready state, and its CI state;
- anything not done.

Also write the report verbatim to `~/Projects/tracehound-brain/inbox/2026-10-27-sunny-071b-2.md`, following `inbox/README.md`: only that file, then `git pull --rebase`, commit and push.
