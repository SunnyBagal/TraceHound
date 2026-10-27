// Post-freeze options (docs/post-freeze-fixes.md); every option is off by default. Invented diffs
// only, a scripted ChatClient, no network.
import { describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";
import type { GitSource } from "../src/review/context.ts";
import { reviewPullWithContext } from "../src/review/review-ctx.ts";
import { reviewPull, type ReviewOptions } from "../src/review/review.ts";

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
