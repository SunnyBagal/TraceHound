// Impact analysis: which components a diff touches, and which others depend on them.
// Pure over a base snapshot + a parsed `git diff --name-status`; no model, no network.
import type { ComponentEdge, ComponentKind, EdgeKind, Resolution, Snapshot } from "../schema.ts";

// ── git diff --name-status ─────────────────────────────────────────────────────────────────
export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed";

export interface FileChange {
  status: ChangeStatus;
  path: string; // path at head (for deleted files: the base path)
  basePath?: string; // path at base; absent for added/copied files (they have no base file)
}

const STATUS: Record<string, ChangeStatus> = { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "type-changed" };

/** Parse `git diff --name-status -M` output (tab-separated; R/C lines carry a score and two paths). */
export function parseNameStatus(text: string): FileChange[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [code, a, b] = line.split("\t");
      const status = STATUS[code![0]!];
      if (!status || !a) throw new Error(`unexpected git diff --name-status line: ${JSON.stringify(line)}`);
      if (status === "renamed") return { status, path: b!, basePath: a };
      if (status === "copied") return { status, path: b! }; // the copy is new; its source is unchanged
      if (status === "added") return { status, path: a };
      return { status, path: a, basePath: a };
    });
}

// ── Direction rule (docs/decisions.md 023) ────────────────────────────────────────────────
/** source depends on target: a change to the target reaches the source (walk edges in reverse). */
const REVERSE: EdgeKind[] = ["imports", "queries"];
/** A message/data contract through a queue or store couples both sides: walk either way. */
const BIDIRECTIONAL: EdgeKind[] = ["produces", "consumes", "reads", "writes"];
/** Brokers: leaving one is free, so producer -> broker -> consumer costs one hop (decision 024). */
const BROKER_KINDS: ComponentKind[] = ["queue", "cache"];
export const DIRECTION_RULE =
  "imports, queries: reverse (dependents of the changed component) · produces, consumes, reads, writes: bidirectional (message/data contract) · crossing a queue/cache broker costs one hop of depth (decision 024)";

// ── Report ─────────────────────────────────────────────────────────────────────────────────
export interface MappedFile extends FileChange {
  componentId?: string; // from the base snapshot; undefined = unmapped
  reason?: string; // why it's unmapped / how it mapped
}

export interface Hop {
  edgeId: string;
  kind: EdgeKind;
  source: string;
  target: string;
  from: string; // walk order: the component closer to the change
  to: string;
  walk: "reverse" | "bidirectional";
  confidenceLabel: Resolution;
  label: string;
  evidence: { id: string; file: string; line: number };
  depthCost?: 0 | 1; // 0 = leaving a broker (the crossing was paid on the way in)
}

export interface AffectedComponent {
  id: string;
  name: string;
  modelWrittenName: boolean;
  depth: number; // hops of depth used (a broker crossing counts once), not chain.length
  chain: Hop[]; // changed component → … → this one
  dynamic: boolean; // some hop on the chain is only known at runtime
}

export interface LinkedTest {
  file: string;
  componentId: string;
  evidence: { id: string; file: string; line: number };
}

export interface ImpactReport {
  repo: string;
  base: string;
  head: string;
  snapshot: { analyzerVersion: string; path?: string };
  depth: number;
  directionRule: string;
  files: MappedFile[];
  changed: { id: string; name: string; modelWrittenName: boolean; files: string[] }[];
  affected: AffectedComponent[];
  unmapped: MappedFile[];
  linkedTests: LinkedTest[];
}

const STRENGTH: Resolution[] = ["dynamic", "resolved-default", "proven"];
const weakest = (chain: Hop[]) => Math.min(...chain.map((h) => STRENGTH.indexOf(h.confidenceLabel)));

export interface ImpactInput {
  snapshot: Snapshot;
  changes: FileChange[];
  base: string;
  head: string;
  depth?: number;
  snapshotPath?: string;
}

export function computeImpact({ snapshot, changes, base, head, depth = 2, snapshotPath }: ImpactInput): ImpactReport {
  if (!Number.isInteger(depth) || depth < 0) throw new Error(`--depth must be a non-negative integer (got ${depth})`);
  const fileToComponent = new Map(snapshot.components.flatMap((c) => c.files.map((f) => [f, c.id] as const)));
  const testFiles = new Set(snapshot.tests.map((t) => t.file));
  const knownFiles = new Set(snapshot.files.map((f) => f.path));
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const component = new Map(snapshot.components.map((c) => [c.id, c]));

  // 1. files → components, always via the base path (deleted and renamed files included)
  const files: MappedFile[] = changes.map((ch) => {
    if (!ch.basePath) return { ...ch, reason: ch.status === "copied" ? "copied file: not in base snapshot" : "added file: not in base snapshot" };
    const id = fileToComponent.get(ch.basePath);
    if (id) return { ...ch, componentId: id, reason: ch.status === "renamed" ? `mapped via base path ${ch.basePath}` : undefined };
    if (testFiles.has(ch.basePath)) return { ...ch, reason: "test file (no component; see linked tests)" };
    if (knownFiles.has(ch.basePath)) return { ...ch, reason: "in base snapshot but in no component" };
    return { ...ch, reason: "not analyzed (not a TS source or Prisma schema in the base snapshot)" };
  });

  const changedIds = [...new Set(files.flatMap((f) => (f.componentId ? [f.componentId] : [])))].sort();
  const changed = changedIds.map((id) => {
    const c = component.get(id)!;
    return { id, name: c.name, modelWrittenName: c.naming.source === "llm", files: files.filter((f) => f.componentId === id).map((f) => f.basePath!) };
  });

  // 2. breadth-first walk; among equally short chains keep the one whose weakest hop is strongest
  const hop = (edge: ComponentEdge, from: string, to: string, walk: Hop["walk"]): Hop => {
    const ev = edge.evidenceIds.map((id) => evidence.get(id)!).sort((a, b) => STRENGTH.indexOf(b.resolution!) - STRENGTH.indexOf(a.resolution!))[0]!;
    return {
      edgeId: edge.id, kind: edge.kind, source: edge.source, target: edge.target, from, to, walk,
      confidenceLabel: edge.confidenceLabel, label: edge.label, evidence: { id: ev.id, file: ev.file, line: ev.range.startLine },
    };
  };
  const neighbours = (id: string): Hop[] =>
    snapshot.edges.flatMap((e) => {
      if (REVERSE.includes(e.kind)) return e.target === id ? [hop(e, id, e.source, "reverse")] : [];
      if (BIDIRECTIONAL.includes(e.kind)) {
        if (e.source === id) return [hop(e, id, e.target, "bidirectional")];
        if (e.target === id) return [hop(e, id, e.source, "bidirectional")];
      }
      return [];
    });

  // Cost-ordered search. A hop costs 1, except leaving a broker (queue/cache resource): crossing
  // producer -> broker -> consumer costs one hop in total (decision 024). Among equally cheap
  // chains keep the one whose weakest hop is strongest, then the shorter one.
  const isBroker = (id: string) => BROKER_KINDS.includes(component.get(id)?.kind ?? "api");
  type Reached = { cost: number; chain: Hop[] };
  const better = (a: Reached, b: Reached) =>
    a.cost !== b.cost ? a.cost < b.cost : weakest(a.chain) !== weakest(b.chain) ? weakest(a.chain) > weakest(b.chain) : a.chain.length < b.chain.length;
  const best = new Map<string, Reached>(changedIds.map((id) => [id, { cost: 0, chain: [] }]));
  const settled = new Set<string>();
  for (;;) {
    const open = [...best.entries()].filter(([id]) => !settled.has(id)).sort(([ia, a], [ib, b]) => (better(a, b) ? -1 : better(b, a) ? 1 : ia.localeCompare(ib)));
    if (!open.length) break;
    const [id, reached] = open[0]!;
    settled.add(id);
    for (const h of neighbours(id)) {
      if (settled.has(h.to)) continue;
      const step: 0 | 1 = isBroker(id) ? 0 : 1;
      const candidate = { cost: reached.cost + step, chain: [...reached.chain, { ...h, depthCost: step }] };
      if (candidate.cost > depth) continue;
      const current = best.get(h.to);
      if (!current || better(candidate, current)) best.set(h.to, candidate);
    }
  }
  const chains = new Map([...best.entries()].map(([id, r]) => [id, r.chain]));
  const costs = new Map([...best.entries()].map(([id, r]) => [id, r.cost]));

  const affected = [...chains.entries()]
    .filter(([id]) => !changedIds.includes(id))
    .map(([id, chain]): AffectedComponent => {
      const c = component.get(id)!;
      return { id, name: c.name, modelWrittenName: c.naming.source === "llm", depth: costs.get(id)!, chain, dynamic: chain.some((h) => h.confidenceLabel === "dynamic") };
    })
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  // 3. tests linked to anything changed or affected
  const touched = new Set([...changedIds, ...affected.map((a) => a.id)]);
  const linkedTests = snapshot.tests
    .filter((t) => touched.has(t.componentId))
    .map((t) => {
      const ev = evidence.get(t.evidenceIds[0]!)!;
      return { file: t.file, componentId: t.componentId, evidence: { id: ev.id, file: ev.file, line: ev.range.startLine } };
    });

  return {
    repo: snapshot.repo.name,
    base,
    head,
    snapshot: { analyzerVersion: snapshot.analyzerVersion, path: snapshotPath },
    depth,
    directionRule: DIRECTION_RULE,
    files,
    changed,
    affected,
    unmapped: files.filter((f) => !f.componentId),
    linkedTests,
  };
}
