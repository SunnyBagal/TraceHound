# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-10 "dev replacements" commit. If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload, bullmq), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable)
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/` (incl. as an alternate object store; `check-attribution.py` reads held-out only with `--heldout-ok`, which artu1/bunny never pass), and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. devin, codex, grok may read held-out.

## Sunny's decisions (2026-11-10)
- **Held-out PRs open only after TraceHound is frozen (a final tag)**; then all tools run on held-out in one window. Until then forks get dev cases only.
- **No controller repo, no TraceHound review workflow on GitHub.** TraceHound runs locally per case (`scripts/run-tracehound.ts`); findings scored from local output; posting optional.
- Dev replacements: case-016 dropped as not-a-bug; the dev cases that failed attribution are replaced the same way: next candidate in screening order passing every check, else dev −1. case-002 ("moved") stays.
- **Tools:** CodeRabbit + **Greptile free Starter (50 credits; held-out + one smoke test, no dev runs)**. **Bugbot excluded** unless Sunny confirms his Cursor plan covers it at $0 (limitation).
- Dev clone fill approved (read-only fetch from the SunnyBagal forks only): **done**.

## Tracks
- **073/073a, 074, 075 (closed).** **CI:** the four repos' review workflows are manual; left: bump Action pins, create the label.
- **Track B test set** (private `SunnyBagal/tracehound-testset`): dev **40** (31 bug, 9 clean; medusa 16, payload 9, twenty 15), held-out **29** (20 bug, 9 clean).
- **Dev replacements (grok, 2026-11-10):** case-016 → medusa #16130 ← #10523; case-003 → twenty #22446 ← #22305; case-025 → twenty #22724 ← #22392 (payload exhausted, fallback b); case-027 → twenty #28738 ← #14055 (medusa exhausted, fallback b); case-028 → twenty #26724 ← #23103. Leak audit 0. Labels grok vs codex (blind) **5/5 strict, 5/5 bug/clean** (`labels/dev/compare-replace.md`); codex flags case-025 unclear (the bug may only show after #22398).
- **Attribution** (`check-attribution.py`): dev **30 attributed, 1 moved (case-002), 0 not attributed** (artu1 rerun); held-out 19 attributed / 1 unmappable (numbers only). Held-out reading is off by default: the `heldout` side and `--alternates` need `--heldout-ok` (artu1/bunny never pass it).
- **Dev clones filled** (artu1, `tracehound-testset/scripts/fill-dev-blobs.py`): 94,091 blobs (medusa 45,773, twenty 37,256, payload 11,062) by batched read-only fetch; all 80 case commits 0 missing.
- **Forks:** Actions **OFF** on all four. Plan: `docs/live-setup.md`.
- **Local runner + triggers** (bunny, branch `run-tracehound`, worktree `~/Projects/th-bunny-runner`): round 1 `38c9167` fixed codex's 3 P1s (env allowlist + fixed error text, base/head sha binding, global cap split) and 2 P2s; round 2 `eb41993` fixed the 2 remaining P2s (re-check right before the comment; post/rerun test split). Gates (bunny): `pnpm test` ×3 green (action 302, analyzer 1013 +8 skipped, viewer 215), typecheck OK, testset 45/45. codex: round 1 NO-GO, round 2 NO-GO (P2s only), **round-2 re-review pending** (codex t14 waits on Sunny's approval of its second `pnpm test` gate). On GO: artu1 merges `run-tracehound` to main (merge commit)..

## Money (docs/budget.md is the authority)
- Real balance **$19.31** (console, 2026-11-09). `TRACEHOUND_BUDGET_TOTAL_USD=63.33547` in `.env`. Ledger `.tracehound/spend.jsonl`.
- **FREEZE: no paid job** until Sunny confirms the hourly usage in the Nebius console. This session: $0.

## Standing rules
- Cal.com is spent; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`.
- One primary bug per labelled case. Compare ledger vs console ≥ 2 h after a paid job. Only artu1 approves spend.
- Never push to upstreams; nothing to the forks but what Sunny approves; every `gh` carries `--repo SunnyBagal/<repo>`.
- Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds, tracehound-testset held-out. Nebius feedback after any Nebius call.

## Agent lanes and hc addresses (2026-11-10; recheck with `hc ls`)
artu1 `t9` · bunny `t15` (dev side only) · codex `t14` (review GO/NO-GO, second labeller) · devin `t1h` (weekly quota exhausted 2026-11-10; not in `hc ls` since) · grok `t1g` (trust its .done file).
Coordination: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze until Sunny confirms the console usage.
b. codex round-2 verdict (`run/out/codex.runner-rereview2.md`; t14 waiting on Sunny's approval of a test run) → on GO, merge `run-tracehound` (merge commit), re-run gates on main.
c. Sunny: case-025 (codex: attribution unclear) keep or replace? Devin's two schema choices.
d. Smoke test (live-setup.md §5): one dev case; Greptile's 1 smoke credit; needs the freeze lifted for TraceHound.
e. Before the held-out run, fix in writing: goldens per case, golden severity, comments per case (budget.md); then the freeze tag.
f. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · live plan `docs/live-setup.md` · results `docs/bench/results.md` · history `.agents/LOG.md` · herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset`.
