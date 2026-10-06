Proposed for Sunny. Use it only after PR #15 is merged and you have approved starting the finder.

Prompt: decision 051, finder phase 1: graph rules that emit hypotheses (no model). Folder ~/Projects/TraceHound, fresh session, started by relay. This prompt has decision number 051.

Read first: CLAUDE.md, docs/decisions.md (050 is the last), docs/eval/heldout-results.md, and sections 7 and 11 of ~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct6.md. Where the handoff and the repo disagree, the repo wins.

Steps
0. Check: the checkout is on main, clean, level with origin/main, and PR #15's merge is in the log. If not, STOP.
1. Create branch build/051-finder-rules. Save this prompt verbatim as docs/prompts/051-finder-rules.md.
2. Design note: write decision 051 in docs/decisions.md. It covers the hypothesis format (one narrow question, the rule that fired, the graph evidence ids, code excerpts with file and line ranges, the stated input) and the three first rule families: a route with no auth check; a worker using a payload field its producer doesn't send; a request value reaching an outbound fetch. State the limits up front: rules find only rule-shaped bugs, and S1 says the graph works on configured repos, not unseen ones.
3. Implement the rules in the analyzer as a pure function over the existing graph, with no model call. Add an analyzer CLI command that writes hypotheses as JSON to runs/ (gitignored).
4. Tests: unit tests per rule on small fixtures that you write yourself (each rule has positive and negative fixtures). Do not use Recall as a fixture.
5. Run the rules once on the Recall configuration the analyzer already has. Record in docs/build-log.md only the count of hypotheses per rule family. Do not write hypothesis text, file names, or any judgement of whether a hypothesis is a real bug into the repo. Do not compare the output with any list of known Recall bugs.
6. Gates: run the GIT_ environment check from section 11 (it must print nothing); the full analyzer and viewer suites including the Docker project; typecheck; viewer build; version guard (bump the analyzer version if the guard requires it). Allow one fix attempt per red gate. Commit, push, open a PR. Wait until CI for the pushed HEAD has completed.

Rules
- May touch in ~/Projects/TraceHound: packages/analyzer/src/ (the new finder rules and CLI wiring only), packages/analyzer/test/ (or the existing test folder), docs/, CLAUDE.md, runs/. Everything else is read-only, including the harness's repair and reproduce code.
- Never: move the eval-freeze-2 tag; edit docs/freeze.md, docs/eval/protocol.md, or anything under docs/eval/heldout*; merge the PR.
- Do not read or catalogue Recall's real bugs. Do not open Recall's issues. Do not edit ~/Projects/Recall. Read it only through the analyzer.
- The model never creates a proven edge and never files an issue. This phase makes no model calls.
- Spend: $0 of Nebius credit.
- No destructive git commands. No claims beyond what ran; losses recorded as losses.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT: the PR number and CI state on its HEAD; each gate's result; the rules implemented and their test counts; the hypothesis count per family on Recall; anything skipped or not done.

Two more rules:
- In any message, use the word "ambiguous" only when you mean relay should stop.
- Do not read anything under ~/Projects/tracehound-heldout or ~/Projects/TraceHound-eval.
