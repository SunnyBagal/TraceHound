// Snapshot contract shared by the analyzer, API and web.
// Keep this file free of relative imports: it is consumed via `@tracehound/analyzer/schema`.
import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const ExtractorName = z.enum(["imports", "symbols", "http-routes", "redis", "prisma", "env"]);
export type ExtractorName = z.infer<typeof ExtractorName>;

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
  isEntry: z.boolean(),
  entryReason: z.string().optional(),
  imports: z.array(ImportFact),
  symbols: z.array(SymbolFact),
  routes: z.array(RouteFact),
  // `parent.use(prefix?, router)` — routers are keyed "file#variable"
  mounts: z.array(z.object({ parent: z.string(), router: z.string(), prefix: z.string().optional(), evidenceId: z.string() })),
  listens: z.array(z.object({ evidenceId: z.string() })),
  clients: z.array(ClientConstruction),
  redisOps: z.array(RedisOpFact),
  prismaOps: z.array(PrismaOpFact),
  prismaModels: z.array(z.object({ name: z.string(), evidenceId: z.string() })),
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
  package: z.string().optional(), // absent for infrastructure resources
  files: z.array(z.string()),
  entryPoints: z.array(z.object({ file: z.string(), symbol: z.string().optional(), reason: z.string() })),
  membership: z.array(z.object({ file: z.string(), reason: z.string() })),
  routes: z.array(z.object({ method: HttpMethod, path: z.string(), file: z.string(), evidenceId: z.string() })),
  envVars: z.array(z.string()),
  counts: z.object({ files: z.number().int(), routes: z.number().int(), envVars: z.number().int() }),
  resource: z
    .object({
      tech: z.enum(["redis", "postgres"]),
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
  confidence: z.number().min(0).max(1),
  label: z.string(),
});
export type ComponentEdge = z.infer<typeof ComponentEdge>;

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
  });
export type Snapshot = z.infer<typeof Snapshot>;

export const SnapshotSummary = z.object({
  repo: z.string(),
  commitSha: z.string(),
  analyzerVersion: z.string(),
  generatedAt: z.string(),
  components: z.number().int(),
  edges: z.number().int(),
});
export type SnapshotSummary = z.infer<typeof SnapshotSummary>;
