import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeRepo } from "./analyze.ts";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    out: { type: "string", default: "snapshots" },
  },
});
if (!values.repo) {
  console.error("usage: node src/cli.ts --repo <path> [--out <dir>]");
  process.exit(1);
}

const started = performance.now();
const snapshot = analyzeRepo(values.repo);
const dir = path.resolve(values.out!, snapshot.repo.commitSha);
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${snapshot.analyzerVersion}.json`);
writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");

const ms = Math.round(performance.now() - started);
console.log(`${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)} · analyzer ${snapshot.analyzerVersion} · ${ms}ms`);
console.log(`${snapshot.files.length} files · ${snapshot.components.length} components · ${snapshot.edges.length} edges · ${snapshot.evidence.length} evidence`);
console.log(`→ ${path.relative(process.cwd(), file)}`);
