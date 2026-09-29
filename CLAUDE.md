# TraceHound

Analyzes a TypeScript repo and renders it as an interactive, evidence-backed component graph
on a canvas. Later: a graph-guided repair agent.

## Product rule (non-negotiable)
Every edge in the graph must be backed by evidence: file, symbol, line range, extractor name,
confidence. Extraction is deterministic — no LLM calls in the analyzer. Never draw an edge you
can't point to in code. Unresolved facts (e.g. an import of a generated file that isn't in the
repo) are recorded as facts but never produce edges.

## Stack (fixed — ask before adding dependencies)
- pnpm workspaces, Node >= 24. TS runs via Node's native type stripping: use `.ts` import
  extensions and erasable-only syntax (no enums, no parameter properties, no namespaces).
- `packages/analyzer` — ts-morph + Zod. `@tracehound/analyzer/schema` is the zod-only subpath
  the web imports; keep `src/schema.ts` free of relative imports.
- No API server for now (hackathon): snapshots are static files. The analyzer writes
  `snapshots/<sha>/<analyzerVersion>.json` plus `snapshots/index.json` (manifest with a
  `latest` pointer); the viewer loads the manifest, then the snapshot file directly.
- `apps/web` — Next.js App Router, React Flow (`@xyflow/react`), ELK.js, Tailwind, shadcn/ui,
  Framer Motion.
- Vitest for extractors and grouping. No UI tests yet.
- Later: Postgres/Drizzle/BullMQ. For now the JSON snapshot file is the store.

## Commands
- `pnpm demo` — clone the pinned demo repo into `fixtures/demo-repo` and analyze it.
- `pnpm test` / `pnpm typecheck` — all packages.
- `pnpm --filter @tracehound/web dev`.

## Conventions
- Snapshots are keyed by commit SHA + `ANALYZER_VERSION` (`packages/analyzer/src/version.ts`).
  Bump the version when extractor or grouping output changes.
- Extractors return facts + `Evidence`; they never create component edges. Grouping is a pure
  function over `FileFacts`; edges are aggregated from facts afterwards.
- Confidence: 1.0 compiler-resolved · 0.9 pattern with import provenance · 0.7 value resolved
  via fallback/const indirection · 0.5 real op, dynamic/unresolved operand.
- Record non-obvious choices in `docs/decisions.md` (choice + rejected alternative).
- Small, meaningful commits pushed to `main`.

## Roadmap
1. Slice: analyzer → static snapshot JSON + manifest → Railway-style canvas.
2. API (Fastify) + Postgres (Drizzle) persistence; analysis jobs on BullMQ; arbitrary repos.
3. More extractors (BullMQ, Kafka, fetch/axios calls between services, tRPC, Next routes).
4. Snapshot diffing across commits.
5. Graph-guided repair agent: trace an issue to affected components, propose tested fixes in a
   sandbox.
