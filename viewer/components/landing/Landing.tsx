import { LogoButton, LogoLink } from "@/components/Logo";
import {
  ADDED_EDGE,
  CHANGES_HREF,
  COMMIT,
  COMMIT_FILES,
  COMMIT_DECLARATIONS,
  COMMIT_LINES,
  fmt,
  GITHUB_URL,
  GRAPH_COMPONENTS,
  GRAPH_EDGES,
  GRAPH_HREF,
  GRAPH_PATH_PREFIX,
  GRAPH_TREE,
  HELDOUT,
  IGNORED_BY_CONFIG,
  LICENSE_URL,
  MODELS,
  RECALL,
} from "@/lib/landing";
import { LEGACY_REDIRECT_SCRIPT } from "@/lib/legacy";
import { reviewsHref } from "@/lib/reviews";
import { AnimatedFigure } from "./AnimatedFigure";
import { DiffToDeclarations } from "./DiffToDeclarations";
import { inter, jetbrains, serif } from "./fonts";
import { Hero } from "./Hero";
import { FeatureTabs } from "./FeatureTabs";
import { FEATURES } from "./features";
import { Pipeline } from "./Pipeline";
import { PipelineWide } from "./PipelineWide";
import { RepoToGraph } from "./RepoToGraph";
import { RepoToGraphWide } from "./RepoToGraphWide";
import { RoadmapFlow } from "./RoadmapFlow";
import { Strike } from "./StrikeLine";
import { TrustSection } from "./TrustSection";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const KEPT_FILES = COMMIT_FILES.filter((f) => f.declarations).length;
const IGNORED_FILES = COMMIT_FILES.filter((f) => f.path.startsWith(IGNORED_BY_CONFIG.replace("**", ""))).length;

/** Each row's source: README.md and docs/decisions.md (the decision number is in the comment). */
const AGENTS = [
  // README.md (Analyzer); decision 035 (queues)
  { name: "Analyzer", does: "Extracts imports, routes, queues, Redis, Prisma and env reads, groups files into components, and writes a snapshot in which every edge cites a file, symbol and line range.", model: "no model" },
  // README.md (naming pass); decisions 020, 021
  { name: "Namer", does: "Names each component from the extracted facts, never the source, and keeps the heuristic name when a reply fails its checks.", model: "Nemotron Nano, reasoning off" },
  // decision 051
  { name: "Finder", does: "Runs rules over the graph and emits narrow questions that one test can answer.", model: "no model" },
  // README.md; decision 048
  { name: "Reproduce stage", does: "Writes one test for a claim; a fresh sandbox then checks that the test fails on an assertion, the same way twice.", model: "Nemotron Nano or Super" },
  // README.md; decisions 026, 029, 036
  { name: "Repair agent", does: "Edits the repo in a Docker sandbox with the network off; the harness verifies the patch with the repo's tests, independently of the agent.", model: "Nemotron Nano or Super" },
] as const;

/** Where things stand: CLAUDE.md (no API server; snapshots are static files; Docker is the sandbox of record, decision 036). */
const NOW = { title: "Snapshots, CLI and viewer", text: "The analyzer writes static snapshots; the agents run from the CLI in a local Docker sandbox." };

/** Planned, none shipped: the repo has no API server or GitHub connection (CLAUDE.md), no runtime events, no pull-request step (decision 052), and Nebius Sandboxes are parked (decision 036). */
const ROADMAP = [
  { title: "Connect a GitHub repo", text: "Analyze a repo you connect, not only a pinned snapshot." },
  { title: "Live code workings", text: "The graph shows the running system from real events." },
  { title: "Findings to a pull request", text: "The findings pipeline runs through to a pull request." },
  { title: "Nebius Sandboxes", text: "A second sandbox provider beside local Docker." },
] as const;

const NAV = [
  { label: "Graph", href: GRAPH_HREF },
  { label: "Reviews", href: reviewsHref() },
  { label: "Benchmark", href: `${base}/benchmark` },
  { label: "How it works", href: "#how-it-works" },
  { label: "Agents", href: "#agents" },
  { label: "Roadmap", href: "#roadmap" },
] as const;

const focusInk = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const focusAccent = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const h2 = "vh2";
/** every section below the hero: a hairline-ruled band on the night page (Vite's grid), rising in as it scrolls into view */
const glass = "lp-col lp-reveal vsection";

/** The NVIDIA eye in colour (public/icons/CREDITS.md). */
function NvidiaEye({ className = "h-3.5 w-5" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a vendored static icon
  return <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden className={`inline-block shrink-0 object-contain ${className}`} />;
}

function GithubMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

const mono = (text: React.ReactNode) => <span className="mono text-text">{text}</span>;
const modelNamed = GRAPH_COMPONENTS.filter((c) => c.model).map((c) => c.name);


const RUNS_ON = ["NVIDIA Nemotron", "Nebius Token Factory", "ts-morph", "React Flow", "ELK", "Docker sandbox"] as const;

export function Landing() {
  return (
    <div className={`landing relative isolate min-h-dvh text-text ${inter.variable} ${jetbrains.variable} ${serif.variable}`} data-testid="landing">
      {/* old viewer links (/?repo=, ?changes=, ?impact=) go on to /graph before anything paints */}
      <script dangerouslySetInnerHTML={{ __html: LEGACY_REDIRECT_SCRIPT }} />

      <nav aria-label="Main" className="lp-nav">
        <div className="lp-nav-bar">
          <LogoLink
            href={`${base}/`}
            label="TraceHound home"
            title="TraceHound"
            testId="nav-logo"
            markClassName="size-7"
            className="lp-nav-logo shrink-0 text-[18px] font-semibold tracking-[-0.01em]"
          >
            TraceHound
          </LogoLink>
          <ul className="lp-nav-links">
            {NAV.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={`lp-nav-link ${focusInk}`}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 items-center gap-2">
            <a href={GITHUB_URL} className={`lp-nav-link lp-nav-gh inline-flex items-center gap-1.5 ${focusInk}`}>
              <GithubMark className="size-4" />
              <span className="max-sm:sr-only">GitHub</span>
            </a>
            <a href={GRAPH_HREF} className={`lp-nav-cta ${focusInk}`}>
              <GithubMark className="size-3.5" />
              Connect GitHub
            </a>
          </div>
        </div>
      </nav>

      <Hero />

      {/* the caption under the picture, then the snow fades into the night the rest of the page sits in */}
      <div className="lp-fig">
        <div className="lp-fig-row">
          <span className="inline-flex items-center gap-2.5">
            <LogoButton className="text-[#252522]" markClassName="size-5" />
            <span className="lp-fig-label">Fig. 01 — The hound and the pack</span>
          </span>
          <em>Every edge points at code.</em>
        </div>
      </div>
      <div aria-hidden className="lp-dusk" />

      <section aria-label="Runs on" className="vgrid-row">
        <div className="lp-col vgrid-strip">
          <span className="vkicker">Runs on</span>
          <ul className="vgrid-logos">
            {RUNS_ON.map((name) => (
              <li key={name}>
                {name === "NVIDIA Nemotron" && <NvidiaEye className="h-3.5 w-5" />}
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="features-title" className="vband">
        <div className="lp-col pb-16 pt-24 text-center sm:pb-20 sm:pt-32">
          <p className="vkicker">The graph is the review surface</p>
          <h2 id="features-title" className="vh2 mx-auto mt-4 max-w-[18ch]">
            Read the architecture, not the diff.
          </h2>
          <p className="mx-auto mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted">
            TraceHound draws your repo as components and the evidence between them, then reviews each pull request against that map, and pins what it finds to the part of the system it touches.
          </p>
        </div>
        <FeatureTabs features={FEATURES} />
      </section>

      <TrustSection />

      <main className="flex flex-col">
        <section aria-labelledby="agents-write">
          <div className={glass}>
            <h2 id="agents-write" className="text-[clamp(2.4rem,1rem+5.4vw,5.75rem)] font-semibold leading-[1] tracking-[-0.035em] text-text">
              Understand what agents write.
            </h2>
            <p className="mt-2 text-[clamp(2.4rem,1rem+5.4vw,5.75rem)] font-semibold leading-[1] tracking-[-0.035em] text-text" data-testid="strike-line">
              Don&apos;t read <Strike>{fmt(COMMIT_LINES)}</Strike> lines. Read {COMMIT_DECLARATIONS}.
            </p>
            <p className="mt-8">
              <a href={CHANGES_HREF} className={`mono inline rounded-sm text-[14px] leading-relaxed text-muted underline decoration-line-strong underline-offset-4 hover:text-text hover:decoration-accent sm:text-[15px] ${focusAccent}`} data-testid="commit-caption">
                Recall commit {COMMIT.short} · {COMMIT.files} files · {fmt(COMMIT.linesAdded)} added, {fmt(COMMIT.linesRemoved)} removed → {COMMIT.declarationsAdded} declarations added,{" "}
                {COMMIT.declarationsModified} modified, {COMMIT.edgesAdded} new edge
              </a>
            </p>
            <div className="mt-14">
              <AnimatedFigure
                name="diff"
                layout="beside"
                title="Diff → declarations"
                steps={[
                  { title: "The pull request", text: <>{mono(COMMIT.files)} files, {mono(fmt(COMMIT_LINES))} lines.</>, t: 0 },
                  {
                    title: "Drop the files with no declaration",
                    text: (
                      <>
                        {mono(IGNORED_FILES)} under {mono("bench/")}, which Recall&apos;s config ignores; {mono(COMMIT_FILES.length - KEPT_FILES - IGNORED_FILES)} that are not TypeScript.
                      </>
                    ),
                    t: 1700,
                  },
                  {
                    title: `Open the ${KEPT_FILES} files left`,
                    text: (
                      <>
                        {mono(COMMIT_DECLARATIONS)} declarations: {mono(COMMIT.declarationsAdded)} added, {mono(COMMIT.declarationsModified)} modified.
                      </>
                    ),
                    t: 3200,
                  },
                  {
                    title: "Frame them by component",
                    text: (
                      <>
                        Recall API and Shared Recall, with the new {mono(ADDED_EDGE.kind)} edge at {mono(`${ADDED_EDGE.file.slice(GRAPH_PATH_PREFIX.length)}:${ADDED_EDGE.line}`)}.
                      </>
                    ),
                    t: 4700,
                  },
                ]}
                note={
                  <>
                    <NvidiaEye className="mt-1 h-3.5 w-5" />
                    <span>Component names written by Nemotron Nano from extracted facts.</span>
                  </>
                }
              >
                <DiffToDeclarations />
              </AnimatedFigure>
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-it-works-title" className="lp-anchor">
          <div className={glass}>
            <h2 id="how-it-works-title" className={h2}>
              How it works
            </h2>
            <div className="mt-12 flex flex-col gap-16">
              <AnimatedFigure
                name="graph"
                title="Repo → graph"
                wide={<RepoToGraphWide />}
                steps={[
                  { title: "Files", text: <>Recall&apos;s {mono(GRAPH_TREE.length)} backend files at {mono(RECALL.short)}.</>, t: 0 },
                  { title: "Facts", text: "The extractors find imports, queue calls and env reads, each at a file and line.", t: 1020 },
                  {
                    title: "Components",
                    text: (
                      <>
                        The files group into {mono(GRAPH_COMPONENTS.length - 1)} components; the queue they share becomes a fifth.
                      </>
                    ),
                    t: 2465,
                  },
                  {
                    title: "Edges",
                    text: (
                      <>
                        {mono(GRAPH_EDGES.length)} edges, each labelled with its evidence. Then a dot follows the queue: API, queue, worker.
                      </>
                    ),
                    t: 4505,
                  },
                ]}
                note={
                  <>
                    <NvidiaEye className="mt-1 h-3.5 w-5" />
                    <span>
                      {modelNamed.slice(0, -1).join(", ")} and {modelNamed[modelNamed.length - 1]} were named by Nemotron Nano; Queue Config is set in Recall&apos;s config. Paths are under{" "}
                      <span className="mono">{GRAPH_PATH_PREFIX}</span>; analyzer {RECALL.analyzerVersion}.
                    </span>
                  </>
                }
              >
                <RepoToGraph />
              </AnimatedFigure>
              <AnimatedFigure
                name="pipeline"
                title="Find → reproduce → repair → verify"
                wide={<PipelineWide />}
                steps={[
                  { title: "Find", text: "A rule over the graph emits a hypothesis: one narrow question. No model.", t: 0 },
                  { title: "Reproduce", text: "Nemotron writes one test. A fresh sandbox runs it twice; it must fail on an assertion in the same cases.", t: 1360 },
                  { title: "Repair", text: "Nemotron edits the repo in a Docker sandbox with the network off.", t: 3230 },
                  { title: "Verify", text: "The harness, not the agent, runs the reproduction test, the existing tests and the typecheck.", t: 4505 },
                ]}
                note="The finder's claims have not been through the reproduce stage yet; the reproduce stage and the repair agent have run on seeded claims and tasks."
              >
                <Pipeline />
              </AnimatedFigure>
            </div>
          </div>
        </section>

        <section id="agents" aria-labelledby="agents-title" className="lp-anchor">
          <div className={glass}>
            <h2 id="agents-title" className={h2}>
              Agents
            </h2>
            <ul className="mt-10 divide-y divide-panel-line border-y border-panel-line" data-testid="agent-rows">
              {AGENTS.map((a) => (
                <li key={a.name} className="grid gap-1 py-5 sm:grid-cols-[170px_1fr_260px] sm:gap-8">
                  <span className="text-[17px] font-semibold text-text">{a.name}</span>
                  <span className="text-[16px] leading-relaxed text-muted">{a.does}</span>
                  <span className="mono flex items-center gap-2 text-[13px] leading-relaxed text-text sm:justify-end">
                    {a.model.startsWith("Nemotron") && <NvidiaEye />}
                    {a.model}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-16 flex flex-wrap items-center gap-x-5 gap-y-3">
              <h3 className="text-xl font-semibold text-text">Models</h3>
              {/* eslint-disable-next-line @next/next/no-img-element -- a vendored static logo */}
              <img src={`${base}/icons/nvidia-color.svg`} alt="NVIDIA" width={351} height={259} className="h-9 w-auto" data-testid="nvidia-logo" />
            </div>
            <ul className="mt-5 divide-y divide-panel-line border-y border-panel-line">
              {MODELS.map((m) => (
                <li key={m.id} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-8">
                  <span className="flex items-center gap-2 text-[16px] font-semibold text-text">
                    <NvidiaEye className="h-4 w-6" />
                    {m.name}
                  </span>
                  <span className="mono break-all text-[13px] leading-relaxed text-text">{m.id}</span>
                  <span className="text-[15px] text-muted">{m.use}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-16 text-xl font-semibold text-text">Held-out evaluation</h3>
            <p className="mt-4 max-w-prose text-[16px] leading-relaxed text-muted">
              <span className="mono text-text">{HELDOUT.tasks}</span> seeded tasks, graph on and graph off, Nano and Super, <span className="mono text-text">{HELDOUT.repeats}</span> repeats
              each: <span className="mono text-text">{HELDOUT.runs}</span> runs. The graph did not help the repair agent. It called a graph tool{" "}
              <span className="mono text-text">{HELDOUT.graphToolCalls}</span> times in <span className="mono text-text">{HELDOUT.graphOnRuns}</span> graph-on runs.
            </p>
            <div className="mt-6 max-w-[640px] overflow-hidden rounded-xl border border-panel-line">
              <table className="w-full border-collapse text-left text-[15px]" data-testid="heldout-table">
                <caption className="sr-only">Held-out results, out of {HELDOUT.perArm} runs per model and arm</caption>
                <thead className="bg-panel text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Model
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Graph on
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Graph off
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-panel-line">
                  {HELDOUT.rows.flatMap((r) => [
                    { label: `${r.model}, resolved`, on: r.resolvedOn, off: r.resolvedOff },
                    { label: `${r.model}, verified at stop`, on: r.verifiedOn, off: r.verifiedOff },
                  ]).map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-4 py-3 font-medium text-text">
                        {row.label}
                      </th>
                      <td className="mono px-4 py-3 text-text">
                        {row.on} of {HELDOUT.perArm}
                      </td>
                      <td className="mono px-4 py-3 text-text">
                        {row.off} of {HELDOUT.perArm}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[15px] text-muted">
              <a href={`${GITHUB_URL}/blob/main/docs/eval/heldout-results.md`} className={`mono rounded-sm text-[13px] underline decoration-line-strong underline-offset-4 hover:text-text ${focusAccent}`}>
                docs/eval/heldout-results.md
              </a>
            </p>
          </div>
        </section>

        <section id="roadmap" aria-labelledby="roadmap-title" className="lp-anchor">
          <div className={glass}>
            <h2 id="roadmap-title" className={h2}>
              Roadmap
            </h2>
            <div className="mt-12">
              <RoadmapFlow now={NOW} items={ROADMAP} />
            </div>
          </div>
        </section>
      </main>

      <section aria-labelledby="cta-title" className="vband vcta">
        <div className="lp-col py-24 text-center sm:py-32">
          <h2 id="cta-title" className="vh2 mx-auto max-w-[16ch]">See your pull requests on the map.</h2>
          <p className="mx-auto mt-5 max-w-[48ch] text-[17px] leading-relaxed text-muted">Open the graph, pick a pull request, and read its findings where they land.</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={GRAPH_HREF} className={`vbtn vbtn-primary ${focusAccent}`}>
              <GithubMark className="size-4" /> Connect GitHub
            </a>
            <a href={reviewsHref()} className={`vbtn ${focusAccent}`}>Read the reviews</a>
            <a href={`${base}/benchmark`} className={`vbtn ${focusAccent}`}>Benchmark</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="lp-col flex flex-wrap items-center justify-between gap-4 py-8 text-[14px] text-muted">
          <span className="inline-flex items-center gap-2 text-text">TraceHound <span className="text-faint">· graph + reviewer on NVIDIA Nemotron</span></span>
          <span className="flex items-center gap-6">
            <a href={GITHUB_URL} className={`rounded-sm hover:text-text ${focusAccent}`}>
              GitHub
            </a>
            <a href={LICENSE_URL} className={`rounded-sm hover:text-text ${focusAccent}`}>
              MIT License
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
