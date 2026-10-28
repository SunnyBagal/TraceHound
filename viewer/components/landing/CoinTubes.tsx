"use client";

import { useEffect, useRef, useState } from "react";
import { boxCorners, cylinder, fitProjection, iso, sideMatrix, slabOf, type Plan } from "@/components/iso/iso-kit";
import { prefersReducedMotion } from "@/components/Logo";
import { Halo, Solid, Tag, Text } from "./Machines";

/*
 * Cents per pull request: two glass tubes, one coin per cent, filled to each model's median, a red
 * band at the costliest pull request. It opens in the isometric view of the other machines; once
 * the coins have dropped, the camera turns smoothly to a front view so the levels line up against
 * one cents scale, which fades in as the view settles. Reduced motion (and no IntersectionObserver):
 * the front view at once.
 */

export interface CostTube {
  model: string;
  median: string;
  max: string;
}

const W = 520;
const HT = 440;
const PITCH = 2.6;
const FLOOR = 14;
const BASE: Plan = { x: 0, y: 0, w: 230, d: 64, r: 8 };
const XS = [82, 168];
const R = 22;
const DROP_MS = 1100;
const TURN_MS = 2200;

const cents = (cell: string) => Number.parseFloat(cell.replace("$", "")) * 100;
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the camera at turn `t`: isometric (45°, 30° up) at 0, front (90°, 12° up) at 1 */
function camera(t: number, top: number) {
  const e = ease(t);
  const P = fitProjection([...boxCorners(BASE, 0, FLOOR + top * PITCH + 8)], W, HT, { pad: 34 + 4 * e, azimuth: 45 + 45 * e, elevation: 30 - 18 * e });
  // leave room under the bench for the captions, and on the left for the scale as it appears
  return { ...P, origin: [P.origin[0] + 14 * e, P.origin[1] - 24] as [number, number] };
}

export function CoinTubesFigure({ tubes, label }: { tubes: readonly CostTube[]; label: string }) {
  const top = Math.ceil(Math.max(...tubes.map((t) => cents(t.max))) / 5) * 5;
  const H = top * PITCH + 8;
  const [t, setT] = useState(0);
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setT(1);
      return;
    }
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[entries.length - 1]!.isIntersecting) return;
        observer.disconnect();
        timer = setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const v = Math.min(1, (now - start) / TURN_MS);
            setT(v);
            if (v < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }, DROP_MS);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const P = camera(t, top);
  const front = smooth(0.72, 1, t);
  const zOf = (c: number) => FLOOR + 2 + c * PITCH;
  const at = (x: number, y: number, z: number) => iso([x, y, z], P);
  const left = at(BASE.x, BASE.d, 0)[0];
  const right = at(BASE.x + BASE.w, BASE.d, 0)[0];
  const below = Math.max(...boxCorners(BASE, 0, 0).map((c) => iso(c, P)[1]));
  const screenY = (c: number) => at(0, BASE.d, zOf(c))[1];
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${HT}`} className="mc-fig" role="img" aria-label={label} data-view={t >= 1 ? "front" : t > 0 ? "turning" : "iso"}>
      {/* the scale: a line every cent, a number every five; it only means something from the front */}
      <g opacity={front}>
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
      </g>
      <Halo plan={BASE} P={P} />
      <Solid p={slabOf(BASE, 0, FLOOR - 2, P, 6, 1)} tone="ink" />
      {/* engraved on the bench's front face, centred in its height */}
      <Text m={sideMatrix([BASE.w / 2, BASE.d], 3.8, P, "left")} size={5} anchor="middle" className="mc-text-on">
        ¢ PER PULL REQUEST · PIPELINE ONLY · ONE COIN = ONE CENT
      </Text>
      {tubes.map((tube, k) => {
        const cx = XS[k]!;
        const cy = BASE.d / 2;
        const glass = cylinder(cx, cy, R, FLOOR, H, P, 56);
        const coins = Math.round(cents(tube.median));
        const zMax = zOf(cents(tube.max));
        // the max band: the near half of the tube's circle at that height
        const band = Array.from({ length: 29 }, (_, i) => {
          const a = Math.atan2(Math.sin(((P.azimuth ?? 45) * Math.PI) / 180), Math.cos(((P.azimuth ?? 45) * Math.PI) / 180)) - Math.PI / 2 + (i / 28) * Math.PI;
          const [x, y] = at(cx + R * Math.cos(a), cy + R * Math.sin(a), zMax);
          return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join("");
        const [mx, my] = at(cx + (k ? R : -R), cy, zMax);
        const foot = at(cx, cy, 0)[0];
        return (
          <g key={tube.model}>
            <Solid p={cylinder(cx, cy, R + 5, FLOOR - 2, 3, P, 48, 0.6)} />
            <path d={glass.top} className="mc-glass-rim" />
            {Array.from({ length: coins }, (_, j) => (
              <Solid key={j} p={cylinder(cx, cy, R - 3, FLOOR + 2 + j * PITCH, PITCH - 0.5, P, 48)} tone="amber" className="mc-coin" style={{ "--i": j + k * 3 } as React.CSSProperties} />
            ))}
            <path d={glass.fill} className="mc-glass" />
            <path d={glass.outline} className="mc-ink" />
            <path d={band} className="mc-max" />
            <g opacity={0.35 + 0.65 * front}>
              <Tag at={[mx + (k ? 48 : -48), my]} text={`max ${tube.max}`} size={10} />
            </g>
            <text x={foot} y={below + 26} textAnchor="middle" className="mc-cap">
              {tube.model}
            </text>
            <text x={foot} y={below + 43} textAnchor="middle" className="mc-cap-sub">
              median {tube.median}
            </text>
            <text x={foot} y={below + 58} textAnchor="middle" className="mc-cap-sub">
              {coins} coins
            </text>
          </g>
        );
      })}
    </svg>
  );
}
