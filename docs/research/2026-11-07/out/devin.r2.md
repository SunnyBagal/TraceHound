# devin r2 — cross-examination

**TL;DR**
1. claude's attribution holds and nothing I found contradicts it. Generator misses (56) outweigh verifier drops (23), and `both` findings are about 64% precise against about 37% for diff-only. It matches levers-v2's raw FN 29/28 and 058's agreement set (P 57.7%).
2. That kills my r1 rank 2 ("both skips the verifier"). claude's replay arithmetic is +6 TP / +8 FP over two runs, so it is about neutral. Dropped.
3. ag's instruction-file matrix is wrong for this repo. Claude Code reads AGENTS.md **only when there is no CLAUDE.md** (official docs), and Codex has no default `CODEX.md`. AGENTS.md:3 is right.
4. ag's comparison models (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5) are not current (scout's sources name 2026 models), the URLs are not pricing pages, and the product may not call them anyway.
5. ag's "reasoning drives 87% of cost" is wrong: 87% is the reviewer stages' total share, and the reasoning/visible split is not recorded.
6. The TS set at $18 is a realistic central figure (claude's $0.0734/PR gives $17.6), but plan for $21–25 with a cap. **SZZ labelling does not fit one week at 2 h/day:** my estimate is 23–37 h, so 2–4 weeks.
7. Gap nobody covered: the bench cache lets a **cache-replay A/B** re-run dev where only the changed stage makes new calls. Run-to-run noise drops out, and the cost falls under $3.
8. Gap: at n = 74, a one-week task cannot have an F-based exit criterion. It needs a mechanism count plus a no-harm check.
9. **Candidate next task:** turn on the existing lenient parser + fresh reasoning-off retry (#67) and measure them by cache-replay on the 40 dev PRs. Exit criterion: terminal CHUNK_FAILED ≤ 2 (baseline about 8), no net harm on the changed PRs. Cost < $3, about 10–12 h.
10. Next after it: a 2-repo SZZ pilot (yield and minutes per label), then the full TS dev + held-out set. ReviewBench's portal is a possible external blind scorer later.

## 1. Agree

- **claude: generator misses dominate (56 vs 23 golden-runs).**
  - Official raw FN is 29 + 28 = 57 (`docs/bench/levers-v2.md:45-46`). The one-golden difference is the run-8 re-judging inversion (`comms/codex-to-claude-2.answer.md:5-11`).
  - Persistent misses split 24 absent from pool-raw in both runs, 6 verifier-dropped in both, 5 mixed (`codex-to-claude-2.answer.md:12-13`).
  - No contradicting evidence in my lane.
- **claude: `both` is the most precise source.** Pooled over 7r/8: both 34/53 = 64.2%, diff-only 34/90 = 37.8%, ctx-only 23/47 = 48.9% (`comms/devin-to-claude-1.answer.md:12-17`).
  - Same direction as 058's 3 Super agree-diff-ctx set: P 57.7%, R 20.3% (`docs/decisions.md:2835`).
  - Caveat: these are comment-level counts, and "both" is location-only agreement (|Δline| ≤ 3, `scripts/bench/agree-rule.ts:7-8`), so it can pair two different claims.
- **codex: reliability and observability first** (`out/codex.r1.md:110`). Agreed. My candidate task (§4) is that pass, with a cheaper and less noisy measurement design.
- **codex: medians don't add; reasoning tokens are not split out** (`out/codex.r1.md:78-79, 45`). Agreed; this is the basis of two of my disagreements with ag.
- **scout: there is no new reason to retry 056/064/065/070/071, and the matcher must be fixed before a new held-out set exists** (`out/scout.r1.md:8-9, 86`). Agreed.
  - scout's Qodo item (125 PRs, 703 "bugs that were later fixed", https://www.qodo.ai/blog/which-llm-should-review-your-code/, `scout.r1.md:55`) shows a vendor using fix-linked labels, which is the label source my r1 §4 proposes.
- **ag: Devin CLI loads AGENTS.md and CLAUDE.md, with a 16 KiB cap.** First-hand: in this session both files arrived as always-on rules, and CLAUDE.md was cut with "[Rule content truncated to 16384 bytes]".

## 2. Disagree (with counter-evidence)

| claim | counter-evidence |
|---|---|
| ag TL;DR 9–10: "Claude Code auto-loads AGENTS.md"; "{AGENTS.md} alone covers all six" | Claude Code memory docs, "When Claude Code reads AGENTS.md": "By default, Claude reads `AGENTS.md` only when you have no `CLAUDE.md` in your working directory or above it." The table there: an AGENTS.md **and** a CLAUDE.md → "Your `CLAUDE.md` files only" (https://code.claude.com/docs/en/memory, fetched 2026-11-07). This repo has a CLAUDE.md that does not import AGENTS.md (grep `@AGENTS`/`AGENTS.md` in CLAUDE.md: 0 hits). So here Claude Code reads CLAUDE.md, as `AGENTS.md:3` says. |
| ag §3: Codex loads `CODEX.md` | Codex docs, "How Codex discovers guidance": per directory it checks `AGENTS.override.md`, then `AGENTS.md`, then names in `project_doc_fallback_filenames`. `CODEX.md` is not on the page (https://developers.openai.com/codex/guides/agents-md, fetched 2026-11-07). |
| ag §1: Claude 3.5 Sonnet/Haiku, GPT-4o(-mini), Gemini 1.5 as "Nov 2026" comparison models | scout's sources from Oct 2026 name Claude Opus 5.5 / Sonnet 5.5, GPT-6.1, Gemini 4 (IronBee, https://ironbee.ai/blog/the-honest-raw-llm-code-review-benchmark) and Claude Sonnet 5 (ReviewBench) (`scout.r1.md:45, 48`). The cited URLs (`https://nebius.com`, `https://x.ai`, "Built-in rules.md") are not pricing pages. Irrelevant for the product either way: AGENTS.md "Models and keys" allows only Nemotron on Token Factory. I did not verify the Nebius cache-read rate; it was not my lane. Attempt records show 0 cached calls (`comms/codex-to-claude-1.answer.md:27`), so it saves $0 at today's usage. |
| ag TL;DR 8: "reviewer reasoning output drives 87% of cost" | 87% = diff 39% + ctx 48%, input included (`comms/codex-to-claude-1.answer.md:37`). Reasoning vs visible tokens is not in these records (same file :36; `codex.r1.md:79`). |
| ag §2: "$0.0599/PR median" from median in × median out | Medians don't add (`codex.r1.md:78`). The measured median is $0.0626 (`docs/bench/results.md:282`). |
| ag TL;DR 6, §2: "verifier dropped 23 TPs vs 42 FPs"; bypassing it on agreed findings "saves money while gaining recall" | 23 is golden-run credit loss inferred from credit absence, while 42 is comment-level net FP. Comment-level net TP loss is 22, and verdict-aligned dropped TP comments are 10 + 10 (`codex-to-claude-2.answer.md:8-11`; `devin-to-claude-1.answer.md:18`). The bypass returns +6 TP / +8 FP (`devin-to-claude-1.answer.md:18-19`). The saving is about 37.5 of about 117 verifier calls per run × $0.0095/PR verifier cost (`codex.r1.md:94`) ≈ $0.003/PR [derived]. |
| ag §2: Nano "lacks diff reasoning depth … vendor evals confirm" | Unsourced; Nano is unmeasured on review (`results.md` §4 has no Nano row). Should be [UNVERIFIED]. |
| claude r1 §5: on Cal.com run 4 the verifier "lowered F 58.5 → 57.1" | 58.5 is review-diff-v1 alone. Verifier on vs off there is pool-raw 57.8 → 57.1 (`docs/decisions.md:3410`). A published count; used here only to correct the label. |
| my own r1 rank 2 (both bypass) | Withdrawn on claude's counts (above). |
| my own r1 §2(d): "lenient parser can be replayed on cached failed replies at $0" | Half wrong. Scanning the shared cache is off-limits because it also holds Cal.com replies (`devin-to-claude-1.answer.md:27-28`; `codex.r1.md:104`). And the reviewer client writes but never reads the cache (`scripts/bench/run-test-set.ts:123-141`: "cache reads off … the cache is still refreshed"), so each key holds only its **last** writer. Corrected design in §4: pipeline key lookups, not a scan. |

## 3. Gaps that matter for choosing one task

1. **Cache-replay A/B (nobody raised it).**
   - Re-running the dev pipeline with reviewer cache reads on returns cached replies for every request except those the change alters. With `parser: lenient`, a cached invalid first reply may parse. With `retryOnLength: fresh`, only length-ended chunks send a new request.
   - The flags-off code is byte-identical to the freeze, cache keys included (`docs/post-freeze-fixes.md:5`), so the two arms differ only on failed chunks. Temperature-0 spread (35.6–48.0 F, results.md:144) drops out of the comparison.
   - Limits:
     - The baseline arm is the cache's last-writer state, not run 7r (see above). It must be judged afresh, which is cheap.
     - Empty-content replies were never cached (`truncation-scan.ts` NOTE), so they go out again. Run the baseline arm first so that the treatment arm reads the same refreshed entries.
     - Which runs wrote last is [UNVERIFIED]. 064 used the 061 runner (`decisions.md:3248-3249`), and I assume 067 did too.
2. **One-week exit criteria cannot be F at n = 74.** Per-run ΔF intervals are about ±8–10 points (`levers-v2.md:45-46`). An exit criterion has to be a mechanism count (failed chunks, recovered findings) plus a no-harm check on judged counts.
3. **Labelling hours were not costed by anyone, me included.** Estimate for §5 below: 5–10 min per SZZ candidate, at least 2 candidates screened per kept PR, 80 kept PRs ≈ 15–27 h. Add a 20% second-label sample (3–5 h) and the mining script (about 5 h): **23–37 h, which is 2–4 weeks at 2 h/day.** Not measured; the pilot measures it.
4. **An externally blind scorer already exists.** ReviewBench scores on its portal, and our side may never see `golden/` (`docs/bench/reviewbench.md:175-183`).
   - [Inference] Most of its 219 PRs were never in our 25-PR test runs (`results.md:152`).
   - Unknown [UNVERIFIED]: whether the portal accepts a chosen or TS-only subset, and its price per run.
   - Its metric rewards volume (`results.md:171`), so it is a held-out *check*, not a replacement for bench-judge-v1.
5. **The "about 14 of 57 FPs are symbol-undefined claims" lead** (`claude.r1.md:10`) is a cheap model-free check, but the category was found by reading dev FPs. Any filter for it is selected on dev and needs the fresh set to count.

## 4. Candidate next task: measure #67's generation-recovery switches by cache-replay

- **What.**
  - The benchmark-lane runner gets two options: reviewer `readCache: true`, and pass-through of `--parser` / `--retry-on-length`. Code at `scripts/bench/run-test-set.ts:140`; the switches already exist (`docs/post-freeze-fixes.md:9-10`).
  - Arm A = flags off, B = `parser: lenient` + `retryOnLength: fresh`. Same 40 dev PRs, bench-judge-v1 + x1, pre-registered plan pushed first.
  - `attemptsDetail` (already on at HEAD) records each failed reply's `finishReason`. That yields the length-vs-invalid-JSON split, which is "not available" today (`devin-to-claude-1.answer.md:24-26`).
- **Exit criterion (pre-registered).**
  - E1 (identity): arm A is ≥ 95% cache hits, with misses reported.
  - E2 (primary): terminal CHUNK_FAILED in B ≤ 2, against A's count (expected about 8 per run, `codex.r1.md:67`).
  - E3 (no harm): on the PRs whose output changed, ΔFP ≤ ΔTP under v1 with x1 agreeing in sign, and every unchanged PR scores identically.
  - Adoption = E2 ∧ E3, via a decision entry. ΔF is reported as within noise.
- **Cost.**
  - Estimate < $3, capped with `TRACEHOUND_BUDGET_RUN_USD`. That covers fresh retries on ≤ 17 failed chunks (about $0.03 each, from the 32k-output cap × $0.90/M), verifier calls for recovered findings, both arms' judging (about $0.0005/PR/row, results.md:276), and the cache misses.
  - Fallback if E1 fails: 2 fresh runs per arm ≈ 4 × 40 × $0.0734 ≈ $11.7. E2 stays measurable; F does not.
- **Hours.** About 4 h runner option + tests, about 2 h runs, about 3–4 h plan / report / decision entry: **10–12 h, inside one week.** It must run in the benchmark lane (claude or the owner), since the dev data is in `tracehound-bench`.
- **Why it beats the alternatives.**
  - It targets the only generator-miss subset with a known mechanical cause: 16 of 56 misses are in PRs with a failed chunk (`claude.r1.md:7`), and that is an upper bound.
  - The exit criterion is a count, so reusing the dev set doesn't select on its F. It is not a retry of any listed loss, and it fixes a product failure: 1 of 10 Cal.com PRs posted nothing (`decisions.md:3411-3413`).
  - The alternatives:
    - TS set: doesn't fit a week (gap 3).
    - Both bypass: about neutral.
    - Symbol filter: needs fresh data (gap 5).
    - 5.3 symbol context: needs the TS set.
- **Honest upside.** At most 16 golden-runs over 2 runs (R ≤ +10.8 points if every one were recovered, which is not expected). The likely gain is reliability and a few TPs. No ranking claim follows.

## 5. TS dev set + held-out (the brief's check)

- **$18 is realistic as a centre.** 40 × 2 × 2 × $0.0734 (`claude.r1.md:50`) = $11.7 for one A/B; 40 × 2 × $0.0734 = $5.9 for the held-out final; total $17.6.
  - TS diffs cost about the same per PR: Cal.com run 4 median $0.0717, max $0.1298 (`results.md:275`).
  - The tail is at most $0.3031/PR (`results.md:282`), so set a run cap. Budget $21–25 with void-run contingency, out of $43.52.
- **SZZ at about 2 h/day: not in one week** (gap 3). The one-week-sized version is a 2-repo pilot. Exit: yield (kept PRs per candidate, Medium+ labels per PR) and minutes per label, measured.
- After §4, the pilot is my second choice. The full set (40 dev + 40 held-out, split by repo, matcher bench-judge-v1 fixed in advance, labels only from fix commits) is third.

Comms: no files addressed to devin. Not checked: the Nebius cache-read price (ag/scout lane), and the ReviewBench portal's subset options.
