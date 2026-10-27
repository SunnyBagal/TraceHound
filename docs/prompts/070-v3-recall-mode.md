# 070: build "recall-v3" (a ReviewBench recall-mode pipeline) and pick its model on dev

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops` in a **plain terminal**:

```
cd ~/Projects/tracehound-ops && caffeinate -i bun src/relay.ts start tracehound briefs/070-v3-recall-mode.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/070-v3-recall-mode.md`.
- Set `nebiusCapUsd` to **14** in `ops/lanes.json`.
- Confirm you're OK raising the local total cap to **$60** (`TRACEHOUND_BUDGET_TOTAL_USD=60`). The ledger is about $34.53, and the console has the credit.
- Merge #60 and #61 first, so main is current.
- While it runs, the ReviewBench portal test runs can continue: they use the `reviewbench` key.

Decision **070**. Nebius cap **$14**. Pre-registration: **P009** in the brain (`decisions/P009-reviewbench-v3-recall.md`). Copy its rules into the repo plan **exactly**. Research behind it: brain `research/R16-reviewbench-grounded-f1.md`. Deadline: the PR with the dev verdict by **24 Oct 12:00 IST**.

## Why
ReviewBench's grounded metrics ignore findings that match no golden finding, so **grounded F1 is driven by recall**. Our first test run (pool-raw, 3 Super) got grounded F1 16.0, P 70.6, **R 9.0**, with about 5 findings per PR against about 12–14 golden true positives per PR. The leaderboard leaders win on recall: "include nits" settings, gates off, many lenses, and a "look once more" pass. This job builds a recall-mode pipeline for **the ReviewBench image only**. The Action's default (pool-verify-v1 at `review-freeze-2`) does not change.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin --tags`; `git status --porcelain` is empty; main fast-forwards to `origin/main`, which contains the merges of #59, #60 and #61.
- `grep -c '^## 070' docs/decisions.md` prints 0.
- `pnpm test` and `pnpm typecheck` are green. If the only failures are `Test timed out in 5000ms`, rerun just those files with `--testTimeout 30000`, record it, and continue.
- Read:
  - `scripts/reviewbench/entry.ts`, `adapter.ts` and `format.ts`;
  - `packages/analyzer/src/review/review.ts`, `missed.ts`, `prompt-missed.ts`, `diff.ts`;
  - `packages/analyzer/src/llm/client.ts`;
  - `scripts/bench/run-test-set.ts` (the dev records layout);
  - `docs/bench/reviewbench.md`, `docs/bench/dev-3.5.md`;
  - `.github/workflows/reviewbench-smoke.yml`.
- The `GIT_*` env check prints nothing.

## Steps (one commit each; run the gates as **their own commands**, then commit separately)
1. Branch `build/070-v3-recall`. Save this brief verbatim as `docs/prompts/070-v3-recall-mode.md`.
2. **Plan commit, pushed before any model call:** `docs/bench/v3-recall-plan.md`, with P009's "What v3 is", "Dev selection" and "ReviewBench" sections **verbatim**, plus a disclosure section. Add, once step 3 exists, the sha256 of each new lens prompt. If a P009 rule turns out to be impossible as written, STOP and report; don't reinterpret it.
3. **Build `recall-v3`, additive only.** Every existing pipeline, prompt, cap and test stays byte-identical, and a test proves the existing adapter pipelines are unchanged.
   - New code under `packages/analyzer/src/review/recall/`: chunker, lens A and lens B prompts, reduce. Plus a CLI command (e.g. `tracehound review-recall`) that writes the neutral review format with a `producer` per finding (`lensA`, `lensB`, `missed`).
   - The missed-issue pass reuses `review-missed-v1` unchanged.
   - Sampling: `temperature: 1.0`, `top_p: 0.95`.
   - **Reasoning budget:** with one real call on one small dev PR, check whether Token Factory honours a reasoning budget for each model (e.g. `chat_template_kwargs.reasoning_budget`, or low-effort). If yes, use about 3,000. If not, use `max_tokens` 16,000 and one retry on `finish_reason=length` with reasoning off. Record which, per model, in the plan, **before** the dev runs.
   - Reduce: path check, range clamp, null line → the file's first changed line, dedup, cap 60, never throw (write what exists, or `[]`). Per-PR budget $0.12 and a wall-clock guard.
   - Adapter: add `recall-v3` to `PIPELINES`. Its findings go through a v3-only conversion: keep ranges (start/end), anchor null lines as above, cap 60. `MAX_FINDINGS = 40` and `toFindings` stay unchanged for the other pipelines.
   - `.github/workflows/reviewbench-smoke.yml`: add `recall-v3` to the pipeline choices. That one line is the only `.github/` change allowed.
   - Tests: no network; chunker edge cases (one huge file, 30 tiny files, binary/lock files, a hunk-split file); reduce (anchoring, clamp, dedup, cap); never-throw; prompt sha pins.
4. **Dev runs (40 dev PRs, never Cal.com):** arm **S** (`nvidia/nemotron-3-super-120b-a12b`) and arm **V** (`nvidia/Nemotron-3.5-Super-VL`), one run each, detached (`nohup … &`), polling a status file.
   - Cache reads off. Records go under `~/Projects/tracehound-bench/reviews/dev-v3/<arm>/`.
   - Then score both with bench-judge-v1 and x1 (`pnpm tracehound bench score …`, as earlier dev scoring does).
   - **Stop rule before arm V:** if arm S produced 0 findings on more than 10 PRs, or any request error (4xx/5xx, a budget refusal), STOP and report.
5. **Apply P009's dev selection exactly:**
   - baselines: pool-raw dev rows recomputed from existing records (3 Super: runs 1, 2r, 4, 5, 6; 3.5: 7r, 8);
   - the floor (v1 precision ≥ same-model pool-raw dev mean − 10.0);
   - the pick (higher v1 recall; a tie within 2.0 goes to the cheaper).
   - Write `docs/bench/v3-recall.md` with:
     - per arm: P/R/F under both judges, findings per PR, recall without the missed pass and without lens B (from producer tags), cost and seconds per PR (median, max), and truncation/retry counts;
     - the measured-cost estimate for a ReviewBench final (cost per PR × 657);
     - the verdict.
   - Append decision 070 to `docs/decisions.md`. Add a FEEDBACK.md entry (reasoning-budget support, errors with exact strings, counts).
6. Push. Open a **draft** PR `070: recall-v3 for ReviewBench (decision 070)`. Wait for CI; one fix attempt if it's red. Never merge.

## Rules
- **Blind:** no Cal.com, nothing under `~/Projects/tracehound-bench/test/`, no ReviewBench data, no `golden/`, no seeded repos.
- May touch:
  - `packages/analyzer/src/review/recall/` (new), and the analyzer CLI registration for the new command only;
  - new tests under `packages/analyzer/test/`;
  - `scripts/reviewbench/` (additive, as above);
  - a new dev runner under `scripts/bench/` if needed;
  - the one `.github/workflows/reviewbench-smoke.yml` line;
  - `docs/bench/v3-recall-plan.md`, `docs/bench/v3-recall.md`, `docs/decisions.md` (append), `docs/prompts/070-v3-recall-mode.md`, `FEEDBACK.md`, `runs/`.
- Don't touch:
  - `packages/action/`;
  - any existing prompt, pipeline or test expectation;
  - `config/` (if v3 needs a price entry, STOP and ask);
  - `viewer/`, `docs/bench/results.md`, `README.md`, `AGENTS.md`, `pnpm-lock.yaml`;
  - anything in `~/Projects/tracehound-ops/`.
- No new dependencies. No tag operations, no destructive git. Stage only by explicit path.
- `TRACEHOUND_BUDGET_TOTAL_USD=60` in the run commands (Sunny confirmed it in the relay facts; if not, STOP before step 4).

## STOP AND REPORT
Final message:
- step 0;
- the plan commit sha and its time against the first model call;
- the lens prompt shas;
- the reasoning-budget finding per model;
- the dev table (both arms, both judges, the ablations, cost, time);
- the floor check and the pick;
- the measured final-run cost estimate;
- spend;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-070.md` (rules in `inbox/README.md`).
