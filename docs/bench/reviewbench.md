# TraceHound on ReviewBench

TraceHound's existing pull request reviewer, packaged as a ReviewBench agent. ReviewBench
(`review-bench/ReviewBench` @ `12e9d1a`, MIT) starts one container per pull request from an image on
ghcr.io, mounts the pull request, and reads a findings file; the contract is its
`AGENT_CONTRACT.md`. This image changes nothing about how TraceHound reviews: prompts, models and
pipelines are main's (decisions 055, 057, 058, 059).

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
   Action runs (`tracehound review`, `review-ctx`, `verify-ctx`) as child processes, through
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
| `pool-verify-v1` (default) | What the Action runs: head check, review-diff-v1 and review-ctx-v1 in parallel, the pool (decision 059), verify-ctx-v1 on the pool; the kept findings. This is `runPipeline`, unchanged. |
| `pool-raw` | pool-verify-v1 without its last stage: the same two reviewer commands with the same arguments, then `poolFindings`. No verifier. |
| `pool-raw-x2` | pool-raw twice with the same prompts, then the union, deduplicated with `scripts/bench/agree-rule.ts` `agrees` (the first of agreeing findings is kept, across the whole union). The response cache is cleared before the second pass, or it would replay the first; that is why this value runs only in the image (`TRACEHOUND_RB_IMAGE=1`). Each pass is all or nothing, like pool-raw; the union is over the passes that finished. A pass still running one minute before the limit is stopped, so a finished first pass is still written. |

Any other value exits 2 with the list of accepted values.

`RB_CONFIG_MODEL` is the model id for every stage. The default is
`nvidia/nemotron-3-super-120b-a12b` (Super, reasoning on, temperature 0): the configuration every
pool-verify-v1 result was measured with (`scripts/bench/run-test-set.ts` `REVIEW_MODEL`; decisions
059, 062) and the one the cost figures below come from. The Action with an empty `model` input
differs: it leaves each stage on its own CLI default, Nano for the two reviewers and Super for the
verifier (`docs/action/README.md`). `RB_MODEL_BASE_URL`, the registered model API URL, becomes
`NEBIUS_BASE_URL` for the stages.

## Never fail a pull request

ReviewBench's runs are all or nothing: one pull request that never succeeds fails the whole run. So:

- Any error, a failed chunk, invalid model output after the stages' own one retry, an unreadable
  `pr.json` or diff, or the wall-clock limit writes a valid file with `"findings": []`, logs the
  reason (first line, at most 300 characters, the key masked) and exits 0. An empty diff makes no
  model call.
- The wall-clock limit is 25 minutes, under ReviewBench's default of 30. At the limit every
  running stage process is killed (`SIGKILL` through an `AbortSignal`) before the file is written.
- Only a configuration error exits non-zero (2), before any model call: an unknown pipeline,
  `pool-raw-x2` outside the image, no `NEBIUS_API_KEY`, or a missing `RB_OUT` / `RB_HEAD` /
  `RB_PR_NUMBER`. That is deliberate: a misconfigured run stops on its first pull request instead
  of publishing hundreds of empty reviews.
- Not caught: a wrong key or model id. Every chunk then fails, so every pull request gets `[]`. The
  log line says `failed chunks (first: request failed: HTTP 401 …)` for pool-raw and pool-raw-x2, and the stage
  count lines show `CHUNK_FAILED` for all three. Read the smoke test's status lines before a full run.
- Very large pull requests can hit the limit: the reviewers take 60,000-character chunks one after
  another, and a request may take up to 10 minutes. Those get `[]`.

## Network and GitHub

The run allows only the model API host. The stages call only `NEBIUS_BASE_URL` (through the
`HTTPS_PROXY` ReviewBench sets; `NODE_USE_ENV_PROXY=1` is theirs). git reads only local objects:
`cat-file`, `show` and `grep` at `RB_HEAD`. Nothing calls GitHub. The entrypoint imports no runtime
code from `packages/action/src/action.ts`, `cli.ts`, `fix.ts` or `data.ts`, so posting a review, fix
suggestions and graph history cannot run (a test checks the imports).

Our git spawns drop `GIT_CONFIG_*` (`cleanGitEnv`, decision 032). ReviewBench uses exactly those
variables to mark `/work/repo` safe, so the image sets `safe.directory '*'` in the system git config.
The image runs as root, like ReviewBench's example, so it can write the mounted `/work/out` whoever
owns it. No secret is in the image; `.dockerignore` admits only the files the pipeline needs.

## Blindness rule

Our submission configuration is pre-registered, so nobody who builds or tunes it may see the answer
key. Never open, read, grep or copy anything under ReviewBench's `golden/` directory, and never look
at its judge or classifier prompts. A session that reads the answer key voids the result. The smoke
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
   (TypeScript) and 4 (Python) with `-e NEBIUS_API_KEY`, `-e RB_MODEL_BASE_URL=…` and
   `-e RB_CONFIG_PIPELINE` (default `pool-raw`). The summary table gives, per pull request, the
   exit code, findings count, wall time and the adapter's status line; the artifact has the
   findings files and logs. `workflow_dispatch` runs only once the workflow file is on `main`.
3. Register in the portal:

| Field | Value |
|---|---|
| Image digest | the digest from step 1 |
| Model API URL | `https://api.tokenfactory.us-central1.nebius.com/v1` |
| Secret names | `NEBIUS_API_KEY` (plus `GHCR_PULL_TOKEN` only if the package stays private) |
| Configuration labels | `pipeline` = the pre-registered pipeline, `model` = `nvidia/nemotron-3-super-120b-a12b` |
| Seconds per pull request | 1800 (the default; the adapter stops itself at 1500) |
| Other egress hosts | none |

Locally, from a ReviewBench clone (needs docker, git, jq):
`scripts/try-agent.sh <image> --pr 0 -e NEBIUS_API_KEY -e RB_MODEL_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1 -e RB_CONFIG_PIPELINE=pool-raw`.
Adapter tests: `pnpm exec vitest run --config scripts/reviewbench/vitest.config.ts` and
`pnpm exec tsc -p scripts/reviewbench`. They sit outside the workspace packages, so `pnpm test` does
not run them; the image workflow does.
