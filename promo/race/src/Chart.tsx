import { loadFont } from "@remotion/google-fonts/Inter";
import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BUGS, FOOTER, PRS, SUBTITLE, TITLE, TOOLS } from "./data";
import { DRAW_END, DRAW_START, DURATION, LOOP_OUT, MARK_IN, MARK_SOLID } from "./timing";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

const C = {
  page: "#f5f4f0",
  card: "#ffffff",
  ink: "#1c1917",
  mute: "#57534e",
  faint: "#a8a29e",
  grid: "#e7e5e4",
};
/** Per tool: line colour and its highlight (Greptile most caught, TraceHound fewest; CodeRabbit neutral). */
const STYLE: Record<string, { line: string; band: string; border: string; text: string; width: number }> = {
  greptile: { line: "#16a34a", band: "#ecfdf3", border: "#86efac", text: "#15803d", width: 7 },
  coderabbit: { line: "#78716c", band: "#fafaf9", border: "#e7e5e4", text: C.ink, width: 5 },
  tracehound: { line: "#dc2626", band: "#fef2f2", border: "#fca5a5", text: "#dc2626", width: 7 },
};

// Card and plot geometry (px).
const CARD = { left: 70, top: 50, right: 1850, bottom: 900 };
const PX0 = 250; // x of PR 0
const PX1 = 1240; // x of PR 29
const PY0 = 800; // y of 0 bugs
const PY20 = 330; // y of 20 bugs
const yAt = (bugs: number) => PY0 - (bugs / BUGS) * (PY0 - PY20);
const LABEL_X = 1330;
const LABEL_W = 470;
const LABEL_H = 112;
const LABEL_Y = [400, 548, 696]; // top of each tool's label card

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.25, 1);

const Logo = ({ id, size, color }: { id: string; size: number; color: string }) => (
  <div
    style={{
      width: size,
      height: size,
      flex: "none",
      backgroundColor: color,
      maskImage: `url(${staticFile(`${id}.svg`)})`,
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
      WebkitMaskImage: `url(${staticFile(`${id}.svg`)})`,
      WebkitMaskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
    }}
  />
);

export const Chart = () => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [DRAW_START, DRAW_END], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(f, [LOOP_OUT, DURATION], [1, 0], clamp); // fade back to the empty chart for the loop
  const mark = interpolate(f, [MARK_IN, MARK_SOLID], [0, 1], clamp) * out;
  const lines = out;
  const headX = PX0 + draw * (PX1 - PX0);

  return (
    <AbsoluteFill style={{ background: C.page, fontFamily, color: C.ink }}>
      {/* Card with the gradient border, as on the /benchmark page. */}
      <div
        style={{
          position: "absolute",
          left: CARD.left,
          top: CARD.top,
          width: CARD.right - CARD.left,
          height: CARD.bottom - CARD.top,
          borderRadius: 22,
          padding: 3,
          background: "linear-gradient(135deg, #3b82f6, #2dd4bf 55%, #4ade80)",
          boxShadow: "0 18px 50px rgba(28,25,23,0.10)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 19, background: C.card }} />
      </div>

      <div style={{ position: "absolute", left: 140, top: 100, fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>{TITLE}</div>
      <div style={{ position: "absolute", left: 140, top: 186, fontSize: 34, fontWeight: 500, color: C.mute }}>{SUBTITLE}</div>
      <div style={{ position: "absolute", right: 140, top: 118, fontSize: 32, fontWeight: 500, color: C.mute }}>n = {BUGS} bugs</div>

      {/* Axes and grid. */}
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {[0, 5, 10, 15, 20].map((v) => (
          <g key={v}>
            <line x1={PX0} x2={PX1} y1={yAt(v)} y2={yAt(v)} stroke={v === 0 ? C.faint : C.grid} strokeWidth={2} strokeDasharray={v === BUGS ? "10 8" : undefined} />
            <text x={PX0 - 24} y={yAt(v) + 11} textAnchor="end" fontSize={30} fill={C.faint} fontFamily={fontFamily}>
              {v}
            </text>
          </g>
        ))}
        <text x={PX1} y={yAt(BUGS) - 16} textAnchor="end" fontSize={28} fontWeight={600} fill={C.faint} fontFamily={fontFamily}>
          all {BUGS} bugs
        </text>
        <text x={PX0} y={PY0 + 48} textAnchor="middle" fontSize={28} fill={C.faint} fontFamily={fontFamily}>
          0
        </text>
        <text x={PX1} y={PY0 + 48} textAnchor="middle" fontSize={28} fill={C.faint} fontFamily={fontFamily}>
          {PRS}
        </text>
        <text x={(PX0 + PX1) / 2} y={PY0 + 48} textAnchor="middle" fontSize={28} fill={C.faint} fontFamily={fontFamily}>
          PRs reviewed →
        </text>

        {/* The lines: straight from 0 to each total (totals only, no per-PR order). */}
        {TOOLS.map((t) => {
          const s = STYLE[t.id];
          const y = yAt(draw * t.caught);
          return (
            <g key={t.id} opacity={lines}>
              <line x1={PX0} y1={PY0} x2={headX} y2={y} stroke={s.line} strokeWidth={s.width} strokeLinecap="round" />
              <circle cx={headX} cy={y} r={11} fill={s.line} stroke="#fff" strokeWidth={4} />
            </g>
          );
        })}

        {/* Connectors from each line's end to its label card, drawn once the lines arrive. */}
        {TOOLS.map((t, i) => (
          <line
            key={t.id}
            x1={PX1 + 16}
            y1={yAt(t.caught)}
            x2={LABEL_X - 8}
            y2={LABEL_Y[i] + LABEL_H / 2}
            stroke={STYLE[t.id].line}
            strokeWidth={2}
            strokeDasharray="6 6"
            opacity={mark * 0.8}
          />
        ))}
      </svg>

      {/* Label cards: logo, name, live count; highlight bands for most and fewest caught. */}
      {TOOLS.map((t, i) => {
        const s = STYLE[t.id];
        const live = Math.round(draw * t.caught);
        const highlighted = t.tag !== null;
        const card: CSSProperties = {
          position: "absolute",
          left: LABEL_X,
          top: LABEL_Y[i],
          width: LABEL_W,
          height: LABEL_H,
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 28px",
          boxSizing: "border-box",
          background: highlighted ? `color-mix(in srgb, ${s.band} ${mark * 100}%, #ffffff)` : "#ffffff",
          border: `2px solid ${highlighted ? `color-mix(in srgb, ${s.border} ${mark * 100}%, ${C.grid})` : C.grid}`,
          opacity: interpolate(f, [DRAW_START - 12, DRAW_START], [0.55, 1], clamp) * (0.55 + 0.45 * out),
        };
        return (
          <div key={t.id} style={card}>
            <Logo id={t.id} size={54} color={t.id === "tracehound" ? s.line : C.ink} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <div style={{ fontSize: 40, fontWeight: 600, color: t.id === "tracehound" ? s.text : C.ink }}>{t.name}</div>
              {t.tag ? (
                <div style={{ fontSize: 30, fontWeight: 600, color: s.text, opacity: mark }}>{t.tag}</div>
              ) : null}
            </div>
            <div style={{ fontSize: 64, fontWeight: 700, color: s.text, fontVariantNumeric: "tabular-nums" }}>{live}</div>
          </div>
        );
      })}

      {/* Footer under the card. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 928, textAlign: "center", fontSize: 36, lineHeight: 1.35, fontWeight: 500, color: C.mute }}>
        {FOOTER.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
