// The context reviewer, review-ctx-v1 (decision 057). review-diff-v1 (review.ts, unchanged) plus,
// per chunk, a repository context block built at the pull request's head (context.ts). Chunking,
// reply validation, the one retry, CHUNK_FAILED and the output format are review-diff-v1's: the same
// functions where review.ts exports them, and the same loop otherwise. Findings must still be on an
// added or context line of the diff; the context block is for checking, not a place to comment.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest } from "../llm/client.ts";
import { buildChunkContext, CONTEXT_BUDGET_CHARS, type ContextRecord, type GitSource } from "./context.ts";
import { chunkDiff, CHUNK_LIMIT_CHARS, parseDiff, renderChunk } from "./diff.ts";
import { REVIEW_CTX_SYSTEM_PROMPT, REVIEW_CTX_VERSION, reviewCtxUserMessage } from "./prompt-ctx.ts";
import {
  attemptDetail,
  DiffIndex,
  DROP_REASONS,
  parseReviewReply,
  REASONING_OFF,
  REASONING_ON,
  REVIEW_PURPOSE,
  type ChunkRecord,
  type DropReason,
  type PullInput,
  type ReviewOptions,
  type ReviewOutput,
  type Usage,
} from "./review.ts";

export const REVIEW_CTX_PROMPT_SHA256 = createHash("sha256").update(REVIEW_CTX_SYSTEM_PROMPT).digest("hex");

export type ReviewCtxOutput = Omit<ReviewOutput, "review"> & {
  review: ReviewOutput["review"] & { head: string; context: (ContextRecord & { chunk: number })[] };
};

const zeroDrops = (): Record<DropReason, number> => Object.fromEntries(DROP_REASONS.map((k) => [k, 0])) as Record<DropReason, number>;

export async function reviewPullWithContext(
  client: ChatClient,
  input: PullInput,
  repo: { source: GitSource; head: string },
  opts: ReviewOptions & { contextBudget?: number },
): Promise<ReviewCtxOutput> {
  const started = performance.now();
  const reasoning = opts.reasoning ?? "on";
  const files = parseDiff(input.diff);
  const index = new DiffIndex(files);
  const chunks = chunkDiff(files, opts.chunkLimit ?? CHUNK_LIMIT_CHARS);
  const usage: Usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };
  const dropped = zeroDrops();
  const comments: ReviewOutput["comments"] = [];
  const records: ChunkRecord[] = [];
  const contexts: ReviewCtxOutput["review"]["context"] = [];

  const call = async (request: ChatRequest) => {
    const r = await client.chat(request, { purpose: REVIEW_PURPOSE });
    usage.calls++;
    if (r.cached) usage.cached++;
    usage.inputTokens += r.inputTokens ?? 0;
    usage.outputTokens += r.outputTokens ?? 0;
    usage.costUSD += r.costUSD;
    usage.latencyMs += r.latencyMs;
    return r;
  };

  for (const [i, chunk] of chunks.entries()) {
    const ctx = buildChunkContext(repo.source, chunk.text, opts.contextBudget ?? CONTEXT_BUDGET_CHARS);
    contexts.push({ chunk: i, ...ctx.record });
    const rec: ChunkRecord = { index: i, files: chunk.files, diffChars: chunk.text.length, overLimit: chunk.overLimit, status: "OK", attempts: 0, findings: 0, kept: 0, dropped: zeroDrops() };
    records.push(rec);
    const first: ChatRequest = {
      model: opts.model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? 32_000,
      messages: [
        { role: "system", content: REVIEW_CTX_SYSTEM_PROMPT },
        {
          role: "user",
          content: reviewCtxUserMessage({ title: input.title, description: input.description, renderedChunk: renderChunk(chunk.text), part: i + 1, parts: chunks.length, context: ctx.text }),
        },
      ],
      ...(reasoning === "on" ? REASONING_ON : REASONING_OFF),
    };
    const attempt = async (request: ChatRequest) => {
      rec.attempts++;
      try {
        const reply = await call(request);
        (rec.attemptsDetail ??= []).push(attemptDetail(reply));
        return { reply };
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err; // the run stops; never a silent empty chunk
        return { error: `request failed: ${(err as Error).message}` };
      }
    };
    const a1 = await attempt(first);
    if ("error" in a1) {
      rec.status = "CHUNK_FAILED";
      rec.failure = a1.error;
      continue;
    }
    let parsed = parseReviewReply(a1.reply.content);
    if (!parsed.ok) {
      const firstWhy = parsed.why;
      const messages: ChatMessage[] = [
        ...first.messages,
        { role: "assistant", content: a1.reply.content },
        { role: "user", content: `Your reply was invalid: ${parsed.why}. Reply again with only the JSON object in the shape given.` },
      ];
      // "fresh": a reply cut off at max_tokens is retried as the original request with reasoning off
      const fresh = opts.retryOnLength === "fresh" && a1.reply.finishReason === "length";
      const a2 = await attempt(fresh ? { ...first, ...REASONING_OFF } : { ...first, messages });
      if ("error" in a2) {
        rec.status = "CHUNK_FAILED";
        rec.failure = `${firstWhy}; retry ${a2.error}`;
        continue;
      }
      parsed = parseReviewReply(a2.reply.content);
      if (!parsed.ok) {
        rec.status = "CHUNK_FAILED";
        rec.failure = `${firstWhy}; after one retry: ${parsed.why}`;
        continue;
      }
    }
    rec.findings = parsed.findings.length;
    for (const f of parsed.findings) {
      const c = index.check(f);
      if (!c.ok) {
        rec.dropped[c.reason]++;
        dropped[c.reason]++;
        continue;
      }
      rec.kept++;
      comments.push({ path: c.path, line: c.line, body: c.body });
    }
  }

  return {
    pr_title: input.title,
    ...(input.number !== undefined && { pr_number: input.number }),
    comments,
    review: {
      version: REVIEW_CTX_VERSION,
      model: opts.model,
      reasoning,
      promptSha256: REVIEW_CTX_PROMPT_SHA256,
      diffChars: input.diff.length,
      files: files.length,
      chunks: records,
      chunkFailed: records.filter((r) => r.status === "CHUNK_FAILED").length,
      findings: records.reduce((s, r) => s + r.findings, 0),
      dropped,
      usage,
      wallMs: Math.round(performance.now() - started),
      head: repo.head,
      context: contexts,
    },
  };
}
