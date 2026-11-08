# Decision 073: the generation-recovery A/B on dev (result)

Pre-registration: `docs/decisions.md` § 073 and amendment 073a (written before the calls they govern). Runner:
`scripts/bench/recovery-ab.ts` at `78537cd` (branch `bench/recovery-ab`). Records stay in the bench folder
(`~/Projects/tracehound-bench/recovery-073r/`, the restart; `recovery-073/` is the void first run). Counts only;
no title, comment or golden text. Reproduce the tables with `node scripts/bench/recovery-ab.ts report` (no model).

**Verdict (pre-registered rule): PASS for B1 (`parser: "lenient"`); B2 (`lenient` + `retryOnLength: "fresh"`) is
not met (E2 fails).** The effect is small: arm A lost 1 chunk in this corpus, B1 lost 0 and gained 1 TP under
each judge. ΔF is within noise; no ranking claim follows.

## Runs and spend
- Dry run ($0, arm A from the shared cache only): 96 first reviewer attempts, 83 in the cache, 13 not; manifest
  `a05e9d79…` (40 PRs).
- First run (`recovery-073/`, started 2026-11-07T19:09:03Z): **void** (073a). Node's fetch timed out at 300 s on
  long 3.5 replies; stopped at arm A pull request 14. 11 calls, 4 failed, $0.34415 (ledger).
- Restart (`recovery-073r/`, 20:08:39Z → 20:38:30Z, head `78537cd`): complete. 79 calls, 0 failed, $0.38780.
  3.5 Super VL 43 calls $0.37421; bench-judge-v1 18 calls $0.01112; bench-judge-x1 18 calls $0.00247.
- **Job total $0.73195** (ledger $40.43804 → $41.16999), under the $4 cap. Per-call charges equal the ledger.
- Coverage complete: 40 PRs in every arm, every PR SCORED in every arm under both judges, 0 cache misses, 0
  request errors, 0 unpaired PRs, 0 missing reply bodies.

## Corpus (arm A)
| first reviewer attempts | from the shared cache | carried from the void run | sent fresh |
|---|---|---|---|
| 96 | 54 | 34 | 8 |

Arm A's reviewer replies by finish: stop 99 · empty content 10 · length (with content) 2 (111 replies).
It is a latest-response replay corpus, not run 7r's or 8's identity. It had **1** terminal failed chunk, against 8
in each of runs 7r and 8 (`dev-3.5.md`).

## E2 (chunks)
| arm | chunks | CHUNK_FAILED (diff/ctx) | paired failed | PRs with a failed chunk | empty by failure | VERIFY_FAILED | kept | changed PRs vs A |
|---|---|---|---|---|---|---|---|---|
| A | 96 | 1 (0/1) | 1 | 1 | 1 | 2 | 77 | — |
| B1 | 96 | 0 (0/0) | 0 | 0 | 0 | 2 | 78 | 1 |
| B2 | 96 | 7 (1/6) | 7 | 6 | 3 | 2 | 77 | 4 |

B1: 0 ≤ 2 and < 1, 0 empty by failure → pass. B2: 7 > 2 → fail.

Why B2 fails: the 7 failed chunks all had a first reply with **empty content and `finish_reason: length`**
(reasoning used the whole 32,000 tokens), then a fresh retry with reasoning off that ended `stop` but was not
valid JSON, even for the lenient parser. In arm A the same 10 empty first replies got the append retry (reasoning
on), which recovered them. B2 made 10 fresh retries (9 ctx, 1 diff); 7 of the 10 failed.

## E3 (devin's gate: TP_arm ≥ TP_A and P_arm ≥ P_A over the 40 PRs, under both judges)
| judge | arm | TP A → arm | FP A → arm | P A → arm | R A → arm | F A → arm | recovered tp/fp | unchanged PRs scored differently |
|---|---|---|---|---|---|---|---|---|
| v1 | B1 | 32 → 33 | 27 → 27 | 54.2% → 55.0% | 43.2% → 44.6% | 48.1% → 49.3% | 1/0 | 0 |
| v1 | B2 | 32 → 32 | 27 → 27 | 54.2% → 54.2% | 43.2% → 43.2% | 48.1% → 48.1% | 1/1 | 0 |
| x1 | B1 | 34 → 35 | 27 → 27 | 55.7% → 56.5% | 45.9% → 47.3% | 50.4% → 51.5% | 1/0 | 0 |
| x1 | B2 | 34 → 34 | 27 → 27 | 55.7% → 55.7% | 45.9% → 45.9% | 50.4% → 50.4% | 1/1 | 0 |

n = 74 goldens (Medium+), 40 PRs. Both B arms pass E3; B2 fails only E2.

## E4 (lenient = strict on strict-valid replies)
121 reviewer replies received across arms, 96 strict-valid, **0** parse differently under lenient → pass.

## Cost by arm (ledger charges; generation / verify / judge)
A $0.2488 / $0.0306 / $0.0122 · B1 $0.0000 / $0.0016 / $0.0004 · B2 $0.0576 / $0.0356 / $0.0011.

## Limits
- One draw per request; the corpus is today's latest replies. A had 1 failed chunk where runs 7r and 8 had 8, so
  this corpus exercised the defect far less than the runs that motivated the job, and B1's E2 pass rests on one chunk.
- The 7 B2 failures are one mechanism (empty length reply → reasoning-off retry → invalid JSON) seen in 7 of 10
  cases; this is a dev measurement only.
- Adoption is a proposal (default-on lenient parser for the Action) for a later change; nothing is merged here.
