# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-10 live-setup commit (docs/live-setup.md, STATE, LOG). If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable)
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/`, and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. devin, codex, grok may read held-out.

## Tracks
- **073/073a, 074, 075 (closed):** defaults lenient parser + append retry; E dropped; empty replies a known limitation. $0.73195 + $3.36463 + $0.49090.
- **CI:** review workflows in the four repos are manual (dispatch + `tracehound-review` label, merge `5fb4973`). Left: bump the Action pins; create the label in each repo.
- **Track B (tracehound-testset, private repo github.com/SunnyBagal/tracehound-testset):** split before labelling, seed `0xec6bf5fc` (testset `.agents/STATE.md` has the split). Dev **40** (medusa 17, payload 10, twenty 13; 31 bug, 9 clean). Held-out **29 final** (medusa 8, payload 10, twenty 10, bullmq 1; 20 bug, 9 clean): 11 bug short; Sunny ruled BullMQ-only fill, no pre-July fixes, no rule relaxing, ship with what it has. Agreement: dev 40/40 strict and bug/clean; held-out 29/29 and 29/29. Leak audit closed (0 open Fix items). PR opener `scripts/open-prs.ts` (testset): codex GO round 2, never run for real. Live setup: `docs/live-setup.md` (CodeRabbit/Greptile steps, fork prep, smoke test); fork review workflow NO-GO (setup-node yarn probe runs in the PR tree; setup-node not sha-pinned), disabler GO; plan: Actions OFF on forks, reviews from a controller repo (to build). devin re-check of 10 dev cases: (a) 9 yes / 1 unsure, (b) 9/1 (case-027 misattributed), (c) 10/10.

## Money (docs/budget.md is the authority)
- Real balance **$19.31** (Sunny's console, 2026-11-09). Old API key revoked 2026-11-09; new key only in local `.env`.
- Split: TS-dev run 1 $3.80 · TS-dev run 2 $3.80 · held-out run $3.80 · held-out scoring $0.60 · reserve $3.00 · unallocated $3.31 · CI runs $0.00 · margin $1.00.
- `TRACEHOUND_BUDGET_TOTAL_USD=63.33547` in `.env` = ledger $45.02547 + 19.31 − 1. Ledger: `.tracehound/spend.jsonl`, `pnpm spend`.
- Ledger audit (codex, 2026-11-09): 72 `spend.jsonl` under ~/Projects; TraceHound-eval's ledger duplicates the main one, the rest are test fixtures ($0.89 nominal). **Other ledgers do not close the $12.7–14.2 gap**; only the console can.
- **FREEZE: no paid job** until task (a) is confirmed.

## Standing rules
- Cal.com is spent (062 + 069). No more Cal.com runs; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`.
- Replay the response cache, except for reliability tests (failure rates, retries, parsing), which bypass it (decisions.md top).
- One primary bug per labelled case; other rows of the case are notes.
- Compare ledger vs console ≥ 2 h after a paid job ends (console lags; budget.md rule 5).
- Only artu1 approves spend. No experiment without a line in docs/budget.md.
- Never push to upstreams or forks, never open PRs/issues/comments upstream; every `gh` carries `--repo SunnyBagal/<repo>`.
- Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds, tracehound-testset held-out. Nebius feedback entry in FEEDBACK.md after any Nebius call.

## Agent lanes (CLAUDE.md "Herdr team") and hc addresses (2026-11-09; recheck with `hc ls`)
- artu1 `t9` (Claude): plans, pre-registers, assigns, merges, reports.  · bunny `t15` (Claude, claudeb): main builder (dev side only).
- codex `t14`: code review GO/NO-GO; second builder; second labeller. Read-only git/gh pr/rg allowed in `~/.codex/rules/default.rules`; tracehound-testset is a writable root in `~/.codex/config.toml` (2026-11-10, new sessions only). Its cyber filter refused a review phrased as "what could a hostile PR do"; a hardening-checklist phrasing worked.
- devin `t1h`: methodology, labelling. Quota ran out 2026-11-09, back 2026-11-10 (did the dev re-check).
- grok `t1g`: web/docs research, leak audits (shows "idle" while working: trust its .done file).
- Coordination: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze stays until Sunny confirms the hourly usage in the Nebius console (likely billing lag; budget.md).
b. Sunny: the three blockers in `docs/live-setup.md` §0 (public forks expose held-out; Actions is ON on the forks, turn it
   off before any case push; spend freeze). Then: build the controller repo + action change (repo-dir and target inputs,
   setup-node pinned, PR checked out into a subdirectory), codex review, then the one-PR smoke test.
b2. Decide case-027 (dev): devin found #14225 did not write the bug (#13200 did); drop or replace it.
c. Sunny: devin's two open schema choices (multi-file primary; overlap strictness), still provisional. Pilot label check
   (`pilot/labels/disagreements.md`) is superseded by the scale-up but not signed off.
d. Before the held-out run, fix in writing: goldens per case, golden severity, comments per case (budget.md).
e. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · results `docs/bench/results.md` · history `.agents/LOG.md` ·
herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset` (`.agents/STATE.md`, `run/briefs/trackb-scale.md`).
