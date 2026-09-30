import { execFileSync } from "node:child_process";
import path from "node:path";
import { aggregateEdges } from "./aggregate/edges.ts";
import { loadConfig, normalizeOverrides } from "./config.ts";
import { isTestFile, testLinks } from "./aggregate/tests.ts";
import { orphanWarnings, queueWarnings } from "./aggregate/warnings.ts";
import { EvidenceStore, type ExtractContext } from "./extract/evidence.ts";
import { extractEnv } from "./extract/env.ts";
import { extractBullmq } from "./extract/bullmq.ts";
import { extractErrorMessages } from "./extract/errors.ts";
import { extractHttp } from "./extract/http-routes.ts";
import { extractImports } from "./extract/imports.ts";
import { extractPrisma, extractPrismaSchema } from "./extract/prisma.ts";
import { extractRedis } from "./extract/redis.ts";
import { extractStartupCalls } from "./extract/startup.ts";
import { extractSymbols } from "./extract/symbols.ts";
import { cleanGitEnv } from "./git-env.ts";
import { groupComponents } from "./group/grouping.ts";
import { loadWorkspace, relPath } from "./load/workspace.ts";
import { SCHEMA_VERSION, Snapshot, type FileFacts } from "./schema.ts";
import { ANALYZER_VERSION } from "./version.ts";

function git(repoRoot: string, ...args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: cleanGitEnv() }).trim();
  } catch {
    return undefined;
  }
}

/** "https://github.com/acme/shop.git" → "acme/shop". */
function repoNameFromUrl(url: string | undefined, fallback: string): string {
  const match = url && /[/:]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
  return match ? match[1]! : fallback;
}

export interface AnalyzeOptions {
  now?: () => Date;
  /** tracehound.json path; defaults to <repo>/tracehound.json when present. */
  configPath?: string;
}

export function analyzeRepo(repoPath: string, options: AnalyzeOptions = {}): Snapshot {
  const ws = loadWorkspace(repoPath);
  const { config, source: configSource } = loadConfig(ws.repoRoot, options.configPath);
  const commitSha = git(ws.repoRoot, "rev-parse", "HEAD");
  if (!commitSha) throw new Error(`${ws.repoRoot} is not a git checkout; snapshots are keyed by commit SHA`);
  const url = git(ws.repoRoot, "remote", "get-url", "origin");

  const evidence = new EvidenceStore();
  const ctx: ExtractContext = { rel: (abs) => relPath(ws.repoRoot, abs), evidence };
  // tracehound.json `ignore`: left out of facts and components, but listed in the snapshot (and still
  // loaded by ts-morph, so symbols through them resolve)
  const ignoredBy = (file: string) => config.ignore.find((g) => path.matchesGlob(file, g));
  const ignored = [...ws.sourceFiles.map((sf) => ctx.rel(sf.getFilePath())), ...ws.prismaSchemas.map((s) => s.path)]
    .flatMap((file) => {
      const glob = ignoredBy(file);
      return glob ? [{ file, glob }] : [];
    })
    .sort((a, b) => a.file.localeCompare(b.file));
  const sourceFilesToAnalyze = ws.sourceFiles.filter((sf) => !ignoredBy(ctx.rel(sf.getFilePath())));
  const prismaSchemas = ws.prismaSchemas.filter((s) => !ignoredBy(s.path));
  for (const sf of sourceFilesToAnalyze) evidence.setFileText(ctx.rel(sf.getFilePath()), sf.getFullText());
  for (const schema of prismaSchemas) evidence.setFileText(schema.path, schema.text);

  const files: FileFacts[] = [];
  const schemaFacts = prismaSchemas.map((schema) => ({ schema, ...extractPrismaSchema(schema.path, schema.text, ctx) }));
  const modelNames = [...new Set(schemaFacts.flatMap((s) => s.models.map((m) => m.name)))];
  const entries = new Map(ws.packages.flatMap((p) => p.entryFiles.map((e) => [e.path, e.reason] as const)));

  for (const sf of sourceFilesToAnalyze) {
    const file = ctx.rel(sf.getFilePath());
    const pkg = ws.packages.find((p) => p.root === packageRootOf(ws.packages.map((x) => x.root), file))!;
    const http = extractHttp(sf, ctx);
    const redis = extractRedis(sf, ctx);
    const prisma = extractPrisma(sf, ctx, modelNames);
    const queueOps = extractBullmq(sf, ctx);
    const configEntry = config.entryPoints.find((g) => path.matchesGlob(file, g));
    // a file that constructs a BullMQ Worker runs as its own process (decision 035)
    const entryReason =
      entries.get(file) ??
      (configEntry ? `tracehound.json entryPoints (${configEntry})` : undefined) ??
      (queueOps.some((o) => o.role === "consume") ? "constructs a BullMQ Worker (process entry point)" : undefined);
    files.push({
      path: file,
      package: pkg.root,
      language: "ts",
      loc: sf.getEndLineNumber(),
      chars: sf.getFullText().length,
      isEntry: entryReason !== undefined,
      entryReason,
      imports: extractImports(sf, ctx),
      symbols: extractSymbols(sf),
      routes: http.routes,
      mounts: http.mounts,
      listens: http.listens,
      startupCalls: extractStartupCalls(sf, ctx),
      clients: [...redis.clients, ...prisma.clients],
      redisOps: redis.ops,
      prismaOps: prisma.ops,
      prismaModels: [],
      envReads: extractEnv(sf, ctx),
      errorMessages: extractErrorMessages(sf, ctx),
      ...(queueOps.length && { queueOps }),
    });
  }
  for (const { schema, models, datasource } of schemaFacts) {
    files.push({
      path: schema.path, package: schema.package, language: "prisma", loc: schema.text.split("\n").length, chars: schema.text.length, isEntry: false,
      imports: [], symbols: [], routes: [], mounts: [], listens: [], startupCalls: [], clients: [], redisOps: [], prismaOps: [], envReads: [], errorMessages: [],
      prismaModels: models, prismaDatasource: datasource,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  // Test files keep their facts but belong to no component; they link in via `tests` instead.
  const sourceFiles = files.filter((f) => !isTestFile(f.path));
  const grouping = groupComponents(sourceFiles, ws.packages, { overrides: normalizeOverrides(config) });
  const allEvidence = evidence.all();
  const edges = aggregateEdges(files, grouping, new Map(allEvidence.map((e) => [e.id, e])));

  return Snapshot.parse({
    schemaVersion: SCHEMA_VERSION,
    analyzerVersion: ANALYZER_VERSION,
    repo: { name: repoNameFromUrl(url, path.basename(ws.repoRoot)), url, commitSha },
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    components: grouping.components,
    edges,
    files,
    evidence: allEvidence,
    warnings: [
      ...orphanWarnings(sourceFiles, grouping.fileToComponent),
      ...queueWarnings(sourceFiles, grouping.fileToComponent, new Map(allEvidence.map((e) => [e.id, e]))),
      ...[...config.ignore, ...config.entryPoints]
        .filter((g) => ![...ignored.map((i) => i.file), ...files.map((f) => f.path)].some((f) => path.matchesGlob(f, g)))
        .map((g) => ({
          id: `override-unmatched:${g}`,
          kind: "override-unmatched" as const,
          severity: "warning" as const,
          message: `glob "${g}" in ${path.basename(configSource ?? "tracehound.json")} matched no files`,
        })),
      ...grouping.unmatchedOverrides.map((id) => ({
        id: `override-unmatched:${id}`,
        kind: "override-unmatched" as const,
        severity: "warning" as const,
        message: `override "${id}" in ${path.basename(configSource ?? "tracehound.json")} matched no files`,
      })),
    ],
    tests: testLinks(files, grouping.fileToComponent),
    llmCalls: [],
    ...(ignored.length && { ignored }),
  });
}

function packageRootOf(roots: string[], file: string): string {
  return roots.filter((r) => r === "." || file.startsWith(r + "/")).sort((a, b) => b.length - a.length)[0] ?? ".";
}
