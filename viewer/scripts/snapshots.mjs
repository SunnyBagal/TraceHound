// Snapshot data for the static viewer. The repo's ../snapshots is the source of truth; the viewer
// serves a copy of index.json + the snapshot files it references. Any missing piece is fatal:
// a deploy that can't load data must not go green.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChangeSet, CHANGESET_SCHEMA_VERSION, ImpactReport, impactReferenceErrors, Snapshot } from "@tracehound/analyzer/schema";

const VIEWER = path.resolve(import.meta.dirname, "..");
export const SOURCE = path.resolve(VIEWER, "../snapshots");
export const PUBLIC = path.join(VIEWER, "public/snapshots");
export const EXPORT = path.join(VIEWER, "out/snapshots");
// Precomputed impact reports (`tracehound impact --json --out ../impacts/<name>.json`), served for ?impact=<name>.
export const IMPACT_SOURCE = path.resolve(VIEWER, "../impacts");
export const IMPACT_PUBLIC = path.join(VIEWER, "public/impacts");
export const IMPACT_EXPORT = path.join(VIEWER, "out/impacts");
// Change sets (`tracehound changes --out ../changesets/<file>`), listed in ../changesets/index.json, served for ?changes=<id>.
export const CHANGESET_SOURCE = path.resolve(VIEWER, "../changesets");
export const CHANGESET_PUBLIC = path.join(VIEWER, "public/changesets");
export const CHANGESET_EXPORT = path.join(VIEWER, "out/changesets");

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

const ENTRY_KINDS = ["commit", "run", "demo"];

/**
 * Throws unless dir/index.json is an array of { id, repo, title, kind, base, head, file } and every
 * entry's file exists and parses as a ChangeSet of the current schemaVersion. Returns the files to
 * serve (each change set, plus any run record an entry names for patch line numbers).
 */
export function verifyChangesets(dir, label = dir) {
  const indexFile = path.join(dir, "index.json");
  if (!existsSync(indexFile)) return [];
  let entries;
  try {
    entries = JSON.parse(readFileSync(indexFile, "utf8"));
  } catch (error) {
    throw new SnapshotDataError(`${label}/index.json is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(entries)) throw new SnapshotDataError(`${label}/index.json must be an array of change-set entries`);
  const files = [];
  const ids = new Set();
  for (const [i, e] of entries.entries()) {
    const where = `${label}/index.json[${i}]`;
    for (const key of ["id", "repo", "title", "kind", "base", "head", "file"]) {
      if (typeof e?.[key] !== "string" || !e[key]) throw new SnapshotDataError(`${where} has no "${key}"`);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(e.id)) throw new SnapshotDataError(`${where}: ids must be lowercase letters, digits and dashes`);
    if (ids.has(e.id)) throw new SnapshotDataError(`${where}: duplicate id ${e.id}`);
    ids.add(e.id);
    if (!ENTRY_KINDS.includes(e.kind)) throw new SnapshotDataError(`${where}: kind must be one of ${ENTRY_KINDS.join(", ")}`);
    for (const rel of [e.file, e.runRecord].filter(Boolean)) {
      if (rel.includes("..") || path.isAbsolute(rel)) throw new SnapshotDataError(`${where} references an unsafe path: ${rel}`);
      if (!existsSync(path.join(dir, rel))) throw new SnapshotDataError(`${label}/${rel} is missing (referenced by ${where})`);
    }
    let changeSet;
    try {
      changeSet = ChangeSet.parse(JSON.parse(readFileSync(path.join(dir, e.file), "utf8")));
    } catch (error) {
      throw new SnapshotDataError(`${label}/${e.file} is not a ChangeSet (schemaVersion ${CHANGESET_SCHEMA_VERSION}): ${error.message}`);
    }
    if (changeSet.base.sha !== e.base) throw new SnapshotDataError(`${where}: base ${e.base} does not match ${e.file}'s base ${changeSet.base.sha}`);
    files.push(e.file, ...(e.runRecord ? [e.runRecord] : []));
  }
  return files;
}

/** Copy ../changesets/index.json + the files it lists (verified) into public/changesets. */
export function copyChangesets() {
  const files = verifyChangesets(CHANGESET_SOURCE, "../changesets");
  rmSync(CHANGESET_PUBLIC, { recursive: true, force: true });
  if (!existsSync(path.join(CHANGESET_SOURCE, "index.json"))) return files;
  for (const rel of ["index.json", ...files]) {
    const to = path.join(CHANGESET_PUBLIC, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(path.join(CHANGESET_SOURCE, rel)));
  }
  return files;
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
      const changesets = copyChangesets();
      console.log(`[snapshots] copied index.json + ${files.length} snapshot file(s) → public/snapshots; ${impacts.length} impact report(s) → public/impacts; ${changesets.length} change-set file(s) → public/changesets`);
    } else if (command === "verify-export") {
      const { manifest } = verifySnapshots(EXPORT, "out/snapshots");
      const impacts = verifyImpacts(IMPACT_EXPORT, EXPORT, "out/impacts");
      const changesets = verifyChangesets(CHANGESET_EXPORT, "out/changesets");
      console.log(`[snapshots] export OK: out/snapshots/index.json → latest ${manifest.latest.path}; ${impacts.length} impact report(s), ${changesets.length} change-set file(s) verified`);
    } else {
      throw new Error(`unknown command ${command}`);
    }
  } catch (error) {
    console.error(`\n✖ [snapshots] ${error.message}\n`);
    process.exit(1);
  }
}
