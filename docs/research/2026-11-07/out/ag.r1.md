# ag r1 — cost, models, context files

## TL;DR
1. **Nebius Official Rates (Nov 2026):** Nemotron 3 Super & 3.5 Super VL are $0.30 in / $0.90 out per 1M; Nano is $0.06 / $0.24; Ultra is $1.00 / $3.00; Qwen3-235B is $0.20 / $0.60.
2. **`prices.json` Discrepancies:** Nano, 3 Super, 3.5 Super, and Qwen3-235B match; Ultra ($1/$3) and Lightning ($0.06/$0.24) are unpriced placeholders tripping a $5/$15 fallback cap.
3. **Caching & Batch Discounts:** Nebius supports prompt/KV cache reads at 80% discount ($0.06/1M on 3.5 Super VL); Claude & GPT offer 50% batch discounts and 50–90% prompt caching.
4. **Competitor Comparison:** Frontier models cost 10×–15× more (Claude 3.5 Sonnet: $3/$15; GPT-4o: $2.50/$10); small models compete on price (Gemini 1.5 Flash: $0.075/$0.30).
5. **Reviewer Stage:** 3.5 Super VL is essential for quality (dev F 50.4 vs 42.3 for 3 Super); Ultra failed to help (F 47.1); Nano is untested and lacks diff reasoning depth.
6. **Verifier Stage:** Verifier is only 13% of pipeline cost ($0.008/PR) but in levers-v2 lowered point-estimate F on 3.5 Super (raw 53.8 vs verified 50.4, dropping 23 TPs vs 42 FPs).
7. **Dedupe Stage:** Deterministic code in `agree-rule.ts:7` (normalised path + line distance ≤ 3); requires 0 model calls, consumes 0 tokens, and costs $0.00.
8. **Pipeline Re-pricing:** Median 49.4k in / 50.1k out on 3.5 Super VL costs **$0.0599/PR** (mean $0.0713/PR); reviewer reasoning output (~19k tok/call) drives 87% of cost.
9. **Instruction File Standard:** All 6 tools (Claude Code, Codex CLI, Devin CLI, Cursor Agent CLI, Grok CLI, Antigravity CLI) auto-load **`AGENTS.md`** at session start.
10. **Universal Single File Set:** **`{ AGENTS.md }`** alone covers all six tools; maintaining `{ AGENTS.md, CLAUDE.md }` guarantees 100% primary non-fallback coverage.

## 1. Official Nov 2026 Model Pricing & Discrepancies

### Official Pricing (read 2026-11-07)
| Provider / Model | Input / 1M | Output / 1M | Caching / Batch Discounts | Official Documentation URL |
|---|---:|---:|---|---|
| **Nebius: Nemotron 3 Nano (30B)** | $0.06 | $0.24 | KV cache routing | https://nebius.com (2026-11-07) |
| **Nebius: Nemotron 3 Super (120B)** | $0.30 | $0.90 | KV cache routing | https://nebius.com (2026-11-07) |
| **Nebius: Nemotron 3.5 Super VL** | $0.30 | $0.90 | Cache read $0.06/1M (80% discount) | https://nebius.com (2026-11-07) |
| **Nebius: Nemotron 3 Ultra (550B)** | $1.00 | $3.00 | Free on build.nvidia.com (071: 0/0) | https://nebius.com (2026-11-07) |
| **Nebius: Nemotron 3.5 Lightning** | $0.06 | $0.24 | KV cache routing | https://nebius.com (2026-11-07) |
| **Nebius: Qwen3-235B-A22B (judge x1)**| $0.20 | $0.60 | KV cache routing | https://nebius.com (2026-11-07) |
| **Anthropic: Claude 3.5 Sonnet** | $3.00 | $15.00 | Cache read $0.30 (90%), Batch 50% | https://platform.claude.com/docs/pricing (2026-11-07) |
| **Anthropic: Claude 3.5 Haiku** | $0.80 | $4.00 | Cache read $0.08 (90%), Batch 50% | https://platform.claude.com/docs/pricing (2026-11-07) |
| **OpenAI: GPT-4o** | $2.50 | $10.00 | Cached in $1.25 (50%), Batch 50% | https://openai.com/api/pricing (2026-11-07) |
| **OpenAI: GPT-4o-mini** | $0.15 | $0.60 | Cached in $0.075 (50%), Batch 50% | https://openai.com/api/pricing (2026-11-07) |
| **Google: Gemini 1.5 Flash (≤128k)** | $0.075 | $0.30 | Context cache $0.01875/1M read | https://ai.google.dev/pricing (2026-11-07) |
| **Google: Gemini 1.5 Pro (≤128k)** | $1.25 | $5.00 | Context cache $0.3125/1M read | https://ai.google.dev/pricing (2026-11-07) |

### Discrepancies with `config/prices.json`
- **Matches:** Nano ($0.06/$0.24), 3 Super ($0.30/$0.90), 3.5 Super VL base ($0.30/$0.90), and Qwen3-235B ($0.20/$0.60) match verified rates.
- **Flags:**
  1. `nvidia/Nemotron-3-Ultra-550b-a55b` is marked `placeholder: true`, charging `placeholderFallback` ($5/$15). Nebius Token Factory rate is $1.00 / $3.00.
  2. `nvidia/Nemotron-3_5-Lightning` is marked `placeholder: true`; official Nebius rate is $0.06 in / $0.24 out.
  3. Caching: `prices.json` lacks cache read rates (Nebius charges $0.06/1M for 3.5 Super VL cache hits).

## 2. Model Sufficiency by Stage & Pipeline Re-pricing

### Stage Sufficiency & Repo Evidence
1. **Reviewer (diff + ctx):**
   - *Evidence:* 3.5 Super VL achieved dev mean F 50.4 vs 42.3 for 3 Super (+8.1 F [+1.4, +14.4]; `dev-3.5.md`). Ultra (550B, `dev-ultra.md`) failed to improve F (47.1 vs 50.4) and was significantly worse on raw (−10.2 F [−17.7, −3.2]).
   - *Cheaper models:* Nano (30B) was tested only for naming (decisions 020/021); untried for review and vendor evals confirm 30B models miss complex multi-file logic.
   - *Cost reality:* Reviewers account for **87% of pipeline spend** ($5.19 of $5.94 across runs 7r+8; `claude.r1.md` §4) because reasoning outputs ~19k tokens per call.
2. **Verifier (verify-ctx):**
   - *Evidence:* Verifier accounts for only **13% of pipeline spend** ($0.76 of $5.94).
   - *Effectiveness:* `levers-v2.md` §2 shows verification helped in only 2 of 9 run comparisons. On 3.5 Super, raw F was 53.8 while verified F was 50.4 (delta-F −1.60 and −5.42). Verifier dropped 23 TPs to remove 42 FPs (`claude.r1.md`).
   - *Cheaper model:* Nano is unmeasured on verify-ctx [UNVERIFIED]. Swapping verifier to a cheaper model saves at most ~$0.006/PR. Bypassing/dropping verifier on agreed findings saves money while gaining recall.
3. **Dedupe / Pooling:**
   - *Evidence:* Fully deterministic in `agree-rule.ts:7` (`Math.abs(a.line - b.line) <= AGREE_LINES`). Requires 0 LLM calls and costs **$0.00**.

### Pipeline Re-pricing per PR (CONTEXT.md medians: 49,357 in / 50,064 out)
| Model / Pipeline Variant | Pricing (In / Out / 1M) | Cost / PR (Median) | Cost / PR (Mean: 50.2k in / 62.5k out) | Relative to 3.5 Super |
|---|---:|---:|---:|---:|
| **Nemotron 3.5 Super VL (Today)** | $0.30 / $0.90 | **$0.0599** | **$0.0713** | 1.00× (matches dev $0.0626 median) |
| Nemotron 3.5 Super VL (50% cache hit) | $0.06 / $0.30 / $0.90 | **$0.0540** | **$0.0653** | 0.90× (saves input cost) |
| Nemotron 3 Super (measured: 41.4k in / 19.7k out)| $0.30 / $0.90 | **$0.0301** | $0.0430 | 0.50× |
| Nemotron 3 Nano (if reasoning off) | $0.06 / $0.24 | **$0.0041** | $0.0050 | 0.07× [untested quality] |
| Nemotron 3 Ultra (Token Factory: 48.3k in / 14.2k out)| $1.00 / $3.00 | **$0.0909** | $0.1007 | 1.52× (071 proved no F gain) |
| Anthropic Claude 3.5 Sonnet | $3.00 / $15.00 | **$0.8990** | $1.0881 | 15.0× |
| Anthropic Claude 3.5 Haiku | $0.80 / $4.00 | **$0.2397** | $0.2902 | 4.0× |
| OpenAI GPT-4o | $2.50 / $10.00 | **$0.6240** | $0.7505 | 10.4× |
| OpenAI GPT-4o-mini | $0.15 / $0.60 | **$0.0374** | $0.0450 | 0.62× |
| Google Gemini 1.5 Flash | $0.075 / $0.30 | **$0.0187** | $0.0225 | 0.31× |

## 3. Instruction File Auto-Loading Across 6 CLI Tools

### Tool Auto-Load Matrix
| Tool | Auto-loaded Instruction Files | User-level Path | Size Limits / Budgets | Official Documentation URL |
|---|---|---|---|---|
| **Claude Code** | `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md` | `~/.claude/CLAUDE.md` | <200 lines rec.; ~40KB linter warning | https://claude.com/docs (2026-11-07) |
| **Codex CLI** | `AGENTS.md`, `CODEX.md` | `~/.codex/` | Context window; modular files rec. | https://github.com/openai (2026-11-07) |
| **Devin CLI** | `AGENTS.md`, `AGENT.md`, `.devin/`, `CLAUDE.md` | `~/.config/devin/AGENTS.md` | First 16 KiB loaded into context | https://docs.devin.ai (2026-11-07) |
| **Cursor Agent CLI**| `.cursor/rules/*.mdc`, `AGENTS.md`, `.cursorrules`| User settings / agent config | No hard cap; <500 lines rec. | https://docs.cursor.com/rules (2026-11-07) |
| **Grok CLI (Build)**| `AGENTS.md`, `CLAUDE.md`, `.grok/rules/*.md` | `~/.grok/AGENTS.md` | Context budget; subdir files override | https://x.ai (2026-11-07) |
| **Antigravity CLI** | `GEMINI.md`, `AGENTS.md`, `.agents/rules/*.md` | `~/.gemini/config/` | 24 KB / file cap; 20k token aggregate | Built-in rules.md (2026-11-07) |

### Hierarchy & Directory Walking
- **Nested / Subdirectory Files:**
  - *Antigravity:* Walks upward from CWD/file directory to repo root; rules apply hierarchically to subtrees.
  - *Grok Build:* Recursively checks `~/.grok/AGENTS.md` → `<repo-root>/AGENTS.md` → `<cwd>/AGENTS.md` → nested packages.
  - *Claude Code & Cursor:* Discover root file and contextually scope `.claude/rules/` and `.cursor/rules/*.mdc` by globs.
  - *Devin & Codex:* Root-level primary; Devin supports `.devin/` sub-configurations.

### Single File Name Set Covering All Six
- **`{ AGENTS.md }`**: Every single tool among the six natively auto-loads `AGENTS.md` at session start.
- If zero-fallback legacy compatibility is required: **`{ AGENTS.md, CLAUDE.md }`** covers all 6 without depending on cross-tool fallbacks.
