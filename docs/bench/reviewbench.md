# TraceHound on ReviewBench

TraceHound's existing pull request reviewer, packaged as a ReviewBench agent. ReviewBench
(`review-bench/ReviewBench` @ `12e9d1a`, MIT) starts one container per pull request from an image on
ghcr.io, mounts the pull request, and reads a findings file; the contract is its
`AGENT_CONTRACT.md`. This image changes nothing about how TraceHound reviews: prompts, models and
pipelines are main's (decisions 055, 057, 058, 059). The one addition is candidate 6's
missed-issue pass (`review-missed-v1`, P008 amendment 2); the Action does not run this stage.

- Image: `ghcr.io/sunnybagal/tracehound-reviewbench`, `linux/amd64`, built by
  `.github/workflows/reviewbench-image.yml` from `Dockerfile.reviewbench`; registered by digest.
- Entrypoint: `scripts/reviewbench/entry.ts` (contract I/O and the never-fail wrapper), with
  `adapter.ts` (input and finding mapping) and `format.ts` (the contract's shapes and checks).
- Smoke test: `.github/workflows/reviewbench-smoke.yml` (manual).

## What one container does

1. Reads `RB_OUT`, `RB_HEAD`, `RB_PR_NUMBER`, `RB_BASE`, `RB_NWO`, `RB_AGENT`, `/work/pr/pr.json` (title,
   body) and `/work/pr/diff.patch` (the three-dot diff), and builds our `ReviewerInput`: title,
   body, number = `RB_PR_NUMBER`, diff. An empty title becomes `owner/repo#number`.
2. Prints the settings it applies, for example
   `pipeline=pool-raw model=nvidia/nemotron-3-super-120b-a12b base_url=https://… limit_min=25 max_findings=40`.
   The contract asks for this: a label whose value never appears in the output is reported as unread.
3. Runs the selected pipeline in-process on `/work/repo` at `RB_HEAD`: the same stage commands the
   Action runs (`tracehound review`, `review-ctx`, `verify-ctx`, plus `review-missed` for
   pool-raw-missed) as child processes, through
   `packages/action/src/pipeline.ts`. Each stage's count line (chunks, findings, drops, calls, cost)
   is echoed to stderr. Finding text never is.
4. Writes `RB_OUT`:
   `{ pr: { repo, pr_number, base, head }, agent, findings: [{ file, start_line, end_line, message, producer }] }`.
   `pr.head` = `RB_HEAD`, `pr.pr_number` = `RB_PR_NUMBER`, `agent` and `producer` = `RB_AGENT`.
   - Our findings have one line, which is a new-side line of the diff (the reviewers already drop
     anything else), so `start_line` = `end_line` = that line at head.
   - A finding with a null line (file-level) is dropped and counted (`dropped_no_line`).
   - Paths lose a leading `./` or `/`.
   - At most 40 findings, in pipeline order; the rest are counted (`capped`).
   - The file is checked against the contract (and the checks `scripts/try-agent.sh` runs), written,
     read back and checked again.
5. Logs `status=… findings=… dropped_no_line=… dropped_empty=… capped=… cost_usd=… wall_s=…` and
   exits 0.

## Configurations

| `RB_CONFIG_PIPELINE` | What runs |
|---|---|
| `pool-verify-v1` (default) | What the Action runs: head check, review-diff-v1 and review-ctx-v1 in parallel, the pool (decision 059), verify-ctx-v1 on the pool; the kept findings. Uses the Action's `runPipeline`, including partial results (decision 068). |
| `pool-raw` | pool-verify-v1 without its last stage: the same two reviewer commands with the same arguments, then `poolFindings`. No verifier. |
| `pool-raw-x2` | pool-raw twice with the same prompts, then the union, deduplicated with `scripts/bench/agree-rule.ts` `agrees` (the first of agreeing findings is kept, across the whole union). The response cache is cleared before the second pass, or it would replay the first; that is why this value runs only in the image (`TRACEHOUND_RB_IMAGE=1`). Each pass keeps successful chunks, like pool-raw; the union is over the passes that finished. A pass still running one minute before the limit is stopped, so a finished first pass is still written. |
| `pool-raw-missed` | pool-raw, then one missed-issue pass, `tracehound review-missed` (`review-missed-v1`), on the same model. The pass gets the pool as `{ comments }` and, per diff chunk, sees the chunk, review-ctx-v1's context block and a numbered list of the pooled findings on that chunk's files (`path:line: body`, each body cut at 400 characters, `(none)` if there are none), and is asked only for defects the list does not contain. The result is the pool, then each missed finding that agrees (decision 058's rule, `agrees`) with no pool finding; the log says `pool N, missed M, new K`. Pool findings come first, so the 40-finding cap cuts missed findings first. The pass gets the time left minus one minute; if all its chunks fail, a process or output error occurs, or it runs out of time, the result is the pool alone and the log says `missed: failed (<reason>)`. Successful missed chunks are kept when others fail. It never fails a pull request that pool-raw would have passed. |

Any other value exits 2 with the list of accepted values.

`RB_CONFIG_MODEL` is the model id for every stage. The default is
`nvidia/nemotron-3-super-120b-a12b` (Super, reasoning on, temperature 0): the configuration the
original pool-verify-v1 results were measured with (`scripts/bench/run-test-set.ts` `REVIEW_MODEL`;
decisions 059, 062). The Action now defaults to 3.5 (067, 068); the adapter's default stays on 3 Super.
The Action with an empty `model` input
differs: it leaves each stage on its own CLI default, Nano for the two reviewers and Super for the
verifier (`docs/action/README.md`). `RB_MODEL_BASE_URL`, the registered model API URL, becomes
`NEBIUS_BASE_URL` for the stages.

Token Factory serves the two models from different regions: 3 Super (and Nano, Qwen) only from
us-central1, and `nvidia/Nemotron-3.5-Super-VL` only from us-north1. us-central1's `GET /v1/models`
lists 3.5, but its chat completions answer HTTP 404 "does not exist". The client routes per request
(`MODEL_BASE_URLS` and `baseUrlFor` in `packages/analyzer/src/llm/client.ts`): when the base URL is a
Token Factory host, a model in the table goes to the table's region, so 3.5 goes to
`https://api.tokenfactory.us-north1.nebius.com/v1` while `RB_MODEL_BASE_URL` stays us-central1.
Any other host is never rewritten. The settings line prints the URL the client resolves for
`RB_CONFIG_MODEL`, so a 3.5 run logs us-north1. The response-cache key (model and request) has no
URL in it and did not change.

The other candidate model is `nvidia/Nemotron-3.5-Super-VL`. `config/prices.json` prices it at
$0.30 / $0.90 per 1M tokens, the same as 3 Super (Nebius blog of 16 Oct 2026 and the Token Factory
model page). Without that entry it would be priced at the $5 / $15 placeholder. One review
reservation (60,000 diff characters, about 20,008 tokens by the client's estimate, plus
`max_tokens` 32,000) would then be $0.58 instead of $0.0348. Two concurrent reservations in one
process, or a few chunks in a row, or verify-ctx-v1's four concurrent calls, would cross the
default per-process cap `TRACEHOUND_BUDGET_RUN_USD=1`. The call would be refused, and the never-fail
wrapper would write zero findings with exit 0. `scripts/reviewbench/prices.test.ts` checks both
candidate models against the real table and the analyzer's own `Budget`.

Reasoning on 3.5: every stage sends `chat_template_kwargs: { enable_thinking: true }` (`REASONING_ON`,
`packages/analyzer/src/review/review.ts:15`), the flag NVIDIA's 3.5 Super VL model card documents;
nothing changes for 3.5. Reasoning tokens share `max_tokens`: 32,000 per reviewer call, 16,000 per
verifier call. The chunk records keep no `finish_reason`, so a reply truncated by that limit shows
up as an invalid reply: after the one retry the chunk is `CHUNK_FAILED` with that failure string.
That chunk contributes no findings; successful chunks remain in pool-raw and pool-verify-v1,
matching decision 067's measured configuration. In the verifier a truncated reply becomes
VERIFY_FAILED and the finding is kept.

## Pre-registered candidates

The candidates are fixed in advance by the brain's
[P008](https://github.com/SunnyBagal/tracehound-brain/blob/main/decisions/P008-reviewbench-preregistration.md):

1. pool-verify-v1 on 3 Super (`pipeline=pool-verify-v1`, `model=nvidia/nemotron-3-super-120b-a12b`)
2. pool-raw on 3 Super (`pipeline=pool-raw`, `model=nvidia/nemotron-3-super-120b-a12b`)
3. pool-raw-x2 on 3 Super (`pipeline=pool-raw-x2`, `model=nvidia/nemotron-3-super-120b-a12b`)
4. pool-verify-v1 on 3.5 (`pipeline=pool-verify-v1`, `model=nvidia/Nemotron-3.5-Super-VL`)
5. pool-raw on 3.5 (`pipeline=pool-raw`, `model=nvidia/Nemotron-3.5-Super-VL`)

6. pool-raw-missed (`pipeline=pool-raw-missed`), on the model of whichever of candidates 2 and 5
   scores higher on grounded F1 (a tie within 2.0 points goes to 3 Super), so it runs last. It is
   chosen only if it beats the best of 1–5 by at least 3.0 points (P008 amendment 2).

### Candidate 6: the missed-issue pass

`tracehound review-missed --pr <input.json> --findings <pool.json> --repo <git dir> --head <sha>
--out <file> [--model <id>] [--reasoning on|off]` (`packages/analyzer/src/review/missed.ts`,
`prompt-missed.ts`, `missed-cli.ts`). It is review-ctx-v1's reviewer (`reviewPullWithContext`,
unchanged): the same chunking, context block, reply validation, one retry, `CHUNK_FAILED`, line
checks against the diff, `REASONING_ON`, temperature 0 and `max_tokens` 32,000. Only the system
prompt is swapped and the pooled-findings list appended to each chunk's user message. Its output is
review-ctx-v1's format with only the pass's own findings.

- Prompt `review-missed-v1`, frozen, sha256
  `a5a2115f559b82de82c51ee2629e30b05c37ebe0e528e5a02b3de753b42053bc`
  (`REVIEW_MISSED_PROMPT_SHA256`, pinned in `packages/analyzer/test/review-missed.test.ts`). It was
  written from the idea (CR-Bench's missed-issue pass) and general defect categories only, with no
  model call and without reading any benchmark data, and is recorded in P008 before any test run.
- The three prompts it builds on are unchanged: review-diff-v1 `f77c2031…`, review-ctx-v1
  `0c4dcdcf…`, verify-ctx-v1 `75703fc6…` (the same test pins them).
- The Action does not run this stage; it keeps pool-verify-v1.

## Never fail a pull request

ReviewBench's runs are all or nothing: one pull request that never succeeds fails the whole run. So:

- Failed reviewer chunks contribute no findings; successful chunks are retained in all four
  pipelines (decision 068). A pool-raw pass fails from chunk failures only when all reviewer
  chunks across both reviewers failed. pool-raw-x2 unions completed passes, including partial ones;
  pool-raw-missed also retains successful missed-issue chunks. Process errors and invalid output
  still fail a pass. If no usable pass remains, the wrapper writes no findings.
- A partial result logs `status=ok partial=<failed>/<chunks>` before `findings=…`. Counts cover
  validated reviewer chunks across attempted passes, including a failed pass in pool-raw-x2 or
  a wholly failed missed-issue pass whose pool is retained; verifier failures are separate.
  With no failed chunks, the status stays `status=ok`.
- When no pass can be retained after process errors, every reviewer chunk failing, invalid stage
  output, or the wall-clock limit, the wrapper writes a valid file with `"findings": []`, logs the
  reason (first line, at most 300 characters, the key masked) and exits 0. An unreadable `pr.json`
  or diff does the same. An empty diff makes no model call.
- The wall-clock limit is 25 minutes, under ReviewBench's default of 30. At the limit every
  running stage process is killed (`SIGKILL` through an `AbortSignal`) before the file is written.
- Only a configuration error exits non-zero (2), before any model call: an unknown pipeline,
  `pool-raw-x2` outside the image, no `NEBIUS_API_KEY`, or a missing `RB_OUT` / `RB_HEAD` /
  `RB_PR_NUMBER`. That is deliberate: a misconfigured run stops on its first pull request instead
  of publishing hundreds of empty reviews.
- Not caught here: a wrong key, a wrong model id or a refused (over-budget) call. Every chunk then
  fails, so every pull request gets `[]` with exit 0. The status line says
  `status=failed: pool-raw: failed chunks (first: request failed: HTTP 401 …)` for pool-raw;
  pool-raw-x2 reports no pass finished. Stage count lines show `CHUNK_FAILED`.
  The smoke workflow rejects `status=failed`, missing or malformed statuses, and zero findings
  across its PRs; it accepts both `status=ok` and `status=ok partial=…`.
- Very large pull requests can hit the limit: the reviewers take 60,000-character chunks one after
  another, and a request may take up to 10 minutes. Those get `[]`.

## Network and GitHub

The run allows only the model API hosts. The stages call only `NEBIUS_BASE_URL`, or us-north1 for
3.5 (above), through the `HTTPS_PROXY` ReviewBench sets; `NODE_USE_ENV_PROXY=1` is theirs. git reads only local objects:
`cat-file`, `show` and `grep` at `RB_HEAD`. Nothing calls GitHub. The entrypoint imports no runtime
code from `packages/action/src/action.ts`, `cli.ts`, `fix.ts` or `data.ts`, so posting a review, fix
suggestions and graph history cannot run (a test checks the imports).

The image never reads or writes a data branch, and runs with no learned memory.
`scripts/reviewbench/imports.test.ts` fails if any `scripts/reviewbench/*.ts` imports `data.ts`,
`fix.ts` or a file whose name contains `learn`, or if anything the image runs (the adapter and the
four stage commands it spawns) reaches one through its imports.

Our git spawns drop `GIT_CONFIG_*` (`cleanGitEnv`, decision 032). ReviewBench uses exactly those
variables to mark `/work/repo` safe, so the image sets `safe.directory '*'` in the system git config.
The image runs as root, like ReviewBench's example, so it can write the mounted `/work/out` whoever
owns it. No secret is in the image; `.dockerignore` admits only the files the pipeline needs.

## Blindness rule

Our submission configuration is pre-registered, so nobody who builds or tunes it may see the answer
key. Never open, read, grep or copy anything under ReviewBench's `golden/` directory or any test-set
pull request's expected issues, and never look at its judge or classifier prompts. Never open the
`linea-seeded`, `recall-seeded` or `tracehound-seeds` repositories. A session that reads the answer key voids the result. The smoke
workflow fetches only `scripts/try-agent.sh` and `corpus/test/test.json` (a sparse checkout without
blobs) and checks that `golden/` is absent. It never runs ReviewBench's judge, and reports findings
counts and wall time, never scores. Scores come from the portal.

## Cost estimate

The final run is three rounds over 219 pull requests: 657 pull request runs. Our side only:
ReviewBench's judge runs on their keys. Prices are the third-party rates in `config/prices.json`.

| Configuration | Per pull request | 657 runs |
|---|---|---|
| pool-verify-v1 | median $0.0317, max $0.2308 (measured, 40 dev PRs, decision 059) | about $21 at the median; $152 if every PR cost the dev max |
| pool-raw | about $0.018 (estimate: pool-verify-v1 minus the verifier) | about $12 |
| pool-raw-x2 | about $0.036 (estimate: twice pool-raw) | about $24 |
| pool-raw-missed | about $0.027 (estimate: about 1.5× pool-raw, one extra call per chunk) | about $18 |

3.5 Super has the same prices. Its reasoning length on these prompts is not measured yet, so the
per-PR figures for candidates 4 and 5 are the 3 Super ones until the smoke test reports `cost_usd`.

The pool-raw-missed estimate: pool-raw makes two reviewer calls per chunk and the missed-issue pass
one more, with a larger input (the chunk, the context block and the pooled-findings list), so about
1.5× pool-raw. P008's figure for the final run, about $33, scales pool-verify-v1's measured $21
instead, so it is the more cautious one; both are estimates until the smoke test reports
`cost_usd`. `scripts/reviewbench/prices.test.ts` checks that two
concurrent review-missed reservations at the largest input (a full chunk, a full context block, a
cut description and 60 pooled findings at the 400-character cut) fit under the default $1 run cap
on both candidate models.

The pool-raw estimate: verify-ctx-v1 cost $0.32 for 143 findings in decision 058 ($0.0022 each), and
the dev pool averaged 6.1 findings per pull request (243 over 40, decision 059), so the verifier was
about $0.014 per pull request. ReviewBench's pull requests are not our dev set (more languages, some
very large diffs), so treat all of these as orders of magnitude. A 25-PR portal test run is about 25
times the per-PR figure.

The containers' spend ledger and response cache are discarded with each container, so this spend
never reaches `.tracehound/spend.jsonl` or `pnpm spend`, and the total cap
(`TRACEHOUND_BUDGET_TOTAL_USD`) cannot see it. Each stage process still has its own $1 run cap. The
only per-PR record is `cost_usd=` in the container log.

## Build, smoke test, register

1. Push to an `rb/**` branch, or run "ReviewBench image" by hand. It runs the adapter's tests and
   typecheck, then builds and pushes. The step summary gives
   `ghcr.io/sunnybagal/tracehound-reviewbench@sha256:…` and says whether an anonymous pull works. A
   workflow cannot change package visibility: to make it public, open the package's settings on
   GitHub (Danger Zone → Change visibility → Public).
2. Run "ReviewBench smoke" with that digest. It runs `try-agent.sh` on test-set indices 0
   (TypeScript) and 4 (Python) with `-e NEBIUS_API_KEY`, `-e RB_MODEL_BASE_URL=…`,
   `-e RB_CONFIG_PIPELINE` (input `pipeline`, default `pool-raw`) and `-e RB_CONFIG_MODEL` (input
   `model`: `nvidia/nemotron-3-super-120b-a12b`, the default, or `nvidia/Nemotron-3.5-Super-VL`).
   - The summary table gives, per pull request, the model applied, exit code, status,
     findings count, `cost_usd` and wall time; the artifact has the findings files and logs.
   - The job fails on a non-zero exit, on any status other than `status=ok`, or when no pull
     request got a finding. The adapter itself exits 0 in all of those cases.
   - `workflow_dispatch` runs only once the workflow file is on `main`.
3. Register in the portal:

| Field | Value |
|---|---|
| Image digest | the digest from step 1 |
| Model API URL | `https://api.tokenfactory.us-central1.nebius.com/v1` |
| Secret names | `NEBIUS_API_KEY` (plus `GHCR_PULL_TOKEN` only if the package stays private) |
| Configuration labels | `pipeline` and `model` as in the candidate's row above |
| Seconds per pull request | 1800 (the default; the adapter stops itself at 1500) |
| Other egress hosts | `api.tokenfactory.us-north1.nebius.com`, for 3.5 (already on the registration's egress list, onboarding PR review-bench/ReviewBench#92) |

### After merge: the smoke procedure

The smoke workflow appears only once it is on `main`. Run "ReviewBench image" on `main` and take the
digest from its summary. Then run "ReviewBench smoke" once per row below with that digest:

1. `pipeline=pool-raw`, `model=nvidia/nemotron-3-super-120b-a12b`
2. `pipeline=pool-verify-v1`, `model=nvidia/nemotron-3-super-120b-a12b`
3. `pipeline=pool-raw`, `model=nvidia/Nemotron-3.5-Super-VL`
4. `pipeline=pool-raw-missed`, `model=nvidia/nemotron-3-super-120b-a12b` (once rb-02 is merged and
   the image rebuilt). Besides the usual checks, the job fails when a log has no
   `pool N, missed M, new K` line, because a failed pass falls back to the pool with `status=ok`.

Each spends a few cents. All must be green before any portal run.

### Locally

From a ReviewBench clone (needs docker, git, jq):
`scripts/try-agent.sh <image> --pr 0 -e NEBIUS_API_KEY -e RB_MODEL_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1 -e RB_CONFIG_PIPELINE=pool-raw`.
Adapter tests: `pnpm exec vitest run --config scripts/reviewbench/vitest.config.ts` and
`pnpm exec tsc -p scripts/reviewbench`. They sit outside the workspace packages, so `pnpm test` does
not run them; the image workflow does.

## Test runs (portal, 23–24 Oct)

Source: the ReviewBench portal's run pages #328–#333 (owner's record). Image `9b9a5127` (P008), 25
pull requests, one round, scored by ReviewBench's own judge. These are test runs, not a
leaderboard submission, and imply no leaderboard rank.

| # | config | grounded F1 | G P | G R | augmented F1 | A P | findings |
|---|---|---|---|---|---|---|---|
| 331 | **pool-raw-x2 · 3 Super** (pre-registered winner) | **21.3** | 76.3 | 12.4 | 30.6 | 50.6 | 222 |
| 333 | pool-raw-missed · 3 Super | 20.4 | 64.5 | 12.1 | 28.9 | 43.9 | 194 |
| 328 | pool-raw · 3 Super | 16.0 | 70.6 | 9.0 | 23.0 | 52.5 | 124 |
| 330 | pool-verify-v1 · 3 Super | 13.9 | 79.5 | 7.6 | 22.3 | 67.2 | 99 |
| 329 | pool-raw · 3.5 | 13.5 | 56.3 | 7.7 | 19.0 | 44.0 | 86 |
| 332 | pool-verify-v1 · 3.5 (= the product) | 12.2 | 69.2 | 6.7 | 17.6 | 57.2 | 60 |

- No final run and no leaderboard entry: the final (219 pull requests × 3 rounds) would cost about
  $107 with VAT (measured from #331: $3.45 per 25-PR round) against a $43.52 balance (P008
  amendment 8).
- Six configurations on the same 25 pull requests: the top score among them carries selection
  bias.
- 3.5 beat 3 Super on our dev set but lost on ReviewBench in both pipelines (pool-verify-v1 12.2 vs
  13.9; pool-raw 13.5 vs 16.0).
- ReviewBench's grounded metric rewards volume (findings), which the product's verifier cuts.
