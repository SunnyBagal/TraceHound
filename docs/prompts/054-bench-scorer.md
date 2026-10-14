Prompt: Benchmark data and scorer. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 054. Spend: at most $3 of Nebius credit, on judge calls only.

Context: the owner has decided that TraceHound becomes a pull-request reviewer measured on a public benchmark (the plan is docs/reviewer-plan.md, which the owner has placed in the checkout, untracked). This job builds no reviewer. It fetches the benchmark data to a folder outside the repo, builds the scorer, and scores the recorded reviews of five existing tools so that our scorer's numbers can be read beside the published ones.

The Cal.com part of the dataset is the test set. You must never read its contents. The scorer reads it at run time and you see counts.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` may contain only these lines: `?? AGENTS.md` and `?? docs/reviewer-plan.md`. The second one must be present. Any other line means STOP.
   - If the current branch is not main, run `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - Run `git merge --ff-only origin/main`. If it fails, STOP. The current branch must now be main, and HEAD must equal origin/main.
   - Run `git status --porcelain` again; the same rule applies.
   - `grep -c '^## 053' docs/decisions.md` must print 1, and `grep -c '^## 054' docs/decisions.md` must print 0.
   - Do not stage, commit, move, edit, delete or ignore AGENTS.md.
   - `gh auth status` must succeed.
   - `~/Projects/tracehound-bench` must not exist yet. If it exists, STOP.
1. Create branch build/054-bench-scorer. Save this prompt verbatim as docs/prompts/054-bench-scorer.md.
2. Fetch the data into ~/Projects/tracehound-bench, which is outside every repo and is never committed anywhere.
   a. Golden comments: clone https://github.com/ai-code-review-evaluations/golden_comments into ~/Projects/tracehound-bench/golden and check out 3f2c8ab794b4ed71c099cbf0a7670555e90906dc. `git rev-parse HEAD` must print that value. The files are code_review_benchmarks/{sentry,cal_dot_com,grafana,keycloak,discourse}.json. Each is a list of {pr_title, comments: [{comment, severity}]}.
   b. Recorded reviews: for each tool in greptile, coderabbit, augment, cursor, copilot and each repo in sentry, cal_dot_com, grafana, keycloak, discourse, the fork is ai-code-review-evaluations/<tool>-<repo>. With `gh api --paginate`, save for every pull request: its number, title and state; its line-level review comments (pulls/<n>/comments); its reviews (pulls/<n>/reviews); its issue comments (issues/<n>/comments); and the names of its changed files (pulls/<n>/files, names only). Write them under ~/Projects/tracehound-bench/recorded/<tool>/<repo>/.
   c. Write a script for 2b and run it with its output going to files. It prints counts only: per fork, pull requests found, and line-level comments, reviews and issue comments saved. Keep the script in the repo under scripts/bench/.
   d. Map fork pull requests to golden entries by title, after trimming whitespace. Some forks hold more than 10 pull requests. Report, as counts per fork, how many matched, how many fork pull requests matched nothing, and how many golden entries matched nothing. Unmatched ones are left out of scoring.
3. Build the scorer in packages/analyzer/src/bench/, with a CLI command registered the way the existing commands are.
   a. Input: one golden file, and one folder of review comments in a neutral format that TraceHound's own reviewer will also write later: per pull request, {pr_title, comments: [{path, line, body}]}. Add a converter from the recorded GitHub data to this format.
   b. Which recorded comments count: top-level line-level review comments (no `in_reply_to_id`) written by a bot account or by the tool's own account. Summaries, review bodies, issue comments and human comments do not count. Report per tool the author logins that were counted and how many comments each wrote.
   c. Matching: an LLM judge decides whether a tool comment and a golden comment refer to the same underlying issue. One request per pull request: it lists the golden comments and the tool comments with ids, and the model returns, for each tool comment, the id of the golden comment it matches or none. Validate the ids, retry once on an invalid reply, and after that mark the pull request JUDGE_FAILED. A JUDGE_FAILED pull request is left out of the totals and counted in the report. It is never scored as zero.
   d. Scoring rules, from the dataset's README:
      - A tool comment that matches a Medium, High or Critical golden comment is a true positive. Each golden comment is credited once; further comments matching the same one are duplicates and count as neither true nor false positives.
      - A tool comment that matches a Low golden comment counts as nothing. A missed Low golden comment counts as nothing.
      - A tool comment that matches no golden comment is a false positive.
      - A Medium or higher golden comment that nothing matches is a false negative.
      - Precision, recall and F-score are computed from the summed counts across pull requests, per repo and overall. Print n beside every figure.
   e. The judge goes through src/llm/client.ts like every other model call (cache, budget, ledger). Model: Nemotron Super, temperature 0. The judge interface takes a list of judges and a majority vote; this job runs one judge.
   f. Output: a summary of counts on stdout, and per-comment detail (which comment matched which golden comment) only in a file under ~/Projects/tracehound-bench/scores/. No comment text ever goes to stdout.
   g. Tests: no network, a scripted fake judge, invented fixtures. Cover the Low rule, duplicates, invalid ids, JUDGE_FAILED, and the title mapping. Do not copy any text from the dataset into a test or fixture.
   h. To learn the data's shape you may read ~/Projects/tracehound-bench/golden/code_review_benchmarks/sentry.json and the recorded sentry data. You may debug the judge prompt on sentry only.
4. Score the recorded reviews: all five repos for greptile, then coderabbit, then augment, cursor, copilot, in that order, stopping before a tool that would take the job past $3 on the ledger. Read the ledger total before and after.
   - Write the judge prompt before the first scoring run and do not change its wording after seeing any score. The one allowed change is to fix replies that fail validation; record it if you make it.
   - Published figures to print beside ours (Augment's write-up of this dataset, updated 18 June 2026, all 50 pull requests, precision / recall / F-score): Greptile 45 / 45 / 45; CodeRabbit 36 / 43 / 39; Augment 65 / 55 / 59; Cursor Bugbot 60 / 41 / 49; GitHub Copilot 20 / 34 / 25. Their judge model is not stated. Report the differences. Do not explain them away and do not tune towards them.
   - From the saved file names, report per pull request for grafana and cal_dot_com the count of changed files by extension (.ts and .tsx against everything else). Extensions and counts only, no paths.
5. Docs.
   - docs/decisions.md, decision 054, same shape as 049 to 052: the dataset and its pinned commit; why we score with our own judge (the published numbers disagree with each other); the scoring rules; the single judge as a limit; n; that the data stays out of the repo because the dataset has no licence file and Cal.com is AGPL. Rejected: trusting any vendor's table; matching by file and line; committing the dataset.
   - docs/bench/scorer-validation.md: the tables from step 4, counts and percentages only.
   - CLAUDE.md: a short paragraph on the benchmark and the scorer command, and this rule: sessions that build or tune the reviewer never read Cal.com's golden comments, the recorded tool comments for Cal.com, or per-comment score detail for Cal.com; Cal.com is the test set and everything else in the dataset is dev.
   - Commit docs/reviewer-plan.md exactly as you found it. Do not edit it.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
6. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before committing, confirm with `git diff --cached --name-only` that AGENTS.md is not staged and that nothing from ~/Projects/tracehound-bench is in the repo.
   - Commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: packages/analyzer/src/bench/ (new), the CLI file that registers commands, new test files for the scorer, scripts/bench/ (new), docs/, CLAUDE.md, FEEDBACK.md, runs/. Everything else is read-only, including AGENTS.md. No new dependencies.
- May create and write ~/Projects/tracehound-bench. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, cat, grep, summarise or quote ~/Projects/tracehound-bench/golden/code_review_benchmarks/cal_dot_com.json, anything under recorded/<tool>/cal_dot_com/, or any score detail file for cal_dot_com. Your scripts may read them; their output to you is counts. Do not print Cal.com pull request titles. Do not clone Cal.com or any of its forks in this job.
- Do not open ~/Projects/tracehound-ops, ~/Projects/Recall, ~/Projects/TraceHound-eval or ~/Projects/tracehound-heldout.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: the judge only, Nemotron Super, through src/llm/client.ts. No other model, no sandbox. Total spend for the job at most $3 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0, creating build/054-bench-scorer, and pushing build/054-bench-scorer.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on and whether you switched and fast-forwarded main;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- step 2: per fork, pull requests found, matched, unmatched on each side, and comments saved by kind;
- step 3b: per tool, the author logins counted and their comment counts;
- step 4: per tool, overall and per repo: comments counted, true positives, false positives, duplicates, false negatives, JUDGE_FAILED pull requests, precision, recall, F-score, each beside the published figure; which tools were not scored and why;
- the Cal.com row for each scored tool on its own line (counts and percentages only);
- the .ts/.tsx file counts per pull request for grafana and cal_dot_com;
- ledger total before and after, number of judge calls, and any change made to the judge prompt;
- confirmation that you did not read Cal.com contents, or exactly what you saw if you did;
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them;
- anything skipped or not done.
