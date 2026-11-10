# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` after the 2026-11-10 "local runner plan" commit (live-setup.md, STATE, LOG). If HEAD has moved further, trust code and docs/decisions.md over this file.

## Goal
Show, on fresh held-out TypeScript PRs (twenty, medusa, payload, bullmq), whether TraceHound's reviewer (pool-verify-v1) catches real bugs that later fixes repaired.

## FIREWALL (Track B; non-negotiable)
artu1 and bunny tune TraceHound later, so they **never open, list, grep or diff** `tracehound-testset/heldout/`, `labels/heldout/` or any held-out case note, never run git on `heldout/repos/` (incl. as an alternate object store: codex's `check-attribution.py dev` adds one, so artu1/bunny don't run it until it's opt-in), and **never `hc read` the pane of an agent doing held-out work**. Numbers-only files in `run/out/` are the only held-out input. devin, codex, grok may read held-out.

## Sunny's decisions (2026-11-10)
- **Held-out PRs open only after TraceHound is frozen (a final tag).** Then all tools run on held-out in one window. Until then forks get dev cases only.
- **No controller repo, no TraceHound review workflow on GitHub.** TraceHound runs locally on each case's base..head (`scripts/run-tracehound.ts`); findings scored from local output; posting to PRs optional.
- case-027: replace from the dev pool under the same rules, else drop → **replaced** (below).

## Tracks
- **073/073a, 074, 075 (closed):** defaults lenient parser + append retry; E dropped; empty replies a known limitation.
- **CI:** review workflows in the four repos are manual (dispatch + `tracehound-review` label, merge `5fb4973`). Left: bump the Action pins; create the label.
- **Track B test set** (private `SunnyBagal/tracehound-testset`; its `.agents/STATE.md` has the split): dev **40** (31 bug, 9 clean), held-out **29** (20 bug, 9 clean), agreement 40/40 and 29/29.
- **Forks:** Actions **OFF** on SunnyBagal/{medusa,twenty,payload,bullmq} (artu1 2026-11-10, each reads back `enabled:false`). Plan: `docs/live-setup.md`.
- **Local runner** (bunny, TraceHound branch `run-tracehound` @ `3ce5aa3`, worktree `~/Projects/th-bunny-runner`, not merged): Action pipeline via a new `prepareReview` split out of `runAction`; commit pair `base_sha`..`case_head_sha` (= what open-prs pushes; tree = upstream 40/40); dry run default; per-case cap (A/2 per reviewer, total ledger + A) and per-run cap; `--cache off` default (new `TRACEHOUND_CACHE_READ`); output `runs/tracehound/<id>.json` never overwritten; `--post` under the open-prs guard + marker dedupe. Gates: action 294, analyzer 1013 (+8 skipped), viewer 215, typecheck OK. **Needs blobs:** the dev clones are `blob:none`; `--execute` refuses until base/head are filled.
- **Triggers** (`open-prs.ts --trigger`, testset, uncommitted→committed this session): coderabbit `@coderabbitai full review`, greptile `@greptileai`, bugbot `bugbot run` (ignored if a bot/app posts it: checks `gh api user` = SunnyBagal User); ≤ 10/h per tool and per (tool, fork); 41 tests pass. **codex GO/NO-GO pending** (runner + triggers).
- **Trigger facts** (grok `run/out/grok.triggers.md`; artu1 re-found 16 key phrases on the cited pages): Greptile needs credits (Starter 50/month, OSS needs ≥ 50 stars); Bugbot needs a paid Cursor plan (~$1–1.50/run); CodeRabbit OSS 1–10/h per repo. Summary in live-setup.md §2.1.
- **Attribution check** (codex `scripts/check-attribution.py`): held-out 20 bug cases → 19 attributed, 1 unmappable (numbers only). Dev first pass: 25 attributed, 1 moved (case-002), 5 missing blobs (artu1 then hydrated them from the dev forks; probe: 31/31 complete). case-027 (old) shows "attributed" mechanically: blame can't see that #13200 wrote the predicate. Dev rerun + `.done` pending (codex blocked on a permission prompt).
- **case-027 replaced** (grok, devin out of weekly quota): medusa fix #16100 ← introducer #12713, primary `pg-connection-loader.ts` 62–77 (`labels/dev/grok.jsonl`); old row in `labels/dev/replaced.jsonl`. codex second label pending.
- **case-016** (devin's "unsure"): grok's re-check says **drop** (#15719 removed `failOnError:false` on purpose; the fix restored a stale JSDoc). Recorded in `labels/dev/recheck.jsonl`; still in the manifest.

## Money (docs/budget.md is the authority)
- Real balance **$19.31** (console, 2026-11-09). `TRACEHOUND_BUDGET_TOTAL_USD=63.33547` in `.env`. Ledger `.tracehound/spend.jsonl`.
- **FREEZE: no paid job** until Sunny confirms the hourly usage in the Nebius console. This session: $0.

## Standing rules
- Cal.com is spent; never open its goldens, tool comments or score detail. Never scan `.tracehound/cache`.
- One primary bug per labelled case. Compare ledger vs console ≥ 2 h after a paid job. Only artu1 approves spend.
- Never push to upstreams; nothing to the forks but what Sunny approves; every `gh` carries `--repo SunnyBagal/<repo>`.
- Held out, never tune on: recall-seeded, linea-seeded, tracehound-seeds, tracehound-testset held-out. Nebius feedback after any Nebius call.

## Agent lanes and hc addresses (2026-11-10; recheck with `hc ls`)
artu1 `t9` · bunny `t15` (dev side only) · codex `t14` (review GO/NO-GO, second labeller) · devin `t1h` (**weekly quota exhausted 2026-11-10**) · grok `t1g` (trust its .done file).
Coordination: `~/Projects/tracehound-testset/run/{briefs,out,comms}`; `.done` markers. Commands: `docs/herdr.md`.

## OPEN TASKS (in order)
a. Spend freeze until Sunny confirms the console usage.
b. codex (t14, blocked on a permission prompt; only Sunny can answer it): `run/briefs/codex-attrib-addendum.md` → dev rerun offline, second label of the new case-027, alternates opt-in, `.done`; then `codex-runner-review.md` → GO/NO-GO.
c. Sunny: case-016 (grok: drop): drop, replace, or keep? Greptile/Bugbot: pay or skip? Devin's two schema choices.
d. After GO: merge `run-tracehound`; decide how to fill blobs (bunny's `worktree add` from the fork origin, untested); check `.cursor/config/bugbot.yaml` on case bases before any Bugbot run.
e. Before the held-out run, fix in writing: goldens per case, golden severity, comments per case (budget.md); then the freeze tag.
f. Bump the Action pins and create the `tracehound-review` label in the four repos.

## Where things are
Decisions `docs/decisions.md` · budget `docs/budget.md` · live plan `docs/live-setup.md` · results `docs/bench/results.md` · history `.agents/LOG.md` · herdr `docs/herdr.md` · test set `~/Projects/tracehound-testset`.
