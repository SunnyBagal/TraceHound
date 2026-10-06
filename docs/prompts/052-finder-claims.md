Prompt: decision 052, finder phase 2a: hypotheses become reproduce claims (no model). Folder ~/Projects/TraceHound, fresh session, started by relay. This prompt has decision number 052.

Read first: CLAUDE.md, docs/decisions.md (051 is the last; read 048 and 051 closely), packages/analyzer/src/finder/, and packages/analyzer/src/harness/reproduce.ts (ClaimSpec and how a claim is shown to the agent). Do not open any file in ~/Projects/tracehound-ops/briefs/; the rules you need are in this prompt. Where this prompt and the repo disagree, the repo wins.

Steps
0. Get onto an up-to-date main.
   - Run `git status --porcelain`. If it prints anything, STOP.
   - Run `git fetch origin`, then `git checkout main`.
   - Update main to origin/main with a fast-forward-only pull. If a fast-forward is not possible, STOP.
   - Check: on main, clean, HEAD equal to origin/main, and the PR #16 merge commit (075d645) in the log. If any check fails, STOP.
   - Leave the local branch build/051-finder-rules alone. Do not delete it.
1. Create branch build/052-finder-claims. Save this prompt verbatim as docs/prompts/052-finder-claims.md.
2. Write decision 052 in docs/decisions.md. It covers:
   - how a hypothesis becomes a claim for the reproduce stage (048);
   - Form A: question and stated input as the claim, with file:line pointers in `evidence`;
   - Form B: the same plus the hypothesis's code excerpts;
   - which Recall commit the claims target, and why. The reproduce stage and configs/recall.profile.json work on testable-baseline @ 57d920e. The finder's phase-1 run was on 5d2165a. Claims must be made from a finder run on the same commit the reproduce stage will use.
3. Add a converter, either `tracehound find --claims <dir>` or a sibling command, your choice, recorded in 052. For each hypothesis it writes one Form A and one Form B claim file under runs/ (gitignored). Each file must parse with ClaimSpec, with baseSha set to the full sha of the commit the finder ran on and the profile set to the repo's existing Recall profile. Claim ids are derived from the hypothesis id. The claim text must say only what the hypothesis says; add no guesses about impact.
4. Form B needs excerpts in a claim. Add one optional field, `excerpts` (file, start line, end line, lines), to ClaimSpec, and render it to the agent only when present. A claim without `excerpts` must produce a byte-identical agent prompt and identical behaviour to today. Add a test that proves this on an existing eval/claims file. Do not edit harness/prompts/repro-v1.md. If Form B cannot be done without changing that prompt file, STOP and report instead.
5. Unit tests for the converter on the finder's own test fixtures (not Recall): each family yields a Form A and a Form B claim that parse, and Form A differs from Form B only by `excerpts`.
6. Run the finder and the converter once on a temporary clone of the public Recall remote at testable-baseline 57d920e, with configs/recall.tracehound.json (the same recipe as changesets/index.json). Do not touch ~/Projects/Recall. In docs/build-log.md record only the hypothesis count per family and the number of claim files written. Do not open or print hypothesis or claim text. Write no file names from Recall into the repo. Do not compare anything with any list of known bugs. Delete the temporary clone afterwards.
7. Gates:
   - Before every gate, run `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`. It must print nothing.
   - Run: the full analyzer and viewer suites including the Docker project (`TRACEHOUND_NETWORK_TESTS=1 pnpm test`); `pnpm typecheck`; the viewer build; the version guard.
   - Do not gate through rebase --exec or hooks. Allow one fix attempt per red gate.
   - Commit, push, open a PR. Wait until CI for the pushed HEAD has completed.

Rules
- May touch in ~/Projects/TraceHound:
  - packages/analyzer/src/finder/ and its CLI wiring in packages/analyzer/src/bin.ts;
  - packages/analyzer/src/harness/reproduce.ts, only for the optional `excerpts` field and its rendering in step 4;
  - packages/analyzer/test/, docs/, CLAUDE.md and runs/.
  - Everything else is read-only, including harness/prompts/ and the repair agent.
- Never: move the eval-freeze-2 tag; edit docs/freeze.md, docs/eval/protocol.md, or anything under docs/eval/heldout*; merge the PR.
- Do not read or catalogue Recall's real bugs. Do not open Recall's issues. Do not edit ~/Projects/Recall. Do not read anything under ~/Projects/tracehound-heldout, ~/Projects/TraceHound-eval or ~/Projects/tracehound-ops.
- Make no model calls in this phase. Do not run the reproduce stage. The model never creates a proven edge and never files an issue.
- Agent-written or hypothesis text stays in runs/. Docs get states and counts only.
- Spend: $0 of Nebius credit.
- No destructive git commands: no forced pushes, no hard resets, no branch deletion, no history rewriting. The only git state changes allowed in step 0 are fetch, checkout of main and the fast-forward-only pull.
- No claims beyond what ran; losses recorded as losses.
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT:
- the result of each step 0 check, and main's HEAD sha after the update;
- the PR number and the CI state on its HEAD;
- each gate's result;
- the converter command, and the test counts per new test;
- the result of the byte-identical prompt test;
- the Recall commit used, and the hypothesis count per family and the claim file count from step 6;
- anything skipped or not done.
