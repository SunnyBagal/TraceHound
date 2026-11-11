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
- **S0 rulings (2026-11-11, decision 076, `docs/budget.md` "S0 rulings"):** audit corrections 1, 2, 5–9 accepted; caps S1 0.45 · R1 4.15 · L1 0.40 · L2 0.80 · L4 0.10 · R2 4.15 · H1 3.15 · H2 0.40 · reserve 3.00 · unallocated 1.71 = $18.31 (L3 step 2 cut, step 1 $0 runs); batch `--max-usd-run` = min(batch estimate + $0.40, job cap − job spend); re-plan if console ÷ ledger > 1.08; cut order L2, then R2 as cache replay. Tie (margin < 3) → incumbent A0 stays; several pass → cheaper. Gates L1/L2/R2 as the plan wrote them, with bunny's error ranges in 076; L2 tests hypothesis C076. Multi-file: every row of one defect = same bug, counts once, any row catches it, **primary = first file in git path order (never by hand)**; case-025 primary = migration, entity = alternate (strict 0/1 kept). Schema: devin's two choices as written. Metric: bugs caught of 20 (Wilson), comments/PR, cost/PR; F dev only. Window 72 h, same order, one re-trigger per tool per PR for tool errors; CodeRabbit 1/h until P1 measures. Firewall lifts after held-out outputs + scores are frozen and hashed. Hand-check: Sunny, one 2–3 h sitting; window not booked until Sunny confirms dates.

## Tracks
- **Track B** (private `SunnyBagal/tracehound-testset`): dev **40** (31 bug, 9 clean; medusa 16, payload 9, twenty 15), held-out **29** (20 bug, 9 clean). Attribution: dev 30 attributed / 1 moved / 0 not attributed (artu1 rerun 2026-11-11); held-out 19 / 1 unmappable.
- **case-025 (2026-11-11):** the #22392 case replaced (bug only visible after a later PR) by twenty fix #22795 ← #21674 (grok; 3 candidates dropped first; attribution 100%; leak 0; blobs filled). codex blind label: bug/clean 1/1, **strict 0/1**: grok chose the migration file, codex the entity file; the fix changes the same index in both. The open "multi-file primary" schema choice decides it (`labels/dev/compare-replace.md`).
- **Plan audit (2026-11-11, $0):** `docs/plan/2026-11-10-plan-audit.md`: 185 claims, 141 / 17 / 21 / 6; Sunny ruled on its corrections (S0 above). PR #71 (upgrade plan) merged `d04db68`.
- **S0 lanes (2026-11-11, $0):** bunny caps check → B1 (lineage, replay-arms; no A1 ⊇ A0) → B3 (dev audits incl. L3 step 1) → B2 (after D1 draft; bot logins a config value); codex D1 `docs/eval/ts-protocol.md` → multi-file rule on dev + held-out labels (held-out counts only) → C1; grok G1 tool facts → D1 review → fork default branches to the last upstream commit before 2026-07-01 (dry run, then apply). Briefs `run/briefs/{bunny,codex,grok}-s0.md`.
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
a. Spend freeze until Sunny reports the Nebius console check (S0's last open item).
b. S0 lanes above; A1 (budget table + 076) is pushed after bunny's caps check.
c. Sunny: confirm held-out window dates (hand-check sitting) before H1 is booked.
d. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · plan + audit `docs/plan/` · live plan `docs/live-setup.md` · results `docs/bench/results.md` · history `.agents/LOG.md` · herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset` · brain `~/Projects/tracehound-brain`.
