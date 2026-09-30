import { describe, expect, it } from "vitest";
import { upsertManifest } from "../src/manifest.ts";

const sha = (c: string) => c.repeat(40);
const entry = (s: string, v: string, createdAt: string) => ({ repo: "acme/shop", sha: sha(s), analyzerVersion: v, path: `${sha(s)}/${v}.json`, createdAt });

describe("upsertManifest", () => {
  it("adds entries newest-first and points latest at the last write", () => {
    const m1 = upsertManifest(undefined, entry("a", "0.1.0", "2026-01-01T00:00:00Z"));
    const m2 = upsertManifest(m1, entry("b", "0.1.0", "2026-01-02T00:00:00Z"));
    expect(m2.latest?.sha).toBe(sha("b"));
    expect(m2.snapshots.map((e) => e.sha)).toEqual([sha("b"), sha("a")]);
  });

  it("replaces a re-analyzed (sha, version) instead of duplicating it", () => {
    const m1 = upsertManifest(undefined, entry("a", "0.1.0", "2026-01-01T00:00:00Z"));
    const m2 = upsertManifest(m1, entry("a", "0.1.0", "2026-01-03T00:00:00Z"));
    expect(m2.snapshots).toHaveLength(1);
    expect(m2.snapshots[0]!.createdAt).toBe("2026-01-03T00:00:00Z");
  });

  it("drops an entry whose file was overwritten under a new repo name (e.g. moving to a fork)", () => {
    const m1 = upsertManifest(undefined, entry("a", "0.1.0", "2026-01-01T00:00:00Z"));
    const m2 = upsertManifest(m1, { ...entry("a", "0.1.0", "2026-01-02T00:00:00Z"), repo: "me/shop" });
    expect(m2.snapshots.map((e) => e.repo)).toEqual(["me/shop"]);
  });

  it("keeps other analyzer versions of the same commit", () => {
    const m = upsertManifest(upsertManifest(undefined, entry("a", "0.1.0", "2026-01-01T00:00:00Z")), entry("a", "0.2.0", "2026-01-02T00:00:00Z"));
    expect(m.snapshots.map((e) => e.analyzerVersion)).toEqual(["0.2.0", "0.1.0"]);
  });
});
