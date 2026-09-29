// Optional naming pass: an LLM names and summarizes components from their extracted facts.
// It runs after deterministic analysis, reads facts only (never source code), and can only
// change `name`, `summary` and `naming` on components. Edges, evidence and ids pass through as-is.
import { z } from "zod";
import type { Component, LlmCall, Snapshot } from "../schema.ts";

export const DEFAULT_BASE_URL = "https://api.tokenfactory.us-central1.nebius.com/v1";
export const DEFAULT_MODEL = "nvidia/nvidia-nemotron-3-nano-30b-a3b";

export interface LlmNamingConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  concurrency?: number;
  fetch?: typeof fetch;
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

/** The facts sent to the model: structure and names only, never source text or snippets. */
export function componentFacts(snapshot: Snapshot, component: Component) {
  const nameOf = (id: string) => snapshot.components.find((c) => c.id === id)?.naming.heuristicName ?? id;
  const edgeFacts = (dir: "out" | "in") =>
    snapshot.edges
      .filter((e) => (dir === "out" ? e.source : e.target) === component.id)
      .map((e) => ({ component: nameOf(dir === "out" ? e.target : e.source), relation: e.kind, via: e.label }));
  return {
    currentName: component.naming.heuristicName,
    kind: component.kind,
    subtitle: component.subtitle,
    files: component.files,
    routes: component.routes.map((r) => `${r.method} ${r.path}`),
    entryPoints: component.entryPoints.map((e) => [e.symbol, e.reason].filter(Boolean).join(" — ")),
    envVars: component.envVars,
    resource: component.resource,
    dependsOn: edgeFacts("out"),
    usedBy: edgeFacts("in"),
    warnings: snapshot.warnings.filter((w) => w.componentId === component.id).map((w) => w.message),
  };
}

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

async function nameOne(snapshot: Snapshot, component: Component, cfg: Required<Omit<LlmNamingConfig, "log">>) {
  const started = performance.now();
  const call: LlmCall = { purpose: "component-naming", componentId: component.id, model: cfg.model, latencyMs: 0, ok: false };
  try {
    const res = await cfg.fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 1500, // headroom for reasoning tokens before the JSON answer
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(componentFacts(snapshot, component)) },
        ],
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    call.promptTokens = body.usage?.prompt_tokens;
    call.completionTokens = body.usage?.completion_tokens;
    call.totalTokens = body.usage?.total_tokens;
    if (!res.ok) throw new Error(`HTTP ${res.status}${body.error?.message ? `: ${body.error.message}` : ""}`);
    const reply = parseReply(body.choices?.[0]?.message?.content ?? "");
    if (!reply) throw new Error("reply was not a valid {name, summary} object");
    call.ok = true;
    return { call, reply };
  } catch (error) {
    call.error = error instanceof Error ? error.message : String(error);
    return { call, reply: undefined };
  } finally {
    call.latencyMs = Math.round(performance.now() - started);
  }
}

/**
 * Name every component not named by a tracehound.json override. Failures keep the heuristic name.
 * Returns a new snapshot; only component name/summary/naming differ from the input.
 */
export async function nameComponentsWithLlm(snapshot: Snapshot, config: LlmNamingConfig): Promise<Snapshot> {
  const cfg = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    model: config.model ?? DEFAULT_MODEL,
    timeoutMs: config.timeoutMs ?? 30_000,
    concurrency: config.concurrency ?? 4,
    fetch: config.fetch ?? fetch,
  };
  const log = config.log ?? (() => {});
  const targets = snapshot.components.filter((c) => c.naming.source !== "override");
  const results = new Map<string, Awaited<ReturnType<typeof nameOne>>>();

  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const component = targets[next++]!;
      const result = await nameOne(snapshot, component, cfg);
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
  const tokens = call.totalTokens !== undefined ? `${call.promptTokens}+${call.completionTokens}=${call.totalTokens} tokens` : "tokens n/a";
  return `[naming] ${call.componentId.padEnd(28)} ${call.model} ${String(call.latencyMs).padStart(5)}ms ${tokens} ${call.ok ? "ok" : `FAILED (${call.error}) → heuristic name`}`;
}
