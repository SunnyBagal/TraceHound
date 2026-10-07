Prompt: Disclosure of who saw Recall's real bugs. Folder ~/Projects/TraceHound, fresh session, started by relay. Docs only: no model calls, $0. Decision number 053.

Context: a disclosure was parked outside this repo until Recall's known bugs were fixed in production. They are fixed. This job moves the disclosure into docs/decisions.md as decision 053 and adds what happened on 7 October. The entry records who saw what and when. It never describes a bug.

A previous session stopped at step 0 because the checkout was on the local branch docs/nebius-feedback (whose tip equals origin/main) instead of main. Step 0 now lets you switch to main and fast-forward it.

Steps
0. Checks. If any check fails, STOP.
   - Run `git fetch origin`.
   - `git status --porcelain` must print exactly one line, `?? AGENTS.md`, or nothing. Any other line means STOP.
   - If the current branch is not main, run `git switch main`. If that fails, STOP. Do not push, rename or delete the branch you switched away from; leave it as it is.
   - Run `git merge --ff-only origin/main`. If it fails, STOP.
   - The current branch must now be main, and HEAD must equal origin/main, which must be 06de1a1 or a descendant of it (`git merge-base --is-ancestor 06de1a1 origin/main`).
   - Run `git status --porcelain` again; it must still print only `?? AGENTS.md` or nothing.
   - Do not stage, commit, move, edit, delete or ignore AGENTS.md. Leave it exactly as it is for the whole session.
   - `grep -n '^## 053' docs/decisions.md` must print nothing.
1. Create branch docs/053-disclosure. Save this prompt verbatim as docs/prompts/053-disclosure.md.
2. Read exactly one file outside this repo: ~/Projects/tracehound-ops/briefs/pending-disclosures.md. Open nothing else under ~/Projects/tracehound-ops. Do not edit that file. If it is missing or empty, STOP.
3. Append decision 053 to docs/decisions.md, in the same shape as decisions 049 to 052 (Context, Choice, Limits, Rejected). Title: "053 · Disclosure: who saw Recall's real bugs, and what finder results on Recall may claim".
   a. From the parked file, take only facts of this kind: who or which session saw something, when, and what kind of thing it was (a list, a description, a diff, a count). Where the parked file gives no date or time, write "not recorded".
   b. Leave out everything that describes a bug: route names, file names, symbols, symptoms, bug categories, test names, and any wording from which a reader could work out where a bug is. Refer to the bugs only as "the three bugs fixed in Recall PR #1 (merge 3e39129) and PR #2 (merge 20ac149)". If a parked sentence cannot be kept without such detail, drop the sentence and count it for the report.
   c. Add these facts, labelled "supplied by the owner's chat, not checkable from this repo":
      - There were three live bugs, not two. PR #1 fixed two and PR #2 fixed the third. All three fixes are deployed, and the owner confirmed production himself.
      - Both Recall PRs were written by a separate cloud session, with neutral titles and commit messages.
      - The chat assistant session that wrote the main lane's prompts until 7 October 16:50 IST saw the descriptions of all three bugs and both fix diffs. No prompt written by that session, or from its handoff files, is blind to them.
      - The chat session that started on 7 October at 16:54 IST and wrote this prompt read a handoff that gives away the area of one bug and lists follow-up items from the fixes. It did not open either Recall PR. It read Recall commit hashes and dates only. It is not blind either.
      - Recall commit facts, from hashes and dates only: PR #1's first commit is ed5fd0e (6 October 20:22 UTC); merge 3e39129 is 7 October 02:09 IST; merge 20ac149 is 7 October 03:08 IST; Recall main is 20ac149. testable-baseline is still 57d920e (2 October). Neither merge is an ancestor of 57d920e. 57d920e is not an ancestor of main; their merge base is 9113ced.
   d. Add these facts from this repo, and check each one with git before writing it: finder-rules@1 (decision 051) merged in 075d645 and the claims code (decision 052) merged in 5aa1070. Give both merge times from `git log`. State whether each is earlier than Recall commit ed5fd0e.
   e. Choice, in these terms:
      - Every finder, reproduce or repair result on Recall's real bugs is reported with a pointer to decision 053.
      - Any change to the finder's rules, the claim text or the reproduce prompt made after 7 October counts as made with knowledge of the bugs, whoever writes it.
      - Results on the three bugs are reported as counts ("N of 3"), never as bug descriptions.
   f. Limits: the claim that all three bugs exist at 57d920e comes from the owner and has not been checked in this repo; the fixes were written on Recall main, not on testable-baseline.
   g. Rejected: (a) leaving the disclosure outside the repo, where readers of the results cannot see it; (b) describing the bugs in the entry, which would end blindness for every later session that reads this repo.
4. CLAUDE.md, three small edits and nothing else:
   - In the "Finder phase 1" paragraph, after the sentence that says sessions that build the finder never see Recall's real bug list, add one sentence pointing to decision 053.
   - In the "Second repo, Recall" and "Recall on the repair harness" paragraphs, where Recall `main` is given as `9113ced`, say that main was `9113ced` when those checks were made and is `20ac149` since 2026-10-07. Do not change any snapshot commit or the pinned `57d920e`.
   - Do not edit AGENTS.md to match.
5. FEEDBACK.md: the second line says "Facts only", and the newest entry has one line labelled as opinion. Change only that opening sentence so that it matches the standing rule in CLAUDE.md (facts and counts first, opinions labelled as opinions). Change nothing else in the file.
6. Commit and gate.
   - Stage only by explicit path: docs/decisions.md, docs/prompts/053-disclosure.md, CLAUDE.md, FEEDBACK.md. Do not use `git add -A`, `git add .` or `git commit -a`.
   - Before committing, run `git diff --cached --name-only` and confirm it lists exactly those four files.
   - Run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing. Do not gate through rebase --exec or hooks.
   - Commit, push the docs/053-disclosure branch only, open a PR. The PR title and body follow rule 3b: no bug detail.
   - Wait until CI for the pushed HEAD has completed, using `gh run list --commit <sha>` and `gh run watch <id>`. Do not end the session while CI is running.
   - If CI is red, read the log with `gh run view <id> --log-failed`, make one fix attempt within the may-touch paths, push a new commit and wait again. If it is red a second time, STOP and say so plainly.

Rules
- May touch in ~/Projects/TraceHound: docs/decisions.md, docs/prompts/053-disclosure.md, CLAUDE.md, FEEDBACK.md. Everything else is read-only, including AGENTS.md. The only branch operations allowed are those in step 0, creating docs/053-disclosure, and pushing docs/053-disclosure.
- Under ~/Projects/tracehound-ops, read briefs/pending-disclosures.md and nothing else. Write nothing there.
- Do not open ~/Projects/Recall. Do not open Recall PR #1 or #2, their diffs, their commits or the Recall repository on GitHub. Do not read or catalogue Recall's real bugs.
- No bug detail anywhere you write: not in docs/decisions.md, the commit message, the PR, or your final message. This covers anything you read in the parked file.
- Never move the eval-freeze-2 tag. Never edit docs/freeze.md, docs/eval/protocol.md, docs/eval/heldout-results.md or anything under docs/eval/heldout*. Never merge the PR.
- No model calls, no sandbox use. Spend: $0 of Nebius credit. Add no FEEDBACK.md entry.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- No claims beyond what was read or checked; "not recorded" where the record is silent.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, including the branch you started on and whether you switched and fast-forwarded main;
- the PR number, its head sha, and every CI workflow run for that sha (name, run id, conclusion);
- the line range of decision 053 in docs/decisions.md;
- how many parked sentences were dropped under 3b (a count only, no content);
- every field written as "not recorded";
- for 3d: both merge times, and whether each is earlier than ed5fd0e;
- the exact before and after text of each CLAUDE.md edit and of the FEEDBACK.md sentence;
- the files in the commit (`git show --stat HEAD`), with confirmation that AGENTS.md is not among them and is still untracked;
- anything skipped or not done.
