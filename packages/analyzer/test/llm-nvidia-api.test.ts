// Decision 071: the opt-in NVIDIA API route for Nemotron 3 Ultra. Fake fetch and a fake clock only.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Budget, BudgetExceededError } from "../src/llm/budget.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import {
  NVIDIA_API_BASE_URL,
  NVIDIA_API_CACHE_NAMESPACE,
  NVIDIA_API_MODEL,
  nvidiaApiFromEnv,
  RateWindow,
  retryAfterMs,
  TokenFactoryClient,
  type ChatRequest,
  type NvidiaApiOptions,
} from "../src/llm/client.ts";
import { SpendLedger } from "../src/llm/ledger.ts";
import { costUSD, estimateInputTokens, loadPriceTable, priceFor } from "../src/llm/prices.ts";

const REPO_PRICES = path.resolve(import.meta.dirname, "../../../config/prices.json");
const CENTRAL = "https://api.tokenfactory.us-central1.nebius.com/v1";
const NORTH = "https://api.tokenfactory.us-north1.nebius.com/v1";
const SUPER_3 = "nvidia/nemotron-3-super-120b-a12b";
const SUPER_35 = "nvidia/Nemotron-3.5-Super-VL";
const ULTRA_TF = "nvidia/Nemotron-3-Ultra-550b-a55b";
const NEBIUS_KEY = "nebius-test-key";
const NVIDIA_KEY = "nvidia-test-key";

const request = (model: string): ChatRequest => ({
  model,
  temperature: 0,
  max_tokens: 32_000,
  messages: [{ role: "user", content: "review this" }],
  chat_template_kwargs: { enable_thinking: true },
});
const okBody = { choices: [{ finish_reason: "stop", message: { content: "{}", reasoning_content: "thinking" } }], usage: { prompt_tokens: 1200, completion_tokens: 3400, total_tokens: 4600 } };

interface Sent {
  url: string;
  auth: string;
  body: string;
  timeoutSignal: boolean;
}

/** Replies from `statuses` in order (then 200), recording what was sent. */
function recordingFetch(statuses: { status: number; retryAfter?: string }[] = []) {
  const sent: Sent[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    sent.push({ url, auth: (init.headers as Record<string, string>).authorization!, body: init.body as string, timeoutSignal: init.signal instanceof AbortSignal });
    const s = statuses[sent.length - 1];
    if (s && s.status !== 200) return new Response(JSON.stringify({ error: "Too Many Requests" }), { status: s.status, headers: s.retryAfter ? { "retry-after": s.retryAfter } : {} });
    return new Response(JSON.stringify(okBody));
  }) as unknown as typeof fetch;
  return { impl, sent };
}

function fakeClock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => (t += ms),
    sleeps,
  };
}

function client(fetchImpl: typeof fetch, nvidiaApi?: NvidiaApiOptions, baseUrl?: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
  const ledger = new SpendLedger(path.join(dir, "spend.jsonl"));
  const c = new TokenFactoryClient({
    apiKey: NEBIUS_KEY,
    baseUrl,
    prices: loadPriceTable(REPO_PRICES),
    budget: new Budget({ totalUSD: 45, runUSD: 1 }, 0),
    ledger,
    cache: new ResponseCache(path.join(dir, "cache")),
    readCache: false,
    fetch: fetchImpl,
    ...(nvidiaApi && { nvidiaApi }),
  });
  return { client: c, ledger };
}

const nvidia = (clock = fakeClock()): NvidiaApiOptions => ({ apiKey: NVIDIA_KEY, window: new RateWindow(36, 60_000, clock), sleep: clock.sleep });

describe("nvidiaApiFromEnv", () => {
  it("is off unless TRACEHOUND_NVIDIA_API is exactly 1", () => {
    expect(nvidiaApiFromEnv({ NVIDIA_API_KEY: NVIDIA_KEY })).toBeUndefined();
    expect(nvidiaApiFromEnv({ TRACEHOUND_NVIDIA_API: "true", NVIDIA_API_KEY: NVIDIA_KEY })).toBeUndefined();
    expect(nvidiaApiFromEnv({ TRACEHOUND_NVIDIA_API: "0", NVIDIA_API_KEY: NVIDIA_KEY })).toBeUndefined();
    expect(nvidiaApiFromEnv({ TRACEHOUND_NVIDIA_API: "1", NVIDIA_API_KEY: NVIDIA_KEY })).toEqual({ apiKey: NVIDIA_KEY });
  });

  it("refuses TRACEHOUND_NVIDIA_API=1 without NVIDIA_API_KEY", () => {
    expect(() => nvidiaApiFromEnv({ TRACEHOUND_NVIDIA_API: "1" })).toThrow(/NVIDIA_API_KEY/);
  });
});

describe("routing", () => {
  it("never sends anything to the NVIDIA host without nvidiaApi, whatever the model", async () => {
    for (const model of [NVIDIA_API_MODEL, ULTRA_TF, SUPER_3, SUPER_35]) {
      const f = recordingFetch();
      await client(f.impl).client.chat(request(model), { purpose: "p" });
      expect(f.sent).toHaveLength(1);
      expect(f.sent[0]!.url).not.toContain("integrate.api.nvidia.com");
      expect(f.sent[0]!.auth).toBe(`Bearer ${NEBIUS_KEY}`);
    }
  });

  it("sends only the exact Ultra id to the NVIDIA host, with the NVIDIA key and the same body", async () => {
    const f = recordingFetch();
    const { client: c } = client(f.impl, nvidia());
    await c.chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    expect(f.sent).toEqual([{ url: `${NVIDIA_API_BASE_URL}/chat/completions`, auth: `Bearer ${NVIDIA_KEY}`, body: JSON.stringify(request(NVIDIA_API_MODEL)), timeoutSignal: true }]);
    expect(NVIDIA_API_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("keeps every Token Factory request byte-identical when nvidiaApi is set", async () => {
    for (const [model, url] of [[SUPER_3, CENTRAL], [SUPER_35, NORTH], [ULTRA_TF, CENTRAL], ["nvidia/Nemotron-3-ultra-550b-a55b", CENTRAL]] as const) {
      const off = recordingFetch();
      const on = recordingFetch();
      await client(off.impl).client.chat(request(model), { purpose: "p" });
      await client(on.impl, nvidia()).client.chat(request(model), { purpose: "p" });
      expect(on.sent).toEqual(off.sent);
      expect(on.sent[0]!.url).toBe(`${url}/chat/completions`);
      expect(on.sent[0]!.auth).toBe(`Bearer ${NEBIUS_KEY}`);
      expect(JSON.stringify(on.sent)).not.toContain(NVIDIA_KEY);
    }
  });

  it("never sends the Nebius key to the NVIDIA host, nor the NVIDIA key to a Token Factory host", async () => {
    const f = recordingFetch();
    const { client: c } = client(f.impl, nvidia());
    await c.chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    await c.chat(request(SUPER_3), { purpose: "p" });
    await c.chat(request(SUPER_35), { purpose: "p" });
    for (const s of f.sent) {
      const host = new URL(s.url).hostname;
      if (host === "integrate.api.nvidia.com") expect(JSON.stringify(s)).not.toContain(NEBIUS_KEY);
      else expect(JSON.stringify(s)).not.toContain(NVIDIA_KEY);
    }
    expect(f.sent.map((s) => new URL(s.url).hostname)).toEqual(["integrate.api.nvidia.com", "api.tokenfactory.us-central1.nebius.com", "api.tokenfactory.us-north1.nebius.com"]);
  });

  it("ignores a custom NEBIUS_BASE_URL for the NVIDIA route and keeps it for the rest", async () => {
    const f = recordingFetch();
    const { client: c } = client(f.impl, nvidia(), "http://127.0.0.1:8080/v1");
    await c.chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    await c.chat(request(SUPER_3), { purpose: "p" });
    expect(f.sent.map((s) => s.url)).toEqual([`${NVIDIA_API_BASE_URL}/chat/completions`, "http://127.0.0.1:8080/v1/chat/completions"]);
  });
});

describe("price and ledger", () => {
  it("prices the NVIDIA API id at 0 and leaves the Token Factory placeholder alone", () => {
    const table = loadPriceTable(REPO_PRICES);
    expect(priceFor(table, NVIDIA_API_MODEL)).toEqual({ inputPer1M: 0, outputPer1M: 0, estimated: false });
    expect(table.models[ULTRA_TF]).toEqual({ inputPer1M: null, outputPer1M: null, placeholder: true });
  });

  it("ledgers an Ultra call at $0 with its real token counts", async () => {
    const f = recordingFetch();
    const { client: c, ledger } = client(f.impl, nvidia());
    const r = await c.chat(request(NVIDIA_API_MODEL), { purpose: "review" });
    expect(r).toMatchObject({ costUSD: 0, inputTokens: 1200, outputTokens: 3400, finishReason: "stop", reasoningChars: 8 });
    expect(ledger.entries()).toEqual([expect.objectContaining({ model: NVIDIA_API_MODEL, inputTokens: 1200, outputTokens: 3400, estCostUSD: 0, ok: true, usageReported: true, priceEstimated: false })]);
    expect(JSON.stringify(ledger.entries())).not.toMatch(/https?:|nvidia\.com/);
  });
});

describe("the $0 price and the cache namespace hold only on the NVIDIA route (review of #63)", () => {
  function sharedClient(fetchImpl: typeof fetch, cacheDir: string, budget: Budget, nvidiaApi?: NvidiaApiOptions) {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
    return new TokenFactoryClient({
      apiKey: NEBIUS_KEY,
      prices: loadPriceTable(REPO_PRICES),
      budget,
      ledger: new SpendLedger(path.join(dir, "spend.jsonl")),
      cache: new ResponseCache(cacheDir),
      readCache: true,
      fetch: fetchImpl,
      ...(nvidiaApi && { nvidiaApi }),
    });
  }

  it("reserves the placeholderFallback estimate for the lowercase Ultra id without the flag, and $0 with it", async () => {
    const table = loadPriceTable(REPO_PRICES);
    const fallback = costUSD({ ...table.placeholderFallback, estimated: true }, estimateInputTokens(request(NVIDIA_API_MODEL).messages), 32_000);
    expect(fallback).toBeGreaterThan(0);
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
    const off = new Budget({ totalUSD: 45, runUSD: 1 }, 0);
    const offReserve = vi.spyOn(off, "reserve");
    const offFetch = recordingFetch();
    const r = await sharedClient(offFetch.impl, cacheDir, off).chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    expect(offReserve.mock.calls.map((c) => c[0])).toEqual([fallback]);
    expect(r.costUSD).toBeGreaterThan(0);
    expect(offFetch.sent[0]!.url).toBe(`${CENTRAL}/chat/completions`);
    const on = new Budget({ totalUSD: 45, runUSD: 1 }, 0);
    const onReserve = vi.spyOn(on, "reserve");
    await sharedClient(recordingFetch().impl, mkdtempSync(path.join(tmpdir(), "tracehound-test-")), on, nvidia()).chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    expect(onReserve.mock.calls.map((c) => c[0])).toEqual([0]);
  });

  it("refuses an unflagged lowercase Ultra request that the run cap cannot cover, before sending it", async () => {
    const f = recordingFetch();
    const c = sharedClient(f.impl, mkdtempSync(path.join(tmpdir(), "tracehound-test-")), new Budget({ totalUSD: 45, runUSD: 0.1 }, 0));
    await expect(c.chat(request(NVIDIA_API_MODEL), { purpose: "p" })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(f.sent).toHaveLength(0);
  });

  it("never shares a cache entry between flagged and unflagged requests; unflagged keys are unchanged", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
    const budget = () => new Budget({ totalUSD: 45, runUSD: 1 }, 0);
    const req = request(NVIDIA_API_MODEL);
    const cache = new ResponseCache(cacheDir);
    const offKey = ResponseCache.key(NVIDIA_API_MODEL, req);
    const onKey = ResponseCache.key(`${NVIDIA_API_CACHE_NAMESPACE}${NVIDIA_API_MODEL}`, req);
    expect(onKey).not.toBe(offKey);

    const off1 = recordingFetch();
    expect((await sharedClient(off1.impl, cacheDir, budget()).chat(req, { purpose: "p" })).cached).toBe(false);
    expect(cache.get(offKey)).toBeDefined();
    expect(cache.get(onKey)).toBeUndefined();

    const on1 = recordingFetch();
    expect((await sharedClient(on1.impl, cacheDir, budget(), nvidia()).chat(req, { purpose: "p" })).cached).toBe(false);
    expect(on1.sent).toHaveLength(1);
    expect(on1.sent[0]!.url).toBe(`${NVIDIA_API_BASE_URL}/chat/completions`);
    expect(cache.get(onKey)).toBeDefined();

    // each route now hits only its own entry
    const on2 = recordingFetch();
    expect((await sharedClient(on2.impl, cacheDir, budget(), nvidia()).chat(req, { purpose: "p" })).cached).toBe(true);
    const off2 = recordingFetch();
    expect((await sharedClient(off2.impl, cacheDir, budget()).chat(req, { purpose: "p" })).cached).toBe(true);
    expect([...on2.sent, ...off2.sent]).toHaveLength(0);
  });

  it("keeps Token Factory cache keys for every other model as they were, flag or not", async () => {
    for (const model of [SUPER_3, SUPER_35, ULTRA_TF]) {
      const cacheDir = mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
      await sharedClient(recordingFetch().impl, cacheDir, new Budget({ totalUSD: 45, runUSD: 1 }, 0), nvidia()).chat(request(model), { purpose: "p" });
      expect(new ResponseCache(cacheDir).get(ResponseCache.key(model, request(model)))).toBeDefined();
    }
  });
});

describe("RateWindow (fake clock)", () => {
  it("allows 36 in a rolling minute, then waits for the oldest to leave the window", async () => {
    const clock = fakeClock();
    const w = new RateWindow(36, 60_000, clock);
    for (let i = 0; i < 36; i++) {
      await w.acquire();
      clock.advance(100);
    }
    expect(clock.sleeps).toEqual([]);
    const before = clock.now();
    await w.acquire();
    // the first stamp was at start; now is start + 3600, so the wait is 60,000 − 3,600
    expect(clock.sleeps).toEqual([56_400]);
    expect(clock.now()).toBe(before + 56_400);
  });

  it("is shared across clients: 40 Ultra requests from two clients send 36, then wait", async () => {
    const clock = fakeClock();
    const shared = { apiKey: NVIDIA_KEY, window: new RateWindow(36, 60_000, clock), sleep: clock.sleep };
    const f = recordingFetch();
    const a = client(f.impl, shared).client;
    const b = client(f.impl, shared).client;
    await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).chat(request(NVIDIA_API_MODEL), { purpose: `p${i}` })));
    expect(f.sent).toHaveLength(40);
    expect(clock.sleeps.length).toBeGreaterThan(0);
    expect(clock.now()).toBeGreaterThanOrEqual(1_000_000 + 60_000);
  });

  it("does not throttle Token Factory requests", async () => {
    const clock = fakeClock();
    const f = recordingFetch();
    const { client: c } = client(f.impl, nvidia(clock));
    for (let i = 0; i < 50; i++) await c.chat({ ...request(SUPER_3), messages: [{ role: "user", content: `m${i}` }] }, { purpose: "p" });
    expect(f.sent).toHaveLength(50);
    expect(clock.sleeps).toEqual([]);
  });
});

describe("HTTP 429 on the NVIDIA API (fake clock)", () => {
  it("waits 20 s, doubling, and resends the same request; 429s are counted, not ledgered", async () => {
    const clock = fakeClock();
    const f = recordingFetch([{ status: 429 }, { status: 429 }, { status: 429 }]);
    const { client: c, ledger } = client(f.impl, nvidia(clock));
    const r = await c.chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    expect(r.content).toBe("{}");
    expect(clock.sleeps).toEqual([20_000, 40_000, 80_000]);
    expect(new Set(f.sent.map((s) => s.body)).size).toBe(1);
    expect(c.nvidiaApiStats).toEqual({ requests: 4, http429: 3 });
    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.entries()[0]).toMatchObject({ ok: true, estCostUSD: 0 });
  });

  it("uses Retry-After when present", async () => {
    const clock = fakeClock();
    const f = recordingFetch([{ status: 429, retryAfter: "7" }]);
    const { client: c } = client(f.impl, nvidia(clock));
    await c.chat(request(NVIDIA_API_MODEL), { purpose: "p" });
    expect(clock.sleeps).toEqual([7_000]);
  });

  it("gives up after 5 waits: the sixth 429 is an HTTP error ledgered at 0 tokens", async () => {
    const clock = fakeClock();
    const f = recordingFetch(Array.from({ length: 6 }, () => ({ status: 429 })));
    const { client: c, ledger } = client(f.impl, nvidia(clock));
    await expect(c.chat(request(NVIDIA_API_MODEL), { purpose: "p" })).rejects.toThrow(/HTTP 429/);
    expect(clock.sleeps).toEqual([20_000, 40_000, 80_000, 160_000, 320_000]);
    expect(f.sent).toHaveLength(6);
    expect(c.nvidiaApiStats).toEqual({ requests: 6, http429: 6 });
    expect(ledger.entries()).toEqual([expect.objectContaining({ ok: false, inputTokens: 0, outputTokens: 0, estCostUSD: 0 })]);
  });

  it("does not retry another 4xx", async () => {
    const clock = fakeClock();
    const f = recordingFetch([{ status: 404 }]);
    const { client: c } = client(f.impl, nvidia(clock));
    await expect(c.chat(request(NVIDIA_API_MODEL), { purpose: "p" })).rejects.toThrow(/HTTP 404/);
    expect(f.sent).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("leaves a Token Factory 429 as it was: one request, an error, no wait", async () => {
    const clock = fakeClock();
    const f = recordingFetch([{ status: 429 }]);
    const { client: c } = client(f.impl, nvidia(clock));
    await expect(c.chat(request(SUPER_3), { purpose: "p" })).rejects.toThrow(/HTTP 429/);
    expect(f.sent).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
    expect(c.nvidiaApiStats).toEqual({ requests: 0, http429: 0 });
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs("")).toBeUndefined();
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs("1.5")).toBe(1500);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 4000)).toBe(6000);
    expect(retryAfterMs("soon")).toBeUndefined();
  });
});
