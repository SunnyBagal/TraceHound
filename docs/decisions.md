# Decisions

One entry per non-obvious choice, with the alternative we rejected.

## 001 · Run TypeScript with Node's native type stripping
**Choice:** Node 24 runs `.ts` directly (`node src/cli.ts`). The code uses `.ts` import extensions
and `erasableSyntaxOnly`.
**Rejected:** `tsx`/`ts-node`. Each is one more dependency and a second TS semantics to keep in sync
with. The cost of our choice is no enums or parameter properties, which we don't need.

## 002 · TypeScript 6.x for type-checking, not 7.x
**Choice:** `typescript ~6.0` for `tsc --noEmit` and Next.js. ts-morph bundles its own compiler,
so the analyzer's parsing does not depend on this version.
**Rejected:** TS 7 (the native Go port). It is the npm `latest`, but Next.js and other tooling
still expect the JS compiler API.

## 003 · Group by anchor reachability, not by directory or community detection
**Choice:** Anchors are files that mark a responsibility: entry points, modules that register
routes, and modules that wrap an infra client. Each anchor claims the files that only it can
reach through resolved imports. A file shared by several anchors goes to the one whose name it
matches, or else to a per-package Shared component. Each file records why it landed where it
did (`membership.reason`).
**Rejected:** (a) Directory grouping. Layered repos (`routes/`, `controllers/`, `utils/`) cut
across features, so it would output "Controllers", not "Exchange API". (b) Louvain/label
propagation. It is unstable on 20-file graphs, hard to explain, and it can't say *why* a file
belongs where it does.

## 004 · One Redis node per connection, keys listed on the node
**Choice:** Redis clients are grouped by connection (the env var or URL they connect with). Queue
keys appear as edge labels and node metadata.
**Rejected:** One node per key. The response queue key is `response-queue-${uuid}` on the
backend and `message.responseQueue` (runtime data) in the engine. Joining those statically
would take dataflow we can't back with evidence, and a node per key would scatter one Redis
across the canvas.

## 005 · Queue edges follow data flow; everything else follows dependency
**Choice:** producer → queue → consumer (`produces`/`consumes`). Imports, KV reads/writes and DB
queries point from the dependent component to its dependency.
**Rejected:** Pure dependency direction everywhere (consumer → queue). The canvas would lose the
request/response pipeline, which is the most useful thing it shows about a queue-based system.

## 006 · Embed code snippets in the snapshot
**Choice:** Each evidence item carries its line range plus ±2 lines of context, capped at 14
lines. A snapshot is self-contained and immutable per (commit SHA, analyzer version).
**Rejected:** Reading files at request time. The API would need a checkout of every analyzed
commit, and a snapshot could drift from its snippets.

## 007 · Resolve static values with decaying confidence
**Choice:** A small evaluator follows const variables, const object properties, env-helper calls
and `x ?? "default"` across imports. Confidence is 1.0 for literals, 0.9 for provenance-backed
patterns, 0.7 through fallbacks/indirection, and 0.5 when the value is dynamic. Dynamic operands
still produce a fact (and an edge to the resource) with 0.5 confidence, because the op is real.
**Rejected:** Dropping unresolved ops. The engine's `lPush(message.responseQueue)` is how
responses reach the backend, and hiding it would erase half the round trip.

## 008 · Client-only modules fold into their resource node
**Choice:** A module whose exported values are all client instances (`db.ts` exporting
`prisma`) belongs to the DB/Redis node. Modules that wrap a client in behavior
(`engine-client.ts`) are their own service component.
**Rejected:** Always a separate component per client module. It creates a "db.ts" box that only
duplicates the database node.

## 009 · Static snapshot files + manifest instead of an API (hackathon scope)
**Choice:** The analyzer writes `snapshots/<sha>/<analyzerVersion>.json` and upserts
`snapshots/index.json`, which lists every snapshot (repo, sha, analyzerVersion, path, createdAt)
and has a `latest` pointer. The viewer fetches the manifest, then the snapshot, as plain static
files. Re-analyzing the same (repo, sha, version) replaces its manifest entry.
**Rejected:** A Fastify `GET /snapshot/:sha` server. It adds a process to run, CORS or rewrite
plumbing, and a deploy target, and gives nothing a static file doesn't while snapshots are
immutable and produced offline. It comes back when analysis runs on demand (roadmap step 2).
