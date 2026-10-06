# Batch 2 (Super) status, 2026-10-06 10:45 IST

Batch 2 is complete. Model: `nvidia/nemotron-3-super-120b-a12b` (`--model`), with `--cost-limit-usd 0.6`. Otherwise the frozen defaults: agent-v6, reasoning on, temperature 0. Code: eval-freeze-2 (`b5cafde`), image `sha256:857f16d26f25…`. Protocol: Amendment 1, commit `1ec1fce` (2026-10-05 20:00:59 IST).

**Run order.** Passes of 8 tasks × 2 arms, concurrency 1, task-major. The starting arm alternated by pass:

| Pass | Starting arm |
|---|---|
| 1 | on |
| 2 | off |
| 3 | on |
| 4 (void) | off |
| 4, replacement 1 | off |
| 5 | on |

**Pass 4 is void.** The host lost its network at about 07:05 IST.

- Four runs FAILED before starting: tasks 07 and 08, both arms, with `git clone … Could not resolve host: github.com`.
- Task 06 graph-on ended in a model request timeout.
- The canary after pass 4 FAILED with the same DNS error.
- The records are kept. The user chose to run replacement 1 of 2. A canary at 09:34 (RESOLVED) confirmed the network before it started.

**Canaries.** The oracle on recall-heldout-01 ran 9 times. All were RESOLVED except the one after pass 4, which hit the network outage.

**Void runs** (in valid passes): one.

| Pass | Task | Arm | Cause | Recorded verdict | Re-run |
|---|---|---|---|---|---|
| 5 | recall-heldout-06 | graph-on | model request timeout | UNRESOLVED | RESOLVED, not void |

No counted run is FAILED or carries a baseline-anomaly flag. Baselines were 62/62 in every run that reached its baseline.

**Results.** 80 runs counted (40 per arm):

| Arm | Resolved | Verified at stop |
|---|---|---|
| graph-on | 28 of 40 | 30 of 40 |
| graph-off | 26 of 40 | 31 of 40 |

Tables are in `results.md` and `results.json`.

**Spend.** The ledger went from $4.66659 to $9.29182, so Batch 2 spent $4.62523. New spend for the session is $6.26774, under the $7.00 Batch 2 stop on the conservative cumulative reading.

**Records.** Run records are in `~/Projects/TraceHound-eval/runs/heldout-eval/b2-super/`.
