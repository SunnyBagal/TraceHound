// Decision 073a: the client's default transport has no hidden 300 s limit. Loopback HTTP only; no external network.
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Budget } from "../src/llm/budget.ts";
import { TokenFactoryClient } from "../src/llm/client.ts";
import { SpendLedger } from "../src/llm/ledger.ts";
import { defaultFetch, longFetch, setDefaultFetch } from "../src/llm/transport.ts";

let server: Server;
let base = "";
const seen: { method?: string; url?: string; body: string; auth?: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body: b, auth: req.headers.authorization });
      if (req.url === "/hang") return; // never answers
      if (req.url === "/204") return void res.writeHead(204).end();
      if (req.url === "/999") return void res.writeHead(999).end("x");
      const reply = { choices: [{ finish_reason: "stop", message: { content: "hello" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } };
      setTimeout(() => res.writeHead(200, { "content-type": "application/json", "x-test": "1" }).end(JSON.stringify(reply)), 20);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
afterEach(() => {
  seen.length = 0;
  setDefaultFetch((url, init) => globalThis.fetch(url, init)); // back to the setup file's no-network guard
});

describe("longFetch", () => {
  it("sends the method, headers and body and returns the status, headers and body", async () => {
    const res = await longFetch(`${base}/x`, { method: "POST", headers: { Authorization: "Bearer t" }, body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test")).toBe("1");
    expect(((await res.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content).toBe("hello");
    expect(seen[0]).toEqual({ method: "POST", url: "/x", body: '{"a":1}', auth: "Bearer t" });
  });

  it("ends only through the caller's signal", async () => {
    await expect(longFetch(`${base}/hang`, { method: "POST", body: "{}", signal: AbortSignal.timeout(50) })).rejects.toThrow();
  });

  it("gives 204 a null body and rejects a response it cannot build", async () => {
    const r = await longFetch(`${base}/204`, { method: "POST", body: "{}" });
    expect(r.status).toBe(204);
    expect(r.body).toBeNull();
    await expect(longFetch(`${base}/999`, { method: "POST", body: "{}" })).rejects.toThrow(RangeError);
  });
});

describe("TokenFactoryClient's default transport", () => {
  const client = () =>
    new TokenFactoryClient({
      apiKey: "test",
      baseUrl: `${base}/v1`,
      prices: { models: { m: { inputPer1M: 1, outputPer1M: 1, placeholder: false } }, placeholderFallback: { inputPer1M: 5, outputPer1M: 15 } } as never,
      budget: new Budget({ runUSD: 1, totalUSD: 1 }, 0),
      ledger: new SpendLedger(path.join(mkdtempSync(path.join(tmpdir(), "th-transport-")), "spend.jsonl")),
      timeoutMs: 600_000,
    });
  const req = { model: "m", temperature: 0, max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }] };

  it("is defaultFetch, read at call time, so a test setup's guard still applies", async () => {
    await expect(client().chat(req, { purpose: "test" })).rejects.toThrow(/network disabled in tests/);
  });

  it("without the guard it is longFetch: the request reaches the server and the reply is read", async () => {
    setDefaultFetch(null);
    const r = await client().chat(req, { purpose: "test" });
    expect(r.content).toBe("hello");
    expect(seen[0]!.url).toBe("/v1/chat/completions");
    expect(defaultFetch).toBeTypeOf("function");
  });
});
