import type { ManifestEntry, SnapshotManifest } from "@tracehound/analyzer/schema";

/** One repo the viewer can show (snapshots/index.json `repos`, decision 039). */
export interface RepoInfo {
  id: string;
  name: string;
  repoUrl?: string;
  latest: ManifestEntry;
}

/** The manifest's repos; an index written before 0.9.0 (no `repos`) yields its `latest` as the only repo. */
export function repoList(manifest: SnapshotManifest): RepoInfo[] {
  if (manifest.repos?.length) return manifest.repos.map((r) => ({ id: r.id, name: r.name, repoUrl: r.repoUrl, latest: r.latest }));
  if (!manifest.latest) return [];
  const name = manifest.latest.repo;
  return [{ id: name.split("/").pop()!.toLowerCase(), name, latest: manifest.latest }];
}

/** ?repo=<id> when the manifest has it, else `defaultRepo`, else the first repo. */
export function resolveRepo(search: string, manifest: SnapshotManifest): RepoInfo | undefined {
  const repos = repoList(manifest);
  const wanted = new URLSearchParams(search).get("repo");
  return repos.find((r) => r.id === wanted) ?? repos.find((r) => r.id === manifest.defaultRepo) ?? repos[0];
}

/**
 * The URL that switches to a repo (and optionally one of its change sets). Component and edge ids
 * belong to one repo, so ?component= / ?edge= / ?impact= are dropped; anything else is kept.
 */
export function repoHref(pathname: string, search: string, repoId: string, changesId?: string): string {
  const params = new URLSearchParams(search);
  for (const key of ["component", "edge", "impact", "changes"]) params.delete(key);
  params.set("repo", repoId);
  if (changesId) params.set("changes", changesId);
  return `${pathname}?${params.toString()}`;
}
