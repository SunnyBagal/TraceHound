import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { NODE_HEIGHT, NODE_WIDTH } from "./graph";

export type Positions = Record<string, { x: number; y: number }>;

const elk = new ELK();

/** ELK's input: every node at the card size the canvas draws (lib/graph.ts), so laid-out cards never overlap. */
export function layoutGraph(nodeIds: string[], edges: { id: string; source: string; target: string }[], heights: Record<string, number> = {}): ElkNode {
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
    children: nodeIds.map((id) => ({ id, width: NODE_WIDTH, height: heights[id] ?? NODE_HEIGHT })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

/** Left-to-right layered layout (see docs/decisions.md 015). */
export async function elkLayout(nodeIds: string[], edges: { id: string; source: string; target: string }[], heights: Record<string, number> = {}): Promise<Positions> {
  const graph = await elk.layout(layoutGraph(nodeIds, edges, heights));
  return Object.fromEntries((graph.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
}

/** Most clearance a card pushed by a growing card keeps above it (px). */
export const PUSH_GAP = 32;

/**
 * A card changed height in place (expand/collapse): nothing is laid out again. Growing pushes
 * down the cards below it in its column that it would now cover or crowd, each keeping the
 * clearance it had (at most PUSH_GAP), and so on down the column; shrinking moves nothing.
 * Returns only the positions that changed.
 */
export function growNode(
  boxes: Record<string, { x: number; y: number; height: number }>,
  id: string,
  oldHeight: number,
  width: number,
): Positions {
  const moved: Positions = {};
  const queue: { id: string; oldBottom: number }[] = [{ id, oldBottom: boxes[id]!.y + oldHeight }];
  const at = (k: string) => moved[k] ?? boxes[k]!;
  while (queue.length) {
    const { id: top, oldBottom } = queue.shift()!;
    const t = at(top);
    const bottom = t.y + boxes[top]!.height;
    for (const [k, b] of Object.entries(boxes)) {
      if (k === top || k === id) continue;
      const p = at(k);
      if (p.x + width <= t.x || t.x + width <= p.x) continue; // another column
      if (p.y < t.y) continue; // above it
      if (p.y >= bottom + PUSH_GAP) continue; // already clear
      const keep = Math.min(Math.max(p.y - oldBottom, 0), PUSH_GAP);
      const y = bottom + keep;
      if (y <= p.y) continue;
      moved[k] = { x: p.x, y };
      queue.push({ id: k, oldBottom: p.y + b.height });
    }
  }
  return moved;
}
