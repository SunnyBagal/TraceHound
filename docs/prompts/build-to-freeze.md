Prompt: build TraceHound to the evaluation freeze in one run. Fresh session in the TraceHound main checkout, one branch build/to-freeze off origin/main, one commit per phase, pushed after each phase. Decisions 044–046 are assigned below.

Step 0, before anything else
- Save this prompt verbatim to docs/prompts/build-to-freeze.md and commit it.
- Read CLAUDE.md, decisions 034, 037, 041, 042, 043 and the harness and agent code. Write every contradiction with this prompt to docs/build-log.md. If a contradiction blocks a phase, STOP AND REPORT.
- At the start of every phase, re-read the Rules block in docs/prompts/build-to-freeze.md and docs/build-log.md. At the end of every phase, append to docs/build-log.md: what was done, gate results, spend.

Fixed facts: Recall is the evaluation repo, branch testable-baseline, commit 57d920e, backend in recall-backend/, profile configs/recall.profile.json, existing smoke tasks eval/tasks/recall-smoke-trending and recall-smoke-baseline-failing, the per-test regression gate from decision 043, graph snapshot under eval/snapshots/ at analyzer 0.10.0. Model: Nano, agent-v4 defaults.

Phase 2 (decision 044): four seeded dev tasks on Recall
6. Four tasks under eval/tasks/, kind "dev". Each has: a seed patch (one small bug, each in a different backend file, none in linkDetector.ts), an issue text written as a user's bug report with no file or function names, a reproduction test kept out of the agent's sandbox view, and an oracle fix patch.
7. In at least two tasks the reported symptom is in one component and the fault is in another, and one of those crosses the queue (symptom seen from the API, fault in the worker's processContent).
8. Validate each with scripted patches, no model: oracle → RESOLVED, noop → UNRESOLVED. A task that fails either is replaced, not adjusted.

Phase 3 (decision 045): graph-on arm, agent-v5
9. Graph on: the first message includes the context packet from the existing context tool for the issue text, and the graph tools stay available. Graph off: neither. Step, token and time budgets are identical; the packet counts against the token budget. Run records store the arm, whether the packet was injected, packet size, and the number of graph tool calls.
10. Baseline: 4 dev tasks x 2 arms, one run each. Then at most two tuning rounds, one change per round, to the agent's prompts only, re-running all 8. Log each round's change and full before/after table in docs/build-log.md. Stop after two rounds whatever the result. Never tune so that one arm is favoured by wording the other doesn't get.

Phase 4 (decision 046): evaluation runner
11. One command that takes a tasks directory (which may be outside this repo), arms, and repeats, runs everything, and writes results JSON plus a markdown table: per task and arm the state, steps, tokens, cost, wall time, files opened, graph tool calls; then per-arm totals. No significance claims; print the sample size beside every total.
12. Test it on the dev tasks with repeats 1.

Phase 5: freeze
13. Write docs/freeze.md: analyzer version, agent version, prompt file hashes, harness image tag, model id and settings, the per-test gate granularity on Recall. Tag the final commit eval-freeze. Open one PR for the branch. Don't merge it.

Gates, after every phase: full analyzer and viewer suites including the Docker + network files, typecheck, viewer build, version guard; push; CI green. One fix attempt is allowed per red gate.

Stop early and report if: the same step fails twice; a gate is still red after one fix attempt; a spend cap is hit; a phase needs a path outside the may-touch list; anything is irreversible or ambiguous.

Rules
- May touch: harness and agent code and their tests, repo profiles, eval/tasks/, docs/, CLAUDE.md. Not analyzer detectors, the analyzer version, snapshots/, changesets/, the viewer source.
- No changes or pushes to Recall or any other repo.
- Never create, read or look for held-out evaluation tasks. Don't catalogue Recall's existing bugs in this repo, and don't build a dev task on one.
- Spend: $1.50 of new Nebius spend for the whole prompt, read from the ledger; Nano only.
- Before every gate, this must print nothing: env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'. Never gate via rebase --exec or hooks.
- No destructive git commands. No claims beyond what ran; record losses as losses.

STOP AND REPORT at the end: contradictions from step 0; per phase what was built and its gate results; the four dev tasks in one line each with their validation results; the baseline and each tuning round's table for both arms; the runner's output on the dev tasks; docs/freeze.md contents; PR and CI URLs; ledger total; everything not done.
