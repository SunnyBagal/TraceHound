# TraceHound

An open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory.

## Try it

Add a repository secret `NEBIUS_API_KEY` (your Token Factory key), then save this as
`.github/workflows/tracehound-review.yml`:

```yaml
name: TraceHound review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, closed]

permissions: {}

jobs:
  review:
    if: github.event_name == 'pull_request' && github.event.action != 'closed' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      pull-requests: write
    concurrency:
      group: tracehound-review-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
      # review-freeze-2 is the frozen release. The default model runs every review stage (both
      # reviewers and the verifier) on Nemotron 3.5 Super VL; fixes run on Nemotron 3 Super.
      - uses: SunnyBagal/TraceHound/.github/actions/tracehound-review@review-freeze-2
        with:
          nebius-api-key: ${{ secrets.NEBIUS_API_KEY }}
```

This is the review job of [the example workflow](docs/action/example-workflow.yml) without its
graph-history job. Pull requests from forks are skipped, because forks don't get repository
secrets. Inputs, permissions and limits are in [docs/action/README.md](docs/action/README.md).

## How it works

```mermaid
flowchart LR
  PR["Pull request<br/>title, description, diff"] --> D["review-diff-v1<br/>reads the diff only"]
  PR --> C["review-ctx-v1<br/>diff + repository context<br/>(hunk windows, git grep references)"]
  D --> P["Pool<br/>every diff finding + context<br/>findings that agree with none"]
  C --> P
  P --> V["verify-ctx-v1<br/>keep or drop each finding,<br/>reading the code around it"]
  V --> L["Maintainer feedback (learn)<br/>drops findings like ones maintainers<br/>rejected; off by default"]
  L --> R["One COMMENT review<br/>line comments + fix suggestions"]
  K["Cross-file contracts<br/>deterministic, no model"] -.-> R
```

- **Two generators** run in parallel on Nemotron: one sees only the diff, the other also sees
  the changed files and the places that reference the changed names.
- **Pool, then verifier:** the verifier sees each pooled finding with the code around it and keeps
  or drops it. This three-stage pipeline is `pool-verify-v1` (decision 059).
- **Cross-file contracts** (on by default; [docs/contracts.md](docs/contracts.md)): a
  deterministic check that a renamed export, route, queue, Redis, env or event key still matches
  the files the PR did not edit.
- **Learning from maintainer feedback:** `learn: 'on'` suppresses findings similar to comments
  maintainers rejected, and records each suppression in the review footer. It is off by default
  and the benchmark does not measure it ([docs/learn.md](docs/learn.md)).

Stages we tried and dropped, each a loss on the dev set:
[064, vote across runs](docs/decisions.md#064--vote-across-runs-dev-only-a-loss) and
[065, evidence verifier + gate](docs/decisions.md#065--evidence-verifier--deterministic-gate-dev-only-a-loss).
Every lever we tried is in the [levers table](docs/bench/results.md#6-precision-levers-tried-on-dev).

## Results

[[RESULTS-TABLE]]

[[REVIEWBENCH]]

[[SEEDED-TEST]]

The rule: every number links to its run record; every loss is published. Full results, losses and
limits: [docs/bench/results.md](docs/bench/results.md).

## Cost per pull request

[[COST]]

## Built with

- **NVIDIA Nemotron 3.5 Super** (`nvidia/Nemotron-3.5-Super-VL`) via Nebius Token Factory, for
  both reviewers and the verifier. Decision 067 adopted it on 2 dev runs: v1 F 50.4 vs 42.3; the
  second judge's interval includes 0. Decision 068 made it the Action's default, with partial
  reviews when a chunk fails.
- **NVIDIA Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`) via Nebius Token Factory, for
  the fix suggestions, which were not measured on 3.5. Prices:
  [config/prices.json](config/prices.json) (third-party rates, not yet checked in the Nebius
  console).
- TypeScript on Node 24, ts-morph and GitHub Actions. Pooling, the contract check and learning
  use no model.

## What's next

- Measure what maintainer-feedback learning changes in posted reviews.

---

## Details

# TraceHound

TraceHound maps TypeScript codebases into evidence-backed component graphs: every edge on the
canvas points back to a file, symbol and line range in the analyzed code, with the extractor that
found it and how confidently the value was resolved (`proven` · `resolved-default` · `dynamic`).

It also has a repair loop on open NVIDIA Nemotron models whose fixes are verified independently
of the agent in a sandbox, and a reproduce stage that writes one failing test for a bug claim
and checks it in a fresh sandbox, independently of the agent. **The graph did not help the repair agent.** In a pre-registered
held-out evaluation (8 seeded tasks on one repo, 160 runs), the agent resolved about as many
tasks with the graph as without it, and never called a graph tool. See
[Held-out evaluation](#held-out-evaluation).

- **Analyzer** (`packages/analyzer`) — ts-morph + Zod. Deterministic extraction of imports,
  routes, Redis and Prisma usage and env reads. It groups files into responsibility-based
  components and writes a snapshot keyed by commit SHA + analyzer version. There's an optional
  naming pass with NVIDIA Nemotron (Nebius Token Factory) that works from extracted facts only,
  under hard budget caps.
- **Viewer** (`viewer/`) — static Next.js + React Flow + ELK canvas with node and edge
  inspectors, evidence snippets, GitHub permalinks and a warnings panel.

## PR reviewer benchmark

On 10 blind pull requests (Cal.com run 1, n = 23), TraceHound is statistically tied with Greptile and Cursor. Its run-1 F was 58.3% against CodeRabbit's 36.7%, but that is not a significant lead. No gap to another tool is outside its 95% interval. The CodeRabbit gap is the clearest: TraceHound is ahead in 96% of resamples, but its interval still includes 0 ([audit-cc01 §3.2](docs/bench/audit-cc01.md#32-bootstrap-95-ci-over-prs-for-the-calcom-f-difference)). Across all 50 pull requests it is 4th of 6 under both judges ([all-50 table](docs/bench/results.md#5-all-50-prs)). Every loss is published, including every precision lever we tried on dev ([levers table](docs/bench/results.md#6-precision-levers-tried-on-dev)); the run-to-run spread at temperature 0 is larger than every effect we tried to measure. Tool numbers come from their recorded reviews in the public benchmark dataset, scored with our judge; we did not run the tools. F under bench-judge-v1; details, losses and limits in [docs/bench/results.md](docs/bench/results.md).

| reviewer | F, blind (Cal.com run 1, n = 23) | F, dev (run 1, n = 74) |
|---|---|---|
| Augment | 73.2% | 64.1% |
| Cursor | 66.7% | 49.6% |
| **TraceHound** (pool-verify-v1) | 58.3% | 35.6% |
| Greptile | 50.0% | 49.3% |
| Copilot | 46.2% | 31.3% |
| CodeRabbit | 36.7% | 41.0% |

## Prerequisites
- Node.js ≥ 24 (the TypeScript runs on Node's native type stripping) and pnpm 11
  (`corepack enable` picks up the version pinned in `package.json`)
- git
- Docker (Docker Desktop on macOS), running, for the repair harness and its tests. Without it
  those tests are skipped with a message; everything else works.

## Quick start

```bash
pnpm install
pnpm fixture                            # clone the pinned demo repo into fixtures/demo-repo (tests use it)
pnpm test                               # analyzer + viewer tests (never call a model)
pnpm --filter @tracehound/viewer dev    # http://localhost:3000, serving the committed snapshots/
```

`pnpm demo` (= `pnpm fixture` + analyze) re-analyzes the demo repo and **overwrites the
committed snapshot in `snapshots/`**. Without `NEBIUS_API_KEY` it writes heuristic names there,
and the viewer tests, which expect the committed model-written names, then fail;
`git checkout snapshots/` restores them.

The optional Nemotron naming pass: put `NEBIUS_API_KEY=...` in `.env` (see `.env.example`).
Spend is capped by `TRACEHOUND_BUDGET_RUN_USD` (default $1) and `TRACEHOUND_BUDGET_TOTAL_USD`
(default $45). `pnpm spend` prints the ledger. Re-runs on an unchanged commit hit the response
cache and cost $0.

## Repair harness (toy task)

```bash
node eval/fixtures/build-toy-repo.ts    # build the toy repo the toy tasks point at (once)
pnpm tracehound repair --task eval/tasks/toy-discount/task.json --agent noop --provider docker
pnpm tracehound repair --task eval/tasks/toy-discount/task.json --agent nemotron --graph off --provider docker
```

- Docker must be running. The first run builds the sandbox image
  `tracehound-sandbox:bun1.4.2-ts5.9.3-2` from `harness/sandbox.Dockerfile`, which needs
  network once.
- `--agent noop` makes no model calls and ends UNRESOLVED (the bug isn't fixed). It checks the
  setup.
- `--agent nemotron` needs `NEBIUS_API_KEY`; `pnpm tracehound` loads the workspace `.env` itself.
  It runs agent-v6 (decision 047; prompt `harness/prompts/agent-v5.md`) on Nemotron Nano with reasoning on (`--reasoning off` to disable); `--graph on`
  puts a context packet from the graph in the first message and offers the graph tools. In the
  held-out evaluation this did not improve repair (below).
- Each run writes `runs/<runId>.json` with the state, the diff, every command, tokens and cost,
  and the sandbox it ran in (image id, Docker version, provider version, graph snapshot or
  `none`).

## Sandbox

- **What runs where:** Nemotron runs on Nebius Token Factory; the agent loop runs on your
  machine and calls it over the API. The agent's tools (file reads and edits, shell commands)
  and all verification (repro test, regression tests, typecheck) run in a local Docker
  container, one per run.
- **Why not Token Factory Sandboxes:** Nebius support (case AISTUDIOSUP-1966) replied that
  Sandboxes are not yet ready to be used on this account, so local Docker is the sandbox of
  record (decision 036). A Sandboxes provider can be added later behind the same interface.
- **Isolation, as tested** (`packages/analyzer/test/harness-docker.test.ts`, run in CI):
  - the network is disconnected after setup and proven off before the agent starts; requests
    from inside the agent phase fail (DNS name and raw IP)
  - the container runs as uid 1000, not root, with all capabilities dropped and
    `no-new-privileges`; only `/work` and `/scratch` are writable
  - limits: 2 GB memory, 2 CPUs, 512 processes
  - nothing from the host is mounted (no host paths, no Docker socket); the repo goes in as a
    git bundle of committed history, so untracked files like `.env` never enter; no host
    environment variables are passed
  - the container is removed after every run, and removes itself at a deadline if the harness
    dies without cleaning up
  - the base images are pinned by digest; each run records the built image's id
- **What Docker does not guarantee here:** containers share the host kernel (no VM boundary of
  their own; on macOS they run inside Docker Desktop's VM); there's no custom seccomp/AppArmor
  profile beyond Docker's defaults, no read-only root filesystem and no disk quota; network
  isolation is Docker's bridge disconnect, checked on every run, not a firewall.

## Deploy the viewer (Vercel, static export)

The viewer is a fully static export: HTML, JS and `snapshots/*.json`. No server, API or env
vars are needed at runtime.

**Option A: Git integration (recommended)**
1. On vercel.com: **Add New… → Project**, then import `SunnyBagal/TraceHound`.
2. Set **Root Directory** to `viewer`. Vercel detects Next.js and the pnpm workspace from the
   root `pnpm-lock.yaml`.
3. Build settings come from `viewer/vercel.json`: framework Next.js, build command
   `pnpm run build`, which copies `../snapshots` into `public/`, builds, and verifies the export.
   **Leave Output Directory unset.** Vercel's Next.js builder reads `.next/` and serves the
   static export itself. Pointing it at `out/` fails with "routes-manifest.json couldn't be
   found". Files outside the Root Directory must be included in the build (the Vercel default),
   because the build reads `../snapshots` and `../packages/analyzer`.
4. **Deploy.** Every push to `main` redeploys. To publish a new snapshot, commit it under
   `snapshots/` and push.

**Option B: CLI, prebuilt**
```bash
pnpm --filter @tracehound/viewer build           # → viewer/out/
npx vercel deploy viewer/out --prod              # first run: `npx vercel login`
```

To serve it under a sub-path, build with `NEXT_PUBLIC_BASE_PATH=/tracehound`.

## Held-out evaluation

Pre-registered in [`docs/eval/protocol.md`](docs/eval/protocol.md) (with Amendment 1) before any
held-out run; code frozen at tag `eval-freeze-2`. 8 seeded bug tasks on one repo (Recall), graph
on and off, Nemotron Nano and Super, 5 repeats each: 160 runs. Full tables, validity checks and
disclosures: [`docs/eval/heldout-results.md`](docs/eval/heldout-results.md).

| Model | Resolved, graph on | Resolved, graph off | Verified at stop, on | Verified at stop, off |
|---|---|---|---|---|
| Nano | 11 of 40 | 13 of 40 | 11 of 40 | 19 of 40 |
| Super | 28 of 40 | 26 of 40 | 30 of 40 | 31 of 40 |

- No difference in resolve rate between arms, as predicted in advance. No significance test was
  run; these results are not pooled with dev runs.
- The agent never called a graph tool in 80 graph-on runs, so the graph arm amounts to a context
  packet in the first message. It reached the fault file at about the same step in both arms.
- On Nano, fewer graph-on runs ended with a passing patch (11 against 19), a secondary measure.
- The model mattered far more than the graph: Super resolved 54 of 80, Nano 24 of 80.

## Known limits
- BullMQ queue pairing works when queues are constructed with literal names in plain variables.
  On ten repos it had never seen, the macro-average pairing rate was 2.1% (4 of 179 producers),
  with no wrongly named queues and one false edge. Most real code reaches queues through getters,
  wrapper functions, enum members or runtime-built names. See
  [study S1](docs/studies/s1-unseen-repos.md).

## Docs
- `CLAUDE.md` — stack, product rule, spending rules, roadmap
- `docs/decisions.md` — every non-obvious choice and the alternative we rejected
- `FEEDBACK.md` — dated observations on Nebius Token Factory + Nemotron

## Credits
- Canvas: [React Flow](https://reactflow.dev) (`@xyflow/react`, MIT). The in-canvas attribution is
  hidden (`proOptions.hideAttribution`), so it is credited here.
- Layout: [ELK](https://eclipse.dev/elk/) via [elkjs](https://github.com/kieler/elkjs) (EPL-2.0).
- Technology icons: [svgl.app](https://svgl.app), vendored in `viewer/public/icons/` (sources in
  `viewer/public/icons/CREDITS.md`).

## License
MIT
