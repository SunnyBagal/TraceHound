import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { describe, expect, it } from "vitest";
import { headerFact, techFacts, techTitle } from "@/lib/tech";

const root = path.resolve(import.meta.dirname, "../../snapshots");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(root, "index.json"), "utf8")));
const snapshot = Snapshot.parse(JSON.parse(readFileSync(path.join(root, manifest.latest!.path), "utf8")));

const titles = (id: string, s = snapshot) => techFacts(s, s.components.find((c) => c.id === id)!).map(techTitle);

describe("technology icons come from facts", () => {
  it("maps the demo components to the facts that prove them", () => {
    expect(titles("db:backend")).toEqual(["PostgreSQL · backend/prisma/schema.prisma:12", "Prisma · backend/src/db.ts:9"]);
    expect(titles("redis:redis-url")).toEqual(["Redis · backend/src/utils/engine-client.ts:13"]);
    expect(titles("redis-rpc-bridge")).toEqual(["Redis · backend/src/utils/engine-client.ts:13"]);
    expect(titles("engine:engine-worker")).toEqual(["Redis · engine/src/index.ts:26", "Bun · engine/package.json"]);
    expect(titles("backend:backend-server")).toEqual(["Express · backend/src/index.ts:2", "Bun · backend/package.json"]);
    expect(titles("backend:auth-api")).toEqual(["Express · backend/src/routes/auth-routes.ts:1"]);
    expect(titles("backend:exchange-api")).toEqual(["Express · backend/src/routes/exchange-routes.ts:1"]);
    // no proving fact → generic kind icon
    expect(titles("backend:shared")).toEqual([]);
    expect(titles("pending-response-registry")).toEqual([]);
  });

  it("ignores model-written names and summaries", () => {
    const renamed: Snapshot = {
      ...snapshot,
      components: snapshot.components.map((c) => ({ ...c, name: "PostgreSQL Redis Express Bun", summary: "Uses Prisma, Redis and Express on Bun." })),
    };
    for (const c of snapshot.components) expect(titles(c.id, renamed)).toEqual(titles(c.id));
  });

  it("no PostgreSQL icon unless the datasource provider says postgresql", () => {
    const mysql: Snapshot = {
      ...snapshot,
      files: snapshot.files.map((f) => (f.prismaDatasource ? { ...f, prismaDatasource: { ...f.prismaDatasource, provider: "mysql" } } : f)),
    };
    expect(titles("db:backend", mysql)).toEqual(["Prisma · backend/src/db.ts:9"]);
  });
});

describe("header icon rule", () => {
  const header = (id: string) => headerFact(techFacts(snapshot, snapshot.components.find((c) => c.id === id)!));

  it("a logo only for what the component IS, or its framework/runtime; kind icon otherwise", () => {
    const expected: Record<string, string> = {
      "redis:redis-url": "Redis · backend/src/utils/engine-client.ts:13", // the broker IS Redis
      "db:backend": "PostgreSQL · backend/prisma/schema.prisma:12", // the database IS PostgreSQL
      "engine:engine-worker": "Bun · engine/package.json", // uses a Redis client; runtime Bun
      "backend:backend-server": "Express · backend/src/index.ts:2",
      "backend:auth-api": "Express · backend/src/routes/auth-routes.ts:1",
      "backend:exchange-api": "Express · backend/src/routes/exchange-routes.ts:1",
    };
    for (const c of snapshot.components) {
      const fact = header(c.id);
      expect(fact ? techTitle(fact) : "kind icon", c.id).toBe(expected[c.id] ?? "kind icon");
    }
    // Redis RPC Bridge only uses a Redis client: generic service icon
    expect(header("redis-rpc-bridge")).toBeUndefined();
  });

  it("using a Redis client never puts Redis in a header, but keeps it in the stack list", () => {
    for (const c of snapshot.components) {
      if (header(c.id)?.tech === "redis") expect(c.resource?.tech).toBe("redis");
    }
    expect(titles("engine:engine-worker")).toContain("Redis · engine/src/index.ts:26");
    expect(titles("redis-rpc-bridge")).toContain("Redis · backend/src/utils/engine-client.ts:13");
  });
});
