# Batch 1 (Nano) status, 2026-10-06 05:31 IST

Batch 1 is complete. Model: Nemotron Nano, the frozen defaults: agent-v6, reasoning on, temperature 0, cost limit $0.10 per run. Code: eval-freeze-2 (`b5cafde`), image `sha256:857f16d26f25…`. Protocol: Amendment 1, commit `1ec1fce` (2026-10-05 20:00:59 IST).

**Run order.** Five passes of 8 tasks × 2 arms, concurrency 1, task-major, so the arms alternate on every task. The starting arm alternated by pass:

| Pass | Starting arm |
|---|---|
| 1 | on |
| 2 | off |
| 3 | on |
| 4 | off |
| 5 | on |

**Canaries.** The oracle canary (recall-heldout-01) ran 7 times and was RESOLVED every time: before pass 1, after each of the 5 passes, and after the re-runs. No pass is void and no replacement pass was used.

**Void runs.** Four runs are void, each from a model request timeout ("The operation was aborted due to timeout", the client's 60 s limit):

| Pass | Task | Arm | Recorded verdict |
|---|---|---|---|
| 2 | recall-heldout-01 | graph-off | UNRESOLVED |
| 2 | recall-heldout-04 | graph-on | RESOLVED |
| 3 | recall-heldout-08 | graph-on | UNRESOLVED |
| 3 | recall-heldout-08 | graph-off | UNRESOLVED |

- Each was re-run once at the end of the batch, and no re-run was void.
- After the two pass-2 timeouts, the batch paused under the "same failure twice" rule. The user chose to continue, with void runs re-run and a stop at 3+ timeouts in a pass, at a re-run that times out again, or at any FAILED run.
- No run was FAILED and none carries a baseline-anomaly flag. Baselines were 62/62 in all 84 runs.

**Results.** 80 runs counted (40 per arm):

| Arm | Resolved | Verified at stop |
|---|---|---|
| graph-on | 11 of 40 | 11 of 40 |
| graph-off | 13 of 40 | 19 of 40 |

Tables are in `results.md` and `results.json`.

**Spend.** The ledger went from $3.02408 to $4.66659, so Batch 1 spent $1.64251 against its $2.50 cap.

**Records.** Run records are in `~/Projects/TraceHound-eval/runs/heldout-eval/b1-nano/`.
