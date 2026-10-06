import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { NODE_HEIGHT, NODE_WIDTH } from "./graph";

export type Positions = Record<string, { x: number; y: number }>;

const elk = new ELK();

/** ELK's input: every node at the card size the canvas draws (lib/graph.ts), so laid-out cards never overlap. */
export function layoutGraph(nodeIds: string[], edges: { id: string; source: string; target: string }[]): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "140",
      "elk.spacing.nodeNode": "64",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodeIds.map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

/** Left-to-right layered layout (see docs/decisions.md 015). */
export async function elkLayout(nodeIds: string[], edges: { id: string; source: string; target: string }[]): Promise<Positions> {
  const graph = await elk.layout(layoutGraph(nodeIds, edges));
  return Object.fromEntries((graph.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}
