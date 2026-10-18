import { ReviewShell } from "@/components/ReviewShell";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";

export default function BenchmarkPage() {
  return <ReviewShell active="Benchmark">
    <header className="mb-12 max-w-3xl">
      <p className="mb-3 text-sm font-medium text-accent">TRACEHOUND / BENCHMARK</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Review quality, with the limits in view.</h1>
      <p className="mt-5 text-base leading-relaxed text-muted">Aggregate results for pool-verify-v1, copied from the committed benchmark report. Medium+ findings; low-severity findings are ignored, and duplicates count as neither true nor false positives.</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">Source: <a href={BENCHMARK_SOURCE} className="text-text underline underline-offset-4 hover:text-accent">docs/bench/results.md</a> · decision 063 · <span className="font-mono">{BENCHMARK_REVISION.slice(0, 7)}</span></p>
    </header>
    <div className="space-y-12">
      {BENCHMARK_TABLES.map((table, index) => <section key={table.title} aria-labelledby={`table-${index}`}>
        <h2 id={`table-${index}`} className="text-xl font-semibold">{table.title}</h2>
        <p className="mb-5 mt-2 text-sm leading-relaxed text-muted">{table.note}</p>
        <div className="overflow-x-auto rounded-xl border border-panel-line" tabIndex={0} role="region" aria-label={`${table.title} table, scroll horizontally on small screens`}>
          <table className="w-full border-collapse text-left text-sm leading-relaxed">
            <caption className="sr-only">{table.title}</caption>
            <thead className="bg-panel text-muted"><tr>{table.headers.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-5 py-4 font-medium">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-panel-line">{table.rows.map((row) => <tr key={row[0]} className={row[0].startsWith("TraceHound") ? "bg-accent-soft" : "bg-bg"}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row" className="min-w-48 px-5 py-4 font-medium text-text">{cell}</th> : <td key={cellIndex} className="px-5 py-4 font-mono text-text">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>)}
    </div>
    <aside className="my-12 max-w-3xl rounded-xl border border-panel-line bg-panel p-6" aria-labelledby="limits">
      <h2 id="limits" className="text-lg font-semibold">How to read these numbers</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">The test set is small: 10 pull requests and 23 golden findings. Differences of a few points are within noise. Run-to-run spread is large even at temperature 0, and the five comparison tools were judged once while TraceHound was run three times.</p>
      <p className="mt-4 text-base leading-relaxed text-muted">This was the fourth reviewer variant selected on the same dev set. The judge and reviewer share a model family. The golden set was built from the tools’ comments, and the public pull requests may have appeared in model training. Read the source report for the full limits, void runs and costs.</p>
    </aside>
  </ReviewShell>;
}
