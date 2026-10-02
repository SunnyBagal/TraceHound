import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSnapshot, QueryError } from "../src/agent/query.ts";
import { reposOf, upsertManifest } from "../src/manifest.ts";
import { staleSnapshots } from "../src/version-guard.ts";
import { SCHEMA_VERSION, SnapshotManifest } from "../src/schema.ts";

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

// a real, schema-valid snapshot (the committed demo one) with its repo name and sha swapped
const SNAPSHOTS = path.resolve(import.meta.dirname, "../../../snapshots");
const demo = JSON.parse(readFileSync(path.join(SNAPSHOTS, (JSON.parse(readFileSync(path.join(SNAPSHOTS, "index.json"), "utf8")) as { latest: { path: string } }).latest.path), "utf8"));
const fixtureSnapshot = (name: string, commitSha: string) => ({ ...demo, repo: { ...demo.repo, name, commitSha } });

describe("multi-repo index (decision 039)", () => {
  const other = (s: string, createdAt: string) => ({ ...entry(s, "0.9.0", createdAt), repo: "me/Recall" });

  it("indexes each repo with its latest and versions; top-level latest stays on the default repo", () => {
    let m = upsertManifest(undefined, entry("a", "0.8.0", "2026-01-01T00:00:00Z"), { repoUrl: "https://github.com/acme/shop" });
    m = upsertManifest(m, other("b", "2026-01-02T00:00:00Z"));
    m = upsertManifest(m, entry("a", "0.9.0", "2026-01-03T00:00:00Z"));
    expect(m.defaultRepo).toBe("shop");
    expect(m.latest).toMatchObject({ repo: "acme/shop", analyzerVersion: "0.9.0" });
    expect(m.repos!.map((r) => [r.id, r.name, r.latest.analyzerVersion, r.versions.length])).toEqual([
      ["recall", "me/Recall", "0.9.0", 1],
      ["shop", "acme/shop", "0.9.0", 2],
    ]);
    expect(m.repos!.find((r) => r.id === "shop")).toMatchObject({ repoUrl: "https://github.com/acme/shop", defaultRef: sha("a") });
    // a later write of the other repo doesn't move the top-level latest
    m = upsertManifest(m, other("c", "2026-01-04T00:00:00Z"));
    expect(m.latest?.repo).toBe("acme/shop");
    expect(m.repos!.find((r) => r.id === "recall")!.latest.sha).toBe(sha("c"));
  });

  it("an index written before 0.9.0 (no repos) still parses, and its repos derive from snapshots", () => {
    const old = { schemaVersion: SCHEMA_VERSION, latest: entry("a", "0.7.0", "2026-01-01T00:00:00Z"), snapshots: [entry("a", "0.7.0", "2026-01-01T00:00:00Z")] };
    const parsed = SnapshotManifest.parse(old);
    expect(reposOf(parsed)).toMatchObject({ defaultRepo: "shop", repos: [{ id: "shop", latest: { sha: sha("a") } }] });
    // upgrading keeps latest where it pointed
    const upgraded = upsertManifest(parsed, other("b", "2026-01-02T00:00:00Z"));
    expect(upgraded.latest?.sha).toBe(sha("a"));
    expect(upgraded.defaultRepo).toBe("shop");
  });

  it("loadSnapshot picks a repo by id, defaults to the default repo, and names the ids on a miss", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-index-"));
    const snap = (name: string, s: string) => {
      const rel = `${sha(s)}/0.9.0.json`;
      mkdirSync(path.join(dir, sha(s)), { recursive: true });
      writeFileSync(path.join(dir, rel), JSON.stringify(fixtureSnapshot(name, sha(s))));
      return { repo: name, sha: sha(s), analyzerVersion: "0.9.0", path: rel, createdAt: `2026-01-0${s === "a" ? 1 : 2}T00:00:00Z` };
    };
    const m = upsertManifest(upsertManifest(undefined, snap("acme/shop", "a")), snap("me/Recall", "b"));
    writeFileSync(path.join(dir, "index.json"), JSON.stringify(m));
    const index = path.join(dir, "index.json");
    expect(loadSnapshot(undefined, undefined, index)).toMatchObject({ repoId: "shop", snapshot: { repo: { name: "acme/shop" } } });
    expect(loadSnapshot(undefined, "recall", index)).toMatchObject({ repoId: "recall", snapshot: { repo: { name: "me/Recall" } } });
    expect(() => loadSnapshot(undefined, "nope", index)).toThrow(/unknown repo id "nope".*recall, shop/);
    expect(() => loadSnapshot(path.join(dir, `${sha("a")}/0.9.0.json`), "shop", index)).toThrow(QueryError);
  });
});

describe("snapshot version guard (decision 039)", () => {
  it("flags each repo whose latest snapshot is from another analyzer version, with a regenerate command", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-guard-"));
    let m = upsertManifest(undefined, entry("a", "0.8.0", "2026-01-01T00:00:00Z"), { repoUrl: "https://github.com/acme/shop" });
    m = upsertManifest(m, { ...entry("b", "0.9.0", "2026-01-02T00:00:00Z"), repo: "me/Recall" }, { repoUrl: "https://github.com/me/Recall" });
    writeFileSync(path.join(dir, "index.json"), JSON.stringify(m));
    const stale = staleSnapshots(dir, "0.9.0");
    expect(stale.map((s) => [s.repoId, s.analyzerVersion])).toEqual([["shop", "0.8.0"]]);
    expect(stale[0]!.regenerate).toContain(`git clone -q https://github.com/acme/shop "$R" && git -C "$R" checkout -q ${sha("a")}`);
    expect(stale[0]!.regenerate).toMatch(/--cache-only$/);
    expect(staleSnapshots(dir, "0.8.0").map((s) => s.repoId)).toEqual(["recall"]);
    // an old index (no repos) is checked through its derived repos
    writeFileSync(path.join(dir, "index.json"), JSON.stringify({ schemaVersion: SCHEMA_VERSION, latest: m.latest, snapshots: m.snapshots }));
    expect(staleSnapshots(dir, "0.9.0").map((s) => s.repoId)).toEqual(["shop"]);
  });
});
