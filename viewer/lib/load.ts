import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

/** Static load: the manifest first, then the snapshot its `latest` pointer names. */
export async function loadLatestSnapshot(): Promise<{ manifest: SnapshotManifest; snapshot: Snapshot }> {
  const manifest = SnapshotManifest.parse(await getJson(`${base}/snapshots/index.json`));
  if (!manifest.latest) throw new Error("snapshots/index.json has no latest snapshot");
  const parsed = Snapshot.safeParse(await getJson(`${base}/snapshots/${manifest.latest.path}`));
  if (!parsed.success) throw new Error(`snapshot ${manifest.latest.path} failed validation: ${parsed.error.issues[0]?.message}`);
  return { manifest, snapshot: parsed.data };
}
