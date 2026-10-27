import { GRAPH_COMPONENTS, GRAPH_EDGES, GRAPH_FILES, GRAPH_PATH_PREFIX, GRAPH_TREE, RECALL, type GraphComponentId } from "@/lib/landing";

/**
 * Recall @ 5d2165a, one idea: the files sort themselves into components, and every edge between
 * them points at a line.
 *   1. the backend's 15 files, each dotted in its component's colour (four carry a fact chip);
 *   2. the facts: an env read, the queue, the queue.add call, the worker, each at a line;
 *   3. each file's dot flies into its component, which appears with its file count;
 *   4. the 6 edges draw, each labelled with the file and line that proves it.
 * Two drawings, wide (lg and up) and narrow, from the same data; timed by --t / --d (.lp-anim).
 */

export const GRAPH_BEATS = [0, 1100, 2200, 3600] as const;
const [, B2, B3, B4] = GRAPH_BEATS;
const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;

/** one colour per component, used for its files' dots and its node */
export const HUE: Record<GraphComponentId, string> = {
  "recall-backend:brainly-server": "#f5a524",
  "recall-backend:queue": "#8fd3ff",
  "bullmq:content-processing": "#b4a2ff",
  "recall-backend:shared": "#5ee68f",
  "recall-backend:worker": "#ff9ec4",
};
/** a name broken into lines of at most `max` characters, at spaces */
const wrap = (name: string, max: number) =>
  name.split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);
const fileCount = (id: GraphComponentId) => GRAPH_TREE.filter((f) => f.component === id).length;
const short = (path: string) => path.slice(GRAPH_PATH_PREFIX.length);
/** the fact on a file as a chip: what was found, and its line */
const chipOf = (path: string) => {
  const f = GRAPH_FILES.find((x) => x.path === path);
  if (!f) return undefined;
  const what = f.fact.startsWith("env") ? "env" : f.fact.startsWith("new ") ? f.fact.split("(")[0]! : "queue.add";
  return `${what} L${/#L(\d+)/.exec(f.evidence)![1]}`;
};

interface Layout {
  w: number;
  h: number;
  node: { w: number; h: number; font: number; wrap: number };
  at: Record<GraphComponentId, readonly [number, number]>;
  /** where file i's dot starts */
  dot: (i: number) => readonly [number, number];
  label: number;
}

const WIDE: Layout = {
  w: 1120,
  h: 480,
  node: { w: 160, h: 72, font: 13, wrap: 18 },
  at: {
    "recall-backend:brainly-server": [514, 245],
    "recall-backend:queue": [768, 92],
    "bullmq:content-processing": [768, 245],
    "recall-backend:shared": [768, 398],
    "recall-backend:worker": [1022, 245],
  },
  dot: (i) => [34, 64 + i * 26],
  label: 11.5,
};
const NARROW: Layout = {
  w: 360,
  h: 600,
  node: { w: 112, h: 66, font: 11, wrap: 12 },
  at: {
    "recall-backend:brainly-server": [180, 160],
    "recall-backend:queue": [62, 360],
    "bullmq:content-processing": [180, 360],
    "recall-backend:shared": [298, 360],
    "recall-backend:worker": [180, 560],
  },
  dot: (i) => [26 + i * 22, 40],
  label: 10,
};

/** where an edge leaves `from` and enters `to`: the nodes' borders, along the centre line */
function ends(l: Layout, from: GraphComponentId, to: GraphComponentId) {
  const [x1, y1] = l.at[from];
  const [x2, y2] = l.at[to];
  const clip = (x: number, y: number, dx: number, dy: number) => {
    const tx = dx ? l.node.w / 2 / Math.abs(dx) : Infinity;
    const ty = dy ? l.node.h / 2 / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return [x + dx * t, y + dy * t] as const;
  };
  const a = clip(x1, y1, x2 - x1, y2 - y1);
  const b = clip(x2, y2, x1 - x2, y1 - y2);
  return { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const };
}

function Drawing({ l, wide }: { l: Layout; wide: boolean }) {
  const { w: nw, h: nh, font } = l.node;
  const labelW = (s: string) => s.length * l.label * 0.62 + 12;
  return (
    <svg viewBox={`0 0 ${l.w} ${l.h}`} className="rg block h-auto w-full" aria-hidden>
      <defs>
        <marker id={`rg-arrow-${wide ? "w" : "n"}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--edge)" />
        </marker>
      </defs>

      {/* beat 1: the files, dotted by component; beat 2: their facts */}
      {wide ? (
        <g>
          <text x={22} y={34} className="mono" fontSize={12} style={{ ...at(0, 400), fill: "var(--faint)" }} data-anim="fade">
            {GRAPH_PATH_PREFIX} @ {RECALL.short}
          </text>
          {GRAPH_TREE.map((f, i) => {
            const [x, y] = l.dot(i);
            const chip = chipOf(f.path);
            return (
              <g key={f.path} data-testid="tree-row">
                <g data-anim="in" style={at(80 + i * 45, 320)}>
                  <circle cx={x} cy={y} r={4.5} fill={HUE[f.component]} />
                  <text x={x + 14} y={y + 4.5} className="mono" fontSize={12.5} style={{ fill: "var(--muted)" }}>
                    {short(f.path)}
                  </text>
                </g>
                {chip && (
                  <g data-anim="in" style={at(B2 + 150 * GRAPH_FILES.findIndex((g) => g.path === f.path), 380)} data-testid="fact-chip">
                    <rect x={268} y={y - 10} width={102} height={20} rx={10} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1} />
                    <text x={319} y={y + 4} textAnchor="middle" className="mono" fontSize={11} style={{ fill: "var(--accent)" }}>
                      {chip}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <path d={`M404 24 V${l.h - 16}`} stroke="var(--panel-line)" />
        </g>
      ) : (
        <g>
          {GRAPH_TREE.map((f, i) => {
            const [x, y] = l.dot(i);
            return <rect key={f.path} x={x - 7} y={y - 7} width={14} height={14} rx={3} fill={HUE[f.component]} data-anim="in" style={at(80 + i * 45, 320)} />;
          })}
          <text x={180} y={74} textAnchor="middle" className="mono" fontSize={11} style={{ ...at(0, 400), fill: "var(--faint)" }} data-anim="fade">
            {GRAPH_TREE.length} files in {GRAPH_PATH_PREFIX} @ {RECALL.short}
          </text>
        </g>
      )}

      {/* beat 3: every file's dot flies into its component */}
      {GRAPH_TREE.map((f, i) => {
        const [x0, y0] = l.dot(i);
        const [x1, y1] = l.at[f.component];
        return (
          <circle
            key={f.path}
            cx={x1}
            cy={y1}
            r={wide ? 4.5 : 5}
            fill={HUE[f.component]}
            className="lp-gone"
            data-anim="fly"
            style={{ ...at(B3 + i * 40, 900), "--fx": `${x0 - x1}px`, "--fy": `${y0 - y1}px` } as React.CSSProperties}
          />
        );
      })}

      {/* beat 4: the edges (under the nodes), then their labels (over them) */}
      {GRAPH_EDGES.map((e, k) => {
        const { a, b } = ends(l, e.from, e.to);
        const d = `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
        return (
          <g key={e.id}>
            <path className="lp-path" data-anim="draw" style={at(B4 + k * 160, 600)} pathLength={1} d={d} stroke={e.kind === "imports" ? "var(--edge)" : HUE[e.kind === "produces" ? e.to : e.from]} strokeWidth={e.kind === "imports" ? 1.4 : 2} fill="none" />
            {/* the arrowhead on its own path, so it appears only when the line reaches it */}
            <path data-anim="fade" style={at(B4 + k * 160 + 520, 160)} d={d} stroke="none" fill="none" markerEnd={`url(#rg-arrow-${wide ? "w" : "n"})`} />
          </g>
        );
      })}
      {/* beat 3: the components */}
      {GRAPH_COMPONENTS.map((c, k) => {
        const [x, y] = l.at[c.id];
        const n = fileCount(c.id);
        return (
          <g key={c.id} data-anim="pop" style={at(B3 + 700 + k * 120, 520)} data-testid="graph-node">
            <rect x={x - nw / 2} y={y - nh / 2} width={nw} height={nh} rx={10} fill="var(--card)" stroke={HUE[c.id]} strokeWidth={1.5} />
            <rect x={x - nw / 2} y={y - nh / 2 + 10} width={3} height={nh - 20} rx={1.5} fill={HUE[c.id]} />
            {(() => {
              const name = wrap(c.name, l.node.wrap);
              const top = y - ((name.length + 1) * font * 1.25) / 2 + font;
              return (
                <>
                  <text x={x - nw / 2 + 14} y={top} fontSize={font} fontWeight={600} style={{ fill: "var(--text)" }}>
                    {name.map((line, j) => (
                      <tspan key={j} x={x - nw / 2 + 14} dy={j ? font * 1.25 : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  <text x={x - nw / 2 + 14} y={top + name.length * font * 1.25 + 1} className="mono" fontSize={font - 2.5} style={{ fill: "var(--faint)" }}>
                    {c.kind}
                    {n ? ` · ${n} file${n === 1 ? "" : "s"}` : ""}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
      {GRAPH_EDGES.map((e, k) => {
        const { a, b, mid } = ends(l, e.from, e.to);
        const text = `${e.file}:${e.line}`;
        const lw = labelW(text);
        // a label on a level edge sits above it; on the narrow drawing the three edges leaving a
        // hub fan out: the slanted ones are labelled near the hub, the straight one further along
        const level = Math.abs(a[1] - b[1]) < 1;
        const straight = Math.abs(a[0] - b[0]) < 1;
        const lx = !wide && !straight ? a[0] + (b[0] - a[0]) * 0.4 : mid[0];
        const ly = level ? mid[1] - l.label * 1.6 : !wide && !straight ? a[1] + (b[1] - a[1]) * 0.4 : !wide ? mid[1] + (a[1] < l.h / 2 ? 26 : -26) : mid[1];
        return (
          <g key={e.id} data-anim="in" style={at(B4 + 300 + k * 160, 360)}>
            <rect x={lx - lw / 2} y={ly - l.label * 0.95} width={lw} height={l.label * 1.75} rx={4} fill="var(--panel)" stroke="var(--panel-line)" />
            <text x={lx} y={ly + l.label * 0.36} textAnchor="middle" className="mono" fontSize={l.label} style={{ fill: e.kind === "imports" ? "var(--muted)" : "var(--text)" }} data-testid="edge-label">
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RepoToGraphWide() {
  return <Drawing l={WIDE} wide />;
}
export function RepoToGraph() {
  return <Drawing l={NARROW} wide={false} />;
}
