import { ReviewShell } from "@/components/ReviewShell";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";

/*
 * Every number here is lib/benchmark.ts's (itself docs/bench/results.md's, checked by
 * test/benchmark.test.tsx). The figures above the tables only re-draw cells of those tables; they
 * add no number of their own.
 */
const pct = (cell: string) => Number.parseFloat(cell);
const [BLIND, RANKS, DEV] = BENCHMARK_TABLES;
const F_V1 = BLIND.headers.indexOf("F (v1)");
const blindRows = BLIND.rows.filter((r) => !r[0].includes("secondary")).map((r) => ({ name: r[0].replace(" (pool-verify-v1)", ""), f: pct(r[F_V1]!), ours: r[0].startsWith("TraceHound") }));
const blindPrs = /^(\d+) pull requests/.exec(BLIND.note)?.[1];
const ours = blindRows.find((r) => r.ours)!;
const blindRuns = RANKS.rows.map((r) => ({ run: r[0].split(" ")[0]!, f: pct(r[1]) }));
const devRuns = DEV.rows.map((r) => ({ run: r[0], f: pct(r[1]) }));
const spread = (xs: number[]) => `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}%`;
const fullRank = /Both TraceHound rows are (\d+)(?:st|nd|rd|th) of 6 under both judges/.exec(BENCHMARK_TABLES[5].note)?.[1];

const AXIS = { min: 30, max: 80 };
const x = (f: number) => `${((f - AXIS.min) / (AXIS.max - AXIS.min)) * 100}%`;

function Verdict({ text }: { text: string }) {
  const tone = /^Adopted/.test(text) ? "adopted" : /^(Loss|No gain)/.test(text) ? "loss" : /did not move/.test(text) ? "flat" : null;
  if (!tone) return <>{text}</>;
  return <span className="verdict" data-tone={tone}>{text}</span>;
}

export default function BenchmarkPage() {
  return <ReviewShell active="Benchmark">
    <header className="mb-10 max-w-3xl">
      <p className="vkicker mb-4">TraceHound / Benchmark</p>
      <h1 className="vh2">Statistically tied on the blind test. Every loss is on this page.</h1>
      <p className="mt-5 text-base leading-relaxed text-muted">Aggregate results for pool-verify-v1, copied from the committed benchmark report. Medium+ findings; low-severity findings are ignored, and duplicates count as neither true nor false positives.</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">Source: <a href={BENCHMARK_SOURCE} className="text-text underline underline-offset-4 hover:text-accent">docs/bench/results.md</a> · decisions 063, 066 · <span className="font-mono">{BENCHMARK_REVISION.slice(0, 7)}</span></p>
    </header>

    <section aria-label="Headline numbers" className="bench-tiles mb-12">
      <div className="bench-tile">
        <span className="bench-n">{ours.f.toFixed(1)}%</span>
        <span className="bench-l">F on the blind test, run 1 ({blindPrs} pull requests)</span>
        <span className="bench-tag">point estimate</span>
      </div>
      <div className="bench-tile">
        <span className="bench-n">{spread(blindRuns.map((r) => r.f))}</span>
        <span className="bench-l">F across the {blindRuns.length} blind runs, same code, temperature 0</span>
        <span className="bench-tag">spread</span>
      </div>
      <div className="bench-tile">
        <span className="bench-n">{fullRank}th of 6</span>
        <span className="bench-l">Dev and test sets together, under both judges</span>
        <span className="bench-tag">point-estimate rank</span>
      </div>
    </section>

    <section aria-labelledby="dots-title" className="mb-14 rounded-2xl border border-panel-line bg-panel p-5 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="dots-title" className="text-lg font-semibold">Blind test, run 1: F by reviewer</h2>
        <p className="text-sm text-muted">bench-judge-v1 · dots are point estimates</p>
      </div>
      <div className="bench-dots mt-8" role="img" aria-label={`F scores on the blind test, run 1: ${blindRows.map((r) => `${r.name} ${r.f}%`).join(", ")}. No gap to another tool is outside its 95% interval.`}>
        <div className="bench-overlay" aria-hidden>
          <div className="bench-band" style={{ left: x(Math.min(...blindRows.map((r) => r.f))), width: `calc(${x(Math.max(...blindRows.map((r) => r.f)))} - ${x(Math.min(...blindRows.map((r) => r.f)))})` }}>
            <span>statistically tied</span>
          </div>
          <div className="bench-axis">{[30, 40, 50, 60, 70, 80].map((t) => <span key={t} style={{ left: x(t) }}>{t}%</span>)}</div>
        </div>
        {blindRows.map((r, i) => (
          <div key={r.name} className="bench-row" data-ours={r.ours || undefined} style={{ "--i": i } as React.CSSProperties}>
            <span className="bench-name">{r.name}</span>
            <span className="bench-track"><span className="bench-dot" style={{ left: x(r.f) }}><span className="bench-val">{r.f.toFixed(1)}</span></span></span>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-muted">The shaded band spans every reviewer: on {blindPrs} pull requests no gap to another tool is outside its 95% interval (audit-cc01 §3.2), so the order of the dots is not a ranking.</p>
      <div className="mt-8 border-t border-panel-line pt-6">
        <h3 className="text-sm font-semibold text-text">TraceHound&apos;s own spread, run to run</h3>
        <ul className="bench-spread mt-4" aria-label="TraceHound F per run">
          {blindRuns.map((r) => <li key={`b${r.run}`}><span className="bench-chip">blind {r.run}</span><span className="font-mono text-text">{r.f.toFixed(1)}%</span></li>)}
          {devRuns.map((r) => <li key={`d${r.run}`}><span className="bench-chip bench-chip-dev">dev {r.run}</span><span className="font-mono text-text">{r.f.toFixed(1)}%</span></li>)}
        </ul>
      </div>
    </section>

    <div className="space-y-12">
      {BENCHMARK_TABLES.map((table, index) => <section key={table.title} aria-labelledby={`table-${index}`}>
        <h2 id={`table-${index}`} className="text-xl font-semibold tracking-[-0.01em]">{table.title}</h2>
        <p className="mb-5 mt-2 max-w-[90ch] text-sm leading-relaxed text-muted">{table.note}</p>
        <div className="bench-table overflow-x-auto rounded-xl border border-panel-line" tabIndex={0} role="region" aria-label={`${table.title} table, scroll horizontally on small screens`}>
          <table className="w-full border-collapse text-left text-sm leading-relaxed">
            <caption className="sr-only">{table.title}</caption>
            <thead className="bg-panel text-muted"><tr>{table.headers.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-5 py-4 font-medium">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-panel-line">{table.rows.map((row) => <tr key={row[0]} className={row[0].startsWith("TraceHound") ? "bench-ours" : "bg-bg"}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row" className="min-w-48 px-5 py-4 font-medium text-text">{cell}</th> : <td key={cellIndex} className={`px-5 py-4 text-text ${table.headers[cellIndex] === "verdict" || table.headers[cellIndex] === "idea" || table.headers[cellIndex] === "bar" || table.headers[cellIndex]?.startsWith("result") ? "min-w-56" : "font-mono"}`}>{table.headers[cellIndex] === "verdict" ? <Verdict text={cell} /> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>)}
    </div>
    <aside className="my-12 max-w-3xl rounded-xl border border-panel-line bg-panel p-6" aria-labelledby="limits">
      <h2 id="limits" className="text-lg font-semibold">How to read these numbers</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">The test set is small: 10 pull requests and 23 golden findings. Differences of a few points are within noise. Run-to-run spread is large even at temperature 0, and the five comparison tools were judged once while TraceHound was run three times.</p>
      <p className="mt-4 text-base leading-relaxed text-muted">This was the fourth reviewer variant selected on the same dev set. The judge is the same model (Nemotron 3 Super) as the reviewer and the verifier. The golden set was built from the tools’ comments, and the public pull requests may have appeared in model training. Read the source report for the full limits, void runs and costs.</p>
    </aside>
  </ReviewShell>;
}
