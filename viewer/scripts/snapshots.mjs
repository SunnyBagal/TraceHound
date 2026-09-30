// Snapshot data for the static viewer. The repo's ../snapshots is the source of truth; the viewer
// serves a copy of index.json + the snapshot files it references. Any missing piece is fatal:
// a deploy that can't load data must not go green.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ImpactReport, impactReferenceErrors, Snapshot } from "@tracehound/analyzer/schema";

const VIEWER = path.resolve(import.meta.dirname, "..");
export const SOURCE = path.resolve(VIEWER, "../snapshots");
export const PUBLIC = path.join(VIEWER, "public/snapshots");
export const EXPORT = path.join(VIEWER, "out/snapshots");
// Precomputed impact reports (`tracehound impact --json --out ../impacts/<name>.json`), served for ?impact=<name>.
export const IMPACT_SOURCE = path.resolve(VIEWER, "../impacts");
export const IMPACT_PUBLIC = path.join(VIEWER, "public/impacts");
export const IMPACT_EXPORT = path.join(VIEWER, "out/impacts");

class SnapshotDataError extends Error {}

/** Throws unless dir/index.json parses, has a `latest`, and every referenced file exists and parses. */
export function verifySnapshots(dir, label = dir) {
  const indexFile = path.join(dir, "index.json");
  if (!existsSync(indexFile)) throw new SnapshotDataError(`${label}/index.json is missing`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(indexFile, "utf8"));
  } catch (error) {
    throw new SnapshotDataError(`${label}/index.json is not valid JSON: ${error.message}`);
  }
  if (!manifest.latest?.path) throw new SnapshotDataError(`${label}/index.json has no "latest" snapshot`);
  const referenced = [...new Set([manifest.latest.path, ...(manifest.snapshots ?? []).map((s) => s.path)])];
  for (const rel of referenced) {
    if (rel.includes("..") || path.isAbsolute(rel)) throw new SnapshotDataError(`${label}/index.json references an unsafe path: ${rel}`);
    const file = path.join(dir, rel);
    if (!existsSync(file)) throw new SnapshotDataError(`${label}/${rel} is missing (referenced by index.json${rel === manifest.latest.path ? " as latest" : ""})`);
    try {
      JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new SnapshotDataError(`${label}/${rel} is not valid JSON: ${error.message}`);
    }
  }
  return { manifest, referenced };
}

/** Copy index.json + referenced snapshot files (nothing else) from ../snapshots into public/. */
export function copySnapshots() {
  if (!existsSync(SOURCE)) {
    throw new SnapshotDataError(
      `${SOURCE} does not exist. On Vercel this means files outside the Root Directory aren't available to the build ` +
        `(Project Settings → Build and Deployment → Root Directory → "Include files outside the root directory in the Build Step").`,
    );
  }
  const { referenced } = verifySnapshots(SOURCE, "../snapshots");
  const wanted = new Set(["index.json", ...referenced]);
  // Idempotent and safe to run concurrently (Next loads its config in several processes):
  // write a file only when its bytes differ, via temp file + rename; prune only stale files.
  for (const rel of wanted) {
    const from = readFileSync(path.join(SOURCE, rel));
    const to = path.join(PUBLIC, rel);
    if (existsSync(to) && readFileSync(to).equals(from)) continue;
    mkdirSync(path.dirname(to), { recursive: true });
    const tmp = `${to}.${process.pid}.tmp`;
    writeFileSync(tmp, from);
    renameSync(tmp, to);
  }
  for (const rel of listFiles(PUBLIC)) {
    if (!wanted.has(rel) && !rel.endsWith(".tmp")) rmSync(path.join(PUBLIC, rel), { force: true });
  }
  verifySnapshots(PUBLIC, "public/snapshots");
  return referenced;
}

/**
 * Throws unless every <name>.json in dir is a valid impact report whose base snapshot is in
 * snapshotsDir and cites only components, edges and evidence that exist in it.
 * Writes nothing; returns the report names for the index.
 */
export function verifyImpacts(dir, snapshotsDir, label = dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();
  for (const name of names) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new SnapshotDataError(`${label}/${name}.json: impact names must be lowercase letters, digits and dashes`);
    let report;
    try {
      report = ImpactReport.parse(JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8")));
    } catch (error) {
      throw new SnapshotDataError(`${label}/${name}.json is not a valid impact report: ${error.message}`);
    }
    const snapshotFile = path.join(snapshotsDir, report.snapshot.file);
    if (!existsSync(snapshotFile)) throw new SnapshotDataError(`${label}/${name}.json: base snapshot ${report.snapshot.file} is missing`);
    const snapshot = Snapshot.parse(JSON.parse(readFileSync(snapshotFile, "utf8")));
    const errors = impactReferenceErrors(report, snapshot);
    if (errors.length) throw new SnapshotDataError(`${label}/${name}.json does not match its base snapshot ${report.snapshot.file}:\n  - ${errors.join("\n  - ")}`);
  }
  return names;
}

/** Copy ../impacts/*.json (verified) into public/impacts, plus an index of names. */
export function copyImpacts() {
  const names = verifyImpacts(IMPACT_SOURCE, SOURCE, "../impacts");
  rmSync(IMPACT_PUBLIC, { recursive: true, force: true });
  if (!names.length) return names;
  mkdirSync(IMPACT_PUBLIC, { recursive: true });
  for (const name of names) writeFileSync(path.join(IMPACT_PUBLIC, `${name}.json`), readFileSync(path.join(IMPACT_SOURCE, `${name}.json`)));
  writeFileSync(path.join(IMPACT_PUBLIC, "index.json"), JSON.stringify({ impacts: names }, null, 2) + "\n");
  return names;
}

function listFiles(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

// CLI: node scripts/snapshots.mjs copy | verify-export
const command = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` && command) {
  try {
    if (command === "copy") {
      const files = copySnapshots();
      const impacts = copyImpacts();
      console.log(`[snapshots] copied index.json + ${files.length} snapshot file(s) → public/snapshots; ${impacts.length} impact report(s) → public/impacts`);
    } else if (command === "verify-export") {
      const { manifest } = verifySnapshots(EXPORT, "out/snapshots");
      const impacts = verifyImpacts(IMPACT_EXPORT, EXPORT, "out/impacts");
      console.log(`[snapshots] export OK: out/snapshots/index.json → latest ${manifest.latest.path}; ${impacts.length} impact report(s) verified`);
    } else {
      throw new Error(`unknown command ${command}`);
    }
  } catch (error) {
    console.error(`\n✖ [snapshots] ${error.message}\n`);
    process.exit(1);
  }
}
