import { loadFont } from "@remotion/google-fonts/Inter";
import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BUGS, FOOTER, NOBODY, RACERS, SCORE_HEADING, TITLE } from "./data";
import { LOGOS } from "./logos.generated";
import { LOOP_OUT, NOBODY_SOLID, RACE_END, RESET, SCORE_IN, SCORE_SOLID, TICK, TITLE_END, tickStart } from "./timing";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

const C = {
  bg: "#121214",
  tile: "#2a2a2e",
  text: "#e4e4e7",
  dim: "#a1a1aa",
  faint: "rgba(255,255,255,0.10)",
  blue: "#3b82f6",
  teal: "#2dd4bf",
};
const GRADIENT = `linear-gradient(90deg, ${C.blue}, ${C.teal})`;

// Track geometry (px). A racer's position is the right edge of its tile.
const X0 = 420;
const X20 = 1600;
const LANE_Y = [430, 610, 790];
const TILE_W = 270;
const TILE_H = 92;
const xAt = (pos: number) => X0 + (pos / BUGS) * (X20 - X0);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** Position (0..n) of a racer with n ticks at frame f; each tick eases over TICK frames. */
const position = (f: number, n: number) => {
  let p = 0;
  for (let k = 1; k <= n; k++) p += interpolate(f, [tickStart(k, n), tickStart(k, n) + TICK], [0, 1], { ...clamp, easing: ease });
  return p;
};
/** Live count shown beside the lane: ticks at least half done. */
const count = (f: number, n: number) => {
  let c = 0;
  for (let k = 1; k <= n; k++) if (f >= tickStart(k, n) + TICK / 2) c++;
  return c;
};
/** Glow pulse 0..1 around each tick. */
const pulse = (f: number, n: number) => {
  let g = 0;
  for (let k = 1; k <= n; k++) {
    const s = tickStart(k, n);
    g = Math.max(g, interpolate(f, [s, s + TICK, s + TICK + 12], [0, 1, 0], clamp));
  }
  return g;
};

const RacerTile = ({ id, name, glow }: { id: string; name: string; glow: number }) => {
  const logo = LOGOS[id];
  return (
    <div
      style={{
        width: TILE_W,
        height: TILE_H,
        borderRadius: 22,
        background: C.tile,
        border: `1.5px solid rgba(45,212,191,${0.12 + 0.6 * glow})`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 ${8 + 34 * glow}px rgba(45,212,191,${0.08 + 0.5 * glow})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        color: C.text,
        fontSize: 38,
        fontWeight: 600,
        letterSpacing: -0.5,
      }}
    >
      {logo ? <Img src={staticFile(logo)} style={{ height: 46, width: 46, objectFit: "contain", borderRadius: 10 }} /> : null}
      <span>{name}</span>
    </div>
  );
};

/** The track view. f is the race frame (0 = title state). */
const Track = ({ f }: { f: number }) => {
  const titleOpacity = interpolate(f, [TITLE_END - 6, TITLE_END + 6], [1, 0], clamp);
  const progressOpacity = interpolate(f, [TITLE_END, TITLE_END + 6], [0, 1], clamp);
  const progress = interpolate(f, [TITLE_END, RACE_END], [0, 1], clamp);
  const nobody = interpolate(f, [RACE_END, NOBODY_SOLID], [0, 1], clamp);
  const top = LANE_Y[0] - 110;
  const bottom = LANE_Y[2] + 90;
  return (
    <AbsoluteFill>
      {/* Title card text (frame 0 is the preview frame). */}
      <div style={{ ...centerText, top: 120, fontSize: 62, fontWeight: 700, color: C.text, opacity: titleOpacity }}>{TITLE}</div>

      {/* Progress line across the top: time through the race, not pull requests. */}
      <div style={{ position: "absolute", left: 160, right: 160, top: 150, height: 4, borderRadius: 2, background: C.faint, opacity: progressOpacity }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 2, background: GRADIENT, boxShadow: `0 0 14px rgba(45,212,191,0.6)` }} />
      </div>

      {/* "Nobody finished." */}
      <div style={{ ...centerText, top: 196, fontSize: 64, fontWeight: 700, color: C.text, opacity: nobody }}>{NOBODY}</div>

      {/* Start and finish lines. */}
      <div style={{ position: "absolute", left: X0 - 1, top, height: bottom - top, width: 2, background: "rgba(255,255,255,0.18)" }} />
      <div style={{ position: "absolute", left: X20 - 2, top, height: bottom - top, width: 4, borderRadius: 2, background: "rgba(255,255,255,0.45)" }} />
      <div style={{ position: "absolute", left: X20 - 150, width: 300, top: top - 58, textAlign: "center", fontSize: 40, fontWeight: 600, color: C.dim }}>
        {BUGS} bugs
      </div>

      {RACERS.map((r, i) => {
        const y = LANE_Y[i];
        const p = position(f, r.caught);
        const g = pulse(f, r.caught);
        return (
          <div key={r.id}>
            {/* Faint track and its 20 tick marks. */}
            <div style={{ position: "absolute", left: X0, width: X20 - X0, top: y - 1, height: 2, background: C.faint }} />
            {Array.from({ length: BUGS - 1 }, (_, t) => (
              <div key={t} style={{ position: "absolute", left: xAt(t + 1) - 1, top: y - 12, width: 2, height: 24, background: "rgba(255,255,255,0.16)" }} />
            ))}
            {/* Glowing trail from the start line to the racer. */}
            <div
              style={{
                position: "absolute",
                left: X0,
                width: Math.max(0, xAt(p) - X0),
                top: y - 2.5,
                height: 5,
                borderRadius: 3,
                background: GRADIENT,
                boxShadow: `0 0 ${10 + 14 * g}px rgba(45,212,191,${0.45 + 0.4 * g})`,
              }}
            />
            <div style={{ position: "absolute", left: xAt(p) - TILE_W, top: y - TILE_H / 2 }}>
              <RacerTile id={r.id} name={r.name} glow={g} />
            </div>
            {/* Live count beside the lane. */}
            <div
              style={{
                position: "absolute",
                left: X20 + 40,
                width: 200,
                top: y - 42,
                fontSize: 72,
                fontWeight: 700,
                color: C.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count(f, r.caught)}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Scoreboard = ({ f }: { f: number }) => {
  const BAR_L = 460;
  const BAR_W = 1000;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ ...centerText, top: 150, fontSize: 68, fontWeight: 700, color: C.text }}>{SCORE_HEADING}</div>
      {RACERS.map((r, i) => {
        const y = 330 + i * 185;
        const fill = interpolate(f, [SCORE_IN + 2 + i * 2, SCORE_SOLID + 4 + i * 2], [0, r.caught / BUGS], { ...clamp, easing: ease });
        return (
          <div key={r.id}>
            <div style={{ position: "absolute", left: BAR_L, top: y, fontSize: 52, fontWeight: 600, color: C.text }}>{r.name}</div>
            <div style={{ position: "absolute", left: BAR_L, width: BAR_W, top: y, textAlign: "right", fontSize: 64, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              {r.caught}
            </div>
            {/* Thin bar: the faint track is all 20 bugs. */}
            <div style={{ position: "absolute", left: BAR_L, width: BAR_W, top: y + 94, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.20)" }}>
              <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 6, background: GRADIENT, boxShadow: `0 0 12px rgba(45,212,191,0.5)` }} />
            </div>
          </div>
        );
      })}
      <div style={{ ...centerText, top: 862, fontSize: 48, lineHeight: 1.35, fontWeight: 500, color: "#d4d4d8" }}>
        {FOOTER.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const centerText: CSSProperties = { position: "absolute", left: 0, right: 0, textAlign: "center", letterSpacing: -0.5 };

export const Race = () => {
  const frame = useCurrentFrame();
  // Under the opaque scoreboard the track returns to the title state, so the fade-out lands on frame 0.
  const trackFrame = frame >= RESET ? 0 : frame;
  const scoreOpacity =
    frame < SCORE_IN ? 0 : frame < LOOP_OUT ? interpolate(frame, [SCORE_IN, SCORE_SOLID], [0, 1], clamp) : interpolate(frame, [LOOP_OUT, 270], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily }}>
      <Track f={trackFrame} />
      {scoreOpacity > 0 ? (
        <AbsoluteFill style={{ opacity: scoreOpacity }}>
          <Scoreboard f={frame} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
