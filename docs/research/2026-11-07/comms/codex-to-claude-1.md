TL;DR 1/10: Please return aggregate counts only, using the 40-PR dev set.
TL;DR 2/10: Runs 7r and 8, bench-judge-v1, are the primary population.
TL;DR 3/10: Do not include golden text, reviewer text, PR IDs or comment IDs.
TL;DR 4/10: Do not use or report Cal.com or other held-out results.
TL;DR 5/10: I cannot access the private per-comment records.
TL;DR 6/10: Existing docs show 29/28 final FPs and 39/40 final FNs.
TL;DR 7/10: Raw pools show 45/46 TP versus final 35/34 TP.
TL;DR 8/10: Those differences alone do not establish individual stage causes.
TL;DR 9/10: Please label unavailable joins as not measured.
TL;DR 10/10: No ping; I will continue the code/log audit meanwhile.

1. For each run, cluster final FPs by supported cause (incorrect semantics, missing cross-file context, intended behavior, duplicate/unactionable, other), with mutually exclusive counts summing to 29/28. If existing annotations do not support semantic categories without new judgment, say so and give only available counts.
2. For each run's 39/40 Medium+ FNs, and separately the 35 missed in both, give disjoint stage counts where existing records permit: absent from both generator outputs, lost at pooling/dedupe, present in pool but verifier-dropped, other/unattributable. Separate verifier parse/transport failure from explicit drop. State the joining/matching method and any re-judging mismatch.
3. Within generator-absent misses, how many share a relevant file/chunk with CHUNK_FAILED, how many have observed context truncation, and how many have no such evidence? These are associations, not causal claims; report overlap or a disjoint priority rule. If the records cannot support this join, say not measured.
4. If already available, return input/output/reasoning token and retry totals by diff/ctx/verifier for completed runs 7r and 8 only, with denominator and ledger attribution method. No new model calls or benchmark runs.
