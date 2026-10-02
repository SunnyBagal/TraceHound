import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { repoList } from "@/lib/repos";

const ROOT = path.resolve(import.meta.dirname, "../../snapshots");

/**
 * The committed latest snapshot of one repo, asked for by repo id (decision 040). Tests that
 * assert repo-specific facts must not read the top-level `latest`: it follows `defaultRepo` on
 * the next manifest write.
 */
export function repoSnapshot(id: string): Snapshot {
  const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(ROOT, "index.json"), "utf8")));
  const repo = repoList(manifest).find((r) => r.id === id);
  if (!repo) throw new Error(`snapshots/index.json has no repo "${id}"`);
  return Snapshot.parse(JSON.parse(readFileSync(path.join(ROOT, repo.latest.path), "utf8")));
}
