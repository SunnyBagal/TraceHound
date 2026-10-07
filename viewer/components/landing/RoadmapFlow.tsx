"use client";

import { useRef } from "react";
import { usePlayOnView } from "./AnimatedFigure";

export interface RoadmapItem {
  title: string;
  text: string;
}

const STEP = 450;
const at = (t: number, d: number) => ({ "--t": `${t}ms`, "--d": `${d}ms` }) as React.CSSProperties;

/**
 * The roadmap as a flow: from where things stand now through each planned item, the line drawing
 * from one to the next. It plays once, the first time it scrolls into view after the page loads;
 * it is not a button and a click never replays it. Reduced motion: the whole flow, static.
 */
export function RoadmapFlow({ now, items }: { now: RoadmapItem; items: readonly RoadmapItem[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [state] = usePlayOnView(ref, 0.25);
  const all = [{ ...now, planned: false }, ...items.map((i) => ({ ...i, planned: true }))];
  return (
    <ol ref={ref} className="lp-anim grid gap-0 lg:grid-cols-5 lg:gap-4" data-state={state} data-testid="roadmap-flow">
      {all.map((item, k) => {
        const t = k * STEP;
        const last = k === all.length - 1;
        return (
          <li key={item.title} className="relative pb-8 pl-12 lg:pb-0 lg:pl-0 lg:pt-12" data-testid={item.planned ? "roadmap-item" : "roadmap-now"}>
            {/* the line to the next item: down on phones, right on wide screens */}
            {!last && (
              <>
                <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-32px)] w-0.5 origin-top bg-line-strong lg:hidden" data-anim="growy" style={at(t + 200, 400)} />
                <span aria-hidden className="absolute left-8 top-[15px] hidden h-0.5 w-[calc(100%-16px)] origin-left bg-line-strong lg:block" data-anim="grow" style={at(t + 200, 400)} />
              </>
            )}
            <span
              aria-hidden
              className={`absolute left-0 top-0 grid size-8 place-items-center rounded-full border-2 ${item.planned ? "border-line-strong bg-panel" : "border-accent bg-accent-soft"}`}
              data-anim="in"
              style={at(t, 350)}
            >
              <span className={`size-2.5 rounded-full ${item.planned ? "bg-faint" : "bg-accent"}`} />
            </span>
            <div className="flex flex-col gap-2 lg:pr-2" data-anim="in" style={at(t + 100, 400)}>
              <span className={`mono w-fit rounded-full border px-2.5 py-0.5 text-[12px] ${item.planned ? "border-line-strong text-muted" : "border-accent text-accent"}`}>
                {item.planned ? "Planned" : "Now"}
              </span>
              <span className="text-[17px] font-semibold leading-snug text-text">{item.title}</span>
              <span className="text-[15px] leading-relaxed text-muted">{item.text}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
