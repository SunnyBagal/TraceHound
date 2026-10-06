// tracehound find --repo <path> [--config <tracehound.json>] [--out <file>] [--json]
// Writes the finder's hypotheses (decision 051) as JSON, by default to runs/finder/ (gitignored).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { repoIdOf } from "../manifest.ts";
import { findHypotheses } from "./index.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const USAGE = "usage: tracehound find --repo <path> [--config <tracehound.json>] [--out <file.json>] [--json]";

export function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: { repo: { type: "string" }, config: { type: "string" }, out: { type: "string" }, json: { type: "boolean", default: false } },
  });
  if (!values.repo) {
    console.error(USAGE);
    return 1;
  }
  const config = values.config && path.relative(WORKSPACE_ROOT, path.resolve(values.config));
  const { snapshot, report } = findHypotheses(values.repo, { configPath: values.config });
  const out = path.resolve(values.out ?? path.join(WORKSPACE_ROOT, "runs/finder", `${repoIdOf(snapshot.repo.name)}-${snapshot.repo.commitSha.slice(0, 7)}.json`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ...report, ...(config && { config }) }, null, 2) + "\n");
  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)} · analyzer ${snapshot.analyzerVersion} · ${report.finderVersion} · no model calls`);
    for (const [family, n] of Object.entries(report.counts)) console.log(`  ${family}: ${n}`);
    for (const note of report.notes) console.log(`  note: ${note}`);
  }
  console.error(`→ ${path.relative(process.cwd(), out)}`);
  return 0;
}
