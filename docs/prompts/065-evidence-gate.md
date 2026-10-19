# 065: evidence verifier + deterministic gate (dev only; Cal.com untouched)

Tool: relay (Claude Code builder + reviewer). Folder: `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops`:

```
caffeinate -i bun src/relay.ts start tracehound briefs/065-evidence-gate.md
```

**Sunny, before starting:**
- #45 (gate, after codex-08b), #46 (064) and #47 (contracts) are merged.
- Set `nebiusCapUsd` to **5** in `~/Projects/tracehound-ops/ops/lanes.json` yourself.

Decision number: 065. Nebius cap: **$5**. The ledger stands at $23.17; the total cap is $45.

## Why
- 064 showed that one dev run proves nothing. pool-verify-v1's F ranged from 35.6 to 48.0 across five runs at temperature 0 (mean 42.3, P 40.5 under bench-judge-v1). So **every comparison in this job uses the mean over the same five dev runs**.
- Voting raised precision (P 53–63%), but it cost recall and 5× the price. Not adopted.
- The next precision levers are a verifier that has to **prove** a finding, and a deterministic gate that checks the proof.
  - verify-ctx-v1 answers keep or drop with no evidence.
  - The new verifier must quote the exact code and name a concrete failure, or the finding is dropped.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` prints nothing; you are on main, equal to origin/main.
- Main contains the merges of #45, #46 and #47. `grep -c '^## 064' docs/decisions.md` prints 1, and `grep -c '^## 065'` prints 0.
- `node packages/analyzer/src/bin.ts gate --help` works.
- The records exist for all **five** dev runs (1, 2r, 4, 5, 6), as listed in `docs/bench/vote-plan.md`: `pool-raw/` and `pool-verify-v1/` for 40 PRs each.
- The bare repos in `~/Projects/tracehound-bench/repos/` resolve every head sha.
- The `GIT_*` env check prints nothing.
- **Do not edit anything under `~/Projects/tracehound-ops/`.** 064's builder changed `lanes.json` itself, and that was wrong. If the cap looks wrong, STOP AND REPORT.

## Steps (one commit per step, each with `pnpm test` and `pnpm typecheck` green; messages in the form `area: what changed`)

1. Create branch `build/065-evidence-gate`. Save this brief verbatim as `docs/prompts/065-evidence-gate.md`.

2. **The verifier `verify-evidence-v1`.** New files `packages/analyzer/src/review/verify-evidence.ts`, `verify-evidence-prompt.ts` and `verify-evidence-cli.ts`. Don't change any existing file under `review/` except one line in `bin.ts`.
   - **Context:** exactly verify-ctx-v1's per-finding context (call its builder in `verify-context.ts`; don't change it). Same model, Super, reasoning on, temperature 0.
   - **The prompt asks for JSON:**
     ```
     {"verdict": "keep" | "drop",
      "evidence": [{"path", "line", "quote"}],
      "scenario": string,
      "severity": "high" | "medium" | "low",
      "category": "correctness" | "security" | "performance" | "contract" | "style"}
     ```
     - `evidence`: 1–3 items. Each `quote` is one exact line copied from the context shown, with its `line`.
     - `scenario`: one sentence of concrete input or state, and the wrong result it gives.
     - The prompt says: keep only a defect that changes behaviour, and drop style, naming, docs and speculation ("might", "could") that has no concrete scenario. If you cannot quote the code that fails, drop.
   - **Invalid reply:** retry once. If it's still invalid, record `VERIFY_FAILED`, keep the finding, and give it no evidence. The gate will then drop it under `requireEvidence`; report the count.
   - **Unit tests:** parsing, schema validation, the retry, and that the prompt builder is pure.

3. **Freeze commit (push it before any model call).** Write `docs/bench/evidence-plan.md` with the prompt's sha256, the variants, and the adoption rules below, exactly as written. Push it.

   **Variants.** Each is computed on all 5 dev runs, scored with bench-judge-v1 (the scorer of record) and bench-judge-x1:
   - **A, gate-only:** pool-verify-v1's outputs → `tracehound gate` with default options. $0. The gate's `--repo` is a temporary `git worktree` of the bare repo at the PR's head, removed afterwards; `--base` is the merge base.
   - **B, ev-gate:** pool-raw → verify-evidence-v1 → keep verdict `keep` → `gate --require-evidence --min-severity medium`.
   - **B-all (report only):** the same as B, without `--min-severity`.
   - **C, contracts (report only):** for each PR, `tracehound contracts` on its merge base and head in the bare repo. Report the finding count per repo and how many the judge maps to a golden comment. Run it on run 1's PR list only, since it's deterministic.
   - **Baseline:** pool-verify-v1, with each run's F and P and the 5-run mean (v1: F 42.3, P 40.5; x1: F 51.3, P 50.9).

   **Adoption rules (pre-registered).** Use 5-run means throughout.
   - **A is adopted** as a default stage if its mean P is above the baseline's mean P under v1, **and** its mean F is at least the baseline's mean F under both v1 and x1. A is deterministic and free; its job is to cut noise without losing anything.
   - **B is adopted** (it replaces verify-ctx-v1 in the pipeline) if all three hold:
     - its mean F under v1 is at least **3.0 points** above the baseline's;
     - its mean P under v1 is at least **8.0 points** above the baseline's;
     - its mean F under x1 is at least the baseline's.
   - If both A and B pass, the pipeline is B, with A's rules applied inside the gate.
   - If neither passes, the job is a loss. Report it plainly.

4. **Run B** over the 5 runs' pool-raw records, with a detached launch (`nohup … > runs/065-ev.log 2>&1 &`) and polling.
   - Expected cost: about 240 findings × 5 runs × about $0.0023, roughly $2.8 plus judging.
   - Sub-cap: **$4.0** for the verifier and **$1.0** for judging. Write both in `evidence-plan.md` before the first call.
   - If the cap stops B, use the runs that finished, with means over those runs for both B and the baseline. Write this fallback into the plan.

5. **Score.** Use `scripts/bench/evidence.ts`, which makes no model call except the two judges. Write `docs/bench/evidence.md` with:
   - one table per judge per variant (counts, P/R/F, comments per PR, each run and the mean);
   - **the drop log: per rule id, how many findings it dropped, and how many of those the judge had scored TP.** This is the evidence for each rule;
   - VERIFY_FAILED counts;
   - the cost per PR of B;
   - three example kept findings from B, showing their evidence and scenario. Use dev only, and quote only the reviewer's output, never golden comment text;
   - the adoption verdict.
   Append decision 065 to `docs/decisions.md`.

6. Push. Open the PR to main **as a draft**, titled `065: evidence verifier + deterministic gate (decision 065)`. Wait for CI. Make one fix attempt if it's red, and STOP if it's red twice. Never merge.

## Rules
- **Cal.com is blind.** Don't open, run or score anything under `~/Projects/tracehound-bench/test/`, and don't run `--set cal_dot_com`.
- May touch:
  - the new `packages/analyzer/src/review/verify-evidence*.ts` files and their tests in `packages/analyzer/test/`;
  - one line in `packages/analyzer/src/bin.ts`;
  - `scripts/bench/`;
  - `docs/bench/`;
  - `docs/decisions.md` (append only);
  - `docs/prompts/065-evidence-gate.md`;
  - one line in `CLAUDE.md`;
  - one entry in `FEEDBACK.md`;
  - `runs/`.
- Do not touch:
  - existing reviewer or verifier code and prompts;
  - `packages/analyzer/src/gate/` and `contracts/` (use their CLIs as they are);
  - `packages/action/`, `.github/`, `viewer/`, `config/`, `pnpm-lock.yaml`;
  - **anything in `~/Projects/tracehound-ops/`**.
- No tag operations and no destructive git. Stage only by explicit path.

## STOP AND REPORT (post it as a PR comment via a file under `runs/`, then make it your final message)
- The step 0 results; the freeze commit sha and push time; the time of the first model call.
- Every table, with every count.
- The adoption verdict and the rule as applied.
- The spend, from the ledger delta.
- Anything you did that the brief didn't ask for.
