import { describe, expect, it } from "vitest";
import { componentFacts, nameComponentsWithLlm, parseReply } from "../src/naming/llm.ts";
import { BudgetExceededError } from "../src/llm/budget.ts";
import { Snapshot, type Component, type LlmCall } from "../src/schema.ts";
import { fakeClient } from "./helpers.ts";

const component = (id: string, name: string, extra: Partial<Component> = {}): Component => ({
  id, name, kind: "service", subtitle: "sub", naming: { source: "heuristic", heuristicName: name },
  files: [`src/${id}.ts`], entryPoints: [], membership: [], routes: [], envVars: [], counts: { files: 1, routes: 0, envVars: 0 }, ...extra,
});

const SECRET_SNIPPET = "const secretSourceLine = 42;";
const base: Snapshot = Snapshot.parse({
  schemaVersion: 1,
  analyzerVersion: "test",
  repo: { name: "acme/shop", commitSha: "a".repeat(40) },
  generatedAt: "1970-01-01T00:00:00.000Z",
  components: [
    component("backend:engine-client", "Engine Client"),
    component("redis:redis-url", "Redis", { kind: "queue" }),
    component("pending-response-registry", "Pending-Response Registry", { naming: { source: "override", heuristicName: "Pending-Response Registry" } }),
  ],
  edges: [{
    id: "backend:engine-client->redis:redis-url:produces", source: "backend:engine-client", target: "redis:redis-url", kind: "produces",
    evidenceIds: ["ev1"], weight: 1, confidence: 0.7, confidenceLabel: "resolved-default", label: "lPush jobs",
  }],
  files: [],
  evidence: [{
    id: "ev1", file: "src/backend:engine-client.ts", range: { startLine: 1, endLine: 1 }, extractor: "redis", confidence: 0.7,
    resolution: "resolved-default", detail: "lPush", snippet: { startLine: 1, lines: [SECRET_SNIPPET] },
  }],
  warnings: [],
  llmCalls: [],
});

type Reply = { status?: number; content?: string; throws?: boolean };
function fakeFetch(replies: Record<string, Reply>) {
  const bodies: { model: string; messages: { role: string; content: string }[] }[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const facts = JSON.parse(body.messages[1].content);
    const reply = replies[facts.currentName] ?? {};
    if (reply.throws) throw new Error("network down");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: reply.content ?? "" } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }),
      { status: reply.status ?? 200 },
    );
  }) as unknown as typeof fetch;
  return { impl, bodies };
}

describe("nameComponentsWithLlm", () => {
  it("renames from the model reply, keeps ids and edges untouched, and logs every call", async () => {
    const { impl } = fakeFetch({
      "Engine Client": { content: `<think>it pushes jobs…</think>{"name": "Redis RPC Bridge", "summary": "Sends engine commands over Redis and awaits replies.", "edges": [{"source": "x", "target": "y"}]}` },
      Redis: { content: '```json\n{"name": "Order Queue", "summary": "Redis lists carrying engine requests and responses."}\n```' },
    });
    const logs: LlmCall[] = [];
    const named = await nameComponentsWithLlm(base, { client: fakeClient(impl).client, log: (c) => logs.push(c) });

    expect(named.components.map((c) => [c.id, c.name, c.naming.source])).toEqual([
      ["backend:engine-client", "Redis RPC Bridge", "llm"],
      ["redis:redis-url", "Order Queue", "llm"],
      ["pending-response-registry", "Pending-Response Registry", "override"],
    ]);
    expect(named.components[0]!.summary).toBe("Sends engine commands over Redis and awaits replies.");
    expect(named.components[0]!.naming).toMatchObject({ heuristicName: "Engine Client", model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" });
    expect(named.edges).toEqual(base.edges); // the reply's "edges" key is ignored
    expect(named.evidence).toBe(base.evidence);
    expect(() => Snapshot.parse(named)).not.toThrow();

    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ purpose: "component-naming", model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", ok: true, cached: false, promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    expect(logs[0]!.estCostUSD).toBeCloseTo((100 * 5 + 20 * 15) / 1e6); // placeholder → conservative fallback price
    expect(logs[0]!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(named.llmCalls.map((c) => c.componentId)).toEqual(["backend:engine-client", "redis:redis-url"]); // component order
    expect(named.llmCalls).toEqual(expect.arrayContaining(logs));
  });

  it("falls back to the heuristic name on HTTP errors, network errors and junk replies", async () => {
    const { impl } = fakeFetch({ "Engine Client": { status: 500, content: "" }, Redis: { throws: true } });
    const named = await nameComponentsWithLlm(base, { client: fakeClient(impl).client });
    expect(named.components.map((c) => c.name)).toEqual(["Engine Client", "Redis", "Pending-Response Registry"]);
    expect(named.components.every((c) => c.naming.source !== "llm")).toBe(true);
    expect(named.llmCalls.map((c) => [c.ok, c.error])).toEqual([[false, "HTTP 500: no error message"], [false, "network down"]]);

    const junk = await nameComponentsWithLlm(base, { client: fakeClient(fakeFetch({ "Engine Client": { content: "I think it's a client." } }).impl).client });
    expect(junk.components[0]!.name).toBe("Engine Client");
    expect(junk.llmCalls[0]!.error).toMatch(/not a valid/);
  });

  it("never sends source code, and skips components named by an override", async () => {
    const { impl, bodies } = fakeFetch({});
    await nameComponentsWithLlm(base, { client: fakeClient(impl).client, model: "custom/model" });
    expect(bodies.map((b) => JSON.parse(b.messages[1]!.content).currentName).sort()).toEqual(["Engine Client", "Redis"]);
    expect(bodies.every((b) => b.model === "custom/model")).toBe(true);
    expect(JSON.stringify(bodies)).not.toContain(SECRET_SNIPPET);
  });

  it("rejects a duplicate name so two nodes never share a label", async () => {
    const same = '{"name": "Pending-Response Registry", "summary": "Tracks promises waiting for engine replies."}';
    const named = await nameComponentsWithLlm(base, { client: fakeClient(fakeFetch({ "Engine Client": { content: same } }).impl).client });
    expect(named.components[0]!.name).toBe("Engine Client");
  });
});

describe("componentFacts", () => {
  it("describes neighbours by name and relation", () => {
    expect(componentFacts(base, base.components[0]!).dependsOn).toEqual([{ component: "Redis", relation: "produces", via: "lPush jobs" }]);
    expect(componentFacts(base, base.components[1]!).usedBy).toEqual([{ component: "Engine Client", relation: "produces", via: "lPush jobs" }]);
  });
});

describe("parseReply", () => {
  it("rejects names that look like file names or sentences", () => {
    expect(parseReply('{"name": "engine-client.ts", "summary": "Does things with the engine."}')).toBeUndefined();
    expect(parseReply('{"name": "This component is the one that bridges Redis", "summary": "Does things with the engine."}')).toBeUndefined();
  });
});

describe("nameComponentsWithLlm under a budget cap", () => {
  it("fails loudly instead of falling back when the budget refuses a call", async () => {
    const { impl, bodies } = fakeFetch({});
    const { client } = fakeClient(impl, { caps: { totalUSD: 45, runUSD: 0.0001 } });
    await expect(nameComponentsWithLlm(base, { client })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(bodies).toHaveLength(0);
  });
});

