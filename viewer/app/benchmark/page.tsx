import { ReviewShell, ShellHero } from "@/components/ReviewShell";
import { BenchTable } from "@/components/benchmark/BenchTable";
import { BlindFigure } from "@/components/benchmark/BlindFigure";
import { Figure } from "@/components/benchmark/Figure";
import { FullFigure } from "@/components/benchmark/FullFigure";
import { ScatterFigure } from "@/components/benchmark/ScatterFigure";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BENCHMARK_REVISION, BENCHMARK_SOURCE } from "@/lib/benchmark";
import { HIDE_REVIEWER_NAMES } from "@/lib/benchmark-display";

import { aheadTools, ALL50, BLIND, blindRows, DEV, fullN, GAPS, gapSentence, preRegistered, RANK, rankOf, spread, table, tiedTools, tools, V1, v1Runs, v2, word } from "@/lib/benchmark-view";

/* the cost table's 3.5 Super row (the product's model), its median cell */
const COST = table("Dev cost per pull request");
const v1 = blindRows.find((r) => r.kind === "history")!;
const up = (now: string, before: string) => (Number.parseFloat(now) > Number.parseFloat(before) ? "up" : "down");
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
      <p className="text-sm leading-relaxed text-muted">Source: <a href={BENCHMARK_SOURCE} className="rv-inline-link">docs/bench/results.md</a> · decisions 067–071 · <span className="font-mono">{BENCHMARK_REVISION.slice(0, 7)}</span>{HIDE_REVIEWER_NAMES && <> · the five recorded reviewers are shown as Reviewer A–E here; their names are in results.md</>}</p>
    </ShellHero>

    <section aria-label="Headline numbers" className="bench-tiles mb-12" data-glow="green">
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

    <section className="bench-part" aria-labelledby="part-blind">
      <h2 id="part-blind" className="bench-h2">Blind test</h2>
      <Tabs defaultValue="f" className="bench-tabs">
        <TabsList variant="line" aria-label="Blind test charts">
          <TabsTrigger value="f">F by reviewer</TabsTrigger>
          <TabsTrigger value="pr">Precision vs recall</TabsTrigger>
        </TabsList>
        <TabsContent value="f">
          <Figure id="fig-blind" glow="violet" title="F by reviewer" meta="Cal.com · 10 pull requests · n = 23" captionTestId="bench-caption" caption={<>{gapSentence} PR-level paired bootstrap, 95% intervals.</>}>
            <BlindFigure />
          </Figure>
        </TabsContent>
        <TabsContent value="pr">
          <Figure id="fig-pr" glow="violet" title="Precision vs recall" meta="Cal.com · bench-judge-v1 counts" caption={<>Up and right is better. The dashed line runs from v1 to v2: precision {up(v2.p, v1.p)}, recall {up(v2.r, v1.r)}.</>}>
            <ScatterFigure />
          </Figure>
        </TabsContent>
      </Tabs>
      <BenchTable t={BLIND} id="table-blind" />
      <BenchTable t={GAPS} id="table-gaps" />
    </section>

    <section className="bench-part" data-band="light" aria-labelledby="part-full">
      <h2 id="part-full" className="bench-h2">Dev and blind sets together</h2>
      <Figure id="fig-full" glow="glacier" title="F by reviewer" meta={`n = ${fullN}`} caption="Ranked by bench-judge-v1, the scorer of record. v2 was tuned on the dev set.">
        <FullFigure />
      </Figure>
      <BenchTable t={ALL50} id="table-all-v1" />
      <BenchTable t={table("All 50 PRs, bench-judge-x1")} id="table-all-x1" />
    </section>

    <section className="bench-part" aria-labelledby="part-dev">
      <h2 id="part-dev" className="bench-h2">Dev set</h2>
      <BenchTable t={DEV} id="table-dev" />
      <BenchTable t={table("Precision levers tried on dev")} id="table-levers" />
    </section>

    <section className="bench-part" data-band="light" aria-labelledby="part-other">
      <h2 id="part-other" className="bench-h2">Other runs</h2>
      <BenchTable t={table("ReviewBench test runs")} id="table-reviewbench" />
      <BenchTable t={V1} id="table-v1" />
    </section>

    <section className="bench-part" aria-labelledby="part-cost">
      <h2 id="part-cost" className="bench-h2">Cost</h2>
      <BenchTable t={COST} id="table-cost" />
    </section>

    <aside className="bench-part bench-limits" data-glow="amber" aria-labelledby="limits">
      <h2 id="limits" className="bench-h2">Limits</h2>
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
