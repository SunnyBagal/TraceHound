// The ReviewBench adapter's command line (spike cc-02). No model call, no network: git runs only
// on a local clone of the task's mirror. stdout gets counts and ids only, never diff or finding text.
//   node scripts/reviewbench/cli.ts prepare --manifest <file> --task <id> --repo <git dir> --out <input.json>
//   node scripts/reviewbench/cli.ts submit  --manifest <file> --task <id> --kept <kept.json> --findings <dir>
//   node scripts/reviewbench/cli.ts subset  --manifest <file> --size <n> --seed <text> [--out <file>]
// Between prepare and submit runs pool-verify-v1 on input.json at the task's head (the Action's
// runPipeline, or the commands it spawns: review, review-ctx, then verify-ctx on the pool).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { languageCounts, parseKept, prDiff, stratify, taskToInput, toSubmission } from "./adapter.ts";
import { findingsFileName, mirrorUrl, parseManifest, type RbTask } from "./format.ts";

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

/** Writes a new file only: a run never overwrites an earlier result (decision 061's rule). */
function writeNew(file: string, data: unknown) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function findTask(manifest: string, id: string): RbTask {
  const task = parseManifest(readJson(manifest)).find((t) => t.id === id);
  if (!task) throw new Error(`task ${id} is not in the manifest`);
  return task;
}

function required(values: Record<string, string | undefined>, ...names: string[]): string[] {
  return names.map((name) => {
    const value = values[name];
    if (!value) throw new Error(`--${name} is required`);
    return value;
  });
}

export function main(argv: string[], log: (line: string) => void = console.log): number {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      manifest: { type: "string" }, task: { type: "string" }, repo: { type: "string" }, out: { type: "string" },
      kept: { type: "string" }, findings: { type: "string" }, size: { type: "string" }, seed: { type: "string" },
    },
  });
  if (command === "prepare") {
    const [manifest, id, repo, out] = required(values, "manifest", "task", "repo", "out");
    const task = findTask(manifest!, id!);
    const input = taskToInput(task, prDiff(repo!, task));
    writeNew(out!, input);
    log(`prepared ${task.id}: head ${task.head}, diff ${input.diff.length} chars (mirror ${mirrorUrl(task.repo)})`);
    return 0;
  }
  if (command === "submit") {
    const [manifest, id, kept, findings] = required(values, "manifest", "task", "kept", "findings");
    const task = findTask(manifest!, id!);
    const submission = toSubmission(parseKept(readJson(kept!)));
    mkdirSync(findings!, { recursive: true });
    writeNew(join(findings!, findingsFileName(task)), submission.findings);
    log(`submitted ${task.id}: ${submission.findings.length} findings, dropped no-line ${submission.dropped["no-line"]}, empty-body ${submission.dropped["empty-body"]}`);
    return 0;
  }
  if (command === "subset") {
    const [manifest, size, seed] = required(values, "manifest", "size", "seed");
    const tasks = parseManifest(readJson(manifest!));
    const subset = stratify(tasks, Number(size), seed!);
    for (const [language, n] of languageCounts(subset)) log(`${language}\t${n}`);
    log(`total\t${subset.length} of ${tasks.length}`);
    if (values.out) writeNew(values.out, subset.map((t) => t.id));
    return 0;
  }
  log("usage: cli.ts prepare|submit|subset (see the header of scripts/reviewbench/cli.ts)");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
