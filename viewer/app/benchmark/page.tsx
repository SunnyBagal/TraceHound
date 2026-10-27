import { ReviewShell } from "@/components/ReviewShell";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";

import { band, blindRows, devChips, gapSentence, preRegistered, RANK, rankOf, spread, tiedNames, tiedTools, aheadTools, tools, v1Runs, v2, word } from "@/lib/benchmark-view";

const AXIS = { min: 30, max: 80 };
const x = (f: number) => `${((f - AXIS.min) / (AXIS.max - AXIS.min)) * 100}%`;

function Verdict({ text }: { text: string }) {
  const tone = /^Adopted/.test(text) ? "adopted" : /^(Loss|No gain)/.test(text) ? "loss" : /did not move|^Report only|^Inconclusive/.test(text) ? "flat" : null;
  if (!tone) return <>{text}</>;
  return <span className="verdict" data-tone={tone}>{text}</span>;
}

export default function BenchmarkPage() {
  return <ReviewShell active="Benchmark">
    <header className="mb-10 max-w-3xl">
      <p className="vkicker mb-4">TraceHound / Benchmark</p>
      <h1 className="vh2">Tied with {word(tiedTools.length)} of {word(tools.length)} commercial reviewers on the blind test, ahead of {word(aheadTools.length)}. Every loss is on this page.</h1>
      <p className="mt-5 text-base leading-relaxed text-muted">Aggregate results for TraceHound v2 (pool-verify-v1 on Nemotron 3.5 Super), copied from the committed benchmark report. Medium+ findings; low-severity findings are ignored, and duplicates count as neither true nor false positives.</p>
      <p className="mt-4 text-sm leading-relaxed text-muted">Source: <a href={BENCHMARK_SOURCE} className="text-text underline underline-offset-4 hover:text-accent">docs/bench/results.md</a> · decisions 067–071 · <span className="font-mono">{BENCHMARK_REVISION.slice(0, 7)}</span></p>
    </header>

    <section aria-label="Headline numbers" className="bench-tiles mb-12">
      <div className="bench-tile" data-testid="tile-blind">
        <span className="bench-n">{v2.cell}</span>
        <span className="bench-l">F on the blind test (TraceHound v2): 10 blind pull requests, n = 23</span>
        <span className="bench-tag">point estimate</span>
      </div>
      <div className="bench-tile" data-testid="tile-rank">
        <span className="bench-n">rank {preRegistered[RANK]} of {rankOf}</span>
        <span className="bench-l">Dev and test sets together, pre-registered v2 row, bench-judge-v1</span>
        <span className="bench-tag">point estimate</span>
      </div>
      <div className="bench-tile" data-testid="tile-spread">
        <span className="bench-n">{spread(v1Runs.map((r) => r.f))}</span>
        <span className="bench-l">v1 · 3 Super: F across its {word(v1Runs.length)} blind runs, same code, temperature 0</span>
        <span className="bench-tag">spread</span>
      </div>
    </section>

    <section aria-labelledby="dots-title" className="mb-14 rounded-2xl border border-panel-line bg-panel p-5 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="dots-title" className="text-lg font-semibold">Blind test: F by reviewer</h2>
        <p className="text-sm text-muted">bench-judge-v1 · dots are point estimates</p>
      </div>
      <div className="bench-dots mt-8" role="img" aria-label={`F scores on the blind test: ${blindRows.map((r) => `${r.label} ${r.cell}`).join(", ")}. ${gapSentence}`} data-testid="bench-dots">
        <div className="bench-overlay" aria-hidden>
          <div className="bench-band" style={{ left: x(band.min), width: `calc(${x(band.max)} - ${x(band.min)})` }}>
            <span>statistically tied with v2</span>
          </div>
          <div className="bench-axis">{[30, 40, 50, 60, 70, 80].map((t) => <span key={t} style={{ left: x(t) }}>{t}%</span>)}</div>
        </div>
        {blindRows.map((r, i) => (
          <div key={r.name} className="bench-row" data-kind={r.kind} data-ours={r.kind === "ours" || undefined} data-band={r.kind === "ours" ? "self" : tiedNames.has(r.name) ? "tied" : "outside"} data-testid="bench-row" style={{ "--i": i } as React.CSSProperties}>
            <span className="bench-name" title={r.name}>{r.label}</span>
            <span className="bench-track"><span className="bench-dot" style={{ left: x(r.f) }}><span className="bench-val">{r.f.toFixed(1)}</span></span></span>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-[75ch] text-sm leading-relaxed text-muted" data-testid="bench-caption">The band holds every reviewer table 2 calls tied (PR-level paired bootstrap, 95% intervals): {gapSentence} The hollow dot is v1, history rather than a competitor. With only 10 pull requests these intervals are probably too narrow.</p>
      <div className="mt-8 border-t border-panel-line pt-6">
        <h3 className="text-sm font-semibold text-text">TraceHound&apos;s own spread</h3>
        <ul className="bench-spread mt-4" aria-label="TraceHound F per run and per model">
          {v1Runs.map((r) => <li key={`b${r.run}`}><span className="bench-chip">v1 · 3 Super · blind run {r.run}</span><span className="font-mono text-text">{r.f.toFixed(1)}%</span></li>)}
          {devChips.map((c) => <li key={c.label}><span className="bench-chip bench-chip-dev">dev · {c.label}</span><span className="font-mono text-text">{c.f}</span></li>)}
        </ul>
      </div>
    </section>

    <div className="space-y-12">
      {BENCHMARK_TABLES.map((t, index) => <section key={t.title} aria-labelledby={`table-${index}`}>
        <h2 id={`table-${index}`} className="text-xl font-semibold tracking-[-0.01em]">{t.title}</h2>
        <p className="mb-5 mt-2 max-w-[90ch] text-sm leading-relaxed text-muted">{t.note}</p>
        <div className="bench-table overflow-x-auto rounded-xl border border-panel-line" tabIndex={0} role="region" aria-label={`${t.title} table, scroll horizontally on small screens`}>
          <table className="w-full border-collapse text-left text-sm leading-relaxed">
            <caption className="sr-only">{t.title}</caption>
            <thead className="bg-panel text-muted"><tr>{t.headers.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-5 py-4 font-medium">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-panel-line">{t.rows.map((row) => <tr key={row[0]} className={row[0].startsWith("TraceHound v2") ? "bench-ours" : "bg-bg"}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row" className="min-w-48 px-5 py-4 font-medium text-text">{cell}</th> : <td key={cellIndex} className={`px-5 py-4 text-text ${["verdict", "idea", "bar", "sentence the rule allows"].includes(t.headers[cellIndex]!) || t.headers[cellIndex]?.startsWith("result") ? "min-w-56" : "font-mono"}`}>{t.headers[cellIndex] === "verdict" ? <Verdict text={cell} /> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>)}
    </div>
    <aside className="my-12 max-w-3xl rounded-xl border border-panel-line bg-panel p-6" aria-labelledby="limits">
      <h2 id="limits" className="text-lg font-semibold">How to read these numbers</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">The test set is small: 10 pull requests and 23 golden findings. Differences of a few points are within noise. The intervals cover pull-request sampling only, not run-to-run spread or judge error.</p>
      <p className="mt-4 text-base leading-relaxed text-muted">v2 was chosen on the same dev set earlier decisions were tuned on. There is one v2 Cal.com run, and it is the second look at Cal.com. The judge (Nemotron 3 Super) and v2&apos;s reviewer (Nemotron 3.5 Super) are the same family. 3.5 returns partial reviews: a chunk that fails on invalid JSON contributes no findings, about 7 of 40 dev pull requests per run. Read the source report for the full limits, void runs and costs.</p>
    </aside>
  </ReviewShell>;
}
