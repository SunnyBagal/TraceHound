import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, SnapshotManifest, type ManifestEntry, type ManifestRepo } from "./schema.ts";

export const MANIFEST_FILE = "index.json";

/** "SunnyBagal/cex-v2-boilercode" → "cex-v2-boilercode": a repo's id in the index. */
export const repoIdOf = (repoName: string) => repoName.split("/").pop()!.toLowerCase();

const newestFirst = (a: ManifestEntry, b: ManifestEntry) => b.createdAt.localeCompare(a.createdAt) || a.path.localeCompare(b.path);

/**
 * The per-repo view of a manifest. An index written before 0.9.0 has no `repos`: derive them from
 * `snapshots`, with the repo of the current `latest` as the default.
 */
export function reposOf(manifest: SnapshotManifest): { defaultRepo?: string; repos: ManifestRepo[] } {
  if (manifest.repos) return { defaultRepo: manifest.defaultRepo, repos: manifest.repos };
  const byId = new Map<string, ManifestEntry[]>();
  for (const e of manifest.snapshots) byId.set(repoIdOf(e.repo), [...(byId.get(repoIdOf(e.repo)) ?? []), e]);
  const repos = [...byId.entries()].map(([id, versions]) => {
    const sorted = [...versions].sort(newestFirst);
    const latest = manifest.latest && repoIdOf(manifest.latest.repo) === id ? manifest.latest : sorted[0]!;
    return { id, name: latest.repo, defaultRef: latest.sha, latest, versions: sorted };
  });
  return { defaultRepo: manifest.latest ? repoIdOf(manifest.latest.repo) : repos[0]?.id, repos };
}

/**
 * Insert or replace the entry for (repo, sha, analyzerVersion); it becomes its repo's latest. The
 * top-level `latest` stays the default repo's latest (the first repo indexed, unless set).
 */
export function upsertManifest(manifest: SnapshotManifest | undefined, entry: ManifestEntry, meta: { repoUrl?: string } = {}): SnapshotManifest {
  // Same path = same file on disk, which this entry just overwrote (e.g. a repo rename), so it's stale too.
  const same = (e: ManifestEntry) => e.path === entry.path || (e.repo === entry.repo && e.sha === entry.sha && e.analyzerVersion === entry.analyzerVersion);
  const snapshots = [...(manifest?.snapshots ?? []).filter((e) => !same(e)), entry].sort(newestFirst);
  const id = repoIdOf(entry.repo);
  const previous = manifest ? reposOf(manifest) : { defaultRepo: undefined, repos: [] as ManifestRepo[] };
  const repos = previous.repos.map((r) => ({ ...r, versions: r.versions.filter((e) => !same(e)) }));
  const existing = repos.find((r) => r.id === id);
  const repo: ManifestRepo = {
    id,
    name: entry.repo,
    ...((meta.repoUrl ?? existing?.repoUrl) && { repoUrl: meta.repoUrl ?? existing?.repoUrl }),
    defaultRef: entry.sha,
    latest: entry,
    versions: [...(existing?.versions ?? []), entry].sort(newestFirst),
  };
  const allRepos = [...repos.filter((r) => r.id !== id && r.versions.length), repo].sort((a, b) => a.id.localeCompare(b.id));
  const defaultRepo = previous.defaultRepo && allRepos.some((r) => r.id === previous.defaultRepo) ? previous.defaultRepo : id;
  const latest = allRepos.find((r) => r.id === defaultRepo)!.latest;
  return { schemaVersion: SCHEMA_VERSION, latest, snapshots, defaultRepo, repos: allRepos };
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
