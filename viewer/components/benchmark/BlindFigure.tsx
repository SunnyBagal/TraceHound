"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { Reveal } from "@/components/landing/Reveal";
import { prefersReducedMotion } from "@/components/Logo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { bandFor, blindRanked, JUDGES, tiedNames, type Judge } from "@/lib/benchmark-view";
import { BarChart } from "./BarChart";
import { Legend } from "./Figure";

/** Figure 1: the blind test's F per reviewer, ranked, under either judge. */
export function BlindFigure() {
  const [judge, setJudge] = useState<Judge>("v1");
  const pick = (next: string) => {
    if (!JUDGES.includes(next as Judge) || next === judge) return;
    const apply = () => flushSync(() => setJudge(next as Judge));
    // the bars swap places in a view transition where the browser has one
    if (typeof document !== "undefined" && "startViewTransition" in document && !prefersReducedMotion()) document.startViewTransition(apply);
    else apply();
  };
  const rows = blindRanked(judge);
  const band = bandFor(judge);
  return <>
    <div className="bench-fig-head">
      <ToggleGroup type="single" variant="outline" size="sm" value={judge} onValueChange={pick} aria-label="Judge" className="bench-toggle">
        <ToggleGroupItem value="v1">bench-judge-v1</ToggleGroupItem>
        <ToggleGroupItem value="x1">bench-judge-x1</ToggleGroupItem>
      </ToggleGroup>
      <Legend items={[["ours", "TraceHound v2"], ["history", "TraceHound v1"], ["tool", "Other reviewers"], ["band", "Tied with v2"]]} />
    </div>
    <Reveal className="mt-8" threshold={0.25} testId="bench-dots-reveal">
      <BarChart
        id="blind"
        testId="bench-dots"
        rowTestId="bench-row"
        max={80}
        ticks={[0, 20, 40, 60, 80]}
        axisTitle={`F, bench-judge-${judge}`}
        band={{ ...band, label: "tied with v2" }}
        description={`F on the blind test under bench-judge-${judge}, highest first: ${rows.map((r) => `${r.label} ${r.by[judge].cell}`).join(", ")}.`}
        columns={rows.map((r) => ({
          key: r.name,
          name: r.name,
          label: r.label,
          short: r.kind === "tool" ? undefined : r.label.replace("TraceHound ", ""),
          kind: r.kind,
          band: r.kind === "ours" ? "self" : tiedNames.has(r.name) ? "tied" : "outside",
          bars: [{
            v: r.by[judge].f,
            cell: r.by[judge].cell,
            variant: r.kind === "history" ? "hatch" : "solid",
            label: `${r.label}: F ${r.by[judge].cell}`,
            tip: <dl className="bench-tip"><dt>{r.label}</dt><dd>F {r.by[judge].cell} ({judge})</dd><dd>v1 counts: P {r.p} · R {r.r}</dd><dd>TP {r.tp} · FP {r.fp} · FN {r.fn}</dd></dl>,
          }],
        }))}
      />
    </Reveal>
  </>;
}
