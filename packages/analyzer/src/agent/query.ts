// Read-only query tools over one snapshot. Shared by `tracehound query` and `tracehound mcp`.
// Pure functions: no network, no model, no filesystem beyond the snapshot the caller loaded.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EdgeKind, Snapshot, SnapshotManifest, type Component, type ComponentEdge } from "../schema.ts";
import { rankComponents } from "./rank.ts";

export class QueryError extends Error {
  override name = "QueryError";
}

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** --snapshot <file.json>, or the `latest` entry of <workspace>/snapshots/index.json. */
export function loadSnapshot(file?: string): { snapshot: Snapshot; path: string } {
  let target = file;
  if (!target) {
    const index = path.join(WORKSPACE_ROOT, "snapshots", "index.json");
    if (!existsSync(index)) throw new QueryError(`no --snapshot given and ${index} does not exist`);
    const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(index, "utf8")));
    if (!manifest.latest) throw new QueryError(`${index} has no latest snapshot`);
    target = path.join(path.dirname(index), manifest.latest.path);
  }
  if (!existsSync(target)) throw new QueryError(`snapshot ${target} does not exist`);
  return { snapshot: Snapshot.parse(JSON.parse(readFileSync(target, "utf8"))), path: target };
}

const componentOrThrow = (snapshot: Snapshot, id: string): Component => {
  const c = snapshot.components.find((x) => x.id === id);
  if (!c) throw new QueryError(`unknown componentId "${id}". Use search_components to find ids; known: ${snapshot.components.map((x) => x.id).join(", ")}`);
  return c;
};
/** Display name; model-written names are marked because their prose is unverified. */
const displayName = (c: Component) => (c.naming.source === "llm" ? `${c.name} (model-written name)` : c.name);

// ── search_components ────────────────────────────────────────────────────────────────────
export function searchComponents(snapshot: Snapshot, query: string, limit = 8) {
  const { terms, ranked } = rankComponents(snapshot, query);
  const byId = new Map(snapshot.components.map((c) => [c.id, c]));
  return {
    query,
    terms,
    results: ranked
      .filter((r) => r.score > 0)
      .slice(0, limit)
      .map((r) => {
        const c = byId.get(r.id)!;
        return { id: c.id, name: displayName(c), kind: c.kind, score: r.score, reason: r.reason, files: c.files.length };
      }),
  };
}

// ── get_neighbors ────────────────────────────────────────────────────────────────────────
export type Direction = "in" | "out" | "both";

/** out: edges where the component is the source (what it depends on / produces to); in: the reverse. */
export function getNeighbors(snapshot: Snapshot, componentId: string, direction: Direction = "both", kinds?: string[]) {
  componentOrThrow(snapshot, componentId);
  const wanted = kinds?.length ? kinds.map((k) => EdgeKind.parse(k)) : undefined;
  const byId = new Map(snapshot.components.map((c) => [c.id, c]));
  const neighbors = snapshot.edges
    .filter((e) => !wanted || wanted.includes(e.kind))
    .flatMap((e) => {
      const out = e.source === componentId && direction !== "in";
      const inn = e.target === componentId && direction !== "out";
      if (!out && !inn) return [];
      const other = byId.get(out ? e.target : e.source)!;
      return [{ edgeId: e.id, direction: out ? ("out" as const) : ("in" as const), kind: e.kind, neighbor: other.id, neighborName: displayName(other), confidenceLabel: e.confidenceLabel, label: e.label, evidenceCount: e.evidenceIds.length }];
    });
  return { componentId, direction, kinds: wanted ?? "all", neighbors };
}

// ── get_edge_evidence ────────────────────────────────────────────────────────────────────
export function getEdgeEvidence(snapshot: Snapshot, edgeId: string, maxSnippetLines = 6) {
  const edge: ComponentEdge | undefined = snapshot.edges.find((e) => e.id === edgeId);
  if (!edge) throw new QueryError(`unknown edgeId "${edgeId}". Use get_neighbors to list edge ids`);
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  return {
    edgeId,
    kind: edge.kind,
    source: edge.source,
    target: edge.target,
    confidenceLabel: edge.confidenceLabel,
    label: edge.label,
    commitSha: snapshot.repo.commitSha,
    evidence: edge.evidenceIds.map((id) => {
      const ev = evidence.get(id)!;
      const lines = ev.snippet.lines.slice(0, maxSnippetLines);
      return {
        at: `${ev.file}:${ev.range.startLine}${ev.range.endLine !== ev.range.startLine ? `-${ev.range.endLine}` : ""}`,
        symbol: ev.symbol,
        extractor: ev.extractor,
        resolution: ev.resolution,
        detail: ev.detail,
        snippet: lines.map((l, i) => `${ev.snippet.startLine + i}| ${l}`).join("\n") + (ev.snippet.lines.length > lines.length ? "\n…" : ""),
      };
    }),
  };
}

// ── get_related_tests ────────────────────────────────────────────────────────────────────
export function getRelatedTests(snapshot: Snapshot, componentId: string) {
  componentOrThrow(snapshot, componentId);
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const tests = snapshot.tests
    .filter((t) => t.componentId === componentId)
    .map((t) => {
      const ev = evidence.get(t.evidenceIds[0]!)!;
      return { file: t.file, importAt: `${ev.file}:${ev.range.startLine}` };
    });
  const detected = snapshot.files.some((f) => /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//.test(f.path));
  return {
    componentId,
    tests,
    summary:
      `${tests.length} linked test${tests.length === 1 ? "" : "s"}` +
      (tests.length ? "" : detected ? " (this repo has test files, but none import this component)" : " (no *.test.ts, *.spec.ts or __tests__/** files in this snapshot)"),
  };
}
