// tracehound find --repo <path> [--config <tracehound.json>] [--out <file>] [--json]
//                 [--claims <dir under runs/> --profile <profile.json> [--git-url <url>]]
// Writes the finder's hypotheses (decision 051) as JSON, by default to runs/finder/ (gitignored).
// With --claims, also one Form A and one Form B reproduce claim per hypothesis (decision 052).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cleanGitEnv } from "../git-env.ts";
import { repoIdOf } from "../manifest.ts";
import { writeClaims } from "./claims.ts";
import { findHypotheses } from "./index.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const USAGE =
  "usage: tracehound find --repo <path> [--config <tracehound.json>] [--out <file.json>] [--json]\n" +
  "                      [--claims <dir under runs/> --profile <profile.json> [--git-url <url, default the repo's origin>]]";

/** The repo's `origin` URL, if it has one. */
function originUrl(repo: string): string | undefined {
  try {
    return execFileSync("git", ["-C", repo, "remote", "get-url", "origin"], { encoding: "utf8", env: cleanGitEnv(), stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      config: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean", default: false },
      claims: { type: "string" },
      profile: { type: "string" },
      "git-url": { type: "string" },
    },
  });
  if (!values.repo || (values.claims !== undefined && !values.profile) || (values.claims === undefined && (values.profile || values["git-url"]))) {
    console.error(USAGE);
    return 1;
  }
  const claimsDir = values.claims !== undefined ? path.resolve(values.claims) : undefined;
  if (claimsDir && path.relative(path.join(WORKSPACE_ROOT, "runs"), claimsDir).startsWith("..")) {
    console.error(`--claims must be under ${path.join(WORKSPACE_ROOT, "runs")} (claims hold hypothesis text, which stays out of the repo)`);
    return 1;
  }
  const gitUrl = values["git-url"] ?? originUrl(values.repo);
  if (claimsDir && !gitUrl) {
    console.error("--claims needs --git-url: the repo has no origin remote");
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
  if (claimsDir) {
    const files = writeClaims(report, claimsDir, { profile: values.profile!, gitUrl: gitUrl! });
    console.error(`→ ${files.length} claim files (Form A and B per hypothesis) in ${path.relative(process.cwd(), claimsDir)}`);
  }
  return 0;
}
