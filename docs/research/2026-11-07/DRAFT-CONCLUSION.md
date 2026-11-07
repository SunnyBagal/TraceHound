# DRAFT CONCLUSION (v2, for vote2) — 2026-11-07
v1 is kept as `DRAFT-CONCLUSION.v1.md`. The changes from vote1 are listed at the end, with each objection accepted.

## TL;DR
1. **Next task (one week, ≤ 14 h, ≤ $4 job-wide):** a pre-registered dev A/B of the two generation-recovery switches already in code (#67):
   `parser: lenient` (B1) and `parser: lenient` + `retryOnLength: fresh` (B2), against flags off (A), on the 40 dev PRs.
   B1 is derived offline from A's replies at $0; B2 pays only for its changed retries.
2. **Exit:** terminal CHUNK_FAILED in B2 ≤ 2 and strictly below A, with ΔTP ≥ 0 and ΔFP ≤ 0 on the changed PRs under both judges.
   Strict-valid replies must parse identically. This is a count-based gate, not an F claim.
3. **Why this task:** eight terminal failed chunks per completed dev run are a directly measured delivery defect. On 3.5 dev, 7 of 40 PRs
   per run lost a reviewer chunk and 3 of 40 ended with no findings (068). 16 of 56 raw-uncredited final-miss occurrences share a PR
   with a failed chunk; their bug-level link is unmeasured. The task retries no lost lever and uses dev evidence only.
4. Then: a 2-repo SZZ label pilot that measures yield and minutes per label. Only after that, a 40 + 40 TS dev / held-out set (≈ $18–25, 2–4 weeks).
5. Context and symbol levers (5.3, the "undefined symbol" check) wait for the fresh TS dev set, because they were found by reading the old dev set.
6. "both skips the verifier" is dropped (+6 TP / +8 FP over 2 runs). The verifier stays.
7. Cost stays ≈ $0.063 median / $0.074 mean per PR. The reviewers are 87% of spend, and the measured cuts are small.
8. Cal.com is spent: no further run. Every new claim needs the fresh held-out set and a matcher fixed in advance (bench-judge-v1, with x1 as report-only).
9. Verdict on "beating": tied with Cursor and Greptile is defensible today. Passing Augment (−14.0 [−22.6, −4.7] all-50) needs about 14 F points,
   more than any lever has produced (best so far: the 3.5 swap, +8.1).
10. Continue with the narrower goal. The budget ($43.52) funds about one fresh-set A/B plus one held-out final.

## 1. The one next task
**T1 — generation-recovery A/B on dev (benchmark lane: claude or the owner; the dev data lives in tracehound-bench).**
- **Plan first:** write and push `docs/bench/recovery-plan.md` before any call. It fixes the arms, metrics, cap, starting ledger total and stop rules.
- **Arms:**
  - A = flags off (byte-identical to review-freeze-2).
  - B1 = `parser: lenient` only, for one-switch attribution.
  - B2 = `parser: lenient` + `retryOnLength: fresh` (`docs/post-freeze-fixes.md:9-10`; `review.ts:228-238`; the fresh retry sends reasoning off).
  - All arms use the same 40 dev PRs, 3.5 Super and the frozen prompts. Judges: v1 (scorer of record) and x1.
- **Baseline corpus (A):**
  - Rebuild dev-only request keys (`cache.ts:13-15`) without enumerating `.tracehound/cache`, which also holds Cal.com replies.
  - Freeze the retrieved bytes as a newly labelled *latest-response replay corpus*. Runs 7r, 8 and 9 overwrote each other, so this is never run 7r's or run 8's identity (`comms/codex-to-claude-3.answer.md`). Record missing bodies; empty replies were never cached (`client.ts:299-301`).
  - If a complete baseline cannot be formed, capture **one** fresh isolated arm A on the 40 PRs with `attemptsDetail` on.
- **Deriving B1 and B2:**
  - B1 = A's immutable replies re-parsed offline, at $0.
  - B2 reuses the same first replies and pays only for eligible fresh retries. That includes chunks whose original strict retry succeeded (15 / 12 such chunks per run, `dev-3.5.md:122-124`).
  - Arm and attempt records are kept separate. No arm recaptures all 40 PRs independently.
- **Pairing:**
  - Report the cache-hit count over all first-attempt requests in A, and separately over the first attempts of chunks that failed in A.
  - Failed chunks whose first attempt had to be drawn fresh in more than one arm are *unpaired*. They get their own row and are excluded from E3.
  - E2 is reported twice: over paired failed chunks (attributable) and over all chunks (product).
- **Exit criterion (pre-registered, every capture path):**
  - E2: terminal CHUNK_FAILED in B2 ≤ 2 **and** strictly below A, and PRs with 0 findings because of a failure = 0. B1's count attributes the gain.
  - E3 (mandatory): on the identical changed-PR subset and the fixed matching protocol, ΔTP ≥ 0 **and** ΔFP ≤ 0 under both v1 and x1. This is a conservative count guard, not proof of generalization.
  - E4: strict-valid replies give identical parsed findings under lenient. Any difference rejects the parser. Report the finish_reason split (length / stop / other / empty) and the cost.
  - If judging is incomplete or coverage is missing, the result is inconclusive and there is no default-on proposal.
- **Adoption:** if E2 ∧ E3 ∧ E4 hold for B2 (or for B1 alone if B1 meets them), write decision 073 and propose default-on for the Action. ΔF is reported as within noise. No ranking claim follows.
- **Budget:**
  - Hard cap $4 for the whole job, across generation, verification and judging. It is enforced as `TRACEHOUND_BUDGET_TOTAL_USD` = the ledger total at start + $4 (`budget.ts:55`); `TRACEHOUND_BUDGET_RUN_USD` stays the per-process guard.
  - Expected: ≈ $0.5–1 on the replay path, ≈ $2.6–3.5 if arm A must be captured fresh (estimates; < $3 is not guaranteed). Report actual spend and coverage.
  - About 10–14 h: runner option + tests 4 h, plan 2 h, runs 2 h, report + decision 3–4 h.

## 2. Ranked plan (≤ 6 items)
| # | item | expected effect on P / R | cost | evidence |
|---|---|---|---|---|
| 1 | T1 recovery A/B | R/P unmeasured. 16 raw-uncredited final-miss occurrences are associated with failed-chunk PRs over 2 runs: neither a recovery count nor an upper bound, since B2 also changes successful retries | ≤ $4 job-wide, ≤ 14 h | dev-3.5.md:86–124; claude.r1 §1–2; codex.vote1; devin.vote1 |
| 2 | Observability completion: verifier `attemptsDetail`, input/reasoning tokens per attempt, lineage kept after the Action's temp-dir delete | none directly; unlocks cost cuts and stage attribution | $0, ~4 h | codex.r2 (`review.ts:38-67`, `verify-ctx.ts:24-50`, `pipeline.ts:196-208`) |
| 3 | 2-repo SZZ label pilot: yield (kept PRs per candidate, Medium+ labels per PR), minutes per label, second-label agreement | none (measurement) | $0 model, ~10 h | devin.r2 §3.3 (23–37 h for 80 PRs, estimate); codex.r2 (SZZ precision: Herbold 2022, Rani 2024) |
| 4 | Fresh TS dev (≈ 4 repos, 40 PRs) + held-out (3–4 repos, 40 PRs), split by repo, list hash committed first, bench-judge-v1 fixed, labels only from fix commits | enables any new claim | ≈ $18–25 + 23–37 h | devin.r1 §4, devin.r2 §5; decisions.md:3449-3450 |
| 5 | On the new TS dev: symbol-resolved context (5.3) + a model-free "undefined symbol" pre-check | R up (5.3, guess); P up (≈ 14/57 old-dev FPs were that type, judged by eye) | M effort; 2 runs/arm ≈ $12 | claude.r1 §3; devin.r1 rank 4; references reached the model in only 12/48 chunks (058) |
| 6 | Verifier on Nemotron 3.5 Lightning (`nvidia/Nemotron-3_5-Lightning`, $0.06/$0.24) | cost ≈ −$0.0075/PR (−10%, estimate); P/R unmeasured | 2 runs ≈ $6 | **Precondition:** set `config/prices.json:10` (`nvidia/Nemotron-3_5-Lightning`; erratum after vote2: v2 said `:9`, which is the $0 NVIDIA-route Ultra id) from Nebius `models_info` (today a placeholder → $5/$15 fallback), one smoke call to confirm the id, decision entry. Old-dev results are a hypothesis only. |

## 3. Cost plan
- **Today:** median $0.0626 / mean $0.0743 per PR (dev-3.5.md). Shares: diff 39%, ctx 48%, verifier 13%. Calls average ≈ 19k output tokens per generator call and ≈ 2k per verifier call. The reasoning share is unmeasured (item 2 measures it).
- **Models per stage (unchanged):** reviewers and verifier on 3.5 Super VL ($0.30 in / $0.06 cached / $0.90 out, Nebius `models_info`). Fixes on 3 Super. Judges: 3 Super (v1), Qwen3-235B (x1).
- **Cuts (estimates):**
  - Lenient parser avoids some parse retries: ≤ $0.015/PR ceiling, overlapping with the fresh-retry saving (codex.r1).
  - Lightning verifier: ≈ −$0.0075/PR (item 6).
  - Caching: 0 cached calls in the completed dev runs, so $0 today; the frozen prompts share only a small prefix.
- **$/PR after:** mean ≈ $0.060–0.070 (5–20% lower) if items 1 and 6 both pass (estimate). The reviewers stay the cost, and Token Factory ignores reasoning budgets (070).

## 4. Don't do
- Any further Cal.com run (069b). Any F claim from one dev run or from n = 74 deltas inside ±8–10 pts.
- Retry a lost lever without a new reason: confidence thresholds (056), whole-run votes (064; levers-v2 2-of-3), quote-gated evidence (065), broad lenses or a missed-issue pass (070), a bigger model (071), per-PR caps (levers-v2).
- "both bypasses the verifier" (+6 TP / +8 FP). Dropping the verifier (inconclusive ΔF; it raises P).
- Scanning `.tracehound/cache`, opening held-out seed sets, or copying dataset text into docs.
- Product calls to any non-Nemotron provider (AGENTS.md). Building from last week's competitor announcements.
- Mining 80 SZZ PRs before the pilot has measured yield and minutes per label.

## Changes from v1 (vote1)
- devin O1: pairing rule; E2 reported over paired and all chunks; unpaired chunks excluded from E3. **Accepted.**
- devin O2: cap enforced via `TRACEHOUND_BUDGET_TOTAL_USD` job-wide. **Accepted.**
- devin O3: Lightning precondition (prices.json placeholder). **Accepted.**
- devin minor: dev count replaces the Cal.com "1 of 10" motivation. **Accepted.**
- codex 1: replay corpus labelled as latest-response; B1 offline; B2 pays only changed retries; $4 covers judging too. **Accepted.**
- codex 2: E3 is ΔTP ≥ 0 ∧ ΔFP ≤ 0 under v1 and x1, mandatory on every path; strict reduction vs A. **Accepted** (ΔTP ≥ ΔFP can lower F, codex's arithmetic).
- codex 3 and scout's wording note: "+16 upper bound" and "known cause" removed. **Accepted.**
- ag notes: reasoning-off on fresh retry is now stated; item 2 kept. **Accepted.**
