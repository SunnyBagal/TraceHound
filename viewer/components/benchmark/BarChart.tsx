"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReviewerMark } from "./ReviewerMark";

export type ChartBar = { v: number; cell: string; variant: "solid" | "hatch"; label: string; tip?: ReactNode };
export type ChartColumn = { key: string; name: string; label: string; short?: string; kind: "ours" | "history" | "tool"; band?: "self" | "tied" | "outside"; bars: ChartBar[] };

/**
 * Flat, square bars from 0 with a 1px outline, values above, gridlines behind: vertical columns on
 * wide screens, horizontal rows under 640px (CSS only, the same markup). An optional band marks a
 * value range (v2 and the reviewers tied with it).
 */
export function BarChart({ id, columns, max, ticks, band, axisTitle, rowTestId, testId, description }: {
  id: string;
  columns: ChartColumn[];
  max: number;
  ticks: number[];
  band?: { min: number; max: number; label: string };
  axisTitle: string;
  rowTestId: string;
  testId?: string;
  description: string;
}) {
  const at = (v: number) => (v / max) * 100;
  return <TooltipProvider delayDuration={80}>
    <div className="bx" data-testid={testId} data-bars={columns[0]?.bars.length ?? 1} style={{ "--n": columns.length } as React.CSSProperties}>
      <p className="sr-only">{description}</p>
      <div className="bx-overlay" aria-hidden>
        {ticks.map((t) => <span key={t} className="bx-tick" style={{ "--t": at(t) } as React.CSSProperties}><span>{t}%</span></span>)}
        {band && <span className="bx-band" style={{ "--lo": at(band.min), "--hi": at(band.max) } as React.CSSProperties}><span>{band.label}</span></span>}
      </div>
      <span className="bx-axis-title" aria-hidden>{axisTitle}</span>
      <ol className="bx-cols">
        {columns.map((c, i) => (
          <li key={c.key} className="bench-row bx-col" data-kind={c.kind} data-ours={c.kind === "ours" || undefined} data-band={c.band} data-testid={rowTestId} style={{ "--i": i, viewTransitionName: `${id}-${c.key.replace(/[^a-z0-9]+/gi, "-")}` } as React.CSSProperties}>
            <span className="bx-track">
              {c.bars.map((b, j) => {
                const bar = <button type="button" className="bx-bar" data-variant={b.variant} aria-label={b.label} style={{ "--v": at(b.v), "--j": j } as React.CSSProperties}><span className="bx-val">{b.cell.replace("%", "")}</span></button>;
                return b.tip ? <Tooltip key={j}><TooltipTrigger asChild>{bar}</TooltipTrigger><TooltipContent side="top" sideOffset={8}>{b.tip}</TooltipContent></Tooltip> : <span key={j} className="contents">{bar}</span>;
              })}
            </span>
            <span className="bench-name bx-label" title={c.name}><ReviewerMark name={c.name} /><span className="bench-long">{c.label}</span>{c.short && <span className="bench-short">{c.short}</span>}</span>
          </li>
        ))}
      </ol>
    </div>
  </TooltipProvider>;
}
