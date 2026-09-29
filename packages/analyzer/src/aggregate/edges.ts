import type { ComponentEdge, EdgeKind, Evidence, FileFacts } from "../schema.ts";
import type { GroupingResult } from "../group/grouping.ts";

interface Draft {
  source: string;
  target: string;
  kind: EdgeKind;
  evidenceIds: Set<string>;
  labels: Set<string>;
}

/**
 * Lift file-level facts to component edges. Every edge keeps the evidence ids of the facts it
 * aggregates; facts without a resolved endpoint (external/unresolved imports, dynamic targets)
 * never produce edges. Queue edges follow data flow (producer → queue → consumer); other edges
 * point from the dependent component to its dependency.
 */
export function aggregateEdges(files: FileFacts[], grouping: GroupingResult, evidence: Map<string, Evidence>): ComponentEdge[] {
  const drafts = new Map<string, Draft>();
  const add = (source: string | undefined, target: string | undefined, kind: EdgeKind, evidenceId: string, label: string) => {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}:${kind}`;
    const draft = drafts.get(key) ?? { source, target, kind, evidenceIds: new Set(), labels: new Set() };
    draft.evidenceIds.add(evidenceId);
    draft.labels.add(label);
    drafts.set(key, draft);
  };
  const componentOf = (file: string) => grouping.fileToComponent.get(file);

  for (const f of files) {
    const from = componentOf(f.path);
    for (const imp of f.imports) {
      if (imp.target) add(from, componentOf(imp.target), "imports", imp.evidenceId, imp.names.join(", ") || imp.specifier);
    }
    for (const op of f.redisOps) {
      const redis = grouping.redisResourceByConnection.get(op.connection);
      const key = op.key?.value ?? (op.key ? "dynamic key" : "");
      const label = `${op.op}${key ? ` ${key}` : ""}`;
      if (op.role === "produce") add(from, redis, "produces", op.evidenceId, label);
      else if (op.role === "consume") add(redis, from, "consumes", op.evidenceId, label);
      else if (op.role === "read") add(from, redis, "reads", op.evidenceId, label);
      else if (op.role === "write") add(from, redis, "writes", op.evidenceId, label);
      // admin ops (connect/ping) stay file facts: they don't move data
    }
    for (const op of f.prismaOps) {
      const clientFile = op.clientDecl.split("#")[0]!;
      const db = componentOf(clientFile) ?? grouping.prismaResourceByPackage.get(f.package);
      add(from, db, "queries", op.evidenceId, `${op.model}.${op.op}`);
    }
  }

  return [...drafts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, d]) => {
      const evidenceIds = [...d.evidenceIds].sort();
      const labels = [...d.labels].sort();
      return {
        id,
        source: d.source,
        target: d.target,
        kind: d.kind,
        evidenceIds,
        weight: evidenceIds.length,
        confidence: Math.max(...evidenceIds.map((e) => evidence.get(e)?.confidence ?? 0)),
        label: labels.length > 3 ? `${labels.slice(0, 3).join(", ")} +${labels.length - 3}` : labels.join(", "),
      };
    });
}
