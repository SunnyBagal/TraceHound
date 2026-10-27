# fill-01: results.md + viewer benchmark data on v2, then fill the README and Devpost drafts

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops` in a **plain terminal**:

```
cd ~/Projects/tracehound-ops && caffeinate -i bun src/relay.ts start tracehound briefs/fill-01-results-and-drafts.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/fill-01-results-and-drafts.md`.
- `nebiusCapUsd` in `ops/lanes.json` = **0** (this job makes no model calls).
- ui-11 runs at the same time in `~/Projects/TraceHound-ui` (account B). The two jobs touch **disjoint files** (rules below), so neither waits for the other.

No decision number (docs job). Nebius **$0**. Main is `5ba60a0` (#63 and #64 merged). Target: three PRs/branches updated within about 2 hours.

---

You are filling TraceHound's published results for the Nebius × NVIDIA hackathon (submission 29 Oct). The product is frozen: **pool-verify-v1 on Nemotron 3.5 Super (`nvidia/Nemotron-3.5-Super-VL`) at tag `review-freeze-2` (`0aeef06`)**. `docs/bench/results.md` and the viewer's `/benchmark` page still describe v1 (3 Super, decision 066). This job moves them to v2 and fills the open slots in two draft PRs. **Copy numbers only from the source files named here.** The chat's sheet `~/Projects/tracehound-brain/submission/numbers.md` is the cross-check: if a source file and numbers.md disagree on any number, **STOP and report both**; don't pick one.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`. `git status --porcelain` prints nothing. `origin/main` is `5ba60a0` or contains it.
- Read: `CLAUDE.md`; `~/Projects/tracehound-brain/submission/numbers.md` (all, esp. §0 wording rules); `docs/bench/results.md`; `viewer/lib/benchmark.ts`; `viewer/test/benchmark.test.tsx`; `viewer/app/benchmark/page.tsx`; sources: `docs/bench/v2-calcom.md`, `v2-intervals.md`, `dev-3.5.md`, `dev-ultra.md`, `v3-recall.md`, `levers-v2.md`, `reviewbench.md`.
- The `GIT_*` env check (CLAUDE.md) prints nothing.
- `pnpm install --frozen-lockfile`, then `pnpm test` and `pnpm typecheck` as separate commands, green (timeouts-only failures: rerun those files with `--testTimeout 30000`, record it). Record the test count line.

## Part 1: results on main (new branch `docs/fill-results` from `origin/main`, draft PR `bench docs: results.md and /benchmark on v2 (fill-01)`)

One commit each; gates as their own commands before each commit; messages `area: what changed`.

1. Save this brief verbatim as `docs/prompts/fill-01-results-and-drafts.md`. Commit.

2. **Rewrite `docs/bench/results.md` for v2.** Keep its rules: counts only, no review or golden text; every number traceable to a named file. Structure, in this order (headings may be worded better; table order is fixed because the viewer test compares tables in order):
   - **Title + headline paragraph** (names are allowed in the repo, numbers.md §0.4): the product line (§0.5); Cal.com: statistically tied with Augment, Cursor, Greptile and Copilot, ahead of CodeRabbit, under both judges, only 10 PRs; all 50: behind Augment, tied with Cursor and Greptile, ahead of Copilot and CodeRabbit, both judges, "3rd of 6 as a point estimate"; 40 of the 50 are the dev set it was tuned on; v2 vs v1 on all 50: ahead under bench-judge-v1 (+11.0 [+1.8, +20.1]), tied under x1. Losses are published (link the losses section). Never "beats", "best", "outperforms", "state of the art".
   - **§1 What was measured**: benchmark, judges, the product config, that this is the **second** blind look at Cal.com (v1 was the first, decision 062), how v2 was chosen (067 on dev, 068 adoption, 069 plan pushed before the first Cal.com call).
   - **Table 1, "Blind test: Cal.com, v2"** (from `v2-calcom.md` bench-judge-v1 table; x1 F from its x1 table). Headers: `reviewer | comments | TP | FP | FN | P (n) | R (n) | F (v1) | F (x1)`. Rows in this order: TraceHound v2 (pool-verify-v1, 3.5, run 4) [expect 30 · 12 · 7 · 11 · 63.2% (12/19) · 52.2% (12/23) · 57.1% · 58.5%], TraceHound v1 (pool-verify-v1, 3 Super, run 1) [58.3% · 58.3%], augment, cursor, greptile, copilot, coderabbit, then two secondary rows marked "(secondary, not ranked)": review-diff-v1 (3.5, run 4), pool-raw (3.5, run 4). Below it: P/R are bench-judge-v1 counts; 11 of v2's 30 comments were judged duplicates; on this run the verifier did not raise F over review-diff-v1 alone (57.1% vs 58.5%).
   - **Table 2, "Cal.com: v2 minus each reviewer, 95% intervals"** (from `v2-intervals.md` "Cal.com" table). Headers: `v2 minus | v1: observed [95%] | x1: observed [95%] | sentence the rule allows`. Rows: Augment, Cursor, Greptile, Copilot, CodeRabbit, 3 Super pool-verify-v1 (run 1).
   - **Tables 3 and 4, "All 50 PRs, bench-judge-v1 (scorer of record)" and "All 50 PRs, bench-judge-x1 (report only)"** (counts from `v2-calcom.md` "All 50 pull requests"; intervals from `v2-intervals.md` "All-50 rank table"). Headers: `reviewer | rank of 6 (point estimate) | TP | FP | FN | P (n) | R (n) | F | v2 minus row [95%]`. Rows: Augment, Cursor, TraceHound v2: dev run 7r + Cal.com run 4 (pre-registered) [v1 F 52.2%, x1 55.4%], TraceHound v2: dev run 8 + Cal.com run 4 (second dev draw), Greptile, CodeRabbit, Copilot, and "3 Super pool-verify-v1, row (i) (not ranked)" with 066's counts. Below: the dev-run-8 robustness note from `v2-intervals.md` (under x1 the Augment interval then includes 0).
   - **Table 5, "Dev set (40 PRs, n = 74), mean per model"** (from `dev-ultra.md`'s first table, means only). Headers: `row | judge | 3 Super, mean of 5: P / R / F | 3.5 Super, mean of 2: P / R / F | Ultra, mean of 2 (report only): P / R / F`. Four rows: pool-verify-v1 v1, pool-verify-v1 x1, pool-raw v1, pool-raw x1. Below: 067's paired bootstrap 3.5 − 3 Super (v1 +8.1 [+1.4, +14.4]; x1 +3.9 [−4.2, +11.1]) from `dev-3.5.md`; Ultra's only interval excluding 0 (pool-raw v1, Ultra − 3.5 = −10.2 [−17.7, −3.2]) from `dev-ultra.md`; run-to-run spread 35.6–48.0 F (five 3 Super runs); 3.5 fails valid JSON on about 7 of 40 PRs per run; Ultra is "report only, free NVIDIA API, not Token Factory, not the product" (§0.8).
   - **Table 6, "ReviewBench test runs (25 PRs, one round, ReviewBench's own judge)"**: exactly numbers.md §4's table (headers and 6 rows). These scores come from the ReviewBench portal and are **not yet in the repo**; part 1 step 3 puts them in `reviewbench.md`, which is then their source. Below: not a leaderboard submission; no final (cost ~$107 with VAT vs a $43.52 balance, P008 amendment 8); selection bias across six configs; 3.5 lost to 3 Super on ReviewBench in both pipelines; the grounded metric rewards volume, which the verifier cuts. No leaderboard rank, ever.
   - **Table 7, "v1 history: every Cal.com run (3 Super)"**: the current "Rank in every test run" table, headers and rows **unchanged**, with a line that v1 is superseded and the full v1 page is `results.md` at revision `e91a268` (link it with that sha).
   - **Table 8, "Precision levers tried on dev"**: the current table's six rows **unchanged**, then new rows, same headers, sourced from their docs: **067** 3.5 Super (adopted, 068; bar and result from `dev-3.5.md`); **070** recall-v3 (loss: both arms below P009's precision floor; hampered by truncation and the $0.12 per-PR cap; from `v3-recall.md`); **071** Nemotron 3 Ultra (report only, not adopted; from `dev-ultra.md`); **levers v2** (report only, $0 offline replay): one row each for the per-PR cap, verifier on/off and the 2-of-3 vote, from `levers-v2.md`, with numbers.md §9's verdicts (no cap on the verified pipeline improves F with an interval excluding 0; verifier on 3.5 inconclusive, an open question; 2-of-3 vote no gain established).
   - **Losses** (numbers.md §6, plus the existing §8 items that still hold: void dev run 2, dev run 3 stopped at the cap, one JUDGE_FAILED, the $0.0113 ledger gap). **Limits** (keep 061/062's, add: v2 was chosen on the same dev set; one v2 Cal.com run; 3.5 partial reviews). **Cost** (numbers.md §8 and `dev-3.5.md`'s per-PR table; keep v1's Cal.com cost as v1 history).
   - Drop the old v1 dev tables, the v1 all-50 tables and v1's predictions section from this page (they stay at `e91a268`, linked).
   Commit.

3. **`docs/bench/reviewbench.md`**: add a section **"Test runs (portal, 23–24 Oct)"** with numbers.md §4's table and its notes, sourced as "the ReviewBench portal's run pages #328–#333 (owner's record)". Commit.

4. **`docs/bench/v3-recall.md`** (two wording fixes the chat ruled on 24 Oct, no number changes): (a) replace the self-contradicting sentence "Both arms raise recall over their model's pool-raw dev mean (S 50.0 vs 52.7, so S does not; V 63.5 vs 61.5)" with "Arm V raises recall over 3.5's pool-raw dev mean (63.5 vs 61.5); arm S does not (50.0 vs 52.7)"; (b) where refusal/failure counts appear (the "15 request errors" and the per-pull-request lists), label each count with its unit (per call, per chunk or per pull request) so the totals don't look inconsistent. Then add **"Known defects (found by Bugbot on PR #62, not fixed: v3 never runs again)"**: 1. the wall-clock guard drops lens findings already completed, so a guarded review is empty (`packages/analyzer/src/review/recall/run.ts` ~l. 299; guard hit 0 times in both arms, no dev impact); 2. lens findings are collected in completion order, so dedup survivors and the 60-cap depend on timing (~l. 257–260; small dev impact: the cap was hit on 1 arm-S PR). Commit.

5. **`viewer/lib/benchmark.ts`**: transcribe every table of the new `results.md`, in order, exactly as the test parses them (cells trimmed, `**` stripped). **Keep the exported names and the shape `{ title, note, headers, rows }` exactly as they are** (ui-11 is redesigning `page.tsx` against this shape at the same time). Notes, written for the page:
   - The phrase "all 50 PRs" appears **only** in the titles of tables 3 and 4; nowhere in any note or other title (the test counts it in headings and captions). Elsewhere write "the 50 PRs" or "dev + Cal.com".
   - **Never "3rd of 6" / "3rd of six"** anywhere in the file (the test forbids it on the page). The rank column says "(point estimate)".
   - Every note follows numbers.md §0 (no "beats"/"best"; "ahead/behind" only where the interval excludes 0; Ultra "report only"; ReviewBench "test runs, not a leaderboard submission").
   Commit.

6. **Pin the source link**: set `BENCHMARK_REVISION` to the sha of the commit that last changed `docs/bench/results.md` on this branch (step 2's, or later if you changed it again). Commit.

7. Every link in the repo to a `docs/bench/results.md#…` anchor (README, docs/, viewer/) either still resolves or is updated, **except** entries in `docs/decisions.md` and links pinned to a sha. List each one you changed. Commit if any.

8. Gates: `pnpm --filter @tracehound/viewer test`, `pnpm --filter @tracehound/viewer typecheck`, `pnpm --filter @tracehound/viewer build`, then `pnpm test` and `pnpm typecheck`, each as its own command; read each. Push. Open the draft PR, then mark it ready (`gh pr ready`) so Devin reviews. Wait for CI; one fix attempt if red. Never merge. **Record the final `pnpm test` count line** (it replaces a stale number in part 3).

## Part 2: README, PR #54 (branch `docs/judges-readme`, head `64082a7`)

`git switch docs/judges-readme`; it equals `origin/docs/judges-readme` at `64082a7` (else STOP). Don't rebase; if you need main's files, `git merge origin/main` (no conflicts expected; STOP on any). One commit for the fills, one for the fixes.

- `[[TBD-ULTRA]]` (and the run-10-only sentence before it): replace with numbers.md §5's 2-run result: over dev runs 10 and 11 (judge v1), pool-verify-v1 mean F 47.1 against 3.5's 50.4 and 3 Super's 42.3, no interval-backed difference; pool-raw mean F 43.6 against 3.5's 53.9, −10.2 [−17.7, −3.2], the only interval excluding 0; x1 54.9 / 51.4. Keep "report only, free NVIDIA API, not Token Factory, not the product".
- `[[TBD-LEVERS]]` (both) and the bullet **"The verifier doesn't pay on 3.5: pool-raw ≥ pool-verify on dev and on ReviewBench."** — replace with numbers.md §9's wording: the per-PR cap (no cap on the shipped, verified pipeline improves F with an interval excluding 0; small gains only on the unverified pool at k = 4–5; a hypothesis, not adopted) and the verifier (on dev, verified beats raw with an excluding interval in 2 of 9 runs; on 3.5 neither run shows a difference, −1.6 and −5.4, intervals include 0; on ReviewBench raw scores higher in both models; **an open question, not a finding**). Link `docs/bench/levers-v2.md`. Add the 2-of-3 vote (no gain established) and "where the misses are" (both 3.5 runs miss 35 of 74 Medium+ golden comments; none of the 7 Critical is missed by both; sentry most missed, 14 of 21 Medium+).
- Update any `results.md#…` anchor link to part 1's headings.
- **Leave `[[TBD-SEEDED]]` exactly as it is** (seed-01 fills it later).
- `grep -n "TBD-ULTRA\|TBD-LEVERS" README.md` prints nothing; `grep -c "TBD-SEEDED" README.md` is unchanged (2).
- Push. Don't mark it ready (Sunny decides).

## Part 3: Devpost drafts, PR #58 (branch `docs/devpost-drafts`, head `8184e54`)

Same switch/merge rules as part 2. Files: `docs/devpost/writeup.md`, `checklist.md`, `video-script.md` only.

- `[[TBD-ULTRA]]` and `[[TBD-LEVERS]]` in `writeup.md`: same content as part 2, **without any competitor or tool name** (numbers.md §0.4).
- **Claims fixes (from the chat's claims check, 27 Oct):**
  1. `writeup.md` "What's next": the "verifier doesn't pay on 3.5" bullet → numbers.md §9's wording, as in part 2.
  2. `writeup.md` Stack: "(1,305 tests on 23 Oct)" → the count from part 1's final `pnpm test`, with its date (e.g. "1,3xx tests on 27 Oct"). That number is unverifiable otherwise.
  3. `writeup.md` "AI coding assistants": remove **Cursor** from the list (§0.4: never named in the Devpost text).
  4. `writeup.md` "26 dated feedback entries to Nebius" → the count of lines matching `^## 20` in `FEEDBACK.md` on `origin/main` (29 at `5ba60a0`; recount).
  5. `writeup.md` "/benchmark (… a test fails the build if they differ …)" → "a test fails CI if they differ" (the viewer build doesn't run tests).
  6. `checklist.md`: claims check is done by **the chat** (not Gemini, dropped); UI lane is **Claude B (ui-11)** (not Cursor); mark rows for TBD-ULTRA/TBD-LEVERS done.
- **Leave every `[[TBD-SEEDED]]` and `[[SUNNY: …]]` exactly as it is.**
- Checks: `git grep -n -i "cursor\|augment\|greptile\|coderabbit\|copilot\|bugbot" origin/docs/devpost-drafts -- docs/devpost/writeup.md docs/devpost/video-script.md` after your push prints nothing; `grep -n "TBD-ULTRA\|TBD-LEVERS" docs/devpost/writeup.md` prints nothing; no "beats/best/outperforms/state of the art" in any of the three files.
- Push. Don't mark it ready.

## Rules
- **$0, no model calls**, no judge runs, no network except git and `gh`. Never print `NEBIUS_API_KEY` or `NVIDIA_API_KEY`.
- **Cal.com is blind**: nothing under `~/Projects/tracehound-bench/test/`. Nothing of ReviewBench `golden/`, `linea-seeded`, `recall-seeded`, `tracehound-seeds`. Counts only; no review or golden comment text anywhere.
- **May touch:** part 1: `docs/bench/results.md`, `docs/bench/reviewbench.md`, `docs/bench/v3-recall.md`, `viewer/lib/benchmark.ts`, anchor links under `docs/` and `README.md` (step 7 only), `docs/prompts/fill-01-results-and-drafts.md`. Part 2: `README.md` on its branch. Part 3: the three files named.
- **Don't touch (ui-11 owns them right now):** every other file under `viewer/` (incl. `viewer/app/benchmark/page.tsx` and `viewer/test/benchmark.test.tsx`) and `snapshots/`. If the viewer test can't pass without editing `benchmark.test.tsx` or `page.tsx`, **STOP and report** what and why; the chat coordinates with ui-11.
- Also don't touch: `packages/`, `scripts/`, `.github/`, `config/`, `docs/decisions.md`, `FEEDBACK.md`, `docs/bench/*-plan.md`, `pnpm-lock.yaml`, `.env`, `~/Projects/tracehound-ops/`, `~/Projects/TraceHound-ui`.
- No tags, no history rewriting, no force-push, no destructive git. Stage by explicit path. Never merge.

## STOP AND REPORT
Final message = the report: step 0 (test count, any STOP); part 1: each table's title and row count, every place a source and numbers.md disagreed (should be none), the anchor links changed, the pinned revision, gate results, PR number, head sha, CI state; part 2 and part 3: head shas, the exact new text that replaced each `[[TBD-…]]` and each claims fix, the remaining `[[TBD-SEEDED]]` / `[[SUNNY]]` counts per file, the grep results. Anything not done.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-27-sunny-fill-01.md` (rules in `inbox/README.md`: only that file; then `git pull --rebase`, commit and push).
