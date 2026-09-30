// Decisions 023/024 and 025 generalize queue rules to key/value stores: `reads`/`writes` edges are
// walked both ways, and a `cache`-kind broker is crossed for one hop. These fixtures exercise
// exactly those paths (the CEX demo has neither).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContext } from "../src/agent/context.ts";
import { computeImpact } from "../src/impact/impact.ts";
import type { Snapshot } from "../src/schema.ts";
import { CACHE_FILES, makeFixtureRepo } from "./fixture-repo.ts";

let snapshot: Snapshot;
let base: string;
let cleanup: () => void;
beforeAll(() => {
  ({ snapshot, base, cleanup } = makeFixtureRepo(CACHE_FILES));
});
afterAll(() => cleanup());

describe("cache fixture", () => {
  it("is a writes/reads pair through a cache-kind Redis component", () => {
    expect(snapshot.components.find((c) => c.id === "redis:redis-url")?.kind).toBe("cache");
    expect(snapshot.edges.map((e) => `${e.source} -${e.kind}-> ${e.target}`).filter((e) => e.includes("redis"))).toEqual([
      "profile-reader -reads-> redis:redis-url",
      "profile-writer -writes-> redis:redis-url",
    ]);
  });
});

describe("impact: reads/writes are bidirectional and a cache broker costs one hop (023, 024)", () => {
  it("a reader-side change reaches the writer at depth 1, through the cache", () => {
    const r = computeImpact({ snapshot, changes: [{ status: "modified", path: "app/src/reader.ts", basePath: "app/src/reader.ts" }], base, head: base, depth: 1 });
    const writer = r.affected.find((a) => a.id === "profile-writer")!;
    expect(writer.depth).toBe(1);
    expect(writer.chain.map((h) => [h.kind, h.walk, h.depthCost])).toEqual([
      ["reads", "bidirectional", 1],
      ["writes", "bidirectional", 0],
    ]);
    expect(r.affected.find((a) => a.id === "redis:redis-url")?.depth).toBe(1);
  });

  it("a writer-side change reaches the reader the same way", () => {
    const r = computeImpact({ snapshot, changes: [{ status: "modified", path: "app/src/writer.ts", basePath: "app/src/writer.ts" }], base, head: base, depth: 1 });
    expect(r.affected.find((a) => a.id === "profile-reader")).toMatchObject({ depth: 1 });
  });
});

describe("context: a cache broker brings in the other side (025 queue partners)", () => {
  it("matching the writer includes the cache and the reader", () => {
    const p = buildContext(snapshot, "saveProfile stores stale data");
    expect(p.confidence!.level).not.toMatch(/low|none/);
    const roles = Object.fromEntries(p.components.map((c) => [c.id, c.role]));
    expect(roles).toMatchObject({ "profile-writer": "match", "redis:redis-url": "neighbor", "profile-reader": "neighbor" });
    expect(p.components.find((c) => c.id === "profile-reader")!.reason).toBe('queue partner of profile-writer across redis:redis-url: reads "get profile-cache" [proven]');
  });
});
