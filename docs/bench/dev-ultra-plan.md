# Nemotron 3 Ultra on dev via the NVIDIA API: plan (decision 071, report only)

Written and pushed before the first Ultra call. Brief: `docs/prompts/071-dev-ultra-nvidia-api.md`.
Dev only: Cal.com is not opened, run or scored. **Report only:** nothing here changes the Action, its
model, the ReviewBench image or any published claim.

## Question

On the 40 dev pull requests, with the same frozen pipeline and prompts as 067 and only the model
swapped, does Nemotron 3 Ultra (`nvidia/nemotron-3-ultra-550b-a55b`, 550B, A55B, the free NVIDIA API
at build.nvidia.com) review better than 3 Super and 3.5 Super?

## The rule (from the brief, exactly)

- **What runs:** pool-verify-v1 on Ultra, the same frozen prompts, temperature 0, reasoning on and
  `max_tokens` as 067 (only the model changes). One run gives two rows: pool-verify-v1 and pool-raw
  (the runner's derived pool, unverified). Dev runs **10 and 11**.
- **Baselines** (recompute from records; if they differ from these by more than 0.1, STOP):
  pool-verify-v1 v1 F — 3 Super 5-run mean 42.3, 3.5 2-run mean (state it from `dev-3.5.md`);
  pool-raw v1 F — 3 Super mean 38.2, 3.5 mean 53.9.
- **Report, not adopt:** per-run and mean P/R/F under v1 (scorer of record) and x1, next to both
  baselines; a per-PR paired bootstrap (10,000 resamples, seed 71) of Ultra − 3.5 and Ultra − 3 Super
  F for both rows, with 95% intervals. "Ultra is better/worse" may be said only where the interval
  excludes 0. **Nothing is adopted**: the hackathon's runtime is Token Factory, and the Action stays
  pool-verify-v1 on 3.5 at `review-freeze-2`.
- **Fallback:** if run 11 can't finish (rate limits, session end), report run 10 alone and say so.

## Baselines, recomputed before any Ultra call

`node scripts/bench/dev-ultra.ts` on the records (no model call), v1 mean F:

| row | model | runs | stated | recomputed | within 0.1 |
|---|---|---|---|---|---|
| pool-verify-v1 | 3 Super | 1, 2r, 4, 5, 6 | 42.3 | 42.28 | yes |
| pool-verify-v1 | 3.5 Super | 7r, 8 | 50.4 (`dev-3.5.md`) | 50.36 | yes |
| pool-raw | 3 Super | 1, 2r, 4, 5, 6 | 38.2 | 38.16 | yes |
| pool-raw | 3.5 Super | 7r, 8 | 53.9 | 53.87 | yes |

## Settings (what is fixed)

- Pipeline and prompts: `review-freeze-2`. The runner's freeze check for runs 10–11
  (`freezeCheck071`) refuses the run unless every file under `packages/analyzer/src`, `scripts/bench`
  and `config` that the tag has equals the tag, except `config/prices.json` (the 0 / 0 Ultra entry),
  `packages/analyzer/src/llm/client.ts` (the opt-in NVIDIA route), `packages/analyzer/src/bin.ts`
  (070's CLI dispatcher, imported by no stage) and the runner and its gates; nothing uncommitted.
- Reviewer stages `max_tokens` 32,000 (review-diff-v1, review-ctx-v1), verifier 16,000 (verify-ctx-v1),
  temperature 0, `chat_template_kwargs: { enable_thinking: true }`: the request body is 067's with the
  model id swapped. Judges unchanged: bench-judge-v1 (3 Super, Token Factory) and bench-judge-x1
  (Qwen, Token Factory).
- Routing: only the reviewer/verifier client of runs 10–11 gets the NVIDIA route
  (`TRACEHOUND_NVIDIA_API=1` for those stages); at most 36 requests per rolling minute, HTTP 429 waited
  out (Retry-After, else 20 s doubling, at most 5 waits) and counted, 300 s timeout per request.
- The runner's rules are 067's: one rerun of a pull request with a failed request (first attempt
  kept), a crashed run may be restarted once (061a). Cap: $3 Nebius for both runs (judges only; Ultra
  calls are ledgered at $0).
- Scoring: `node scripts/bench/dev-ultra.ts`.

## Stops (from the brief)

1. Probe (one Ultra call through the client): STOP if it fails.
2. Smoke (3 dev pull requests through run 10's pipeline, `node scripts/bench/ultra-smoke.ts smoke`):
   STOP if more than 1 of the 3 has failed chunks, any 4xx other than 429, or every finding count is 0.
   Truncations (`finish_reason: length`) are reported either way.
3. Before run 11: STOP if more than 10 of run 10's 40 pull requests have failed chunks (the model's
   reasoning doesn't fit the frozen `max_tokens`; a finding, not something to tune).
