# 069: the v2 blind Cal.com run (one run, the second look at the test set)

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops`, in a **plain terminal** (not inside `claude`):

```
cd ~/Projects/tracehound-ops && caffeinate -i bun src/relay.ts start tracehound briefs/069-v2-calcom.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/069-v2-calcom.md`.
- Open `~/Projects/tracehound-ops/ops/lanes.json` and set `nebiusCapUsd` to **3**. Check that it really says 3.
- Start it **before 24 Oct 18:00 IST** (Orchestrate). Leave the laptop awake and plugged in; `caffeinate` keeps it from sleeping.
- While it runs, nothing else calls Nebius from this laptop's key (no other relay brief, no local bench runs). The ReviewBench portal and the GitHub Actions use other keys, and those are fine.

Decision number: **069**. Nebius cap: **$3** (`CAP_069_USD`). Ledger about $33.81; the total cap is $45. Cal.com run 1 on 3 Super cost $0.41 with judges, and 3.5 costs about 2× per PR, so $3 leaves room for one 061a restart.

## Why
Freeze-2 is done: tag **`review-freeze-2`** → `0aeef06` (the #57 merge). Since the first Cal.com look (062, `review-freeze-1`), the reviewer changed in one way that affects the bench: **every stage runs on `nvidia/Nemotron-3.5-Super-VL`** (067, adopted on dev; 068, the Action default), with failed reviewer chunks dropped and the rest kept (068, already the bench's rule). The prompts, pipeline, temperature, reasoning and `max_tokens` are unchanged. The int-01 contracts (#53) live only in the Action, not in this pipeline.

P007 and architecture-v2 allow **exactly one** blind Cal.com run of v2, stated as the **second look** at the test set. This job pre-registers that run, runs it once, and reports it whatever it shows. Nothing is tuned afterwards: the configuration was chosen on dev before this look.

## Step 0 (if any check fails, STOP AND REPORT)
- In `~/Projects/TraceHound`: `git fetch origin --tags`; `git status --porcelain` prints nothing; switch to main and `git merge --ff-only origin/main`. HEAD equals origin/main.
- `git rev-parse 'review-freeze-2^{}'` prints `0aeef06fa8742cc8a36581c3894e554b8748c965`.
- `git diff review-freeze-2 HEAD --stat` lists **only** `.github/workflows/tracehound-review.yml` (the dogfood re-pin, `8712273`), or nothing.
- `grep -c '^## 069' docs/decisions.md` prints 0; `grep -c '^## 068' docs/decisions.md` prints 1.
- The Cal.com inputs that 062 fetched exist in the bench folder (`~/Projects/tracehound-bench/`; check the paths `inputPaths` in `scripts/bench/test-set.ts` resolves for `cal_dot_com`). **Check existence and counts only (10 pull requests); open no file under `test/`.** Cal.com runs 1–3 exist and are complete; `run-4*` does not exist.
- The ledger (`pnpm spend`) is $34.50 or less.
- The `GIT_*` env check prints nothing.

## Steps (one commit each; run `pnpm test` and `pnpm typecheck` as **their own commands**, read the result, then commit separately; messages `area: what changed`)
1. Branch `build/069-v2-calcom` from main. Save this brief verbatim as `docs/prompts/069-v2-calcom.md`.
2. **Runner: Cal.com run 4 (v2).** In `scripts/bench/run-test-set.ts` and `scripts/bench/test-set.ts` only:
   - `--set cal_dot_com --run 4 --model nvidia/Nemotron-3.5-Super-VL` is the only new invocation. It needs `TRACEHOUND_TEST_RUN=069` (a new gate id). Runs 1–3 keep needing `061` and stay **byte-identical**; add a test that proves it. Any other model, run number or gate value is refused before any model call.
   - The model goes to every stage (`review`, `review-ctx`, `verify-ctx`), exactly as 067's `--model` does on dev. The judges are unchanged: bench-judge-v1 (scorer of record) and bench-judge-x1 (report only).
   - Records go to `test/run-4-nvidia-nemotron-3-5-super-vl/` (067's `modelRunDir` convention), and `run.json` records the model, the gate id and the freeze tag.
   - Run 4 judges the three TraceHound rows only (pool-verify-v1, review-diff-v1, pool-raw). The tools were judged in run 1, and their reviews don't change.
   - **Freeze check for run 4 (069):** the run refuses to start unless `packages/analyzer/src` and `config` equal the tag `review-freeze-2`, and `scripts/bench` equals it except `run-test-set.ts` and `test-set.ts`. All committed, with no uncommitted changes in those paths. Follow `freezeCheck067`'s pattern, and add tests for both refusals.
   - Its own cap group: `CAP_069_USD = 3`, planned $1.50. 061's rerun-once rule and 061a's restart-once rule apply unchanged (`--restart` writes `run-4r-…`, which stands for run 4).
   - stdout and stderr: counts only, as for runs 1–3.
3. **Pre-registration commit: `docs/bench/v2-calcom-plan.md` (push it before any model call).** Write it with the contents below, filling in only the `<…>` values (shas and the cited lines):
   - **Configuration:** pool-verify-v1 at `review-freeze-2` (`0aeef06`). Every stage on `nvidia/Nemotron-3.5-Super-VL` (us-north1 via #55's routing). Prompts byte-identical to 061's pins: review-diff-v1 `f77c2031…`, review-ctx-v1 `0c4dcdcf…`, verify-ctx-v1 `75703fc6…`. Recompute each sha256 and write the full value; if any differs, STOP. Temperature 0, reasoning on, `max_tokens` unchanged.
   - **Failed chunks:** a reviewer chunk with an invalid reply after one retry is dropped, and the PR is scored on the findings that remain. If every chunk fails, the PR is scored with no findings. That is how this runner and the dev runs already score them; cite the file and line. It is also the Action's rule since 068.
   - **Rows:** the primary is pool-verify-v1 (3.5). Declared secondaries are review-diff-v1 (3.5) and pool-raw (3.5). The comparison table reuses Cal.com run 1's judged rows unchanged: the five tools and 3 Super's pool-verify-v1, with 3 Super's runs 1–3 as its spread. Nothing else.
   - **Scorer and metrics:** as 061: bench-judge-v1 is the scorer of record, bench-judge-x1 is shown alongside, micro P/R/F, and JUDGE_FAILED PRs are left out and counted.
   - **One run.** It is the **second look** at Cal.com, and the results say so. No second v2 run, and no configuration change follows from it.
   - **Predictions (written by chat, 23 Oct, before any v2 Cal.com call):**
     - (a) v2 pool-verify-v1 F under v1 ≥ **52.8%**, the median of 3 Super's Cal.com runs 1–3.
     - (b) v2 pool-verify-v1 precision under v1 ≥ **55.6%**, 3 Super's median P on Cal.com runs 1–3. On dev, the gain was precision.
     - (c) **At most 3 of the 10** PRs have a failed reviewer chunk (dev: 7 of 40 per run; Cal.com PRs are larger).
   - **All-50 (v2), report only:** Cal.com run 4 plus **dev run 7r** (the first complete 3.5 dev run), under both judges, built with exactly the method of 066's all-50 table (name the script). Dev run 8 is shown alongside as a second dev draw. The tools' all-50 rows come from 066 unchanged.
   - **Where this measurement and the Action differ** (lesson, 22 Oct):
     - **contracts:** the Action posts contract findings in the review body, about files the PR didn't edit; the bench doesn't run them.
     - **max-comments:** the Action posts at most 10 inline findings per PR; the bench scores every kept finding. Report how many Cal.com PRs had more than 10 kept.
     - **reruns:** the bench reruns a PR once on a request failure; the Action doesn't.
     - **fixes and learn:** not scored; learn is off by default.

     If you find any other difference, add it.
4. **Routing check (one call, not on Cal.com):** make one request through the client on one small **dev** PR, any stage, with the 3.5 model. Confirm it went to us-north1 and succeeded. If it fails, STOP. Record the cost.
5. **Run Cal.com run 4:**
   ```
   TRACEHOUND_BUDGET_RUN_USD=3 TRACEHOUND_TEST_RUN=069 node scripts/bench/run-test-set.ts --set cal_dot_com --run 4 --model nvidia/Nemotron-3.5-Super-VL
   ```
   Launch it **detached** (`nohup … > runs/069-calcom-run4.log 2>&1 &`) and poll `run.json` until it shows complete or stopped. If the session's background limit kills your shell, the detached run keeps going; check `run.json` before anything else.
   - **Void and restart once (061a), only if** the run crashed (`running` with nothing under `scores/`), or every PR failed on a **request** error (HTTP 4xx/5xx, a budget refusal). Restart with `--restart`. Never restart for low scores or invalid-JSON chunks: those are the result.
6. **Score and write `docs/bench/v2-calcom.md`** (counts only, as `test-results.md` does):
   - The headline table for Cal.com run 4 under v1 and under x1: the three TraceHound rows on 3.5, next to run 1's five tools and 3 Super's pool-verify-v1 (run 1, and runs 1–3 min/median/max).
   - Predictions (a)–(c): right or wrong, each with its number.
   - Failed-chunk PRs (count, and failure strings, first 120 characters, with no PR titles or code), kept counts above 10, tokens and cost per PR.
   - The all-50 (v2) table, both judges, built as pre-registered.
   - **Limits:** n = 23, one run, second look, and the selection was on dev.
   - Append decision 069 to `docs/decisions.md`. Add a FEEDBACK.md entry for any Nebius behaviour (counts, error strings).
   - **Don't edit** `docs/bench/results.md`, the README or `viewer/`. The results-page update is a separate job (it has a viewer test).
7. Push. Open the PR to main **as a draft**, titled `069: v2 blind Cal.com run (second look; decision 069)`. Wait for CI; make one fix attempt if it's red. Never merge.

## Rules
- **Cal.com is blind to every session:** don't read, print or paste golden comments, tool comments, PR titles, diffs or per-comment score detail for Cal.com. Scripts read them and report **counts only**. Records stay in `~/Projects/tracehound-bench/`. Only the runner and scorer touch `test/`.
- **One look.** Run 4 is the only Cal.com run in this job (plus at most one 061a restart). Don't run Cal.com runs 1–3, and no other model or configuration on Cal.com.
- No ReviewBench data. Don't open `linea-seeded`, `recall-seeded` or `tracehound-seeds`.
- May touch: `scripts/bench/run-test-set.ts`, `scripts/bench/test-set.ts` and their tests (including the existing test files under `packages/analyzer/test/` that cover them), `docs/bench/v2-calcom-plan.md`, `docs/bench/v2-calcom.md`, `docs/decisions.md` (append only), `docs/prompts/069-v2-calcom.md`, `FEEDBACK.md`, `runs/`.
- Don't touch: `packages/*/src`, `config/`, `.github/`, `viewer/`, `docs/bench/results.md`, `README.md`, `AGENTS.md`, `pnpm-lock.yaml`, or anything in `~/Projects/tracehound-ops/`.
- No prompt or `max_tokens` changes. No tag operations, no destructive git. Stage only by explicit path.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the pre-registration commit sha, and its time against the first 3.5 call on Cal.com;
- the routing check;
- the headline table under both judges;
- predictions (a)–(c) with their numbers;
- the failed-chunk table;
- the all-50 (v2) table;
- spend;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-069.md` (rules in `inbox/README.md`: only that file; `git pull --rebase`, commit, push).
