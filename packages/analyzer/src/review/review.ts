// The diff-only reviewer, review-diff-v1 (decision 055). It sees a pull request's title,
// description and unified diff, nothing else. One model call per chunk; every finding is checked
// against the diff (path present, line an added or context line in the new version) and dropped
// with a counted reason otherwise. An invalid reply is retried once, then the chunk is
// CHUNK_FAILED and contributes nothing. The output is the neutral review format of decision 054
// plus a `review` record of chunks, failures, drops and usage, so no pull request is silently empty.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest, type ChatResult } from "../llm/client.ts";
import type { ReasoningMode } from "../naming/llm.ts";
import { chunkDiff, CHUNK_LIMIT_CHARS, newSideLines, parseDiff, renderChunk, type DiffFile } from "./diff.ts";
import { REVIEW_SYSTEM_PROMPT, REVIEW_VERSION, reviewUserMessage } from "./prompt.ts";

export const REVIEW_PURPOSE = "review";
export const REASONING_ON: ReasoningMode = { chat_template_kwargs: { enable_thinking: true } };
export const REASONING_OFF: ReasoningMode = { chat_template_kwargs: { enable_thinking: false } };
export const REVIEW_PROMPT_SHA256 = createHash("sha256").update(REVIEW_SYSTEM_PROMPT).digest("hex");

export const DROP_REASONS = ["malformed", "path-not-in-diff", "file-deleted", "line-not-in-new-version"] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export interface PullInput {
  title: string;
  description: string;
  diff: string;
  number?: number;
}

export interface Usage {
  calls: number; // requests, cache hits included
  cached: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  latencyMs: number; // summed over calls
}

export interface ChunkRecord {
  index: number;
  files: string[];
  diffChars: number;
  overLimit: boolean;
  status: "OK" | "CHUNK_FAILED";
  attempts: number;
  failure?: string;
  findings: number; // findings in the accepted reply
  kept: number;
  dropped: Record<DropReason, number>;
  /** one entry per reply received, in order; absent when no reply was received */
  attemptsDetail?: AttemptDetail[];
}

/** What the provider said about one reply; the reply text itself is not kept. */
export interface AttemptDetail {
  finishReason?: string;
  reasoningTokens?: number;
  outputTokens?: number;
  contentEmpty: boolean;
}

export function attemptDetail(r: ChatResult): AttemptDetail {
  return {
    ...(r.finishReason !== undefined && { finishReason: r.finishReason }),
    ...(r.reasoningTokens !== undefined && { reasoningTokens: r.reasoningTokens }),
    ...(r.outputTokens !== undefined && { outputTokens: r.outputTokens }),
    contentEmpty: !r.content?.trim(),
  };
}

export interface ReviewOutput {
  pr_title: string;
  pr_number?: number;
  comments: { path: string; line: number; body: string }[];
  review: {
    version: string;
    model: string;
    reasoning: "on" | "off";
    promptSha256: string;
    diffChars: number;
    files: number;
    chunks: ChunkRecord[];
    chunkFailed: number;
    findings: number;
    dropped: Record<DropReason, number>;
    usage: Usage;
    wallMs: number;
  };
}

const zeroDrops = (): Record<DropReason, number> => ({ "malformed": 0, "path-not-in-diff": 0, "file-deleted": 0, "line-not-in-new-version": 0 });
const zeroUsage = (): Usage => ({ calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 });

interface RawFinding {
  path: unknown;
  line: unknown;
  body: unknown;
}

/** Shape check of a reply: `{"findings": [...]}`, optionally in a ```json fence. Items are checked one by one later. */
/** For the "lenient" parser: the JSON in a reply with prose around it. A fence whose body parses
 * as an object with `key` comes first; otherwise the last balanced {…} that does. */
export function extractJson(content: string, key: string): string | null {
  const has = (text: string) => {
    try {
      const v: unknown = JSON.parse(text);
      return typeof v === "object" && v !== null && !Array.isArray(v) && key in v;
    } catch {
      return false;
    }
  };
  for (const m of content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)) if (has(m[1]!)) return m[1]!;
  let best: string | null = null;
  const open: number[] = [];
  let inString = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"' && open.length) inString = true;
    else if (ch === "{") open.push(i);
    else if (ch === "}" && open.length) {
      const text = content.slice(open.pop()!, i + 1);
      if (text.includes(`"${key}"`) && has(text)) best = text;
    }
  }
  return best;
}

export function parseReviewReply(content: string, mode: "strict" | "lenient" = "strict"): { ok: true; findings: RawFinding[] } | { ok: false; why: string } {
  let text = content.trim();
  if (mode === "lenient") text = extractJson(text, "findings") ?? text;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) text = fenced[1]!;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, why: "the reply is not valid JSON" };
  }
  const list = (json as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(list)) return { ok: false, why: 'the reply has no "findings" array' };
  return { ok: true, findings: list as RawFinding[] };
}

/** Index of the diff's files by path, for validation. */
export class DiffIndex {
  readonly #byPath = new Map<string, { file: DiffFile; lines: Set<number> }>();

  constructor(files: DiffFile[]) {
    for (const f of files) this.#byPath.set(f.path, { file: f, lines: newSideLines(f) });
  }

  /** The finding's path in the diff (a leading "./", "/", "a/" or "b/" is tolerated), or a drop reason. */
  check(f: RawFinding): { ok: true; path: string; line: number; body: string } | { ok: false; reason: DropReason } {
    if (typeof f !== "object" || f === null) return { ok: false, reason: "malformed" };
    const line = typeof f.line === "string" && /^\d+$/.test(f.line.trim()) ? Number(f.line) : f.line;
    if (typeof f.path !== "string" || !f.path.trim() || typeof line !== "number" || !Number.isInteger(line) || typeof f.body !== "string" || !f.body.trim())
      return { ok: false, reason: "malformed" };
    const raw = f.path.trim();
    const candidates = [raw, raw.replace(/^\.?\//, ""), raw.replace(/^[ab]\//, "")];
    const path = candidates.find((p) => this.#byPath.has(p));
    if (path === undefined) return { ok: false, reason: "path-not-in-diff" };
    const entry = this.#byPath.get(path)!;
    if (entry.file.newPath === null) return { ok: false, reason: "file-deleted" };
    if (!entry.lines.has(line)) return { ok: false, reason: "line-not-in-new-version" };
    return { ok: true, path, line, body: f.body.trim() };
  }
}

export interface ReviewOptions {
  model: string;
  reasoning?: "on" | "off";
  maxTokens?: number;
  chunkLimit?: number;
  /** retry after finish_reason "length": "append" (default, today) or "fresh" */
  retryOnLength?: "append" | "fresh";
  /** reply parsing: "strict" (default, today) or "lenient" (extractJson) */
  parser?: "strict" | "lenient";
}

export async function reviewPull(client: ChatClient, input: PullInput, opts: ReviewOptions): Promise<ReviewOutput> {
  const started = performance.now();
  const reasoning = opts.reasoning ?? "on";
  const files = parseDiff(input.diff);
  const index = new DiffIndex(files);
  const chunks = chunkDiff(files, opts.chunkLimit ?? CHUNK_LIMIT_CHARS);
  const usage = zeroUsage();
  const dropped = zeroDrops();
  const comments: ReviewOutput["comments"] = [];
  const records: ChunkRecord[] = [];

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
    const rec: ChunkRecord = { index: i, files: chunk.files, diffChars: chunk.text.length, overLimit: chunk.overLimit, status: "OK", attempts: 0, findings: 0, kept: 0, dropped: zeroDrops() };
    records.push(rec);
    const first: ChatRequest = {
      model: opts.model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? 32_000,
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: reviewUserMessage({ title: input.title, description: input.description, renderedChunk: renderChunk(chunk.text), part: i + 1, parts: chunks.length }) },
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
    let parsed = parseReviewReply(a1.reply.content, opts.parser);
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
      parsed = parseReviewReply(a2.reply.content, opts.parser);
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
      version: REVIEW_VERSION,
      model: opts.model,
      reasoning,
      promptSha256: REVIEW_PROMPT_SHA256,
      diffChars: input.diff.length,
      files: files.length,
      chunks: records,
      chunkFailed: records.filter((r) => r.status === "CHUNK_FAILED").length,
      findings: records.reduce((s, r) => s + r.findings, 0),
      dropped,
      usage,
      wallMs: Math.round(performance.now() - started),
    },
  };
}
