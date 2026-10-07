import { KIND_META } from "@/lib/kinds";
import { GRAPH_COMPONENTS, GRAPH_EDGES, GRAPH_FILES, GRAPH_PATH_PREFIX, GRAPH_TREE, RECALL, type GraphComponentId } from "@/lib/landing";

/**
 * Repo → graph, wide (lg and up). Recall's 15 backend files at 5d2165a; a scan passes down the
 * tree and the extractors' facts appear beside their files; the files group into their
 * components (each row takes its component's kind icon as the node appears); the snapshot's six
 * edges draw one at a time with the file and line of their evidence; then a job travels from the
 * API through the queue to the worker. Pure SVG; timing in --t / --d (globals.css, .lp-anim).
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SPEED = 0.85;
const at = (t: number, d?: number) => ({ "--t": `${Math.round(t * SPEED)}ms`, ...(d ? { "--d": `${Math.round(d * SPEED)}ms` } : {}) }) as React.CSSProperties;

const ROW = 24;
const TREE_TOP = 44;
const TREE_W = 284;
const NODE_H = 60;
const NODES: Record<GraphComponentId, { x: number; y: number; w: number }> = {
  "recall-backend:brainly-server": { x: 405, y: 215, w: 170 },
  "recall-backend:queue": { x: 680, y: 80, w: 190 },
  "bullmq:content-processing": { x: 680, y: 215, w: 190 },
  "recall-backend:shared": { x: 680, y: 350, w: 190 },
  "recall-backend:worker": { x: 985, y: 215, w: 210 },
};
const GEOMETRY: Record<string, { x1: number; y1: number; x2: number; y2: number; label: { x: number; y: number; anchor: "start" | "middle" | "end" } }> = {
  "recall-backend:brainly-server->bullmq:content-processing:produces": { x1: 490, y1: 215, x2: 585, y2: 215, label: { x: 537, y: 204, anchor: "middle" } },
  "bullmq:content-processing->recall-backend:worker:consumes": { x1: 775, y1: 215, x2: 880, y2: 215, label: { x: 827, y: 204, anchor: "middle" } },
  "recall-backend:brainly-server->recall-backend:queue:imports": { x1: 440, y1: 185, x2: 585, y2: 92, label: { x: 500, y: 128, anchor: "end" } },
  "recall-backend:brainly-server->recall-backend:shared:imports": { x1: 440, y1: 245, x2: 585, y2: 338, label: { x: 500, y: 312, anchor: "end" } },
  "recall-backend:worker->recall-backend:queue:imports": { x1: 925, y1: 185, x2: 775, y2: 92, label: { x: 862, y: 128, anchor: "start" } },
  "recall-backend:worker->recall-backend:shared:imports": { x1: 925, y1: 245, x2: 775, y2: 338, label: { x: 862, y: 312, anchor: "start" } },
};

function arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const [bx, by] = [x2 - ux * 9, y2 - uy * 9];
  const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return `M${p(x2, y2)} L${p(bx - uy * 4.5, by + ux * 4.5)} L${p(bx + uy * 4.5, by - ux * 4.5)} Z`;
}

const lineOf = (evidence: string) => Number(/#L(\d+)/.exec(evidence)![1]);
/** The fact chips: the extractor's operation, short. */
const CHIP: Record<string, string> = {
  "recall-backend/index.ts": "queue.add",
  "recall-backend/config/queue.ts": "new Queue",
  "recall-backend/config/db.ts": "env",
  "recall-backend/worker.ts": "new Worker",
};

// beats (ms, before SPEED)
const SCAN = 1200;
const SCAN_D = 1500;
const GROUP = 2900;
const GROUP_STEP = 450;
const EDGES = 5300;
const EDGE_STEP = 420;
const PACKET = EDGES + GRAPH_EDGES.length * EDGE_STEP + 200;
/** Components with files, in grouping order; the queue (no files) appears last, from its facts. */
const GROUP_ORDER: GraphComponentId[] = ["recall-backend:brainly-server", "recall-backend:worker", "recall-backend:queue", "recall-backend:shared", "bullmq:content-processing"];
const groupAt = (id: GraphComponentId) => GROUP + GROUP_ORDER.indexOf(id) * GROUP_STEP;

export function RepoToGraphWide() {
  return (
    <svg viewBox="0 0 1100 430" className="block h-auto w-full" aria-hidden data-testid="repo-to-graph-wide">
      {/* the tree */}
      <text x={10} y={22} className="mono" fontSize={12} data-anim="fade" style={{ ...at(0, 300), fill: "var(--faint)" }}>
        {GRAPH_PATH_PREFIX} @ {RECALL.short}
      </text>
      <rect x={0} y={TREE_TOP} width={TREE_W} height={ROW} rx={5} className="lp-gone" data-anim="scan" style={{ ...at(SCAN, SCAN_D), fill: "var(--accent-soft)", "--dist": `${(GRAPH_TREE.length - 1) * ROW}px` } as React.CSSProperties} />
      {GRAPH_TREE.map((f, i) => {
        const y = TREE_TOP + i * ROW;
        const Icon = KIND_META[GRAPH_COMPONENTS.find((c) => c.id === f.component)!.kind].icon;
        const fact = GRAPH_FILES.find((g) => g.path === f.path);
        return (
          <g key={f.path} data-testid="tree-row">
            <g data-anim="fade" style={at(i * 60, 300)}>
              <text x={30} y={y + 16} className="mono" fontSize={12.5} style={{ fill: "var(--text)" }}>
                {f.path.slice(GRAPH_PATH_PREFIX.length)}
              </text>
            </g>
            <g data-anim="in" style={{ ...at(groupAt(f.component) + 100, 300), color: "var(--muted)" }}>
              <Icon x={8} y={y + 5} width={14} height={14} strokeWidth={2} />
            </g>
            {fact && (
              <g data-anim="in" style={at(SCAN + i * (SCAN_D / GRAPH_TREE.length) + 60, 300)} data-testid="fact-chip">
                {/* facts sit on short paths (≤ 15 characters), so the chip fits beside them */}
                <rect x={162} y={y + 3} width={112} height={19} rx={9.5} strokeWidth={1} style={{ fill: "var(--panel-raised)", stroke: "var(--accent)" }} />
                <text x={218} y={y + 16.5} textAnchor="middle" className="mono" fontSize={11} style={{ fill: "var(--accent)" }}>
                  {CHIP[f.path]} L{lineOf(fact.evidence)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <line x1={TREE_W + 4} y1={20} x2={TREE_W + 4} y2={410} strokeWidth={1} style={{ stroke: "var(--panel-line)" }} />

      {/* the components */}
      {GRAPH_COMPONENTS.map((c) => {
        const n = NODES[c.id];
        const Icon = KIND_META[c.kind].icon;
        const files = GRAPH_TREE.filter((f) => f.component === c.id).length;
        const name = c.kind === "queue" ? c.name.replace(/ queue$/i, "") : c.name;
        const left = n.x - n.w / 2;
        return (
          <g key={c.id} data-anim="in" style={at(groupAt(c.id) + 150, 400)} data-testid="graph-node">
            <rect x={left} y={n.y - NODE_H / 2} width={n.w} height={NODE_H} rx={10} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
            <g style={{ color: "var(--muted)" }}>
              <Icon x={left + 13} y={n.y - 20} width={17} height={17} strokeWidth={2} />
            </g>
            <text x={left + 37} y={n.y - 6} fontSize={14.5} fontWeight={600} style={{ fill: "var(--text)" }}>
              {name}
            </text>
            <text x={left + 13} y={n.y + 18} className="mono" fontSize={11.5} style={{ fill: "var(--faint)" }}>
              {c.kind}
              {files ? ` · ${files} file${files > 1 ? "s" : ""}` : ""}
            </text>
            {c.model && <image href={`${base}/icons/nvidia-color-eye.svg`} x={left + n.w - 28} y={n.y + 8} width={17} height={12} />}
          </g>
        );
      })}

      {/* the edges, one at a time */}
      {GRAPH_EDGES.map((e, k) => {
        const g = GEOMETRY[e.id]!;
        const t = EDGES + k * EDGE_STEP;
        return (
          <g key={e.id} data-testid="graph-edge">
            <path className="lp-path" data-anim="draw" style={{ ...at(t, 380), fill: "none", stroke: "var(--edge)" }} pathLength={1} strokeWidth={1.6} d={`M${g.x1} ${g.y1} L${g.x2} ${g.y2}`} />
            <path data-anim="fade" style={{ ...at(t + 330, 150), fill: "var(--edge)" }} d={arrow(g)} />
            <text x={g.label.x} y={g.label.y} textAnchor={g.label.anchor} className="mono" fontSize={12} data-anim="in" style={{ ...at(t + 250, 300), fill: "var(--muted)" }} data-testid="edge-label">
              {e.file}:{e.line}
            </text>
          </g>
        );
      })}

      {/* a job: produced by the API, through the queue, consumed by the worker */}
      <circle cx={490} cy={215} r={5.5} className="lp-gone" data-anim="packet" style={{ ...at(PACKET, 1700), fill: "var(--highlight)" }} />
    </svg>
  );
}
