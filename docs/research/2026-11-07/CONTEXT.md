# CONTEXT — TraceHound review engine at HEAD (2026-11-07). Read this instead of re-exploring.
HEAD = `main` @ `b498647` (`origin/main` `0d011b9` adds 3 viewer commits only). CLAUDE.md is stale past 062; decisions.md 054–072 rules.

**Pipeline (product = `pool-verify-v1`, decision 059):** review-diff-v1 (055: title+description+diff, chunks ≤ 60k diff chars,
`src/review/review.ts`, prompt `prompt.ts`) + review-ctx-v1 (057: + model-free context block, `context.ts`/`names.ts`,
regex names + `git grep -w`, ≤ 40k chars) → pool (ctx findings that agree with no diff finding, `scripts/bench/agree-rule.ts`;
Action: `packages/action/src/pipeline.ts`) → verify-ctx-v1 (058: one call per finding, keep/drop, ±80-line context ≤ 24k chars,
`verify-context.ts`, `verify-ctx.ts`). Action-only extras: contracts/tsc (no deps installed), feedback suppression (`learn.ts`, off),
max-comments cap, fixes. All prompts frozen (sha256 in decisions 055/057/058).
**Models:** every stage on `nvidia/Nemotron-3.5-Super-VL` via Nebius Token Factory us-north1 (067/068), temperature 0, reasoning on;
fixes stage still 3 Super. Judges: bench-judge-v1 = Nemotron 3 Super (scorer of record), bench-judge-x1 = Qwen3-235B (report only).
Hackathon rule (AGENTS.md): product model calls = Nemotron on Token Factory only.
**Frozen tags:** `review-freeze-2` = `0aeef06` (all published v2 numbers), `review-freeze-2.1` = `86fd5d7` (Action install step only, 072).

**Numbers (bench-judge-v1; file):**
- Cal.com blind, v2 run 4, n = 23: P 63.2 / R 52.2 / F 57.1; tools F: augment 73.2, cursor 66.7, greptile 50.0, copilot 46.2,
  coderabbit 36.7. Tied with all but CodeRabbit on 95% intervals (`docs/bench/results.md` §2, `v2-intervals.md`).
- All 50: v2 F 52.2 (x1 55.4), 3rd of 6 point estimate; behind Augment (−14.0 [−22.6, −4.7]), tied Cursor/Greptile (results.md §3).
- Dev (40 PRs, 4 non-TS repos: sentry/grafana/keycloak/discourse, n = 74): 3.5 mean of 2 runs P 54.8 / R 46.6 / F 50.4;
  pool-raw (unverified) P 48.0 / R 61.5 / F 53.9 (results.md §4, `dev-3.5.md`). 3 Super 5-run spread 35.6–48.0 F at temp 0.
- Verifier on vs off on 3.5: 7r −1.6 [−10.0, +5.5], 8 −5.4 [−14.7, +3.3] → inconclusive (`levers-v2.md`). On Cal.com run 4
  the verifier did not raise F (57.1 vs review-diff-v1 58.5).
- Misses: 35/74 dev Medium+ goldens missed in both 3.5 runs; sentry worst 14/21 (`levers-v2.md` §4).
- ReviewBench test runs (25 PRs): product 12.2 grounded F1; best config pool-raw-x2 3 Super 21.3; final unaffordable (results.md §5).
- Cost: dev 3.5 median $0.063/PR (in 49k / out 50k tokens median, 2.5× 3 Super's output); Cal.com run 4 median $0.0717, max $0.13.
  3.5: ~7/40 dev PRs per run have a chunk with invalid JSON twice; 79/624 calls hit the 32k max_tokens (067).
**Losses (054–072, need a NEW reason to retry):** 056 confidence threshold; 057 ctx alone; 058 ctx-verifier alone; 064 vote across
runs; 065 quote-gated evidence verifier + gate; 070 recall-v3 lenses + missed-issue pass; 071 Nemotron 3 Ultra; levers-v2 per-PR cap
and 2-of-3 vote (no gain). Reasoning-budget not honoured by Token Factory (070).

**TS dev set:** does NOT exist (dev = Python/Go/Java/Ruby; Cal.com is the only TS repo). `recall-seeded`, `linea-seeded`, `tracehound-seeds` are held out: never tune on them.
**Cal.com is spent:** two blind looks used (062, 069); 069b: no further Cal.com run allowed → new claims need a new held-out set.
**Devin's plan (PR #71, open, unmerged; copy at `docs/research/2026-11-07/plan-pr71.md`):** nothing has landed since 1 Nov.
PR #67 (27 Oct, before the plan) added default-off, unmeasured flags: `retryOnLength`, lenient parser, `poolNullLines`,
`capOrder: agreement-first`, `cacheTruncated`, `attemptsDetail` observability (`docs/post-freeze-fixes.md`) — partial groundwork for 5.1/5.2.
**Budget:** ~$43.52 Nebius credits left (reviewbench.md, P008 am. 8); caps run $1 / total $45 (`client.ts`). Devpost was due 30 Oct.

**Open problems:** precision gap to Augment/Cursor (FP 7 vs 3 on Cal.com); 3.5 JSON/truncation failures; run-to-run spread larger
than every lever measured; dev set reused by ~17 decisions (selection bias); no TS dev set; no fresh test set; tiny budget.
**Data:** per-comment dev detail is in `~/Projects/tracehound-bench` (AGENTS.md: workers never open it). Ask claude via comms/ for dev-only counts.
