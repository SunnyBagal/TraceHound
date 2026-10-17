062: run the frozen Cal.com test-set plan (decision 061, as amended by 061a). Folder ~/Projects/TraceHound, fresh relay session. Branch build/062-test-run. Spend: at most $15 of Nebius credit, held by the runner in the order set in 061.

Before starting, Sunny:
- merges PR #33 with "Create a merge commit" (#34 may merge too, also with a merge commit);
- leaves #32, the dogfood workflow, **unmerged** until the 062 PR is done, so the 062 PR can't trigger a Nebius review;
- sets `nebiusCapUsd` to 15;
- makes sure nothing else calls Nebius during the run: no UI naming pass, no demo PR activity.

Steps
0. Checks. If any check fails, STOP.
   - `git fetch origin`. `git status --porcelain` prints nothing.
   - If on main: `git merge --ff-only origin/main`. Otherwise: `git fetch origin main:main` (no plus sign), then `git switch main`. Do not push, rename or delete the branch you left.
   - HEAD equals origin/main.
   - `gh pr view 33 --json mergeCommit,state` shows MERGED. Call its merge commit sha M.
   - `git diff M HEAD -- packages/analyzer/src scripts/bench config` prints nothing.
   - `grep -c '^## 061' docs/decisions.md` prints 1 and `grep -c '^## 062'` prints 0. `grep -c '061a' docs/decisions.md` is at least 1.
   - `test -e .github/workflows/tracehound-review.yml` fails, meaning the dogfood workflow is not on main.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` prints 3f2c8ab794b4ed71c099cbf0a7670555e90906dc.
   - `git tag -l review-freeze-1` and `git ls-remote --tags origin review-freeze-1` both print nothing. `git rev-parse --short eval-freeze-2^{commit}` prints acefcf9.
   - `gh auth status` succeeds. `pnpm spend` total plus $15 is under TRACEHOUND_BUDGET_TOTAL_USD.
1. Create branch build/062-test-run and save this prompt verbatim as docs/prompts/062-test-run.md. Do not commit yet.
2. Run docs/bench/test-plan.md's commands exactly as written and in that order:
   - first the two fetches;
   - then the freeze: the annotated tag review-freeze-1 on M, pushed alone, then the frozen-paths diff, which must print nothing;
   - then Cal.com run 1, runs 2–3, dev runs 2–3, and the spread for both sets.

   Rules for this step:
   - Set TRACEHOUND_TEST_RUN=061 and TRACEHOUND_BUDGET_RUN_USD=15 only on those commands' own command lines, never exported.
   - Run the runner from main at HEAD. Switch back to your branch only for step 3.
   - Keep every output to counts only.
   - If a fetch fails, STOP before tagging anything.
   - If any command's exit code or output differs from what test-plan.md expects, STOP. Two exceptions:
     - Exit 2 (cap) follows the plan.
     - Exit 3 follows "If a run crashes" in test-plan.md exactly: run.json status is `running`, `ls <run dir>/scores` prints nothing, and the process has exited. Then restart once with `--restart`.
   - Never improvise a fix or edit any file under scripts/bench, packages/analyzer/src or config: that voids the run.
   - Create, move or delete no other tag.
3. Write docs/bench/test-results.md and decision 062 (Result), counts only:
   - the Cal.com run 1 table (or 1r, labelled) under bench-judge-v1 and bench-judge-x1, all eight rows, with n;
   - the spread (min, median and max of P, R and F per row) over Cal.com runs 1–3 and dev runs 1–3, under both judges;
   - per-pull-request cost and wall time (median, max);
   - each void run and restart, with its spend, where it stopped and the error name;
   - items not done, and every deviation from 061, including run 1 going over $6;
   - predictions (a), (b) and (c) scored as right or wrong, with the numbers;
   - limits, copied from 061 and extended if the run showed new ones.

   Write losses as losses, and don't argue with the result. Add a CLAUDE.md line and a dated FEEDBACK.md entry for the Nebius use.
4. Commit and gate.
   - `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'` prints nothing. `pnpm test` and `pnpm typecheck` pass in a plain shell.
   - Stage only by explicit path, never `git add -A`, `git add .` or `git commit -a`. `git diff --cached --name-only` shows no pnpm-lock.yaml, AGENTS.md or Codex-lane path.
   - Push and open a PR titled "062: Cal.com test-set result (decision 062)". Wait for CI on the pushed head. Make one fix attempt within the may-touch paths if it is red; if it is red a second time, STOP.

Rules
- May touch: docs/ (except docs/action/, docs/demo/, docs/freeze.md and docs/eval/), CLAUDE.md, FEEDBACK.md and runs/. New files may be written under ~/Projects/tracehound-bench/test/ and ~/Projects/tracehound-bench/reviews/dev-repeat/, only by the fetch scripts and the runner. Never modify or delete existing bench files.
- Do not change any code, test, prompt, config/, harness/prompts/, AGENTS.md, pnpm-lock.yaml, .github/, packages/action/, docs/action/, docs/demo/, docs/freeze.md or docs/eval/.
- Cal.com is blind in every output. No Cal.com comment, golden, title, path or code text goes in any file, PR, comment or message, ever. Do not open, list or grep Cal.com files yourself; only the scripts read them.
- Do not open ~/Projects/tracehound-ops, ~/Projects/tracehound-brain, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout, ~/Projects/TraceHound-codex, ~/Projects/TraceHound-ui or ~/Projects/tracehound-demo.
- The only tag operation allowed is creating and pushing review-freeze-1 on M. eval-freeze-2 stays at acefcf9.
- No destructive git: no forced pushes, no hard resets, no branch or tag deletion, no history rewriting, no amending.
- Never merge the PR. Make no claim beyond what ran. Use the word "ambiguous" only when you mean relay should stop.
- Post the STOP AND REPORT as a PR comment via a file under runs/, then make it your final message.

STOP AND REPORT:
- the step 0 results, including M;
- the review-freeze-1 tag object sha and target sha;
- each command run, with its exit code;
- the Cal.com run 1 table under both judges, with n;
- the spread tables;
- the predictions, scored;
- the ledger before and after, and the spend per plan item;
- void runs, restarts, reruns, items not done and deviations;
- the PR number, head sha and CI runs;
- the test and typecheck counts;
- the files in each commit;
- anything skipped.
