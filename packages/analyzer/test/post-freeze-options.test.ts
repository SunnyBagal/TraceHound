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
