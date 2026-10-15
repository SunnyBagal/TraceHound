Prompt: Verification pass on review findings. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 056. Spend: at most $2 of Nebius credit, verifier and judge calls together.

Context: decision 055's diff-only reviewer on Nemotron Super reached recall 43.2% (32/74) on the dev repos, equal to CodeRabbit's, but precision 25.6% (32/125), with 93 false positives. Precision is the gap. This job adds one change and measures it alone: a second model pass that checks each finding the reviewer already wrote and gives it a confidence score. It reruns no reviewer. It reads the existing review-diff-v1 Super outputs, scores the kept findings at several thresholds, and reports the trade-off between precision and recall.

Cal.com is the test set. Nothing in this job reads, fetches, verifies or scores anything for Cal.com.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` may contain only `?? AGENTS.md`. Any other line means STOP. Do not touch AGENTS.md.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign, so that git updates local main only by fast-forward). If it fails, STOP. Then run `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - The current branch must now be main, and HEAD must equal origin/main. Run `git status --porcelain` again; the same rule applies.
   - `grep -c '^## 055' docs/decisions.md` must print 1, and `grep -c '^## 056' docs/decisions.md` must print 0.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc.
   - The review-diff-v1 Super outputs for sentry, grafana, keycloak and discourse must exist under ~/Projects/tracehound-bench/reviews/review-diff-v1/, with 40 review files in total, and the saved pull request inputs under ~/Projects/tracehound-bench/prs/ must exist for the same 40.
1. Create branch build/056-verify-pass. Save this prompt verbatim as docs/prompts/056-verify-pass.md.
2. The verifier, in packages/analyzer/src/review/verify.ts (and files beside it), version `verify-v1`, with a CLI command or a subcommand registered the way the others are.
   a. Input: one review file in the neutral format, and the same pull request's title, description and diff. Output: two files. The first is the same neutral format holding every finding, each with a `confidence` from 1 to 5 and a one-sentence `reason`, so that the scorer can be run on any threshold without new model calls. The second is the neutral format filtered at a given threshold.
   b. One model call per finding, Nemotron Super, reasoning on, temperature 0, purpose label `verify`, through src/llm/client.ts. The call sees the title, the description, the finding (path, line, body) and the diff of that finding's file with new-version line numbers, as review-diff-v1 shows them. It does not see the other findings, the golden comments or anything outside the diff.
   c. The prompt asks the model to check the finding against the code it can see, as a sceptical maintainer would. Is the defect real in the code shown, is it introduced or exposed by this change, and would it cause wrong behaviour, a crash, a security problem or data loss? Then it gives a confidence from 1 (not a real defect, or not supported by the code shown) to 5 (certainly a real defect introduced by this change). The prompt also says that a finding which depends on code outside the diff is not wrong for that reason alone; the model judges whether the claim is plausible from what it sees. JSON reply only; the shape is yours to define. Write the prompt once, before the first run on any benchmark pull request, and do not change it after seeing any output or score. Record its sha256.
   d. An invalid reply is retried once. After that, and after a failed request, the finding gets confidence `null` and status VERIFY_FAILED; it is counted, and it is kept at every threshold (a failure never removes a finding silently).
   e. Tests: no network, a scripted fake model, invented findings and diffs. Cover the confidence parsing, the retry, VERIFY_FAILED being kept, threshold filtering, and that the neutral format still parses for the scorer. Copy no text from the dataset or any benchmark pull request into a test.
3. Run `verify-v1` on all findings in the 40 review-diff-v1 Super review files. Then score with `tracehound bench score` and judge `bench-judge-v1`, unchanged, at thresholds 1 (everything kept, which must reproduce 055's Super row exactly), 2, 3, 4 and 5. Use the judge's cache for comments already judged; a threshold only removes comments.
   - If threshold 1 does not reproduce 055's Super counts exactly (143 comments, TP 32, FP 93, dup 8, low 10, FN 42), STOP and report the difference.
   - From the score detail files of the threshold-1 run, join each finding's confidence with its outcome (tp, fp, duplicate, low). Report a table of counts: confidence 1 to 5 and VERIFY_FAILED against outcome.
4. Choose the operating threshold by this rule, written here before any result exists: the threshold with the highest overall dev F-score; on a tie, the higher threshold. This threshold becomes part of `verify-v1` and is used unchanged on Cal.com later. Record it in the code as a named constant.
5. Docs.
   - docs/decisions.md, decision 056, same shape as 049 to 055: what the verifier sees, the frozen prompt and its sha256, the threshold rule and the threshold it chose. Limits: the threshold is chosen on the same 40 dev pull requests it is measured on, so the dev F at that threshold is optimistic, and only the Cal.com run will say how it carries over; one run at temperature 0; one judge; n = 74. Rejected: asking the reviewer itself for a severity or confidence (it would change review-diff-v1 and mix two changes); dropping findings that depend on code outside the diff (that is the next job's context, not this one's).
   - docs/bench/verify-pass.md: for thresholds 1 to 5, overall and per repo: comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n. The confidence-against-outcome table. Verifier calls, VERIFY_FAILED, tokens, cost, latency per finding (median, max). Beside the chosen threshold's row, the five recorded tools' dev-only rows copied from docs/bench/baseline-diff.md.
   - CLAUDE.md: a short paragraph on the verifier and its result, with a pointer to 056.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
6. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before committing, confirm with `git diff --cached --name-only` that AGENTS.md is not staged and that nothing from ~/Projects/tracehound-bench is in the repo.
   - Commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: new files under packages/analyzer/src/review/, the CLI file that registers commands, new test files for the verifier, scripts/bench/, docs/, CLAUDE.md, FEEDBACK.md, runs/. Do not change packages/analyzer/src/bench/, the judge prompt, or review-diff-v1's prompt and code. Everything else is read-only, including AGENTS.md. No new dependencies.
- May write under ~/Projects/tracehound-bench. Do not modify or delete the existing review-diff-v1 outputs; write verifier outputs to a new folder, ~/Projects/tracehound-bench/reviews/verify-v1/. Nothing from ~/Projects/tracehound-bench is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, verify or score anything for cal_dot_com. Do not print Cal.com pull request titles.
- Do not print golden comment text, finding text or verifier reasons in your messages; counts only. You may read dev data to debug code, not to change the prompt after a run.
- Do not open ~/Projects/tracehound-ops, ~/Projects/Recall, ~/Projects/TraceHound-eval or ~/Projects/tracehound-heldout.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: Nemotron Super for the verifier and the unchanged judge for scoring, all through src/llm/client.ts. No other model, no sandbox. Total spend at most $2 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0 (including the fast-forward-only `git fetch origin main:main`), creating build/056-verify-pass, and pushing build/056-verify-pass.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on, whether you fast-forwarded main and how, and whether you switched;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the verifier prompt's sha256, and confirmation that it was not changed after the first benchmark run;
- whether threshold 1 reproduced 055's Super row exactly;
- for thresholds 1 to 5, overall: comments, TP, FP, duplicates, low, FN, precision, recall, F-score with n; per repo for the chosen threshold;
- the confidence-against-outcome table;
- the chosen threshold, and the rule applied;
- verifier calls, VERIFY_FAILED, tokens, cost, latency per finding (median, max);
- ledger total before and after, with verifier and judge spend separated;
- results of `pnpm test` and `pnpm typecheck` (counts of tests passed and failed);
- confirmation that nothing for Cal.com was read, fetched, verified or scored, or exactly what was touched if anything was;
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them;
- anything skipped or not done.
