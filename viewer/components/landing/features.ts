import demoReviews from "@/public/reviews/SunnyBagal__tracehound-demo.json";
import { ALL50, aheadTools, BLIND, table, tiedTools, tools, v2, word } from "@/lib/benchmark-view";
import { ANALYZE_RUNS, DEMO, EDGE_LABELS, fmt, GRAPH_COMPONENTS, GRAPH_EDGES, RECALL } from "@/lib/landing";
import { findingParts, prOverlay } from "@/lib/pulls";
import { MODEL_DISCLOSURE, reviewFindings, type GitHubComment, type TraceReview } from "@/lib/reviews";
import type { Snapshot } from "@/lib/types";
import type { Scenario, Seg, TermLine } from "./Terminal";

/*
 * The landing's feature tabs. Every terminal line is the repo's: the analyzer's own output format
 * filled from published snapshots (lib/landing.ts, checked against them), the demo's saved reviews,
 * the graph's overlay function run on them, and cells of the benchmark's tables. Built at build
 * time; the page ships only the strings.
 */
export interface Feature {
  id: string;
  tab: string;
  icon: "graph" | "review" | "pin" | "verify";
  tone: "amber" | "violet" | "glacier" | "green";
  kicker: string;
  title: string;
  text: string;
  bullets: string[];
  powered: { name: string; nvidia?: boolean }[];
  scenarios: Scenario[];
}

const blank: TermLine = [];
const dim = (text: string): Seg => ["dim", text];
const txt = (text: string): Seg => ["text", text];

/* ---------- analyze: `pnpm tracehound analyze` as it prints (cli.ts:120-129) ---------- */
const analyze: Scenario[] = ANALYZE_RUNS.map((r) => {
  const labels = EDGE_LABELS[r.short];
  const counts: TermLine = [txt(`${r.files}`), dim(" files · "), txt(`${r.components}`), dim(" components · "), txt(`${r.edges}`), dim(" edges · "), txt(`${r.evidence}`), dim(" evidence · "), txt(`${r.warnings}`), dim(" warnings")];
  const edgeLine: TermLine = [dim("# every edge cites code: "), ["ok", `${labels.proven} proven`], ...(labels["resolved-default"] ? [dim(" · "), ["hi", `${labels["resolved-default"]} resolved-default`] as Seg] : []), ...(labels.dynamic ? [dim(" · "), ["bad", `${labels.dynamic} dynamic`] as Seg] : [])];
  const first = GRAPH_EDGES[0]!;
  const name = (id: string) => GRAPH_COMPONENTS.find((c) => c.id === id)!.name;
  return {
    label: r.label,
    prompt: "$",
    command: `pnpm tracehound analyze --repo ${r.repo} --config ${r.config}${r.model ? ` --model ${r.model}` : ""}`,
    lines: [
      [txt(`${r.name}@${r.short}`), dim(` · analyzer ${r.analyzerVersion}`)],
      counts,
      [dim("naming: "), txt(`${r.named}/${r.calls}`), dim(` named by ${r.namingModel} · ${fmt(r.tokens)} tokens · ${r.cached} cached · ~$${r.cost}`)],
      [dim("→\u00a0"), ["path", r.snapshot]],
      blank,
      edgeLine,
      ...(r.short === RECALL.short ? [[dim("# "), ["hi", name(first.from)], dim(` -${first.kind}-> `), txt(name(first.to)), dim(`  ${first.file}:${first.line}`)] as TermLine] : []),
    ],
  };
});

/* ---------- review and pin: the demo repo's saved reviews (public/reviews/) ---------- */
type Saved = (typeof demoReviews.pulls)[number];
const findingsOf = (p: Saved) => (p.review ? reviewFindings(p.review as TraceReview, p.comments as unknown as GitHubComment[]) : []);
const shortPath = (path: string) => path.split("/").pop()!;
const byNumber = (n: number) => demoReviews.pulls.find((p) => p.pull.number === n)!;
const REVIEWED = demoReviews.pulls.filter((p) => p.review).map((p) => p.pull.number);
const UNREVIEWED = demoReviews.pulls.find((p) => !p.review)!.pull.number;
const repoName = demoReviews.repo.split("/")[1]!;

const review: Scenario[] = [...REVIEWED, UNREVIEWED].map((n) => {
  const p = byNumber(n);
  const f = p.review?.footer;
  const findings = findingsOf(p);
  return {
    label: `#${n}${f ? "" : " · no review"}`,
    prompt: "#",
    command: `pull_request #${n} on ${demoReviews.repo}`,
    lines: f
      ? [
          [txt(p.pull.title)],
          [dim(`${f.pipeline} · pool ${f.pool} · kept ${f.kept} · posted ${f.posted} · fixes ${f.fixes.valid}/${f.fixes.attempted} valid`)],
          // the action's own log line (packages/action/src/action.ts)
          [["ok", `TraceHound: posted review with ${f.posted} findings.`]],
          blank,
          ...findings.flatMap((x): TermLine[] => [[["path", `${x.path}${x.line ? `:${x.line}` : ""}`]], [txt(findingParts(x.body).title)], [dim(`${x.suggestion !== undefined ? "suggested fix · " : ""}${MODEL_DISCLOSURE}`)]]),
        ]
      : [[txt(p.pull.title)], blank, [dim("No TraceHound review with a data footer has been posted on this pull request.")]],
  };
});

/** The demo snapshot's components, as far as the saved pull requests need them (lib/landing.ts DEMO). */
const demoSnapshot = { components: DEMO.owners.map((o) => ({ ...o, files: [...o.files] })) } as unknown as Snapshot;
const ownerName = (id: string) => DEMO.owners.find((o) => o.id === id)!.name;
const pin: Scenario[] = REVIEWED.map((n) => {
  const p = byNumber(n);
  const o = prOverlay(demoSnapshot, n, p.files, findingsOf(p));
  const lit = [...o.touched.entries()];
  const dimmed = DEMO.components - lit.length;
  return {
    label: `#${n}`,
    prompt: "$",
    command: `open /graph?repo=${repoName}&pr=${n}`,
    lines: [
      [dim(`${repoName} @ ${DEMO.short} · ${DEMO.components} components · an overlay: no new edges`)],
      blank,
      ...lit.map(([id, files]): TermLine => [["hi", "● lit     "], txt(ownerName(id)), dim(`  ← ${files.map(shortPath).join(", ")}`)]),
      [dim(`○ dimmed  ${dimmed} other components`)],
      ...o.outsideFiles.map((f): TermLine => [dim(`· outside ${f} (in no component)`)]),
      blank,
      ...[...o.findings.entries()].flatMap(([id, fs]): TermLine[] => [[["hi", "▲ pinned  "], txt(`${fs.length} finding${fs.length === 1 ? "" : "s"} → ${ownerName(id)}`)], ...fs.map((x): TermLine => [["path", `          ${x.path}:${x.line}`]])]),
    ],
  };
});

/* ---------- verify: cells of the benchmark's tables (lib/benchmark-view.ts) ---------- */
const cell = (t: typeof BLIND | typeof ALL50, row: readonly string[], header: string) => row[(t.headers as readonly string[]).indexOf(header)]!;
const blindRow = BLIND.rows.find((r) => r[0].startsWith("TraceHound v2"))!;
const blindN = /^(\d+) blind pull requests, n = (\d+)/.exec(BLIND.note)!;
const allRow = ALL50.rows.find((r) => r[0].includes("pre-registered"))!;
const allN = /n = (\d+)/.exec(ALL50.note)![1];
const devShare = /(\d+) of the 50 pull requests are the dev set/.exec(ALL50.note)![1];
const COST = table("Dev cost per pull request");
const costCol = (h: string) => (COST.headers as readonly string[]).indexOf(h);
const verify: Scenario[] = [
  {
    label: "Blind test",
    prompt: "#",
    command: "docs/bench/results.md · the blind test",
    lines: [
      [dim(`${blindN[1]} blind pull requests · n = ${blindN[2]} · bench-judge-v1`)],
      blank,
      [txt("TraceHound v2  "), dim("TP "), txt(cell(BLIND, blindRow, "TP")), dim(" · FP "), txt(cell(BLIND, blindRow, "FP")), dim(" · FN "), txt(cell(BLIND, blindRow, "FN"))],
      [dim("precision  "), txt(cell(BLIND, blindRow, "P (n)"))],
      [dim("recall     "), txt(cell(BLIND, blindRow, "R (n)"))],
      [dim("F          "), ["hi", v2.cell], dim("  point estimate")],
      blank,
      [["ok", "≈ "], txt(`statistically tied with ${word(tiedTools.length)} of ${word(tools.length)} commercial reviewers`)],
      [["ok", "↑ "], txt(`ahead of ${word(aheadTools.length)}`), dim(" · 95% intervals, paired bootstrap")],
    ],
  },
  {
    label: "All 50 PRs",
    prompt: "#",
    command: "docs/bench/results.md · all 50 pull requests",
    lines: [
      [dim(`dev and test sets · n = ${allN} · bench-judge-v1`)],
      blank,
      [txt("TraceHound v2 (pre-registered)")],
      [dim("precision  "), txt(cell(ALL50, allRow, "P (n)"))],
      [dim("recall     "), txt(cell(ALL50, allRow, "R (n)"))],
      [dim("F          "), ["hi", cell(ALL50, allRow, "F")]],
      [dim("rank       "), txt(`${cell(ALL50, allRow, "rank of 6 (point estimate)")} of 6`), dim("  point estimate")],
      blank,
      [dim(`# ${devShare} of the 50 are the dev set v2 was tuned on`)],
    ],
  },
  {
    label: "Cost per PR",
    prompt: "#",
    command: "docs/bench/results.md · dev cost per pull request",
    lines: [
      [dim("pipeline only · judges excluded · pre-VAT")],
      blank,
      ...COST.rows.slice(0, 2).map((r): TermLine => [txt(r[0].split(" (")[0]!.padEnd(11)), dim("median "), ["hi", r[costCol("cost median")]!], dim(" · max "), txt(r[costCol("cost max")]!), dim(` · n ${r[costCol("n")]}`)]),
    ],
  },
];

export const FEATURES: Feature[] = [
  {
    id: "analyze",
    tab: "analyze",
    icon: "graph",
    tone: "amber",
    kicker: "TraceHound analyze",
    title: "Your repo as a map, every edge cited",
    text: "The analyzer reads a TypeScript repo with the compiler, groups its files into components, and draws only the edges it can point to in code.",
    bullets: ["Imports, routes, BullMQ queues, Redis, Prisma and `env` reads", "Every edge cites a file, a symbol, a line range and its extractor", "`proven`, `resolved-default` or `dynamic`: each edge says how sure it is", "Nemotron Nano names components from facts, never from source"],
    powered: [{ name: "ts-morph" }, { name: "ELK" }],
    scenarios: analyze,
  },
  {
    id: "review",
    tab: "review",
    icon: "review",
    tone: "violet",
    kicker: "TraceHound review",
    title: "Reviews that say what breaks",
    text: "A GitHub Action reviews each pull request with Nemotron and posts the findings inline: the effect first, then the file and line, then a fix you can commit.",
    bullets: ["Two reviewers: the diff alone, and the diff with repository context", "A verifier keeps only findings the code supports", "Each fix is a GitHub `suggestion`, labelled model-generated, not tested", "Saved reviews stay readable when GitHub's rate limit runs out"],
    powered: [{ name: "NVIDIA Nemotron", nvidia: true }, { name: "Nebius Token Factory" }],
    scenarios: review,
  },
  {
    id: "pin",
    tab: "pin",
    icon: "pin",
    tone: "glacier",
    kicker: "TraceHound graph",
    title: "Findings pinned where they land",
    text: "Pick a pull request on the graph: the components it changed light up, the rest dim, and each finding hangs from the component that holds its file.",
    bullets: ["Changed files map to components through the snapshot, never a guess", "Files in no component are listed, never dropped", "The pull request is an overlay, labelled as one: it adds no edges", "Open any finding on GitHub from the graph"],
    powered: [{ name: "React Flow" }, { name: "ELK" }],
    scenarios: pin,
  },
  {
    id: "verify",
    tab: "verify",
    icon: "verify",
    tone: "green",
    kicker: "TraceHound benchmark",
    title: "Numbers you can check",
    text: "The reviewer is scored on a public benchmark of 50 pull requests, with 10 held back as a blind test. Every loss is on the page.",
    bullets: ["An LLM judge maps each comment to a golden finding, or to none", "95% intervals from a pull-request-level bootstrap", "Plans pre-registered before the blind run", "Aggregate tables only, copied from `docs/bench/results.md`"],
    powered: [{ name: "Nemotron 3 Super judge", nvidia: true }],
    scenarios: verify,
  },
];
