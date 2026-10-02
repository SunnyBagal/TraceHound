import type { Positions } from "./layout";

// Per-viewer, per-repo node positions. Storage can be missing or throw (private mode,
// blocked storage, sandboxed previews); every access is guarded and the layout works without it.
//
// Keyed by repo name, not by snapshot (decision 040): component ids are stable across commits and
// analyzer versions, so a regenerated snapshot (0.7.0 → 0.9.0) or another view of the same repo
// (impact, change set) keeps the arrangement. Nodes without a saved position get ELK's.
const PREFIX = "tracehound:positions:";
const key = (repoKey: string) => `${PREFIX}repo:${repoKey}`;

function read(storageKey: string): Positions | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? (parsed as Positions) : null;
}

/**
 * Saved positions for a repo. Before decision 040 they were keyed "<commitSha>:<analyzerVersion>";
 * when the repo has none yet, the newest such entry for `legacySha` is used (and kept as is).
 */
export function loadPositions(repoKey: string, legacySha?: string): Positions {
  try {
    const saved = read(key(repoKey));
    if (saved) return saved;
    if (!legacySha) return {};
    const legacy = Object.keys(window.localStorage)
      .filter((k) => k.startsWith(`${PREFIX}${legacySha}:`))
      .sort((a, b) => compareVersions(b.slice(b.lastIndexOf(":") + 1), a.slice(a.lastIndexOf(":") + 1)));
    return (legacy[0] && read(legacy[0])) || {};
  } catch {
    return {};
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Merge into what is saved: positions of components this view doesn't show are kept. */
export function savePositions(repoKey: string, positions: Positions): void {
  try {
    const saved = read(key(repoKey)) ?? {};
    window.localStorage.setItem(key(repoKey), JSON.stringify({ ...saved, ...positions }));
  } catch {
    // storage unavailable: positions just won't persist
  }
}

/** Reset: an empty record (not a removal), so the legacy fallback above doesn't bring old positions back. */
export function clearPositions(repoKey: string): void {
  try {
    window.localStorage.setItem(key(repoKey), "{}");
  } catch {
    // ignore
  }
}
