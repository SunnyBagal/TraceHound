import { boxCorners, cylinder, fitProjection, insetPlan, iso, lineOnTop, planOutline, segment, sideArc, sideMatrix, sideRing, slabOf, towardViewer, axisVector, type Plan, type Point3, type Projection, type SolidPaths } from "@/components/iso/iso-kit";
import { GRAPH_COMPONENTS, GRAPH_EDGES, type GraphComponentId } from "@/lib/landing";

/*
 * The trust section's four machines, drawn the Anatomy way (the vendored kit's camera and solids,
 * ink outlines, four side tones, one lit part per machine): each one is a real object whose working
 * is the claim beside it. Every number comes from the caller (lib/landing.ts or the benchmark's
 * cost table). Server-rendered SVG; the entrances are CSS under Reveal (globals.css, .mc-*).
 */

type Tone = "paper" | "amber" | "violet" | "glacier" | "green" | "nvidia" | "ink";
const RAMP: Record<Tone, { side: [string, string, string, string]; top: string }> = {
  paper: { side: ["#b9bdc8", "#cdd0d8", "#dee0e6", "#eceef2"], top: "#fbfbfc" },
  amber: { side: ["#a9510a", "#cf7212", "#ec9a2c", "#f6bf66"], top: "#ffe7bd" },
  violet: { side: ["#3519b4", "#5236d8", "#7a60ee", "#a693ff"], top: "#ece7ff" },
  glacier: { side: ["#0a5f88", "#157fb3", "#36a3da", "#7ccdf3"], top: "#e1f5ff" },
  green: { side: ["#11743a", "#1a9a4e", "#33b863", "#7adc9c"], top: "#ddf8e7" },
  nvidia: { side: ["#3f6a00", "#5a8f05", "#76b900", "#a3d94f"], top: "#eef9d9" },
  ink: { side: ["#16171d", "#22232b", "#2d2f38", "#3a3c47"], top: "#30323c" },
};

function Solid({ p, tone = "paper", className, style }: { p: SolidPaths; tone?: Tone; className?: string; style?: React.CSSProperties }) {
  const r = RAMP[tone];
  return (
    <g className={className} style={style}>
      <path d={p.fill} fill={r.top} />
      {p.shades.map((d, i) => d && <path key={i} d={d} fill={r.side[i]} stroke={r.side[i]} strokeWidth={0.4} />)}
      <path d={p.top} fill={r.top} />
      {p.bevel && <path d={p.bevel} className="mc-bevel" />}
      <path d={p.crease} className="mc-crease" />
      <path d={p.outline} className="mc-ink" />
    </g>
  );
}
const Halo = ({ plan, P }: { plan: Plan; P: Projection }) => <path d={slabOf(insetPlan(plan, -10), 0, 0, P).fill} className="mc-halo" />;
const Text = ({ m, size, children, anchor, className = "mc-text" }: { m: string; size: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; className?: string }) => (
  <text transform={m} fontSize={size} textAnchor={anchor} className={className}>
    {children}
  </text>
);
/** a screen-space tag: white pill, ink rim */
function Tag({ at, text, size = 9, lit }: { at: readonly [number, number]; text: string; size?: number; lit?: boolean }) {
  const w = text.length * size * 0.62 + size * 1.2;
  const h = size * 1.8;
  return (
    <g className="mc-tag" data-lit={lit || undefined}>
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} rx={h / 2} />
      <text x={at[0]} y={at[1] + size * 0.36} textAnchor="middle" fontSize={size}>
        {text}
      </text>
    </g>
  );
}
/** a component's printed name: green if Nemotron Nano wrote it, white if Recall's config set it */
function NameTag({ at, text, model }: { at: readonly [number, number]; text: string; model: boolean }) {
  const size = 8.5;
  const w = text.length * size * 0.6 + size * 1.4;
  const h = size * 1.9;
  return (
    <g className="mc-name" data-model={model || undefined}>
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} rx={3} />
      <text x={at[0]} y={at[1] + size * 0.36} textAnchor="middle" fontSize={size}>
        {text}
      </text>
    </g>
  );
}
const slide = (P: Projection, by: Point3, i: number) => {
  const [fx, fy] = axisVector(P, by);
  return { "--fx": `${fx}px`, "--fy": `${fy}px`, "--i": i } as React.CSSProperties;
};

/* ======================= 1 · the card catalogue: evidence filed by snapshot ======================= */

export interface Drawer {
  label: string;
  sha: string;
  evidence: number;
  tone: "amber" | "violet" | "glacier";
}

export function CatalogueFigure({ drawers }: { drawers: readonly Drawer[] }) {
  const CAB: Plan = { x: 0, y: 0, w: 150, d: 110, r: 3 };
  const PLINTH: Plan = { x: -8, y: -8, w: 166, d: 126, r: 5 };
  const most = Math.max(...drawers.map((d) => d.evidence));
  const pullOf = (ev: number) => Math.round((ev / most) * 96);
  const P = fitProjection([...boxCorners(PLINTH, 0, 146), ...boxCorners({ x: 0, y: 0, w: 150, d: 110 + 104, r: 0 }, 0, 20)], 520, 400, { pad: 18 });
  const FH = 36;
  // top to bottom as given; painted bottom first
  const rows = drawers.map((d, k) => ({ ...d, z: 98 - k * 42, pull: pullOf(d.evidence) }));
  const face = (x0: number, x1: number, z0: number, z1: number, y: number) => `M${[iso([x0, y, z0], P), iso([x1, y, z0], P), iso([x1, y, z1], P), iso([x0, y, z1], P)].map((p) => p.join(",")).join("L")}Z`;
  return (
    <svg viewBox="0 0 520 400" className="mc-fig" role="img" aria-label={`A card catalogue with a drawer per snapshot, each pulled out as far as its evidence: ${drawers.map((d) => `${d.label} ${d.evidence}`).join(", ")}.`}>
      <Halo plan={PLINTH} P={P} />
      <Solid p={slabOf(PLINTH, 0, 10, P, 4, 0.8)} tone="ink" />
      <Solid p={slabOf(CAB, 10, 128, P, 4, 1)} />
      <path d={planOutline(insetPlan(CAB, 6), 138, P, 3)} className="mc-faint" />
      {[
        [6, 6],
        [144, 6],
        [144, 104],
        [6, 104],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={iso([x!, y!, 138], P)[0]} cy={iso([x!, y!, 138], P)[1]} r={1.3} className="mc-screw" />
      ))}
      <Text m={sideMatrix([150, 100], 128, P, "right")} size={7}>
        EVIDENCE · FILED BY SNAPSHOT
      </Text>
      <Text m={sideMatrix([150, 100], 118, P, "right")} size={5.5} className="mc-text-faint">
        file · symbol · line range · extractor
      </Text>
      {/* the drawer openings */}
      {rows.map((r) => (
        <path key={r.sha} d={face(8, 142, r.z - 2, r.z + FH + 1, 110)} className="mc-cavity" />
      ))}
      {[...rows].reverse().map((r, k) => {
        const front = 110 + r.pull;
        const n = Math.max(4, Math.round(r.evidence / 12));
        const lit = k === rows.length - 1 ? Math.floor(n / 2) : -1;
        return (
          <g key={r.sha} className="mc-slide" style={slide(P, [0, -r.pull, 0], rows.length - 1 - k)}>
            <Solid p={slabOf({ x: 12, y: 108, w: 126, d: r.pull + 2, r: 1 }, r.z, 3, P, 2)} />
            <Solid p={slabOf({ x: 12, y: 108, w: 2.5, d: r.pull + 2, r: 0 }, r.z, 24, P, 2)} />
            {Array.from({ length: n }, (_, j) => {
              const y = 110 + 3 + ((j + 0.5) * (r.pull - 6)) / n;
              const up = j === lit ? 16 : 0;
              return <Solid key={j} p={slabOf({ x: 17, y, w: 116, d: 1.1, r: 0 }, r.z + 3 + up, 22 + (j % 5 === 0 ? 5 : 0), P, 2)} tone={j === lit ? "amber" : "paper"} />;
            })}
            <Solid p={slabOf({ x: 135.5, y: 108, w: 2.5, d: r.pull + 2, r: 0 }, r.z, 24, P, 2)} />
            <Solid p={slabOf({ x: 8, y: front, w: 134, d: 5, r: 2 }, r.z - 1, FH + 1, P, 3, 0.6)} tone={r.tone} />
            <Solid p={slabOf({ x: 66, y: front + 5, w: 26, d: 3, r: 1.5 }, r.z + 5, 4, P, 3)} tone="ink" />
            <Text m={sideMatrix([16, front + 5], r.z + FH - 5, P, "left")} size={8.5} className="mc-text-on mc-text-big">
              {r.label}
            </Text>
            <Text m={sideMatrix([16, front + 5], r.z + FH - 15, P, "left")} size={6} className="mc-text-on">
              @{r.sha}
            </Text>
            <Text m={sideMatrix([136, front + 5], r.z + 12, P, "left")} size={11} anchor="end" className="mc-text-on mc-text-big">
              {r.evidence}
            </Text>
          </g>
        );
      })}
    </svg>
  );
}

/* ======================= 2 · the patch panel: every cable is an edge with a line ======================= */

const NAME_HUE: Record<GraphComponentId, Tone> = {
  "recall-backend:brainly-server": "amber",
  "recall-backend:queue": "glacier",
  "bullmq:content-processing": "violet",
  "recall-backend:shared": "green",
  "recall-backend:worker": "paper",
};

export function PatchPanelFigure({ named, total }: { named: number; total: number }) {
  const BOARD: Plan = { x: 0, y: 0, w: 290, d: 200, r: 8 };
  const JACK: Record<GraphComponentId, readonly [number, number]> = {
    "recall-backend:brainly-server": [48, 150],
    "bullmq:content-processing": [146, 100],
    "recall-backend:worker": [250, 48],
    "recall-backend:queue": [56, 40],
    "recall-backend:shared": [238, 158],
  };
  const PRINTER: Plan = { x: 302, y: 96, w: 54, d: 50, r: 7 };
  const P = fitProjection([...boxCorners({ x: -8, y: -8, w: 368, d: 216, r: 0 }, 0, 56)], 520, 330, { pad: 10 });
  const TOP = 16;
  const jacks = [...GRAPH_COMPONENTS].sort((a, b) => JACK[a.id][0] + JACK[a.id][1] - (JACK[b.id][0] + JACK[b.id][1]));
  const cable = (from: GraphComponentId, to: GraphComponentId) => {
    const [ax, ay] = JACK[from];
    const [bx, by] = JACK[to];
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const [x, y] = iso([ax + (bx - ax) * t, ay + (by - ay) * t, TOP + 10 + Math.sin(Math.PI * t) * 34], P);
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { d: pts.join(""), mid: iso([(ax + bx) / 2, (ay + by) / 2, TOP + 10 + 34], P) };
  };
  const cables = GRAPH_EDGES.map((e) => ({ e, ...cable(e.from, e.to) })).sort((a, b) => a.mid[1] - b.mid[1]);
  return (
    <svg viewBox="0 0 520 330" className="mc-fig" role="img" aria-label={`A patch panel: ${GRAPH_COMPONENTS.length} sockets, one per component, and ${GRAPH_EDGES.length} cables, one per edge, each tagged with the file and line that proves it. Beside it a label printer, Nemotron Nano, prints ${named} of the ${total} name strips and touches no cable.`}>
      <Halo plan={BOARD} P={P} />
      {[
        [10, 10],
        [280, 10],
        [280, 190],
        [10, 190],
      ].map(([x, y]) => (
        <Solid key={`${x}${y}`} p={cylinder(x!, y!, 6, 0, 6, P, 20)} tone="ink" />
      ))}
      <Solid p={slabOf(BOARD, 6, 10, P, 6, 1)} />
      <path d={planOutline(insetPlan(BOARD, 7), TOP, P, 6)} className="mc-faint" />
      <Text m={sideMatrix([12, 200], 13.5, P, "left")} size={5.6}>
        NO MODEL · EVERY CABLE CITES A LINE
      </Text>
      {/* sockets and their name strips, back to front */}
      {jacks.map((c) => {
        const [x, y] = JACK[c.id];
        const tone = c.model ? NAME_HUE[c.id] : "paper";
        const w = 40;
        return (
          <g key={c.id}>
            <Solid p={slabOf({ x: x - 6, y: y + 12, w, d: 12, r: 1.5 }, TOP, 1, P, 2)} tone={tone} className="mc-print" />
            <Solid p={cylinder(x, y, 10, TOP, 7, P, 28, 0.6)} tone="ink" />
            <Solid p={cylinder(x, y, 5.5, TOP + 7, 3, P, 24)} />
            <circle cx={iso([x, y, TOP + 10], P)[0]} cy={iso([x, y, TOP + 10], P)[1]} r={2} className="mc-hole" />
          </g>
        );
      })}
      {/* the label printer: the one model call, off the board */}
      <g className="mc-lit-group">
        <Halo plan={PRINTER} P={P} />
        <Solid p={slabOf(PRINTER, 0, 34, P, 5, 1)} tone="nvidia" />
        <path d={lineOnTop([PRINTER.x + 10, PRINTER.y + 40], [PRINTER.x + 52, PRINTER.y + 40], 34, P)} className="mc-ink-thick" />
        <Solid p={slabOf({ x: PRINTER.x + 14, y: PRINTER.y + 41, w: 34, d: 26, r: 1 }, 34, 0.7, P, 2)} tone="green" className="mc-feed" />
        <Text m={sideMatrix([PRINTER.x + 62, PRINTER.y + 6], 26, P, "right")} size={5.6} className="mc-text-on">
          NEMOTRON NANO
        </Text>
        <Text m={sideMatrix([PRINTER.x + 62, PRINTER.y + 6], 16, P, "right")} size={4.6} className="mc-text-on">
          names only · {named} of {total}
        </Text>
      </g>
      <path d={`M${iso([PRINTER.x, PRINTER.y + 25, 20], P).join(" ")} L${iso([290, PRINTER.y + 25, TOP], P).join(" ")}`} className="mc-dash" />
      {/* the cables, nearest last, each with its evidence tag */}
      {cables.map(({ e, d }, k) => (
        <g key={e.id} className="mc-cable" data-kind={e.kind} style={{ "--i": k } as React.CSSProperties}>
          <path d={d} className="mc-cable-ink" pathLength={1} />
          <path d={d} className="mc-cable-core" pathLength={1} />
        </g>
      ))}
      {/* each socket's name, as printed (green: written by Nemotron Nano; white: set in Recall's config) */}
      {jacks.map((c, k) => {
        const [x, y] = JACK[c.id];
        const p = iso([x + 14, y + 18, TOP + 1], P);
        return (
          <g key={c.id} className="mc-pop" style={{ "--i": k } as React.CSSProperties}>
            <NameTag at={[p[0], p[1] + 12]} text={c.name} model={c.model} />
          </g>
        );
      })}
      {cables.map(({ e, mid }, k) => (
        <g key={e.id} className="mc-pop" style={{ "--i": k + 4 } as React.CSSProperties}>
          <Tag at={mid} text={`${e.file}:${e.line}`} size={8.5} lit={e.kind !== "imports"} />
        </g>
      ))}
    </svg>
  );
}

/* ======================= 3 · the coin tubes: cents per pull request ======================= */

export interface CostTube {
  model: string;
  median: string;
  max: string;
  tone: "violet" | "green";
}

export function CoinTubesFigure({ tubes, label }: { tubes: readonly CostTube[]; label: string }) {
  const cents = (cell: string) => Number.parseFloat(cell.replace("$", "")) * 100;
  const PITCH = 2.6;
  const top = Math.ceil(Math.max(...tubes.map((t) => cents(t.max))) / 5) * 5;
  const FLOOR = 14;
  const H = top * PITCH + 8;
  const BASE: Plan = { x: 0, y: 0, w: 230, d: 64, r: 8 };
  const xs = [82, 168];
  const R = 22;
  // seen from the front and only a little above, so the fill levels line up against one scale
  const P = fitProjection([...boxCorners(BASE, 0, FLOOR + H)], 520, 440, { pad: 34, azimuth: 90, elevation: 12 });
  P.origin = [P.origin[0] + 14, P.origin[1] - 24];
  const zOf = (c: number) => FLOOR + 2 + c * PITCH;
  const screenY = (c: number) => iso([0, BASE.d, zOf(c)], P)[1];
  const left = iso([BASE.x, BASE.d, 0], P)[0];
  const right = iso([BASE.x + BASE.w, BASE.d, 0], P)[0];
  const below = iso([0, BASE.d, 0], P)[1];
  return (
    <svg viewBox="0 0 520 440" className="mc-fig" role="img" aria-label={label}>
      {/* the scale: a line every cent, a number every five, across the whole bench */}
      {Array.from({ length: top + 1 }, (_, c) => (
        <g key={c}>
          <path d={`M${left - (c % 5 ? 6 : 12)} ${screenY(c)} H${left - 2}`} className="mc-tick" />
          {c % 5 === 0 && (
            <>
              <path d={`M${left} ${screenY(c)} H${right}`} className="mc-guide" />
              <text x={left - 16} y={screenY(c) + 4} textAnchor="end" className="mc-scale">
                {c}¢
              </text>
            </>
          )}
        </g>
      ))}
      <Halo plan={BASE} P={P} />
      <Solid p={slabOf(BASE, 0, FLOOR - 2, P, 6, 1)} tone="ink" />
      <Text m={sideMatrix([12, BASE.d], 8, P, "left")} size={5.6} className="mc-text-on">
        ¢ PER PULL REQUEST · PIPELINE ONLY · ONE COIN = ONE CENT
      </Text>
      {tubes.map((t, k) => {
        const cx = xs[k]!;
        const cy = BASE.d / 2;
        const tube = cylinder(cx, cy, R, FLOOR, H, P, 56);
        const coins = Math.round(cents(t.median));
        const yMax = screenY(cents(t.max));
        const tubeL = iso([cx - R, cy, 0], P)[0];
        const tubeR = iso([cx + R, cy, 0], P)[0];
        return (
          <g key={t.model}>
            <Solid p={cylinder(cx, cy, R + 5, FLOOR - 2, 3, P, 48, 0.6)} />
            <path d={tube.top} className="mc-glass-rim" />
            {Array.from({ length: coins }, (_, j) => (
              <Solid key={j} p={cylinder(cx, cy, R - 3, FLOOR + 2 + j * PITCH, PITCH - 0.5, P, 48)} tone="amber" className="mc-coin" style={{ "--i": j + k * 3 } as React.CSSProperties} />
            ))}
            <path d={tube.fill} className="mc-glass" />
            <path d={tube.outline} className="mc-ink" />
            {/* the costliest pull request: a red band across the tube at its level */}
            <path d={`M${tubeL} ${yMax} H${tubeR}`} className="mc-max" />
            <Tag at={[k ? tubeR + 46 : tubeL - 46, yMax]} text={`max ${t.max}`} size={10} />
            <text x={(tubeL + tubeR) / 2} y={below + 26} textAnchor="middle" className="mc-cap">
              {t.model}
            </text>
            <text x={(tubeL + tubeR) / 2} y={below + 43} textAnchor="middle" className="mc-cap-sub">
              median {t.median}
            </text>
            <text x={(tubeL + tubeR) / 2} y={below + 58} textAnchor="middle" className="mc-cap-sub">
              {coins} coins
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ======================= 4 · the glovebox: the sandbox the repair agent works in ======================= */

export function GloveboxFigure() {
  const BASE: Plan = { x: 0, y: 0, w: 200, d: 116, r: 6 };
  const GLASS: Plan = { x: 6, y: 6, w: 188, d: 104, r: 10 };
  const REPO: Plan = { x: 66, y: 30, w: 70, d: 50, r: 5 };
  const P = fitProjection([...boxCorners(BASE, 0, 112), ...boxCorners({ x: 0, y: 0, w: 236, d: 116, r: 0 }, 0, 20)], 520, 400, { pad: 18 });
  const glass = slabOf(GLASS, 42, 68, P, 8);
  const dial = (x: number, label: string, value: number) => {
    const c = iso([x, 116, 22], P);
    const a = -Math.PI * 0.75 + value * Math.PI * 1.5;
    const tip = iso([x + Math.cos(a) * 7, 116, 22 - Math.sin(a) * 7 * -1], P);
    return (
      <g key={label}>
        <path d={sideRing([x, 116.2, 22], 10, "y", P, 32)} className="mc-dial" />
        <path d={sideRing([x, 116.4, 22], 7.5, "y", P, 32)} className="mc-faint" />
        <path d={`M${c[0]} ${c[1]} L${tip[0]} ${tip[1]}`} className="mc-needle" />
        <circle cx={c[0]} cy={c[1]} r={1.4} className="mc-screw" />
        <Text m={sideMatrix([x - 10, 116], 9, P, "left")} size={5}>
          {label}
        </Text>
      </g>
    );
  };
  const plug = (z: number) => iso([226, 70, z], P);
  return (
    <svg viewBox="0 0 520 400" className="mc-fig" role="img" aria-label="A sealed glovebox: the repo sits inside under glass, worked on through the glove ports; the network switch on its side is thrown to off and the cable hangs unplugged; plates read uid 1000, capabilities dropped, and dials 2 CPUs, 2 GB, 512 pids.">
      <Halo plan={BASE} P={P} />
      <Solid p={slabOf(BASE, 0, 42, P, 6, 1)} />
      <path d={planOutline(insetPlan(BASE, 3), 42, P, 6)} className="mc-faint" />
      {/* the plates and dials on the front */}
      <path d={`M${[iso([12, 116, 37], P), iso([92, 116, 37], P), iso([92, 116, 27], P), iso([12, 116, 27], P)].map((p) => p.join(",")).join("L")}Z`} className="mc-plate" />
      <Text m={sideMatrix([16, 116], 34, P, "left")} size={5.4}>
        uid 1000 · capabilities dropped
      </Text>
      {dial(110, "2 CPUs", 0.5)}
      {dial(140, "2 GB", 0.35)}
      {dial(170, "512 pids", 0.62)}
      {/* the network switch on the side, thrown to off, and its cable hanging loose */}
      <path d={`M${[iso([200, 54, 34], P), iso([200, 88, 34], P), iso([200, 88, 12], P), iso([200, 54, 12], P)].map((p) => p.join(",")).join("L")}Z`} className="mc-plate" />
      <Text m={sideMatrix([200, 58], 31, P, "right")} size={4.8}>
        NETWORK
      </Text>
      <path d={segment([200, 64, 22], [212, 64, 30], P)} className="mc-lever" />
      <circle cx={iso([212, 64, 30], P)[0]} cy={iso([212, 64, 30], P)[1]} r={2.6} className="mc-lever-knob" />
      <Text m={sideMatrix([200, 72], 24, P, "right")} size={6} className="mc-text-red">
        OFF
      </Text>
      <path d={sideRing([200.2, 82, 18], 3.2, "x", P, 20)} className="mc-cavity" />
      <path d={`M${plug(18).join(" ")} C${iso([238, 70, 4], P).join(" ")}, ${iso([238, 92, 0], P).join(" ")}, ${iso([250, 100, 0], P).join(" ")}`} className="mc-cable-loose" />
      <Solid p={slabOf({ x: 218, y: 66, w: 9, d: 8, r: 1 }, 14, 8, P, 2)} tone="ink" />
      {/* the repo inside, under the glass: the one lit part */}
      <Solid p={slabOf(REPO, 42, 16, P, 5, 0.8)} tone="glacier" />
      {[10, 18, 26, 34, 42].map((y, i) => (
        <path key={y} d={lineOnTop([REPO.x + 10, REPO.y + y], [REPO.x + 10 + [44, 30, 50, 22, 38][i]!, REPO.y + y], 58, P)} className="mc-code" />
      ))}
      {/* the glass, then the glove ports on its front */}
      <path d={glass.fill} className="mc-glass" />
      <path d={glass.top} className="mc-glass-top" />
      <path d={glass.crease} className="mc-crease" />
      <path d={glass.outline} className="mc-ink" />
      {[44, 156].map((x) => (
        <g key={x}>
          <path d={sideRing([x, 110, 82], 12, "y", P, 36)} className="mc-port" />
          <path d={sideRing([x, 110.3, 82], 8.5, "y", P, 36)} className="mc-port-in" />
        </g>
      ))}
      <Text m={sideMatrix([194, 104], 102, P, "right")} size={5.4}>
        SEALED · NO MOUNTS · NO DOCKER SOCKET
      </Text>
    </svg>
  );
}
