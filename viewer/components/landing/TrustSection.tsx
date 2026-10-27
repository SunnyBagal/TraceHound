import { Check } from "lucide-react";
import { table } from "@/lib/benchmark-view";
import { ANALYZE_RUNS, DEMO, fmt } from "@/lib/landing";
import { WOLF_PATH, WOLF_VIEWBOX } from "@/lib/wolf";
import { Reveal } from "./Reveal";

/*
 * The light "trust" section (viteplus's isometric stat grid, TraceHound's own drawings). Counts are
 * lib/landing.ts's (checked against the snapshots by test/landing.test.tsx); costs are cells of the
 * benchmark's cost table, found by title.
 */

/* ---------- isometric geometry: a square slab of side s, centred at (cx, cy), h tall ---------- */
const COS = 0.866;
type Pt = readonly [number, number];
const path = (pts: Pt[]) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`;
function slab(cx: number, cy: number, s: number, h: number) {
  const N: Pt = [cx, cy - s / 2], E: Pt = [cx + COS * s, cy], S: Pt = [cx, cy + s / 2], W: Pt = [cx - COS * s, cy];
  const down = (p: Pt): Pt => [p[0], p[1] + h];
  return { top: path([N, E, S, W]), left: path([W, S, down(S), down(W)]), right: path([S, E, down(E), down(S)]), N, E, S, W };
}
/** maps (x, y) onto a slab's top face at (cx, cy): x runs up and to the right, y down and to the right */
const onTop = (cx: number, cy: number, k = 1) => `matrix(${COS * k} ${-0.5 * k} ${COS * k} ${0.5 * k} ${cx} ${cy})`;

function Slab({ cx, cy, s, h, tone, id, children, top = "#fff" }: { cx: number; cy: number; s: number; h: number; tone: string; id: string; children?: React.ReactNode; top?: string }) {
  const g = slab(cx, cy, s, h);
  return (
    <g strokeLinejoin="round">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`var(--${tone}-1)`} />
          <stop offset="0.55" stopColor={`var(--${tone}-2)`} />
          <stop offset="1" stopColor={`var(--${tone}-1)`} />
        </linearGradient>
      </defs>
      <path d={g.left} fill={`url(#${id})`} stroke="var(--iso-ink)" strokeWidth="1.2" />
      <path d={g.right} fill={`url(#${id})`} stroke="var(--iso-ink)" strokeWidth="1.2" opacity="0.82" />
      <path d={g.top} fill={top} stroke="var(--iso-ink)" strokeWidth="1.2" />
      {children}
    </g>
  );
}

/** a small repo tile: its name written across the top face */
function RepoTile({ label, tone }: { label: string; tone: string }) {
  return (
    <svg viewBox="0 0 120 84" className="trust-tile" aria-hidden>
      <Slab cx={60} cy={36} s={58} h={12} tone={tone} id={`tile-${label}`}>
        <text transform={onTop(60, 36)} textAnchor="middle" dominantBaseline="middle" className="iso-label">
          {label}
        </text>
      </Slab>
    </svg>
  );
}

const RECALL = ANALYZE_RUNS[0];
const CEX = ANALYZE_RUNS[1];
const REPOS = [
  { label: "RECALL", tone: "amber", name: `@${RECALL.short}`, components: RECALL.components, edges: RECALL.edges, evidence: RECALL.evidence },
  { label: "CEX", tone: "violet", name: `@${CEX.short}`, components: CEX.components, edges: CEX.edges, evidence: CEX.evidence },
  { label: "DEMO", tone: "glacier", name: `@${DEMO.short}`, components: DEMO.components, edges: DEMO.edges, evidence: DEMO.evidence },
] as const;

/* the cost table: the two models' rows (3 Super, 3.5 Super), median and max per pull request */
const COST = table("Dev cost per pull request");
const at = (row: readonly string[], h: string) => row[(COST.headers as readonly string[]).indexOf(h)]!;
const COSTS = COST.rows.slice(0, 2).map((r) => ({ model: r[0].split(" (")[0]!, median: at(r, "cost median"), max: at(r, "cost max"), n: at(r, "n") }));
const usd = (cell: string) => Number.parseFloat(cell.replace("$", ""));
const PRODUCT = COSTS.find((c) => c.model.startsWith("3.5"))!;

/** files → facts → graph, a staircase; the one model call sits apart and reaches the names only */
function StackFigure() {
  const plates = [
    { cx: 100, cy: 236, tone: "glacier", title: `${RECALL.files} files`, sub: "source, ts-morph" },
    { cx: 270, cy: 176, tone: "violet", title: `${RECALL.evidence} evidence`, sub: "file · symbol · lines" },
    { cx: 440, cy: 116, tone: "amber", title: `${RECALL.components} components`, sub: `${RECALL.edges} edges, each cited` },
  ] as const;
  const s = 70;
  const h = 18;
  return (
    <svg viewBox="0 0 560 330" className="trust-figure" role="img" aria-label={`Recall at ${RECALL.short}: ${RECALL.files} files, ${RECALL.evidence} evidence, ${RECALL.components} components and ${RECALL.edges} edges, with no model; Nemotron Nano names ${RECALL.named} of the ${RECALL.components} components.`}>
      {plates.map((p, i) => (
        <g key={p.title} className="iso-drop" style={{ "--i": i } as React.CSSProperties}>
          {i > 0 && <path d={`M${plates[i - 1]!.cx + COS * s + 6} ${plates[i - 1]!.cy - 4} L${p.cx - COS * s - 6} ${p.cy + 4}`} stroke="var(--iso-line)" strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />}
          <Slab cx={p.cx} cy={p.cy} s={s} h={h} tone={p.tone} id={`stack-${i}`}>
            {i === 0 && <g transform={onTop(p.cx, p.cy, 0.62)} stroke="var(--iso-ink)" strokeWidth="1.6" strokeLinecap="round">{[-30, -18, -6, 6, 18, 30].map((y, k) => <path key={y} d={`M-40 ${y} H${12 + ((k * 13) % 28)}`} />)}</g>}
            {i === 1 && <g transform={onTop(p.cx, p.cy, 0.62)} fill="var(--iso-ink)">{Array.from({ length: 25 }, (_, k) => <circle key={k} cx={-36 + (k % 5) * 18} cy={-36 + Math.floor(k / 5) * 18} r="2.6" />)}</g>}
            {i === 2 && (
              // Recall's graph on the top face: five components, six edges
              <g transform={onTop(p.cx, p.cy, 0.62)} stroke="var(--iso-ink)" strokeWidth="1.6" fill="#fff">
                <path d="M-34 0 L0 -28 M-34 0 L0 0 M0 0 L34 0 M-34 0 L0 28 M34 0 L0 -28 M34 0 L0 28" fill="none" />
                {[[-34, 0], [0, -28], [0, 0], [0, 28], [34, 0]].map(([x, y]) => <rect key={`${x},${y}`} x={x! - 9} y={y! - 7} width="18" height="14" rx="3.5" />)}
              </g>
            )}
          </Slab>
          <text x={p.cx} y={p.cy + s / 2 + h + 26} textAnchor="middle" className="iso-title">{p.title}</text>
          <text x={p.cx} y={p.cy + s / 2 + h + 45} textAnchor="middle" className="iso-sub">{p.sub}</text>
        </g>
      ))}
      <g className="iso-drop" style={{ "--i": 3 } as React.CSSProperties}>
        <Slab cx={250} cy={44} s={34} h={10} tone="nvidia" id="stack-names">
          <text transform={onTop(250, 44, 0.9)} textAnchor="middle" dominantBaseline="middle" className="iso-label">NAMES</text>
        </Slab>
        <path d="M282 50 C335 58, 385 70, 418 92" stroke="var(--iso-ink)" strokeWidth="1.2" strokeDasharray="3 4" fill="none" />
        <text x="200" y="38" textAnchor="end" className="iso-title">Nemotron Nano</text>
        <text x="200" y="57" textAnchor="end" className="iso-sub">names {RECALL.named} of {RECALL.components}, from facts</text>
      </g>
    </svg>
  );
}

/** cost per pull request: dashed box = the worst pull request, filled part = the median */
function CostFigure() {
  const scale = 150 / Math.max(...COSTS.map((c) => usd(c.max)));
  const cols = [
    { cx: 286, tone: "violet" },
    { cx: 466, tone: "green" },
  ] as const;
  return (
    <svg viewBox="0 0 560 340" className="trust-figure" role="img" aria-label={COSTS.map((c) => `${c.model}: median ${c.median}, max ${c.max} per pull request`).join("; ")}>
      {/* the reviewer, linked to both runs */}
      <g className="iso-drop" style={{ "--i": 0 } as React.CSSProperties}>
        <Slab cx={84} cy={214} s={58} h={16} tone="amber" id="cost-th">
          <g transform={`${onTop(84, 214, 1)} translate(-20 -20)`}>
            <svg viewBox={WOLF_VIEWBOX} width="40" height="40" overflow="visible"><path d={WOLF_PATH} fill="var(--iso-ink)" /></svg>
          </g>
        </Slab>
        <text x="84" y="282" textAnchor="middle" className="iso-title">TraceHound</text>
        <path d={`M${84 + COS * 58} 222 H${cols[0].cx - COS * 46}`} stroke="var(--iso-line)" strokeWidth="1.5" />
      </g>
      {COSTS.map((c, i) => {
        const { cx, tone } = cols[i]!;
        const s = 46;
        const max = usd(c.max) * scale;
        const med = Math.max(6, usd(c.median) * scale);
        const base = 222;
        const ghost = slab(cx, base - max, s, max);
        return (
          <g key={c.model} className="iso-drop" style={{ "--i": i + 1 } as React.CSSProperties}>
            <g fill="none" stroke="var(--iso-ink)" strokeWidth="1" strokeDasharray="2 3" opacity="0.55">
              <path d={ghost.top} />
              <path d={ghost.left} />
              <path d={ghost.right} />
            </g>
            <g className="iso-grow" style={{ transformOrigin: `${cx}px ${base + s / 2}px` }}>
              <Slab cx={cx} cy={base - med} s={s} h={med} tone={tone} id={`cost-${i}`} />
            </g>
            <text x={cx} y={base + s / 2 + 30} textAnchor="middle" className="iso-title">{c.model}</text>
            <text x={cx} y={base + s / 2 + 52} textAnchor="middle" className="iso-sub">median {c.median}</text>
            <text x={cx} y={base + s / 2 + 72} textAnchor="middle" className="iso-sub">max {c.max}</text>
          </g>
        );
      })}
    </svg>
  );
}

const GUARDS = [
  "Every edge: file, symbol, line range, extractor, confidence",
  "Repairs run in Docker: uid 1000, caps dropped, network off",
  "Each finding labelled model-generated, not tested",
  "The benchmark's test-set repository is refused, never reviewed",
] as const;

export function TrustSection() {
  return (
    <section aria-labelledby="trust-title" className="trust" data-testid="trust">
      <div className="lp-col trust-frame">
        <header className="trust-head">
          <h2 id="trust-title" className="trust-h2">Built to be checked.</h2>
          <p className="trust-lede">Every count below is read from a file committed in the repo, and a test fails if the page and the file disagree.</p>
        </header>
        <div className="trust-grid">
          <article className="trust-cell">
            <h3 className="trust-h3">Every edge points at code</h3>
            <p className="trust-text">Three published snapshots. No model draws an edge; each one cites the evidence that found it.</p>
            <Reveal className="trust-stats" testId="trust-stats">
              {REPOS.map((r, i) => (
                <div key={r.label} className="trust-row iso-drop" style={{ "--i": i } as React.CSSProperties}>
                  <div className="trust-repo">
                    <RepoTile label={r.label} tone={r.tone} />
                    <span className="trust-sha">{r.name}</span>
                  </div>
                  <div className="trust-stat">
                    <span className="trust-n">{fmt(r.evidence)}</span>
                    <span className="trust-l">evidence</span>
                  </div>
                  <div className="trust-stat">
                    <span className="trust-n">
                      {r.components} / {r.edges}
                    </span>
                    <span className="trust-l">components / edges</span>
                  </div>
                </div>
              ))}
            </Reveal>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">No model draws the graph</h3>
            <p className="trust-text">
              Extraction, grouping and edges are deterministic. <span className="trust-em">The one model call names components</span>, sees facts only, and is logged in the snapshot.
            </p>
            <Reveal className="trust-art">
              <StackFigure />
            </Reveal>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">Cents per pull request</h3>
            <p className="trust-text">
              The reviewer the product runs costs <span className="trust-em">{PRODUCT.median} per pull request</span> at the median on {PRODUCT.model}; the dashed box is the costliest one. Judges excluded, pre-VAT.
            </p>
            <Reveal className="trust-art" testId="trust-cost">
              <CostFigure />
            </Reveal>
            <p className="trust-note">Dev set, {COSTS.map((c) => `${c.model} n = ${c.n}`).join(", ")} · docs/bench/results.md</p>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">Guardrails in code, not in prose</h3>
            <p className="trust-text">What the product rule and the harness enforce, with tests behind each one.</p>
            <Reveal className="trust-guards">
              <ul>
                {GUARDS.map((g, i) => (
                  <li key={g} className="iso-drop" data-lit={i === 1 || undefined} style={{ "--i": i } as React.CSSProperties}>
                    <span className="trust-box" aria-hidden>
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {g}
                  </li>
                ))}
              </ul>
            </Reveal>
          </article>
        </div>
      </div>
    </section>
  );
}
