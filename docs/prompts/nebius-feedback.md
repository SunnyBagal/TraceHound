Prompt: Nebius feedback log. Folder ~/Projects/TraceHound, fresh session, started by relay. Docs only: no model calls, $0. No decision number.

Context: a previous session stopped at step 0 because the checkout held one untracked file, AGENTS.md, which belongs to the owner. This prompt allows exactly that file and nothing else. Do not open any file under ~/Projects/tracehound-ops; the rules you need are in this prompt.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`. The current branch must be main, and HEAD must equal origin/main.
   - `git status --porcelain` must print exactly one line, `?? AGENTS.md`, or nothing. Any other line means STOP.
   - Do not stage, commit, move, edit, delete or ignore AGENTS.md. Leave it exactly as it is for the whole session.
1. Create branch docs/nebius-feedback. Save this prompt verbatim as docs/prompts/nebius-feedback.md.
2. FEEDBACK.md exists at the repo root. Keep everything already in it, and add new sections below the existing content.
3. Backfill it from records that already exist. Every number is computed from a file and carries its source path. Where something was not recorded, write "not recorded".
   a. API reliability, from the held-out run records in ~/Projects/TraceHound-eval/runs/heldout-eval/ and the spend ledger (find its path from CLAUDE.md and the harness code): calls per model, failed requests with their exact error strings, timeouts, the outage window, rate-limit responses.
   b. Latency per call per model if the records hold it: median, p95, max.
   c. Cost: tokens and cost per call, and whether the ledger agrees with the per-call figures.
   d. Model behaviour through the API, per model: calls to tools that do not exist, malformed tool arguments, truncation at max_tokens, anything specific to reasoning-on.
   e. Sandboxes: what docs/decisions.md and docs/build-log.md already record about the Contree spike and why it was cut. Quote the record; do not re-run anything.
   If you compute numbers with a script, keep the script out of the repo, or under runs/ (gitignored). Read the eval records only; write nothing into ~/Projects/TraceHound-eval.
4. Add a standing rule to CLAUDE.md: every session that makes a Nebius call or uses a Nebius sandbox ends by appending a dated entry to FEEDBACK.md. The entry gives what was called (model, endpoint or sandbox), counts, failures with exact error strings, latency if measured, anything in Nebius's docs or console that was wrong or missing, and what would have helped. Facts and counts first; opinions labelled as opinions. Sessions with no Nebius use add nothing. Do not edit AGENTS.md to match.
5. Commit and gate.
   - Stage only by explicit path: FEEDBACK.md, CLAUDE.md, docs/prompts/nebius-feedback.md and any other file you changed under docs/. Do not use `git add -A`, `git add .` or `git commit -a`.
   - Before committing, run `git diff --cached --name-only` and confirm AGENTS.md is not in it.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Do not gate through rebase --exec or hooks.
   - Commit, push, open a PR. This prompt is docs-only, so it gates on CI.
   - Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`. Do not end the session while CI is running.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: FEEDBACK.md, CLAUDE.md, docs/ and runs/. Everything else is read-only, including AGENTS.md. ~/Projects/TraceHound-eval and ~/Projects/tracehound-heldout are read-only.
- Do not open anything under ~/Projects/tracehound-ops.
- FEEDBACK.md holds counts, error strings and observations only. No API key, no task text, no patch text, no test names, no Recall source details, no Recall file names.
- Do not open ~/Projects/Recall. Do not read or catalogue Recall's real bugs.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md or anything under docs/eval/heldout*. Never merge the PR.
- No model calls, no sandbox use. Spend: $0 of Nebius credit.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what ran; losses recorded as losses.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the headline numbers from 3a–3d, each with its source path;
- the ledger path used, and whether the ledger agrees with the per-call figures (3c);
- every field written as "not recorded";
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them and is still untracked;
- anything skipped or not done.
