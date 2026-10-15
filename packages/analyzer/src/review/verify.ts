// The verification pass, verify-v1 (decision 056). It reads a review the reviewer already wrote and
// checks each finding on its own: one model call per finding, which sees the pull request's title
// and description, the finding (path, line, body) and the diff of that finding's file with
// new-version line numbers, as review-diff-v1 shows them. Never the other findings, golden
// comments or anything outside the diff. The model gives a confidence from 1 to 5 and a one-sentence
// reason. An invalid reply is retried once; after that, or after a failed request, the finding is
// VERIFY_FAILED with confidence null, counted, and kept at every threshold.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import type { PullReview } from "../bench/types.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest } from "../llm/client.ts";
import { chunkDiff, CHUNK_LIMIT_CHARS, newSideLines, parseDiff, renderChunk, type DiffFile } from "./diff.ts";
import { REASONING_OFF, REASONING_ON, type PullInput } from "./review.ts";
import { VERIFY_SYSTEM_PROMPT, VERIFY_VERSION, verifyUserMessage } from "./verify-prompt.ts";

export const VERIFY_PURPOSE = "verify";
export const VERIFY_PROMPT_SHA256 = createHash("sha256").update(VERIFY_SYSTEM_PROMPT).digest("hex");
export const VERIFY_MODEL = "nvidia/nemotron-3-super-120b-a12b";
/** Operating threshold (decision 056): a finding is kept when its confidence is at least this. Chosen by the rule fixed before any result (highest overall dev F, ties to the higher threshold): 1, which keeps every finding. */
export const VERIFY_THRESHOLD = 1;

export type VerifyStatus = "VERIFIED" | "VERIFY_FAILED";

export interface VerifiedComment {
  path: string;
  line: number | null;
  body: string;
  confidence: number | null;
  reason: string | null;
  status: VerifyStatus;
  attempts: number;
  failure?: string;
  /** characters of the rendered file diff the model saw */
  diffChars: number;
  /** the file's diff was over the chunk limit and only the part holding the line was shown */
  partial: boolean;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number; latencyMs: number };
}

export interface VerifyRecord {
  version: string;
  model: string;
  reasoning: "on" | "off";
  promptSha256: string;
  findings: number;
  verified: number;
  verifyFailed: number;
  byConfidence: Record<"1" | "2" | "3" | "4" | "5", number>;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number };
  wallMs: number;
}

/** First output file: the neutral format with every finding, each carrying its confidence and reason. */
export interface VerifiedReview {
  pr_title: string;
  pr_number?: number;
  comments: VerifiedComment[];
  verify: VerifyRecord;
}

/** Second output file: the neutral format filtered at a threshold. */
export interface FilteredReview {
  pr_title: string;
  pr_number?: number;
  comments: VerifiedComment[];
  verify: VerifyRecord & { threshold: number; kept: number; removed: number; keptVerifyFailed: number };
}

/** Shape check of a reply: `{"confidence": 1..5, "reason": "..."}`, optionally in a ```json fence. */
export function parseVerifyReply(content: string): { ok: true; confidence: number; reason: string } | { ok: false; why: string } {
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
  const raw = (json as { confidence?: unknown }).confidence;
  const confidence = typeof raw === "string" && /^\s*[1-5]\s*$/.test(raw) ? Number(raw) : raw;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 1 || confidence > 5)
    return { ok: false, why: '"confidence" is not an integer from 1 to 5' };
  const reason = (json as { reason?: unknown }).reason;
  if (typeof reason !== "string" || !reason.trim()) return { ok: false, why: '"reason" is missing or empty' };
  return { ok: true, confidence, reason: reason.trim() };
}

/** The finding's file diff as the model sees it. A file over the chunk limit is cut at hunk boundaries as review-diff-v1 cuts it, and the part holding the line is shown. */
export function fileDiffFor(files: DiffFile[], finding: { path: string; line: number | null }): { rendered: string; part: number; parts: number } | null {
  const raw = finding.path.trim();
  const candidates = [raw, raw.replace(/^\.?\//, ""), raw.replace(/^[ab]\//, "")];
  const file = candidates.map((p) => files.find((f) => f.path === p)).find((f) => f !== undefined);
  if (!file) return null;
  const pieces = chunkDiff([file], CHUNK_LIMIT_CHARS);
  if (pieces.length <= 1) return { rendered: renderChunk(file.text), part: 1, parts: 1 };
  let idx = 0;
  if (finding.line !== null) {
    const hit = pieces.findIndex((c) => parseDiff(c.text).some((f) => newSideLines(f).has(finding.line!)));
    if (hit >= 0) idx = hit;
  }
  return { rendered: renderChunk(pieces[idx]!.text), part: idx + 1, parts: pieces.length };
}

export interface VerifyOptions {
  model?: string;
  reasoning?: "on" | "off";
  maxTokens?: number;
  /** findings of one pull request verified at once */
  concurrency?: number;
}

export async function verifyReview(client: ChatClient, input: PullInput, review: PullReview, opts: VerifyOptions = {}): Promise<VerifiedReview> {
  const started = performance.now();
  const model = opts.model ?? VERIFY_MODEL;
  const reasoning = opts.reasoning ?? "on";
  const files = parseDiff(input.diff);
  const comments: VerifiedComment[] = new Array(review.comments.length);

  const verifyOne = async (i: number) => {
    const f = review.comments[i]!;
    const usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };
    const c: VerifiedComment = { path: f.path, line: f.line, body: f.body, confidence: null, reason: null, status: "VERIFY_FAILED", attempts: 0, diffChars: 0, partial: false, usage };
    comments[i] = c;
    const shown = fileDiffFor(files, f);
    if (!shown) {
      c.failure = "the finding's path is not in the diff";
      return;
    }
    c.diffChars = shown.rendered.length;
    c.partial = shown.parts > 1;
    const first: ChatRequest = {
      model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? 16_000,
      messages: [
        { role: "system", content: VERIFY_SYSTEM_PROMPT },
        { role: "user", content: verifyUserMessage({ title: input.title, description: input.description, finding: f, renderedFileDiff: shown.rendered, part: shown.part, parts: shown.parts }) },
      ],
      ...(reasoning === "on" ? REASONING_ON : REASONING_OFF),
    };
    const attempt = async (request: ChatRequest) => {
      c.attempts++;
      try {
        const r = await client.chat(request, { purpose: VERIFY_PURPOSE });
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
    let parsed = parseVerifyReply(a1.reply.content);
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
      parsed = parseVerifyReply(a2.reply.content);
      if (!parsed.ok) {
        c.failure = `${firstWhy}; after one retry: ${parsed.why}`;
        return;
      }
    }
    c.status = "VERIFIED";
    c.confidence = parsed.confidence;
    c.reason = parsed.reason;
  };

  let next = 0;
  const worker = async () => {
    while (next < review.comments.length) await verifyOne(next++);
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));

  const byConfidence = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const c of comments) if (c.confidence !== null) byConfidence[String(c.confidence) as keyof typeof byConfidence]++;
  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => comments.reduce((s, c) => s + c.usage[k], 0);
  return {
    pr_title: review.pr_title,
    ...(review.pr_number !== undefined && { pr_number: review.pr_number }),
    comments,
    verify: {
      version: VERIFY_VERSION,
      model,
      reasoning,
      promptSha256: VERIFY_PROMPT_SHA256,
      findings: comments.length,
      verified: comments.filter((c) => c.status === "VERIFIED").length,
      verifyFailed: comments.filter((c) => c.status === "VERIFY_FAILED").length,
      byConfidence,
      usage: { calls: sum("calls"), cached: sum("cached"), inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), costUSD: sum("costUSD") },
      wallMs: Math.round(performance.now() - started),
    },
  };
}

/** Keeps a finding when its confidence is at least the threshold, and always when it is VERIFY_FAILED. Order is preserved. */
export function filterAtThreshold(v: VerifiedReview, threshold: number): FilteredReview {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 5) throw new Error(`threshold must be an integer from 1 to 5, got ${threshold}`);
  const kept = v.comments.filter((c) => c.status === "VERIFY_FAILED" || c.confidence === null || c.confidence >= threshold);
  return {
    pr_title: v.pr_title,
    ...(v.pr_number !== undefined && { pr_number: v.pr_number }),
    comments: kept,
    verify: { ...v.verify, threshold, kept: kept.length, removed: v.comments.length - kept.length, keptVerifyFailed: kept.filter((c) => c.status === "VERIFY_FAILED").length },
  };
}
