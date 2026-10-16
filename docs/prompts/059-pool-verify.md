Pooled candidates filtered by the context verifier, pool-verify-v1. Folder ~/Projects/TraceHound, fresh session, started by relay. Decision number 059. Spend: at most $3 of Nebius credit, verifier and judge calls together (expected well under $1).

Context: on the 40 dev pull requests (n = 74), review-diff-v1 Super (decision 055) has the best recall, 43.2% (32/74), at precision 25.6%, F 32.2%. verify-ctx-v1 (decision 058) checks each finding with repository context and answers keep or drop. On review-diff-v1's findings it kept 22 of 32 TPs but only 31 of 93 FPs, so it separates true from false findings. But it starts from only 32 TPs and loses about a third of them, so F reached only 32.8%. review-ctx-v1 (decision 057) finds some defects that review-diff-v1 misses. This job tests one change: widen the candidate pool to review-diff-v1's findings plus review-ctx-v1's findings that review-diff-v1 did not already make, then filter the pool with verify-ctx-v1, unchanged. No new prompt, no new reviewer run, no change to any existing reviewer, verifier or the judge.

Cal.com is the test set. Nothing in this job reads, fetches, clones, reviews or scores anything for Cal.com.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` must print nothing.
   - If the current branch is main: run `git merge --ff-only origin/main`. If it fails, STOP.
   - If the current branch is not main: run `git fetch origin main:main` (no plus sign). If it fails, STOP. Then `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from.
   - The current branch must now be main, and HEAD must equal origin/main. `git status --porcelain` must still print nothing.
   - `grep -c '^## 058' docs/decisions.md` must print 1, and `grep -c '^## 059' docs/decisions.md` must print 0.
   - `grep -c '^  packages/action:' pnpm-lock.yaml` must print 1 (PR #28 is merged). After any `pnpm install` in this job, `git status --porcelain` must still print nothing; if pnpm rewrites the lockfile, STOP.
   - `git -C ~/Projects/tracehound-bench/golden rev-parse HEAD` must print 3f2c8ab794b4ed71c099cbf0a7670555e90906dc. These must exist for all 40 dev pull requests: the inputs under ~/Projects/tracehound-bench/prs/, the four bare repos under ~/Projects/tracehound-bench/repos/ with their .heads.json, the review-diff-v1 Super reviews, the review-ctx-v1 Super reviews, and the verify-ctx-v1 verdicts under ~/Projects/tracehound-bench/reviews/verify-ctx-v1/super/<repo>/verdicts/.
   - `VERIFY_CTX_PROMPT_SHA256` in packages/analyzer/src/review/verify-ctx.ts must evaluate to 75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70 (the pinned test checks this; run that test file).
   - `gh auth status` must succeed.
1. Create branch build/059-pool-verify. Save this prompt verbatim as docs/prompts/059-pool-verify.md.
2. Pre-registered rules. Write these into docs/decisions.md (decision 059, Choice) before any model call, and do not change them after the first verifier call:
   - Pool rule: for each pull request, the pool is every review-diff-v1 Super finding, plus every review-ctx-v1 Super finding that does not agree with any review-diff-v1 finding of the same pull request. "Agree" is 058's rule, unchanged: same path (normalised as in scripts/bench/agree-diff-ctx.ts), both lines non-null, lines within 3 of each other. A review-ctx-v1 finding with a null line is added to the pool. These added findings are the "ctx-only" findings.
   - Verdict rule: verify-ctx-v1 unchanged (code, prompt sha256 75703fc6…, model, reasoning on, temperature 0, per-finding context and budget). A finding is kept if and only if its valid verdict is keep. An invalid reply after one retry is kept and counted as VERIFY_FAILED.
   - Reuse rule: review-diff-v1 findings keep their 058 verdicts; they are not sent to the verifier again. Before reuse, each 058 verdict must match its review-diff-v1 finding by path, line and body, for all 143 findings. If any does not match, STOP. Only ctx-only findings get new verifier calls.
   - Adoption rule: pool-verify-v1 is adopted as the reviewer for the freeze and the product only if its F-score on the 40 dev pull requests is at least 35.0% (the same bar as 058). Otherwise it is recorded as a loss and review-diff-v1 stays the default.
3. The pool builder, scripts/bench/pool-verify.ts, deterministic, no model, counts only on stdout. Import the agreement rule from scripts/bench/agree-diff-ctx.ts, or move it unchanged into a shared module both scripts import; do not change its behaviour. It has two modes:
   a. `build`: for each dev pull request, write the ctx-only findings as a review file in the neutral format to ~/Projects/tracehound-bench/reviews/pool-ctx-only/super/<repo>/, and the full pool (review-diff-v1 plus ctx-only) to ~/Projects/tracehound-bench/reviews/pool-raw/super/<repo>/. Check the reuse rule and STOP on any mismatch.
   b. `merge`: after the verifier has run on the ctx-only files, write the kept pool to ~/Projects/tracehound-bench/reviews/pool-verify-v1/super/<repo>/: review-diff-v1 findings whose 058 verdict is kept, followed by ctx-only findings that are kept. Order within a file: review-diff-v1 first, then ctx-only, each in its original order.
   c. Tests (invented review files in a temp dir, no network, no dataset text): pool rule including the null-line case and the 3-line boundary; reuse check, a mismatch stops; merge order; determinism (same input, same output byte for byte).
4. Freeze commit. After the gates in step 7 pass, commit the step 2 rules in docs/decisions.md, scripts/bench/pool-verify.ts, any shared module and the tests, then push. Message: "pool-verify-v1: pre-registered rules and pool builder (059)". Do this before any verifier call. Later commits must not change the step 2 text, the pool builder's behaviour, or anything under packages/analyzer/src/review/.
5. Run.
   a. `node scripts/bench/pool-verify.ts build`.
   b. Run `pnpm tracehound verify-ctx` (the existing command, unchanged) over each repo's pool-ctx-only files, with --out ~/Projects/tracehound-bench/reviews/pool-verify-v1/super/<repo>/ctx-only-verdicts and --kept pointing at a scratch directory under the same repo folder. Stop before anything that would take the job past $3 on the ledger.
   c. `node scripts/bench/pool-verify.ts merge`.
   d. Score with `tracehound bench score` and `bench-judge-v1`, unchanged, as their own sets (do not reuse earlier judge matches): pool-raw/super and pool-verify-v1/super.
6. Docs.
   - docs/decisions.md, decision 059, same shape as 055 to 058: the pre-registered rules (copied as written in step 2), the pool sizes, the results, and whether the adoption rule was met. Limits: one run at temperature 0; one judge; n = 74; reused 058 verdicts were produced in a separate run; this is the fourth reviewer variant compared on the same dev set, so the best of them is favoured by selection and only the Cal.com run can confirm it. Rejected: running review-diff-v1 again N times and pooling (costs N reviewer runs per pull request); re-verifying review-diff-v1 findings (058's verdicts already exist from the same frozen verifier).
   - docs/bench/pool-verify.md: rows for review-diff-v1, review-ctx-v1, verify-ctx-v1, agree-diff-ctx (copied from docs/bench/ctx-verify.md), pool-raw and pool-verify-v1, all Super, overall and per repo: comments, TP, FP, dup, low, FN, JUDGE_FAILED, precision, recall, F with n. A per-pull-request TP and FP table (golden index, not titles). Pool statistics: review-diff-v1 findings, review-ctx-v1 findings, agreed (dropped from the pool), ctx-only added, null-line ctx-only. Verifier statistics for the ctx-only findings: in, kept, dropped, VERIFY_FAILED, retries. Product cost: for one pull request running the whole pipeline (review-diff-v1 + review-ctx-v1 + verify-ctx-v1 on the pool), the median and max of summed cost and summed wall time, taken from the existing reviewer and verifier records (no new calls). Then the five recorded tools' dev-only rows, copied from docs/bench/baseline-diff.md.
   - CLAUDE.md: a short paragraph on pool-verify-v1 and its result, pointing to 059.
   - FEEDBACK.md: the dated Nebius entry the standing rule requires.
7. Commit and gate.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Then run `pnpm test` and `pnpm typecheck` in a plain shell. Both must pass.
   - Stage only by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`. Before each commit, confirm with `git diff --cached --name-only` that nothing from ~/Projects/tracehound-bench is in the repo, that pnpm-lock.yaml is not staged, and that no Codex-lane path or AGENTS.md is staged.
   - Commit the results on top of the freeze commit, push, open a PR. Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`; if `gh run watch` drops, confirm with `gh run view <id>`.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: scripts/bench/ (new files; agree-diff-ctx.ts only to move its rule unchanged into a shared module), new test files, docs/ (except docs/action/ and docs/demo/), CLAUDE.md, FEEDBACK.md, runs/. Do not change anything under packages/analyzer/src/ (no new review or verifier code is needed), the judge prompt, or any existing prompt. Do not touch AGENTS.md, pnpm-lock.yaml, .github/, packages/action/, docs/action/ or docs/demo/. No new dependencies.
- May write under ~/Projects/tracehound-bench. Do not modify or delete existing reviews, verdicts, inputs, repos or scores. Nothing from it is copied into the repo, a commit, the PR or your messages, except counts.
- Cal.com is blind. Never open, print, grep, fetch, clone, review or score anything for cal_dot_com. Do not print Cal.com pull request titles. Do not list directories that contain Cal.com files; use the dev repo names directly.
- Do not print golden comment text, review comment text, verifier reasons or repository source from the benchmark repos in your messages; counts only. You may read dev data to debug code, not to change the rules after the first verifier call.
- Do not open ~/Projects/tracehound-ops, ~/Projects/tracehound-brain, ~/Projects/Recall, ~/Projects/TraceHound-eval, ~/Projects/tracehound-heldout or ~/Projects/TraceHound-codex.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md, anything under docs/eval/heldout*, or any file under harness/prompts/. Never merge the PR.
- Model calls: Nemotron Super through the existing verify-ctx command, and the unchanged judge for scoring, all through src/llm/client.ts. No other model, no sandbox. Total spend at most $3 by the ledger.
- Tests never hit the network.
- The only branch operations allowed are those in step 0, creating build/059-pool-verify, and pushing build/059-pool-verify.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; a number that looks bad is reported as it is.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- After CI has completed, post the full STOP AND REPORT as a comment on your PR: write it to a file under runs/ and run `gh pr comment <number> --body-file <that file>`. It holds counts only. Then make the same STOP AND REPORT your final message. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on, whether you fast-forwarded main and how, and whether you switched;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the freeze commit's sha and push time, the time of the first verifier call, and `git diff --stat <freeze sha> HEAD` for scripts/bench/ and packages/analyzer/src/review/ (the latter must be empty);
- the reuse check: 143 of 143 matched, or what did not;
- pool statistics: review-diff-v1 findings, review-ctx-v1 findings, agreed, ctx-only added, null-line ctx-only;
- overall and per repo, for review-diff-v1, verify-ctx-v1, pool-raw and pool-verify-v1 (all Super): comments, TP, FP, duplicates, low, FN, JUDGE_FAILED, precision, recall, F-score with n;
- whether the adoption rule was met (pool-verify-v1 F at least 35.0%), stated as yes or no;
- verifier statistics for the ctx-only findings: in, kept, dropped, VERIFY_FAILED, retries;
- product cost per pull request for the whole pipeline: median and max of summed cost and summed wall time;
- ledger total before and after, with verifier and judge spend separated;
- results of `pnpm test` and `pnpm typecheck` (counts of tests passed and failed);
- confirmation that nothing for Cal.com was read, fetched, cloned, reviewed or scored, or exactly what was touched if anything was;
- the files in each commit (`git show --stat`), with confirmation that pnpm-lock.yaml, AGENTS.md and no Codex-lane path is among them;
- anything skipped or not done.
