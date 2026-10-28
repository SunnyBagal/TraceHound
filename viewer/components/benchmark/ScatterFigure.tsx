import { Reveal } from "@/components/landing/Reveal";
import { blindRows } from "@/lib/benchmark-view";
import { ReviewerMark } from "./ReviewerMark";

const X = { min: 30, max: 70, ticks: [30, 40, 50, 60, 70] };
const Y = { min: 30, max: 90, ticks: [30, 40, 50, 60, 70, 80, 90] };
const at = (v: number, a: { min: number; max: number }) => ((v - a.min) / (a.max - a.min)) * 100;

/* the blind table's P and R cells (bench-judge-v1 counts), one point per reviewer */
const points = blindRows.map((r) => ({ ...r, x: at(Number.parseFloat(r.r), X), y: at(Number.parseFloat(r.p), Y) }));
const v1 = points.find((p) => p.kind === "history")!;
const v2 = points.find((p) => p.kind === "ours")!;

/** Precision against recall on the blind test, like the Opus page's score-against-cost plots: up and right is better. */
export function ScatterFigure() {
  return <Reveal className="mt-8" threshold={0.25}>
    <div className="sx" data-testid="bench-scatter">
      <p className="sr-only">{points.map((p) => `${p.label}: precision ${p.p}, recall ${p.r}`).join("; ")}.</p>
      <span className="sx-ytitle" aria-hidden>Precision (%)</span>
      <div className="sx-plot" aria-hidden>
        {Y.ticks.map((t) => <span key={`y${t}`} className="sx-hline" style={{ "--t": at(t, Y) } as React.CSSProperties}><span>{t}</span></span>)}
        {X.ticks.map((t) => <span key={`x${t}`} className="sx-vtick" style={{ "--t": at(t, X) } as React.CSSProperties}><span>{t}</span></span>)}
        <svg className="sx-path" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1={v1.x} y1={100 - v1.y} x2={v2.x} y2={100 - v2.y} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <span key={p.name} className="sx-pt" data-kind={p.kind} data-ours={p.kind !== "tool" || undefined} style={{ "--x": p.x, "--y": p.y, "--i": i } as React.CSSProperties} title={`${p.label}: P ${p.p}, R ${p.r}`}>
            <span className="sx-dot" />
            <span className="sx-label"><ReviewerMark name={p.name} /><span className="bench-long">{p.label}</span>{p.kind !== "tool" && <span className="bench-short">{p.label.replace("TraceHound ", "")}</span>}</span>
          </span>
        ))}
      </div>
      <span className="sx-xtitle" aria-hidden>Recall (%)</span>
    </div>
  </Reveal>;
}
