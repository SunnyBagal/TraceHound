import { ReviewShell, ShellHero } from "@/components/ReviewShell";
import { Reveal } from "@/components/landing/Reveal";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";

import { band, blindRows, table, devChips, gapSentence, preRegistered, RANK, rankOf, spread, tiedNames, tiedTools, aheadTools, tools, v1Runs, v2, word } from "@/lib/benchmark-view";

/* bars start at 0 so gaps between reviewers are drawn at their true size */
const AXIS = { min: 0, max: 80 };
const AXIS_TICKS = [0, 20, 40, 60, 80];
/* the cost table's 3.5 Super row (the product's model), its median cell */
const COST = table("Dev cost per pull request");
const COST_MEDIAN = COST.rows.find((r) => r[0].startsWith("3.5 Super"))![(COST.headers as readonly string[]).indexOf("cost median")]!;
const x = (f: number) => `${((f - AXIS.min) / (AXIS.max - AXIS.min)) * 100}%`;

function Verdict({ text }: { text: string }) {
  const tone = /^Adopted/.test(text) ? "adopted" : /^(Loss|No gain)/.test(text) ? "loss" : /did not move|^Report only|^Inconclusive/.test(text) ? "flat" : null;
  if (!tone) return <>{text}</>;
  return <span className="verdict" data-tone={tone}>{text}</span>;
}

export default function BenchmarkPage() {
  const v2x = (v2.f - band.min) / (band.max - band.min || 1);
  return <ReviewShell active="Benchmark">
    <ShellHero
      kicker="TraceHound / Benchmark"
      tone="green"
      title={<>Tied with {word(tiedTools.length)} of {word(tools.length)} commercial reviewers on the blind test, ahead of {word(aheadTools.length)}. Every loss is on this page.</>}
      aside={<div className="bench-hero-card" data-testid="tile-blind">
        <span className="bench-hero-n">{v2.cell}</span>
        <span className="bench-l">F on the blind test (TraceHound v2): 10 blind pull requests, n = 23</span>
        <span className="bench-tag">point estimate</span>
      </div>}
    >
      <p className="rv-lede">Aggregate results for TraceHound v2 (pool-verify-v1 on Nemotron 3.5 Super), copied from the committed benchmark report. Medium+ findings; low-severity findings are ignored, and duplicates count as neither true nor false positives.</p>
      <p className="text-sm leading-relaxed text-muted">Source: <a href={BENCHMARK_SOURCE} className="rv-inline-link">docs/bench/results.md</a> · decisions 067–071 · <span className="font-mono">{BENCHMARK_REVISION.slice(0, 7)}</span></p>
    </ShellHero>

    <section aria-label="Headline numbers" className="bench-tiles mb-12">
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
      <div className="bench-tile" data-testid="tile-cost">
        <span className="bench-n">{COST_MEDIAN}</span>
        <span className="bench-l">Median cost per pull request on 3.5 Super, the product&apos;s model: pipeline only, judges excluded, pre-VAT (dev set)</span>
        <span className="bench-tag">median</span>
      </div>
    </section>

    <section aria-labelledby="dots-title" className="bench-chart mb-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="fx-kicker">Figure 1</p>
          <h2 id="dots-title" className="mt-2 text-xl font-semibold tracking-[-0.01em]">Blind test: F by reviewer</h2>
        </div>
        <p className="text-sm text-muted">bench-judge-v1 · bars are point estimates, from 0%</p>
      </div>
      <Reveal className="bench-dots mt-10" threshold={0.25} testId="bench-dots-reveal">
        <div role="img" aria-label={`F scores on the blind test: ${blindRows.map((r) => `${r.label} ${r.cell}`).join(", ")}. ${gapSentence}`} data-testid="bench-dots">
          <div className="bench-overlay" aria-hidden>
            <div className="bench-grid">{AXIS_TICKS.map((t) => <span key={t} style={{ left: x(t) }} />)}</div>
            <div className="bench-band" style={{ left: x(band.min), width: `calc(${x(band.max)} - ${x(band.min)})`, "--origin": `${(v2x * 100).toFixed(1)}%` } as React.CSSProperties}>
              <span>statistically tied with v2</span>
            </div>
            <div className="bench-axis">{AXIS_TICKS.map((t) => <span key={t} style={{ left: x(t) }}>{t}%</span>)}</div>
          </div>
          {blindRows.map((r, i) => (
            <div key={r.name} className="bench-row" data-kind={r.kind} data-ours={r.kind === "ours" || undefined} data-band={r.kind === "ours" ? "self" : tiedNames.has(r.name) ? "tied" : "outside"} data-testid="bench-row" style={{ "--i": i } as React.CSSProperties}>
              <span className="bench-name" title={r.name}>{r.label}</span>
              <span className="bench-track"><span className="bench-bar" style={{ width: x(r.f) }} /><span className="bench-val" style={{ left: x(r.f) }}>{r.f.toFixed(1)}</span></span>
            </div>
          ))}
        </div>
      </Reveal>
      <p className="mt-6 max-w-[75ch] text-sm leading-relaxed text-muted" data-testid="bench-caption">The band holds every reviewer table 2 calls tied (PR-level paired bootstrap, 95% intervals): {gapSentence} The outlined bar is v1, history rather than a competitor. With only 10 pull requests these intervals are probably too narrow.</p>
      <div className="mt-8 border-t border-panel-line pt-6">
        <h3 className="text-sm font-semibold text-text">TraceHound&apos;s own spread</h3>
        <ul className="bench-spread mt-4" aria-label="TraceHound F per run and per model">
          {v1Runs.map((r) => <li key={`b${r.run}`}><span className="bench-chip">v1 · 3 Super · blind run {r.run}</span><span className="font-mono text-text">{r.f.toFixed(1)}%</span></li>)}
          {devChips.map((c) => <li key={c.label}><span className="bench-chip bench-chip-dev">dev · {c.label}</span><span className="font-mono text-text">{c.f}</span></li>)}
        </ul>
      </div>
    </section>

    <div className="space-y-12">
      {BENCHMARK_TABLES.map((t, index) => <section key={t.title} aria-labelledby={`table-${index}`} className="bench-section">
        <p className="fx-kicker">Table {index + 1}</p>
        <h2 id={`table-${index}`} className="mt-2 text-xl font-semibold tracking-[-0.01em]">{t.title}</h2>
        <p className="mb-5 mt-2 max-w-[90ch] text-sm leading-relaxed text-muted">{t.note}</p>
        <div className="bench-table overflow-x-auto rounded-xl border border-panel-line" tabIndex={0} role="region" aria-label={`${t.title} table, scroll horizontally on small screens`}>
          <table className="w-full border-collapse text-left text-sm leading-relaxed">
            <caption className="sr-only">{t.title}</caption>
            <thead className="bg-panel text-muted"><tr>{t.headers.map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-5 py-4 font-medium">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-panel-line">{t.rows.map((row, rowIndex) => <tr key={`${rowIndex}-${row[0]}`} className={row[0].startsWith("TraceHound v2") ? "bench-ours" : "bg-bg"}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row" className="min-w-48 px-5 py-4 font-medium text-text">{cell}</th> : <td key={cellIndex} className={`px-5 py-4 text-text ${["verdict", "idea", "bar", "sentence the rule allows"].includes(t.headers[cellIndex]!) || t.headers[cellIndex]?.startsWith("result") ? "min-w-56" : "font-mono"}`}>{t.headers[cellIndex] === "verdict" ? <Verdict text={cell} /> : cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>)}
    </div>
    <aside className="bench-limits my-12 max-w-3xl" aria-labelledby="limits">
      <h2 id="limits" className="text-lg font-semibold">How to read these numbers</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">The test set is small: 10 pull requests and 23 golden findings. Differences of a few points are within noise. The intervals cover pull-request sampling only, not run-to-run spread or judge error.</p>
      <p className="mt-4 text-base leading-relaxed text-muted">v2 was chosen on the same dev set earlier decisions were tuned on. There is one v2 Cal.com run, and it is the second look at Cal.com. The judge (Nemotron 3 Super) and v2&apos;s reviewer (Nemotron 3.5 Super) are the same family. 3.5 returns partial reviews: a chunk that fails on invalid JSON contributes no findings, about 7 of 40 dev pull requests per run. Read the source report for the full limits, void runs and costs.</p>
    </aside>
  </ReviewShell>;
}
