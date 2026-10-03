# TraceHound

Persistent repository intelligence for humans and AI agents. TraceHound maps TypeScript
codebases into evidence-backed architecture graphs: every edge on the canvas points back to a
file, symbol and line range in the analyzed code, with the extractor that found it and how
confidently the value was resolved (`proven` · `resolved-default` · `dynamic`).

- **Analyzer** (`packages/analyzer`) — ts-morph + Zod. Deterministic extraction of imports,
  routes, Redis and Prisma usage and env reads. It groups files into responsibility-based
  components and writes a snapshot keyed by commit SHA + analyzer version. There's an optional
  naming pass with NVIDIA Nemotron (Nebius Token Factory) that works from extracted facts only,
  under hard budget caps.
- **Viewer** (`viewer/`) — static Next.js + React Flow + ELK canvas with node and edge
  inspectors, evidence snippets, GitHub permalinks and a warnings panel.

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
  It runs agent-v4 on Nemotron Nano with reasoning on (`--reasoning off` to disable); `--graph on`
  adds the architecture-graph tools.
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
