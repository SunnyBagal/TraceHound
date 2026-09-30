# TraceHound

Analyzes a TypeScript repo and renders it as an interactive, evidence-backed component graph
on a canvas. Later: a graph-guided repair agent.

## Current state (2026-09-30)
- **Live:** https://tracehound-tau.vercel.app (Vercel, Root Directory `viewer`, auto-deploys
  from `main`; leave Output Directory unset). CI (`.github/workflows/ci.yml`) runs tests,
  typecheck, and the viewer build, and checks that `out/snapshots/index.json` exists.
- **Built:** analyzer 0.4.0 (imports, routes, Redis, Prisma, env, startup-call extractors;
  anchor-reach grouping; `tracehound.json` overrides; orphan warnings; `proven` /
  `resolved-default` / `dynamic` labels; TESTS links from test files) → static snapshots + manifest → viewer (React Flow +
  ELK, node/edge inspectors, GitHub permalinks, warnings panel, phone bottom sheet).
- **Impact (feature 4, CLI only):** `pnpm tracehound impact --repo <path> --diff <base>..<head>
  [--depth 2] [--json]` → changed/affected components with evidence chains (decision 023).
  Needs a current-version snapshot of `<base>` in `snapshots/`. No canvas highlight yet.
  Compared with dependency-cruiser `--reaches` on 3 seeded fork branches in
  `docs/impact-comparison.md` (it found nothing TraceHound missed; TraceHound over-reports at
  component granularity). A queue crossing costs one hop of depth (decision 024).
- **Demo:** `SunnyBagal/cex-v2-boilercode` (fork of `rahul-MyGit/cex-v2-boilercode`, used with
  the original author's agreement) @ `da0e3d6` → 9 components, 17 edges, 1 orphan warning
  (`engine/src/store/exchange-store.ts`). The fork's `main` must stay at `da0e3d6`; seeded
  changes live on `seed/<name>` branches based on `da0e3d6` and are never merged. Don't add a
  LICENSE file to the fork. Regenerate names without spending:
  `node src/cli.ts … --cache-only` (any cache miss aborts, no network).
- **Naming:** Nano with reasoning off (`chat_template_kwargs.enable_thinking=false`, decision
  020) plus deterministic checks (021). Nano beat Super on cost and tied on checks, so Nano
  stays the default. Spend so far is about $0.043 (`pnpm spend`).
- **Prices:** `config/prices.json` has Nano/Super rates from third-party trackers, not yet
  verified in the Nebius console.

### Open blockers
1. ~~**CEX has no license.**~~ Closed 2026-09-30: the demo repo is the fork
   `SunnyBagal/cex-v2-boilercode`, with the original author's agreement.
2. **Sandbox: waiting on Sandboxes beta access** (requested in the console; free during beta,
   runs don't consume credits). Until then `/whoami` reports every permission `false` and
   list/spawn return 403 (FEEDBACK.md, 2026-09-30). Don't call the Sandboxes API or edit the
   spike script until access is confirmed, then rerun
   `node --env-file=.env scripts/sandbox-spike.ts`. Decision 022 (TypeScript over REST) stands.
3. ~~**Naming check bug (slash identifiers).**~~ Closed 2026-09-30: joined tokens are split
   and checked case-sensitively (decision 021 update). Prose is still unchecked, so the viewer
   labels model-written names/summaries "prose not verified". Naming work is closed.

## Product rule (non-negotiable)
Every edge in the graph must be backed by evidence: file, symbol, line range, extractor name,
confidence. Extraction, grouping and edges are deterministic — no model is involved. Never draw
an edge you can't point to in code. The one model call allowed is the optional naming pass
(`src/naming/llm.ts`, Nemotron Nano via Nebius Token Factory): it sees extracted facts only (no
source), may change only component `name`/`summary`, falls back to the heuristic name on any
failure, and every call is logged in `snapshot.llmCalls` (model, latency, tokens).

## Spending (hackathon credits, not ours)
All model calls go through `src/llm/client.ts`: response cache → budget reservation (run cap
`TRACEHOUND_BUDGET_RUN_USD`=1, total cap `TRACEHOUND_BUDGET_TOTAL_USD`=45) → request → ledger
(`.tracehound/spend.jsonl`, `pnpm spend`). Nano is the default; Super/Ultra only via explicit
`--model`, reserved for the final evaluation. Tests must never hit the network or need
`NEBIUS_API_KEY` (`test/setup.ts` enforces this). Keep `config/prices.json` placeholders until
real catalog prices are filled in. Unresolved facts (e.g. an import of a generated file that isn't in the
repo) are recorded as facts but never produce edges.

## Stack (fixed — ask before adding dependencies)
- pnpm workspaces, Node >= 24. TS runs via Node's native type stripping: use `.ts` import
  extensions and erasable-only syntax (no enums, no parameter properties, no namespaces).
- `packages/analyzer` — ts-morph + Zod. `@tracehound/analyzer/schema` is the zod-only subpath
  the web imports; keep `src/schema.ts` free of relative imports.
- No API server for now (hackathon): snapshots are static files. The analyzer writes
  `snapshots/<sha>/<analyzerVersion>.json` plus `snapshots/index.json` (manifest with a
  `latest` pointer); the viewer loads the manifest, then the snapshot file directly.
- `viewer/` — static Next.js export (App Router, React Flow `@xyflow/react`, elkjs, Tailwind).
  Loads `snapshots/index.json` then the latest snapshot; no server, API, auth or DB.
- Vitest for extractors and grouping; one viewer component test (jsdom) on the demo snapshot.
- Later: Postgres/Drizzle/BullMQ. For now the JSON snapshot file is the store.

## Commands
- `pnpm demo` — clone the pinned demo repo into `fixtures/demo-repo` and analyze it (uses
  `configs/cex-v2-boilercode.tracehound.json`; set `NEBIUS_API_KEY` in `.env` for LLM names).
- `pnpm tracehound impact --repo fixtures/demo-repo --diff da0e3d6..<ref>` — impact of a diff.
- `pnpm test` / `pnpm typecheck` — all packages.
- `pnpm --filter @tracehound/viewer dev` — viewer on :3000 (copies ../snapshots first).
- `pnpm --filter @tracehound/viewer build` — static export in `viewer/out/`.

## Conventions
- Snapshots are keyed by commit SHA + `ANALYZER_VERSION` (`packages/analyzer/src/version.ts`).
  Bump the version when extractor or grouping output changes.
- Extractors return facts + `Evidence`; they never create component edges. Grouping is a pure
  function over `FileFacts`; edges are aggregated from facts afterwards.
- Confidence: 1.0 compiler-resolved · 0.9 pattern with import provenance · 0.7 value resolved
  via fallback/const indirection · 0.5 real op, dynamic/unresolved operand. Numbers are
  internal; every edge also carries `confidenceLabel` (`proven` · `resolved-default` ·
  `dynamic`), which is what the UI shows.
- Record non-obvious choices in `docs/decisions.md` (choice + rejected alternative).
- Small, meaningful commits pushed to `main`.

## Roadmap
1. Slice: analyzer → static snapshot JSON + manifest → Railway-style canvas.
2. API (Fastify) + Postgres (Drizzle) persistence; analysis jobs on BullMQ; arbitrary repos.
3. More extractors (BullMQ, Kafka, fetch/axios calls between services, tRPC, Next routes).
4. Snapshot diffing across commits.
5. Graph-guided repair agent: trace an issue to affected components, propose tested fixes in a
   sandbox.
