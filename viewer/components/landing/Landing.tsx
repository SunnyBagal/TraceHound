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
import { AnimatedFigure } from "./AnimatedFigure";
import { DiffToDeclarations } from "./DiffToDeclarations";
import { bricolage, jetbrains } from "./fonts";
import { Pipeline } from "./Pipeline";
import { PipelineWide } from "./PipelineWide";
import { RepoToGraph } from "./RepoToGraph";
import { RepoToGraphWide } from "./RepoToGraphWide";
import { RoadmapFlow } from "./RoadmapFlow";
import { Strike } from "./StrikeLine";

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
  { label: "How it works", href: "#how-it-works" },
  { label: "Agents", href: "#agents" },
  { label: "Roadmap", href: "#roadmap" },
] as const;

const focusInk = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const focusAccent = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const h2 = "text-[clamp(2rem,1.3rem+2.6vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-text";
/** every section below the hero: a dark glass card over the sky, rising in as it scrolls into view */
const glass = "lp-col lp-reveal rounded-[28px] border border-glass-line bg-glass p-5 backdrop-blur-xl sm:p-10 lg:p-14";

/** The NVIDIA eye in colour (public/icons/CREDITS.md). */
function NvidiaEye({ className = "h-3.5 w-5" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a vendored static icon
  return <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden className={`inline-block shrink-0 object-contain ${className}`} />;
}

const mono = (text: React.ReactNode) => <span className="mono text-text">{text}</span>;
const modelNamed = GRAPH_COMPONENTS.filter((c) => c.model).map((c) => c.name);

export function Landing() {
  return (
    <div className={`landing relative isolate min-h-dvh text-text ${bricolage.variable} ${jetbrains.variable}`} data-testid="landing">
      {/* old viewer links (/?repo=, ?changes=, ?impact=) go on to /graph before anything paints */}
      <script dangerouslySetInnerHTML={{ __html: LEGACY_REDIRECT_SCRIPT }} />

      {/* the sky, fixed behind the whole page: the hero shows it bare, every section below sits on glass over it */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-page">
        <picture>
          <source media="(max-width: 640px)" srcSet={`${base}/landing/hero-phone.webp`} type="image/webp" width={706} height={942} />
          {/* eslint-disable-next-line @next/next/no-img-element -- a static export: next/image would not optimise it */}
          <img
            src={`${base}/landing/hero-1920.webp`}
            alt=""
            width={1920}
            height={1084}
            fetchPriority="high"
            className="lp-sky h-full w-full object-cover"
            data-testid="hero-image"
          />
        </picture>
      </div>

      <header className="flex min-h-[max(600px,min(100svh,980px))] flex-col">
        <nav aria-label="Main" className="lp-col pt-4 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl bg-veil px-4 py-2.5 text-ink backdrop-blur-md sm:px-5">
            <LogoLink
              href={`${base}/`}
              label="TraceHound home"
              title="TraceHound"
              testId="nav-logo"
              markClassName="size-7"
              className="text-[19px] font-bold tracking-[-0.01em] text-ink! focus-visible:outline-ink!"
            >
              TraceHound
            </LogoLink>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-medium sm:gap-x-5 sm:text-[15px]">
              {NAV.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={`rounded-sm underline-offset-4 hover:underline ${focusInk}`}>
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={GITHUB_URL} className={`rounded-sm underline-offset-4 hover:underline ${focusInk}`}>
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </nav>

        <div className="lp-col flex flex-1 items-center justify-center py-14">
          <div className="lp-hero-drift flex w-full max-w-[900px] flex-col items-center rounded-[28px] bg-veil px-5 py-9 text-center text-ink backdrop-blur-md sm:px-12 sm:py-12" data-testid="hero-veil">
            <LogoButton className="text-ink" markClassName="size-24" />
            <h1 className="mt-6 text-[clamp(2.25rem,1.35rem+3.4vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.025em] text-ink">
              Understand your code. <br className="hidden sm:inline" />
              Fix what breaks.
            </h1>
            <p className="mt-5 max-w-[34ch] text-[clamp(1.05rem,0.95rem+0.5vw,1.3rem)] font-medium leading-snug text-ink" data-testid="hero-line">
              AI agents that review and test pull requests with full context of the codebase.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href={GRAPH_HREF} className={`inline-flex h-12 items-center rounded-full bg-ink px-7 text-[16px] font-semibold text-on-ink hover:bg-ink/85 ${focusInk}`} data-testid="get-started">
                Get started
              </a>
              <a href="#agents" className={`inline-flex h-12 items-center rounded-full border-2 border-ink px-7 text-[16px] font-semibold text-ink hover:bg-white/40 ${focusInk}`}>
                Agents
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-10 pb-10 sm:gap-14 sm:pb-14">
        <section aria-labelledby="agents-write">
          <div className={glass}>
            <h2 id="agents-write" className="text-[clamp(2.6rem,1rem+6.6vw,7rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-text">
              Understand what agents write.
            </h2>
            <p className="mt-2 text-[clamp(2.6rem,1rem+6.6vw,7rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-text" data-testid="strike-line">
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

      <footer className="pb-8">
        <div className="lp-col flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-glass-line bg-glass px-6 py-5 text-[15px] text-muted backdrop-blur-xl">
          <a href={GITHUB_URL} className={`rounded-sm hover:text-text ${focusAccent}`}>
            GitHub
          </a>
          <a href={LICENSE_URL} className={`rounded-sm hover:text-text ${focusAccent}`}>
            MIT License
          </a>
        </div>
      </footer>
    </div>
  );
}
