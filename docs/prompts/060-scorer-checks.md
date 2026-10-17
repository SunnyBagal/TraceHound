Scorer checks: a second judge from another model family, and augmented precision. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 060. Spend: at most $5 of Nebius credit for the whole job (Sunny sets `nebiusCapUsd` to 5 before the start).

Context: every result so far was scored by one judge, `bench-judge-v1`: Nemotron Super, temperature 0, reasoning on, prompt sha256 `23de4e9e…058460`. Our reviewer is also Nemotron Super, so the judge may favour outputs from its own model. Its error is not measured. Separately, the golden comments were extended by Augment using the five recorded tools' own comments. So a valid finding that none of those tools made counts as a false positive, which biases precision against any new reviewer, ours included. pool-verify-v1 (decision 059) was adopted at F 35.6% against a 35.0% bar. This job measures both problems. **It is report only: bench-judge-v1 stays the scorer of record, no adoption changes, and no headline number changes.**

Cal.com is the test set. Nothing in this job reads, fetches, clones, reviews or scores anything for Cal.com.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`. `git status --porcelain` must print nothing.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign). If it fails, STOP. Then `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - HEAD must equal origin/main, and `git status --porcelain` must still print nothing.
   - `grep -c '^## 059' docs/decisions.md` must print 1, and `grep -c '^## 060' docs/decisions.md` must print 0.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc.
   - These must exist for the 40 dev pull requests (sentry, grafana, keycloak, discourse only; never list a directory that holds Cal.com files):
     - the inputs under prs/;
     - the neutral reviews of the five recorded tools;
     - the reviews of review-diff-v1, review-ctx-v1, verify-ctx-v1 (kept), agree-diff-ctx, pool-raw and pool-verify-v1, all Super;
     - their bench-judge-v1 score details under scores/.
   - One model-list request (`GET /v1/models` on Token Factory, through the existing client's base URL and key; no completion) must list `Qwen/Qwen3-235B-A22B-Instruct-2507`. Print only whether it is listed. If it is not listed, STOP.
   - `gh auth status` must succeed.
1. Create branch build/060-scorer-checks. Save this prompt verbatim as docs/prompts/060-scorer-checks.md.
2. Pre-registered rules. Write these into docs/decisions.md (decision 060, Choice) before any completion call, and do not change them after the first one:
   - **Second judge, bench-judge-x1:**
     - model `Qwen/Qwen3-235B-A22B-Instruct-2507`, temperature 0, no reasoning field in the request;
     - system prompt byte-identical to bench-judge-v1's (same sha256), the same per-pull-request request shape, and the same rules (Low neutral, duplicates neutral, micro-averaged);
     - only the model and the reasoning field differ.
   - **Agreement measures** (judge-v1 against judge-x1), over every comment of every run judged by both:
     - the share of comments where both judges give the same label (the same golden id, or none);
     - Cohen's kappa on the outcome class (TP, FP, low, dup);
     - P, R and F per run under each judge, with n;
     - Kendall's tau between the two judges' F-rankings of all runs.
   - **Self-preference measure:** for each run, the precision gap (v1 minus x1). Report the mean gap over TraceHound runs and the mean over the five tools. Report the numbers; draw no conclusion beyond them.
   - **Validity check, for augmented precision:**
     - Take every comment that bench-judge-v1 labelled FP (matched no golden comment), in every run listed in step 0. Deduplicate identical comments (same pull request, path, line and body) and judge each once.
     - Each comment is judged by two validity judges: Super (`nvidia/nemotron-3-super-120b-a12b`, reasoning on, temperature 0) and Qwen (as above, no reasoning field).
     - Both use one new prompt, validity-v1. It sees the pull request's title, its description (cut at 8,000 characters, as in 055), the comment (path, line, body), and the diff of the comment's file only. The diff is rendered with new-version line numbers as review-diff-v1 renders it. No repository context, so the check is the same for every reviewer.
     - The prompt asks one question: is this comment a real defect in the changed code that a careful reviewer would want fixed? The reply is strict JSON, `{"verdict": "valid" | "invalid" | "unsure", "reason": "<one sentence>"}`. An invalid reply gets one retry; after that the comment counts as unsure.
   - **Augmented precision per run:** (TP + FPs judged valid) / (TP + FP), under each validity judge separately, plus under "both say valid". Report the validity judges' agreement (share and kappa on valid / invalid / unsure).
   - **Order and partial results:** the second judge runs first, then the validity check. If the cap stops the validity check before every deduplicated FP has both verdicts, no augmented precision is reported for any run. The job says "validity check not completed" and reports the counts done.
3. Code. Allowed under packages/analyzer/src/bench/:
   - an optional reasoning switch for the judge, exposed as `bench score --reasoning on|off`. The default must keep bench-judge-v1's request byte-identical; pin this with a test that snapshots the request body for the default;
   - new files for validity-v1 (its prompt in its own file outside harness/prompts/, pinned by sha256 in a test) and a CLI command `tracehound bench validity`.
   - Nothing else under src/bench/ or src/review/ changes.
   - Scripts under scripts/bench/: the re-judge driver, the agreement, kappa and tau computation, deduplication, and the tables.
   - Tests use invented data only, with no network: deduplication, kappa on a hand-worked example, tau on a hand-worked example, augmented precision arithmetic, the partial-result rule, and the default judge request unchanged.
   - In config/prices.json, add one entry for `Qwen/Qwen3-235B-A22B-Instruct-2507`: input 0.20 and output 0.60 per 1M, `"placeholder": false`. Add a note in `_readme` that it comes from a third-party listing (models.dev via mastra.ai, 2026-10-16) and is not verified in the console. Change nothing else in that file.
4. Freeze commit. After the gates in step 7 pass, commit the step 2 rules in docs/decisions.md, the validity-v1 prompt, the code and the tests, and push. Message: "060: pre-registered scorer checks, judge-x1 and validity-v1 frozen". Do this before any completion call. Later commits must not change the step 2 text, the validity-v1 prompt, or anything under packages/analyzer/src/.
5. Run.
   a. Re-judge, with bench-judge-x1, every run listed in step 0 on the 40 dev pull requests. Use fresh requests: earlier bench-judge-v1 matches are never reused for x1. Write the details under ~/Projects/tracehound-bench/scores/judge-x1/.
   b. Build the deduplicated FP set from the bench-judge-v1 score details, and run validity-v1 with both validity judges. Write the verdicts under ~/Projects/tracehound-bench/scores/validity-v1/.
   c. Stop before anything that would take the job past $5 on the ledger.
6. Docs.
   - docs/decisions.md, decision 060, same shape as 055 to 059: the pre-registered rules (copied as written), the results, and Limits:
     - the second judge is one other model, not ground truth;
     - the validity judges see only the diff;
     - Super is both reviewer and one validity judge;
     - augmented precision has no matching recall (unlisted valid defects can't be counted as found or missed);
     - n = 74.
   - Rejected: replacing bench-judge-v1 as the scorer of record (it would move every earlier number after the fact); a human-labelled validity set (no time before the freeze).
   - docs/bench/scorer-checks.md:
     - per run (the five tools and every TraceHound run in step 0): P, R and F under v1 and under x1, with n;
     - the agreement share, kappa and tau;
     - the self-preference gaps (per run, and the two means);
     - the deduplicated FP count per run;
     - validity verdict counts per run and per judge;
     - augmented precision per run under each validity judge and under "both valid";
     - the validity judges' agreement;
     - whether pool-verify-v1 is at or above F 35.0% under x1, stated as a fact that changes nothing;
     - calls, tokens, cost.
   - CLAUDE.md: a short paragraph pointing to 060.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires. Include how the Qwen model behaved on Token Factory (errors, retries, latency) and whether `GET /v1/models` matched the docs.
7. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Never use `git add -A`, `git add .` or `git commit -a`. Before each commit, run `git diff --cached --name-only` and confirm that:
     - nothing from ~/Projects/tracehound-bench is in the repo;
     - pnpm-lock.yaml and AGENTS.md are not staged;
     - no Codex-lane path is staged.
   - Commit the results on top of the freeze commit, push, and open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`. If `gh run watch` drops, confirm with `gh run view <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound:
  - what step 3 allows under packages/analyzer/src/bench/;
  - scripts/bench/ (new files);
  - new test files;
  - one entry in config/prices.json (step 3);
  - docs/ (except docs/action/ and docs/demo/), CLAUDE.md, FEEDBACK.md, runs/.
- Do not change:
  - bench-judge-v1's prompt or default request;
  - anything under packages/analyzer/src/review/, any existing prompt, harness/prompts/;
  - AGENTS.md, pnpm-lock.yaml, .github/, packages/action/, docs/action/, docs/demo/;
  - docs/freeze.md, docs/eval/.
  No new dependencies.
- You may write new files under ~/Projects/tracehound-bench. Never modify or delete existing reviews, scores, inputs or repos. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, clone, review or score anything for cal_dot_com. Never list a directory that holds Cal.com files; name the dev repos directly.
- Never print golden comment text, review comment text, judge or validity reasons, or repository source in your messages. Counts only. You may read dev data to debug code, not to change the rules or the prompt after the first completion call.
- Do not open ~/Projects/tracehound-ops, ~/Projects/tracehound-brain, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout or ~/Projects/TraceHound-codex.
- Model calls only through src/llm/client.ts:
  - judging: bench-judge-v1 (Super) and bench-judge-x1 (Qwen);
  - validity: validity-v1 on Super and Qwen;
  - one model-list request.
  No other model, no sandbox. Total spend at most $5 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0, creating build/060-scorer-checks, and pushing it.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran. A number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- After CI has completed, post the full STOP AND REPORT as a comment on your PR: write it to a file under runs/ and run `gh pr comment <number> --body-file <that file>`. Counts only. Then make the same STOP AND REPORT your final message, and send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including whether Qwen was listed;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the freeze commit's sha and push time, the time of the first completion call, and `git diff --stat <freeze sha> HEAD -- packages/analyzer/src` (it must be empty);
- the default bench-judge-v1 request: confirmation that the snapshot test passes unchanged;
- per run, under both judges: comments, TP, FP, dup, low, FN, JUDGE_FAILED, P, R and F, with n;
- the agreement share, kappa and tau; the self-preference gaps (per run and the two means);
- pool-verify-v1's F under x1;
- validity: the deduplicated FP count, verdict counts per judge, the judges' agreement, augmented precision per run (three ways), or "validity check not completed" with the counts done;
- calls, tokens and cost per model and purpose; the ledger before and after;
- results of `pnpm test` and `pnpm typecheck` (counts passed and failed);
- confirmation that nothing for Cal.com was read, fetched, cloned, reviewed, scored or listed;
- the files in each commit (`git show --stat`), with confirmation that pnpm-lock.yaml, AGENTS.md and no Codex-lane path is among them;
- anything skipped or not done.
