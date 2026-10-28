import { ReviewShell, ShellHero } from "@/components/ReviewShell";
import { BenchTable } from "@/components/benchmark/BenchTable";
import { BlindFigure } from "@/components/benchmark/BlindFigure";
import { Figure } from "@/components/benchmark/Figure";
import { FullFigure } from "@/components/benchmark/FullFigure";
import { GapFigure } from "@/components/benchmark/GapFigure";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";

import { aheadTools, BLIND, fullN, GAPS, gapSentence, preRegistered, RANK, rankOf, spread, table, tiedTools, tools, v1Runs, v2, word } from "@/lib/benchmark-view";

/* the cost table's 3.5 Super row (the product's model), its median cell */
const COST = table("Dev cost per pull request");
const COST_MEDIAN = COST.rows.find((r) => r[0].startsWith("3.5 Super"))![(COST.headers as readonly string[]).indexOf("cost median")]!;

export default function BenchmarkPage() {
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

    <Figure id="fig-blind" title="Blind test: F by reviewer" captionTestId="bench-caption" caption={<>{gapSentence} 10 blind pull requests, n = 23; PR-level paired bootstrap, 95% intervals, probably too narrow at this size. Hatched: v1, history rather than a competitor.</>}>
      <BlindFigure />
    </Figure>

    <Figure id="fig-gaps" title="v2 minus each reviewer, 95% intervals" caption="F points. An interval that crosses 0 is a tie.">
      <GapFigure />
    </Figure>

    <BenchTable t={BLIND} id="table-blind" />
    <BenchTable t={GAPS} id="table-gaps" />

    <Figure id="fig-full" title={`Dev and blind sets together: F by reviewer, n = ${fullN}`} caption="Ranked by bench-judge-v1, the scorer of record. v2 was tuned on the dev set; ranks are point estimates.">
      <FullFigure />
    </Figure>

    {BENCHMARK_TABLES.filter((t) => t !== BLIND && t !== GAPS).map((t, i) => <BenchTable key={t.title} t={t} id={`table-${i}`} />)}

    <aside className="bench-limits" aria-labelledby="limits">
      <h2 id="limits" className="bench-table-title">Limits</h2>
      <ul>
        <li>The test set is 10 pull requests and 23 golden findings. Differences of a few points are within noise.</li>
        <li>Intervals cover pull-request sampling only, not run-to-run spread or judge error.</li>
        <li>v2 was chosen on the dev set; its one Cal.com run is the second look at Cal.com.</li>
        <li>The judge (Nemotron 3 Super) and v2&apos;s reviewer (Nemotron 3.5 Super) are the same family.</li>
        <li>3.5 returns no findings for a chunk with invalid JSON: about 7 of 40 dev pull requests per run.</li>
      </ul>
    </aside>
  </ReviewShell>;
}
