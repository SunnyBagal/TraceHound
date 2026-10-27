// Post-freeze options (docs/post-freeze-fixes.md); every option is off by default. Invented diffs
// only, a scripted ChatClient, no network.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fakeClient } from "./helpers.ts";
import type { ChatClient } from "../src/agent/decider.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";
import type { GitSource } from "../src/review/context.ts";
import { reviewPullWithContext } from "../src/review/review-ctx.ts";
import { extractJson, parseReviewReply, reviewPull, type ReviewOptions } from "../src/review/review.ts";
import { parseVerdictReply, verifyReviewWithContext } from "../src/review/verify-ctx.ts";

type Reply = Partial<ChatResult> & { content: string };
function scripted(replies: Reply[]) {
  const requests: ChatRequest[] = [];
  const client: ChatClient = {
    async chat(request) {
      requests.push(structuredClone(request));
      const r = replies.shift();
      if (!r) throw new Error("no scripted reply left");
      return { cached: false, latencyMs: 0, costUSD: 0, ...r };
    },
  };
  return { client, requests };
}

const DIFF = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,2 +10,3 @@",
  " const a = 1;",
  "+const b = 2;",
  " const c = 3;",
].join("\n") + "\n";
const input = { title: "Synthetic", description: "", diff: DIFF };
const emptyRepo: GitSource = { show: () => null, grep: () => [] };
type Opts = Omit<ReviewOptions, "model">;
const reviewers = [
  ["review-diff-v1", (c: ChatClient, o: Opts) => reviewPull(c, input, { model: "m", ...o })],
  ["review-ctx-v1", (c: ChatClient, o: Opts) => reviewPullWithContext(c, input, { source: emptyRepo, head: "abc" }, { model: "m", ...o })],
] as const;

describe.each(reviewers)("%s attemptsDetail", (_name, run) => {
  it("records one entry per reply received, without the reply text", async () => {
    const { client } = scripted([
      { content: '{"findings":[', finishReason: "length", outputTokens: 32000, reasoningTokens: 31000 },
      { content: " ", finishReason: "stop" },
    ]);
    const out = await run(client, {});
    expect(out.review.chunks[0]).toMatchObject({ status: "CHUNK_FAILED", attempts: 2 });
    expect(out.review.chunks[0]!.attemptsDetail).toEqual([
      { finishReason: "length", reasoningTokens: 31000, outputTokens: 32000, contentEmpty: false },
      { finishReason: "stop", contentEmpty: true },
    ]);
  });

  it("has no entry for a request that failed", async () => {
    const out = await run(scripted([]).client, {});
    expect(out.review.chunks[0]).toMatchObject({ status: "CHUNK_FAILED", attempts: 1 });
    expect(out.review.chunks[0]!.attemptsDetail).toBeUndefined();
  });
});

const finding = JSON.stringify({ findings: [{ path: "src/cart.ts", line: 11, body: "Synthetic defect" }] });
const cutOff: Reply = { content: '{"findings":[{"path":"src/cart.ts","line":11,"body":"Synth', finishReason: "length" };

describe.each(reviewers)("%s retryOnLength", (_name, run) => {
  it('default "append": the cut-off reply and the invalid-reply message are appended, reasoning unchanged', async () => {
    const { client, requests } = scripted([cutOff, { content: finding }]);
    const out = await run(client, {});
    expect(out.comments).toHaveLength(1);
    expect(requests[1]!.messages).toHaveLength(4);
    expect(requests[1]!.messages[2]).toEqual({ role: "assistant", content: cutOff.content });
    expect(requests[1]!.chat_template_kwargs).toEqual(requests[0]!.chat_template_kwargs);
  });

  it('"fresh": retries the original messages with reasoning off and the same max_tokens', async () => {
    const { client, requests } = scripted([cutOff, { content: finding }]);
    const out = await run(client, { retryOnLength: "fresh" });
    expect(out.comments).toHaveLength(1);
    expect(requests[0]!.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(requests[1]).toEqual({ ...requests[0], chat_template_kwargs: { enable_thinking: false } });
    expect(requests[1]!.max_tokens).toBe(32_000);
  });

  it('"fresh" leaves a reply that stopped normally to the append retry', async () => {
    const { client, requests } = scripted([{ content: "not json", finishReason: "stop" }, { content: finding }]);
    await run(client, { retryOnLength: "fresh" });
    expect(requests[1]!.messages).toHaveLength(4);
  });
});

const FENCED = "Here is my review:\n```json\n" + finding + "\n```\nThanks.";

describe("parser: lenient", () => {
  it.each([
    ["prose around a fence", FENCED],
    ["prose, no fence, braces inside strings, a later non-JSON brace pair",
      `I found one: ${JSON.stringify({ findings: [{ path: "src/cart.ts", line: 11, body: "use {} not {" }] })} and also {not json}.`],
    ["two objects: the last one with findings wins", `draft {"findings":[]} final ${finding}`],
  ])("%s: strict fails, lenient parses one finding", (_name, text) => {
    expect(parseReviewReply(text).ok).toBe(false);
    expect(parseReviewReply(text, "lenient")).toMatchObject({ ok: true, findings: [{ path: "src/cart.ts", line: 11 }] });
  });

  it.each([finding, "```json\n" + finding + "\n```", '{"findings":[]}', cutOff.content, "", "not json"])(
    "matches strict on what strict decides alone: %j", (text) => {
      if (parseReviewReply(text).ok) expect(parseReviewReply(text, "lenient")).toEqual(parseReviewReply(text));
      else expect(parseReviewReply(text, "lenient").ok).toBe(text === finding);
    });

  it("extracts the verifier's object by its verdict key", () => {
    const text = 'Verdict: {"verdict":"keep","reason":"stub"} -- done';
    expect(extractJson(text, "findings")).toBeNull();
    expect(parseVerdictReply(text).ok).toBe(false);
    expect(parseVerdictReply(text, "lenient")).toEqual({ ok: true, verdict: "keep", reason: "stub" });
  });
});

describe.each(reviewers)("%s parser option", (_name, run) => {
  it("default strict: a fenced reply with prose fails twice", async () => {
    const out = await run(scripted([{ content: FENCED }, { content: FENCED }]).client, {});
    expect(out.review.chunks[0]).toMatchObject({ status: "CHUNK_FAILED", attempts: 2 });
  });
  it("lenient: the same reply is accepted on the first attempt", async () => {
    const out = await run(scripted([{ content: FENCED }]).client, { parser: "lenient" });
    expect(out.review.chunks[0]).toMatchObject({ status: "OK", attempts: 1, kept: 1 });
  });
});

describe("verify-ctx-v1 parser option", () => {
  const review = { pr_title: "Synthetic", comments: [{ path: "src/cart.ts", line: 11, body: "Synthetic defect" }] };
  const prose = { content: 'Verdict: {"verdict":"drop","reason":"stub"} done' };
  const verify = (replies: Reply[], parser?: "lenient") =>
    verifyReviewWithContext(scripted(replies).client, input, review, { source: emptyRepo, head: "abc" }, parser ? { parser } : {});
  it("default strict: prose around the verdict is VERIFY_FAILED", async () => {
    expect((await verify([prose, prose])).comments[0]).toMatchObject({ status: "VERIFY_FAILED", attempts: 2 });
  });
  it("lenient: the verdict is read on the first attempt", async () => {
    expect((await verify([prose], "lenient")).comments[0]).toMatchObject({ status: "VERIFIED", verdict: "drop", attempts: 1 });
  });
});

describe("cacheTruncated client option", () => {
  const body = (finish_reason: string) => ({
    choices: [{ finish_reason, message: { content: '{"findings":[' } }],
    usage: { prompt_tokens: 100, completion_tokens: 32_000 },
  });
  const counting = (finish: string) => {
    let calls = 0;
    const impl = (async () => { calls++; return new Response(JSON.stringify(body(finish)), { status: 200 }); }) as typeof fetch;
    return { impl, calls: () => calls };
  };
  const req: ChatRequest = { model: "priced/model", messages: [{ role: "user", content: "invented" }], max_tokens: 32_000, temperature: 0 };
  const run = async (finish: string, cacheTruncated?: boolean) => {
    const f = counting(finish);
    const { client, ledger, dir } = fakeClient(f.impl, cacheTruncated === undefined ? {} : { cacheTruncated });
    const first = await client.chat(req, { purpose: "review" });
    const second = await client.chat(req, { purpose: "review" });
    const cacheDir = path.join(dir, "cache");
    const cached = existsSync(cacheDir) ? readdirSync(cacheDir, { recursive: true }).filter(n => String(n).endsWith(".json")) : [];
    return { calls: f.calls(), first, second, cached, ledger: ledger.entries().map(({ timestamp: _t, ...e }) => e) };
  };

  it("default true: a length reply is cached and the second call is a hit (today)", async () => {
    const r = await run("length");
    expect(r).toMatchObject({ calls: 1, second: { cached: true } });
    expect(r.ledger).toHaveLength(1);
  });

  it("false: a length reply is not cached, so the second call goes out again; same ledger entry per call", async () => {
    const [on, off] = [await run("length"), await run("length", false)];
    expect(off).toMatchObject({ calls: 2, first: { cached: false, finishReason: "length" }, second: { cached: false } });
    expect(off.cached).toEqual([]);
    expect(off.ledger).toEqual([on.ledger[0], on.ledger[0]]);
  });

  it("false: a stop reply is still cached, under the same key as the default", async () => {
    const [on, off] = [await run("stop"), await run("stop", false)];
    expect(off.calls).toBe(1);
    expect(off.cached).toEqual(on.cached);
  });

  // A length body cached by an earlier default run, seeded straight into the cache (no ledger entry).
  const seeded = async (cacheTruncated?: boolean) => {
    const f = counting("stop");
    const { client, ledger, dir } = fakeClient(f.impl, cacheTruncated === undefined ? {} : { cacheTruncated });
    new ResponseCache(path.join(dir, "cache")).put(ResponseCache.key(req.model, req), body("length"));
    const result = await client.chat(req, { purpose: "review" });
    return { calls: f.calls(), result, ledger: ledger.entries().map(({ timestamp: _t, ...e }) => e) };
  };

  it("default true: a pre-seeded length body is served from the cache (today)", async () => {
    const r = await seeded();
    expect(r).toMatchObject({ calls: 0, result: { cached: true, content: '{"findings":[', finishReason: "length" } });
    expect(r.ledger).toEqual([]);
  });

  it("false: a pre-seeded length body is a miss, the request goes out, and its ledger entry is the uncached one", async () => {
    const [fresh, off] = [await run("stop"), await seeded(false)];
    expect(off).toMatchObject({ calls: 1, result: { cached: false, finishReason: "stop" } });
    expect(off.ledger).toEqual([fresh.ledger[0]]);
  });
});
