# 071: Nemotron 3 Ultra on dev, free via the NVIDIA API (report only)

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops` in a **plain terminal**:

```
cd ~/Projects/tracehound-ops && caffeinate -i bun src/relay.ts start tracehound briefs/071-dev-ultra-nvidia-api.md
```

**Sunny, before starting:**
- Merge #62 (070) with **Create a merge commit**. Main must contain it.
- Copy this file to `~/Projects/tracehound-ops/briefs/071-dev-ultra-nvidia-api.md`.
- In `~/Projects/tracehound-ops/ops/lanes.json`: set `nebiusCapUsd` to **3**, and the total cap that reads 45 to **60** (confirmed 23 Oct 22:50).
- `NVIDIA_API_KEY` is in `~/Projects/TraceHound/.env` (it is, from 24 Oct 03:12).
- This job runs unattended while Sunny is at Orchestrate (24 Oct 18:00 → 25 Oct 18:00). If relay stops on a session limit, it waits for Sunny.

Decision **071**. Nebius cap **$3** (judges only; Ultra calls are free and not on Token Factory). Ledger about $40.24; total cap $60. **Report only:** nothing here changes the Action, its model, the ReviewBench image or any published claim.

## Why
Nemotron 3 Ultra (550B, A55B) is free on build.nvidia.com at 40 requests per minute. The Nebius balance can't pay for Ultra on Token Factory, or for any ReviewBench final. The question: on our 40 dev PRs, with the **same frozen pipeline and prompts as 067 and only the model swapped**, does the biggest Nemotron review better than 3 Super and 3.5 Super?

## Facts (checked by chat, 24 Oct 03:12)
- Endpoint `https://integrate.api.nvidia.com/v1`, OpenAI-compatible chat completions, model id **`nvidia/nemotron-3-ultra-550b-a55b`** (lowercase, exact), HTTP 200.
- Reasoning is **on by default**; replies carry `reasoning_content`. A 5-token `max_tokens` came back `finish_reason: length`, so reasoning tokens count against `max_tokens`.
- Rate limit **40 requests/minute** per key; HTTP 429 above it.
- Key: `NVIDIA_API_KEY` in the workspace `.env`.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` is empty; main fast-forwards to `origin/main`, which contains the merge of #62 (`grep -c '^## 070' docs/decisions.md` prints 1). `grep -c '^## 071'` prints 0.
- `pnpm test` and `pnpm typecheck` are green. If the only failures are `Test timed out in 5000ms`, rerun just those files with `--testTimeout 30000`, record it, and continue.
- Read `packages/analyzer/src/llm/client.ts`, `setup.ts`, `prices.ts`, `budget.ts`, `config/prices.json`, `scripts/bench/run-test-set.ts`, `docs/bench/dev-3.5.md`.
- The 3 Super dev records (runs 1, 2r, 4, 5, 6) and the 3.5 records (runs 7r, 8) exist under `~/Projects/tracehound-bench/reviews/dev-repeat/`. They are the baselines; don't re-run them.
- `NVIDIA_API_KEY` is set after loading `.env` (print only "set" or "missing", never the value).
- The `GIT_*` env check prints nothing.

## Steps (one commit each; run the gates as **their own commands**, read the result, then commit separately; messages `area: what changed`)
1. Branch `build/071-dev-ultra`. Save this brief verbatim as `docs/prompts/071-dev-ultra-nvidia-api.md`.
2. **Client: an opt-in second provider, additive only.**
   - Only when `TRACEHOUND_NVIDIA_API=1` is set **and** the model is `nvidia/nemotron-3-ultra-550b-a55b`, requests go to `https://integrate.api.nvidia.com/v1` with `NVIDIA_API_KEY`. Without that variable, nothing routes there, whatever the model id. The Action and the ReviewBench image never set it.
   - Every Token Factory path stays byte-identical: same URL resolution (`baseUrlFor`, `MODEL_BASE_URLS`), same key, same request body. Tests prove it, including that `NEBIUS_API_KEY` is never sent to the NVIDIA host and `NVIDIA_API_KEY` never to a Token Factory host.
   - **Throttle for that provider:** at most **36 requests per rolling minute** across the whole process. On HTTP 429, wait (`Retry-After` if present, else 20 s, doubling, max 5 waits), then retry the same request; a 429 is not a model failure, isn't charged, and is counted separately. Tested with a fake clock.
   - Request timeout for that provider: **300 s** (reasoning is slow). Token Factory's stays 60 s.
   - `config/prices.json`: add `nvidia/nemotron-3-ultra-550b-a55b` at **0 / 0**, with a note that it's the free NVIDIA API, not Token Factory. Leave the existing placeholder `nvidia/Nemotron-3-Ultra-550b-a55b` entry untouched. The ledger records these calls at $0 with their real token counts.
3. **Runner:** `run-test-set.ts` accepts `--set dev --run 10|11 --model nvidia/nemotron-3-ultra-550b-a55b`, which sets `TRACEHOUND_NVIDIA_API=1` for its stages. Records go to `reviews/dev-repeat/run-<N>-<model-slug>/` as in 067. Every other path stays byte-identical (test). Concurrency: whatever the throttle allows; don't raise any other limit.
4. **Plan commit, pushed before the first Ultra call:** `docs/bench/dev-ultra-plan.md` with this rule exactly:
   - **What runs:** pool-verify-v1 on Ultra, the same frozen prompts, temperature 0, reasoning on and `max_tokens` as 067 (only the model changes). One run gives two rows: pool-verify-v1 and pool-raw (the runner's derived pool, unverified). Dev runs **10 and 11**.
   - **Baselines** (recompute from records; if they differ from these by more than 0.1, STOP): pool-verify-v1 v1 F — 3 Super 5-run mean 42.3, 3.5 2-run mean (state it from `dev-3.5.md`); pool-raw v1 F — 3 Super mean 38.2, 3.5 mean 53.9.
   - **Report, not adopt:** per-run and mean P/R/F under v1 (scorer of record) and x1, next to both baselines; a per-PR paired bootstrap (10,000 resamples, seed 71) of Ultra − 3.5 and Ultra − 3 Super F for both rows, with 95% intervals. "Ultra is better/worse" may be said only where the interval excludes 0. **Nothing is adopted**: the hackathon's runtime is Token Factory, and the Action stays pool-verify-v1 on 3.5 at `review-freeze-2`.
   - **Fallback:** if run 11 can't finish (rate limits, session end), report run 10 alone and say so.
5. **Probe (1 call), then a 3-PR smoke:** one Ultra call through the client (report status, finish reason, reasoning and completion tokens). Then 3 dev PRs through run 10's pipeline. **STOP** if any of: the probe fails; more than 1 of the 3 PRs has failed chunks; any 4xx other than 429; every finding count is 0. Report truncation (`finish_reason: length`) counts either way.
6. **Run dev runs 10 and 11**, each launched **detached** (`nohup … > runs/071-devN.log 2>&1 &`), polling `run.json`. Before run 11, check run 10: if more than 10 of 40 PRs have failed chunks, STOP (the model's reasoning doesn't fit the frozen `max_tokens`; that's a finding, not something to tune).
7. **Score** with bench-judge-v1 and x1 as earlier dev runs do. Write `docs/bench/dev-ultra.md`: the tables, the intervals, failed chunks and truncations per run, 429 count, wall time and tokens per PR (Ultra vs 3 Super vs 3.5), and the plain answer. Append decision 071 to `docs/decisions.md`. Append a `FEEDBACK.md` entry (Nebius judge calls; and, labelled separately, how the NVIDIA API behaved).
8. Push. Open the PR to main **as a draft**, titled `071: Nemotron 3 Ultra on dev via the NVIDIA API (report only)`. Wait for CI; one fix attempt if red. Never merge.

## Rules
- **Cal.com is blind:** don't open, run or score anything under `~/Projects/tracehound-bench/test/`; no `--set cal_dot_com`.
- **ReviewBench:** don't open anything of it, and don't touch `scripts/reviewbench/` or `Dockerfile.reviewbench`.
- Don't open `linea-seeded`, `recall-seeded` or `tracehound-seeds`.
- May touch: `packages/analyzer/src/llm/` and its tests, `config/prices.json` (the one new entry), `scripts/bench/` and its tests, `docs/bench/`, `docs/decisions.md` (append), `docs/prompts/071-dev-ultra-nvidia-api.md`, `FEEDBACK.md`, `runs/`.
- Don't touch: `packages/action/`, `packages/analyzer/src/review/`, `.github/`, `viewer/`, `AGENTS.md`, `pnpm-lock.yaml`, `.env`, anything in `~/Projects/tracehound-ops/`.
- Never print, log or commit `NVIDIA_API_KEY` or `NEBIUS_API_KEY`.
- No tag operations, no destructive git. Stage by explicit path.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the plan commit's sha and time, against the probe's time;
- probe and smoke results;
- the tables (v1 and x1, both rows, both baselines) and the intervals;
- failed chunks, truncations, 429s, wall time;
- Nebius spend (judges) and Ultra token totals;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-071.md` (rules in `inbox/README.md`: only that file; then `git pull --rebase`, commit and push).
