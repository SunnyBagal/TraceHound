import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeRepo } from "./analyze.ts";
import { readManifest, upsertManifest, writeManifest } from "./manifest.ts";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    config: { type: "string" },
    out: { type: "string", default: "snapshots" },
  },
});
if (!values.repo) {
  console.error("usage: node src/cli.ts --repo <path> [--config <tracehound.json>] [--out <dir>]");
  process.exit(1);
}

const started = performance.now();
const snapshot = analyzeRepo(values.repo, { configPath: values.config });
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
console.log(`${snapshot.files.length} files · ${snapshot.components.length} components · ${snapshot.edges.length} edges · ${snapshot.evidence.length} evidence`);
console.log(`→ ${path.relative(process.cwd(), file)}`);
console.log(`→ ${path.relative(process.cwd(), manifestFile)} (latest)`);
