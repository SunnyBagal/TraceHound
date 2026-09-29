import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, SnapshotManifest, type ManifestEntry } from "./schema.ts";

export const MANIFEST_FILE = "index.json";

/** Insert or replace the entry for (repo, sha, analyzerVersion) and point `latest` at it. */
export function upsertManifest(manifest: SnapshotManifest | undefined, entry: ManifestEntry): SnapshotManifest {
  const same = (e: ManifestEntry) => e.repo === entry.repo && e.sha === entry.sha && e.analyzerVersion === entry.analyzerVersion;
  const snapshots = [...(manifest?.snapshots ?? []).filter((e) => !same(e)), entry].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.path.localeCompare(b.path),
  );
  return { schemaVersion: SCHEMA_VERSION, latest: entry, snapshots };
}

export function readManifest(dir: string): SnapshotManifest | undefined {
  const file = path.join(dir, MANIFEST_FILE);
  return existsSync(file) ? SnapshotManifest.parse(JSON.parse(readFileSync(file, "utf8"))) : undefined;
}

export function writeManifest(dir: string, manifest: SnapshotManifest): string {
  const file = path.join(dir, MANIFEST_FILE);
  writeFileSync(file, JSON.stringify(SnapshotManifest.parse(manifest), null, 2) + "\n");
  return file;
}
