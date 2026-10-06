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

## Amendment 1, 5 October 2026 (written before any held-out run)
- Second measure, "verified at stop": a run counts if its final patch passes the reproduction test, the per-test regression gate and the typecheck gate, whatever ended the run. It is reported beside "resolved" for every arm and model. Reason: the frozen harness scores a run UNRESOLVED when the agent runs out of budget even if its patch passes every gate, as seen in a dev repair run on 4 October.
- Run order: each batch is five passes; each pass runs every task in both arms once, so the arms are spread across the session.
- Canary: the oracle patch for one task runs before the first pass and after every pass. A canary that is not RESOLVED voids the pass before it.
- Batches: Nano and Super are separate batches on the same machine with the same sandbox image.
- Limit: all four cross-component tasks have their fault in one file, because Recall's worker component is two files.
- Deviation: on 4 October 2026 at 19:56 IST and 5 October at 19:50 IST, the held-out candidates and the final task list were shown to the chat assistant that writes the main lane's prompts. Both were after eval-freeze-2 (b5cafde) was tagged. The evaluation runs from that tag, and no frozen artifact has changed since.
