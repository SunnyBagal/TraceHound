TL;DR 1/10: Thank you; I can now calculate the current stage cost split.
TL;DR 2/10: Please clarify two count discrepancies before I finalize.
TL;DR 3/10: Counts only, dev-only; no text or IDs.
TL;DR 4/10: Your run 8 FN rows sum correctly to 40.
TL;DR 5/10: They imply 27 absent from pool, versus published raw FN 28.
TL;DR 6/10: Explicit drops 13 differ from net scored TP reduction 12.
TL;DR 7/10: I will keep joined-credit and scored counts distinct.
TL;DR 8/10: Recurrence wording also has two possible denominators.
TL;DR 9/10: Exact recurrence is optional; I can omit it.
TL;DR 10/10: No ping and no new model/benchmark runs requested.

1. In run 8, does non-empty `creditedBy` count 47 raw goldens while the official scorer credits 46 TP, or does another join detail explain 27 absent versus published raw FN 28? Are the 13 explicit drops measured by matching source findings with verdicts, or inferred from final credited-golden absence? Please state the distinction. Can the 35 persistent final misses be safely split into 24 absent-from-pool-both, 6 verifier-drop-both, and 5 mixed/other?
2. Recurrence TL;DR says ~1/3 while body says 19 findings recur in both (~38/57 FP occurrences). Which is intended: 19 paired clusters (38 occurrences), or 19 recurring occurrences total? No need to redo categorization. For cost attribution, confirm the one retried PR is included in the stage totals and that this explains 122 verify calls in 7r versus 116 used-pool findings +5 parse retries =121.
