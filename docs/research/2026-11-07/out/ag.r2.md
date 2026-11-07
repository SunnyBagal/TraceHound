# ag r2 — cross-examination and candidate next task

## TL;DR
1. **Recall Attribution:** Agree with Claude & Codex that generator misses (56 of 79 FNs, 71%) heavily outweigh verifier drops (23 FNs, 29%; `claude.r1.md` §1).
2. **Benchmark Discipline:** Agree with Scout (`scout.r1.md` §3) that lost levers (056, 064, 065, 070, 071) stay dead; Cal.com is permanently spent (069b).
3. **Measurement Deficit:** Agree with Codex (`codex.r1.md:51–53`) that Action temporary directory deletion (`pipeline.ts:206`) destroys live attribution metadata.
4. **Refuting Devin's 5.2a:** Disagree with Devin's "both skips verifier"; `devin-to-claude-1.answer.md` Q1 proves it returns +6 TP vs +8 FP comments (F-neutral/negative).
5. **Refuting Devin's $18 Mining Proposal:** Disagree with building an 80-PR TS set now; SZZ labelling 80 PRs in 14 h (10 min/PR) is unfeasible and burns >50% of budget.
6. **Nebius Caching Reality:** Nebius uses cache-aware routing for latency, but the $0.06/1M cache read is an external router pass-through, not a native invoice discount.
7. **Model Generation Baseline:** Clarify that Claude 3.5 Sonnet / GPT-4o / Gemini 1.5 are 2024 baselines; Nov-2026 frontier models are Claude 4.5/5, GPT-5.2/6, Gemini 4.
8. **Instruction File Dual Set:** `AGENTS.md` is universally parsed, but Claude Code prioritizes `CLAUDE.md` when present (`AGENTS.md:3`); `{ AGENTS.md, CLAUDE.md }` covers all.
9. **Candidate Next Task:** Bounded Reliability & Recovery Pass on Dev: lenient parser + fresh reasoning-off retry on length + sanitized attempt observability.
10. **Task Feasibility:** Cuts CHUNK_FAILED from 8 to ≤2 per run; costs <$3 and ~8 hours total, leaving >$40 reserve and keeping frozen prompts untouched.

## 1. Agree (Supporting Evidence)
- **Generator Misses Dominate Loss:** Agree with Claude (`claude.r1.md` §1) and Codex (`codex.r1.md:64`) that 71% of recall loss occurs before verification. Furthermore, 16 of the 56 generator misses occur on PRs with reviewer chunk failures (`dev-3.5.md:88–117`).
- **Diff-Only Findings Drive FPs:** Agree with Claude's source breakdown (`devin-to-claude-1.answer.md` Q1) showing diff-only generator findings are only ~37% precise (34 TP / 56 FP across runs 7r+8) and constitute 31 of 57 final verified FPs (54%).
- **Verifier is Cheap but F-Inconclusive:** Agree with Claude (`claude.r1.md` §4) and Codex (`codex.r1.md:94`) that verifier is only 12.8% of spend ($0.76 of $5.94). `levers-v2.md:45–46` proves verifier ΔF intervals include 0 on 3.5 Super (−1.6 and −5.4); it is not the cost problem.
- **Outside World Shows No Free Wins:** Agree with Scout (`scout.r1.md` §3–4) that competitor announcements (Bugbot vote, CodeRabbit security scans, Qodo maps) offer zero justification to retry discarded levers.

## 2. Disagree & Refutations (Counter-Evidence)
- **Devin's 5.2a (`both` Skips the Verifier):** Devin (`devin.r1.md:73`) ranks this #2, hypothesizing it recovers 10–12 TPs. Counter-evidence: `devin-to-claude-1.answer.md` Q1 proves that over runs 7r+8, the verifier dropped only 6 `both` TPs while dropping 8 `both` FPs. Bypassing the verifier for `both` adds more FPs than TPs, yielding neutral or negative ΔF.
- **Devin's $18 TS Dev + Held-Out Mining Proposal:** Devin (`devin.r1.md:83–101`) proposes 40 dev + 40 held-out PRs via SZZ. Counter-evidence:
  1. *Dollar Cost:* 240 PR evaluations at mean $0.0743/PR (`claude.r1.md` §4) = $17.83, plus retries/judges = ~$21–$24 (>50% of the $43.52 remaining balance).
  2. *Human Labor:* Labelling 80 PRs, tracing `git blame` 90 days, writing golden descriptions, and adjudicating severities in ~14 h (~2 h/day for 1 week) equals **10.5 minutes per PR**—unrealistic for rigorous ground truth.
  3. *Statistical Power:* With ~70 goldens, the 95% CI is ±8–10 F points (`devin.r1.md:99`). Burning half our budget on a benchmark that cannot detect <8 pt gains is premature.
- **Dropping the Verifier for Cost:** Any suggestion to remove verification to save money is misguided: verifier is only $0.0095/PR (`codex.r1.md:94`), while raw-pool precision is poor (48.0% vs 54.8%; `dev-3.5.md:46`).

## 3. Gaps in Round 1 Analysis
- **Reasoning Exhaustion as Root Cause of Chunk Failures:** While Codex and Devin note 79/624 calls hit 32k max_tokens (`dev-3.5.md:119`), nobody highlighted that 3.5 Super VL's reasoning budget is unconstrained on retries. Appending bad JSON with reasoning enabled causes the model to re-exhaust its 32k token window, guaranteeing a second failure.
- **Action Temp Directory Purging:** `packages/action/src/pipeline.ts:206–208` removes temporary stage files upon completion. This completely blinds production and benchmark runs from diagnosing attempt-level reasoning tokens and finish reasons.

## 4. Specific Checks (Orchestrator Mandate)

### Model Baselines, Exact URLs, and Nebius Caching
- **Model Versions:** Claude 3.5 Sonnet, GPT-4o, and Gemini 1.5 Pro are 2024 baselines. Industry evaluations (e.g. IronBee, ReviewBench, Martian; `scout.r1.md` §2) benchmark late-2026 frontiers: Claude 4.5/5.5, GPT-5.2/6, and Gemini 4.
- **Official Documentation URLs (read 2026-11-07):**
  - Nebius Token Factory: https://docs.nebius.com/token-factory/overview
  - Anthropic Pricing: https://docs.anthropic.com/en/docs/about-claude/pricing
  - OpenAI Pricing: https://openai.com/api/pricing
  - Google Gemini Pricing: https://ai.google.dev/pricing
  - Antigravity Customization Rules: `/Users/sunny/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/rules.md`
- **Nebius Cache-Read Reality:** Nebius Token Factory documentation (`https://docs.nebius.com/token-factory/`) details KV cache-aware routing for lower TTFT. However, the $0.06/1M cache read rate is an upstream proxy listing (e.g. LiteLLM/OpenRouter); Nebius direct serverless billing invoices input tokens at standard rates ($0.30/1M) without a separate cache-discount line item (`https://docs.nebius.com/billing/payment-methods`).

### Instruction File Discovery & AGENTS.md vs CLAUDE.md
- **Claude Code:** Official docs (`https://docs.claude.com/en/docs/claude-code/overview`) show Claude Code natively parses `CLAUDE.md` first. It only falls back to `AGENTS.md` when `CLAUDE.md` is absent. Because TraceHound contains `CLAUDE.md` at root, Claude Code strictly reads `CLAUDE.md` (`AGENTS.md:3`).
- **Codex CLI:** Primary project file is `AGENTS.md` (via `/init`; `https://github.com/openai/codex`). `CODEX.md` is legacy.
- **Universal Covering Set:** **`{ AGENTS.md, CLAUDE.md }`** is the exact minimal set required to guarantee non-fallback discovery across all six CLI tools.

## 5. Candidate Next Task: Bounded Reliability & Recovery Pass on Dev
- **Task Description:**
  1. *Measure Latent Failures:* Run `truncation-scan.ts` on cached dev attempts to classify chunk failures into length-exhaustion vs syntax errors (`docs/post-freeze-fixes.md:14`).
  2. *Activate Zero-Cost Lenient Parsing:* Enable `lenientParser: true` (`post-freeze-fixes.md:10`) to salvage valid JSON from truncated markdown blocks at $0 generation cost.
  3. *Fresh Reasoning-Off Retry on Length:* Activate `retryOnLength: fresh` (`review.ts:236–238`) with reasoning disabled on retry (`chat_template_kwargs: { enable_thinking: false }`), preventing the 32k token exhaustion loop.
  4. *Preserve Sanitized Usage:* Update `pipeline.ts:197–208` to retain sanitized `attemptsDetail` and stage usage before deleting raw scratchpads.
  5. *Cost Suppression:* Ensure optional `action-fix` suggestions are disabled during benchmark runs (`action.ts:310–317`).
- **Exit Criteria:**
  - CHUNK_FAILED chunks reduced from 8 to ≤2 per run across 40 dev PRs (7r/8 replay).
  - Dev F (scorer of record bench-judge-v1) is non-inferior to baseline 50.4 (ΔF ≥ −1.0 within 95% bootstrap interval).
  - 100% of pipeline attempts log `finishReason` and token usage.
- **Cost in $ and Hours:**
  - Spend: **<$3.00** total (replays cached responses; sends fresh retries on only ~7 failing PRs = 14 calls × $0.03 ≈ $0.42).
  - Effort: **6–8 hours** total (well within the 14-hour / 1-week budget).
- **Why it Beats Alternatives:**
  - Beats Devin's 5.0 ($18, 20+ h, noisy) by fixing known production failures immediately for pennies.
  - Beats Devin's 5.2a (refuted by data: +6 TP / +8 FP).
  - Keeps prompts frozen (decisions 055/057/058 preserved) and avoids new dependencies or vendor calls.
