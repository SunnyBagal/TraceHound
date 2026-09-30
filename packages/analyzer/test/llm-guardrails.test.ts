import { describe, expect, it } from "vitest";
import { Budget, BudgetExceededError, capsFromEnv, DEFAULT_CAPS } from "../src/llm/budget.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import { CacheMissError, TokenFactoryClient, type ChatRequest } from "../src/llm/client.ts";
import { SpendLedger, summarize } from "../src/llm/ledger.ts";
import { costUSD, priceFor } from "../src/llm/prices.ts";
import { fakeClient, TEST_PRICES } from "./helpers.ts";

const request = (model = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", content = "name this"): ChatRequest => ({
  model, temperature: 0, max_tokens: 1500, messages: [{ role: "user", content }],
});

function scriptedFetch(responses: { status?: number; body?: unknown; throws?: boolean }[]) {
  let calls = 0;
  const impl = (async () => {
    const r = responses[Math.min(calls++, responses.length - 1)]!;
    if (r.throws) throw new Error("socket hang up");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, count: () => calls };
}
const ok = (content = '{"name":"X","summary":"Y"}', usage = { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 }) => ({
  body: { choices: [{ message: { content } }], usage },
});

describe("prices", () => {
  it("uses the conservative fallback for placeholders and unknown models, never zero", () => {
    expect(priceFor(TEST_PRICES, "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B")).toEqual({ inputPer1M: 5, outputPer1M: 15, estimated: true });
    expect(priceFor(TEST_PRICES, "someone/unlisted")).toMatchObject({ estimated: true, outputPer1M: 15 });
    expect(priceFor(TEST_PRICES, "priced/model")).toEqual({ inputPer1M: 1, outputPer1M: 2, estimated: false });
  });
});

describe("Budget", () => {
  it("refuses a call whose estimate would cross the run cap or the total cap", () => {
    expect(() => new Budget({ totalUSD: 45, runUSD: 1 }, 0).reserve(1.01, "x")).toThrow(/TRACEHOUND_BUDGET_RUN_USD=1/);
    expect(() => new Budget({ totalUSD: 45, runUSD: 1 }, 44.5).reserve(0.6, "x")).toThrow(/TRACEHOUND_BUDGET_TOTAL_USD=45/);
  });

  it("counts in-flight reservations so parallel calls can't jointly overshoot", () => {
    const budget = new Budget({ totalUSD: 45, runUSD: 1 }, 0);
    budget.reserve(0.6, "a");
    expect(() => budget.reserve(0.6, "b")).toThrow(BudgetExceededError);
  });

  it("reads caps from env with defaults 45 / 1 and rejects nonsense", () => {
    expect(capsFromEnv({})).toEqual({ totalUSD: 45, runUSD: 1 });
    expect(capsFromEnv({ TRACEHOUND_BUDGET_TOTAL_USD: "10", TRACEHOUND_BUDGET_RUN_USD: "0.25" })).toEqual({ totalUSD: 10, runUSD: 0.25 });
    expect(() => capsFromEnv({ TRACEHOUND_BUDGET_RUN_USD: "lots" })).toThrow(/non-negative number/);
  });
});

describe("TokenFactoryClient", () => {
  it("refuses before sending anything when the worst-case estimate exceeds the cap", async () => {
    const f = scriptedFetch([ok()]);
    const { client, ledger } = fakeClient(f.impl, { caps: { totalUSD: 45, runUSD: 0.01 } }); // 1500 out tok * $15/1M = $0.0225
    await expect(client.chat(request(), { purpose: "component-naming" })).rejects.toThrow(/refusing component-naming/);
    expect(f.count()).toBe(0);
    expect(ledger.entries()).toEqual([]);
  });

  it("appends a ledger entry per real call using reported usage", async () => {
    const f = scriptedFetch([ok()]);
    const { client, ledger, budget } = fakeClient(f.impl);
    const result = await client.chat(request(), { purpose: "component-naming", componentId: "c1" });
    const [entry] = ledger.entries();
    expect(entry).toMatchObject({ model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", inputTokens: 200, outputTokens: 50, purpose: "component-naming", componentId: "c1", usageReported: true, priceEstimated: true });
    expect(entry!.estCostUSD).toBeCloseTo(costUSD({ inputPer1M: 5, outputPer1M: 15, estimated: true }, 200, 50));
    expect(result.costUSD).toBe(entry!.estCostUSD);
    expect(budget.runSpent).toBe(entry!.estCostUSD);
    expect(entry!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serves repeats from the cache: no request, no ledger entry, $0", async () => {
    const f = scriptedFetch([ok()]);
    const { client, ledger, dir } = fakeClient(f.impl);
    await client.chat(request(), { purpose: "p" });
    const again = await client.chat(request(), { purpose: "p" });
    expect(again).toMatchObject({ cached: true, costUSD: 0, content: '{"name":"X","summary":"Y"}' });
    expect(f.count()).toBe(1);
    expect(ledger.entries()).toHaveLength(1);

    // a new process (fresh client, same state dir) also hits the cache
    const second = fakeClient(scriptedFetch([ok()]).impl, { dir });
    expect((await second.client.chat(request(), { purpose: "p" })).cached).toBe(true);
  });

  it("offline (--cache-only) serves hits and throws on a miss without fetch, reservation or ledger", async () => {
    const f = scriptedFetch([ok()]);
    const { dir } = fakeClient(f.impl);
    await fakeClient(f.impl, { dir }).client.chat(request(), { purpose: "p" }); // warm the cache
    const offline = fakeClient(f.impl, { dir, offline: true });
    expect((await offline.client.chat(request(), { purpose: "p" })).cached).toBe(true);
    await expect(offline.client.chat(request(undefined, "not cached"), { purpose: "p", componentId: "c" })).rejects.toThrow(CacheMissError);
    await expect(offline.client.listModels()).rejects.toThrow(CacheMissError);
    expect(f.count()).toBe(1); // only the warm-up call
    expect(offline.budget.runSpent).toBe(0);
    expect(offline.ledger.entries()).toHaveLength(1); // the warm-up's entry, nothing new
  });

  it("keys the cache on the full prompt and model", async () => {
    expect(ResponseCache.key("m", request("m", "a"))).not.toBe(ResponseCache.key("m", request("m", "b")));
    expect(ResponseCache.key("m1", request("m1"))).not.toBe(ResponseCache.key("m2", request("m1")));
  });

  it("--no-cache bypasses reads but still pays and records", async () => {
    const f = scriptedFetch([ok()]);
    const { dir } = fakeClient(f.impl);
    const warm = fakeClient(f.impl, { dir });
    await warm.client.chat(request(), { purpose: "p" });
    const bypass = fakeClient(f.impl, { dir, readCache: false });
    expect((await bypass.client.chat(request(), { purpose: "p" })).cached).toBe(false);
    expect(f.count()).toBe(2);
    expect(bypass.ledger.entries()).toHaveLength(2);
  });

  it("charges nothing for a 4xx rejection and the upper bound for 5xx/network failures", async () => {
    const f = scriptedFetch([{ status: 404, body: { detail: "model not found" } }, { status: 503 }, { throws: true }]);
    const { client, ledger } = fakeClient(f.impl);
    await expect(client.chat(request(), { purpose: "p" })).rejects.toThrow("HTTP 404: model not found");
    await expect(client.chat(request(), { purpose: "p" })).rejects.toThrow("HTTP 503");
    await expect(client.chat(request(), { purpose: "p" })).rejects.toThrow("socket hang up");
    expect(ledger.entries().map((e) => [e.ok, e.outputTokens, e.usageReported])).toEqual([[false, 0, false], [false, 1500, false], [false, 1500, false]]);
  });

  it("never caches failures", async () => {
    const f = scriptedFetch([{ status: 500 }, ok()]);
    const { client } = fakeClient(f.impl);
    await expect(client.chat(request(), { purpose: "p" })).rejects.toThrow();
    expect((await client.chat(request(), { purpose: "p" })).cached).toBe(false);
  });

  it("falls back to the default base URL when baseUrl is explicitly undefined", async () => {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ data: [] }));
    }) as unknown as typeof fetch;
    const client = new TokenFactoryClient({ apiKey: "k", baseUrl: undefined, prices: TEST_PRICES, budget: new Budget(DEFAULT_CAPS, 0), ledger: new SpendLedger("/dev/null"), fetch: impl });
    await client.listModels();
    expect(urls).toEqual(["https://api.tokenfactory.us-central1.nebius.com/v1/models"]);
  });

  it("lists models without touching the budget or ledger", async () => {
    const f = scriptedFetch([{ body: { data: [{ id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" }] } }]);
    const { client, ledger, budget } = fakeClient(f.impl);
    expect(await client.listModels()).toEqual(["nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"]);
    expect(ledger.entries()).toEqual([]);
    expect(budget.runSpent).toBe(0);
  });
});

describe("summarize", () => {
  it("totals by model and by purpose", () => {
    const e = (model: string, purpose: string, cost: number) => ({ timestamp: "t", model, inputTokens: 10, outputTokens: 5, estCostUSD: cost, purpose });
    const rows = summarize([e("a", "naming", 1), e("a", "eval", 2), e("b", "naming", 0.5)], "model");
    expect(rows).toEqual([
      { key: "a", calls: 2, inputTokens: 20, outputTokens: 10, costUSD: 3 },
      { key: "b", calls: 1, inputTokens: 10, outputTokens: 5, costUSD: 0.5 },
    ]);
    expect(summarize([e("a", "naming", 1), e("b", "naming", 0.5)], "purpose")).toEqual([{ key: "naming", calls: 2, inputTokens: 20, outputTokens: 10, costUSD: 1.5 }]);
  });
});
