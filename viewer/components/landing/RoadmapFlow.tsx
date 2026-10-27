"use client";

import { useRef } from "react";
import { usePlayOnView } from "./AnimatedFigure";

export interface RoadmapItem {
  title: string;
  text: string;
}

const STEP = 520;
const at = (t: number, d: number) => ({ "--t": `${t}ms`, "--d": `${d}ms` }) as React.CSSProperties;

/** a paw print pointing up (rotated by CSS along the trail) */
function Paw({ className, style, anim }: { className?: string; style?: React.CSSProperties; anim?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} data-anim={anim} aria-hidden>
      <path d="M12 21.2c-2.9 0-6.1-1.6-6.1-4.3 0-2.4 2.6-5.6 6.1-5.6s6.1 3.2 6.1 5.6c0 2.7-3.2 4.3-6.1 4.3Z" />
      <ellipse cx="5.2" cy="10.6" rx="2" ry="2.6" transform="rotate(-18 5.2 10.6)" />
      <ellipse cx="9.1" cy="5.9" rx="2.1" ry="2.8" transform="rotate(-6 9.1 5.9)" />
      <ellipse cx="14.9" cy="5.9" rx="2.1" ry="2.8" transform="rotate(6 14.9 5.9)" />
      <ellipse cx="18.8" cy="10.6" rx="2" ry="2.6" transform="rotate(18 18.8 10.6)" />
    </svg>
  );
}

/**
 * The roadmap as the hound's trail: from where things stand now, a line of paw prints walks to
 * each planned item in turn (left to right on wide screens, down on phones). It plays once, the
 * first time it scrolls into view after the page loads; it is not a button and a click never
 * replays it. Reduced motion: the whole trail, static.
 */
export function RoadmapFlow({ now, items }: { now: RoadmapItem; items: readonly RoadmapItem[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [state] = usePlayOnView(ref, 0.25);
  const all = [{ ...now, planned: false }, ...items.map((i) => ({ ...i, planned: true }))];
  return (
    <ol ref={ref} className="rm lp-anim" data-state={state} data-testid="roadmap-flow">
      {all.map((item, k) => {
        const t = k * STEP;
        const last = k === all.length - 1;
        return (
          <li key={item.title} className="rm-item" data-planned={item.planned || undefined} data-testid={item.planned ? "roadmap-item" : "roadmap-now"}>
            <div className="rm-trail" aria-hidden>
              <span className="rm-mark" data-anim="pop" style={at(t, 420)}>
                <Paw className="rm-mark-paw" />
              </span>
              {!last && (
                <span className="rm-steps">
                  {[0, 1, 2, 3].map((j) => (
                    <Paw key={j} anim="fade" className="rm-paw" style={{ ...at(t + 220 + j * 85, 260), "--j": j } as React.CSSProperties} />
                  ))}
                </span>
              )}
            </div>
            <div className="rm-card" data-anim="in" style={at(t + 120, 420)}>
              <span className="rm-chip">{item.planned ? "Planned" : "Now"}</span>
              <span className="rm-title">{item.title}</span>
              <span className="rm-text">{item.text}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
