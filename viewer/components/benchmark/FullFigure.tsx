import { Reveal } from "@/components/landing/Reveal";
import { fullRows } from "@/lib/benchmark-view";
import { BarChart } from "./BarChart";
import { Legend } from "./Figure";

/** Figure 3: dev and blind sets together, F per reviewer in rank order, both judges side by side. */
export function FullFigure() {
  return <>
    <div className="bench-fig-head"><span /><Legend items={[["solid", "bench-judge-v1 (scorer of record)"], ["hatch", "bench-judge-x1"]]} /></div>
    <Reveal className="mt-8" threshold={0.25}>
      <BarChart
        id="full"
        testId="bench-full"
        rowTestId="bench-full-row"
        max={80}
        ticks={[0, 20, 40, 60, 80]}
        axisTitle="F"
        description={`F with dev and blind sets together, in rank order: ${fullRows.map((r) => `${r.label} ${r.by.v1.cell} (v1), ${r.by.x1.cell} (x1)`).join("; ")}.`}
        columns={fullRows.map((r) => ({
          key: r.name,
          name: r.name,
          label: r.label,
          short: r.kind === "ours" ? r.label.replace("TraceHound ", "") : undefined,
          kind: r.kind,
          bars: (["v1", "x1"] as const).map((j) => ({ v: r.by[j].f, cell: r.by[j].cell, variant: j === "v1" ? ("solid" as const) : ("hatch" as const), label: `${r.label}: F ${r.by[j].cell} (${j})` })),
        }))}
      />
    </Reveal>
  </>;
}
