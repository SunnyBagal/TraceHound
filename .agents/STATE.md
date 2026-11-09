# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-09 Track B scale-up commit (budget.md ledger audit, this file, LOG). If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable)
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/`, and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. devin, codex, grok may read held-out.

## Tracks
- **073/073a, 074, 075 (closed):** defaults lenient parser + append retry; E dropped; empty replies a known limitation. $0.73195 + $3.36463 + $0.49090.
- **CI:** review workflows in the four repos are manual (dispatch + `tracehound-review` label, merge `5fb4973`). Left: bump the Action pins; create the label in each repo.
- **Track B (tracehound-testset, private repo github.com/SunnyBagal/tracehound-testset):** split before labelling, seed `0xec6bf5fc` (testset `.agents/STATE.md` has the split). Dev **40** (medusa 17, payload 10, twenty 13; 31 bug, 9 clean). Held-out **28** (medusa 8, payload 10, twenty 10; 19 bug, 9 clean): **12 bug cases short**, every fix pool used up. Agreement: dev 40/40 strict and bug/clean; held-out 28/28 and 28/28. Leak audit closed (0 open Fix items).

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
- codex `t14`: code review GO/NO-GO; second builder; second labeller. Asks permission for writes outside its roots: Sunny approves in its pane.
- devin `t1h`: methodology, labelling. **Hit its daily quota 2026-11-09** (pane shows an error); codex took over its held-out leak fixes.
- grok `t1g`: web/docs research, leak audits (shows "idle" while working: trust its .done file).
- Coordination: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze stays until Sunny confirms the hourly usage in the Nebius console (likely billing lag; budget.md).
b. Sunny: how to fill the 12 missing held-out bug cases. Options: (1) accept 28 held-out (19 bug); (2) add bullmq (27 usable
   fixes) both sides; (3) pre-register a wider fix window (fixes before 2026-07-01, at the cost of training-cutoff risk);
   (4) relax the 80% single-introducer rule. Any change applies to both sides and is written down before mining.
c. Sunny: devin's two open schema choices (multi-file primary; overlap strictness), still provisional. Pilot label check
   (`pilot/labels/disagreements.md`) is superseded by the scale-up but not signed off.
d. Before the held-out run, fix in writing: goldens per case, golden severity, comments per case (budget.md).
e. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · results `docs/bench/results.md` · history `.agents/LOG.md` ·
herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset` (`.agents/STATE.md`, `run/briefs/trackb-scale.md`).
