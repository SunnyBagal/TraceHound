import { GRAPH_COMPONENTS, GRAPH_EDGES, GRAPH_FILES, GRAPH_PATH_PREFIX, RECALL, type GraphComponentId } from "@/lib/landing";

/**
 * Recall @ 5d2165a: four files show the fact the extractors found in each, the files give way to
 * the components they belong to, and the snapshot's six edges draw one at a time, each labelled
 * with the file and line of its evidence.
 */

const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;

const NODE_H = 44;
/** Centre x, centre y and width of each node: the producer on top, the worker below, the shared modules either side. */
const NODES: Record<GraphComponentId, { x: number; y: number; w: number }> = {
  "recall-backend:brainly-server": { x: 180, y: 40, w: 156 },
  "recall-backend:queue": { x: 60, y: 200, w: 108 },
  "bullmq:content-processing": { x: 180, y: 200, w: 120 },
  "recall-backend:shared": { x: 300, y: 200, w: 108 },
  "recall-backend:worker": { x: 180, y: 360, w: 172 },
};

/** Each edge's line (from the source's border to the target's) and where its label sits. */
const GEOMETRY: Record<string, { x1: number; y1: number; x2: number; y2: number; label: { x: number; y: number; anchor: "start" | "end" } }> = {
  "recall-backend:brainly-server->bullmq:content-processing:produces": { x1: 180, y1: 62, x2: 180, y2: 178, label: { x: 187, y: 150, anchor: "start" } },
  "bullmq:content-processing->recall-backend:worker:consumes": { x1: 180, y1: 222, x2: 180, y2: 338, label: { x: 187, y: 250, anchor: "start" } },
  "recall-backend:brainly-server->recall-backend:queue:imports": { x1: 130, y1: 62, x2: 70, y2: 178, label: { x: 97, y: 110, anchor: "end" } },
  "recall-backend:brainly-server->recall-backend:shared:imports": { x1: 230, y1: 62, x2: 290, y2: 178, label: { x: 263, y: 110, anchor: "start" } },
  "recall-backend:worker->recall-backend:queue:imports": { x1: 120, y1: 338, x2: 70, y2: 222, label: { x: 91, y: 290, anchor: "end" } },
  "recall-backend:worker->recall-backend:shared:imports": { x1: 240, y1: 338, x2: 290, y2: 222, label: { x: 269, y: 290, anchor: "start" } },
};

/** A filled arrowhead at (x2, y2), pointing along the edge. */
function arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const [bx, by] = [x2 - ux * 8, y2 - uy * 8];
  const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return `M${p(x2, y2)} L${p(bx - uy * 4, by + ux * 4)} L${p(bx + uy * 4, by - ux * 4)} Z`;
}

const lineOf = (evidence: string) => Number(/#L(\d+)/.exec(evidence)![1]);
const EDGES_START = 3000;
const EDGE_STEP = 420;

export function RepoToGraph() {
  return (
    <svg viewBox="0 0 360 400" className="block h-auto w-full" aria-hidden data-testid="repo-to-graph">
      {/* files and their facts */}
      <g className="lp-gone" data-anim="out" style={at(1900, 700)}>
        <text x={8} y={16} className="mono" fontSize={11} data-anim="fade" style={{ ...at(0, 300), fill: "var(--faint)" }}>
          {GRAPH_PATH_PREFIX} @ {RECALL.short}
        </text>
        {GRAPH_FILES.map((f, i) => (
          <g key={f.path}>
            <text x={8} y={46 + i * 44} className="mono" fontSize={12} data-anim="in" style={{ ...at(150 + i * 150, 350), fill: "var(--text)" }}>
              {f.path.slice(GRAPH_PATH_PREFIX.length)}
            </text>
            <text x={20} y={64 + i * 44} className="mono" fontSize={11} data-anim="in" style={{ ...at(800 + i * 200, 350), fill: "var(--accent)" }}>
              L{lineOf(f.evidence)} {f.fact}
            </text>
          </g>
        ))}
      </g>

      {/* the components */}
      {GRAPH_COMPONENTS.map((c, k) => {
        const n = NODES[c.id];
        const name = c.kind === "queue" ? c.name.replace(/ queue$/i, "") : c.name;
        return (
          <g key={c.id} data-anim="in" style={at(2400 + k * 90, 400)} data-testid="graph-node">
            <rect x={n.x - n.w / 2} y={n.y - NODE_H / 2} width={n.w} height={NODE_H} rx={9} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
            <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize={name.length > 16 ? 11 : 12.5} fontWeight={600} style={{ fill: "var(--text)" }}>
              {name}
            </text>
            <text x={n.x} y={n.y + 13} textAnchor="middle" className="mono" fontSize={10.5} style={{ fill: "var(--faint)" }}>
              {c.kind}
            </text>
          </g>
        );
      })}

      {/* the edges, one at a time */}
      {GRAPH_EDGES.map((e, k) => {
        const g = GEOMETRY[e.id]!;
        const t = EDGES_START + k * EDGE_STEP;
        return (
          <g key={e.id} data-testid="graph-edge">
            <path className="lp-path" data-anim="draw" style={{ ...at(t, 380), fill: "none", stroke: "var(--edge)" }} pathLength={1} strokeWidth={1.5} d={`M${g.x1} ${g.y1} L${g.x2} ${g.y2}`} />
            <path data-anim="fade" style={{ ...at(t + 330, 150), fill: "var(--edge)" }} d={arrow(g)} />
            <text x={g.label.x} y={g.label.y} textAnchor={g.label.anchor} className="mono" fontSize={11} data-anim="in" style={{ ...at(t + 250, 300), fill: "var(--muted)" }} data-testid="edge-label">
              {e.file}:{e.line}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
