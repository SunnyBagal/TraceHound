Prompt: Diff-only baseline reviewer. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 055. Spend: at most $3 of Nebius credit, reviewer and judge calls together.

Context: decision 054 built the benchmark scorer and scored five recorded tools (docs/bench/scorer-validation.md). This job builds the simplest possible reviewer: it reads only the pull request's title, description and diff, with no other context from the repo, and writes line comments. It runs on the dev repos only (sentry, grafana, keycloak, discourse) and is scored with the unchanged judge. Its numbers are the baseline that every later version has to beat. Nothing here is tuned towards a score.

Cal.com is the test set. Nothing in this job reads, fetches or reviews a Cal.com pull request.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` may contain only these lines: `?? AGENTS.md` and ` M docs/reviewer-plan.md`. Any other line means STOP. Do not touch AGENTS.md or docs/reviewer-plan.md.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: first run `git fetch origin main:main`, with no plus sign before the refspec, so that git updates local main only by fast-forward and refuses anything else. If it fails, STOP. Then run `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from. (Reason: local main may predate PR #22 and lack docs/reviewer-plan.md, so switching to it before the fast-forward would try to remove the modified file. After the fast-forward, main's tree has that file at the same version as the 054 branch, and the switch carries the uncommitted edit across untouched.)
   - The current branch must now be main, and HEAD must equal origin/main.
   - Run `git status --porcelain` again; the same rule applies. ` M docs/reviewer-plan.md` must still be present if it was present before.
   - `grep -c '^## 054' docs/decisions.md` must print 1, and `grep -c '^## 055' docs/decisions.md` must print 0.
   - `~/Projects/tracehound-bench/golden` must exist, and `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc.
   - `gh auth status` must succeed.
1. Create branch build/055-diff-baseline. Save this prompt verbatim as docs/prompts/055-diff-baseline.md.
2. Inputs, outside the repo, under ~/Projects/tracehound-bench/prs/<repo>/ for sentry, grafana, keycloak and discourse only.
   a. For each golden entry, take the matching pull request in the ai-code-review-evaluations/greptile-<repo> fork (map by title, as decision 054 does). Save its number, title, description (body) and unified diff (`gh pr diff <n> -R <fork>`).
   b. For the same pull requests in the coderabbit-<repo> fork, compute the diff's sha256 and compare it with the Greptile fork's. Report how many match per repo. If any differ, use the Greptile fork's diff and list the golden indexes that differed.
   c. Print counts only: pull requests saved per repo, diff sizes in characters (min, median, max).
3. The reviewer, in packages/analyzer/src/review/ (new), version `review-diff-v1`, with a CLI command registered the way the others are.
   a. Input: title, description, unified diff. Output: the neutral format scored by decision 054, {pr_title, pr_number, comments: [{path, line, body}]}.
   b. One model call per chunk. A chunk is the whole diff if it fits within 60,000 characters; otherwise whole files are packed into chunks of at most 60,000 characters, and a single file larger than that is cut at hunk boundaries. Every chunk call gets the title and the description.
   c. The prompt asks for defects that a careful senior reviewer would flag before merging: wrong behaviour, crashes, security problems, data loss, broken contracts between the changed code and its callers as far as the diff shows them. Not style, naming, formatting, missing tests or documentation. Each finding gives the file path, a line in the new version of the file, and a body that says what is wrong and what it breaks. The model replies with JSON only; the shape is yours to define. Write the prompt once, before the first run on any benchmark pull request, and do not change it after seeing any output or score. Record its sha256.
   d. Validation, deterministic: a finding whose path is not in the diff, or whose line is not an added or context line of that file in the new version, is dropped and counted by reason. An invalid JSON reply is retried once; after that the chunk is CHUNK_FAILED, counted, and contributes no comments. A pull request is never silently empty: the output records chunks, failures and drops.
   e. All calls go through src/llm/client.ts (cache, budget, ledger) with temperature 0 and a purpose label of `review`, so the ledger separates reviewer calls from judge calls.
   f. Tests: no network, a scripted fake model, invented diffs. Cover chunking (one file over the limit, many small files), line validation (added, context, deleted, outside any hunk, wrong path), the retry and CHUNK_FAILED, and the output shape. Copy no text from the dataset or from any benchmark pull request into a test.
4. Runs, in this order, stopping before any run that would take the job past $3 on the ledger:
   a. `review-diff-v1` on Nemotron Super (`nvidia/nemotron-3-super-120b-a12b`), reasoning on, on all 40 dev pull requests.
   b. The same on Nemotron Nano, reasoning on.
   Write reviews to ~/Projects/tracehound-bench/reviews/review-diff-v1/<model>/<repo>/. Then score each run with `tracehound bench score` and judge `bench-judge-v1`, unchanged: same model, settings and prompt sha256 as in docs/bench/scorer-validation.md. Score detail goes under ~/Projects/tracehound-bench/scores/.
5. Docs.
   - docs/decisions.md, decision 055, same shape as 049 to 054: what the reviewer sees and does not see, chunking, validation, the frozen prompt and its sha256, both models. Limits: one run per model at temperature 0 (no variance measured); n = 77 dev golden comments of Medium or higher; one judge; the dev pull requests were the ones the five tools' scores were computed on, and nothing was tuned on them. Rejected: a whole-repo context in this version (that is what later versions are measured against); asking the model for a severity and filtering on it (not in v1, so the baseline stays untuned).
   - docs/bench/baseline-diff.md: per model, overall and per repo: comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n. Beside them, the five recorded tools' dev-only rows (sentry, grafana, keycloak, discourse), computed from the per-repo rows in docs/bench/scorer-validation.md, not re-judged. Also per model: reviewer calls, CHUNK_FAILED count, dropped findings by reason, tokens, cost, and latency per pull request (median, max).
   - docs/reviewer-plan.md: commit it exactly as you found it. Do not edit it.
   - CLAUDE.md: a short paragraph on the reviewer command and the baseline result, with a pointer to 055.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
6. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before committing, confirm with `git diff --cached --name-only` that AGENTS.md is not staged and that nothing from ~/Projects/tracehound-bench is in the repo.
   - Commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: packages/analyzer/src/review/ (new), the CLI file that registers commands, new test files for the reviewer, scripts/bench/, docs/, CLAUDE.md, FEEDBACK.md, runs/. Do not change packages/analyzer/src/bench/ or the judge prompt. Everything else is read-only, including AGENTS.md. No new dependencies.
- May write under ~/Projects/tracehound-bench. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, diff, review or score anything for cal_dot_com, in the golden file, the forks, the recorded data or the score files. Do not print Cal.com pull request titles.
- Do not print golden comment text or the reviewer's comment text for any repo in your messages; counts only. You may read the dev repos' data to debug code, not to adjust the prompt after a run.
- Do not open ~/Projects/tracehound-ops, ~/Projects/Recall, ~/Projects/TraceHound-eval or ~/Projects/tracehound-heldout.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: Nemotron Super and Nano for the reviewer, the unchanged judge for scoring, all through src/llm/client.ts. No other model, no sandbox. Total spend at most $3 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0 (including the fast-forward-only `git fetch origin main:main`), creating build/055-diff-baseline, and pushing build/055-diff-baseline.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on, whether you fast-forwarded main and how, and whether you switched;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- step 2: pull requests saved per repo, diff sizes, and the Greptile/CodeRabbit diff comparison;
- the reviewer prompt's sha256, and confirmation that it was not changed after the first benchmark run;
- step 4, per model, overall and per repo: comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n, beside the five tools' dev-only rows;
- per model: reviewer calls, chunks, CHUNK_FAILED, dropped findings by reason, tokens, cost, latency per pull request (median, max);
- ledger total before and after, with reviewer and judge spend separated;
- results of `pnpm test` and `pnpm typecheck` (counts of tests passed and failed);
- confirmation that nothing for Cal.com was read, fetched or reviewed, or exactly what was touched if anything was;
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them;
- anything skipped or not done.
