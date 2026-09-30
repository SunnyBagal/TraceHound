// tracehound impact --repo <path> --diff <base>..<head> [--depth 2] [--json] [--snapshots <dir>]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readManifest } from "../manifest.ts";
import { Snapshot } from "../schema.ts";
import { ANALYZER_VERSION } from "../version.ts";
import { formatImpact } from "./format.ts";
import { computeImpact, parseNameStatus } from "./impact.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const USAGE = "usage: tracehound impact --repo <path> --diff <base>..<head> [--depth 2] [--json] [--out <file.json>] [--snapshots <dir>]";

export class ImpactError extends Error {
  override name = "ImpactError";
}

function git(repo: string, ...args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new ImpactError(`git ${args.join(" ")} failed in ${repo}${stderr ? `: ${stderr}` : ""}`);
  }
}

/** The base snapshot must be this analyzer version: older ones lack test links and may group differently. */
export function findBaseSnapshot(snapshotsDir: string, sha: string): { snapshot: Snapshot; path: string } {
  const manifest = readManifest(snapshotsDir);
  const entries = manifest?.snapshots.filter((e) => e.sha === sha) ?? [];
  const entry = entries.find((e) => e.analyzerVersion === ANALYZER_VERSION);
  if (!entry) {
    const others = entries.map((e) => e.analyzerVersion).join(", ");
    throw new ImpactError(
      [
        `no analyzer ${ANALYZER_VERSION} snapshot for base ${sha} in ${path.join(snapshotsDir, "index.json")}` +
          (others ? ` (only older versions: ${others})` : ""),
        "create one by analyzing the base commit, e.g.:",
        `  git -C <repo> worktree add /tmp/base ${sha}`,
        `  node packages/analyzer/src/cli.ts --repo /tmp/base --out ${path.relative(process.cwd(), snapshotsDir) || "."} --naming heuristic`,
        "(--naming heuristic: deterministic names, no model call; add --config <tracehound.json> if the repo has one)",
      ].join("\n"),
    );
  }
  const file = path.join(snapshotsDir, entry.path);
  if (!existsSync(file)) throw new ImpactError(`manifest lists ${entry.path} for ${sha}, but ${file} does not exist`);
  return { snapshot: Snapshot.parse(JSON.parse(readFileSync(file, "utf8"))), path: path.relative(process.cwd(), file) };
}

export function runImpact(argv: string[]): { text: string; exitCode: number } {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      diff: { type: "string" },
      depth: { type: "string", default: "2" },
      json: { type: "boolean", default: false },
      out: { type: "string" }, // also write the JSON report here (e.g. impacts/<name>.json for the viewer)
      snapshots: { type: "string", default: path.join(WORKSPACE_ROOT, "snapshots") },
    },
  });
  const range = /^([^.]+)\.\.([^.]+)$/.exec(values.diff ?? "");
  if (!values.repo || !range) throw new ImpactError(USAGE);
  const depth = Number(values.depth);
  if (!Number.isInteger(depth) || depth < 0) throw new ImpactError(`--depth must be a non-negative integer (got ${values.depth})\n${USAGE}`);

  const repo = path.resolve(values.repo);
  const base = git(repo, "rev-parse", "--verify", `${range[1]}^{commit}`).trim();
  const head = git(repo, "rev-parse", "--verify", `${range[2]}^{commit}`).trim();
  const { snapshot, path: snapshotPath } = findBaseSnapshot(path.resolve(values.snapshots!), base);
  const changes = parseNameStatus(git(repo, "diff", "--name-status", "-M", base, head));
  const report = computeImpact({ snapshot, changes, base, head, depth, snapshotPath });
  if (values.out) {
    const out = path.resolve(values.out);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    console.error(`→ wrote ${path.relative(process.cwd(), out)}`);
  }
  return { text: values.json ? JSON.stringify(report, null, 2) : formatImpact(report), exitCode: 0 };
}

export function main(argv: string[]): void {
  try {
    console.log(runImpact(argv).text);
  } catch (error) {
    const badArgs = typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code.startsWith("ERR_PARSE_ARGS");
    if (!(error instanceof ImpactError) && !badArgs) throw error;
    console.error(`✖ ${(error as Error).message}${badArgs ? `\n${USAGE}` : ""}`);
    process.exit(1);
  }
}

if (import.meta.main) main(process.argv.slice(2));
