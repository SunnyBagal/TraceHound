# DRAFT CONCLUSION (v1, for vote1) — 2026-11-07

## TL;DR
1. **Next task (one week, ≤ 14 h, ≤ $4):** pre-registered dev A/B of the two generation-recovery switches already in code (#67):
   `parser: lenient` + `retryOnLength: fresh`, on the 40 dev PRs, measured by **cache-replay**, with fresh isolated capture as the fallback.
2. **Exit:** terminal CHUNK_FAILED ≤ 2 in arm B (baseline ≈ 8 per run) with no harm on the PRs whose output changed. It is a count-based gate, not an F claim.
3. Why this task: it is the only generator-miss subset with a known mechanical cause (16 of 56 golden-runs sit in PRs with a failed chunk). It retries no lost lever and fixes a product defect (1 of 10 Cal.com PRs posted nothing, 069).
4. Then: a 2-repo SZZ label pilot that measures yield and minutes per label, and only after that a 40 + 40 TS dev / held-out set (≈ $18–25, 2–4 weeks).
5. Context and symbol levers (5.3, the "undefined symbol" check) wait for the fresh TS dev set, because they were found by reading the old dev set.
6. "both skips the verifier" is dropped (+6 TP / +8 FP over 2 runs). The verifier stays.
7. Cost stays ≈ $0.063 median / $0.074 mean per PR. The reviewers are 87% of spend; the only measured cuts are small.
8. Cal.com is spent: no further run. Every new claim needs the fresh held-out set and a matcher fixed in advance (bench-judge-v1, plus x1 as report-only).
9. Verdict on "beating" the tools: tied with Cursor and Greptile is defensible today. Passing Augment (−14.0 [−22.6, −4.7] all-50) needs about 14 F points, more than any lever has produced (best: the 3.5 swap, +8.1).
10. Continue, with the narrower goal. The budget ($43.52) funds about one fresh-set A/B plus one held-out final.

## 1. The one next task
**T1 — generation-recovery A/B on dev (benchmark lane: claude or the owner; the dev data lives in tracehound-bench).**
- **Plan first:** write and push `docs/bench/recovery-plan.md` before any call. It fixes the arms, metrics, cap, fallback and stop rules (as 064/067 did).
- **Arms:**
  - Arm A: flags off, byte-identical to review-freeze-2.
  - Arm B1: `parser: lenient` only (scout.r2: one switch at a time, for attribution).
  - Arm B2: `parser: lenient` + `retryOnLength: fresh` (`docs/post-freeze-fixes.md:9-10`; `review.ts:228-238`).
  - Only chunks whose first reply failed can differ between arms, so B1 and B2 add little cost on top of A.
  - Same 40 dev PRs, 3.5 Super, frozen prompts. Judges: v1 (scorer of record) + x1.
- **Measurement:**
  - The runner gets reviewer cache reads on (`scripts/bench/run-test-set.ts:123-141`) and passes the two flags through.
  - Arm A runs first. Keys are rebuilt from dev inputs only (`cache.ts:13-15`), so the shared cache is never enumerated or scanned (Cal.com replies live there too).
  - `attemptsDetail` records `finishReason` for every failed reply, which gives the length-vs-invalid-JSON split (not available today).
- **Exit criterion (pre-registered):**
  - E1 identity: arm A is ≥ 95% cache hits. If not, fall back to one fresh isolated generation-only capture per arm under the cap; E2 stays measurable, E3 becomes report-only.
  - E2 primary: terminal CHUNK_FAILED in B2 ≤ 2, and PRs with 0 findings because of a failure = 0. Reported against A's count; B1's count attributes the gain.
  - E3 no harm, on PRs whose output changed: ΔTP ≥ ΔFP under v1, with x1 the same sign. PRs whose output did not change score identically.
  - E4 report: the finish_reason split; strict-valid replies parse to identical findings under lenient (any difference rejects the parser); cost.
- **Adoption:** E2 ∧ E3 on B2 (or on B1 alone if B1 already meets E2), then a decision entry (073) and a default-on proposal for the Action. ΔF is reported as within noise. No ranking claim follows.
- **Budget:** hard cap $4 (`TRACEHOUND_BUDGET_RUN_USD`). Expected < $3, an estimate. About 10–14 h: runner option + tests 4 h, plan 2 h, runs 2 h, report + decision 3–4 h.

## 2. Ranked plan (≤ 6 items)
| # | item | expected effect on P / R | cost | evidence |
|---|---|---|---|---|
| 1 | T1 recovery A/B | R: at most +16 golden-runs over 2 runs (upper bound, ≤ +10.8 R pts); P ~unchanged (guess) | ≤ $4, ≤ 14 h | claude.r1 §1–2; dev-3.5.md:86–124 (8 terminal failures per run); devin.r2 §4; codex.r2 |
| 2 | Observability completion: verifier `attemptsDetail`, input tokens per attempt, reasoning-token totals, lineage kept after the Action's temp-dir delete | none directly; unlocks cost cuts and stage attribution | $0, ~4 h | codex.r2 table (`review.ts:38-67`, `verify-ctx.ts:24-50`, `pipeline.ts:196-208`) |
| 3 | 2-repo SZZ label pilot: yield (kept PRs per candidate, Medium+ labels per PR), minutes per label, second-label agreement | none (measurement) | $0 model, ~10 h | devin.r2 §3.3 (23–37 h estimate for 80 PRs); codex.r2 (SZZ precision caveats: Herbold 2022, Rani 2024) |
| 4 | Fresh TS dev (≈ 4 repos, 40 PRs) + held-out (3–4 repos, 40 PRs), split by repo, list hash committed first, matcher bench-judge-v1 fixed, labels only from fix commits | enables any new claim | ≈ $18–25 + 23–37 h | devin.r1 §4, devin.r2 §5; decisions.md:3449-3450 |
| 5 | On the new TS dev: symbol-resolved context (5.3) + a model-free "undefined symbol" pre-check on findings | R up (5.3, guess); P up (≈ 14/57 old-dev FPs were that type, judged by eye) | M effort; 2 runs/arm ≈ $12 | claude.r1 §3; devin.r1 rank 4; refs reached the model in only 12/48 chunks (058) |
| 6 | Verifier on Nemotron 3.5 Lightning ($0.06/$0.24, Nebius official) | cost −$0.0075/PR est. (−10%); P/R unmeasured | 2 runs ≈ $6 | VERIFY.md (Nebius page); verifier = 12.8% of spend |

## 3. Cost plan
- **Today:** median $0.0626 / mean $0.0743 per PR (dev-3.5.md). Shares: diff 39%, ctx 48%, verifier 13%. Generator calls average ≈ 19k output tokens, verifier calls ≈ 2k. The reasoning share is unmeasured.
- **Models per stage (unchanged):** both reviewers and the verifier on 3.5 Super VL ($0.30/$0.90 per 1M, Nebius official). Fixes on 3 Super. Judges: 3 Super (v1), Qwen3-235B (x1).
- **Cuts, all estimates:**
  - Lenient parser avoids some parse retries (≤ $0.015/PR ceiling, overlapping with fresh retry, codex.r1).
  - Lightning verifier: ≈ −$0.0075/PR.
  - Caching: Nebius `models_info` lists $0.06/1M cached input for 3.5 Super VL (scout.r2; not on the marketing page). The completed dev runs cached 0 calls, so it saves $0 today; the frozen prompts' shared prefix is small.
- **$/PR after, estimate:** mean ≈ $0.060–0.070, i.e. 5–20% lower, if items 1 and 6 both pass. The reviewers stay the cost. Token Factory ignores reasoning budgets (070), so there is no cheap lever on them today.

## 4. Don't do
- Any further Cal.com run (069b). Any F claim from one dev run or from n = 74 deltas inside ±8–10 pts.
- Retry lost levers without a new reason: confidence thresholds (056), whole-run votes (064, levers-v2 2-of-3), quote-gated evidence (065), broad lenses / missed-issue pass (070), a bigger model (071), per-PR caps (levers-v2).
- "both bypasses the verifier" (+6 TP / +8 FP). Dropping the verifier (inconclusive ΔF; it raises P).
- Scan `.tracehound/cache` (it mixes Cal.com replies). Open held-out seed sets. Copy dataset text into docs.
- Product calls to any non-Nemotron provider (AGENTS.md). Build from last week's competitor announcements (scout).
- Mine 80 SZZ PRs before the pilot has measured yield and minutes per label.
