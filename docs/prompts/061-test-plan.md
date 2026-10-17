Pre-register and prepare the one Cal.com test-set run. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 061. Spend: $0. This job makes no model call and no model-list request, and it reads no Cal.com data.

Context: tuning is over. pool-verify-v1 (decision 059) is the configuration under test: review-diff-v1 (055) and review-ctx-v1 (057), pooled by the agreement rule in scripts/bench/agree-rule.ts, then filtered by verify-ctx-v1 (058). On the 40 dev PRs (n = 74) it scores F 35.6% under bench-judge-v1 and F 44.6% under bench-judge-x1 (decision 060), 5th of 11 runs under both judges. This job writes the plan for the Cal.com run and the code that run needs, so that the next job (062) only executes a frozen plan. Nothing in this job runs that code on Cal.com.

Budget: the Nebius balance is about $46. So 062 can afford the pre-registered primary run plus two repeat runs on Cal.com and two repeat runs on dev. Together these measure run-to-run spread; every result so far was a single run.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`. `git status --porcelain` must print nothing.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign). If it fails, STOP. Then `git switch main`. Do not push, rename or delete the branch you switched away from.
   - HEAD must equal origin/main, and `git status --porcelain` must still print nothing.
   - `grep -c '^## 060' docs/decisions.md` must print 1, and `grep -c '^## 061' docs/decisions.md` must print 0.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc.
   - `gh auth status` must succeed.
   - Do not list, open, count or fetch anything for Cal.com in this job.
1. Create branch build/061-test-plan. Save this prompt verbatim as docs/prompts/061-test-plan.md.
2. Decision 061 (Choice) in docs/decisions.md: the plan, written before anyone sees a Cal.com result.
   - **Configuration under test:** pool-verify-v1, exactly as in 059. List each stage's model, temperature and reasoning setting. Copy each prompt's sha256 from its pinning test, naming the file and line: review-diff-v1, review-ctx-v1, verify-ctx-v1, bench-judge-v1, and the agreement rule's constant.
   - **Frozen code:** the commit that merges this PR. Job 062 tags it `review-freeze-1` before any call. The run is void if `git diff review-freeze-1 HEAD -- packages/analyzer/src scripts/bench config` is not empty when it starts.
   - **Rows reported:**
     - Primary: pool-verify-v1.
     - Declared secondaries, which come from the same pipeline at no extra reviewer cost: review-diff-v1 alone and pool-raw.
     - Comparison: the five recorded tools' Cal.com reviews.
     - Nothing else, and no row is swapped in after the run.
   - **Scorer of record:** bench-judge-v1 (sha `23de4e9e…058460`). bench-judge-x1 (060) is reported alongside for every row and changes nothing. The validity check is not run on Cal.com (060 found it too lenient).
   - **Metrics:** P, R and F, micro-averaged, with the counting rules from 054 restated. n is taken from the golden file at run time. JUDGE_FAILED pull requests are excluded and counted.
   - **Runs, all at temperature 0:**
     - **Cal.com run 1 is the pre-registered primary result.** Its numbers are the headline.
     - **Cal.com runs 2 and 3 are repeats** that measure run-to-run spread (provider nondeterminism at temperature 0). They are reported as min, median and max beside run 1 and never replace it.
     - **Dev runs 2 and 3:** two repeats of pool-verify-v1 on the 40 dev PRs. Together with 059's run they give a dev spread. They change no adoption.
     - Every reviewer and verifier call in runs 1–3 bypasses response-cache reads (`readCache: false` in the client options), so the repeats are real calls, not cache hits. Judge calls may use the cache.
     - The only rerun allowed: a pull request whose reviewer or verifier request fails after the client's retry, or that hits a provider outage, is rerun once within its run. The original failure is kept and reported. No other rerun for any reason.
   - **Reported whatever the outcome:**
     - the full table under both judges for Cal.com run 1;
     - the spread over Cal.com runs 1–3 and over dev runs 1–3 (min, median, max of P, R and F per row);
     - per-PR cost and wall time;
     - void runs, and any deviation from this plan.
   - **Predictions, written now as guesses,** each with the dev numbers it rests on:
     - (a) whether pool-verify-v1's F on Cal.com is above review-diff-v1's;
     - (b) pool-verify-v1's rank among the six reviewers (five tools plus pool-verify-v1) under bench-judge-v1;
     - (c) whether pool-verify-v1's F on Cal.com falls within 5 points of its dev F (35.6).
     They are scored in the results doc; a wrong prediction is reported as wrong.
   - **Cap for 062:** $15 of Nebius credit, in this order, stopping before the cap:
     1. Cal.com run 1 plus both judges: at most $6 (059's per-PR max of $0.23 × 10 PRs × 2 for a larger repo, plus judges).
     2. Cal.com runs 2–3: at most $5.
     3. Dev runs 2–3: at most $4.
     If the cap is reached, the later items are reported as not done. Run 1 is never cut.
   - **Blindness after the run:** results stay counts-only in the repo (Cal.com is AGPL and the dataset has no licence). No Cal.com comment, golden or code text in any file, PR or message, ever.
   - **Limits:**
     - one pre-registered primary run (the repeats measure spread; they are not extra chances);
     - the configuration was the fourth reviewer variant chosen on the same dev set;
     - the judge is the same model family as the reviewer (060: the gap is small);
     - the golden set was built from the tools' comments (060);
     - n is small (test set of 10 PRs);
     - the PRs have been public since 2025, so models may have seen them.
3. Code for 062, written and tested now, run never in this job:
   - `scripts/bench/fetch-prs.ts` and `scripts/bench/fetch-repos.ts`: add a test-set mode, `--test-set cal_dot_com`. It runs only when `TRACEHOUND_TEST_RUN=061` is set in the environment; otherwise it refuses, as today. The mode fetches the 10 Cal.com PR inputs and a bare clone with PR heads into ~/Projects/tracehound-bench/test/, a new directory separate from the dev data. It prints counts only, never titles.
   - `scripts/bench/run-test-set.ts --set cal_dot_com|dev --run <1|2|3>`. It runs, in order, review, review-ctx, the pool (the same functions as scripts/bench/pool-verify.ts, imported), verify-ctx, then both judges on the six rows (three rows for dev: review-diff-v1, pool-raw, pool-verify-v1).
     - It calls the analyzer's exported functions with a client built here, with `readCache: false` for reviewer and verifier calls. Do not shell out to the CLIs, which always read the cache.
     - It writes under ~/Projects/tracehound-bench/test/run-<n>/ (Cal.com) or ~/Projects/tracehound-bench/reviews/dev-repeat/run-<n>/ (dev). It never overwrites existing files.
     - It stops at the cap, applies the rerun rule, and prints counts-only tables.
     - `--set cal_dot_com` requires `TRACEHOUND_TEST_RUN=061`. `--set dev --run 1` is refused, because run 1 on dev is 059's.
     - `scripts/bench/spread.ts`: min, median and max per row over runs 1–3, counts only.
   - Tests, with invented data only and no network:
     - the refusal without the env var;
     - the refusal for any other repo name, and for `--set dev --run 1`;
     - the client used for reviewer and verifier calls has cache reads off;
     - the rerun rule (one rerun, original kept);
     - the cap stop and the order of cuts;
     - no overwrite of an existing run directory;
     - row order and that no extra row can be added;
     - spread arithmetic on a hand-worked example;
     - counts-only output (a test asserting no comment body or title reaches stdout).
   - Do not change packages/analyzer/src/ at all. If the runner needs something from it, import it.
4. docs/bench/test-plan.md: points to 061 and lists the exact commands 062 will run, in order, with expected outputs (counts only). Each command runs with `TRACEHOUND_BUDGET_RUN_USD=15` in its environment, so the per-process cap doesn't stop a long run. It also gives Sunny's manual steps: merge this PR first; set `nebiusCapUsd` to 15; check that `TRACEHOUND_BUDGET_TOTAL_USD` in .env is at least 52.
5. CLAUDE.md: one paragraph pointing to 061. No FEEDBACK.md entry (no Nebius use).
6. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Never use `git add -A`, `git add .` or `git commit -a`. Run `git diff --cached --name-only` and confirm that pnpm-lock.yaml, AGENTS.md, packages/analyzer/src/ and any Codex-lane path are not staged.
   - Push and open a PR. Wait until CI for the pushed HEAD has completed (`gh run list --commit <sha>`, `gh run watch <id>`, and `gh run view <id>` if the watch drops). If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, and push again. If it is red a second time, STOP.

Rules
- May touch:
  - scripts/bench/fetch-prs.ts and scripts/bench/fetch-repos.ts (the test-set mode only);
  - new files under scripts/bench/;
  - new test files;
  - docs/ (except docs/action/, docs/demo/, docs/freeze.md, docs/eval/);
  - CLAUDE.md, runs/.
- Do not change packages/analyzer/src/, any prompt, config/, harness/prompts/, AGENTS.md, pnpm-lock.yaml, .github/, packages/action/, docs/action/, docs/demo/, docs/freeze.md or docs/eval/. No new dependencies.
- No model call and no model-list request. Spend $0.
- Cal.com is blind. Never open, print, grep, list, fetch, clone, review or score anything for cal_dot_com. Write the test-set code without running it on Cal.com. Do not set `TRACEHOUND_TEST_RUN` anywhere in this job.
- Do not write to ~/Projects/tracehound-bench.
- Do not open ~/Projects/tracehound-ops, ~/Projects/tracehound-brain, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout, ~/Projects/TraceHound-codex or ~/Projects/tracehound-demo.
- The only branch operations allowed are those in step 0, creating build/061-test-plan, and pushing it. Create no tags.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- Never merge the PR. No claims beyond what ran. Use the word "ambiguous" only when you mean relay should stop.
- After CI has completed, write the STOP AND REPORT to a file under runs/, post it with `gh pr comment <number> --body-file <that file>`, then make it your final message.

STOP AND REPORT:
- the result of each step 0 check;
- the PR number, head sha and every CI run for that sha (name, id, conclusion);
- the prompt and rule sha256 values in 061, each with the test file and line it came from;
- the three predictions as written;
- the cap and its order of cuts;
- confirmation that the runner builds its reviewer and verifier client with cache reads off (file and line);
- the new files and the changed lines in fetch-prs.ts and fetch-repos.ts (`git diff --stat`), and the tests covering the refusal paths;
- results of `pnpm test` and `pnpm typecheck` (counts passed and failed);
- confirmation that no model call was made, nothing for Cal.com was touched, and `TRACEHOUND_TEST_RUN` was never set;
- the files in the commit (`git show --stat`);
- anything skipped.
