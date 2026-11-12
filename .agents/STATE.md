# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-13 076d commit (`8cef322`). If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload, bullmq), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable; full text in AGENTS.md "Blindness")
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/` (incl. as an alternate object store; never pass `--heldout-ok` or a held-out side flag), and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. codex, grok (devin) may read held-out. **From the window's start (T0) until the lift, artu1 and bunny make no `gh` or browser read of pulls, issues or notifications on the four forks** (076c item 12).

## Rules of work (076c item 14: AGENTS.md "Who owns which files", "Process")
- One owner per path (table in AGENTS.md); planner files `docs/plan/`, `docs/specs/`, `docs/runbooks/` are Planner A's (premortem, team-process: Planner B); the protocol is codex's. Planners leave notes in `tracehound-testset/run/comms/planner.*.md`: check after each task.
- Briefs: template `docs/plan/team-process.md` §2, `run/briefs/<lane>.<task>.md` → `run/out/<lane>.<task>.md` + `.done`; claim file; "Report by" + stand-in; GO names a full sha and the branch stops; one brain review per day (last in codex's queue); jobs > 90 min detached or resumable; written handover (`run/comms/orchestrator.handover.md`); every decision has a "Touches:" list.
- **Brain at session end** (public; counts only; codex GO before push). **Plans are hypotheses.** Merges: `git pull --rebase` first, then `merge --no-ff`, gates, push (never pull --rebase after a local merge; no force-push).

## Rulings in force (decisions.md 076, 076a, 076b, 076c, 076d; budget.md "S0 rulings")
- **076:** audit corrections; caps and gates; ties keep A0 (several pass → cheaper); multi-file one bug, primary by git path order; metric bugs caught of 20 (Wilson), comments/PR, cost/PR, F dev only; 72 h window, same PR order; hand-check: Sunny, one 2–3 h sitting; window not booked until Sunny confirms dates.
- **076a:** rolling batch caps (job cap − job spend, roll over unstarted); R1 $4.68, unallocated $1.18; R2/H1 caps from R1's measured costs in **077 before R2**; reserve covers unstarted held-out; judge-only env caps; L4 concurrency 1; L2 first 11 failed chunks; protocol §13 1–8 (α 0.05; one rerun; no review after re-trigger → out of that tool's pairs; sheet hides verdicts; sheet hash → unblind → score hash → lift; claim names every repo with a held-out case).
- **076b:** R1/R2 judging inside the job cap; first triggers before re-triggers, re-trigger in the first free hourly slot ≥ 24 h, PR order; CodeRabbit rate at P1 start/end, shrank → window ≥ 7 days after P1; canary ≤ 3 tries, ≥ 30 min, ≤ $0.40 from the reserve; adopted arm by replay with both costs.
- **076c (2026-11-12):** Planner B's §13 proposals adopted (unmappable case stays in the 20 + "K of 19" line; within-file span rule; job-start ledger file, one paid process at a time, L2 PASS/FAIL/INCOMPLETE with missing draws); U1 completion = any bot review object, inline or issue comment after the trigger (not a rate-limit/error message); U2 re-trigger only with no completed review at 24 h; U3 registered pairs TraceHound vs CodeRabbit and vs Greptile (two-sided 0.05, uncorrected, exact p), CodeRabbit vs Greptile counts only; U4–U11 Planner B's wording unless codex disagrees; G10 < 15 of 20 reviewed by both → counts only; G3 guess column + Sunny's hit rate; G1 S1 also triggers Greptile on one clean dev case; premortem rows 4/7/11 (re-trigger mode, invalid-binding fixture, tag worktree ledger/.env), row 6/14a (grok re-derivations, ancestry), row 3 (detached scheduler; codex rehearses 8 slots); ten team-process changes; Planner A's three choices (P1 "shrank", R2 $0.03 replay threshold, H1 `gh` re-trigger lines until re-trigger mode merges).

- **076d (2026-11-13):** ancestry: no case excluded; dev case branches deleted from the forks after P1's collection; held-out branches pushed one at a time, base-date order, each at its own first-trigger slot; catches reported on exposed / unexposed bug cases separately; W1 limitation; grok re-counts exposure at first review, > 0 → Sunny rules again before F1. "In progress" / "skipped" / "paused" bot messages are `notCompletion` (S1/P1 record exact text). Window scheduler: bunny builds, codex reviews, 8-slot rehearsal re-run on it. Collector: explicit flag for untriggered cases (refuses with neither bound; never drives a re-trigger); P2-2 coverage check on re-triggers.
## Track B
- Dev **40** (31 bug, 9 clean; medusa 16, payload 9, twenty 15); held-out **29** (20 bug, 9 clean). Attribution dev 30/1/0; held-out 19 attributed, 1 unmappable. Multi-file: dev 3 of 31 (case-025 primary = migration), held-out 1 of 20.
- Built and merged: runner (`d482d38`), B1 lineage (`4b70033`), B2 scoring kit (`c379055`), b2-followup (linear `73ddf5c..be3e8fc`, = codex GO `45b48df`; no force-push). B3: contracts off, ≈ $2.61 per dev run (estimate). Forks: Actions off; default branches at the last upstream commit before 2026-07-01. Never run paid.
- Protocol `docs/eval/ts-protocol.md` on `codex/ts-protocol` `d62343c` (rev 5); merge after codex's 076c update + grok's clean re-check.

## Money (docs/budget.md is the authority)
- Real balance **$19.13** (console, 2026-11-09; $19.31 was a typo, corrected 2026-11-13 under 076c): usable $18.13, unallocated $1.00. `TRACEHOUND_BUDGET_TOTAL_USD=63.15547` in `.env`. **FREEZE: no paid job** until Sunny reports the Nebius console check. This session: $0.

## Standing rules
- Cal.com is spent; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`. Only artu1 approves spend. Compare ledger vs console ≥ 2 h after a paid job.
- Never push to upstreams; nothing to the forks but what Sunny approves; every `gh` carries `--repo SunnyBagal/<repo>`. Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds, tracehound-testset held-out. Nebius feedback after any Nebius call.

## Agents (recheck with `hc ls`)
artu1 `t9` · bunny `t15` (dev side) · codex `t14` · grok `t1g` (trust its .done file) · devin no quota. Planners A and B outside Herdr. Coordination `~/Projects/tracehound-testset/run/{briefs,out,comms}`; commands `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze until Sunny reports the Nebius console check.
b. **Merges waiting on a GO** (none given yet; merge only the sha a GO names, pull first): `b4-076c` (NO-GO `6fd4568`, P2-1; bunny fixing, Sunny approved the fix) → new sha → codex; testset re-trigger patch (NO-GO sha256 `135374bf…`, P2-2; bunny fixing) → codex GO → artu1 commits it in tracehound-testset; `codex/tag-worktree` `ffb615b` (codex says READY FOR REVIEW, not a GO; reviewer: grok as review stand-in, or Sunny names one); then bunny's new branches (scheduler, untriggered flag, scorer split).
c. **076d Touches:** grok `run/out/grok.ancestry-076d.md` (split of the 11, reconciliation with 5 of 29, re-count at first review); codex protocol + held-out exposed set + scheduler review + rehearsal re-run; Planner A F1, H1, P1, S1, B2, H2, W1, plan-v2 (`run/comms/artu1-to-planner-a.076d.md`); Planner B premortem rows 3, 14a (`artu1-to-planner-b.076d.md`); bunny collector flag, open-prs.ts (P2-2, push per slot), scheduler, score-testset.ts split, tools.json notCompletion.
d. **076c Touches still open:** codex protocol rev 7 `d251f09` (grok re-check `run/out/grok.d1-review5.md` → artu1 merges `codex/ts-protocol` on clean); held-out overlay (at F1); bunny's three scripts (on `b4-076c`), `open-prs.ts`, L2 redraw tool (not built); Planner B `premortem.md`.
e. **Brain:** 076c, premortem and 076d in the working tree of `~/Projects/tracehound-brain` (base `89a76d3`); brief `run/briefs/codex.brain-076c.md` (amended for 076d, sent to t14); push on GO.
f. Sunny: the console check; window dates; `.env` line 10 has `TRACEHOUND_BUDGET_TOTAL_USD=52` glued onto the end of `NEBIUS_AI_PROJECT` (missing newline; only `scripts/parked/` reads that variable; the cap itself is set on line 13).
g. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · plan, audit, premortem, team process `docs/plan/` · specs `docs/specs/` · runbooks `docs/runbooks/` · protocol `codex/ts-protocol` · live plan `docs/live-setup.md` · history `.agents/LOG.md` · test set `~/Projects/tracehound-testset` · brain `~/Projects/tracehound-brain`.
