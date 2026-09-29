import type { Positions } from "./layout";

// Per-viewer, per-snapshot node positions. Storage can be missing or throw (private mode,
// blocked storage, sandboxed previews); every access is guarded and the layout works without it.
const key = (snapshotKey: string) => `tracehound:positions:${snapshotKey}`;

export function loadPositions(snapshotKey: string): Positions {
  try {
    const raw = window.localStorage.getItem(key(snapshotKey));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Positions) : {};
  } catch {
    return {};
  }
}

export function savePositions(snapshotKey: string, positions: Positions): void {
  try {
    window.localStorage.setItem(key(snapshotKey), JSON.stringify(positions));
  } catch {
    // storage unavailable: positions just won't persist
  }
}

export function clearPositions(snapshotKey: string): void {
  try {
    window.localStorage.removeItem(key(snapshotKey));
  } catch {
    // ignore
  }
}
