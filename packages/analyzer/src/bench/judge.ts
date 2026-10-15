// The matching judge (decision 054): one request per pull request lists the golden comments and the
// tool comments with ids; the model returns, for each tool comment, the golden id it matches or
// null. Ids are validated, an invalid reply is retried once, and then the pull request is
// JUDGE_FAILED (left out of the totals, never scored as zero). A panel of judges votes by majority.
import type { ChatClient } from "../agent/decider.ts";
import type { ChatMessage, ChatRequest } from "../llm/client.ts";
import type { ReasoningMode } from "../naming/llm.ts";

export const JUDGE_VERSION = "bench-judge-v1";
export const SUPER_MODEL = "nvidia/nemotron-3-super-120b-a12b";
/** Reasoning on (the model's thinking, explicitly enabled), as the repair loop sends it. */
export const JUDGE_REASONING: ReasoningMode = { chat_template_kwargs: { enable_thinking: true } };
/** A tool comment's body is cut here in the prompt (some tools append long fix prompts). */
export const MAX_BODY_CHARS = 4000;

export interface JudgeInput {
  prTitle: string;
  golden: { id: string; text: string }[];
  tool: { id: string; path: string; line: number | null; body: string }[];
}

export interface JudgeUsage {
  calls: number; // requests, cache hits included
  cached: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export type JudgeVerdict =
  | { ok: true; matches: Record<string, string | null>; usage: JudgeUsage }
  | { ok: false; why: string; usage: JudgeUsage };

export interface Judge {
  readonly name: string;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
}

export const JUDGE_SYSTEM_PROMPT = `You are the judge for a code review benchmark.

You get the title of a pull request, a list of reference issues that are known problems in that pull request (ids G1, G2, ...), and a list of review comments that a code review tool left on it (ids T1, T2, ...).

For each review comment, decide whether it points out the same underlying issue as one of the reference issues. Two comments refer to the same underlying issue when they describe the same defect in the code, even if they are worded differently, point at a different line, or propose a different fix. A review comment that only concerns the same file or the same code but describes a different problem does not match. If a review comment matches more than one reference issue, choose the one it addresses most directly. Several review comments may match the same reference issue.

Reply with JSON only, no other text, in exactly this shape:
{"matches": [{"tool": "T1", "golden": "G2"}, {"tool": "T2", "golden": null}]}
List every review comment id exactly once. "golden" is one of the reference ids, or null when the review comment matches none of them.`;

export function judgeUserMessage(input: JudgeInput): string {
  const golden = input.golden.map((g) => `${g.id}: ${g.text}`).join("\n\n");
  const tool = input.tool
    .map((t) => {
      const body = t.body.length > MAX_BODY_CHARS ? `${t.body.slice(0, MAX_BODY_CHARS)}\n[truncated]` : t.body;
      return `${t.id} (${t.path}${t.line !== null ? `:${t.line}` : ""}):\n${body}`;
    })
    .join("\n\n---\n\n");
  return `Pull request: ${input.prTitle}\n\nReference issues:\n\n${golden}\n\nReview comments:\n\n${tool}`;
}

/** Checks a reply's shape and ids. Returns tool id → golden id or null. */
export function validateJudgeReply(content: string, input: JudgeInput): { ok: true; matches: Record<string, string | null> } | { ok: false; why: string } {
  let text = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) text = fenced[1]!;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, why: "the reply is not valid JSON" };
  }
  const list = (json as { matches?: unknown })?.matches;
  if (!Array.isArray(list)) return { ok: false, why: 'the reply has no "matches" array' };
  const toolIds = new Set(input.tool.map((t) => t.id));
  const goldenIds = new Set(input.golden.map((g) => g.id));
  const matches: Record<string, string | null> = {};
  for (const entry of list) {
    const tool = (entry as { tool?: unknown })?.tool;
    const golden = (entry as { golden?: unknown })?.golden;
    if (typeof tool !== "string" || !toolIds.has(tool)) return { ok: false, why: `unknown review comment id ${JSON.stringify(tool)}` };
    if (tool in matches) return { ok: false, why: `review comment id ${tool} is listed more than once` };
    if (golden !== null && (typeof golden !== "string" || !goldenIds.has(golden)))
      return { ok: false, why: `unknown reference id ${JSON.stringify(golden)} for ${tool}` };
    matches[tool] = golden;
  }
  const missing = [...toolIds].filter((id) => !(id in matches));
  if (missing.length) return { ok: false, why: `review comment ids missing from the reply: ${missing.join(", ")}` };
  return { ok: true, matches };
}

const emptyUsage = (): JudgeUsage => ({ calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 });

export class LlmJudge implements Judge {
  readonly name: string;
  readonly #client: ChatClient;
  readonly #model: string;
  readonly #maxTokens: number;

  constructor(client: ChatClient, opts: { model?: string; maxTokens?: number } = {}) {
    this.#client = client;
    this.#model = opts.model ?? SUPER_MODEL;
    this.#maxTokens = opts.maxTokens ?? 16_000;
    this.name = `${JUDGE_VERSION}:${this.#model}`;
  }

  buildRequest(input: JudgeInput): ChatRequest {
    return {
      model: this.#model,
      temperature: 0,
      max_tokens: this.#maxTokens,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: judgeUserMessage(input) },
      ],
      ...JUDGE_REASONING,
    };
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const usage = emptyUsage();
    const call = async (request: ChatRequest) => {
      const r = await this.#client.chat(request, { purpose: "bench-judge" });
      usage.calls++;
      if (r.cached) usage.cached++;
      usage.inputTokens += r.inputTokens ?? 0;
      usage.outputTokens += r.outputTokens ?? 0;
      usage.costUSD += r.costUSD;
      return r;
    };
    const first = this.buildRequest(input);
    let reply: { content: string };
    try {
      reply = await call(first);
    } catch (err) {
      return { ok: false, why: `request failed: ${(err as Error).message}`, usage };
    }
    let check = validateJudgeReply(reply.content, input);
    if (!check.ok) {
      const messages: ChatMessage[] = [
        ...first.messages,
        { role: "assistant", content: reply.content },
        { role: "user", content: `Your reply was invalid: ${check.why}. Reply again with only the JSON object in the shape given, listing every review comment id exactly once.` },
      ];
      try {
        reply = await call({ ...first, messages });
      } catch (err) {
        return { ok: false, why: `${check.why}; retry request failed: ${(err as Error).message}`, usage };
      }
      const firstWhy = check.why;
      check = validateJudgeReply(reply.content, input);
      if (!check.ok) return { ok: false, why: `${firstWhy}; after one retry: ${check.why}`, usage };
    }
    return { ok: true, matches: check.matches, usage };
  }
}

/**
 * Runs every judge and takes, per tool comment, the answer (a golden id or null) that more than
 * half of all judges gave; with no such answer the comment matches nothing. The pull request is
 * JUDGE_FAILED unless more than half of the judges answered. One judge: its verdict as it is.
 */
export async function panelVerdict(judges: Judge[], input: JudgeInput): Promise<JudgeVerdict & { failures: string[] }> {
  if (!judges.length) throw new Error("panelVerdict needs at least one judge");
  const verdicts = await Promise.all(judges.map((j) => j.judge(input)));
  const usage = emptyUsage();
  for (const v of verdicts) for (const k of Object.keys(usage) as (keyof JudgeUsage)[]) usage[k] += v.usage[k];
  const failures = verdicts.flatMap((v, i) => (v.ok ? [] : [`${judges[i]!.name}: ${v.why}`]));
  const ok = verdicts.filter((v): v is Extract<JudgeVerdict, { ok: true }> => v.ok);
  if (ok.length * 2 <= judges.length) {
    return { ok: false, why: failures.join(" | "), usage, failures };
  }
  const matches: Record<string, string | null> = {};
  for (const t of input.tool) {
    const votes = new Map<string | null, number>();
    for (const v of ok) votes.set(v.matches[t.id] ?? null, (votes.get(v.matches[t.id] ?? null) ?? 0) + 1);
    const winner = [...votes].find(([, n]) => n * 2 > judges.length);
    matches[t.id] = winner ? winner[0] : null;
  }
  return { ok: true, matches, usage, failures };
}
