import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContext, confidenceOf, formatContext } from "../src/agent/context.ts";
import { createServer } from "../src/agent/mcp.ts";
import { getEdgeEvidence, getNeighbors, getRelatedTests, QueryError, searchComponents } from "../src/agent/query.ts";
import { rankComponents, stem, terms, termsMatch } from "../src/agent/rank.ts";
import type { Snapshot } from "../src/schema.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";

// Fixture graph (see fixture-repo.ts):
//   api:api-app -imports-> orders -imports-> queue-client -produces-> redis:redis-url -consumes-> worker:worker-worker
//   redis:redis-url -consumes (dynamic)-> notifier; api/src/orders.test.ts TESTS orders
let snapshot: Snapshot;
let cleanup: () => void;
beforeAll(() => {
  ({ snapshot, cleanup } = makeFixtureRepo());
});
afterAll(() => cleanup());

describe("ranking v1 (decision 025)", () => {
  it("splits identifiers and prose into stemmed terms without stopwords", () => {
    expect(terms("sendToEngine backend-to-engine-broker ENGINE_TIMEOUT_MS /api/v1/order")).toEqual(["send", "engine", "backend", "broker", "timeout", "api", "order"]);
    expect(terms("The orders are timing out")).toEqual(["order", "tim", "out"]);
    expect([stem("orders"), stem("placed"), stem("processes"), stem("class")]).toEqual(["order", "plac", "process", "class"]);
    expect([termsMatch("order", "orderid"), termsMatch("tim", "timeout"), termsMatch("jobs", "job")]).toEqual([true, false, false]);
  });

  it("scores each issue term once per component by its best field", () => {
    const { ranked } = rankComponents(snapshot, "handleOrder in orders");
    expect(ranked[0]).toMatchObject({ id: "orders", score: 5 }); // "handle" symbol 2 + "order" name 3
    expect(ranked[0]!.reason).toBe('matched "handle" in symbol handleOrder, "order" in name orders');
  });
});

describe("query tools on the fixture snapshot", () => {
  it("search_components: best match first with the facts that matched; nothing for unrelated text", () => {
    const r = searchComponents(snapshot, "jobs queue");
    expect(r.results.map((x) => `${x.id}:${x.score}`)).toEqual(["queue-client:5", "notifier:2", "redis:redis-url:2", "worker:worker-worker:2"]);
    expect(r.results[0]!.reason).toBe('matched "job" in redis-key jobs, "queue" in name queue-client');
    expect(searchComponents(snapshot, "zebra giraffe").results).toEqual([]);
  });

  it("get_neighbors: direction and kind filters; unknown ids are a clear error", () => {
    expect(getNeighbors(snapshot, "queue-client", "out").neighbors.map((n) => `${n.kind}:${n.neighbor}`)).toEqual(["produces:redis:redis-url"]);
    expect(getNeighbors(snapshot, "queue-client", "in").neighbors.map((n) => `${n.kind}:${n.neighbor}`)).toEqual(["imports:orders"]);
    expect(getNeighbors(snapshot, "redis:redis-url", "both", ["consumes"]).neighbors.map((n) => `${n.neighbor}:${n.confidenceLabel}`)).toEqual([
      "notifier:dynamic",
      "worker:worker-worker:proven",
    ]);
    expect(() => getNeighbors(snapshot, "nope")).toThrow(QueryError);
  });

  it("get_edge_evidence: file:line, resolution and a numbered snippet for each piece of evidence", () => {
    const r = getEdgeEvidence(snapshot, "queue-client->redis:redis-url:produces");
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]).toMatchObject({ at: "api/src/queue-client.ts:4", extractor: "redis", resolution: "proven" });
    expect(r.evidence[0]!.snippet).toContain('4|   await client.lPush("jobs", JSON.stringify(message));');
    expect(() => getEdgeEvidence(snapshot, "a->b:imports")).toThrow(/unknown edgeId/);
  });

  it("get_related_tests: the importing test file, or an explicit 0", () => {
    expect(getRelatedTests(snapshot, "orders")).toEqual({ componentId: "orders", tests: [{ file: "api/src/orders.test.ts", importAt: "api/src/orders.test.ts:1" }], summary: "1 linked test" });
    expect(getRelatedTests(snapshot, "worker:worker-worker").summary).toBe("0 linked tests (this repo has test files, but none import this component)");
  });
});

describe("context packet", () => {
  it("an order timing out surfaces components on both sides of the queue", () => {
    const p = buildContext(snapshot, "An order is timing out");
    const roles = Object.fromEntries(p.components.map((c) => [c.id, c.role]));
    expect(roles.orders).toBe("match");
    expect(roles["queue-client"]).toBe("neighbor"); // producer side
    expect(roles["redis:redis-url"]).toBe("neighbor"); // the broker
    expect(roles["worker:worker-worker"]).toBe("neighbor"); // consumer side
    expect(p.components.find((c) => c.id === "worker:worker-worker")!.reason).toBe('queue partner of queue-client across redis:redis-url: consumes "brPop jobs" [proven]');
    expect(p.edges.map((e) => e.id)).toContain("redis:redis-url->worker:worker-worker:consumes");
    expect(p.edges.find((e) => e.id === "queue-client->redis:redis-url:produces")!.evidence).toEqual(["api/src/queue-client.ts:4"]);
    expect(p.tests).toEqual([{ file: "api/src/orders.test.ts", componentId: "orders", importAt: "api/src/orders.test.ts:1" }]);
    expect(p.tokens.method).toMatch(/^estimated/);
    expect(p.tokens.percentOfRepoEstimated).toBeGreaterThan(0);
    expect(formatContext(p)).toContain("estimated tokens");
  });

  it("says plainly when confidence is low and tells the agent to fall back to code search", () => {
    const p = buildContext(snapshot, "the page feels slow"); // ("app" would match the fixture's api:api-app id)
    expect(["low", "none"]).toContain(p.confidence.level);
    expect(p.advice).toMatch(/fall back to normal code search/);
    expect(formatContext(p)).toContain("(heuristic, not a probability)");
    expect(confidenceOf([])).toMatchObject({ level: "none", topScore: 0 });
    expect(confidenceOf([{ id: "a", score: 7, matches: [], reason: "" }, { id: "b", score: 3, matches: [], reason: "" }]).level).toBe("high");
    expect(confidenceOf([{ id: "a", score: 7, matches: [], reason: "" }, { id: "b", score: 6, matches: [], reason: "" }]).level).toBe("medium");
  });

  it("trims to the budget in the documented order and reports each step", () => {
    const full = buildContext(snapshot, "An order is timing out");
    const tight = buildContext(snapshot, "An order is timing out", { budget: 300 });
    expect(tight.trimmed.slice(0, 3)).toEqual(["evidence per edge 2 -> 1", "neighbor file lists dropped (counts kept)", "neighbor components dropped (matches kept)"]);
    expect(tight.components.every((c) => c.role === "match")).toBe(true);
    expect(tight.tokens.packetEstimated).toBeLessThan(full.tokens.packetEstimated);
  });
});

describe("tracehound mcp (in-memory transport)", () => {
  it("lists the four tools with agent-facing descriptions and answers a call", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createServer(snapshot);
    await server.connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_edge_evidence", "get_neighbors", "get_related_tests", "search_components"]);
    for (const t of tools) expect(t.description!.length).toBeGreaterThan(120);

    const res = await client.callTool({ name: "get_related_tests", arguments: { componentId: "orders" } });
    expect(JSON.parse((res.content as { text: string }[])[0]!.text)).toMatchObject({ summary: "1 linked test" });
    const bad = await client.callTool({ name: "get_neighbors", arguments: { componentId: "nope" } });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
