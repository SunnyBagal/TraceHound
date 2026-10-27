import { FINDER_RULE } from "@/lib/landing";

/**
 * One idea: a claim only counts once the harness's own tests turn from failing to passing.
 * One token runs the track; each station shows a single big result:
 *   find      a rule over the graph asks one narrow question (no model);
 *   reproduce Nemotron writes one test; it fails twice, on an assertion, in the same cases: ✗ ✗;
 *   repair    Nemotron patches the repo in a Docker sandbox with the network off;
 *   verify    the harness, not the agent, runs the test, the suite and the typecheck: ✓ ✓ ✓.
 * Two drawings, wide (lg and up) and narrow (vertical); timed by --t / --d (.lp-anim).
 */

export const PIPELINE_BEATS = [0, 1460, 2720, 3980] as const;
const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;

const STAGES = [
  { name: "find", model: "no model", glyph: "?", hue: "var(--accent)" },
  { name: "reproduce", model: "Nemotron", glyph: "✗", hue: "var(--diff-removed)" },
  { name: "repair", model: "Nemotron", glyph: "±", hue: "var(--highlight)" },
  { name: "verify", model: "no model", glyph: "✓", hue: "var(--diff-added)" },
] as const;
const CHECKS = ["reproduction test", "existing tests", "typecheck"] as const;

/** the finder's question in lines of at most `max` characters */
const wrap = (text: string, max: number) =>
  text.split(" ").reduce<string[]>((lines, word) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);

/** One station's card, its top-left at (x, y), w wide. */
function Card({ i, x, y, w, h, wide }: { i: number; x: number; y: number; w: number; h: number; wide: boolean }) {
  const cx = x + w / 2;
  const t = PIPELINE_BEATS[i]! + 120;
  const body = (() => {
    switch (i) {
      case 0:
        return (
          <>
            <rect x={x + 14} y={y + 14} width={FINDER_RULE.id.length * 6.9 + 18} height={22} rx={11} fill="var(--accent-soft)" stroke="var(--accent)" />
            <text x={x + 23} y={y + 29} className="mono" fontSize={11.5} style={{ fill: "var(--accent)" }}>
              {FINDER_RULE.id}
            </text>
            <text x={x + 14} y={y + 58} fontSize={12.5} style={{ fill: "var(--text)" }}>
              {wrap(FINDER_RULE.question, wide ? 27 : 40).map((line, k) => (
                <tspan key={k} x={x + 14} dy={k ? 17 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          </>
        );
      case 1:
        return (
          <>
            {[0, 1].map((k) => (
              <g key={k} data-anim="pop" style={at(t + 250 + k * 350, 420)}>
                <text x={cx + (k ? 26 : -26)} y={y + (wide ? 66 : 56)} textAnchor="middle" fontSize={wide ? 40 : 34} fontWeight={700} style={{ fill: "var(--diff-removed)" }}>
                  ✗
                </text>
                <text x={cx + (k ? 26 : -26)} y={y + (wide ? 88 : 76)} textAnchor="middle" className="mono" fontSize={10.5} style={{ fill: "var(--faint)" }}>
                  run {k + 1}
                </text>
              </g>
            ))}
            <g data-anim="in" style={at(t + 1000, 400)}>
              <text x={cx} y={y + (wide ? 112 : 96)} textAnchor="middle" className="mono" fontSize={11} style={{ fill: "var(--muted)" }}>
                AssertionError · same cases
              </text>
              <rect x={cx - 52} y={y + h - 34} width={104} height={22} rx={11} fill="var(--diff-removed)" />
              <text x={cx} y={y + h - 19} textAnchor="middle" className="mono" fontSize={11} fontWeight={700} style={{ fill: "var(--ink)" }}>
                REPRODUCED
              </text>
            </g>
          </>
        );
      case 2:
        return (
          <>
            {[0.62, 0.45, 0.8, 0.58, 0.7].map((len, k) => {
              const minus = k < 2;
              const by = y + 20 + k * 16;
              return (
                <g key={k} data-anim="in" style={at(t + 150 + k * 110, 320)}>
                  <text x={x + 18} y={by + 9} className="mono" fontSize={12} fontWeight={700} style={{ fill: minus ? "var(--diff-removed)" : "var(--diff-added)" }}>
                    {minus ? "−" : "+"}
                  </text>
                  <rect x={x + 34} y={by} width={(w - 56) * len} height={9} rx={4.5} fill={minus ? "var(--diff-removed)" : "var(--diff-added)"} opacity={0.75} />
                </g>
              );
            })}
            <g data-anim="in" style={at(t + 800, 400)}>
              <rect x={cx - 70} y={y + h - 34} width={140} height={22} rx={11} fill="none" stroke="var(--line-strong)" />
              <text x={cx} y={y + h - 19} textAnchor="middle" className="mono" fontSize={11} style={{ fill: "var(--muted)" }}>
                Docker · network off
              </text>
            </g>
          </>
        );
      default:
        return (
          <>
            {CHECKS.map((c, k) => (
              <g key={c} data-anim="in" style={at(t + 150 + k * 220, 360)} data-testid="verify-check">
                <text x={x + 18} y={y + 30 + k * 22} fontSize={14} fontWeight={700} style={{ fill: "var(--diff-added)" }}>
                  ✓
                </text>
                <text x={x + 38} y={y + 30 + k * 22} className="mono" fontSize={12} style={{ fill: "var(--text)" }}>
                  {c}
                </text>
              </g>
            ))}
            <g data-anim="pop" style={at(t + 900, 520)}>
              <rect x={cx - (wide ? 52 : 92)} y={y + h - 36} width={wide ? 104 : 184} height={26} rx={13} fill="var(--diff-added)" className="pl-glow" />
              <text x={cx} y={y + h - 19} textAnchor="middle" className="mono" fontSize={12} fontWeight={700} style={{ fill: "var(--ink)" }} data-testid="test-passes">
                {wide ? "RESOLVED" : "RESOLVED · test passes"}
              </text>
            </g>
          </>
        );
    }
  })();
  return (
    <g data-anim="in" style={at(PIPELINE_BEATS[i]!, 420)}>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="var(--card)" stroke="var(--panel-line)" />
      {body}
    </g>
  );
}

function Station({ i, x, y, wide }: { i: number; x: number; y: number; wide: boolean }) {
  const s = STAGES[i]!;
  const t = PIPELINE_BEATS[i]!;
  return (
    <g data-testid="pipeline-stage">
      {wide ? (
        <>
          <text x={x} y={y + 50} textAnchor="middle" fontSize={17} fontWeight={600} style={{ fill: "var(--text)" }}>
            {s.name}
          </text>
          <text x={x} y={y + 68} textAnchor="middle" className="mono" fontSize={11} style={{ fill: "var(--faint)" }}>
            {s.model}
          </text>
        </>
      ) : (
        <>
          <text x={x + 30} y={y + 6} fontSize={16} fontWeight={600} style={{ fill: "var(--text)" }}>
            {s.name}
          </text>
          <text x={344} y={y + 6} textAnchor="end" className="mono" fontSize={10.5} style={{ fill: "var(--faint)" }}>
            {s.model}
          </text>
        </>
      )}
      <circle cx={x} cy={y} r={17} style={{ ...at(t, 500), fill: "var(--card)", stroke: s.hue }} strokeWidth={1.5} data-anim="light" />
      <text x={x} y={y + 5.5} textAnchor="middle" fontSize={16} fontWeight={700} style={{ ...at(t, 400), fill: s.hue }} data-anim="fade">
        {s.glyph}
      </text>
    </g>
  );
}

function Drawing({ wide }: { wide: boolean }) {
  const W = wide ? 1000 : 360;
  const H = wide ? 336 : 790;
  const xs = [125, 375, 625, 875];
  const ys = [40, 230, 420, 610];
  const pos = (i: number) => (wide ? { x: xs[i]!, y: 40 } : { x: 34, y: ys[i]! });
  const track = wide ? `M${xs[0]} 40 H${xs[3]}` : `M34 ${ys[0]} V${ys[3]}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id={`pl-grad-${wide ? "w" : "n"}`} gradientUnits="userSpaceOnUse" x1={wide ? xs[0] : 0} y1={wide ? 0 : ys[0]} x2={wide ? xs[3] : 0} y2={wide ? 0 : ys[3]}>
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="0.4" stopColor="var(--diff-removed)" />
          <stop offset="0.7" stopColor="var(--highlight)" />
          <stop offset="1" stopColor="var(--diff-added)" />
        </linearGradient>
      </defs>
      <path d={track} stroke="var(--line-strong)" strokeWidth={2} fill="none" />
      <path d={track} stroke={`url(#pl-grad-${wide ? "w" : "n"})`} strokeWidth={2.5} fill="none" className="lp-path" pathLength={1} data-anim="draw" style={at(200, 3800)} />
      {STAGES.map((_, i) => {
        const { x, y } = pos(i);
        return wide ? <Card key={i} i={i} x={x - 110} y={y + 92} w={220} h={196} wide /> : <Card key={i} i={i} x={64} y={y + 24} w={280} h={150} wide={false} />;
      })}
      {STAGES.map((_, i) => {
        const { x, y } = pos(i);
        return <Station key={i} i={i} x={x} y={y} wide={wide} />;
      })}
      {/* the claim: one token that runs the track, stopping at each station */}
      <circle
        cx={wide ? xs[3] : 34}
        cy={wide ? 40 : ys[3]}
        r={7}
        className="pl-token lp-gone"
        data-anim={wide ? "travel-x" : "travel-y"}
        style={{ ...at(200, 4000), "--run": `${wide ? xs[0]! - xs[3]! : ys[0]! - ys[3]!}px` } as React.CSSProperties}
      />
    </svg>
  );
}

export function PipelineWide() {
  return <Drawing wide />;
}
export function Pipeline() {
  return <Drawing wide={false} />;
}
