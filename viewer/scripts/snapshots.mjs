// Snapshot data for the static viewer. The repo's ../snapshots is the source of truth; the viewer
// serves a copy of index.json + the snapshot files it references. Any missing piece is fatal:
// a deploy that can't load data must not go green.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const VIEWER = path.resolve(import.meta.dirname, "..");
export const SOURCE = path.resolve(VIEWER, "../snapshots");
export const PUBLIC = path.join(VIEWER, "public/snapshots");
export const EXPORT = path.join(VIEWER, "out/snapshots");

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
  rmSync(PUBLIC, { recursive: true, force: true });
  for (const rel of ["index.json", ...referenced]) {
    mkdirSync(path.dirname(path.join(PUBLIC, rel)), { recursive: true });
    copyFileSync(path.join(SOURCE, rel), path.join(PUBLIC, rel));
  }
  verifySnapshots(PUBLIC, "public/snapshots");
  return referenced;
}

// CLI: node scripts/snapshots.mjs copy | verify-export
const command = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` && command) {
  try {
    if (command === "copy") {
      const files = copySnapshots();
      console.log(`[snapshots] copied index.json + ${files.length} snapshot file(s) → public/snapshots`);
    } else if (command === "verify-export") {
      const { manifest } = verifySnapshots(EXPORT, "out/snapshots");
      console.log(`[snapshots] export OK: out/snapshots/index.json → latest ${manifest.latest.path}`);
    } else {
      throw new Error(`unknown command ${command}`);
    }
  } catch (error) {
    console.error(`\n✖ [snapshots] ${error.message}\n`);
    process.exit(1);
  }
}
