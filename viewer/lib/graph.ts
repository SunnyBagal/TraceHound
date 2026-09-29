import { Position, type Edge, type Node } from "@xyflow/react";
import type { Component, ComponentEdge, Resolution, Snapshot, Warning } from "./types";

export const NODE_WIDTH = 272;
export const NODE_HEIGHT = 124;

/** Stroke style per confidence label. The label is always also rendered as text. */
export const EDGE_STYLES: Record<Resolution, { dash?: string; text: string; meaning: string }> = {
  proven: { dash: undefined, text: "proven", meaning: "literal or compiler-resolved" },
  "resolved-default": { dash: "7 5", text: "resolved-default", meaning: "value from an env ?? fallback" },
  dynamic: { dash: "0.5 5", text: "dynamic", meaning: "only known at runtime" },
};

export type ComponentNodeData = {
  component: Component;
  warnings: Warning[];
  dimmed?: boolean; // not connected to the hovered/selected node
  highlighted?: boolean; // focused from the warnings panel
};
export type ComponentNode = Node<ComponentNodeData, "component">;

export type EvidenceEdgeData = {
  edge: ComponentEdge;
  /** position among edges joining the same two nodes (either direction), for fanning them out */
  parallelIndex: number;
  parallelCount: number;
  active?: boolean; // touches the hovered/selected node
  dimmed?: boolean;
};
export type EvidenceEdge = Edge<EvidenceEdgeData, "evidence">;

// Explicit size + handle geometry: React Flow can route edges before measuring the DOM
// (and in tests, where nothing is measured).
const HANDLE = 8;
const handles = [
  { type: "target" as const, position: Position.Left, x: -HANDLE / 2, y: NODE_HEIGHT / 2 - HANDLE / 2, width: HANDLE, height: HANDLE },
  { type: "source" as const, position: Position.Right, x: NODE_WIDTH - HANDLE / 2, y: NODE_HEIGHT / 2 - HANDLE / 2, width: HANDLE, height: HANDLE },
];

export function buildGraph(snapshot: Snapshot): { nodes: ComponentNode[]; edges: EvidenceEdge[] } {
  const nodes: ComponentNode[] = snapshot.components.map((component) => ({
    id: component.id,
    type: "component",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    handles,
    data: { component, warnings: snapshot.warnings.filter((w) => w.componentId === component.id) },
  }));

  const pairKey = (e: ComponentEdge) => [e.source, e.target].sort().join("|");
  const groups = new Map<string, ComponentEdge[]>();
  for (const e of snapshot.edges) groups.set(pairKey(e), [...(groups.get(pairKey(e)) ?? []), e]);

  const edges: EvidenceEdge[] = snapshot.edges.map((edge) => {
    const group = groups.get(pairKey(edge))!;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "evidence",
      data: { edge, parallelIndex: group.indexOf(edge), parallelCount: group.length },
    };
  });
  return { nodes, edges };
}

/** Redis keys a component touches: resource keys, or keys from its files' redis ops. */
export function redisKeys(snapshot: Snapshot, component: Component): string[] {
  if (component.resource?.keys) return component.resource.keys;
  const files = new Set(component.files);
  const keys = snapshot.files
    .filter((f) => files.has(f.path))
    .flatMap((f) => f.redisOps.filter((o) => o.key).map((o) => `${o.op} ${o.key!.value ?? `<dynamic: ${o.key!.raw}>`}`));
  return [...new Set(keys)];
}

export function neighbours(snapshot: Snapshot, id: string): Set<string> {
  const ids = new Set([id]);
  for (const e of snapshot.edges) {
    if (e.source === id) ids.add(e.target);
    if (e.target === id) ids.add(e.source);
  }
  return ids;
}
