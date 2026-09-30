// Optional naming pass: an LLM names and summarizes components from their extracted facts.
// It runs after deterministic analysis, reads facts only (never source code), and can only
// change `name`, `summary` and `naming` on components. Edges, evidence and ids pass through as-is.
import { z } from "zod";
import { BudgetExceededError } from "../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import type { Component, LlmCall, Snapshot } from "../schema.ts";
import { componentFacts } from "./facts.ts";

export { componentFacts } from "./facts.ts";

/** Development default. Larger Nemotrons only when explicitly passed (--model). */
export const DEFAULT_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
const MAX_TOKENS = 1500; // headroom for reasoning tokens before the JSON answer

export interface LlmNamingConfig {
  client: { chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> };
  model?: string;
  concurrency?: number;
  log?: (call: LlmCall) => void;
}

const SYSTEM_PROMPT = [
  "You name components in a software architecture diagram.",
  "Use ONLY the facts in the user message. Do not invent technologies, routes, files or dependencies.",
  'Reply with a single JSON object and nothing else: {"name": string, "summary": string}.',
  "name: 2-4 words, Title Case, describes the component's responsibility, no file names or extensions.",
  "summary: one sentence, at most 25 words, what the component does and for whom.",
].join("\n");

const Reply = z.object({
  name: z.string().trim().min(2).max(48).refine((n) => !/[\n{}]|\.(ts|js)\b/.test(n) && n.split(/\s+/).length <= 5, "not a short title"),
  summary: z.string().trim().min(8).max(280),
});

/** Pull the JSON object out of a reply that may include <think> blocks or code fences. */
export function parseReply(content: string): z.infer<typeof Reply> | undefined {
  const text = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = Reply.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function nameOne(snapshot: Snapshot, component: Component, client: LlmNamingConfig["client"], model: string) {
  const call: LlmCall = { purpose: "component-naming", componentId: component.id, model, latencyMs: 0, ok: false, cached: false, estCostUSD: 0 };
  const started = performance.now();
  try {
    const result = await client.chat(
      {
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(componentFacts(snapshot, component)) },
        ],
      },
      { purpose: "component-naming", componentId: component.id },
    );
    Object.assign(call, {
      latencyMs: result.latencyMs,
      cached: result.cached,
      estCostUSD: result.costUSD,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      totalTokens: result.inputTokens !== undefined && result.outputTokens !== undefined ? result.inputTokens + result.outputTokens : undefined,
    });
    const reply = parseReply(result.content);
    if (!reply) throw new Error(`reply was not a valid {name, summary} object: ${JSON.stringify(result.content.slice(0, 160))}`);
    call.ok = true;
    return { call, reply };
  } catch (error) {
    if (error instanceof BudgetExceededError) throw error; // never degrade silently past a cap
    call.error = error instanceof Error ? error.message : String(error);
    if (!call.latencyMs) call.latencyMs = Math.round(performance.now() - started);
    return { call, reply: undefined };
  }
}

/**
 * Name every component not named by a tracehound.json override. Failures keep the heuristic name.
 * Returns a new snapshot; only component name/summary/naming differ from the input.
 */
export async function nameComponentsWithLlm(snapshot: Snapshot, config: LlmNamingConfig): Promise<Snapshot> {
  const cfg = { model: config.model ?? DEFAULT_MODEL, concurrency: config.concurrency ?? 4 };
  const log = config.log ?? (() => {});
  const targets = snapshot.components.filter((c) => c.naming.source !== "override");
  const results = new Map<string, Awaited<ReturnType<typeof nameOne>>>();

  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const component = targets[next++]!;
      const result = await nameOne(snapshot, component, config.client, cfg.model);
      log(result.call);
      results.set(component.id, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cfg.concurrency, targets.length) }, worker));

  const taken = new Set(snapshot.components.filter((c) => c.naming.source === "override").map((c) => c.name.toLowerCase()));
  const components = snapshot.components.map((c): Component => {
    const reply = results.get(c.id)?.reply;
    if (!reply || taken.has(reply.name.toLowerCase())) {
      taken.add(c.name.toLowerCase());
      return c; // fallback: keep the heuristic (or override) name
    }
    taken.add(reply.name.toLowerCase());
    return { ...c, name: reply.name, summary: reply.summary, naming: { ...c.naming, source: "llm", model: cfg.model } };
  });

  const calls = targets.map((c) => results.get(c.id)!.call);
  return { ...snapshot, components, llmCalls: [...snapshot.llmCalls, ...calls] };
}

export function formatCall(call: LlmCall): string {
  const tokens = call.totalTokens !== undefined ? `${call.promptTokens}+${call.completionTokens}=${call.totalTokens} tok` : "tokens n/a";
  const cost = call.cached ? "cached $0" : `~$${call.estCostUSD.toFixed(5)}`;
  return `[naming] ${call.componentId.padEnd(28)} ${call.model} ${String(call.latencyMs).padStart(6)}ms ${tokens} ${cost} ${call.ok ? "ok" : `FAILED (${call.error}) → heuristic name`}`;
}
