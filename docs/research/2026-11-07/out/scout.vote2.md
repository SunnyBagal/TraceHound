OBJECT

1. Section 2, row 6, line 61. The Lightning precondition names `config/prices.json:9`.
(a) `DRAFT-CONCLUSION.md:61`, the citation `config/prices.json:9`.
(b) At HEAD, line 9 is `nvidia/nemotron-3-ultra-550b-a55b` with `inputPer1M: 0`, `outputPer1M: 0`, `placeholder: false` (the free NVIDIA-route id, decision 071). Lightning is line 10: `nvidia/Nemotron-3_5-Lightning`, both rates null, `placeholder: true`, so the budget uses `placeholderFallback` $5/$15 (`config/prices.json:3` and `:10`). Filling line 9 would overwrite the $0 NVIDIA id and leave Lightning on the $5/$15 fallback. Nebius `models_info` (fetched 2026-11-07) lists that Lightning id at $0.06 in / $0.24 out.
(c) Replacement for the evidence cell of row 6:

**Precondition:** set `config/prices.json:10` (`nvidia/Nemotron-3_5-Lightning`, today `placeholder: true`, so the budget uses the $5/$15 fallback) from Nebius `models_info` to $0.06 / $0.24. Do not edit line 9 (`nvidia/nemotron-3-ultra-550b-a55b`, the $0 NVIDIA-route id). One smoke call to confirm the id, then a decision entry. Old-dev results are a hypothesis only.

The rest of v2 stands. Lines 11–12 and row 1 drop the "known cause" / "+16 upper bound" wording. Keyed replay, the job-wide $4 cap (`budget.ts:53-56` with `setup.ts:18`), and the 15/12 successful-retry counts (`dev-3.5.md:122`) match the code and the measured doc.
