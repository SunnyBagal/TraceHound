061a: amend the Cal.com test plan before it merges. Add one restart for a crashed run, fetch before freezing, and fix the docs. Folder ~/Projects/TraceHound, fresh relay session. Branch build/061-test-plan (PR #33): add new commits on top, no new PR. Nebius spend $0, no model calls.

Context: PR #33 (decision 061, head a01f0c6) is not merged. Sunny's answers to the 061 reviewer's questions:
- Q1: he merges #33 with "Create a merge commit" after this amendment lands.
- Q2: no. A crash in Cal.com run 1 must not leave the test set with no headline. Amend 061 to allow one restart, under the rule below, which keeps it from being a second chance.
- Q3: nebiusCapUsd goes to 15 for 062. TRACEHOUND_BUDGET_TOTAL_USD stays at the $45 default, because the ledger ($12.45) plus $15 fits. Drop the "≥ 52" step.

Steps
0. Checks. If any check fails, STOP.
   - `git fetch origin`. `git status --porcelain` prints nothing.
   - `git switch build/061-test-plan`, then `git merge --ff-only origin/build/061-test-plan`. `git rev-parse --short HEAD` prints a01f0c6.
   - `git rev-parse --short origin/main` prints f437ecb. If main has moved, STOP. Do not rebase or merge main in.
   - `grep -c '^## 061' docs/decisions.md` prints 1, and `grep -c '^## 062'` prints 0.
   - Save this prompt verbatim as docs/prompts/061a-test-plan-amend.md.
1. **The restart rule.** Edit decision 061 in place, because it is unmerged and unrun. This is the one exception to "additions only" in decisions.md, and it applies to the 061 section only. Add a line at the end of 061: "Amended before merge (061a, 17 Oct, Sunny's decision), before any Cal.com call: one restart for a crashed run; fetches before the freeze tag."
   - A run may be restarted **once** when its run.json status is still `running`, either because the run exited 3 or because the process died. Even then, the restart is allowed only if the void run has **no file under `scores/`** in its directory. With no score file, no result from the void run exists, so nobody has seen anything to select on.
   - `--run <n> --restart` writes to a new directory, `run-<n>r/` (for example `test/run-1r/`). It refuses, with nothing written, if:
     - `run-<n>/` doesn't exist;
     - its status is `complete` or `stopped-at-cap`;
     - `run-<n>/scores/` holds any file;
     - `run-<n>r/` already exists.
   - The void directory stays untouched and is reported: its spend, the pull request it stopped at, and the error. Its partial reviews are never scored.
   - The restart's result is used whatever it is, and it takes the run's place. If run 1 was void, run 1r is the headline. A second crash means the run is void, with no further restart.
   - The void run's spend counts toward its plan item and the $15. The restart gets what is left of that item's allowance.
   - Every run (Cal.com 1–3, dev 2–3) gets this one restart. The order checks and spread.ts treat `run-<n>r` as run n, and the output labels it "(restarted)".
   - Under Rejected, keep "letting a crashed run resume in its own directory" and add one line on why the restart is different: it starts clean, and only before any score exists.
2. **Code.** Implement this in `scripts/bench/run-test-set.ts`, `scripts/bench/test-set.ts` and `scripts/bench/spread.ts`. Add tests to `packages/analyzer/test/test-set-run.test.ts`, with invented data and a fake fetch. Cover:
   - refused when a score file exists;
   - refused when the run completed or stopped at the cap;
   - refused a second time;
   - spend carry-over;
   - order checks treating 1r as 1;
   - spread choosing 1r and labelling it.
3. **test-plan.md**
   - Manual step 3: replace "at least 52" with "the ledger total plus $15 must fit under `TRACEHOUND_BUDGET_TOTAL_USD`; the $45 default is enough at a $12.45 ledger".
   - **Reorder:** the two fetch commands (no model calls) come first, then the freeze tag, then the runs. Reason: the gated fetch path has never run. If it fails, a fix can merge and the tag goes on the new merge commit, so no tag is ever moved. Write the change into 061 too. The freeze still comes before the first model call.
   - Freeze step: use an annotated tag, `git tag -a review-freeze-1 -m "061 frozen code for the Cal.com run" <sha>`, and push only that tag.
   - Add a section "If a run crashes":
     - check `run.json` status;
     - `ls <run dir>/scores` must print nothing;
     - the exact restart command;
     - if scores exist, the run is void, with no restart.
   - Add to the manual steps: "During 062, nothing else calls Nebius on this key: no UI naming pass, no Action runs on the demo or dogfood PRs."
4. **Gate.**
   - The GIT_* env check prints nothing. `pnpm test` and `pnpm typecheck` pass in a plain shell.
   - Stage by explicit path, and check `git diff --cached --name-only`.
   - Push to build/061-test-plan (no force), and wait for CI on the new head. Make one fix attempt if CI is red; if it is red a second time, STOP.

Rules
- May touch: docs/decisions.md (the 061 section only), docs/bench/test-plan.md, docs/prompts/, scripts/bench/run-test-set.ts, scripts/bench/test-set.ts, scripts/bench/spread.ts, packages/analyzer/test/test-set-run.test.ts, CLAUDE.md.
- Do not touch packages/analyzer/src, harness/prompts, config/, fetch-prs.ts, fetch-repos.ts, AGENTS.md, pnpm-lock.yaml, .github/, packages/action/, docs/action/, docs/demo/, docs/freeze.md or docs/eval/.
- Cal.com is blind: no read, list, fetch, clone, review or score. Never set TRACEHOUND_TEST_RUN. No model calls.
- No destructive git: no forced pushes, no amending, no hard resets, no branch or tag changes. Never merge the PR.
- Post the STOP AND REPORT as a PR comment via a file under runs/, then make it your final message.

STOP AND REPORT:
- the step 0 results;
- the new head sha and CI run;
- the files in each commit;
- the amended 061 text (diff of that section only);
- the test-plan.md command order after the change;
- the test and typecheck counts;
- anything not done.
