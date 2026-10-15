Repo context for the reviewer, review-ctx-v1. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 057. Spend: at most $3 of Nebius credit, reviewer and judge calls together.

Context: review-diff-v1 (decision 055) sees only the diff. On the 40 dev pull requests, Nemotron Super reached recall 43.2% (32/74) and precision 25.6% (32/125). A verifier that also saw only the diff did not help (decision 056). This job tests one change: the reviewer also sees context from the repository at the pull request's head, built deterministically, in a way that works for every language (the dev repos are Python, Go, Java and Ruby; the test repo is TypeScript). The owner chose this over TypeScript-only lookups so that all 40 dev pull requests count. No verifier in this job.

Cal.com is the test set. Nothing in this job reads, fetches, clones, reviews or scores anything for Cal.com.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` may contain only these lines: `?? AGENTS.md` and ` M docs/reviewer-plan.md`. Any other line means STOP. Do not touch AGENTS.md.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign). If it fails, STOP. Then `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - The current branch must now be main, and HEAD must equal origin/main. Run `git status --porcelain` again; the same rule applies, and ` M docs/reviewer-plan.md` must still be present if it was before.
   - `grep -c '^## 056' docs/decisions.md` must print 1, and `grep -c '^## 057' docs/decisions.md` must print 0.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc. The 40 dev pull request inputs under ~/Projects/tracehound-bench/prs/ and the review-diff-v1 Super reviews must exist.
   - `gh auth status` must succeed.
1. Create branch build/057-context. Save this prompt verbatim as docs/prompts/057-context.md.
2. Repositories, outside the repo, under ~/Projects/tracehound-bench/repos/<repo>/ for sentry, grafana, keycloak and discourse only. For each, clone the ai-code-review-evaluations/greptile-<repo> fork and fetch the head commit of each of its 10 mapped pull requests (`pull/<n>/head`). Check that each head's diff against its base matches the saved diff in prs/ (sha256 of `gh pr diff`, or the equivalent git diff, as 055 saved it); report matches per repo and STOP if fewer than 38 of 40 match. Print counts only: clone sizes on disk and time taken.
3. The context builder, in packages/analyzer/src/review/context.ts (and files beside it), deterministic, no model, language-agnostic. For each chunk that review-diff-v1 would send:
   a. Changed files: the full content of each changed file at the head commit, with new-version line numbers. A file over 12,000 characters is cut to windows of 60 lines either side of each hunk, merged where they overlap. Deleted files are skipped.
   b. Changed names: the names of functions, methods and classes that the diff adds, removes or modifies. Take them from git's hunk-header function context and from definition lines inside the hunks (patterns for Python, Go, Java, Ruby, TypeScript and JavaScript; document them). Skip names shorter than 4 characters and names on a stoplist of common words (document it).
   c. References: for each changed name, whole-word matches at the head commit (`git grep -n -w`) outside the changed files, at most 8 per name and 30 per chunk, in a fixed order (test files last, then path order), each shown with 3 lines either side.
   d. Budget: at most 40,000 characters of context per chunk. When over, drop references first (last ones first), then cut changed files to their hunk windows. Record per pull request what was included, the character counts, and what was cut.
   e. Tests: invented mini-repos (git init in a temp dir), no network. Cover name extraction for at least Python, Go, Java and Ruby; the reference cap and order; the budget cuts; a deleted file; determinism (same input, same context byte for byte). Copy nothing from the dataset or the benchmark pull requests into a test.
4. The reviewer review-ctx-v1, beside review-diff-v1 (do not change review-diff-v1's code or prompt):
   a. Same chunking, validation, retry, CHUNK_FAILED handling and output format as review-diff-v1. Findings still have to be on added or context lines of the diff; context from the repo is for checking, not for new comment locations.
   b. Its prompt is review-diff-v1's prompt plus a clearly delimited context block and at most three added sentences telling the model what the context is and to use it to check whether a problem is real and how callers use the changed code. Nothing else changes. Write it once, before the first run on any benchmark pull request; record its sha256; put a text diff between the two prompts in the docs.
   c. Purpose label `review`, temperature 0, through src/llm/client.ts.
5. Run review-ctx-v1 on Nemotron Super (`nvidia/nemotron-3-super-120b-a12b`), reasoning on, on all 40 dev pull requests, stopping before anything that would take the job past $3 on the ledger. Score with `tracehound bench score` and `bench-judge-v1`, unchanged. Write reviews to ~/Projects/tracehound-bench/reviews/review-ctx-v1/<model>/<repo>/ and score detail under ~/Projects/tracehound-bench/scores/.
6. Docs.
   - docs/decisions.md, decision 057, same shape as 049 to 056: what the context holds and how it is built, the budget, the prompt change and its sha256. Limits: one run at temperature 0; one judge; n = 74; name extraction is heuristic; references are textual matches, not resolved symbols, so some are wrong and some are missed. Rejected: TypeScript-only lookups (most dev pull requests would not count); letting the model search the repo with tools (decision 050: the repair agent made 0 graph tool calls in 80 runs).
   - docs/bench/context.md: review-ctx-v1 Super beside review-diff-v1 Super, overall and per repo: comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n. A per-pull-request table of TP and FP for both (golden index, not titles). Context statistics: characters per chunk (median, max), references per chunk, how often the budget cut something. Reviewer calls, CHUNK_FAILED, dropped findings by reason, tokens, cost, latency per pull request. Then, copied from docs/bench/baseline-diff.md, the five recorded tools' dev-only rows.
   - docs/reviewer-plan.md: if it was modified when you started, commit it exactly as you found it.
   - CLAUDE.md: a short paragraph on review-ctx-v1 and its result, pointing to 057.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
7. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before committing, confirm with `git diff --cached --name-only` that AGENTS.md is not staged and that nothing from ~/Projects/tracehound-bench is in the repo.
   - Commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: new files under packages/analyzer/src/review/, the CLI file that registers commands, new test files, scripts/bench/, docs/, CLAUDE.md, FEEDBACK.md, runs/. Do not change packages/analyzer/src/bench/, the judge prompt, or review-diff-v1's or verify-v1's prompt and code. Everything else is read-only, including AGENTS.md. No new dependencies.
- May write under ~/Projects/tracehound-bench. Do not modify or delete existing reviews, inputs or scores. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, clone, review or score anything for cal_dot_com. Do not print Cal.com pull request titles.
- Do not print golden comment text, review comment text or repository source from the benchmark repos in your messages; counts only. You may read dev data to debug code, not to change the prompt after a run.
- Do not open ~/Projects/tracehound-ops, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout or ~/Projects/TraceHound-codex.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: Nemotron Super for the reviewer and the unchanged judge for scoring, all through src/llm/client.ts. No other model, no sandbox. Total spend at most $3 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0, creating build/057-context, and pushing build/057-context.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- After CI has completed, post the full STOP AND REPORT as a comment on your PR: write it to a file under runs/ and run `gh pr comment <number> --body-file <that file>`. It holds counts only. Then make the same STOP AND REPORT your final message. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on, whether you fast-forwarded main and how, and whether you switched;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- step 2: diff matches per repo, clone sizes;
- the review-ctx-v1 prompt's sha256, and confirmation that it was not changed after the first benchmark run;
- overall and per repo, review-ctx-v1 Super beside review-diff-v1 Super: comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n;
- context statistics, and how often the budget cut something;
- reviewer calls, CHUNK_FAILED, dropped findings by reason, tokens, cost, latency per pull request (median, max);
- ledger total before and after, with reviewer and judge spend separated;
- results of `pnpm test` and `pnpm typecheck` (counts of tests passed and failed);
- confirmation that nothing for Cal.com was read, fetched, cloned, reviewed or scored, or exactly what was touched if anything was;
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them;
- anything skipped or not done.
