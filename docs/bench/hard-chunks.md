# Decision 074: recovering empty replies on the hard-chunk set (result)

Pre-registration and result: `docs/decisions.md` § 074. Runner `scripts/bench/hard-chunks.ts` (run at `0063b0c`);
records in `~/Projects/tracehound-bench/hard-chunks-074/`. Counts only. Reproduce: `node scripts/bench/hard-chunks.ts report`.

**Set:** 14 distinct reviewer chunk requests (the 20 failures of 3.5 dev runs 7r/8/9), 3 fresh draws each, cache
bypassed. **Arms** share each first draw: A = current (lenient, append retry); D = after an empty reply, review each
half once; E = after an empty reply, one retry with reasoning off and `response_format: json_schema`. C (a reasoning
token budget) was dropped: none is documented.

## All 42 units (the gate)
| arm | success (valid, ≥ 1 kept finding) | valid replies | kept per success | cost per unit | wall per unit |
|---|---|---|---|---|---|
| A | 22 (52%) | 31 | 1.4 | $0.0472 | 303 s |
| D | 30 (71%) | 24 | 1.3 | $0.0594 | 328 s |
| E | 41 (98%) | 42 | 3.3 | $0.0329 | 194 s |

Gate (≥ max(1.5 × A, A + 1) successes, ≤ 1.5 × A's cost per unit, ≥ 30 complete units): **E WIN**, D NO WIN.
First replies: valid 15, invalid non-empty 1, empty 26 (all `length`, reasoning = 32,000 output tokens).

## The 26 empty-first units (where the arms differ)
| arm | success | valid | cost per unit |
|---|---|---|---|
| A | 7 | 15 | $0.0618 |
| D | 15 (8 from one half only) | 8 (both halves) | $0.0816 |
| E | 26 | 26 | $0.0388 |

## Per request (successes of 3 draws)
| request | empty first | A | D | E |
|---|---|---|---|---|
| discourse/8 ctx#0 | 3 | 1 | 3 | 3 |
| grafana/0 ctx#0 | 2 | 1 | 1 | 2 |
| grafana/0 diff#0 | 2 | 2 | 3 | 3 |
| grafana/1 ctx#0 | 3 | 1 | 1 | 3 |
| grafana/1 diff#0 | 3 | 0 | 1 | 3 |
| grafana/2 diff#0 | 2 | 1 | 3 | 3 |
| grafana/6 ctx#0 | 3 | 0 | 0 | 3 |
| keycloak/0 ctx#0 | 0 | 3 | 3 | 3 |
| keycloak/6 ctx#0 | 2 | 2 | 1 | 3 |
| sentry/2 ctx#0 | 1 | 3 | 3 | 3 |
| sentry/4 ctx#0 | 0 | 3 | 3 | 3 |
| sentry/4 ctx#2 | 1 | 2 | 3 | 3 |
| sentry/5 ctx#0 | 3 | 0 | 2 | 3 |
| sentry/9 diff#0 | 1 | 3 | 3 | 3 |

(grafana/0 ctx#0: E's 2 of 3 is a draw whose first reply was valid with 0 findings, the same for every arm.)

## Limits
Selected on past failure; 14 requests × 3 draws, not 42 independent cases; "success" checks only that findings anchor
in the diff, not that they are right; E confounds the schema with reasoning off; 3.5 Super VL has no "JSON mode" tag, so
schema enforcement is unverified. Nothing is adopted; finding quality comes next, on the full dev set.
Spend $3.36463 (147 calls, 0 failed).
