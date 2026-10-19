// The evidence verifier, verify-evidence-v1 (decision 065). It reads a review the reviewer already
// wrote and checks each finding on its own, seeing exactly verify-ctx-v1's per-finding context
// (verify-context.ts, unchanged): one model call per finding. Unlike verify-ctx-v1 it must prove a
// kept finding: 1–3 exact quoted lines with their path and line, a one-sentence failure scenario, a
// severity and a category. It never checks the quotes itself; `tracehound gate` does
// (evidence-missing, evidence-mismatch, style, severity-floor).
// Verdict rule (pre-registered): a finding is kept if and only if the valid reply says keep; an
// invalid reply is retried once, and if the retry is also invalid (or a request fails) the finding
// is kept as VERIFY_FAILED with no evidence, so a gate with requireEvidence drops it.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChatClient } from "../agent/decider.ts";
import type { PullReview } from "../bench/types.ts";
import { BudgetExceededError, type ChatMessage, type ChatRequest } from "../llm/client.ts";
import type { GitSource } from "./context.ts";
import { REASONING_OFF, REASONING_ON, type PullInput } from "./review.ts";
import { buildFindingContext, type FindingContextRecord } from "./verify-context.ts";
import { VERIFY_EVIDENCE_SYSTEM_PROMPT, VERIFY_EVIDENCE_VERSION, verifyEvidenceUserMessage } from "./verify-evidence-prompt.ts";

/** Verifier calls are reviewer spend, as verify-ctx-v1's. */
export const VERIFY_EVIDENCE_PURPOSE = "review";
export const VERIFY_EVIDENCE_PROMPT_SHA256 = createHash("sha256").update(VERIFY_EVIDENCE_SYSTEM_PROMPT).digest("hex");
export const VERIFY_EVIDENCE_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const lowered = <const T extends readonly [string, ...string[]]>(values: T) => z.string().transform((v) => v.trim().toLowerCase()).pipe(z.enum(values));

export const EvidenceItem = z.object({
  path: z.string().trim().min(1),
  line: z.number().int().positive(),
  quote: z.string().refine((q) => q.trim().length > 0 && !/[\r\n]/.test(q), "one non-empty line"),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/** The reply's shape. A keep needs 1–3 evidence items and a scenario; a drop may cite nothing. */
export const EvidenceReply = z
  .object({
    verdict: lowered(["keep", "drop"]),
    evidence: z.array(EvidenceItem).max(3),
    scenario: z.string(),
    severity: lowered(["high", "medium", "low"]),
    category: lowered(["correctness", "security", "performance", "contract", "style"]),
  })
  .superRefine((r, ctx) => {
    if (r.verdict !== "keep") return;
    if (r.evidence.length < 1) ctx.addIssue({ code: "custom", path: ["evidence"], message: "a keep needs 1 to 3 evidence items" });
    if (!r.scenario.trim()) ctx.addIssue({ code: "custom", path: ["scenario"], message: "a keep needs a scenario" });
  });
export type EvidenceReply = z.infer<typeof EvidenceReply>;

/** Shape check of a reply, optionally in a ```json fence. */
export function parseEvidenceReply(content: string): { ok: true; reply: EvidenceReply } | { ok: false; why: string } {
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
  const parsed = EvidenceReply.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, why: `${issue.path.length ? `"${issue.path.join(".")}"` : "the reply"}: ${issue.message}` };
  }
  const r = parsed.data;
  return { ok: true, reply: { ...r, scenario: r.scenario.trim(), evidence: r.evidence.map((e) => ({ path: e.path, line: e.line, quote: e.quote })) } };
}

export interface EvidenceVerifiedComment {
  path: string;
  line: number | null;
  body: string;
  verdict: "keep" | "drop" | null;
  evidence: EvidenceItem[];
  scenario: string | null;
  severity: "high" | "medium" | "low" | null;
  category: EvidenceReply["category"] | null;
  status: "VERIFIED" | "VERIFY_FAILED";
  attempts: number;
  failure?: string;
  /** what the per-finding context held */
  context: FindingContextRecord;
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number; latencyMs: number };
}

export interface EvidenceVerifyRecord {
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

/** Every finding with its verdict and evidence. */
export interface EvidenceVerifiedReview {
  pr_title: string;
  pr_number?: number;
  comments: EvidenceVerifiedComment[];
  verify: EvidenceVerifyRecord;
}

/** A kept finding as `tracehound gate` reads it: the neutral fields plus evidence, scenario, severity, category. */
export interface GateCandidate {
  path: string;
  line: number | null;
  body: string;
  source: string;
  evidence?: EvidenceItem[];
  scenario?: string;
  severity?: "high" | "medium" | "low";
  category?: string;
}

/** Kept: verdict keep, or VERIFY_FAILED. */
export const isEvidenceKept = (c: EvidenceVerifiedComment) => c.status === "VERIFY_FAILED" || c.verdict === "keep";

export interface EvidenceVerifyOptions {
  model?: string;
  reasoning?: "on" | "off";
  maxTokens?: number;
  /** findings of one pull request verified at once */
  concurrency?: number;
}

export async function verifyReviewWithEvidence(
  client: ChatClient,
  input: PullInput,
  review: PullReview,
  repo: { source: GitSource; head: string },
  opts: EvidenceVerifyOptions = {},
): Promise<EvidenceVerifiedReview> {
  const started = performance.now();
  const model = opts.model ?? VERIFY_EVIDENCE_MODEL;
  const reasoning = opts.reasoning ?? "on";
  const comments: EvidenceVerifiedComment[] = new Array(review.comments.length);
  // contexts are built up front, in order, so they do not depend on concurrency
  const contexts = review.comments.map((f) => buildFindingContext(repo.source, input.diff, f));

  const verifyOne = async (i: number) => {
    const f = review.comments[i]!;
    const ctx = contexts[i]!;
    const usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };
    const c: EvidenceVerifiedComment = {
      path: f.path, line: f.line, body: f.body, verdict: null, evidence: [], scenario: null, severity: null, category: null,
      status: "VERIFY_FAILED", attempts: 0, context: ctx.record, usage,
    };
    comments[i] = c;
    const first: ChatRequest = {
      model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? 16_000,
      messages: [
        { role: "system", content: VERIFY_EVIDENCE_SYSTEM_PROMPT },
        { role: "user", content: verifyEvidenceUserMessage({ title: input.title, description: input.description, finding: f, context: ctx.text }) },
      ],
      ...(reasoning === "on" ? REASONING_ON : REASONING_OFF),
    };
    const attempt = async (request: ChatRequest) => {
      c.attempts++;
      try {
        const r = await client.chat(request, { purpose: VERIFY_EVIDENCE_PURPOSE });
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
    let parsed = parseEvidenceReply(a1.reply.content);
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
      parsed = parseEvidenceReply(a2.reply.content);
      if (!parsed.ok) {
        c.failure = `${firstWhy}; after one retry: ${parsed.why}`;
        return;
      }
    }
    const r = parsed.reply;
    c.status = "VERIFIED";
    c.verdict = r.verdict;
    c.evidence = r.evidence;
    c.scenario = r.scenario;
    c.severity = r.severity;
    c.category = r.category;
  };

  let next = 0;
  const worker = async () => {
    while (next < review.comments.length) await verifyOne(next++);
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));

  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => comments.reduce((s, c) => s + c.usage[k], 0);
  const kept = comments.filter(isEvidenceKept).length;
  return {
    pr_title: review.pr_title,
    ...(review.pr_number !== undefined && { pr_number: review.pr_number }),
    comments,
    verify: {
      version: VERIFY_EVIDENCE_VERSION,
      model,
      reasoning,
      promptSha256: VERIFY_EVIDENCE_PROMPT_SHA256,
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

/** The kept findings as `tracehound gate` input (`comments` envelope); VERIFY_FAILED findings carry no evidence. Order is preserved. */
export function gateReview(v: EvidenceVerifiedReview): { pr_title: string; pr_number?: number; comments: GateCandidate[] } {
  return {
    pr_title: v.pr_title,
    ...(v.pr_number !== undefined && { pr_number: v.pr_number }),
    comments: v.comments.filter(isEvidenceKept).map((c): GateCandidate =>
      c.status === "VERIFY_FAILED"
        ? { path: c.path, line: c.line, body: c.body, source: VERIFY_EVIDENCE_VERSION }
        : { path: c.path, line: c.line, body: c.body, source: VERIFY_EVIDENCE_VERSION, evidence: c.evidence, scenario: c.scenario!, severity: c.severity!, category: c.category! },
    ),
  };
}
