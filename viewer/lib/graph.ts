import { Position, type Edge, type Node } from "@xyflow/react";
import type { ComponentDiff, EdgeDiffStatus, ExtraEdge } from "./changes";
import type { ImpactRole } from "./impact";
import { techFacts, type TechFact } from "./tech";
import type { Component, ComponentEdge, Resolution, Snapshot, Warning } from "./types";

/** Every card is 2:1 like Railway's: icon and name on the top row, the kind line at the bottom. */
export const NODE_WIDTH = 272;
export const NODE_HEIGHT = NODE_WIDTH / 2;

/** Stroke style per confidence label. The legend and the edge inspector name it in words; canvas labels don't. */
export const EDGE_STYLES: Record<Resolution, { dash?: string; text: string; meaning: string }> = {
  proven: { dash: undefined, text: "proven", meaning: "literal or compiler-resolved" },
  "resolved-default": { dash: "7 5", text: "resolved-default", meaning: "value from an env ?? fallback" },
  dynamic: { dash: "0.5 5", text: "dynamic", meaning: "only known at runtime" },
};

export type ComponentNodeData = {
  component: Component;
  warnings: Warning[];
  /** technology facts (lib/tech.ts); headerFact() picks the one behind the header icon */
  tech: TechFact[];
  dimmed?: boolean; // not connected to the hovered/selected node
  highlighted?: boolean; // focused from the warnings panel
  panelHover?: boolean; // an inspector row pointing at this node is hovered/focused
  /** impact mode (?impact=): changed / affected; null = not part of the impact */
  impact?: ImpactRole | null;
  /** change view (?changes=): the component's rollup; null = the change didn't touch it */
  change?: ComponentDiff | null;
  /** change view: the component exists only in the change set (no published snapshot has it) */
  changeSetOnly?: boolean;
};
export type ComponentNode = Node<ComponentNodeData, "component">;

export type EvidenceEdgeData = {
  edge: ComponentEdge;
  /** position among edges joining the same two nodes (either direction), for fanning them out */
  parallelIndex: number;
  parallelCount: number;
  active?: boolean; // touches the hovered/selected node
  dimmed?: boolean;
  panelHover?: boolean; // an inspector row pointing at this edge is hovered/focused
  /** impact mode: this edge is a hop on some affected component's chain */
  onImpactChain?: boolean;
  impactMode?: boolean;
  /** change view: the component edge's status in the change set's rollup */
  diff?: EdgeDiffStatus;
  /** change view: declaration-level edges added/removed between the two components */
  declEdges?: { added: number; removed: number };
  /** change view: an added component edge that only the change set knows (no snapshot evidence) */
  extra?: boolean;
};
export type EvidenceEdge = Edge<EvidenceEdgeData, "evidence">;

// Explicit size + handle geometry: React Flow can route edges before measuring the DOM
// (and in tests, where nothing is measured).
const HANDLE = 8;
const handles = [
  { type: "target" as const, position: Position.Left, x: -HANDLE / 2, y: NODE_HEIGHT / 2 - HANDLE / 2, width: HANDLE, height: HANDLE },
  { type: "source" as const, position: Position.Right, x: NODE_WIDTH - HANDLE / 2, y: NODE_HEIGHT / 2 - HANDLE / 2, width: HANDLE, height: HANDLE },
];

export function buildGraph(snapshot: Snapshot, extraEdges: ExtraEdge[] = []): { nodes: ComponentNode[]; edges: EvidenceEdge[] } {
  const nodes: ComponentNode[] = snapshot.components.map((component) => ({
    id: component.id,
    type: "component",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    handles,
    data: { component, warnings: snapshot.warnings.filter((w) => w.componentId === component.id), tech: techFacts(snapshot, component) },
  }));

  // A change set's added component edge carries no snapshot evidence; it is drawn from its id and
  // labelled as such (EvidenceEdge), and clicking it opens the declaration edges behind it.
  const extras: ComponentEdge[] = extraEdges.map((x) => ({
    id: x.id,
    source: x.source,
    target: x.target,
    kind: x.kind as ComponentEdge["kind"],
    evidenceIds: [],
    weight: 1,
    confidence: 0,
    confidenceLabel: "proven",
    label: "added at head (change set)",
  }));
  const extraIds = new Set(extras.map((e) => e.id));
  const all = [...snapshot.edges, ...extras];
  const pairKey = (e: ComponentEdge) => [e.source, e.target].sort().join("|");
  const groups = new Map<string, ComponentEdge[]>();
  for (const e of all) groups.set(pairKey(e), [...(groups.get(pairKey(e)) ?? []), e]);

  const edges: EvidenceEdge[] = all.map((edge) => {
    const group = groups.get(pairKey(edge))!;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "evidence",
      data: { edge, parallelIndex: group.indexOf(edge), parallelCount: group.length, ...(extraIds.has(edge.id) && { extra: true }) },
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
