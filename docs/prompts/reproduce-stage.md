Prompt: reproduce stage for the findings pipeline. Fresh session in the TraceHound main checkout, on main with PR #9 merged, one branch build/reproduce off origin/main, one commit per phase, pushed after each. Decision 048.

Step 0
- Save this prompt verbatim to docs/prompts/reproduce-stage.md and commit it.
- Read CLAUDE.md, decisions 041, 043 and 045–047, docs/freeze.md, and the harness run, task, loop and evaluate code. Write every contradiction with this prompt to docs/build-log.md. If one blocks a phase, STOP AND REPORT.
- At the start of every phase re-read the Rules block. At the end of every phase append to docs/build-log.md: what was done, gate results, spend.
- Read-only: from docs/eval/agent-v6-dev-2026-10-04/, report graph tool calls per run for the Nano batch and the Super probe.

Phase 1: evaluation protocol, docs only
1. Write docs/eval/protocol.md with exactly the text in the Protocol block below. Commit.

Phase 2 (decision 048): the reproduce stage
What it is: given a claim that a repo misbehaves, an agent writes one new test; a deterministic check, independent of the agent, decides whether that test reproduces the claim at the base commit.
2. Claim format: JSON with id, repo profile, title, claim text (observed and expected behaviour), optional evidence (file:line list), optional seed patch (for testing only).
3. Its own script next to evaluate.ts. Sandbox setup exactly as the repair harness does it: seed, setup commands, squashed base, network off.
4. Agent: the existing loop and tools with a new prompt file, harness/prompts/repro-v1.md. It is told to add exactly one new test file asserting the expected behaviour in the claim, to change no existing file, and that "the test passes, so the claim does not reproduce" is a valid and wanted outcome.
5. Check, in a fresh sandbox at the base with only the new file added:
   a. the diff adds exactly one file, it matches the repo's test-file pattern, and nothing else changed;
   b. the file runs, and at least one of its test cases executes and fails on an assertion. A file that fails to load, a type or import error, zero collected tests, or a timeout is rejected;
   c. the same cases fail on a second run;
   d. every test that passed at baseline still passes (the decision 043 gate, unchanged).
6. States: REPRODUCED; NOT_REPRODUCED (no qualifying file, or the test passes); REJECTED, naming the failed check; FAILED for infrastructure errors, including model request timeouts.
7. One record per run under runs/: claim, test file text, each check's result, state, steps, tokens, cost, end reason.
8. Tests with scripted agents, no model: a correct failing test → REPRODUCED; a passing test → NOT_REPRODUCED; an import error, a file outside the pattern, an edit to an existing file, and a flaky test → REJECTED.
If bun's report can't separate an assertion failure from a load error, STOP AND REPORT.

Phase 3: measure on the dev seeds
9. Eight claims under eval/claims/: the issue text of each of the 4 recall-dev tasks, once with that task's seed patch (bug present) and once without it (bug absent, control).
10. Run all 8 on Nano and on Super (16 runs), concurrency 1.
11. Oracle check, measurement only: for every REPRODUCED test in a seeded case, apply that task's oracle patch and run the test. Passes → true reproduction. Still fails → false reproduction.
12. At most one change to repro-v1.md, then re-run all 16. Log the change and both tables. Stop after that whatever the result.

Phase 4: reproduced finding to repair task
13. A command that turns a REPRODUCED record into a task folder the repair harness accepts (issue text = the claim, repro = the test), written under runs/, not eval/tasks/.
14. For each true reproduction from the final Phase 3 batch, at most 4: run the frozen repair agent once on Nano against the emitted task. Record the state.

Phase 5
15. Open one PR. Don't merge it.

Protocol block
# Evaluation protocol (written before any held-out task exists in this repo)
- Code: tag eval-freeze-2. Tasks: 8 held-out seeded tasks on Recall 57d920e, written outside this repo, each validated oracle → RESOLVED and noop → UNRESOLVED.
- Arms: graph-on (context packet injected, graph tools offered) and graph-off.
- Models: Nano and Super, with the cost limits in docs/freeze.md. Both are always reported together.
- Repeats: 5 per task, arm and model, 160 runs. Concurrency 1, nothing else running on the machine.
- Canary: the oracle patch for one task runs before and after each batch. If either is not RESOLVED, the batch is void.
- Void runs: a run that ends in an infrastructure error (network, model request timeout, sandbox failure) or carries a baseline-anomaly flag is void and re-run once. Void runs are listed, not hidden.
- Measures, per arm and model, with n beside every figure: resolved; end reason; steps; tokens; cost; step of first fault-file read; graph tool calls.
- No significance claims. Dev results are never pooled with held-out results.
- Expectation stated in advance: in the dev runs the agent found the fault file every time in both arms, so no difference in resolve rate is expected on this repo.
- Run records are archived with the results after a secrets check.

Gates, after every phase: full analyzer and viewer suites including the Docker project, typecheck, viewer build, version guard; push; CI green. One fix attempt per red gate. Any new test file that starts Docker goes in the Docker project list.

Stop early and report if: the same step fails twice; a gate is still red after one fix attempt; a spend cap is hit; a phase needs a path outside the may-touch list; anything is irreversible or ambiguous.

Rules
- May touch: new reproduce-stage code and tests in the harness, harness/prompts/repro-v1.md, eval/claims/, the Docker test-file list, docs/, CLAUDE.md.
- Frozen: harness/prompts/agent-v5.md, the repair agent's behaviour and tool set, verdict logic, the runner, eval/tasks/, analyzer detectors, the analyzer version, snapshots/, changesets/, the viewer source. A parameter that selects the prompt file is allowed if the default is unchanged and a test shows a repair run's first message is byte-identical to before. Existing harness tests must pass unmodified.
- Test file text written by the agent stays in runs/ (gitignored). Docs get states and counts only.
- No changes or pushes to Recall or any other repo.
- Never create, read or look for held-out evaluation tasks. Don't catalogue Recall's existing bugs in this repo.
- Nothing else runs on the machine during a gate or a model batch.
- Spend: $3.00 of new Nebius spend for the whole prompt, read from the ledger before each model step.
- Before every gate this must print nothing: env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'. Never gate via rebase --exec or hooks.
- No destructive git commands. No claims beyond what ran; record losses as losses.

STOP AND REPORT at the end: contradictions from step 0; graph tool calls for the Nano and Super dev batches; how an assertion failure is told apart from a load error; the scripted test results; the Phase 3 tables per model (per claim: seeded or control, state, failed check if any, steps, cost); true and false reproductions; control cases that came out REPRODUCED; the one prompt change with before and after; Phase 4 states; PR and CI URLs; ledger total; everything not done.
