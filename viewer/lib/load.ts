import { ImpactReport, Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";

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

/** ?impact=<name>: the precomputed report (impacts/<name>.json), then the base snapshot it was computed on. */
export async function loadImpact(name: string): Promise<{ impact: ImpactReport; snapshot: Snapshot }> {
  const report = ImpactReport.safeParse(await getJson(`${base}/impacts/${name}.json`));
  if (!report.success) throw new Error(`impacts/${name}.json failed validation: ${report.error.issues[0]?.message}`);
  const snapshot = Snapshot.safeParse(await getJson(`${base}/snapshots/${report.data.snapshot.file}`));
  if (!snapshot.success) throw new Error(`snapshot ${report.data.snapshot.file} failed validation: ${snapshot.error.issues[0]?.message}`);
  return { impact: report.data, snapshot: snapshot.data };
}
