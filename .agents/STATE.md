# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-11 plan-audit commit. If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload, bullmq), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable)
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/` (incl. as an alternate object store; `check-attribution.py` reads held-out only with `--heldout-ok`, which artu1/bunny never pass), and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. devin, codex, grok may read held-out.

## Standing rules (new 2026-11-11; also in CLAUDE.md / AGENTS.md)
- **Brain at session end:** add what was done and decided to tracehound-brain (`~/Projects/tracehound-brain`, public: no held-out, no testset case details), alongside LOG.md. Agents may edit its curated notes; `inbox/` is for raw reports; **every brain change needs a codex GO before push**.
- **Plans are hypotheses:** verify a task's premises against repo data (file:line) before executing it; report contradictions instead of working around them.

## Sunny's decisions (2026-11-10/11)
- Held-out PRs open only after the final freeze tag (all tools in one window); forks get dev cases only until then. TraceHound runs locally per case (`scripts/run-tracehound.ts`), scored from local output.
- Dev replacements: next candidate in screening order passing every check (incl. attribution, and since 2026-11-11 "bug visible at the introducing PR"), else dev −1. case-002 ("moved") stays.
- Tools: CodeRabbit + Greptile free Starter (held-out + one smoke test); Bugbot excluded (limitation).

## Tracks
- **Track B** (private `SunnyBagal/tracehound-testset`): dev **40** (31 bug, 9 clean; medusa 16, payload 9, twenty 15), held-out **29** (20 bug, 9 clean). Attribution: dev 30 attributed / 1 moved / 0 not attributed (artu1 rerun 2026-11-11); held-out 19 / 1 unmappable.
- **case-025 (2026-11-11):** the #22392 case replaced (bug only visible after a later PR) by twenty fix #22795 ← #21674 (grok; 3 candidates dropped first; attribution 100%; leak 0; blobs filled). codex blind label: bug/clean 1/1, **strict 0/1**: grok chose the migration file, codex the entity file; the fix changes the same index in both. The open "multi-file primary" schema choice decides it (`labels/dev/compare-replace.md`).
- **Plan audit (2026-11-11, $0):** `docs/plan/2026-11-10-plan-audit.md` merges codex (internal), bunny (stats/budget), grok (external): 185 claims, **141 VERIFIED, 17 CONTRADICTED, 21 UNSUPPORTED, 6 marked guesses**. The planner (Fable) accepted bunny's 6 contradictions. **13 tasks BLOCKED:** A1, D1, B2 (part), S1, P1, R1, E1 (L1, L2, L3 step 2), L4, A2, R2, F1, H1, W1. Clear: S0, B1, B3, C1, G1, H2, L3 step 1. The $3 reserve is inside the $17.25. Corrections listed for Sunny; plan not edited.
- **Brain:** backfill D062–D075, P010, 7 topic notes, rules (`29e8515`; codex GO round 2 after a NO-GO: D070 precision floors + 8 P2s); plan-audit note: see LOG for its push.
- **Local runner + triggers:** merged `d482d38` (codex GO). Never run paid. Dev clones filled (`tracehound-testset/scripts/fill-dev-blobs.py`).
- **Forks:** Actions OFF on all four. Plan `docs/live-setup.md`. **CI:** review workflows manual; left: Action pins, label.

## Money (docs/budget.md is the authority)
- Real balance **$19.31** (console, 2026-11-09). `TRACEHOUND_BUDGET_TOTAL_USD=63.33547` in `.env`. Ledger `.tracehound/spend.jsonl`.
- **FREEZE: no paid job** until Sunny confirms the hourly usage in the Nebius console. This session: $0.

## Standing rules
- Cal.com is spent; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`.
- One primary bug per labelled case. Compare ledger vs console ≥ 2 h after a paid job. Only artu1 approves spend.
- Never push to upstreams; nothing to the forks but what Sunny approves; every `gh` carries `--repo SunnyBagal/<repo>`.
- Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds, tracehound-testset held-out. Nebius feedback after any Nebius call.

## Agent lanes and hc addresses (2026-11-11; recheck with `hc ls`)
artu1 `t9` · bunny `t15` (dev side only) · codex `t14` (review GO/NO-GO, second labeller) · grok `t1g` (trust its .done file) · devin (out of weekly quota since 2026-11-10; `t1h` is a plain shell now). The planner ("Fable") runs outside Herdr; it wrote the plan and the audit briefs, then handed the merge to artu1 (`run/comms/planner.plan-audit-handoff.md`).
Coordination: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze until Sunny confirms the console usage.
b. Sunny: rule on the plan audit's corrections (audit doc, last section); blocked tasks stay blocked until then.
c. Sunny: case-025 multi-file primary (and devin's two schema choices).
d. Before the held-out run, fix in writing: goldens per case, golden severity, comments per case (budget.md); then the freeze tag.
e. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · plan + audit `docs/plan/` · live plan `docs/live-setup.md` · results `docs/bench/results.md` · history `.agents/LOG.md` · herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset` · brain `~/Projects/tracehound-brain`.
