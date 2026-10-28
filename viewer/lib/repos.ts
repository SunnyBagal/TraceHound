import type { ManifestEntry, SnapshotManifest } from "@tracehound/analyzer/schema";

/** One repo the viewer can show (snapshots/index.json `repos`, decision 039). */
export interface RepoInfo {
  id: string;
  name: string;
  displayName?: string;
  repoUrl?: string;
  latest: ManifestEntry;
}

/** The manifest's repos; an index written before 0.9.0 (no `repos`) yields its `latest` as the only repo. */
export function repoList(manifest: SnapshotManifest): RepoInfo[] {
  if (manifest.repos?.length) return manifest.repos.map((r) => ({ id: r.id, name: r.name, displayName: (r as { displayName?: string }).displayName, repoUrl: r.repoUrl, latest: r.latest }));
  if (!manifest.latest) return [];
  const name = manifest.latest.repo;
  return [{ id: name.split("/").pop()!.toLowerCase(), name, latest: manifest.latest }];
}

/** Explicit selection wins; the public demo is the default when available. */
export function resolveRepo(search: string, manifest: SnapshotManifest): RepoInfo | undefined {
  const repos = repoList(manifest);
  const wanted = new URLSearchParams(search).get("repo");
  return repos.find((r) => r.id === wanted) ?? repos.find((r) => r.name.toLowerCase() === "sunnybagal/tracehound-demo") ?? repos.find((r) => r.id === manifest.defaultRepo) ?? repos[0];
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

/**
 * The PR lane (/graph): which GitHub repo's pull requests sit beside a snapshot. Data only. A repo
 * with no entry, or whose flag is off, shows no lane and makes no request.
 */
export const PR_LANE_FLAGS = {
  /** recall-seeded's PRs were blind until scored; scoring finished 28 Oct, so they are public results */
  recallSeeded: true,
} as const;
export const PR_LANE_REPOS: Record<string, { github: string; flag?: keyof typeof PR_LANE_FLAGS }> = {
  "tracehound-demo": { github: "SunnyBagal/tracehound-demo" },
  recall: { github: "SunnyBagal/recall-seeded", flag: "recallSeeded" },
};

/** owner/name of the repo whose pull requests the lane shows for this snapshot, if any. */
export function prLaneRepo(repoId: string | undefined, flags: Record<string, boolean> = PR_LANE_FLAGS): string | undefined {
  const entry = repoId ? PR_LANE_REPOS[repoId] : undefined;
  if (!entry || (entry.flag && !flags[entry.flag])) return undefined;
  return entry.github;
}
