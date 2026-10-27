import { boxCorners, fitProjection, iso, onTop, ring, screenRise, segment, slabOf, topMatrix, type Plan, type Point3, type Projection } from "@/components/iso/iso-kit";
import { FILE_IMPORTS, GRAPH_COMPONENTS, GRAPH_EDGES, GRAPH_FILES, GRAPH_PATH_PREFIX, GRAPH_TREE, RECALL, type GraphComponentId } from "@/lib/landing";

/**
 * Recall @ 5d2165a as three plates pulled apart in depth (vite.dev's exploded stack, drawn with the
 * Anatomy kit's isometric camera), one idea: the graph sits on top of the code it was read from.
 *   1. the files: Recall's 15 backend files and the imports between them, a plate of code;
 *   2. the facts: a second plate rises with the four facts the extractors found, each on a thread
 *      straight down to its file and line;
 *   3. the components: the top plate rises, the five components stand on it and every file takes
 *      its component's colour;
 *   4. the edges: the six edges draw on the top plate, and each drops a pin to the file and line
 *      that proves it.
 * Pure SVG from lib/landing.ts, timed by --t / --d (globals.css .lp-anim). Two drawings, wide (lg
 * and up) and narrow, from the same scene.
 */

export const GRAPH_BEATS = [0, 1500, 3000, 4500] as const;
const [, B2, B3, B4] = GRAPH_BEATS;
const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;

/** one colour per component: its files, its tile and its edges */
export const HUE: Record<GraphComponentId, string> = {
  "recall-backend:brainly-server": "#f5a524",
  "recall-backend:queue": "#8fd3ff",
  "bullmq:content-processing": "#b4a2ff",
  "recall-backend:shared": "#5ee68f",
  "recall-backend:worker": "#ff9ec4",
};

const short = (path: string) => path.slice(GRAPH_PATH_PREFIX.length);

/* ---------- the world: one plate plan, the components on it, the files under them ---------- */
const PLATE: Plan = { x: 0, y: 0, w: 420, d: 300, r: 30 };
const T = 6;
const SPOT: Record<GraphComponentId, readonly [number, number]> = {
  "recall-backend:brainly-server": [52, 252],
  "bullmq:content-processing": [210, 150],
  "recall-backend:worker": [368, 48],
  "recall-backend:queue": [70, 52],
  "recall-backend:shared": [350, 250],
};
/** each file sits near its component, in a small grid (the queue broker has no files) */
const FILE_AT = (() => {
  const out = new Map<string, readonly [number, number]>();
  for (const c of GRAPH_COMPONENTS) {
    const files = GRAPH_TREE.filter((f) => f.component === c.id);
    const cols = Math.ceil(Math.sqrt(files.length));
    const [cx, cy] = SPOT[c.id];
    files.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(files.length / cols);
      out.set(f.path, [cx + (col - (cols - 1) / 2) * 30, cy + (row - (rows - 1) / 2) * 30]);
    });
  }
  return out;
})();
const fileAt = (path: string) => FILE_AT.get(path)!;
const FACT_FILES = GRAPH_TREE.filter((f) => GRAPH_FILES.some((g) => g.path === f.path)).map((f) => f.path);
/** the fact on a file as a chip: what was found, and its line (in GRAPH_TREE's order) */
const chipOf = (path: string) => {
  const f = GRAPH_FILES.find((x) => x.path === path)!;
  const what = f.fact.startsWith("env") ? "env" : f.fact.startsWith("new ") ? f.fact.split("(")[0]! : "queue.add";
  return `${what} L${/#L(\d+)/.exec(f.evidence)![1]}`;
};

interface Scene {
  w: number;
  h: number;
  zFacts: number;
  zGraph: number;
  font: number;
}
const WIDE: Scene = { w: 760, h: 640, zFacts: 115, zGraph: 230, font: 12 };
const NARROW: Scene = { w: 380, h: 520, zFacts: 140, zGraph: 280, font: 10.5 };

/** a plate: a thin slab whose sides glow in its tone; glass plates are see-through */
function Plate({ P, z, tone, glass, id }: { P: Projection; z: number; tone: string; glass?: boolean; id: string }) {
  const s = slabOf(PLATE, z, T, P, 10);
  return (
    <g className="rg-plate" style={{ "--c": tone } as React.CSSProperties}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={tone} stopOpacity="0.15" />
          <stop offset="0.3" stopColor={tone} stopOpacity="0.9" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.55" stopColor={tone} stopOpacity="0.7" />
          <stop offset="0.8" stopColor={tone} stopOpacity="0.95" />
          <stop offset="1" stopColor={tone} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d={s.top} className={glass ? "rg-glass" : "rg-top"} />
      {s.shades.map((d, i) => d && <path key={i} d={d} fill={`url(#${id})`} opacity={glass ? 0.55 : 1} />)}
      <path d={s.outline} className="rg-edge" />
      <path d={s.crease} className="rg-edge rg-edge-lit" />
    </g>
  );
}

/** a small tile standing on the graph plate: dark top, sides in the component's colour */
function Tile({ P, x, y, z, color }: { P: Projection; x: number; y: number; z: number; color: string }) {
  const s = slabOf({ x: x - 30, y: y - 24, w: 60, d: 48, r: 10 }, z, 14, P, 6);
  return (
    <g style={{ "--c": color } as React.CSSProperties}>
      {s.shades.map((d, i) => d && <path key={i} d={d} fill={color} opacity={0.55 + i * 0.12} />)}
      <path d={s.top} className="rg-tile-top" />
      <path d={s.outline} className="rg-edge" style={{ stroke: color }} />
    </g>
  );
}

/** a screen-aligned label with a dark pill behind it */
function Pill({ x, y, text, font, color, testId }: { x: number; y: number; text: string; font: number; color?: string; testId?: string }) {
  const w = text.length * font * 0.62 + font * 1.1;
  const h = font * 1.75;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} className="rg-pill" style={color ? { stroke: color } : undefined} />
      <text x={x} y={y + font * 0.36} textAnchor="middle" fontSize={font} className="rg-mono" style={{ fill: color ?? "var(--text)" }} data-testid={testId}>
        {text}
      </text>
    </g>
  );
}

function Drawing({ scene, variant }: { scene: Scene; variant: "w" | "n" }) {
  const { w, h, zFacts, zGraph, font } = scene;
  const P = fitProjection([...boxCorners(PLATE, 0, zGraph + T + 30)], w, h, { pad: variant === "w" ? 36 : 14 });
  const top = (z: number) => z + T;
  const pt = (x: number, y: number, z: number) => iso([x, y, z], P);
  const rise = (z: number) => screenRise(z, P);
  const id = (name: string) => `rg-${variant}-${name}`;
  const chipW = (path: string) => chipOf(path).length * (font - 1) * 0.62 + (font - 1) * 1.1;
  // a straight line from a to b, cut where it crosses the facts plate, so the plate can cover the lower part
  const cut = (a: Point3, b: Point3) => {
    const t = (top(zFacts) - a[2]) / (b[2] - a[2]);
    const mid: Point3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, top(zFacts)];
    return { upper: segment(a, mid, P), lower: segment(mid, b, P) };
  };
  const edges = GRAPH_EDGES.map((e) => {
    const [ax, ay] = SPOT[e.from];
    const [bx, by] = SPOT[e.to];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const file = GRAPH_TREE.find((f) => f.path === `${GRAPH_PATH_PREFIX}${e.file}`)!.path;
    const [fx, fy] = fileAt(file);
    return { e, line: onTop([[ax, ay], [bx, by]], top(zGraph), P), pin: cut([mx, my, top(zGraph)], [fx, fy, top(0)]), fileDot: pt(fx, fy, top(0)) };
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="rg block h-auto w-full" aria-hidden>
      {/* 1 · the files and their imports */}
      <g data-anim="in" style={at(0, 500)}>
        <Plate P={P} z={0} tone="#3aa9e0" id={id("files")} />
        {FILE_IMPORTS.map(([from, to], k) => {
          const [ax, ay] = fileAt(`${GRAPH_PATH_PREFIX}${from}`);
          const [bx, by] = fileAt(`${GRAPH_PATH_PREFIX}${to}`);
          return <path key={k} d={onTop([[ax, ay], [bx, by]], top(0), P)} className="rg-import lp-path" pathLength={1} data-anim="draw" style={at(300 + k * 45, 500)} />;
        })}
        {GRAPH_TREE.map((f, k) => {
          const [x, y] = fileAt(f.path);
          return (
            <g key={f.path} data-testid="tree-row">
              <title>{short(f.path)}</title>
              <g data-anim="pop" style={at(150 + k * 50, 400)}>
                <path d={ring(x, y, 5, top(0), P, 18)} className="rg-file" />
              </g>
              {/* beat 3: the file takes its component's colour */}
              <path d={ring(x, y, 5, top(0), P, 18)} style={{ ...at(B3 + 300 + k * 30, 500), fill: HUE[f.component] }} className="rg-file-lit" data-anim="fade" />
            </g>
          );
        })}
        <text transform={topMatrix([PLATE.w - 18, PLATE.d - 14], top(0), P, "y")} fontSize={12} textAnchor="start" className="rg-mono rg-plate-name">
          {`${GRAPH_TREE.length} FILES · ${GRAPH_PATH_PREFIX} @ ${RECALL.short}`}
        </text>
      </g>

      {/* 4 · lower half of each evidence pin (under the facts plate) */}
      {edges.map(({ e, pin }, k) => (
        <path key={e.id} d={pin.lower} className="rg-pin" data-anim="fade" style={at(B4 + 600 + k * 160, 450)} />
      ))}
      {/* 2 · the facts, each on a thread down to its file and line */}
      {FACT_FILES.map((path, k) => {
        const [x, y] = fileAt(path);
        return <path key={path} d={segment([x, y, top(zFacts)], [x, y, top(0)], P)} className="rg-thread lp-path" pathLength={1} data-anim="draw" style={at(B2 + 700 + k * 120, 500)} />;
      })}
      <g data-anim="move" style={{ ...at(B2, 900), "--from": `${rise(zFacts)}px` } as React.CSSProperties}>
        <g data-anim="fade" style={at(B2, 300)}>
          <Plate P={P} z={zFacts} tone="#9b84ff" glass id={id("facts")} />
          <text transform={topMatrix([PLATE.w - 18, PLATE.d - 14], top(zFacts), P, "y")} fontSize={12} className="rg-mono rg-plate-name">
            {`${FACT_FILES.length} FACTS · EACH AT A FILE AND LINE`}
          </text>
        </g>
      </g>

      {/* 4 · upper half of each evidence pin (above the facts plate) */}
      {edges.map(({ e, pin }, k) => (
        <path key={e.id} d={pin.upper} className="rg-pin" data-anim="fade" style={at(B4 + 250 + k * 160, 400)} />
      ))}
      {/* 3 · the graph plate and its components */}
      <g data-anim="move" style={{ ...at(B3, 1000), "--from": `${rise(zGraph)}px` } as React.CSSProperties}>
        <g data-anim="fade" style={at(B3, 300)}>
          <Plate P={P} z={zGraph} tone="#f5a524" glass id={id("graph")} />
          <text transform={topMatrix([PLATE.w - 18, PLATE.d - 14], top(zGraph), P, "y")} fontSize={12} className="rg-mono rg-plate-name">
            {`${GRAPH_COMPONENTS.length} COMPONENTS · ${GRAPH_EDGES.length} EDGES`}
          </text>
        </g>
      </g>
      {/* 2 · the fact chips, drawn over the glass so none is hidden by a plate above it */}
      {FACT_FILES.map((path, k) => {
        const [x, y] = fileAt(path);
        const [sx, sy] = pt(x, y, top(zFacts));
        return (
          <g key={path} data-anim="pop" style={at(B2 + 800 + k * 120, 420)} data-testid="fact-chip">
            <circle cx={sx} cy={sy} r={3} className="rg-fact-dot" />
            <Pill x={Math.max(sx - chipW(path) / 2 - 8, chipW(path) / 2 + 2)} y={sx - chipW(path) - 8 < 2 ? sy - font * 1.5 : sy} text={chipOf(path)} font={font - 1} color="#ffc46b" />
          </g>
        );
      })}
      {/* 4 · the edges on the graph plate */}
      {edges.map(({ e, line }, k) => (
        <path key={e.id} d={line} className="rg-edge-line lp-path" pathLength={1} data-anim="draw" style={{ ...at(B4 + k * 160, 500), stroke: e.kind === "imports" ? "#9aa6c0" : HUE[e.kind === "produces" ? e.to : e.from] }} />
      ))}
      {GRAPH_COMPONENTS.map((c, k) => {
        const [x, y] = SPOT[c.id];
        const [lx, ly] = pt(x, y, top(zGraph) + 14);
        return (
          <g key={c.id} data-anim="pop" style={at(B3 + 700 + k * 120, 500)} data-testid="graph-node">
            <Tile P={P} x={x} y={y} z={top(zGraph)} color={HUE[c.id]} />
            <Pill x={lx} y={ly - font * 2.6} text={variant === "n" ? c.name.replace("Content Processing Queue", "Content Queue").replace("Recall Backend Worker", "Worker") : c.name} font={font} color={HUE[c.id]} />
          </g>
        );
      })}
      {/* each edge's evidence, where its pin lands: stacked beside the file it points at */}
      {edges.map(({ e, fileDot }, k) => {
        const nth = edges.slice(0, k).filter((x) => x.e.file === e.file).length;
        const side = fileDot[0] < w / 2 ? -1 : 1;
        const tw = `${e.file}:${e.line}`.length * (font - 1) * 0.62 + (font - 1) * 1.1;
        // wide: beside the dot, outward; narrow: under it, kept inside the drawing
        const x = variant === "w" ? fileDot[0] + side * (tw / 2 + 14) : Math.min(w - tw / 2 - 2, Math.max(tw / 2 + 2, fileDot[0]));
        const y = variant === "w" ? fileDot[1] + (nth - 1) * font * 2 : fileDot[1] + 16 + nth * font * 1.9;
        return (
          <g key={e.id} data-anim="in" style={at(B4 + 700 + k * 160, 400)}>
            {nth === 0 && <circle cx={fileDot[0]} cy={fileDot[1]} r={4.5} className="rg-pin-end" />}
            <Pill x={x} y={y} text={`${e.file}:${e.line}`} font={font - 1} testId="edge-label" />
          </g>
        );
      })}
    </svg>
  );
}

export function RepoToGraphWide() {
  return <Drawing scene={WIDE} variant="w" />;
}
export function RepoToGraph() {
  return <Drawing scene={NARROW} variant="n" />;
}
