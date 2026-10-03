Continue docs/prompts/agent-v6.md with the amendments below. They override the original where they differ. Save this message verbatim to docs/prompts/agent-v6-amendment-1.md and commit it first. If this is a fresh session, read docs/prompts/agent-v6.md and docs/build-log.md before anything else.

Decision on the red gate: option 2, plus keeping the run record. Not option 1.

A. Fix the gate. May now also touch: the analyzer test config and test/harness-recall.test.ts.
1. Make the Docker test files run one at a time, never in parallel with each other. Don't raise timeouts, add retries or skip tests.
2. Make the Recall harness tests keep their run record when they fail, with its path in the failure message.
3. Run the full analyzer suite three times in a row with nothing else running. All three must be green. If any is red, STOP AND REPORT with the kept run record: which Recall tests failed and how.
4. In docs/build-log.md and the decision 047 text, state the cause as unproven unless a kept record shows it.

B. Runner validity flag
5. The runner's report gains, per run: baseline tests passed / total. A run whose baseline passed-count differs from the most common count for that task in the batch is flagged baseline-anomaly in the JSON and the table. The verdict is not changed.

C. Then Phases 4 and 5 of the original prompt, with these changes
6. Nothing else runs on the machine during a gate or a model batch, including your own tests.
7. Super probe: model nvidia/nemotron-3-super-120b-a12b, same step and token budgets as Nano. Set the per-task cost limit to $0.60 for the probe only, so the step and token budgets are what bind. Record which limit ended each run. Stop the probe if its total passes $3.00.
8. The spend cap for the whole prompt is now $4.00 of new Nebius spend.
9. Phase 5 also: update the CLAUDE.md line that reserves Super; record per-model cost limits in docs/freeze.md; remove the three scratch worktrees with git worktree remove (no --force) and the branch wip/agent-v6-phase2 with git branch -d. If either refuses, leave it and report.

Everything else in the original Rules block stands.

STOP AND REPORT as in the original, plus: the three gate runs from step 3; what changed in the test config; any baseline-anomaly flags; which limit ended each Super run.
