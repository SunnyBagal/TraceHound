import { ChangeSet, ImpactReport, Snapshot, SnapshotManifest, type ManifestEntry } from "@tracehound/analyzer/schema";
import { buildChangeModel, ChangeSetIndex, type ChangeModel, type ChangeSetEntry } from "./changes";
import { githubSlug } from "./github";
import { repoList, resolveRepo, type RepoInfo } from "./repos";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

async function getSnapshot(entry: ManifestEntry): Promise<Snapshot> {
  const parsed = Snapshot.safeParse(await getJson(`${base}/snapshots/${entry.path}`));
  if (!parsed.success) throw new Error(`snapshot ${entry.path} failed validation: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

export async function loadManifest(): Promise<SnapshotManifest> {
  return SnapshotManifest.parse(await getJson(`${base}/snapshots/index.json`));
}

/** changesets/index.json; an empty list when the deploy has none. */
export async function loadChangeSetIndex(): Promise<ChangeSetEntry[]> {
  const res = await fetch(`${base}/changesets/index.json`, { cache: "no-cache" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GET ${base}/changesets/index.json → HTTP ${res.status}`);
  return ChangeSetIndex.parse(await res.json());
}

export interface Loaded {
  manifest: SnapshotManifest;
  repos: RepoInfo[];
  /** the repo on screen (undefined only for a change set of a repo with no published snapshot) */
  repoId?: string;
  snapshot: Snapshot;
  changeSets: ChangeSetEntry[];
  impact?: ImpactReport;
  changes?: ChangeModel;
}

/** Static load: the manifest, then the snapshot of ?repo= (or the manifest's defaultRepo). */
export async function loadRepo(search: string): Promise<Loaded> {
  const [manifest, changeSets] = await Promise.all([loadManifest(), loadChangeSetIndex()]);
  const repos = repoList(manifest);
  const repo = resolveRepo(search, manifest);
  if (!repo) throw new Error("snapshots/index.json has no latest snapshot");
  return { manifest, repos, repoId: repo.id, snapshot: await getSnapshot(repo.latest), changeSets };
}

/** ?impact=<name>: the precomputed report (impacts/<name>.json), then the base snapshot it was computed on. */
export async function loadImpact(name: string): Promise<Loaded> {
  const [manifest, changeSets] = await Promise.all([loadManifest(), loadChangeSetIndex()]);
  const report = ImpactReport.safeParse(await getJson(`${base}/impacts/${name}.json`));
  if (!report.success) throw new Error(`impacts/${name}.json failed validation: ${report.error.issues[0]?.message}`);
  const snapshot = Snapshot.safeParse(await getJson(`${base}/snapshots/${report.data.snapshot.file}`));
  if (!snapshot.success) throw new Error(`snapshot ${report.data.snapshot.file} failed validation: ${snapshot.error.issues[0]?.message}`);
  const repos = repoList(manifest);
  const repoId = repos.find((r) => r.name === snapshot.data.repo.name)?.id;
  return { manifest, repos, repoId, impact: report.data, snapshot: snapshot.data, changeSets };
}

/**
 * ?changes=<id>: the change set, plus its repo's latest published snapshot for the component graph
 * (components the snapshot lacks are drawn from the change set alone).
 */
export async function loadChanges(id: string): Promise<Loaded> {
  const [manifest, changeSets] = await Promise.all([loadManifest(), loadChangeSetIndex()]);
  const entry = changeSets.find((e) => e.id === id);
  if (!entry) throw new Error(`changesets/index.json has no change set "${id}"`);
  const parsed = ChangeSet.safeParse(await getJson(`${base}/changesets/${entry.file}`));
  if (!parsed.success) throw new Error(`changesets/${entry.file} failed validation: ${parsed.error.issues[0]?.message}`);
  const repos = repoList(manifest);
  const repo = repos.find((r) => r.id === entry.repo);
  const snapshot = repo ? await getSnapshot(repo.latest) : undefined;
  let patch: string | undefined;
  if (entry.runRecord) {
    const record = (await getJson(`${base}/changesets/${entry.runRecord}`)) as { diff?: unknown };
    if (typeof record.diff === "string") patch = record.diff;
  }
  const slug = repo?.repoUrl ? githubSlug({ name: repo.name, url: repo.repoUrl, commitSha: "" }) : snapshot ? githubSlug(snapshot.repo) : undefined;
  const changes = buildChangeModel(entry, parsed.data, snapshot, { patch, slug });
  return { manifest, repos, repoId: repo?.id, snapshot: changes.display, changeSets, changes };
}
