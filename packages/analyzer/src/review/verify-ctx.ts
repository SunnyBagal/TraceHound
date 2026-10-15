// The context-aware verifier, verify-ctx-v1 (decision 058). It reads a review the reviewer already
// wrote and checks each finding on its own: one model call per finding, which sees the pull
// request's title and description, the finding (path, line, body) and the finding's repository
// context from verify-context.ts. Never the other findings or golden comments. The model answers
// keep or drop with a one-sentence reason. Verdict rule (pre-registered): a finding is kept if and
// only if the valid reply says keep; an invalid reply is retried once, and if the retry is also
// invalid (or a request fails) the finding is kept and counted as VERIFY_FAILED.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import type { PullReview } from "../bench/types.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest } from "../llm/client.ts";
import type { GitSource } from "./context.ts";
import { REASONING_OFF, REASONING_ON, type PullInput } from "./review.ts";
import { buildFindingContext, type FindingContextRecord } from "./verify-context.ts";
import { VERIFY_CTX_SYSTEM_PROMPT, VERIFY_CTX_VERSION, verifyCtxUserMessage } from "./verify-ctx-prompt.ts";

/** The purpose label the job names: verifier calls are reviewer spend. */
export const VERIFY_CTX_PURPOSE = "review";
export const VERIFY_CTX_PROMPT_SHA256 = createHash("sha256").update(VERIFY_CTX_SYSTEM_PROMPT).digest("hex");
export const VERIFY_CTX_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export type Verdict = "keep" | "drop";

export interface CtxVerifiedComment {
  path: string;
  line: number | null;
  body: string;
  verdict: Verdict | null;
  reason: string | null;
  status: "VERIFIED" | "VERIFY_FAILED";
  attempts: number;
  failure?: string;
  /** what the per-finding context held */
  context: FindingContextRecord;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number; latencyMs: number };
}

export interface CtxVerifyRecord {
  version: string;
  model: string;
  reasoning: "on" | "off";
  promptSha256: string;
  head: string;
  findings: number;
  kept: number;
  dropped: number;
  verifyFailed: number;
  retried: number;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number };
  wallMs: number;
}

/** Every finding with its verdict. */
export interface CtxVerifiedReview {
  pr_title: string;
  pr_number?: number;
  comments: CtxVerifiedComment[];
  verify: CtxVerifyRecord;
}

/** The kept findings, in the neutral review format (decision 054). */
export interface CtxKeptReview {
  pr_title: string;
  pr_number?: number;
  comments: { path: string; line: number | null; body: string }[];
  verify: CtxVerifyRecord;
}

/** Shape check of a reply: `{"verdict": "keep" | "drop", "reason": "..."}`, optionally in a ```json fence. */
export function parseVerdictReply(content: string): { ok: true; verdict: Verdict; reason: string } | { ok: false; why: string } {
  let text = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) text = fenced[1]!;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, why: "the reply is not valid JSON" };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, why: "the reply is not a JSON object" };
  const raw = (json as { verdict?: unknown }).verdict;
  const verdict = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
  if (verdict !== "keep" && verdict !== "drop") return { ok: false, why: '"verdict" is not "keep" or "drop"' };
  const reason = (json as { reason?: unknown }).reason;
  if (typeof reason !== "string" || !reason.trim()) return { ok: false, why: '"reason" is missing or empty' };
  return { ok: true, verdict, reason: reason.trim() };
}

/** Kept: verdict keep, or VERIFY_FAILED. */
export const isKept = (c: CtxVerifiedComment) => c.status === "VERIFY_FAILED" || c.verdict === "keep";

export interface CtxVerifyOptions {
  model?: string;
  reasoning?: "on" | "off";
  maxTokens?: number;
  /** findings of one pull request verified at once */
  concurrency?: number;
}

export async function verifyReviewWithContext(
  client: ChatClient,
  input: PullInput,
  review: PullReview,
  repo: { source: GitSource; head: string },
  opts: CtxVerifyOptions = {},
): Promise<CtxVerifiedReview> {
  const started = performance.now();
  const model = opts.model ?? VERIFY_CTX_MODEL;
  const reasoning = opts.reasoning ?? "on";
  const comments: CtxVerifiedComment[] = new Array(review.comments.length);
  // contexts are built up front, in order, so they do not depend on concurrency
  const contexts = review.comments.map((f) => buildFindingContext(repo.source, input.diff, f));

  const verifyOne = async (i: number) => {
    const f = review.comments[i]!;
    const ctx = contexts[i]!;
    const usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };
    const c: CtxVerifiedComment = { path: f.path, line: f.line, body: f.body, verdict: null, reason: null, status: "VERIFY_FAILED", attempts: 0, context: ctx.record, usage };
    comments[i] = c;
    const first: ChatRequest = {
      model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? 16_000,
      messages: [
        { role: "system", content: VERIFY_CTX_SYSTEM_PROMPT },
        { role: "user", content: verifyCtxUserMessage({ title: input.title, description: input.description, finding: f, context: ctx.text }) },
      ],
      ...(reasoning === "on" ? REASONING_ON : REASONING_OFF),
    };
    const attempt = async (request: ChatRequest) => {
      c.attempts++;
      try {
        const r = await client.chat(request, { purpose: VERIFY_CTX_PURPOSE });
        usage.calls++;
        if (r.cached) usage.cached++;
        usage.inputTokens += r.inputTokens ?? 0;
        usage.outputTokens += r.outputTokens ?? 0;
        usage.costUSD += r.costUSD;
        usage.latencyMs += r.latencyMs;
        return { reply: r };
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err; // the run stops; never a silent failure
        return { error: `request failed: ${(err as Error).message}` };
      }
    };
    const a1 = await attempt(first);
    if ("error" in a1) {
      c.failure = a1.error;
      return;
    }
    let parsed = parseVerdictReply(a1.reply.content);
    if (!parsed.ok) {
      const firstWhy = parsed.why;
      const messages: ChatMessage[] = [
        ...first.messages,
        { role: "assistant", content: a1.reply.content },
        { role: "user", content: `Your reply was invalid: ${parsed.why}. Reply again with only the JSON object in the shape given.` },
      ];
      const a2 = await attempt({ ...first, messages });
      if ("error" in a2) {
        c.failure = `${firstWhy}; retry ${a2.error}`;
        return;
      }
      parsed = parseVerdictReply(a2.reply.content);
      if (!parsed.ok) {
        c.failure = `${firstWhy}; after one retry: ${parsed.why}`;
        return;
      }
    }
    c.status = "VERIFIED";
    c.verdict = parsed.verdict;
    c.reason = parsed.reason;
  };

  let next = 0;
  const worker = async () => {
    while (next < review.comments.length) await verifyOne(next++);
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));

  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => comments.reduce((s, c) => s + c.usage[k], 0);
  const kept = comments.filter(isKept).length;
  return {
    pr_title: review.pr_title,
    ...(review.pr_number !== undefined && { pr_number: review.pr_number }),
    comments,
    verify: {
      version: VERIFY_CTX_VERSION,
      model,
      reasoning,
      promptSha256: VERIFY_CTX_PROMPT_SHA256,
      head: repo.head,
      findings: comments.length,
      kept,
      dropped: comments.length - kept,
      verifyFailed: comments.filter((c) => c.status === "VERIFY_FAILED").length,
      retried: comments.filter((c) => c.attempts > 1).length,
      usage: { calls: sum("calls"), cached: sum("cached"), inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), costUSD: sum("costUSD") },
      wallMs: Math.round(performance.now() - started),
    },
  };
}

/** The kept findings as a review file the scorer reads; order is preserved. */
export function keptReview(v: CtxVerifiedReview): CtxKeptReview {
  return {
    pr_title: v.pr_title,
    ...(v.pr_number !== undefined && { pr_number: v.pr_number }),
    comments: v.comments.filter(isKept).map((c) => ({ path: c.path, line: c.line, body: c.body })),
    verify: v.verify,
  };
}
