import type { Snapshot } from "@tracehound/analyzer/schema";
import { describe, expect, it } from "vitest";
import { headerFact, techFacts, techLogo, techTitle } from "@/lib/tech";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("cex-v2-boilercode");

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

describe("Redis logo by role", () => {
  const recall = repoSnapshot("recall");
  const use = (id: string, s = snapshot) => headerFact(techFacts(s, s.components.find((c) => c.id === id)!))?.use;

  it("CEX's Redis is a broker: kind queue (lists)", () => {
    expect(use("redis:redis-url")).toEqual({ kind: "broker", reason: 'kind "queue": list, pub/sub or stream operations on REDIS_URL' });
    expect(techLogo(headerFact(techFacts(snapshot, snapshot.components.find((c) => c.id === "redis:redis-url")!))!).icon).toBe("redis-r.svg");
  });

  it("Recall's Redis is a broker: kind cache, but a BullMQ queue's connection resolves to it", () => {
    expect(recall.components.find((c) => c.id === "redis:redis-url")!.kind).toBe("cache");
    expect(use("redis:redis-url", recall)).toEqual({ kind: "broker", reason: "BullMQ queue content-processing on REDIS_URL" });
  });

  it("a Redis node with kind cache and no queue on its connection is a data store: the stacked-cube logo", () => {
    const store: Snapshot = {
      ...recall,
      files: recall.files.map((f) => ({ ...f, queueOps: f.queueOps?.map((o) => ({ ...o, connection: undefined })) })),
    };
    const fact = headerFact(techFacts(store, store.components.find((c) => c.id === "redis:redis-url")!))!;
    expect(fact.use?.kind).toBe("store");
    expect(techLogo(fact)).toEqual({ icon: "redis.svg" });
  });

  it("never reads the name or summary", () => {
    const named: Snapshot = { ...recall, components: recall.components.map((c) => ({ ...c, name: "Redis cache", summary: "A key-value cache." })) };
    expect(use("redis:redis-url", named)?.kind).toBe("broker");
  });
});
