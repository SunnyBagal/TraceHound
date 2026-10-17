// The validity check, validity-v1 (decision 060). One request per deduplicated comment that
// bench-judge-v1 labelled FP: title, description, the comment and its file's diff (new-version line
// numbers, as review-diff-v1 renders it; the part holding the line when the file is over the chunk
// limit, as verify-v1 does). Reply {"verdict": "valid" | "invalid" | "unsure", "reason"}; an invalid
// reply is retried once, then the comment counts as unsure. A path not in the diff gets no request
// and counts as unsure ("no-diff"); a failed request counts as unsure ("failed"). A budget stop is
// not a verdict: it propagates so the caller can record the check as not completed.
import { createHash } from "node:crypto";
import type { ChatClient } from "../agent/decider.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest } from "../llm/client.ts";
import { parseDiff } from "../review/diff.ts";
import { REASONING_ON, type PullInput } from "../review/review.ts";
import { fileDiffFor } from "../review/verify.ts";
import { VALIDITY_SYSTEM_PROMPT, VALIDITY_VERSION, validityUserMessage } from "./validity-prompt.ts";

export const VALIDITY_PURPOSE = "bench-validity";
export const VALIDITY_PROMPT_SHA256 = createHash("sha256").update(VALIDITY_SYSTEM_PROMPT).digest("hex");
export const VERDICTS = ["valid", "invalid", "unsure"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** One deduplicated FP comment: a dev pull request (repo + golden index) and the comment. */
export interface FpItem {
  key: string;
  repo: string;
  goldenIndex: number;
  path: string;
  line: number | null;
  body: string;
}

export interface ValidityResult {
  key: string;
  verdict: Verdict;
  /** "answered": a valid reply; "invalid-reply": two invalid replies; "no-diff": path not in the diff; "failed": request error */
  status: "answered" | "invalid-reply" | "no-diff" | "failed";
  reason: string | null;
  attempts: number;
  failure?: string;
  partial: boolean;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number; latencyMs: number };
}

export function parseValidityReply(content: string): { ok: true; verdict: Verdict; reason: string } | { ok: false; why: string } {
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
  const verdict = (json as { verdict?: unknown }).verdict;
  if (typeof verdict !== "string" || !(VERDICTS as readonly string[]).includes(verdict)) return { ok: false, why: '"verdict" is not one of "valid", "invalid", "unsure"' };
  const reason = (json as { reason?: unknown }).reason;
  if (typeof reason !== "string" || !reason.trim()) return { ok: false, why: '"reason" is missing or empty' };
  return { ok: true, verdict: verdict as Verdict, reason: reason.trim() };
}

export function buildValidityRequest(model: string, reasoning: "on" | "off", input: PullInput, item: FpItem, shown: { rendered: string; part: number; parts: number }): ChatRequest {
  return {
    model,
    temperature: 0,
    max_tokens: 16_000,
    messages: [
      { role: "system", content: VALIDITY_SYSTEM_PROMPT },
      { role: "user", content: validityUserMessage({ title: input.title, description: input.description, comment: item, renderedFileDiff: shown.rendered, part: shown.part, parts: shown.parts }) },
    ],
    // reasoning off sends no reasoning field at all (Qwen, decision 060)
    ...(reasoning === "on" ? REASONING_ON : {}),
  };
}

export async function judgeValidity(client: ChatClient, opts: { model: string; reasoning: "on" | "off" }, input: PullInput, item: FpItem): Promise<ValidityResult> {
  const usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };
  const r: ValidityResult = { key: item.key, verdict: "unsure", status: "failed", reason: null, attempts: 0, partial: false, usage };
  const shown = fileDiffFor(parseDiff(input.diff), item);
  if (!shown) return { ...r, status: "no-diff", failure: "the comment's path is not in the diff" };
  r.partial = shown.parts > 1;
  const first = buildValidityRequest(opts.model, opts.reasoning, input, item, shown);
  const attempt = async (request: ChatRequest) => {
    r.attempts++;
    try {
      const res = await client.chat(request, { purpose: VALIDITY_PURPOSE });
      usage.calls++;
      if (res.cached) usage.cached++;
      usage.inputTokens += res.inputTokens ?? 0;
      usage.outputTokens += res.outputTokens ?? 0;
      usage.costUSD += res.costUSD;
      usage.latencyMs += res.latencyMs;
      return { reply: res };
    } catch (err) {
      if (err instanceof BudgetExceededError) throw err; // not a verdict: the check stops
      return { error: `request failed: ${(err as Error).message}` };
    }
  };
  const a1 = await attempt(first);
  if ("error" in a1) return { ...r, failure: a1.error };
  let parsed = parseValidityReply(a1.reply.content);
  if (!parsed.ok) {
    const firstWhy = parsed.why;
    const messages: ChatMessage[] = [
      ...first.messages,
      { role: "assistant", content: a1.reply.content },
      { role: "user", content: `Your reply was invalid: ${parsed.why}. Reply again with only the JSON object in the shape given.` },
    ];
    const a2 = await attempt({ ...first, messages });
    if ("error" in a2) return { ...r, failure: `${firstWhy}; retry ${a2.error}` };
    parsed = parseValidityReply(a2.reply.content);
    if (!parsed.ok) return { ...r, status: "invalid-reply", failure: `${firstWhy}; after one retry: ${parsed.why}` };
  }
  return { ...r, status: "answered", verdict: parsed.verdict, reason: parsed.reason };
}

export const validityMeta = { version: VALIDITY_VERSION, promptSha256: VALIDITY_PROMPT_SHA256 };
