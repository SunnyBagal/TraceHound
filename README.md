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

## Quick start

```bash
pnpm install
pnpm demo                               # clone the pinned demo repo, analyze → snapshots/
pnpm test                               # analyzer + viewer tests (never call a model)
pnpm --filter @tracehound/viewer dev    # http://localhost:3000
```

The optional Nemotron naming pass: put `NEBIUS_API_KEY=...` in `.env` (see `.env.example`).
Spend is capped by `TRACEHOUND_BUDGET_RUN_USD` (default $1) and `TRACEHOUND_BUDGET_TOTAL_USD`
(default $45). `pnpm spend` prints the ledger. Re-runs on an unchanged commit hit the response
cache and cost $0.

## Deploy the viewer (Vercel, static export)

The viewer is a fully static export: HTML, JS and `snapshots/*.json`. No server, API or env
vars are needed at runtime.

**Option A: Git integration (recommended)**
1. On vercel.com: **Add New… → Project**, then import `SunnyBagal/TraceHound`.
2. Set **Root Directory** to `viewer`. Vercel detects Next.js and the pnpm workspace from the
   root `pnpm-lock.yaml`.
3. Leave **Build Command** as `pnpm build` (the `prebuild` step copies `../snapshots` into
   `public/`) and **Output Directory** as the Next.js default (the static export goes to `out/`).
4. **Deploy.** Every push to `main` redeploys. To publish a new snapshot, commit it under
   `snapshots/` and push.

**Option B: CLI, prebuilt**
```bash
pnpm --filter @tracehound/viewer build           # → viewer/out/
npx vercel deploy viewer/out --prod              # first run: `npx vercel login`
```

To serve it under a sub-path, build with `NEXT_PUBLIC_BASE_PATH=/tracehound`.

## Docs
- `CLAUDE.md` — stack, product rule, spending rules, roadmap
- `docs/decisions.md` — every non-obvious choice and the alternative we rejected
- `FEEDBACK.md` — dated observations on Nebius Token Factory + Nemotron

## License
MIT
