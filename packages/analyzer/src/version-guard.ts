// node packages/analyzer/src/version-guard.ts [<snapshot dir> ...]   (default: snapshots)
// Fails when any repo's latest snapshot in an index wasn't written by the current analyzer
// version, and prints the command that regenerates it (decision 039). No network, no model.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { reposOf, readManifest } from "./manifest.ts";
import { ANALYZER_VERSION } from "./version.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../..");

export interface StaleSnapshot {
  dir: string;
  repoId: string;
  repo: string;
  sha: string;
  analyzerVersion: string;
  regenerate: string;
}

/** The command that rebuilds a repo's latest snapshot at the current version, names from cache only. */
export function regenerateCommand(dir: string, repoId: string, repoUrl: string | undefined, sha: string, workspaceRoot = WORKSPACE_ROOT): string {
  const config = path.join("configs", `${repoId}.tracehound.json`);
  const checkout = `"$(mktemp -d)/${repoId}"`;
  return [
    `R=${checkout}`,
    `git clone -q ${repoUrl ?? "<repo url>"} "$R"`,
    `git -C "$R" checkout -q ${sha}`,
    `node packages/analyzer/src/cli.ts --repo "$R"${existsSync(path.join(workspaceRoot, config)) ? ` --config ${config}` : ""} --out ${path.relative(workspaceRoot, path.resolve(dir)) || "."} --cache-only`,
  ].join(" && ");
}

export function staleSnapshots(dir: string, version = ANALYZER_VERSION): StaleSnapshot[] {
  const manifest = readManifest(dir);
  if (!manifest) throw new Error(`${path.join(dir, "index.json")} does not exist`);
  return reposOf(manifest)
    .repos.filter((r) => r.latest.analyzerVersion !== version)
    .map((r) => {
      const file = path.join(dir, r.latest.path);
      const url = r.repoUrl ?? (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { repo: { url?: string } }).repo.url : undefined);
      return { dir, repoId: r.id, repo: r.name, sha: r.latest.sha, analyzerVersion: r.latest.analyzerVersion, regenerate: regenerateCommand(dir, r.id, url, r.latest.sha) };
    });
}

if (import.meta.main) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(WORKSPACE_ROOT, "snapshots")];
  const stale = dirs.flatMap((d) => staleSnapshots(d));
  if (!stale.length) {
    console.log(`snapshot versions OK: every repo's latest snapshot is analyzer ${ANALYZER_VERSION} (${dirs.join(", ")})`);
  } else {
    for (const s of stale) {
      console.error(`✖ ${s.repo} (${s.repoId}) @ ${s.sha.slice(0, 7)} in ${s.dir}: latest snapshot is analyzer ${s.analyzerVersion}, current is ${ANALYZER_VERSION}`);
      console.error(`  regenerate: ${s.regenerate}`);
    }
    process.exit(1);
  }
}
