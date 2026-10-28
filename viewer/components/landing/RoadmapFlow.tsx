"use client";

import { useRef } from "react";
import { usePlayOnView } from "./AnimatedFigure";

export interface RoadmapItem {
  title: string;
  text: string;
}

/** prints per milestone, and how long apart they land */
const PRINTS = 6;
const STEP = 110;
const at = (t: number, d: number) => ({ "--t": `${t}ms`, "--d": `${d}ms` }) as React.CSSProperties;

/**
 * The roadmap as the hound's trail: a hairline row of milestones (Now, then the planned ones), and
 * across their tops a walk of wolf prints (public/landing/paw.png, left and right feet in turn)
 * that starts solid on Now and fades into what is planned. The prints land one after another the
 * first time it scrolls into view; it is not a button and a click never replays it. Reduced
 * motion: the whole trail, static.
 */
export function RoadmapFlow({ now, items }: { now: RoadmapItem; items: readonly RoadmapItem[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [state] = usePlayOnView(ref, 0.25);
  const all = [{ ...now, planned: false }, ...items.map((i) => ({ ...i, planned: true }))];
  return (
    <ol ref={ref} className="rm lp-anim" data-state={state} data-testid="roadmap-flow">
      {all.map((item, k) => (
        <li key={item.title} className="rm-cell" data-planned={item.planned || undefined} style={{ "--k": k } as React.CSSProperties} data-testid={item.planned ? "roadmap-item" : "roadmap-now"}>
          <span className="rm-trail" aria-hidden>
            {Array.from({ length: PRINTS }, (_, j) => (
              <span key={j} className="rm-print" data-foot={j % 2 ? "r" : "l"} data-anim="stamp" style={at((k * PRINTS + j) * STEP, 300)} />
            ))}
          </span>
          <span className="rm-body" data-anim="in" style={at(k * PRINTS * STEP + 120, 420)}>
            <span className="rm-chip">{item.planned ? "Planned" : "Now"}</span>
            <span className="rm-title">{item.title}</span>
            <span className="rm-text">{item.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
