Context-aware verifier, verify-ctx-v1. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 058. Spend: at most $3 of Nebius credit, verifier and judge calls together.

Context: review-diff-v1 (decision 055), Super, has the best recall on the 40 dev pull requests: 43.2% (32/74) at precision 25.6% (32/125), F 32.2%. A verifier that saw only the diff and gave a 1–5 confidence did not separate true from false findings (decision 056). review-ctx-v1 (decision 057) showed that Super with repository context reports far fewer false positives (93 → 37) but also finds fewer real defects (32 → 21), so F did not move (31.8%). This job tests one change: keep review-diff-v1 as the generator, and add a verifier that sees repository context around each finding and answers keep or drop. Generation stays diff-only; context is used only to judge. No change to review-diff-v1, review-ctx-v1, verify-v1 or the judge.

Cal.com is the test set. Nothing in this job reads, fetches, clones, reviews or scores anything for Cal.com.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` must print nothing. (AGENTS.md is now tracked on main; the owner removed the untracked copy before this run.)
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign). If it fails, STOP. Then `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - The current branch must now be main, and HEAD must equal origin/main. `git status --porcelain` must still print nothing.
   - `grep -c '^## 057' docs/decisions.md` must print 1, and `grep -c '^## 058' docs/decisions.md` must print 0.
   - `git ls-files AGENTS.md` must print AGENTS.md.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc. These must exist: the 40 dev pull request inputs under ~/Projects/tracehound-bench/prs/, the four bare repos under ~/Projects/tracehound-bench/repos/ with their .heads.json, the review-diff-v1 Super reviews and the review-ctx-v1 Super reviews.
   - `gh auth status` must succeed.
1. Create branch build/058-ctx-verify. Save this prompt verbatim as docs/prompts/058-ctx-verify.md.
2. Pre-registered rules. Write these into docs/decisions.md (decision 058, Choice) before any model call, and do not change them after the first verifier call. They are committed in the freeze commit of step 4c:
   - Verdict rule: a finding is kept if and only if the verifier's valid reply says keep. An invalid reply gets one retry; if the retry is also invalid, the finding is kept and counted as VERIFY_FAILED.
   - Adoption rule: verify-ctx-v1 joins the pipeline only if, on the 40 dev pull requests, its F-score is at least 35.0% (about 3 points over review-diff-v1's 32.2%). Otherwise it is recorded as a loss and is not used.
   - Agreement table rule (step 6, reported only, never adopted in this job): a review-diff-v1 Super finding is "agreed" if review-ctx-v1 Super has a finding on the same path whose line is within 3 lines of it in the new version.
3. Per-finding context, in packages/analyzer/src/review/verify-context.ts, deterministic, no model, built at the pull request's head from the bare repo. Reuse context.ts and names.ts functions; do not change them. For each review-diff-v1 finding:
   a. The finding's file at the head with new-version line numbers, a window of 80 lines either side of the finding's line (clipped to the file).
   b. The diff hunks of the finding's file only, rendered as review-diff-v1 renders them, cut at 12,000 characters (hunks nearest the finding's line first).
   c. Names: the function, method or class that encloses the finding's line (nearest definition above it, names.ts patterns), plus any names defined or called on the finding's line itself that names.ts can extract. Same length and stoplist rules as 057.
   d. References: `git grep -n -w -F` for each name at the head, outside the finding's file. Non-test files first, then path, then line. At most 6 per name and 15 per finding, 3 lines either side, lines cut at 300 characters.
   e. Budget: at most 24,000 characters for (a) + (b) + (d) together. Cut order when over: references last first, then the file window shrinks evenly toward 40 lines either side, then the diff hunks farthest from the finding's line. (a) at 40 lines either side is never dropped. Record per finding what was included, character counts and every cut.
   f. Tests: invented mini-repos (git init in a temp dir), no network: enclosing-name extraction for Python, Go, Java and Ruby; reference cap and order; each budget cut; determinism (same input, same context byte for byte). Copy nothing from the dataset or the benchmark pull requests into a test.
4. The verifier verify-ctx-v1, in packages/analyzer/src/review/verify-ctx.ts and verify-ctx-prompt.ts, beside verify-v1 (do not change verify-v1's code or prompt):
   a. One call per finding. Input: pull request title and description, the finding (path, line, text), and the step 3 block between "<<<REPOSITORY CONTEXT" and "REPOSITORY CONTEXT>>>".
   b. The prompt asks one question: is this finding a real defect in the changed code that a careful reviewer would block the merge for, given the context? Reply is strict JSON: {"verdict": "keep" | "drop", "reason": "<one sentence>"}. No confidence score. It tells the model to drop findings that are speculative, about style, already handled elsewhere in the shown code, or about code the diff did not change.
   c. Write the prompt once, before the first verifier call on any benchmark finding. Record its sha256 and pin it in a test. Then, before any verifier call on a benchmark finding, make the freeze commit and push it: the step 2 rules in docs/decisions.md, the prompt files, verify-context.ts, verify-ctx.ts and their tests, after the gates in step 8 pass. Message: "verify-ctx-v1: pre-registered rules and frozen prompt (058)". Later commits must not change the prompt files or the step 2 text; the reviewer checks this with `git diff <freeze sha> HEAD`.
   d. Nemotron Super (`nvidia/nemotron-3-super-120b-a12b`), reasoning on, temperature 0, purpose label `review`, through src/llm/client.ts.
5. Run verify-ctx-v1 over all review-diff-v1 Super findings on the 40 dev pull requests (the 143 kept findings), stopping before anything that would take the job past $3 on the ledger. Write the verdicts to ~/Projects/tracehound-bench/reviews/verify-ctx-v1/super/<repo>/ and the kept findings as review files in the same format as review-diff-v1. Re-judge the kept set with `tracehound bench score` and `bench-judge-v1`, unchanged (do not reuse earlier judge matches).
6. Agreement table, $ for the judge only: apply the step 2 agreement rule to the existing review-diff-v1 and review-ctx-v1 Super reviews, write the agreed findings as review files under ~/Projects/tracehound-bench/reviews/agree-diff-ctx/super/<repo>/, and score them with bench-judge-v1, unchanged. Report only.
7. Docs.
   - docs/decisions.md, decision 058, same shape as 055 to 057: the pre-registered rules (copied as written in step 2), the per-finding context, the prompt and its sha256, the results, whether the adoption rule was met. Limits: one run at temperature 0; one judge; n = 74; the threshold of 35.0% was set before the run but is still a single dev-set comparison; enclosing-name extraction is heuristic. Rejected: reusing 057's per-chunk block (references reached the model in only 12 of 48 chunks); repeated-run voting (costs N reviewer runs; the agreement table gives a first, free signal).
   - docs/bench/ctx-verify.md: rows for review-diff-v1, review-ctx-v1, verify-ctx-v1 and agree-diff-ctx, all Super, overall and per repo: comments, TP, FP, dup, low, FN, JUDGE_FAILED, precision, recall, F with n. A per-pull-request TP and FP table (golden index, not titles). Verifier statistics: findings in, kept, dropped, VERIFY_FAILED, retries; of review-diff-v1's 32 TPs and 93 FPs (by the 055 judge matches), how many were kept and dropped. Context statistics: characters per finding (median, max), references shown per finding (median, max, total), how often each cut fired. Calls, tokens, cost, latency. Then, copied from docs/bench/baseline-diff.md, the five recorded tools' dev-only rows.
   - CLAUDE.md: a short paragraph on verify-ctx-v1 and its result, pointing to 058.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
8. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before committing, confirm with `git diff --cached --name-only` that nothing from ~/Projects/tracehound-bench is in the repo and that no file under the Codex lane's paths is staged.
   - Commit the results on top of the freeze commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: new files under packages/analyzer/src/review/, the CLI file that registers commands, new test files, scripts/bench/, docs/ (except docs/action/ and docs/demo/), CLAUDE.md, FEEDBACK.md, runs/. Do not change packages/analyzer/src/bench/, the judge prompt, or the prompts and code of review-diff-v1, review-ctx-v1, verify-v1, context.ts or names.ts. Do not touch AGENTS.md, .github/actions/, packages/action/, docs/action/ or docs/demo/ (the Codex lane). No new dependencies.
- May write under ~/Projects/tracehound-bench. Do not modify or delete existing reviews, inputs, repos or scores. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, clone, review or score anything for cal_dot_com. Do not print Cal.com pull request titles.
- Do not print golden comment text, review comment text, verifier reasons or repository source from the benchmark repos in your messages; counts only. You may read dev data to debug code, not to change the prompt or the rules after the first verifier call.
- Do not open ~/Projects/tracehound-ops, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout or ~/Projects/TraceHound-codex.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: Nemotron Super for the verifier and the unchanged judge for scoring, all through src/llm/client.ts. No other model, no sandbox. Total spend at most $3 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0, creating build/058-ctx-verify, and pushing build/058-ctx-verify.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- After CI has completed, post the full STOP AND REPORT as a comment on your PR: write it to a file under runs/ and run `gh pr comment <number> --body-file <that file>`. It holds counts only. Then make the same STOP AND REPORT your final message. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on, whether you fast-forwarded main and how, and whether you switched;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the freeze commit's sha and push time, the time of the first verifier call, and `git diff --stat <freeze sha> HEAD` for the prompt files and docs/decisions.md's step 2 text (must be unchanged);
- the verify-ctx-v1 prompt's sha256, and confirmation that it was not changed after the first verifier call;
- overall and per repo, for review-diff-v1, review-ctx-v1, verify-ctx-v1 and agree-diff-ctx (all Super): comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n;
- whether the adoption rule was met (verify-ctx-v1 F at least 35.0%), stated as yes or no;
- verifier statistics: findings in, kept, dropped, VERIFY_FAILED, retries; of the 32 TPs and 93 FPs, how many kept and dropped;
- context statistics and how often each cut fired;
- calls, tokens, cost, latency;
- ledger total before and after, with verifier and judge spend separated;
- results of `pnpm test` and `pnpm typecheck` (counts of tests passed and failed);
- confirmation that nothing for Cal.com was read, fetched, cloned, reviewed or scored, or exactly what was touched if anything was;
- the files in the commit (`git show --stat HEAD`), with confirmation that no Codex-lane path or AGENTS.md is among them;
- anything skipped or not done.
