Prompt: evaluation protocol amendment and dev recount. Fresh session in the TraceHound main checkout, branch docs/protocol-amendment-1 off origin/main. Decision 049. Docs only.

1. Save this prompt verbatim to docs/prompts/protocol-amendment-1.md.
2. Append the Amendment block below to docs/eval/protocol.md, verbatim. Record decision 049 pointing to it.
3. Recount, from existing run records only, no new runs: for every dev repair run on agent-v5 (16), agent-v6 Nano (16) and the Super probe (8), report "resolved" and "verified at stop" per arm, with n. Put the table in docs/eval/dev-verified-at-stop.md. If a record lacks the data, say "not recorded".
4. Commit, push, open one PR. Don't merge it. Gate: CI green on the PR. No local Docker suite for a docs-only change.

Amendment block
## Amendment 1, 5 October 2026 (written before any held-out run)
- Second measure, "verified at stop": a run counts if its final patch passes the reproduction test, the per-test regression gate and the typecheck gate, whatever ended the run. It is reported beside "resolved" for every arm and model. Reason: the frozen harness scores a run UNRESOLVED when the agent runs out of budget even if its patch passes every gate, as seen in a dev repair run on 4 October.
- Run order: each batch is five passes; each pass runs every task in both arms once, so the arms are spread across the session.
- Canary: the oracle patch for one task runs before the first pass and after every pass. A canary that is not RESOLVED voids the pass before it.
- Batches: Nano and Super are separate batches on the same machine with the same sandbox image.
- Limit: all four cross-component tasks have their fault in one file, because Recall's worker component is two files.
- Deviation: on 4 October 2026 at 19:56 IST and 5 October at 19:50 IST, the held-out candidates and the final task list were shown to the chat assistant that writes the main lane's prompts. Both were after eval-freeze-2 (b5cafde) was tagged. The evaluation runs from that tag, and no frozen artifact has changed since.

Rules
- May touch: docs/ only.
- Never create, read or look for held-out evaluation tasks.
- Spend: $0.
- No destructive git commands. No claims beyond what the records show.

STOP AND REPORT: the recount table; the commit hash and time of the amendment; PR and CI URLs; anything not recorded.
