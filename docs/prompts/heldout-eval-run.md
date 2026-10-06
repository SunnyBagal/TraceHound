Prompt: run the held-out evaluation. Fresh session in ~/Projects/TraceHound-eval, a detached worktree at eval-freeze-2 (b5cafde). This code is frozen: change no file in it and make no commit. If CLAUDE.md here says otherwise, this prompt wins.

Step 0
- Confirm HEAD is b5cafde with a clean tree and the sandbox image ID matches docs/freeze.md. If not, STOP AND REPORT.
- Read docs/freeze.md and the runner's usage. Read the protocol and its Amendment 1 with `git -C ~/Projects/TraceHound show origin/docs/protocol-amendment-1:docs/eval/protocol.md`. If the amendment isn't there, STOP AND REPORT.
- Symlink .env and the spend ledger from ~/Projects/TraceHound so spend is recorded in the one ledger. Record the ledger total.
- Tasks: ~/Projects/tracehound-heldout/tasks/ (8 tasks). Results go to ~/Projects/tracehound-heldout/results/, not into this worktree. Run records stay in this worktree's runs/.
- Keep the machine awake for the whole session (caffeinate). Nothing else may run.

Batch 1: Nano, the frozen defaults, cost limit $0.10 per run
- Canary: run one task with its oracle patch, no model. It must be RESOLVED.
- Five passes. Each pass: all 8 tasks x graph-on and graph-off, one run each, concurrency 1. If the runner would run one arm completely before the other, invoke it so the arms alternate, and record the order used.
- After every pass: the canary again. If it is not RESOLVED, the pass before it is void: keep its records, mark it void, and run a replacement pass. At most two replacement passes per batch; after that STOP AND REPORT.
- A run that ends in an infrastructure error (network, model request timeout, sandbox failure) or carries a baseline-anomaly flag is void. Re-run each void run once at the end of the batch. List every void run.
- Write the batch's results JSON and markdown table, then a one-paragraph status file, before starting Batch 2.

Batch 2: Super (--model nvidia/nemotron-3-super-120b-a12b, --cost-limit-usd 0.6)
- Same procedure.

Results tables, per model and arm, with n beside every figure
- resolved; verified at stop (computed from each record: reproduction test passes, 0 regressed tests, typecheck matches baseline); end reasons; mean steps, tokens, cost, wall time; mean step of first fault-file read; graph tool calls; packet injected and its size.
- The same split by task group: cross-component (4 tasks) and same-component (4 tasks).
- Per task: resolved out of 5, per arm.
- No significance claims, no interpretation, no pooling with dev results.

Stop early and report if: a spend cap is hit; two replacement passes are used up; the same failure happens twice; anything is ambiguous.

Rules
- May touch: runs/ in this worktree, ~/Projects/tracehound-heldout/results/, and the two symlinks. Nothing else.
- No tuning, no prompt or code change, no re-running a run because of its result. Only void runs are re-run.
- Spend: $10.00 of new Nebius spend in total, read from the ledger before each pass; stop Batch 1 at $2.50 and Batch 2 at $7.00.
- If interrupted, on resume run only what has no record; a run in flight at the interruption is void.
- No destructive git commands. Record losses as losses.

STOP AND REPORT: step 0 checks; run order used; every void run and pass with its reason; canary results; the results tables for both models; ledger total and spend per batch; where the results and records are; anything not done.
