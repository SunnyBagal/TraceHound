# 067: Nemotron 3.5 Super on dev: does the smarter model make a better reviewer? (dev only)

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops`:

```
caffeinate -i bun src/relay.ts start tracehound briefs/067-dev-nemotron-3.5.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/067-dev-nemotron-3.5.md`.
- Set `nebiusCapUsd` to **8** in `~/Projects/tracehound-ops/ops/lanes.json`.
- Main has #50 and #51 merged (it does, as of 20 Oct).

Decision number: 067. Nebius cap: **$8**. Ledger about $25.82; the total cap is $45.

## Why
Nemotron 3.5 Super is on Token Factory at the same price as Nemotron 3 Super. Its SWE-bench Verified is 71.1 vs 60.5, but those come from different harnesses. The question here: on our own dev set, with the **same frozen prompts and the same pipeline (pool-verify-v1)**, does swapping only the model raise F?

This runs on dev only. It touches no ReviewBench data and no Cal.com data. The answer decides the Action's default model before freeze-2 on 24 Oct.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` prints nothing. Switch to main and fast-forward (`git merge --ff-only origin/main`). HEAD equals origin/main.
- `config/prices.json` has `nvidia/Nemotron-3.5-Super-VL` at 0.30/0.90 (from #50).
- `grep -c '^## 066' docs/decisions.md` prints 0 or 1 (066 may still be open; that's fine). `grep -c '^## 067'` prints 0.
- The 3 Super dev records for runs 1, 2r, 4, 5 and 6 exist under `~/Projects/tracehound-bench/reviews/dev-repeat/` (064 used them). They are the baseline; don't re-run them.
- The `GIT_*` env check prints nothing.

## Steps (one commit each; run `pnpm test` and `pnpm typecheck` as **their own command**, read the result, then commit separately; messages `area: what changed`)
1. Branch `build/067-dev-3.5`. Save this brief verbatim as `docs/prompts/067-dev-nemotron-3.5.md`.
2. **Runner:** `scripts/bench/run-test-set.ts` gets a `--model <id>` option, for `--set dev` only.
   - The default stays `REVIEW_MODEL`. The Cal.com path stays byte-identical; add a test that proves it.
   - Records for a non-default model go to `reviews/dev-repeat/run-<N>-<model-slug>/`, and `run.json` records the model.
   - It applies to every stage (`review`, `review-ctx`, `verify-ctx`). Prompts, temperature 0, reasoning on and `max_tokens` are unchanged.
   - The judges stay as they are: v1 is Nemotron 3 Super (the scorer of record), and x1 is reported alongside.
3. **Freeze commit (push it before any model call).** Write `docs/bench/dev-3.5-plan.md` containing the rule below, exactly as written:
   - **Baseline:** pool-verify-v1 on 3 Super, the 5-run mean on dev (runs 1, 2r, 4, 5, 6): v1 F 42.3, P 40.5; x1 F 51.3. Recompute these from the records and state them. If they differ from these numbers by more than 0.1, STOP.
   - **Candidate:** pool-verify-v1 on `nvidia/Nemotron-3.5-Super-VL`, dev runs 7, 8 and 9.
   - **Adopt 3.5 as the Action's default** only if all of these hold:
     - its 3-run mean F (v1) is ≥ **baseline + 3.0**;
     - its mean P (v1) is ≥ the baseline's mean P;
     - its mean F under x1 is ≥ the baseline's x1 mean.

     Also report a per-PR paired bootstrap (10,000 resamples, seed 67) of the F difference, with its 95% interval. If the rule isn't met, it's a **loss** and 3 Super stays.
   - **Fallback:** if the cap stops a run, decide on the runs that completed (at least 2), and say so. Write this fallback in the plan before the first call.
4. **Run dev runs 7, 8 and 9** with `--model nvidia/Nemotron-3.5-Super-VL`.
   - Launch each one **detached** (`nohup … > runs/067-devN.log 2>&1 &`) and poll `run.json` until it shows complete or stopped-at-cap.
   - **Before run 8 starts**, check run 7: if any PR has failed chunks, or every PR got 0 findings (truncation, a wrong model id), STOP and report the first failure reason. Don't burn the cap.
5. **Score and write `docs/bench/dev-3.5.md`:**
   - per-run and mean P/R/F under v1 and x1, next to the baseline;
   - the bootstrap interval;
   - tokens and cost per PR for 3.5 vs 3 Super (3.5 may think longer);
   - the adoption verdict, stated plainly.

   Append decision 067 to `docs/decisions.md`.
6. Push. Open the PR to main **as a draft**, titled `067: Nemotron 3.5 Super on dev (decision 067)`. Wait for CI; make one fix attempt if it's red. Never merge.

## Rules
- **Cal.com is blind**: don't open, run or score anything under `~/Projects/tracehound-bench/test/`, and don't run `--set cal_dot_com`.
- **ReviewBench:** don't open anything of it.
- Don't open `linea-seeded`, `recall-seeded` or `tracehound-seeds`.
- May touch: `scripts/bench/` and its tests, `docs/bench/`, `docs/decisions.md` (append only), `docs/prompts/067-dev-nemotron-3.5.md`, `FEEDBACK.md` (one entry on how 3.5 behaved on Token Factory), and `runs/`.
- Don't touch: `packages/`, `config/`, `.github/`, `viewer/`, `AGENTS.md`, `pnpm-lock.yaml`, or anything in `~/Projects/tracehound-ops/`.
- No tag operations and no destructive git. Stage only by explicit path.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the frozen plan's commit sha, and its time against the first model call;
- the table;
- the bootstrap interval;
- spend;
- the verdict;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-067.md` (rules in `inbox/README.md`: only that file; then `git pull --rebase`, commit and push).
