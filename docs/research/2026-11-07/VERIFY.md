# Spot-checks by claude (orchestrator), 2026-11-07
Each row: claim → source opened/rerun → verdict. ✅ holds · ⚠️ partly · ❌ fails (dropped or flagged in REPORT).

## scout
| claim | check | verdict |
|---|---|---|
| Greptile: LLM self-scored severity "nearly random" | fetched greptile.com/blog/make-llms-shut-up: "The LLMs judgment of its own output was nearly random." | ✅ |
| Bugbot launch: 8 parallel passes, randomized diff order, majority vote | fetched cursor.com/blog/building-bugbot: "Run eight parallel passes with randomized diff order … Majority voting to filter out bugs found during only one pass" | ✅ |
| Greptile "~10%" model-inversion sentence exists | fetched greptile.com/blog/how-to-build-a-code-review-agent: "bug catch rates go up ~10% when you do this" | ✅ (chart claim not rechecked) |
| ReviewBench board top row OhMyBug F1 83.0 / P 92.0 / R 75.6 (2026-10-25) | fetched review-bench.ai: "1 OhMyBug 83.0% 92.0% 75.6% 2026-10-25" | ✅ |
| CodeRabbit "59 static analysis tools", updated 1 Nov 2026 | fetched docs.coderabbit.ai/tools/reference: "Last updated: November 1, 2026 … 59 static analysis tools" | ✅ |

## ag
| claim | check | verdict |
|---|---|---|
| Nebius 3.5 Super VL $0.30/$0.90, Nano $0.06/$0.24, Ultra $1/$3, Lightning $0.06/$0.24 | fetched nebius.com/services/token-factory/models/nvidia-nemotron-models-inference | ✅ (ag cited only "https://nebius.com") |
| Nebius cache read $0.06/1M (80% off) on 3.5 Super VL | the marketing page shows no cache rate; scout.r2 reports Nebius's public `models_info` lists $0.06 cached (not re-opened by claude) → claude fetched tokenfactory.nebius.com/api/public/models_info: `input_price_per_million_tokens: 0.3, input_cached_price_per_million_tokens: 0.06`; Lightning id `nvidia/Nemotron-3_5-Lightning` | ✅ rate real (ag's citation wrong); saves $0 today (0 cached calls) |
| Claude Code auto-loads AGENTS.md | code.claude.com/docs/en/memory: "By default, Claude reads `AGENTS.md` only when you have no `CLAUDE.md` in your working directory or above it" … "Not read: … anything under a `.agents/` directory" | ❌ as stated (this repo has CLAUDE.md, so Claude Code does NOT read AGENTS.md here) |
| Codex CLI loads CODEX.md | developers.openai.com/codex/guides/agents-md: checks `AGENTS.override.md`, then `AGENTS.md`, then `project_doc_fallback_filenames`; 32 KiB default cap; no CODEX.md | ❌ |
| Antigravity loads AGENTS.md / GEMINI.md / .agents/rules/ per directory up to repo root | fetched antigravity.google/docs/rules: "You can place an AGENTS.md or GEMINI.md file—or a .agents/rules/ directory—in your workspace folder and in any parent folder up to the repository root" | ✅ |
| Devin CLI loads AGENTS.md | docs.devin.ai nav has "Rules & AGENTS.md" and "AGENTS.md files for Devin"; ag's "first 16 KiB" not rechecked | ⚠️ (file name ✅, limit unverified) |
| Comparison models (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5) are Nov-2026 prices | these are 2024 models; current families are Claude 5 / GPT-6.x / Gemini 4 | ❌ (table dropped from REPORT) |

## codex
| claim | check | verdict |
|---|---|---|
| frozen prompt sha256s f77c…, 0c4d…, 7570… | same hashes in the 3.5 dev attempt records' `promptSha256` (run 7r, sentry PR 0) and decisions 055/057/058 | ✅ |
| fixes stage = 3 Super, temperature 0, 4,096 cap | `packages/action/src/fix.ts:15` FIX_MODEL `nvidia/nemotron-3-super-120b-a12b`; `:116` `temperature: 0, max_tokens: 4096` | ✅ |
| delivery cap default 15 | `.github/actions/tracehound-review/action.yml:15-18` `max-comments` default '15' | ✅ |
| verifier completion cap 16k | `verify-ctx.ts:129` `max_tokens: opts.maxTokens ?? 16_000` | ✅ |
| stage cost shares 39/48/13 | recomputed by claude from attempt `usage` (out/claude.r1.md §4) | ✅ |

## devin
| claim | check | verdict |
|---|---|---|
| reviewers drop non-integer line as `malformed` | `review.ts:151-153` | ✅ |
| pool sources both/diff/ctx computed but not given to the verifier | `pipeline.ts:92-98` "Sidecar metadata: never changes the bytes sent to the frozen verifier" | ✅ |
| no further Cal.com run allowed | `decisions.md:3449-3450` | ✅ |
| cache keeps invalid-JSON replies (non-empty content) when `cacheTruncated` true | `client.ts:299-301` | ✅ (so lenient-parser replay at $0 is possible *if* a dev-only cache exists — the shared `.tracehound/cache` mixes Cal.com) |
| A/B cost 40×2×2×$0.0743 ≈ $11.9 | arithmetic ✅; uses dev mean on non-TS repos, TS PR sizes not measured | ⚠️ estimate |

## round-2/3 additions
| claim | check | verdict |
|---|---|---|
| scout vote2: Lightning is `prices.json:10`, `:9` is the $0 NVIDIA Ultra id | `sed -n 1,12p config/prices.json` | ✅ (draft erratum applied) |
| codex.r2: verifier output 478,473 / 242 = 1,977 tokens per call | arithmetic on claude's own totals | ✅ (claude.r1's "~6k" was wrong) |
