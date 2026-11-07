# TraceHound — what to do next (research run, 2026-11-07)
Five agents: claude (orchestrator), codex (t14), devin (t1b), scout = Grok (t18), ag = Antigravity (t15). Research only:
no code edits, no commits, no paid calls (0 Nebius calls; the public `models_info` GET is free). HEAD `b498647`.
Inputs: `CONTEXT.md`, the briefs in `briefs/`, outputs in `out/`, questions in `comms/`, spot-checks in `VERIFY.md`, and `DRAFT-CONCLUSION.md` (v2; v1 kept).
Blindness: no Cal.com golden or tool comment was opened. claude read dev-only per-comment score files and gave the workers counts only.

## 1. Current state (5 lines)
- Product `pool-verify-v1` on Nemotron 3.5 Super VL, tag `review-freeze-2` (`0aeef06`). Cal.com blind (n = 23): F 57.1. Tied with Augment, Cursor, Greptile and Copilot; ahead of CodeRabbit (`docs/bench/results.md` §2).
- All 50 PRs: F 52.2 (x1 55.4). Behind Augment, −14.0 [−22.6, −4.7]; tied with Cursor (−1.6) and Greptile (+2.8) (results.md §3).
- Dev (40 non-TS PRs, n = 74): P 54.8 / R 46.6 / F 50.4 (3.5, mean of 2). Spread over five 3 Super runs: 35.6–48.0 F (results.md §4).
- Cost: $0.063 median / $0.074 mean per PR. The diff reviewer takes 39%, the ctx reviewer 48%, the verifier 13% (dev-3.5.md; `out/claude.r1.md` §4).
- Cal.com is spent (069b). There is no TS dev set and no fresh held-out set. About $43.52 of credit is left. Nothing from plan #71 has landed.

## 2. Goal framing: what "beating" means, the gap, the verdict
- **The contest:** reviewers on the same benchmark, at a cost per PR. "Beating" a tool counts only with a 95% PR-bootstrap interval
  of ΔF that excludes 0, on a held-out set, under a matcher fixed before the run (bench-judge-v1; x1 alongside). A point-estimate rank never counts.
  Cost per PR is reported beside F. The tools' own cost per PR is **not measured** (their recorded reviews carry no cost); measuring it needs their published prices per review.
- **Gap today:**
  - All-50: behind Augment by 14.0 F points (interval-backed). The Cursor (−1.6) and Greptile (+2.8) gaps are inside noise.
  - Cal.com, 10 PRs: no gap except CodeRabbit is interval-backed.
  - The 40 dev PRs are the selection set, so all-50 is not a held-out result.
- **Reachable at about 2 h/day?**
  - Interval-backed parity, or better, against Cursor or Greptile on a fresh held-out set: plausible within 6–8 weeks. A 40 + 40 set at ≈ 70 goldens still only separates effects of ≥ 8–10 F points (devin.r1 §4; levers-v2 intervals).
  - Interval-backed ahead of Augment: not supported by evidence. It needs about +14 F; the best measured lever was the 3.5 swap (+8.1 [+1.4, +14.4] dev v1), and every lever since 059 except that swap lost.
- **Verdict: continue, with a narrower goal.** The goal: reliable output, a fresh TS held-out set, and one context lever tested on it. Claim "tied with Cursor and Greptile on open models at ≈ $0.07/PR" until a held-out result says more. Stop if T1 and the SZZ pilot both come back negative, i.e. no reliability gain and labelling too slow to build a set.

## 3. THE conclusion
**One next task (≤ 1 week, ≤ 14 h, ≤ $4 job-wide):** a pre-registered dev A/B of the two generation-recovery switches already built in #67.
- Arms: A = flags off; B1 = `parser: lenient`; B2 = lenient + `retryOnLength: fresh`, on the 40 dev PRs.
- Corpus: a latest-response replay corpus rebuilt from dev-only cache keys (no cache scan). Fallback: one fresh arm A capture.
- Costing: B1 is derived offline ($0). B2 pays only for changed retries.
- **Exit criterion:** all three must hold.
  - E2: terminal CHUNK_FAILED in B2 ≤ 2 and strictly below A (≈ 8 per completed run today), with 0 PRs left empty by a failure.
  - E3: on the changed PRs, ΔTP ≥ 0 and ΔFP ≤ 0 under both v1 and x1.
  - E4: strict-valid replies parse to identical findings.
  - If coverage or judging is incomplete, the result is inconclusive. Full text: `DRAFT-CONCLUSION.md` §1.
- **Why it wins:**
  - It is the only measured delivery defect with a fix already built: 8 terminal failed chunks per run; 7/40 PRs lose a chunk and 3/40 end empty (068).
  - The gate is a count, so reusing the dev set does not select on F.
  - It retries no lost lever and fits a week. Every alternative is either F-neutral (the "both" bypass) or needs a dataset that doesn't exist yet.
- **Vote tally:** vote1: AGREE 2 (ag, scout), OBJECT 2 (devin, codex); 6 evidence-backed objections, all accepted into v2.
  vote2: **AGREE 2 (codex, ag), OBJECT 2 (devin, scout)**. scout's objection is a citation fix (Lightning is `prices.json:10`,
  not `:9`), applied here as an erratum. devin's is recorded dissent (§8); claude recommends adopting it when the plan is written.
  Notes folded in from vote2 (non-blocking):
  - Use one shared Budget instance, or sequential processes, because reservations are instance-local (`budget.ts:28-65`, codex).
  - B1's verifier and judge calls count against the $4 cap (devin).
  - Re-judge A's changed PRs with the same judge protocol, because re-judging inversions exist (devin).

## 4. Ranked plan
| # | fix | effect on precision | effect on recall | cost | evidence |
|---|---|---|---|---|---|
| 1 | T1 recovery A/B (above) | ~unchanged (E3 guards it) | unmeasured; 16 of 56 raw-uncredited misses share a PR with a failed chunk (association only) | ≤ $4, ≤ 14 h | dev-3.5.md:86–124; claude.r1 §1–2; codex/devin vote1 |
| 2 | Observability: verifier `attemptsDetail`, per-attempt input/reasoning tokens, lineage kept past the Action's temp-dir delete | none | none | $0, ~4 h | `review.ts:38-67`, `verify-ctx.ts:24-50`, `pipeline.ts:196-208` (codex.r2) |
| 3 | 2-repo SZZ label pilot: yield, minutes per label, second-label agreement | — | — | $0 model, ~10 h | devin.r2 §3; SZZ caveats in codex.r2 (Herbold 2022, Rani 2024) |
| 4 | Fresh TS dev (40) + held-out (40), split by repo, list hash committed first, matcher fixed | enables claims | enables claims | ≈ $18–25 + 23–37 h | devin.r1 §4 / r2 §5; `decisions.md:3449-3450` |
| 5 | On the new TS dev: symbol-resolved context (5.3) + a model-free "undefined symbol" pre-check | up (≈ 14/57 old-dev FPs were that type, judged by eye) | up (guess; references reached the model in 12/48 chunks, 058) | M; ≈ $12 per 2-run A/B | claude.r1 §3; devin.r1 rank 4 |
| 6 | Verifier on 3.5 Lightning | unmeasured | unmeasured | −$0.0075/PR est.; ≈ $6 to test | precondition: set `config/prices.json:10` (`nvidia/Nemotron-3_5-Lightning`, placeholder → $5/$15 fallback) to $0.06/$0.24 from `models_info`; leave `:9` (the $0 NVIDIA-route Ultra id) alone; smoke-check the id (devin vote1 O3, scout vote2) |
Measured basis for the order (dev 3.5, runs 7r + 8, per golden-run):
- 69 credited, 56 never credited in the raw pool, 23 raw-credited but lost after verification (an inferred join; codex-to-claude-2.answer).
- `both`-source findings: P 64.2%. diff-only: 37.8%. Diff-only findings are 31 of the 57 final FPs.
- 38 of 57 final FPs are 19 findings that recur in both runs. That is why voting can't remove them.

## 5. Cost plan
- **Per stage, unchanged:** both reviewers and the verifier on 3.5 Super VL ($0.30 in / $0.06 cached in / $0.90 out, Nebius `models_info`, verified). Fixes on 3 Super. Judges: 3 Super (v1), Qwen3-235B (x1; report only).
- **Caching:** 0 cached calls in the completed dev runs → $0 saving today. Frozen prompts share only a small prefix.
- **Cuts (estimates):**
  - Lenient parser: ≤ $0.015/PR ceiling from avoided retries, overlapping with fresh retry.
  - Lightning verifier: −$0.0075/PR.
  - Fixes off in benchmark use: already off.
- **$/PR:** before $0.0626 median / $0.0743 mean. After, estimate: mean ≈ $0.060–0.070 if items 1 and 6 pass.
- **Why it stays there:** the reviewers' ≈ 19k output tokens per call are the cost, and Token Factory ignores reasoning budgets (070). Item 2 measures the reasoning share before any cut is attempted there.
- **Budget:** T1 ≤ $4 → ≈ $39 left. Items 4 + 5 ≈ $30 → ≈ $9 reserve. There is no room for a ReviewBench final ($107) or a third model family.
- Comparison prices (Claude, GPT, Gemini): only scout.r2's official-page figures survived checking (e.g. GPT-6 Astra and Claude Fable 5 at $10/$50, Gemini 3.8 Flash $0.75/$3.75 per scout). ag.r1's 2024-model table is dropped (VERIFY.md). Off-Nebius models are out of bounds for product code anyway.

## 6. Status of Devin's plan (PR #71, open)
| item | status at HEAD | after this run |
|---|---|---|
| 5.0 measurement setup | not started; "Cal.com run at the end" invalid (069b) | **kept, rewritten** as items 3–4 (SZZ pilot → TS dev + held-out) |
| 5.1 stop losing chunks | parser / fresh retry built off, unmeasured (#67); split-halves and null-line rescue not started | **next task (T1)**; split-halves and null-line rescue deferred until T1 reports |
| 5.1 observability | reviewer `attemptsDetail` done; verifier, input tokens and lineage missing | **item 2** |
| 5.2a `both` skips the verifier | not started | **dropped** (+6 TP / +8 FP replay) |
| 5.2b agreement ordering (cap) | built off; levers-v2: no gain | dropped |
| 5.2c three-way verdict, 5.2d similarity dedupe | not started | deferred (new frozen prompt; needs fresh data) |
| 5.3 symbol k-hop context | not started; graph still unused in the review path | **item 5**, on the TS dev set only |
| 5.4 analyzers with deps | not started | deferred; tsc-only could join item 5 |
| 5.5 specialists / 5.6 sandbox confirmation | not started | parked (070 precedent; L effort) |
| 5.7 repo rules into prompts | not started | product-only, not a benchmark lever |
| §6 don'ts | valid | extended (§4 of DRAFT-CONCLUSION) |
Stale claims (devin.r1 §2):
- "Verifier cuts recall 61.5 → 46.6": true as recall, but not shown to cost F (ΔF intervals include 0).
- The Cal.com-based targets: moot now that Cal.com is spent.

## 7. Agent context system (adjusted to the verified auto-load rules)
Verified rules (VERIFY.md):
- Claude Code reads AGENTS.md **only when there is no CLAUDE.md**, and never reads anything under `.agents/` by discovery.
- Codex reads `AGENTS.override.md` → `AGENTS.md` (32 KiB cap; no CODEX.md).
- Antigravity reads `AGENTS.md`/`GEMINI.md`/`.agents/rules/` up to the repo root.
- Devin reads AGENTS.md and CLAUDE.md, but truncated CLAUDE.md at 16 KiB in this session (devin.r2).
- Grok reads AGENTS.md (ag.r1, not re-checked).

Proposal:
- **`AGENTS.md`** (all non-Claude tools): stable rules only, < 8 KiB. Last line: "Current state: read `.agents/STATE.md` first."
- **`CLAUDE.md`**: keep the stable rules, but move the 150-line "Current state" block out (it is stale past 062 and over Devin's 16 KiB cap). Add `@AGENTS.md` and `@.agents/STATE.md` imports. Whether an explicit `@import` of a `.agents/` path loads is [UNVERIFIED]; test once, and if not, use `docs/STATE.md`.
- **`.agents/STATE.md`**: ≤ 60 lines, pinned to a commit SHA, rewritten by every merged decision PR, never appended. Draft: `STATE.draft.md`.
- **`.agents/LOG.md`**: append-only, dated one-liners for the human. Agents only grep it.
- Don't put STATE.md in `.agents/rules/`: only Antigravity would auto-load it there, and the pointer works for everyone.

## Verification (step 4)
`VERIFY.md` records 24 spot-checks: scout 6, ag 7, codex 6, devin 5 (the two round-2/3 rows count for scout and codex).
- All of codex's, devin's and scout's checked claims held; devin's A/B cost is an estimate (⚠️).
- ag failed 4: Claude Code loading AGENTS.md here, Codex CODEX.md, the 2024 comparison models, and the cache-rate citation (the rate itself is real).
- Those are dropped or corrected above. ag's official Nebius base prices held.
- claude's own errors, caught by others and corrected:
  - verifier ≈ 2k output tokens per call, not 6k;
  - the Cal.com verifier on/off comparison is 57.8 → 57.1;
  - "23 verifier drops" is an inferred credit join, not a verdict count.

## 8. Recorded dissent and open questions for the owner
- **Dissent (devin, vote2, evidence-backed, unresolved by vote):** E3's "ΔTP ≥ 0 ∧ ΔFP ≤ 0" rejects any recovery made at the
  pipeline's own precision. Kept precision is 54.7 / 54.8% on 3.5 dev (`levers-v2.md:45-46`), i.e. ≈ 0.83 FP per TP. devin's
  replacement: over all 40 PRs, unchanged PRs identical, under v1 and x1, **ΔTP ≥ 0 ∧ P_B ≥ P_A**; report the recovered findings'
  own precision. claude's adjudication: correct. On a paired replay, R_B ≥ R_A ∧ P_B ≥ P_A ⇒ F_B ≥ F_A, which meets codex's
  concern (ΔTP ≥ ΔFP can lower F) without forbidding every FP. **Recommend writing devin's E3 into `recovery-plan.md`.** codex and ag
  voted for the stricter v2 wording; the owner decides.
- Not covered or unresolved:
  - Whether ReviewBench's portal accepts a TS-only subset as an external blind check (devin.r2 gap 4).
  - Grok's and Cursor's exact load rules (not re-verified).
  - Labelling minutes per SZZ PR (unmeasured; item 3 measures it).
- **Owner decisions needed:**
  - (1) Approve T1 and its $4 cap.
  - (2) Approve a data directory outside the repo for the TS sets.
  - (3) Approve moving CLAUDE.md's "Current state" into `.agents/STATE.md`.
  - (4) Is "tied with Cursor/Greptile at ≈ $0.07/PR on open models" an acceptable public target, or is beating Augment a must? If it is a must, the evidence says the current approach won't get there.
