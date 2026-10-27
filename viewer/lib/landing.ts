/**
 * Every name and number the landing page shows, with its source. test/landing.test.tsx checks
 * each one against the committed file it comes from, so the page can't drift from the repo.
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const GITHUB_URL = "https://github.com/SunnyBagal/TraceHound";
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const GRAPH_HREF = `${base}/graph`;

/**
 * Recall commit 7943212 (changesets/recall-7943212.json). Files and lines: `files` (11 added + 4
 * modified) and the sum of its linesAdded / linesRemoved, which equal GitHub's `stats` for the
 * commit (additions 1,913, deletions 127). Declarations and edges: `stats.declarations`
 * (added, modified; "formatting" edits are not counted as modified) and `stats.edges.added`.
 */
export const COMMIT = {
  changeSet: "recall-7943212",
  short: "7943212",
  files: 15,
  linesAdded: 1913,
  linesRemoved: 127,
  declarationsAdded: 3,
  declarationsModified: 5,
  edgesAdded: 1,
} as const;
export const COMMIT_LINES = COMMIT.linesAdded + COMMIT.linesRemoved; // 2,040
export const COMMIT_DECLARATIONS = COMMIT.declarationsAdded + COMMIT.declarationsModified; // 8
export const CHANGES_HREF = `${base}/graph?changes=${COMMIT.changeSet}`;

/** Grouping commas, fixed to en-US so the server and the browser print the same string. */
export const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The commit's 15 files, in the changeset's order (`files`: path, status, linesAdded,
 * linesRemoved). `declarations`: whether any counted declaration below is in the file. The 11
 * without one: the 9 under recall-backend/bench/, which configs/recall.tracehound.json ignores,
 * and 2 that are not TypeScript.
 */
export const COMMIT_FILES = [
  { path: "recall-backend/.gitignore", status: "modified", added: 3, removed: 0, declarations: false },
  { path: "recall-backend/bench/bench-search.ts", status: "added", added: 352, removed: 0, declarations: false },
  { path: "recall-backend/bench/quiet.ts", status: "added", added: 5, removed: 0, declarations: false },
  { path: "recall-backend/bench/README-search.md", status: "added", added: 237, removed: 0, declarations: false },
  { path: "recall-backend/bench/rigor/gen.ts", status: "added", added: 134, removed: 0, declarations: false },
  { path: "recall-backend/bench/rigor/report.ts", status: "added", added: 221, removed: 0, declarations: false },
  { path: "recall-backend/bench/rigor/run.ts", status: "added", added: 241, removed: 0, declarations: false },
  { path: "recall-backend/bench/rigor/seed.ts", status: "added", added: 143, removed: 0, declarations: false },
  { path: "recall-backend/bench/seed-vectors.ts", status: "added", added: 140, removed: 0, declarations: false },
  { path: "recall-backend/bench/shared.ts", status: "added", added: 225, removed: 0, declarations: false },
  { path: "recall-backend/config/db.ts", status: "modified", added: 4, removed: 1, declarations: true },
  { path: "recall-backend/db/schema.ts", status: "modified", added: 15, removed: 2, declarations: true },
  { path: "recall-backend/drizzle/0001_hnsw_index.sql", status: "added", added: 27, removed: 0, declarations: false },
  { path: "recall-backend/index.ts", status: "modified", added: 9, removed: 124, declarations: true },
  { path: "recall-backend/services/searchService.ts", status: "added", added: 157, removed: 0, declarations: true },
] as const;
export const IGNORED_BY_CONFIG = "recall-backend/bench/**";

/**
 * The 8 declarations counted in COMMIT (status added, or modified other than "formatting"), in
 * the changeset's order. `component` is the changeset's component id.
 */
export const DECLARATIONS = [
  { status: "added", name: "<module>", file: "recall-backend/services/searchService.ts", component: "recall-backend:brainly-server" },
  { status: "added", name: "hybridSearch", file: "recall-backend/services/searchService.ts", component: "recall-backend:brainly-server" },
  { status: "added", name: "HybridSearchTimings", file: "recall-backend/services/searchService.ts", component: "recall-backend:brainly-server" },
  { status: "modified", name: "db", file: "recall-backend/config/db.ts", component: "recall-backend:shared" },
  { status: "modified", name: "<module>", file: "recall-backend/db/schema.ts", component: "recall-backend:shared" },
  { status: "modified", name: "contents", file: "recall-backend/db/schema.ts", component: "recall-backend:shared" },
  { status: "modified", name: "<module>", file: "recall-backend/index.ts", component: "recall-backend:brainly-server" },
  { status: "modified", name: "route:GET /api/v1/search", file: "recall-backend/index.ts", component: "recall-backend:brainly-server" },
] as const;

/**
 * Names on the page are the names the viewer shows for Recall @ 5d2165a (the snapshot's `name`).
 * `model`: written by Nemotron Nano from extracted facts (naming.source "llm"); the page says so
 * in the captions. The others are set in configs/recall.tracehound.json.
 */
export const CHANGE_COMPONENTS = [
  { id: "recall-backend:brainly-server", name: "Recall API" },
  { id: "recall-backend:shared", name: "Shared Recall" },
] as const;

/** The one added edge (changeset `edges`, status added), cited at head. */
export const ADDED_EDGE = { from: "route:GET /api/v1/search", to: "hybridSearch", kind: "calls", file: "recall-backend/index.ts", line: 320 } as const;

/**
 * Recall @ 5d2165a (snapshots/5d2165aa…/0.10.0.json): the snapshot's component names (see
 * CHANGE_COMPONENTS) and all 6 of its edges, each with one of its evidence ids.
 */
export const RECALL = { short: "5d2165a", analyzerVersion: "0.10.0" } as const;

export const GRAPH_COMPONENTS = [
  { id: "recall-backend:brainly-server", name: "Recall API", kind: "api", model: true },
  { id: "recall-backend:queue", name: "Queue Config", kind: "service", model: false },
  { id: "bullmq:content-processing", name: "Content Processing Queue", kind: "queue", model: true },
  { id: "recall-backend:shared", name: "Shared Recall", kind: "library", model: true },
  { id: "recall-backend:worker", name: "Recall Backend Worker", kind: "worker", model: true },
] as const;
/** The snapshot's component count (all of them; the animation draws the five that have edges). */
export const RECALL_COMPONENTS = 7;
export type GraphComponentId = (typeof GRAPH_COMPONENTS)[number]["id"];

/** Files and the facts the extractors found in them (each fact is one evidence id). */
export const GRAPH_FILES = [
  { path: "recall-backend/index.ts", component: "recall-backend:brainly-server", fact: 'contentQueue.add("process-content")', evidence: "recall-backend/index.ts#L153-161:bullmq-queues" },
  { path: "recall-backend/config/queue.ts", component: "recall-backend:queue", fact: 'new Queue("content-processing")', evidence: "recall-backend/config/queue.ts#L10-21:bullmq-queues" },
  { path: "recall-backend/config/db.ts", component: "recall-backend:shared", fact: "env DATABASE_URL", evidence: "recall-backend/config/db.ts#L4-4:env" },
  { path: "recall-backend/worker.ts", component: "recall-backend:worker", fact: 'new Worker("content-processing")', evidence: "recall-backend/worker.ts#L111-121:bullmq-queues" },
] as const;

/** In drawing order: the queue path first, then the imports. */
export const GRAPH_EDGES: readonly { id: string; from: GraphComponentId; to: GraphComponentId; kind: string; evidence: string; file: string; line: number }[] = [
  { id: "recall-backend:brainly-server->bullmq:content-processing:produces", from: "recall-backend:brainly-server", to: "bullmq:content-processing", kind: "produces", evidence: "recall-backend/index.ts#L153-161:bullmq-queues", file: "index.ts", line: 153 },
  { id: "bullmq:content-processing->recall-backend:worker:consumes", from: "bullmq:content-processing", to: "recall-backend:worker", kind: "consumes", evidence: "recall-backend/worker.ts#L111-121:bullmq-queues", file: "worker.ts", line: 111 },
  { id: "recall-backend:brainly-server->recall-backend:queue:imports", from: "recall-backend:brainly-server", to: "recall-backend:queue", kind: "imports", evidence: "recall-backend/index.ts#L15-15:imports", file: "index.ts", line: 15 },
  { id: "recall-backend:brainly-server->recall-backend:shared:imports", from: "recall-backend:brainly-server", to: "recall-backend:shared", kind: "imports", evidence: "recall-backend/index.ts#L11-11:imports", file: "index.ts", line: 11 },
  { id: "recall-backend:worker->recall-backend:queue:imports", from: "recall-backend:worker", to: "recall-backend:queue", kind: "imports", evidence: "recall-backend/worker.ts#L8-8:imports", file: "worker.ts", line: 8 },
  { id: "recall-backend:worker->recall-backend:shared:imports", from: "recall-backend:worker", to: "recall-backend:shared", kind: "imports", evidence: "recall-backend/worker.ts#L6-6:imports", file: "worker.ts", line: 6 },
];
/**
 * The backend's files in the five components the animation draws (each component's `files` in
 * the snapshot; the queue has none), sorted by path. The frontend's component is not drawn.
 */
export const GRAPH_TREE: readonly { path: string; component: GraphComponentId }[] = [
  { path: "recall-backend/Usecontent.tsx", component: "recall-backend:shared" },
  { path: "recall-backend/config/db.ts", component: "recall-backend:shared" },
  { path: "recall-backend/config/queue.ts", component: "recall-backend:queue" },
  { path: "recall-backend/db/schema.ts", component: "recall-backend:shared" },
  { path: "recall-backend/drizzle.config.ts", component: "recall-backend:shared" },
  { path: "recall-backend/index.ts", component: "recall-backend:brainly-server" },
  { path: "recall-backend/middleware/middleware.ts", component: "recall-backend:brainly-server" },
  { path: "recall-backend/services/aiProcessor.ts", component: "recall-backend:worker" },
  { path: "recall-backend/services/embeddings.ts", component: "recall-backend:shared" },
  { path: "recall-backend/services/linkDetector.ts", component: "recall-backend:shared" },
  { path: "recall-backend/services/metadataFetcher.ts", component: "recall-backend:brainly-server" },
  { path: "recall-backend/services/searchService.ts", component: "recall-backend:brainly-server" },
  { path: "recall-backend/services/textExtractor.ts", component: "recall-backend:worker" },
  { path: "recall-backend/types/express.d.ts", component: "recall-backend:shared" },
  { path: "recall-backend/worker.ts", component: "recall-backend:worker" },
];

/** Edge labels drop this prefix (the animation says so). */
export const GRAPH_PATH_PREFIX = "recall-backend/";

/** The finder's rule id and its question, word for word from packages/analyzer/src/finder/rules.ts:71, with the route left as a placeholder. */
export const FINDER_RULE = {
  id: "route-without-auth",
  question: "Does <METHOD> <path> respond with data or perform its action for a caller who sends no credentials?",
} as const;

/** Model ids from the code: packages/analyzer/src/naming/llm.ts:14 (DEFAULT_MODEL) and config/prices.json:6. */
export const MODELS = [
  { name: "Nemotron Nano", id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", use: "The default for every model call." },
  { name: "Nemotron Super", id: "nvidia/nemotron-3-super-120b-a12b", use: "Only when a run names it with --model." },
] as const;

/** docs/eval/heldout-results.md, Results (decision 050): counted runs, n per model and arm. */
export const HELDOUT = {
  tasks: 8,
  repeats: 5,
  runs: 160,
  perArm: 40,
  graphOnRuns: 80,
  graphToolCalls: 0,
  rows: [
    { model: "Nemotron Nano", resolvedOn: 11, resolvedOff: 13, verifiedOn: 11, verifiedOff: 19 },
    { model: "Nemotron Super", resolvedOn: 28, resolvedOff: 26, verifiedOn: 30, verifiedOff: 31 },
  ],
} as const;

/**
 * `pnpm tracehound analyze` (packages/analyzer/src/cli.ts:120-129) as it prints for each published
 * snapshot: repo@sha · analyzer, then the counts line and the naming line, then the file it wrote.
 * The run time (`· Nms`) is not recorded in a snapshot, so it is left off. test/landing.test.tsx
 * checks every field against the snapshot file.
 */
export const ANALYZE_RUNS = [
  {
    label: "Recall",
    repo: "./Recall",
    config: "configs/recall.tracehound.json",
    model: null,
    snapshot: "snapshots/5d2165aa9654f17a148f6663bc478a3fd9f7fc6b/0.10.0.json",
    name: "SunnyBagal/Recall",
    short: "5d2165a",
    analyzerVersion: "0.10.0",
    files: 51, components: 7, edges: 6, evidence: 196, warnings: 2,
    named: 4, calls: 4, namingModel: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", tokens: 1461, cached: 4, cost: "0.00000",
  },
  {
    label: "CEX exchange",
    repo: "./cex-v2-boilercode",
    config: "configs/cex-v2-boilercode.tracehound.json",
    model: null,
    snapshot: "snapshots/da0e3d640a9c02f815fcca48f8328c94558cc058/0.10.0.json",
    name: "SunnyBagal/cex-v2-boilercode",
    short: "da0e3d6",
    analyzerVersion: "0.10.0",
    files: 22, components: 9, edges: 17, evidence: 115, warnings: 1,
    named: 7, calls: 7, namingModel: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", tokens: 2513, cached: 7, cost: "0.00000",
  },
  {
    label: "Recall · Super names",
    repo: "./Recall",
    config: "configs/recall.tracehound.json",
    model: "nvidia/nemotron-3-super-120b-a12b",
    snapshot: "snapshots/20ac149ea593ccc032426674ec36927da3f30f16/0.10.0.json",
    name: "SunnyBagal/Recall",
    short: "20ac149",
    analyzerVersion: "0.10.0",
    files: 55, components: 7, edges: 6, evidence: 214, warnings: 2,
    named: 4, calls: 4, namingModel: "nvidia/nemotron-3-super-120b-a12b", tokens: 1483, cached: 0, cost: "0.00053",
  },
] as const;

/** Edge labels per published snapshot (`confidenceLabel` counts), for the analyze terminal. */
export const EDGE_LABELS = {
  "5d2165a": { proven: 6, "resolved-default": 0, dynamic: 0 },
  da0e3d6: { proven: 13, "resolved-default": 2, dynamic: 2 },
  "20ac149": { proven: 6, "resolved-default": 0, dynamic: 0 },
} as const;

/**
 * The demo repo the reviews run on (snapshots/efc5844…/0.10.0.json) and, for each file its saved
 * pull requests change (public/reviews/SunnyBagal__tracehound-demo.json), the component that holds
 * it there, by the snapshot's name. Files in no component are not listed. The landing feeds these
 * to the graph's own overlay function (lib/pulls.ts prOverlay); the test checks them against the
 * snapshot.
 */
export const DEMO = {
  snapshot: "snapshots/efc58448e828167d909bedca5b3f7a697449c7fd/0.10.0.json",
  short: "efc5844",
  components: 7,
  edges: 6,
  evidence: 277,
  owners: [
    { id: "recall-backend:shared", name: "Shared Utilities", files: ["recall-backend/services/linkDetector.ts", "recall-backend/db/schema.ts"] },
    { id: "recall-backend:brainly-server", name: "Content API Service", files: ["recall-backend/middleware/middleware.ts", "recall-backend/index.ts"] },
    { id: "recall-backend:worker", name: "Recall Backend Worker", files: ["recall-backend/worker.ts"] },
  ],
} as const;
