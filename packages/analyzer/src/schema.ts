// Snapshot contract shared by the analyzer, API and web.
// Keep this file free of relative imports: it is consumed via `@tracehound/analyzer/schema`.
import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const ExtractorName = z.enum(["imports", "symbols", "http-routes", "redis", "prisma", "env", "startup"]);
export type ExtractorName = z.infer<typeof ExtractorName>;

/**
 * How a fact's operand was established — shown in the UI instead of the numeric confidence.
 * proven: literal / compiler-resolved · resolved-default: taken from a `?? "default"` fallback
 * (e.g. an env var's default) · dynamic: only known at runtime.
 */
export const Resolution = z.enum(["proven", "resolved-default", "dynamic"]);
export type Resolution = z.infer<typeof Resolution>;

export const LineRange = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});
export type LineRange = z.infer<typeof LineRange>;

export const Evidence = z.object({
  id: z.string(),
  file: z.string(),
  symbol: z.string().optional(),
  range: LineRange,
  extractor: ExtractorName,
  confidence: z.number().min(0).max(1),
  resolution: Resolution.optional(), // absent for facts that never back an edge (e.g. unresolved imports)
  detail: z.string(),
  snippet: z.object({ startLine: z.number().int().positive(), lines: z.array(z.string()) }),
});
export type Evidence = z.infer<typeof Evidence>;

export const ImportFact = z.object({
  specifier: z.string(),
  target: z.string().optional(), // repo-relative path when resolved to a file in the repo
  external: z.boolean(), // bare specifier resolving outside the repo (node_modules, builtins)
  typeOnly: z.boolean(),
  names: z.array(z.string()),
  evidenceId: z.string(),
});
export type ImportFact = z.infer<typeof ImportFact>;

export const SymbolKind = z.enum(["function", "class", "variable", "type", "interface"]);

export const SymbolFact = z.object({
  name: z.string(),
  kind: SymbolKind,
  exported: z.boolean(),
  range: LineRange,
});
export type SymbolFact = z.infer<typeof SymbolFact>;

export const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "ALL"]);

export const RouteFact = z.object({
  method: HttpMethod,
  path: z.string(),
  router: z.string(),
  handlers: z.array(z.string()),
  evidenceId: z.string(),
});
export type RouteFact = z.infer<typeof RouteFact>;

export const RedisRole = z.enum(["produce", "consume", "read", "write", "admin"]);
export type RedisRole = z.infer<typeof RedisRole>;

export const ResolvedValue = z.object({
  raw: z.string(), // source text of the operand
  value: z.string().optional(), // statically resolved value (may contain `*` for template holes)
});
export type ResolvedValue = z.infer<typeof ResolvedValue>;

export const RedisOpFact = z.object({
  client: z.string(),
  connection: z.string(), // env var / literal URL the client connects with, or "default"
  op: z.string(),
  role: RedisRole,
  key: ResolvedValue.optional(),
  evidenceId: z.string(),
});
export type RedisOpFact = z.infer<typeof RedisOpFact>;

export const PrismaOpFact = z.object({
  client: z.string(),
  clientDecl: z.string(), // "file#variable" of the PrismaClient declaration
  model: z.string(),
  op: z.string(),
  evidenceId: z.string(),
});
export type PrismaOpFact = z.infer<typeof PrismaOpFact>;

export const EnvReadFact = z.object({
  name: z.string(),
  evidenceId: z.string(),
});
export type EnvReadFact = z.infer<typeof EnvReadFact>;

export const ClientConstruction = z.object({
  tech: z.enum(["redis", "prisma"]),
  variable: z.string(),
  exported: z.boolean(),
  connection: z.string(),
  evidenceId: z.string(),
});
export type ClientConstruction = z.infer<typeof ClientConstruction>;

export const FileFacts = z.object({
  path: z.string(), // repo-relative, posix separators
  package: z.string(), // repo-relative package root ("." for the repo root)
  language: z.enum(["ts", "prisma"]),
  loc: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative().optional(), // 0.5.0+: source length, for chars/4 token estimates
  isEntry: z.boolean(),
  entryReason: z.string().optional(),
  imports: z.array(ImportFact),
  symbols: z.array(SymbolFact),
  routes: z.array(RouteFact),
  // `parent.use(prefix?, router)` — routers are keyed "file#variable"
  mounts: z.array(z.object({ parent: z.string(), router: z.string(), prefix: z.string().optional(), evidenceId: z.string() })),
  listens: z.array(z.object({ evidenceId: z.string() })),
  startupCalls: z.array(z.object({ callee: z.string(), evidenceId: z.string() })).default([]), // top-level calls (0.3.0+)
  clients: z.array(ClientConstruction),
  redisOps: z.array(RedisOpFact),
  prismaOps: z.array(PrismaOpFact),
  prismaModels: z.array(z.object({ name: z.string(), evidenceId: z.string() })),
  prismaDatasource: z.object({ provider: z.string(), evidenceId: z.string() }).optional(),
  envReads: z.array(EnvReadFact),
});
export type FileFacts = z.infer<typeof FileFacts>;

export const ComponentKind = z.enum(["api", "worker", "service", "library", "db", "cache", "queue"]);
export type ComponentKind = z.infer<typeof ComponentKind>;

export const Component = z.object({
  id: z.string(),
  name: z.string(),
  kind: ComponentKind,
  subtitle: z.string(),
  summary: z.string().optional(), // one-sentence description (LLM naming pass only)
  naming: z.object({
    source: z.enum(["heuristic", "override", "llm"]),
    heuristicName: z.string(), // always kept: the deterministic fallback
    model: z.string().optional(),
  }),
  package: z.string().optional(), // absent for infrastructure resources
  files: z.array(z.string()),
  entryPoints: z.array(z.object({ file: z.string(), symbol: z.string().optional(), reason: z.string() })),
  membership: z.array(z.object({ file: z.string(), reason: z.string() })),
  routes: z.array(z.object({ method: HttpMethod, path: z.string(), file: z.string(), evidenceId: z.string() })),
  envVars: z.array(z.string()),
  counts: z.object({ files: z.number().int(), routes: z.number().int(), envVars: z.number().int() }),
  resource: z
    .object({
      tech: z.enum(["redis", "prisma"]),
      engine: z.string().optional(), // e.g. "postgresql" from the prisma datasource
      connection: z.string(),
      keys: z.array(z.string()).optional(),
      models: z.array(z.string()).optional(),
    })
    .optional(),
});
export type Component = z.infer<typeof Component>;

export const EdgeKind = z.enum(["imports", "produces", "consumes", "reads", "writes", "queries"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const ComponentEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: EdgeKind,
  evidenceIds: z.array(z.string()).min(1), // product rule: no edge without evidence
  weight: z.number().int().positive(),
  confidence: z.number().min(0).max(1), // internal: max over evidence
  confidenceLabel: Resolution, // strongest resolution over evidence; what the UI shows
  label: z.string(),
});
export type ComponentEdge = z.infer<typeof ComponentEdge>;

/** TESTS: a test file (*.test.ts, *.spec.ts, __tests__/**) imports files of `componentId`. */
export const TestLink = z.object({
  file: z.string(),
  componentId: z.string(),
  evidenceIds: z.array(z.string()).min(1), // the import facts
});
export type TestLink = z.infer<typeof TestLink>;

export const LlmCall = z.object({
  purpose: z.literal("component-naming"),
  componentId: z.string(),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().optional(),
  completionTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  cached: z.boolean(), // served from .tracehound/cache: no request, $0
  accepted: z.boolean().optional(), // reply passed naming checks (normalization, identifiers, scope)
  rejectReason: z.string().optional(), // why a well-formed reply was not used
  estCostUSD: z.number().nonnegative(), // from config/prices.json (conservative if placeholder)
  ok: z.boolean(),
  error: z.string().optional(),
});
export type LlmCall = z.infer<typeof LlmCall>;

export const Warning = z.object({
  id: z.string(),
  kind: z.enum(["orphan-file", "override-unmatched"]),
  severity: z.enum(["info", "warning"]),
  file: z.string().optional(),
  componentId: z.string().optional(),
  message: z.string(),
});
export type Warning = z.infer<typeof Warning>;

export const Snapshot = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    analyzerVersion: z.string(),
    repo: z.object({ name: z.string(), url: z.string().optional(), commitSha: z.string().regex(/^[0-9a-f]{40}$/) }),
    generatedAt: z.string(),
    components: z.array(Component),
    edges: z.array(ComponentEdge),
    files: z.array(FileFacts),
    evidence: z.array(Evidence),
    warnings: z.array(Warning),
    tests: z.array(TestLink).default([]), // 0.4.0+; older snapshots didn't detect test files
    llmCalls: z.array(LlmCall), // every model call made while building this snapshot
  })
  .superRefine((snap, ctx) => {
    const evidenceIds = new Set(snap.evidence.map((e) => e.id));
    const componentIds = new Set(snap.components.map((c) => c.id));
    for (const edge of snap.edges) {
      for (const id of edge.evidenceIds) {
        if (!evidenceIds.has(id)) ctx.addIssue({ code: "custom", message: `edge ${edge.id} cites missing evidence ${id}` });
      }
      for (const end of [edge.source, edge.target]) {
        if (!componentIds.has(end)) ctx.addIssue({ code: "custom", message: `edge ${edge.id} references missing component ${end}` });
      }
    }
    for (const t of snap.tests) {
      if (!componentIds.has(t.componentId)) ctx.addIssue({ code: "custom", message: `test link ${t.file} references missing component ${t.componentId}` });
      for (const id of t.evidenceIds) {
        if (!evidenceIds.has(id)) ctx.addIssue({ code: "custom", message: `test link ${t.file} cites missing evidence ${id}` });
      }
    }
    for (const w of snap.warnings) {
      if (w.componentId && !componentIds.has(w.componentId)) ctx.addIssue({ code: "custom", message: `warning ${w.id} references missing component ${w.componentId}` });
    }
  });
export type Snapshot = z.infer<typeof Snapshot>;

export const ManifestEntry = z.object({
  repo: z.string(),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  analyzerVersion: z.string(),
  path: z.string(), // relative to the manifest, e.g. "<sha>/<analyzerVersion>.json"
  createdAt: z.string(),
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

/** snapshots/index.json — the static entry point the viewer loads first. */
export const SnapshotManifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  latest: ManifestEntry.nullable(),
  snapshots: z.array(ManifestEntry),
});
export type SnapshotManifest = z.infer<typeof SnapshotManifest>;

// ── Impact reports (`tracehound impact --json`) ─────────────────────────────────────────────
export const ImpactEvidenceRef = z.object({ id: z.string(), file: z.string(), line: z.number().int().positive() });

export const ImpactHop = z.object({
  edgeId: z.string(),
  kind: EdgeKind,
  source: z.string(),
  target: z.string(),
  from: z.string(), // walk order: the component closer to the change
  to: z.string(),
  walk: z.enum(["reverse", "bidirectional"]),
  confidenceLabel: Resolution,
  label: z.string(),
  evidence: ImpactEvidenceRef,
  depthCost: z.union([z.literal(0), z.literal(1)]).optional(), // 0 = leaving a broker (decision 024)
});
export type ImpactHop = z.infer<typeof ImpactHop>;

export const ImpactFile = z.object({
  status: z.enum(["added", "modified", "deleted", "renamed", "copied", "type-changed"]),
  path: z.string(), // path at head (for deleted files: the base path)
  basePath: z.string().optional(), // path at base; absent for added/copied files
  componentId: z.string().optional(), // from the base snapshot; undefined = unmapped
  reason: z.string().optional(),
});
export type ImpactFile = z.infer<typeof ImpactFile>;

export const ImpactReport = z.object({
  repo: z.string(),
  base: z.string().regex(/^[0-9a-f]{40}$/),
  head: z.string().regex(/^[0-9a-f]{40}$/),
  snapshot: z.object({
    analyzerVersion: z.string(),
    file: z.string(), // base snapshot, relative to the snapshots dir: "<sha>/<analyzerVersion>.json"
    path: z.string().optional(), // where the CLI read it from (display only)
  }),
  depth: z.number().int().nonnegative(),
  directionRule: z.string(),
  files: z.array(ImpactFile),
  changed: z.array(z.object({ id: z.string(), name: z.string(), modelWrittenName: z.boolean(), files: z.array(z.string()) })),
  affected: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      modelWrittenName: z.boolean(),
      depth: z.number().int().nonnegative(), // depth used (a broker crossing counts once), not chain length
      chain: z.array(ImpactHop), // changed component -> ... -> this one
      dynamic: z.boolean(), // some hop on the chain is only known at runtime
    }),
  ),
  unmapped: z.array(ImpactFile),
  linkedTests: z.array(z.object({ file: z.string(), componentId: z.string(), evidence: ImpactEvidenceRef })),
});
export type ImpactReport = z.infer<typeof ImpactReport>;

/** Every component, edge and evidence id an impact report cites must exist in its base snapshot. */
export function impactReferenceErrors(report: ImpactReport, snapshot: Snapshot): string[] {
  const components = new Set(snapshot.components.map((c) => c.id));
  const edges = new Set(snapshot.edges.map((e) => e.id));
  const evidence = new Set(snapshot.evidence.map((e) => e.id));
  const errors: string[] = [];
  const component = (id: string | undefined, where: string) => {
    if (id !== undefined && !components.has(id)) errors.push(`${where} references component "${id}", which is not in the base snapshot`);
  };
  if (snapshot.repo.commitSha !== report.base) errors.push(`base ${report.base} does not match the snapshot's commit ${snapshot.repo.commitSha}`);
  report.files.forEach((f) => component(f.componentId, `files[${f.path}]`));
  report.changed.forEach((c) => component(c.id, "changed"));
  report.linkedTests.forEach((t) => component(t.componentId, `linkedTests[${t.file}]`));
  for (const a of report.affected) {
    component(a.id, "affected");
    for (const h of a.chain) {
      for (const id of [h.source, h.target, h.from, h.to]) component(id, `affected[${a.id}].chain`);
      if (!edges.has(h.edgeId)) errors.push(`affected[${a.id}].chain references edge "${h.edgeId}", which is not in the base snapshot`);
      if (!evidence.has(h.evidence.id)) errors.push(`affected[${a.id}].chain references evidence "${h.evidence.id}", which is not in the base snapshot`);
    }
  }
  return [...new Set(errors)];
}
