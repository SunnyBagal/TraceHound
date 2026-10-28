import { Check } from "lucide-react";
import { table } from "@/lib/benchmark-view";
import { ANALYZE_RUNS, DEMO, fmt, GRAPH_COMPONENTS } from "@/lib/landing";
import { CatalogueFigure, CoinTubesFigure, GloveboxFigure, PatchPanelFigure } from "./Machines";
import { Reveal } from "./Reveal";

/*
 * The light "trust" section: four claims, each shown as a small machine drawn the Anatomy way
 * (components/landing/Machines.tsx). Counts are lib/landing.ts's (checked against the snapshots by
 * test/landing.test.tsx); costs are cells of the benchmark's cost table, found by title.
 */

const RECALL = ANALYZE_RUNS[0];
const CEX = ANALYZE_RUNS[1];
const REPOS = [
  { label: "RECALL", tone: "amber", name: `@${RECALL.short}`, sha: RECALL.short, components: RECALL.components, edges: RECALL.edges, evidence: RECALL.evidence },
  { label: "CEX", tone: "violet", name: `@${CEX.short}`, sha: CEX.short, components: CEX.components, edges: CEX.edges, evidence: CEX.evidence },
  { label: "DEMO", tone: "glacier", name: `@${DEMO.short}`, sha: DEMO.short, components: DEMO.components, edges: DEMO.edges, evidence: DEMO.evidence },
] as const;

/* the cost table: the two models' rows (3 Super, 3.5 Super), median and max per pull request */
const COST = table("Dev cost per pull request");
const at = (row: readonly string[], h: string) => row[(COST.headers as readonly string[]).indexOf(h)]!;
const COSTS = COST.rows.slice(0, 2).map((r) => ({ model: r[0].split(" (")[0]!, median: at(r, "cost median"), max: at(r, "cost max"), n: at(r, "n") }));
const PRODUCT = COSTS.find((c) => c.model.startsWith("3.5"))!;
const NAMED = GRAPH_COMPONENTS.filter((c) => c.model).length;

const GUARDS = [
  "Every edge: file, symbol, line range, extractor, confidence",
  "Each finding labelled model-generated, not tested",
  "The benchmark's test-set repository is refused, never reviewed",
] as const;

export function TrustSection() {
  return (
    <section aria-labelledby="trust-title" className="trust" data-testid="trust">
      <div className="lp-col trust-frame">
        <header className="trust-head">
          <h2 id="trust-title" className="trust-h2">Built to be checked.</h2>
          <p className="trust-lede">Every count below is read from a file committed in the repo, and a test fails if the page and the file disagree.</p>
        </header>
        <div className="trust-grid">
          <article className="trust-cell">
            <h3 className="trust-h3">Every edge points at code</h3>
            <p className="trust-text">Each snapshot files its evidence like a card catalogue: one card per fact, at a file, symbol and line. The drawers are pulled out as far as each snapshot has evidence.</p>
            <Reveal className="trust-art" threshold={0.25}>
              <CatalogueFigure drawers={REPOS.map((r) => ({ label: r.label, sha: r.sha, evidence: r.evidence, tone: r.tone }))} />
            </Reveal>
            <div className="trust-stats" data-testid="trust-stats">
              {REPOS.map((r) => (
                <div key={r.label} className="trust-row" data-tone={r.tone}>
                  <span className="trust-repo">
                    <i aria-hidden />
                    {r.label} <span className="trust-sha">{r.name}</span>
                  </span>
                  <span className="trust-stat">
                    <span className="trust-n">{fmt(r.evidence)}</span>
                    <span className="trust-l">evidence</span>
                  </span>
                  <span className="trust-stat">
                    <span className="trust-n">
                      {r.components} / {r.edges}
                    </span>
                    <span className="trust-l">components / edges</span>
                  </span>
                </div>
              ))}
            </div>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">No model draws the graph</h3>
            <p className="trust-text">
              Every cable on the panel is an edge, tagged with the line that proves it, and no model plugs one in. <span className="trust-em">The one model call is the label printer</span>: Nemotron Nano names {NAMED} of the {GRAPH_COMPONENTS.length} components from facts, and the call is logged in the snapshot.
            </p>
            <Reveal className="trust-art" threshold={0.25}>
              <PatchPanelFigure named={NAMED} total={GRAPH_COMPONENTS.length} />
            </Reveal>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">Cents per pull request</h3>
            <p className="trust-text">
              One coin is one cent. The reviewer the product runs costs <span className="trust-em">{PRODUCT.median} per pull request</span> at the median on {PRODUCT.model}; the red ring marks the costliest one. Judges excluded, pre-VAT.
            </p>
            <Reveal className="trust-art" testId="trust-cost" threshold={0.25}>
              <CoinTubesFigure
                tubes={COSTS.map((c, i) => ({ model: c.model, median: c.median, max: c.max, tone: i ? "green" : "violet" }))}
                label={COSTS.map((c) => `${c.model}: median ${c.median}, max ${c.max} per pull request`).join("; ")}
              />
            </Reveal>
            <p className="trust-note">Dev set, {COSTS.map((c) => `${c.model} n = ${c.n}`).join(", ")} · docs/bench/results.md</p>
          </article>
          <article className="trust-cell">
            <h3 className="trust-h3">Repairs happen in a sealed box</h3>
            <p className="trust-text">The repair agent works on the repo through the glove ports of a local Docker sandbox: not root, capabilities dropped, limits set, the network switched off before it starts.</p>
            <Reveal className="trust-art" threshold={0.25}>
              <GloveboxFigure />
            </Reveal>
            <ul className="trust-guards">
              {GUARDS.map((g) => (
                <li key={g}>
                  <span className="trust-box" aria-hidden>
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {g}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
