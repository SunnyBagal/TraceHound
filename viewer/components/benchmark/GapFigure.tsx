import { gapIntervals, JUDGES } from "@/lib/benchmark-view";
import { Legend } from "./Figure";
import { ReviewerMark } from "./ReviewerMark";

const RANGE = 40;
const TICKS = [-40, -20, 0, 20, 40];
const at = (v: number) => ((v + RANGE) / (2 * RANGE)) * 100;

/** Figure 2: table 2's intervals, v2's F minus each reviewer's, one straight whisker per judge. */
export function GapFigure() {
  return <>
    <div className="bench-fig-head"><span /><Legend items={[["line", "bench-judge-v1"], ["dash", "bench-judge-x1"]]} /></div>
    <div className="gx mt-8" data-testid="bench-gaps">
      <p className="sr-only">{gapIntervals.map((g) => `${g.label}: v1 ${g.by.v1.cell}, x1 ${g.by.x1.cell}, ${g.sentence}`).join(". ")}.</p>
      <div className="gx-overlay" aria-hidden>
        {TICKS.map((t) => <span key={t} className="gx-tick" data-zero={t === 0 || undefined} style={{ "--t": at(t) } as React.CSSProperties}><span>{t > 0 ? `+${t}` : t === 0 ? "0" : `−${-t}`}</span></span>)}
      </div>
      <ol className="gx-rows" aria-hidden>
        {gapIntervals.map((g) => (
          <li key={g.name} className="gx-row" data-tied={g.tied || undefined}>
            <span className="gx-name" title={g.name}><ReviewerMark name={g.name} /><span className="bench-long">{g.label}</span>{g.label.startsWith("TraceHound") && <span className="bench-short">{g.label.replace("TraceHound ", "")}</span>}</span>
            <span className="gx-track">
              {JUDGES.map((j) => <span key={j} className="gx-ci" data-judge={j} style={{ "--lo": at(g.by[j].lo), "--hi": at(g.by[j].hi), "--obs": at(g.by[j].obs) } as React.CSSProperties}><span className="gx-obs" /></span>)}
            </span>
            <span className="gx-verdict">{g.tied ? "tied" : g.sentence.startsWith("ahead of") ? "v2 ahead" : "v2 behind"}</span>
          </li>
        ))}
      </ol>
      <div className="gx-dir" aria-hidden><span>← reviewer<span className="gx-wide"> ahead</span></span><span>v2<span className="gx-wide"> ahead</span> →</span></div>
    </div>
  </>;
}
