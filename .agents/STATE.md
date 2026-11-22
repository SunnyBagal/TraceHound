# .agents/STATE.md: read first; rewrite (never append) at the end of every session; ≤ 60 lines
HEAD: `main` @ `bdc7ed4` (22 Nov; W1 merge `890943e`). **The held-out run is over and published.** Reviewer work has stopped (080); the repo is in **maintenance: fixes only**. Previous STATE (full rulings 076–076z, Track B detail): `git show 8961158:.agents/STATE.md`.

## Result (decision 081; page `docs/bench/ts-heldout.md`; live /benchmark)
- 29 held-out TS PRs (medusa 8, payload 10, twenty 10, bullmq 1; 20 bug, 9 clean), one 72 h window 19–22 Nov, tag `review-freeze-3` (`25151b1`).
- Hand-checked caught of 20 (Wilson): **A0 4 (8.1–41.6%), CodeRabbit 10 (29.9–70.1%), Greptile 12 (38.7–78.1%).** Pairs: A0–CR 2 vs 8, p 0.109 (C); A0–Greptile 0 vs 8, p 0.0078 (B). Exposure 0 of 20.
- Comments/PR 0.76 / 2.83 / 2.72; on 9 clean PRs 2 / 15 / 13. A0 $0.0603/PR ledger ($0.0693 console). Haiku 6 and 7 (A0 6, v1): condition met, not switched (080).
- **079 band D** (`D_H` −8): stop reviewer work, publish result and method (done). No paid tier. Kill dates: 25 Nov and 30 Nov rows met; band A/B rows do not apply; 50 stars by 31 Dec stands.
- Predictions (078): 8 right, 6 wrong under 081 item 4's rule (chosen after the result, labelled on the page).

## What maintenance allows (080)
- Fixes, docs, viewer bugs, dependency/security updates with gates. **No** new arms, tuning, model switches, provider setting (076p withdrawn), side-track work (076m branch stays unmerged), company work.
- The frozen reviewer and the scored protocol are never changed after the lift (protocol §10). Held-out files stay out of the repo.

## Firewall
LIFTED 2026-11-22T08:40Z (H2 §6 step 8, after `dc9aab3`). Still in force: never open Cal.com goldens/tool comments/score detail; never open `~/Projects/tracehound-bench`, `-ops`, `TraceHound-eval`, `tracehound-heldout`, `Recall`; testset git only with explicit paths (a bare `git status` lists heldout/ names); practice decisions (Claude-drafted) are never data.

## Rules of work (AGENTS.md "Who owns which files", "Process", "Machine safety" d57085c)
- Briefs `run/briefs/<lane>.<task>.md` → `run/out/<lane>.<task>.md` + `.claim` + `.done` (`~/Projects/tracehound-testset/run/`); artu1 reads files, not panes; GO names a full sha; stand-ins per AGENTS Process 6.
- Merges: `git pull --rebase=merges`, then `merge --no-ff` at the GO sha, GIT_* env check, gates (`pnpm typecheck`, `pnpm test`, `pnpm --filter @tracehound/viewer build`; PATH needs `~/.local/share/vite-plus/bin` first), push. Never force-push; stage by explicit path.
- Agents have full permissions but stay in project paths; nothing destructive, no system or GitHub-settings changes; in doubt write `run/comms/<agent>-to-artu1.<topic>.md`.
- Brain at session end (public; aggregates only; a GO before push). Nebius feedback after any Nebius call. Only artu1 approves spend. Never mention battery or power to Sunny.

## Money (docs/budget.md is the authority)
- Ledger $49.92287 after H2 (H1 A0 $1.7484582; H2 judging $0.076046); hard stop $61.08980 in `.env`. Haiku draws $0.37 on Anthropic ($0.1864 each; $0.3727592 total, budget.md). Last console reading $16.20 (17 Nov). No paid work is planned.

## Agents (recheck with `hc ls`)
artu1 `t9` · bunny `t15` · codex `t14` (**status error since 22 Nov ~04:15Z; Sunny to restart; its window-watch sends automated alerts, ignore**) · grok `t1g` (stand-in for codex on review) · devin out of quota. Commands `docs/herdr.md`.

## OPEN
1. Done 22 Nov: PR #77 (ui-01b viewer inspector bounds) merged `bdc7ed4` at `2519b54` (bunny brought it up to main; grok GO). Brain batch pushed (vault `63c13a5`: 39 inbox notes, NOW, timeline phase 6, results, digest 079–081; grok GO after two edits).
2. codex (t14): Sunny restarts it; on recovery it writes `run/comms/codex-to-artu1.recovered.md`.
3. Docker prune: proposal to Sunny (system change; not run by an agent without his yes).
4. Failure-2 note: 28 CodeRabbit pre-trigger comments were probably skip notices edited after the trigger; their first versions are not in the records, so the page says "0 confirmed other".
5. P1's §4 report `run/out/artu1.dev-coderabbit.md` exists (17 Nov); nothing further needed now that F1 passed.

## Where things are
Decisions `docs/decisions.md` (latest 081) · held-out page `docs/bench/ts-heldout.md` + `ts-heldout.*.json` · dev table `docs/bench/ts-dev.md` · protocol `docs/eval/ts-protocol.md` rev 13 · runbooks `docs/runbooks/` · budget `docs/budget.md` · history `.agents/LOG.md` · test set `~/Projects/tracehound-testset` · brain `~/Projects/tracehound-brain`.
