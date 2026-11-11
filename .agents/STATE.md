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
- **076a (2026-11-11, after the caps check):** batch `--max-usd-run` = job cap − job spend so far, unstarted ids roll over; R1 $4.68, unallocated $1.18; R2/H1 caps recomputed once from R1's measured per-case costs (95% completion) in **decision 077 before R2's first call**, unallocated only, H1 first; unstarted held-out case at H1's cap runs from the reserve; L4 `--concurrency 1`; judge-only jobs set RUN = job cap, TOTAL = ledger at start + job cap; L2 > 11 failed chunks → first 11 by case id, chunk index. Protocol §13: α 0.05 two-sided; equal cost A0 first, then fewer comments/case; one rerun (rerun counts; two failures = miss; unstarted at window end = miss); no review after re-trigger → out of that tool's paired comparison, n reported; sheet hides judge verdicts; re-trigger 24 h after the PR's trigger; sheet hashed → unblind → score files hashed + committed → firewall lifts; claim names every repo with ≥ 1 held-out case (per-repo counts); three newer proposals wait for Planner B; **D1 not merged until Sunny rules on Planner B's note**.
- **Planner files no Herdr agent edits:** `docs/plan/`, `docs/specs/`, `docs/runbooks/`. Planners leave notes in `tracehound-testset/run/comms/planner.*.md`: check that folder after each task.
- Held-out PRs open only after the final freeze tag (all tools in one window); forks get dev cases only until then. TraceHound runs locally per case (`scripts/run-tracehound.ts`), scored from local output.
- Dev replacements: next candidate in screening order passing every check (incl. attribution, and since 2026-11-11 "bug visible at the introducing PR"), else dev −1. case-002 ("moved") stays.
- Tools: CodeRabbit + Greptile free Starter (held-out + one smoke test); Bugbot excluded (limitation).
- **S0 rulings (2026-11-11, decision 076, `docs/budget.md` "S0 rulings"):** audit corrections 1, 2, 5–9 accepted; caps S1 0.45 · R1 4.15 · L1 0.40 · L2 0.80 · L4 0.10 · R2 4.15 · H1 3.15 · H2 0.40 · reserve 3.00 · unallocated 1.71 = $18.31 (L3 step 2 cut, step 1 $0 runs); batch `--max-usd-run` = min(batch estimate + $0.40, job cap − job spend); re-plan if console ÷ ledger > 1.08; cut order L2, then R2 as cache replay. Tie (margin < 3) → incumbent A0 stays; several pass → cheaper. Gates L1/L2/R2 as the plan wrote them, with bunny's error ranges in 076; L2 tests hypothesis C076. Multi-file: every row of one defect = same bug, counts once, any row catches it, **primary = first file in git path order (never by hand)**; case-025 primary = migration, entity = alternate (strict 0/1 kept). Schema: devin's two choices as written. Metric: bugs caught of 20 (Wilson), comments/PR, cost/PR; F dev only. Window 72 h, same order, one re-trigger per tool per PR for tool errors; CodeRabbit 1/h until P1 measures. Firewall lifts after held-out outputs + scores are frozen and hashed. Hand-check: Sunny, one 2–3 h sitting; window not booked until Sunny confirms dates.

## Tracks
- **Track B** (private `SunnyBagal/tracehound-testset`): dev **40** (31 bug, 9 clean; medusa 16, payload 9, twenty 15), held-out **29** (20 bug, 9 clean). Attribution: dev 30 attributed / 1 moved / 0 not attributed (artu1 rerun 2026-11-11); held-out 19 / 1 unmappable.
- **case-025 (2026-11-11):** the #22392 case replaced (bug only visible after a later PR) by twenty fix #22795 ← #21674 (grok; 3 candidates dropped first; attribution 100%; leak 0; blobs filled). codex blind label: bug/clean 1/1, **strict 0/1**: grok chose the migration file, codex the entity file; the fix changes the same index in both. The open "multi-file primary" schema choice decides it (`labels/dev/compare-replace.md`).
- **Plan audit (2026-11-11, $0):** `docs/plan/2026-11-10-plan-audit.md`: 185 claims, 141 / 17 / 21 / 6; Sunny ruled on its corrections (S0 above). PR #71 (upgrade plan) merged `d04db68`.
- **S0 lanes (2026-11-11, $0; briefs `run/briefs/{bunny,codex,grok}-s0.md`):** A1 on main `588f723` (076 + budget split). **Caps check (bunny):** caps as ruled still stop R1/R2 (P all cases ≈ 0.29) and H1 (≈ 0.40) early under realistic cost spread, L4 refused at concurrency 4, judge-only jobs need per-job env caps: options with Sunny (budget.md S0). **G1** done (grok; artu1 found 5/5 quotes; `coderabbitai[bot]` is a Bot; Greptile login unobserved; neither vendor names the indexed ref). **Fork default branches** moved to the last upstream commit before 2026-07-01 (medusa `5296f51`, twenty `1df0069`, payload `1734efc`, bullmq `c2c3d1d`; 0 PRs; Actions off; artu1 read back). **D1** `docs/eval/ts-protocol.md` on `codex/ts-protocol` rev 2 (grok: 4/5 differences fixed at rev 1, scope moved to proposals at rev 2; §13 "Proposed, pending Sunny"). **Multi-file overlays:** dev 3 of 31 multi-file (case-025 primary = migration), held-out 1 of 20, 0 primaries changed (counts). **B1** `b1-lineage` `9bfa9fa` + fix round 1 (codex C1 NO-GO: 2 P2s, re-review pending). **B3** done: 31/31 targets on added diff lines; 42 chunks; ≈ $2.61 per dev run (estimate); contracts 0 findings → **off**; L3 step 1 refs 13/42 → 36/42 (4 targets leave the context block). **B2** `b2-scoring` `c3fb14e`, gates green (action 315), bot logins a config value. C1 (B1/B2 GO, held-out reach) in progress; codex blocked on a permission prompt.
- **Brain:** backfill D062–D075, P010, 7 topic notes, rules (`29e8515`; codex GO round 2 after a NO-GO: D070 precision floors + 8 P2s); plan-audit note `6c4fbb0` (codex GO round 3, after two NO-GOs on power wording and the L4 listing).
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
a. Spend freeze until Sunny reports the Nebius console check.
b. Lanes (briefs `run/briefs/{bunny,codex,grok}-076a.md`): bunny policy file + caps re-check with the rolling rule; codex C1 re-review (B2 `554cd28`, B1 `8707752..bec2ead`) → brain review → D1 rev 3; grok re-checks D1 rev 3. artu1: merge B1/B2 on GO (merge commits), push the brain after codex GO, push `codex/ts-protocol` for Planner B after rev 3.
c. **Plan v2** (`docs/plan/2026-11-11-plan-v2.md`, Planner A, supersedes v1): artu1 confirmed its runner findings on main (one repo per invocation, `run-tracehound.ts:215`; manifest order, `--ids` filters only; defaults case cap $0.25, fixes/contracts on → every command needs `--fixes off --contracts off --max-usd-per-case 0.40`). codex audits the rest (part 4 of `run/briefs/codex-076a.md`; send the pointer when t14 unblocks). Open points R-1 (re-trigger collision), R-2 (P1 rate → H1 schedule), R-3 (Planner B's proposals).
d. Branch heads: B1 `b1-lineage` `bec2ead` (GO at `8707752`, delta under re-review), B2 `b2-scoring` `d415440` (fixes `554cd28` + 076a policy file `d415440`, under re-review), D1 `codex/ts-protocol` `c76851a` (rev 3 pending). Nothing merged.
e. Sunny: rule on Planner B's D1 note; confirm window dates.
f. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · plan + audit `docs/plan/` · live plan `docs/live-setup.md` · results `docs/bench/results.md` · history `.agents/LOG.md` · herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset` · brain `~/Projects/tracehound-brain`.
