# .agents/STATE.md — current state (DRAFT; rewrite, never append; ≤ 60 lines)
Pinned: `main` @ `b498647` (2026-11-07). If HEAD has moved past this SHA, trust code + docs/decisions.md over this file.
Owner of this file: the benchmark lane (claude). Every merged decision rewrites it in the same PR.

## Product (frozen)
- Reviewer = `pool-verify-v1` at tag `review-freeze-2` (`0aeef06`); `review-freeze-2.1` (`86fd5d7`) = Action install step only (072).
- Stages: review-diff-v1 + review-ctx-v1 → location pool (`scripts/bench/agree-rule.ts`) → verify-ctx-v1. All on
  `nvidia/Nemotron-3.5-Super-VL` (Token Factory us-north1), temp 0, reasoning on. Fixes: 3 Super. Prompts frozen (sha in 055/057/058).
- Product model calls: Nemotron on Nebius Token Factory only (AGENTS.md).

## Numbers that matter (bench-judge-v1 unless noted; source docs/bench/results.md)
- Cal.com blind (n = 23): F 57.1. Tied with Augment, Cursor, Greptile, Copilot; ahead of CodeRabbit (95% PR bootstrap).
- All 50: F 52.2 (x1 55.4). Behind Augment −14.0 [−22.6, −4.7]; tied with Cursor and Greptile.
- Dev (40 PRs, non-TS, n = 74), 3.5 mean of 2 runs: P 54.8 / R 46.6 / F 50.4; pool-raw F 53.9. Run spread is larger than every lever.
- Cost: median $0.063 / mean $0.074 per PR. Shares: diff 39%, ctx 48%, verifier 13%.

## Hard constraints
- **Cal.com is spent** (two looks, 062 + 069; 069b). No more Cal.com runs. Never open its golden or tool comments.
- **No TS dev set and no fresh held-out set exist.** The dev set has been reused by ≥ 17 decisions: dev-only results are hypotheses.
- Never scan `.tracehound/cache` (it mixes Cal.com replies). Look up rebuilt dev keys only.
- Held out, never tune on: `recall-seeded`, `linea-seeded`, `tracehound-seeds`. Forbidden paths: see AGENTS.md.
- Budget: ≈ $43.52 Nebius credits left. Caps: run $1, total $45 (`src/llm/client.ts`).

## Lost levers (need a new, stated reason to retry)
056 confidence threshold · 058 ctx-verifier alone · 064 whole-run vote · 065 quote-gated verifier + gate · 070 lenses /
missed-issue pass · 071 Nemotron Ultra · levers-v2 per-PR cap, 2-of-3 vote · research 2026-11-07: "both bypasses verifier" (+6 TP / +8 FP).

## Now (one task)
T1: generation-recovery A/B on dev: arms A (off), B1 (lenient parser), B2 (lenient + fresh retry on length), cache-replay.
Exit: terminal CHUNK_FAILED ≤ 2 (from ≈ 8/run) + no harm on changed PRs. Cap $4. Plan: `docs/bench/recovery-plan.md` (to write).
Source: `docs/research/2026-11-07/REPORT.md`.

## Next (in order, each gated on the previous one)
1. Observability: verifier attemptsDetail, input/reasoning tokens per attempt, lineage kept in the Action.
2. 2-repo SZZ label pilot (yield, minutes per label) → 3. TS dev (40) + held-out (40), split by repo, matcher fixed.
4. On the new TS dev: symbol-resolved context (5.3) + an "undefined symbol" pre-check. 5. Lightning verifier (cost).

## Open questions for the owner
- Approve the new data directory for the TS sets (outside the repo)? Approve a ReviewBench portal subset as an external check?

## Where things are
Decisions: docs/decisions.md · Results: docs/bench/results.md · Plan #71: docs/review-engine-upgrade-plan (branch) ·
Research: docs/research/2026-11-07/ · History for humans: .agents/LOG.md (append-only; agents only grep it).
