# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` @ `5c4fdae` (handoff, 2026-11-09; this line was updated in the next commit). If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## Tracks
- **073/073a (closed):** generation recovery. Lenient parser (B1) passed the gate but is labelled "harmless, benefit unproven" (cache-replay bias, one chunk); fresh retry (B2) rejected. Product transport fix for Node's 300 s fetch cutoff (`packages/analyzer/src/llm/transport.ts`). Defaults: lenient parser + append retry. $0.73195.
- **074 (closed):** hard chunks, 14 requests × 3 fresh draws. E (json_schema, reasoning off) 41 vs A 22 successes: WIN on 074's gate; D no win. $3.36463.
- **075 (closed):** verify + judge of 074's A vs E. INCONCLUSIVE (one judge HTTP 529), but E fails the gate under every completion → **E dropped**. Empty replies (reasoning eats all 32k tokens) are a known limitation. $0.49090.
- **CI:** review workflows in TraceHound, tracehound-demo, linea-seeded, recall-seeded are manual (workflow_dispatch + `tracehound-review` label) since 2026-11-09 (merge `5fb4973`); the Action prints tokens and $ in the job summary. Pins in the four repos still point at 86fd5d7/0aeef06 (older Action, no summary).
- **Track B pilot (tracehound-testset):** 13 cases (10 bug, 3 clean) from twenty/medusa, SZZ, two labellers (bunny, devin). Label schema v2 (one primary per bug case): strict agreement 13/13 (v1: 10/13). `pilot/PILOT.md`, `pilot/labels/`, `run/out/devin.schema.md`. Scale-up blocked on Sunny's label check (task f).

## Money (docs/budget.md is the authority)
- Real balance **$19.31** (Sunny's console, 2026-11-09). Old API key revoked 2026-11-09; new key only in local `.env`.
- Split: TS-dev run 1 $3.80 · TS-dev run 2 $3.80 · held-out run $3.80 · held-out scoring $0.60 · reserve $3.00 · unallocated $3.31 · CI runs $0.00 · margin $1.00.
- `TRACEHOUND_BUDGET_TOTAL_USD=63.33547` in `.env` = ledger $45.02547 + 19.31 − 1. Ledger: `.tracehound/spend.jsonl`, `pnpm spend`.
- **FREEZE: no paid job** until task (a) is confirmed.

## Standing rules
- Cal.com is spent (062 + 069). No more Cal.com runs; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`.
- Replay the response cache, except for reliability tests (failure rates, retries, parsing), which bypass it (decisions.md top).
- One primary bug per labelled case; other rows of the case are notes.
- Compare ledger vs console ≥ 2 h after a paid job ends (console lags; budget.md rule 5).
- Only artu1 approves spend. No experiment without a line in docs/budget.md.
- Never push to upstreams or forks, never open PRs/issues/comments upstream; every `gh` carries `--repo SunnyBagal/<repo>`.
- Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds. Nebius feedback entry in FEEDBACK.md after any Nebius call.

## Agent lanes (CLAUDE.md "Herdr team") and hc addresses (2026-11-09; recheck with `hc ls`)
- artu1 `t9` (Claude): plans, pre-registers, assigns, merges, reports.  · bunny `t15` (Claude, claudeb): main builder.
- codex `t14`: code review GO/NO-GO before any paid run or merge; second builder. · devin `t1h`: methodology, labelling.
- grok `t1g`: web/docs research with URLs, leak/consistency audits (shows "idle" while working: trust its .done file).
- Coordination files: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze stays until Sunny confirms in the Nebius console. Likely billing lag: his $23.39 reading came 1 min after 074
   finished; 23.39 − 3.36 − 0.49 = $19.54 vs the real $19.31. To lift it: ~$3.36 at 09:00–10:00 UTC on 8 Nov, nothing
   overnight, no running sandboxes. (Also: the 10-27→11-08 off-ledger gap becomes $19.40, $12.7–14.2 after CI; budget.md.)
b. bunny: fix the flaky concurrent-reviewer test (no assumed finish order); switch linea-seeded and recall-seeded to manual
   triggers (workflow_dispatch + "tracehound-review" label); codex re-reviews; merge after GO.
   **Done 2026-11-09:** test `7f27842`, codex GO, merged `5fb4973`; linea-seeded `45b6d83`, recall-seeded `a110c67`,
   tracehound-demo `665eb59`. Left: bump the Action pins; create the label in each repo.
c. codex: historical leak report 2026-10-27 → 11-08, Actions runs on all SunnyBagal repos that could use the Nebius key,
   counts and est. $. **Done:** `run/out/codex.leak.md` (62 repos; 89 runs reached the model; est. $5.18–6.68).
d. devin: label schema, one primary per case; rewrite both label files; strict agreement; disagreements.md.
   **Done:** `run/out/devin.schema.md` (13/13). Two open choices for Sunny: multi-file primary rule, overlap strictness.
e. artu1: billing-lag finding and the "compare ≥ 2 h after" rule in docs/budget.md. **Done** (handoff commit).
f. Sunny: the label check in `tracehound-testset/pilot/labels/disagreements.md` (blocks Track B scale-up).

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · results `docs/bench/results.md`, `recovery-ab.md`, `hard-chunks.md` ·
history for humans `.agents/LOG.md` · herdr commands `docs/herdr.md` · test-set repo `~/Projects/tracehound-testset` (local only, no remote).
