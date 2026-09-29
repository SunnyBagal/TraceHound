import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeRepo } from "./analyze.ts";
import { readManifest, upsertManifest, writeManifest } from "./manifest.ts";
import { formatCall, nameComponentsWithLlm } from "./naming/llm.ts";
import { Snapshot } from "./schema.ts";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    config: { type: "string" },
    naming: { type: "string", default: "llm" }, // "llm" (falls back per component) | "heuristic"
    out: { type: "string", default: "snapshots" },
  },
});
if (!values.repo) {
  console.error("usage: node src/cli.ts --repo <path> [--config <tracehound.json>] [--naming llm|heuristic] [--out <dir>]");
  process.exit(1);
}

const started = performance.now();
let snapshot = analyzeRepo(values.repo, { configPath: values.config });

const apiKey = process.env.NEBIUS_API_KEY;
if (values.naming === "llm" && apiKey) {
  snapshot = Snapshot.parse(
    await nameComponentsWithLlm(snapshot, {
      apiKey,
      baseUrl: process.env.NEBIUS_BASE_URL,
      model: process.env.TRACEHOUND_NAMING_MODEL,
      log: (call) => console.error(formatCall(call)),
    }),
  );
} else if (values.naming === "llm") {
  console.error("[naming] NEBIUS_API_KEY not set; using heuristic names");
}
const outDir = path.resolve(values.out!);
const relFile = `${snapshot.repo.commitSha}/${snapshot.analyzerVersion}.json`;
const file = path.join(outDir, relFile);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
const manifestFile = writeManifest(
  outDir,
  upsertManifest(readManifest(outDir), {
    repo: snapshot.repo.name,
    sha: snapshot.repo.commitSha,
    analyzerVersion: snapshot.analyzerVersion,
    path: relFile,
    createdAt: snapshot.generatedAt,
  }),
);

const ms = Math.round(performance.now() - started);
console.log(`${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)} · analyzer ${snapshot.analyzerVersion} · ${ms}ms`);
console.log(`${snapshot.files.length} files · ${snapshot.components.length} components · ${snapshot.edges.length} edges · ${snapshot.evidence.length} evidence · ${snapshot.warnings.length} warnings`);
const llmNamed = snapshot.components.filter((c) => c.naming.source === "llm").length;
if (snapshot.llmCalls.length) {
  const tokens = snapshot.llmCalls.reduce((n, c) => n + (c.totalTokens ?? 0), 0);
  console.log(`naming: ${llmNamed}/${snapshot.llmCalls.length} named by ${snapshot.llmCalls[0]!.model} · ${tokens} tokens`);
}
console.log(`→ ${path.relative(process.cwd(), file)}`);
console.log(`→ ${path.relative(process.cwd(), manifestFile)} (latest)`);
