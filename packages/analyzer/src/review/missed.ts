// The missed-issue pass, review-missed-v1 (P008 amendment 2). It is review-ctx-v1's reviewer
// (reviewPullWithContext, unchanged) run with a different prompt and one more input: the pooled
// findings of review-diff-v1 and review-ctx-v1. Chunking, the context block, reply validation, the
// one retry, CHUNK_FAILED, DiffIndex line checks and the output format are therefore review-ctx-v1's
// own code, not a copy. The only addition is a ChatClient wrapper that, for each request
// reviewPullWithContext makes, swaps in review-missed-v1's system prompt and appends the numbered
// list of pooled findings on that chunk's files to the user message (prompt-missed.ts). Merging the
// pass's findings into the pool (decision 058's agree rule) is the caller's job.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import type { ChatRequest } from "../llm/client.ts";
import { CONTEXT_OPEN, type GitSource } from "./context.ts";
import { chunkDiff, CHUNK_LIMIT_CHARS, parseDiff, renderChunk } from "./diff.ts";
import { REVIEW_CTX_SYSTEM_PROMPT } from "./prompt-ctx.ts";
import { pooledFindingsBlock, pooledForChunk, REVIEW_MISSED_SYSTEM_PROMPT, REVIEW_MISSED_VERSION, type PooledFinding } from "./prompt-missed.ts";
import { reviewUserMessage } from "./prompt.ts";
import { reviewPullWithContext, type ReviewCtxOutput } from "./review-ctx.ts";
import type { PullInput, ReviewOptions } from "./review.ts";

export { REVIEW_MISSED_VERSION };
export const REVIEW_MISSED_PROMPT_SHA256 = createHash("sha256").update(REVIEW_MISSED_SYSTEM_PROMPT).digest("hex");

export type ReviewMissedOutput = Omit<ReviewCtxOutput, "review"> & {
  review: Omit<ReviewCtxOutput["review"], "context"> & {
    context: (ReviewCtxOutput["review"]["context"][number] & { listed: number })[];
    /** findings in the pool; each chunk lists only those on its files (`context[].listed`) */
    pool: number;
  };
};

export async function reviewMissed(
  client: ChatClient,
  input: PullInput,
  pool: PooledFinding[],
  repo: { source: GitSource; head: string },
  opts: ReviewOptions & { contextBudget?: number },
): Promise<ReviewMissedOutput> {
  const chunks = chunkDiff(parseDiff(input.diff), opts.chunkLimit ?? CHUNK_LIMIT_CHARS);
  // review-ctx-v1's user message for chunk i is reviewUserMessage(...) + "\n" + the context block.
  const perChunk = chunks.map((chunk, i) => ({
    prefix: `${reviewUserMessage({ title: input.title, description: input.description, renderedChunk: renderChunk(chunk.text), part: i + 1, parts: chunks.length })}\n${CONTEXT_OPEN}`,
    listed: pooledForChunk(pool, chunk.files),
  }));

  const missedClient: ChatClient = {
    async chat(request: ChatRequest, meta) {
      const [system, user, ...rest] = request.messages;
      const chunk = perChunk.find((c) => typeof user?.content === "string" && user.content.startsWith(c.prefix));
      // A failure here reaches reviewPullWithContext as a failed request: the chunk is CHUNK_FAILED.
      if (system?.content !== REVIEW_CTX_SYSTEM_PROMPT || !chunk) throw new Error("review-missed-v1: unexpected request from the review-ctx-v1 loop");
      const messages = [{ ...system, content: REVIEW_MISSED_SYSTEM_PROMPT }, { ...user!, content: `${user!.content}\n${pooledFindingsBlock(chunk.listed)}` }, ...rest];
      return await client.chat({ ...request, messages }, meta);
    },
  };

  const out = await reviewPullWithContext(missedClient, input, repo, opts);
  return {
    ...out,
    review: {
      ...out.review,
      version: REVIEW_MISSED_VERSION,
      promptSha256: REVIEW_MISSED_PROMPT_SHA256,
      context: out.review.context.map((c) => ({ ...c, listed: perChunk[c.chunk]?.listed.length ?? 0 })),
      pool: pool.length,
    },
  };
}
