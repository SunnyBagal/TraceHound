// Invented text and injected fetch only. No real key, vendor call, benchmark input or network.
import { mkdtempSync, existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AnthropicClient, ANTHROPIC_MODELS, ANTHROPIC_URL, ANTHROPIC_VERSION, anthropicCapsFromEnv, anthropicPrice, type AnthropicOptions, type AnthropicModel } from "../src/llm/anthropic.ts";
import { BudgetExceededError, type ChatRequest, TokenFactoryClient } from "../src/llm/client.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import { SpendLedger, summarize } from "../src/llm/ledger.ts";
import { loadPriceTable } from "../src/llm/prices.ts";
import { createDevReportClient } from "../src/llm/provider.ts";
import { formatSpendReport } from "../src/spend.ts";
import { reviewPull } from "../src/review/review.ts";

const KEY = "invented-anthropic-test-key-076g";
const prices = loadPriceTable(path.resolve(import.meta.dirname, "../../../config/prices.json"));
const request = (model: string = ANTHROPIC_MODELS[0]): ChatRequest => ({ model, temperature: 0, max_tokens: 1500,
  messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "Invented example." }] });
const response = (model: string = ANTHROPIC_MODELS[0], extra: Record<string, unknown> = {}) => ({ model, stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "not a finding", signature: "invented" }, { type: "text", text: '{"findings":[]}' }],
  usage: { input_tokens: 100, output_tokens: 20 }, ...extra });
function fixture(replies: { status?: number; body?: unknown; error?: string }[] = [{ body: response() }], options: Partial<AnthropicOptions> = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "th-anthropic-"));
  const ledger = new SpendLedger(path.join(dir, "spend.anthropic.jsonl"));
  const cache = new ResponseCache(path.join(dir, "cache"));
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fakeFetch = (async (url, init) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(init!.body as string) });
    const item = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (item.error) throw new Error(item.error);
    return new Response(JSON.stringify(item.body ?? {}), { status: item.status ?? 200 });
  }) as typeof fetch;
  const o: AnthropicOptions = { scope: "report-only-dev", model: ANTHROPIC_MODELS[0], apiKey: KEY,
    caps: { totalUSD: 12, runUSD: 4 }, prices, ledger, cache, fetch: fakeFetch, ...options };
  return { dir, ledger, cache, calls, fakeFetch, o, client: new AnthropicClient(o) };
}
const env = { ANTHROPIC_API_KEY: KEY, TRACEHOUND_BUDGET_ANTHROPIC_USD: "12", TRACEHOUND_BUDGET_ANTHROPIC_RUN_USD: "4" };
const config = { provider: "anthropic", scope: "report-only-dev", model: ANTHROPIC_MODELS[0] };

describe("Anthropic config and separate money", () => {
  it("does not default to Anthropic when its key is set; requires an explicit dev-only config", () => {
    expect(() => createDevReportClient({}, { env })).toThrow(/NEBIUS_API_KEY/);
    for (const c of [{ ...config, scope: "heldout" }, { ...config, scope: "action" }, { ...config, scope: undefined },
      { ...config, model: "claude-haiku-5-5-20261007" }, { provider: "other" }]) {
      expect(() => createDevReportClient(c, { env })).toThrow();
    }
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "th-provider-default-"));
    expect(createDevReportClient({}, { stateDir, env: { NEBIUS_API_KEY: "invented-nebius-key" } }).client).toBeInstanceOf(TokenFactoryClient);
  });

  it("requires explicit own caps, never falls back to the Nebius cap or echoes an invalid cap", () => {
    expect(() => anthropicCapsFromEnv({ TRACEHOUND_BUDGET_TOTAL_USD: "1000" })).toThrow(/TRACEHOUND_BUDGET_ANTHROPIC_USD/);
    for (const raw of ["", "-1", "Infinity", "NaN", KEY]) {
      try { anthropicCapsFromEnv({ ...env, TRACEHOUND_BUDGET_ANTHROPIC_USD: raw }); throw new Error("accepted invalid cap"); }
      catch (e) { expect((e as Error).message).toMatch(/explicitly set/); expect((e as Error).message).not.toContain(KEY); }
    }
    expect(anthropicCapsFromEnv(env)).toEqual({ totalUSD: 12, runUSD: 4 });
    expect(anthropicCapsFromEnv({ ...env, TRACEHOUND_BUDGET_ANTHROPIC_RUN_USD: "0" }).runUSD).toBe(0);
    const f = fixture();
    expect(() => new AnthropicClient({ ...f.o, caps: {} as AnthropicOptions["caps"] })).toThrow(/caps must be/);
    expect(() => createDevReportClient(config, { env: { ...env, ANTHROPIC_API_KEY: undefined } })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("uses a separate provider-tagged ledger and reports both providers without subtracting Anthropic from Nebius", async () => {
    const f = fixture();
    const nb = new SpendLedger(path.join(f.dir, "spend.jsonl"));
    nb.append({ timestamp: "2026-11-13T00:00:00Z", model: "old-nebius", inputTokens: 1, outputTokens: 1, estCostUSD: 2, purpose: "old" });
    const c = createDevReportClient(config, { stateDir: f.dir, env: { ...env, TRACEHOUND_BUDGET_TOTAL_USD: "0" }, fetch: f.fakeFetch });
    await c.client.chat(request(), { purpose: "dev-report" });
    expect(c.ledger.file).toBe(path.join(f.dir, "spend.anthropic.jsonl"));
    expect(c.ledger.entries()[0]).toMatchObject({ provider: "anthropic", ok: true, settings: { sampling: "default" } });
    expect(nb.totalUSD()).toBe(2);
    const text = formatSpendReport(f.dir, { ...env, TRACEHOUND_BUDGET_TOTAL_USD: "10" });
    expect(text).toContain("By provider"); expect(text).toContain("nebius"); expect(text).toContain("anthropic");
    expect(text).toContain("Nebius est. spend: $2.00000 of $10 cap (remaining $8.00000)");
    expect(text).toContain("Anthropic est. spend (Sunny's money)");
    expect(text).not.toContain(KEY);
    expect(summarize(nb.entries(), "provider")[0]!.key).toBe("nebius");
    expect(() => new AnthropicClient({ ...f.o, ledger: nb })).toThrow(/own provider-tagged ledger/);
  });

  it("checks its run and total cap before a request, and caps the next request after settlement", async () => {
    const f = fixture([], { caps: { totalUSD: 12, runUSD: 0 } });
    await expect(f.client.chat(request(), { purpose: "report" })).rejects.toThrow(/TRACEHOUND_BUDGET_ANTHROPIC_RUN_USD/);
    expect(f.calls).toHaveLength(0); expect(f.ledger.entries()).toEqual([]);
    const g = fixture([{ body: response() }], { caps: { totalUSD: 0, runUSD: 4 } });
    await expect(g.client.chat(request(), { purpose: "report" })).rejects.toThrow(/TRACEHOUND_BUDGET_ANTHROPIC_USD/);
    expect(g.calls).toHaveLength(0);
    const h = fixture([{ body: response(undefined, { usage: { input_tokens: 900_000, output_tokens: 0 } }) }], { caps: { totalUSD: 0.4505, runUSD: 0.4505 }, readCache: false });
    await h.client.chat(request(), { purpose: "report" });
    await expect(h.client.chat(request(), { purpose: "report" })).rejects.toThrow(BudgetExceededError);
    expect(h.calls).toHaveLength(1);
  });

  it("reserves in-flight calls so concurrency cannot evade the row cap", async () => {
    let resolve!: (r: Response) => void;
    const fetch = (() => new Promise<Response>((r) => { resolve = r; })) as typeof globalThis.fetch;
    const f = fixture([], { fetch, caps: { totalUSD: 12, runUSD: 0.001 } });
    const first = f.client.chat(request(), { purpose: "report" });
    await expect(f.client.chat(request(), { purpose: "report" })).rejects.toThrow(BudgetExceededError);
    resolve(new Response(JSON.stringify(response())));
    await first;
    expect(f.client.budget.runSpent).toBeCloseTo(0.00002);
  });
});

describe("mocked Messages contract, exact model and row settings", () => {
  for (const model of ANTHROPIC_MODELS) {
    it(`${model}: exact URL/headers, system prompt, default sampling, text after thinking, usage and default effort`, async () => {
      const f = fixture([{ body: response(model) }], { model });
      const r = await f.client.chat({ ...request(model), chat_template_kwargs: { enable_thinking: true } }, { purpose: "dev-report" });
      const call = f.calls[0]!;
      expect(call.url).toBe(ANTHROPIC_URL);
      expect(call.init).toMatchObject({ method: "POST", redirect: "error", headers: { "x-api-key": KEY, "anthropic-version": ANTHROPIC_VERSION } });
      expect(call.body).toMatchObject({ model, system: "Return JSON.", messages: [{ role: "user", content: "Invented example." }], thinking: { type: "adaptive" },
        output_config: { effort: model === ANTHROPIC_MODELS[0] ? "medium" : "high" } });
      for (const name of ["temperature", "top_p", "top_k", "chat_template_kwargs", "reasoning_effort", "fallbacks"]) expect(call.body).not.toHaveProperty(name);
      expect(r).toMatchObject({ content: '{"findings":[]}', inputTokens: 100, outputTokens: 20, finishReason: "stop", cached: false });
      expect(f.ledger.entries()[0]!.settings).toMatchObject({ sampling: "default", thinking: "adaptive", apiVersion: ANTHROPIC_VERSION });
      expect(readFileSync(f.ledger.file, "utf8")).not.toContain(KEY);
    });
    for (const effort of ["low", "medium", "high"] as const) {
      it(`${model}: thinking off at ${effort} maps to the model's supported setting`, async () => {
        const f = fixture([{ body: response(model) }], { model, effort });
        await f.client.chat({ ...request(model), chat_template_kwargs: { enable_thinking: false } }, { purpose: "dev-report" });
        expect(f.calls[0]!.body).toMatchObject({ thinking: { type: model === ANTHROPIC_MODELS[0] ? "disabled" : "between_tools" }, output_config: { effort } });
      });
    }
    for (const effort of ["xhigh", "max"] as const) {
      it(`${model}: adaptive accepts ${effort}; thinking off at that effort is refused locally`, async () => {
        const f = fixture([{ body: response(model) }], { model, effort });
        await f.client.chat(request(model), { purpose: "report" });
        await expect(f.client.chat({ ...request(model), chat_template_kwargs: { enable_thinking: false } }, { purpose: "report" })).rejects.toThrow(/high or below/);
        expect(f.calls).toHaveLength(1);
      });
    }
  }

  it("refuses model switches, assistant prefill, tool loops and unsupported settings before fetch", async () => {
    const f = fixture();
    const bad: ChatRequest[] = [request(ANTHROPIC_MODELS[1]), { ...request(), messages: [{ role: "assistant", content: "{" }] },
      { ...request(), tool_choice: "required" }, { ...request(), max_tokens: -1 }, { ...request(), reasoning_effort: "none" },
      { ...request(), chat_template_kwargs: { token_budget: 123 } }];
    for (const r of bad) await expect(f.client.chat(r, { purpose: "report" })).rejects.toThrow();
    expect(f.calls).toHaveLength(0); expect(f.ledger.entries()).toEqual([]);
  });

  it("prices the exact Haiku threshold, accounts for long prompts and never uses unknown-model fallback", async () => {
    expect(anthropicPrice(prices, ANTHROPIC_MODELS[0], 100_000).inputPer1M).toBe(0.1);
    expect(anthropicPrice(prices, ANTHROPIC_MODELS[0], 100_001)).toMatchObject({ inputPer1M: 0.5, outputPer1M: 2.5 });
    expect(anthropicPrice(prices, ANTHROPIC_MODELS[1], 100_001)).toMatchObject({ inputPer1M: 2, outputPer1M: 10 });
    const f = fixture([{ body: response(undefined, { usage: { input_tokens: 100_001, output_tokens: 10 } }) }]);
    await f.client.chat(request(), { purpose: "report" });
    expect(f.ledger.totalUSD()).toBeCloseTo((100_001 * 0.5 + 10 * 2.5) / 1e6);
  });
});

describe("failed calls are counted, redacted and never switch models", () => {
  for (const stop of [{ stop_reason: "refusal" }, { stop_reason: "end_turn", stop_details: { type: "refusal" } }]) {
    it(`refusal ${JSON.stringify(stop)} is a ledgered failure and is never read as an answer or cached`, async () => {
      const f = fixture([{ body: response(undefined, { ...stop, content: [{ type: "text", text: KEY }] }) }]);
      await expect(f.client.chat(request(), { purpose: "report" })).rejects.toThrow(/refusal.*no fallback/);
      expect(f.calls).toHaveLength(1); expect(f.ledger.entries()).toHaveLength(1);
      expect(f.ledger.entries()[0]).toMatchObject({ provider: "anthropic", ok: false, inputTokens: 100, outputTokens: 20 });
      expect(f.ledger.totalUSD()).toBeCloseTo(0.00002);
      expect(existsSync(f.cache.dir)).toBe(false);
      expect(readFileSync(f.ledger.file, "utf8")).not.toContain(KEY);
    });
  }
  for (const status of [400, 429, 500]) {
    it(`HTTP ${status}: fixed redacted error, one failed ledger row, no retry/fallback`, async () => {
      const f = fixture([{ status, body: { error: { message: KEY } } }]);
      try { await f.client.chat(request(), { purpose: "report" }); throw new Error("not failed"); }
      catch (e) { expect((e as Error).message).toBe(`Anthropic HTTP ${status}; no fallback`); }
      expect(f.calls).toHaveLength(1); expect(f.ledger.entries()[0]!.ok).toBe(false);
      expect(f.ledger.totalUSD() === 0).toBe(status < 500);
      expect(existsSync(f.cache.dir)).toBe(false);
    });
  }
  it("transport exceptions never expose their message/key; ambiguity charges the conservative bound", async () => {
    const f = fixture([{ error: KEY }]);
    await expect(f.client.chat(request(), { purpose: "report" })).rejects.toThrow("Anthropic request failed (transport or timeout); no fallback");
    expect(f.client.budget.runSpent).toBeGreaterThan(0); expect(f.calls).toHaveLength(1);
    expect(f.ledger.entries()[0]).toMatchObject({ ok: false, usageReported: false, priceEstimated: true });
    expect(readFileSync(f.ledger.file, "utf8")).not.toContain(KEY);
  });
  for (const fields of [{ model: ANTHROPIC_MODELS[1] }, { stop_reason: "unexpected" }, { content: [] }, { content: [{ type: "text", text: KEY }] }]) {
    it(`rejects unusable/mismatched output ${Object.keys(fields).join()} as a counted failure`, async () => {
      const f = fixture([{ body: response(undefined, fields) }]);
      await expect(f.client.chat(request(), { purpose: "report" })).rejects.toThrow();
      expect(f.ledger.entries()[0]!.ok).toBe(false); expect(f.calls).toHaveLength(1);
      expect(existsSync(f.cache.dir)).toBe(false);
    });
  }
  it("the existing reviewer records refusal as CHUNK_FAILED, preserving its prompt and model instead of falling back", async () => {
    const f = fixture([{ body: response(undefined, { stop_reason: "refusal" }) }]);
    const result = await reviewPull(f.client, { title: "Invented change", description: "", diff: "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n" },
      { model: ANTHROPIC_MODELS[0] });
    expect(result.review.chunks[0]!.status).toBe("CHUNK_FAILED");
    expect(result.review.chunks[0]!.attempts).toBe(1);
    expect(f.calls).toHaveLength(1); expect(f.calls[0]!.body.model).toBe(ANTHROPIC_MODELS[0]);
    expect(f.ledger.entries()[0]!.ok).toBe(false);
  });
});

describe("cache is provider/settings isolated and offline stays offline", () => {
  it("serves successful repeats and offline hits without another request, cap reservation or ledger row", async () => {
    const f = fixture();
    await f.client.chat(request(), { purpose: "report" });
    expect((await f.client.chat(request(), { purpose: "report" })).cached).toBe(true);
    expect(f.calls).toHaveLength(1); expect(f.ledger.entries()).toHaveLength(1);
    const offline = new AnthropicClient({ ...f.o, offline: true, apiKey: "" });
    expect((await offline.chat(request(), { purpose: "report" })).costUSD).toBe(0);
    await expect(offline.chat({ ...request(), messages: [{ role: "user", content: "new" }] }, { purpose: "report" })).rejects.toThrow(/no request sent/);
    expect(f.calls).toHaveLength(1); expect(offline.budget.runSpent).toBe(0);
    expect(readFileSync(path.join(f.cache.dir, readdirSync(f.cache.dir)[0]!), "utf8")).not.toContain("not a finding");
  });
  it("does not share a Nebius key or a different thinking setting; no-cache still records each call", async () => {
    const f = fixture();
    f.cache.put(ResponseCache.key(request().model, request()), { choices: [{ message: { content: "legacy" } }] });
    await f.client.chat(request(), { purpose: "report" });
    await f.client.chat({ ...request(), chat_template_kwargs: { enable_thinking: false } }, { purpose: "report" });
    expect(f.calls).toHaveLength(2);
    const bypass = new AnthropicClient({ ...f.o, readCache: false });
    await bypass.chat(request(), { purpose: "report" });
    expect(f.calls).toHaveLength(3); expect(f.ledger.entries()).toHaveLength(3);
  });
  it("never caches truncated content", async () => {
    const f = fixture([{ body: response(undefined, { stop_reason: "max_tokens" }) }]);
    for (let i = 0; i < 2; i++) expect((await f.client.chat(request(), { purpose: "report" })).finishReason).toBe("length");
    expect(f.calls).toHaveLength(2); expect(f.ledger.entries()).toHaveLength(2); expect(existsSync(f.cache.dir)).toBe(false);
  });
});
