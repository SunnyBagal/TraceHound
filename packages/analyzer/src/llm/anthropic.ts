// Decision 076g item 4: explicit, report-only DEV rows. Never used by the Action or the primary.
// No SDK dependency. Messages API contract pinned to 2023-06-01; see the live model/migration docs.
import { Budget, type BudgetCaps } from "./budget.ts";
import { CacheMissError, LlmHttpError, type ChatRequest, type ChatResult } from "./client.ts";
import { ResponseCache } from "./cache.ts";
import { SpendLedger, type SpendEntry } from "./ledger.ts";
import { costUSD, priceFor, type ModelPrice, type PriceTable } from "./prices.ts";

export const ANTHROPIC_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export type AnthropicModel = typeof ANTHROPIC_MODELS[number];
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_CAP_NAMES = { total: "TRACEHOUND_BUDGET_ANTHROPIC_USD", run: "TRACEHOUND_BUDGET_ANTHROPIC_RUN_USD" };

/** Explicit separate caps, no Nebius fallback and no echo of an invalid value (it could be a misplaced key). */
export function anthropicCapsFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetCaps {
  const read = (name: string) => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      throw new Error(`${name} must be explicitly set to a non-negative USD amount`);
    }
    return Number(raw);
  };
  return { totalUSD: read(ANTHROPIC_CAP_NAMES.total), runUSD: read(ANTHROPIC_CAP_NAMES.run) };
}

export interface AnthropicOptions {
  scope: "report-only-dev";
  model: AnthropicModel;
  apiKey: string;
  caps: BudgetCaps;
  prices: PriceTable;
  ledger: SpendLedger; // separate spend.anthropic.jsonl, never the Nebius ledger
  cache?: ResponseCache;
  readCache?: boolean;
  offline?: boolean;
  effort?: Effort;
  thinking?: "adaptive" | "off";
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

type Settings = NonNullable<SpendEntry["settings"]>;
type MessageBody = { model?: unknown; stop_reason?: unknown; stop_details?: { type?: unknown }; content?: unknown; usage?: Record<string, unknown> };
const tokenCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;
const isModel = (x: unknown): x is AnthropicModel => ANTHROPIC_MODELS.some((m) => m === x);
const isEffort = (x: unknown): x is Effort => ["low", "medium", "high", "xhigh", "max"].includes(x as string);

/** Haiku's >100k prompt tier is $0.50/$2.50; Sonnet stays $2/$10. No prompt caching is requested. */
export function anthropicPrice(prices: PriceTable, model: AnthropicModel, inputTokens: number): ModelPrice {
  const p = priceFor(prices, model);
  if (p.estimated) throw new Error("Anthropic needs a verified model price; no placeholder pricing");
  return model === "claude-haiku-5-5" && inputTokens > 100_000
    ? { inputPer1M: 0.50, outputPer1M: 2.50, estimated: false } : p;
}

/** Text-only chat adapter for the existing review/verify prompts; agent/tool loops are outside this exception. */
export class AnthropicClient {
  readonly budget: Budget;
  readonly #o: AnthropicOptions;
  constructor(o: AnthropicOptions) {
    if (o.scope !== "report-only-dev" || !isModel(o.model)) throw new Error("Anthropic is only for explicit report-only dev rows on the two ruled models");
    if (!o.apiKey && !o.offline) throw new Error("ANTHROPIC_API_KEY is not set (put it in .env)");
    if (!o.caps || ![o.caps.totalUSD, o.caps.runUSD].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Anthropic caps must be non-negative finite USD amounts");
    if (o.effort !== undefined && !isEffort(o.effort)) throw new Error("unsupported Anthropic effort");
    if (o.thinking !== undefined && !["adaptive", "off"].includes(o.thinking)) throw new Error("unsupported Anthropic thinking setting");
    if (o.ledger.entries().some((e) => e.provider !== "anthropic")) throw new Error("Anthropic needs its own provider-tagged ledger; never use the Nebius ledger");
    this.#o = o;
    this.budget = new Budget(o.caps, o.ledger.totalUSD(), ANTHROPIC_CAP_NAMES);
  }

  #request(r: ChatRequest): { body: Record<string, unknown>; settings: Settings; estIn: number } {
    if (r.model !== this.#o.model) throw new Error("Anthropic model must match the configured row; no model fallback");
    if (!Number.isSafeInteger(r.max_tokens) || r.max_tokens < 1 || r.max_tokens > 128_000) throw new Error("Anthropic max_tokens must be 1..128000");
    if (r.tools?.length || (r.tool_choice !== undefined && r.tool_choice !== "none")) throw new Error("Anthropic report-only adapter accepts text prompts, not tool loops");
    const effort = r.reasoning_effort ?? this.#o.effort ?? (r.model === "claude-haiku-5-5" ? "medium" : "high");
    if (!isEffort(effort)) throw new Error("unsupported Anthropic effort");
    const kwargs = r.chat_template_kwargs;
    if (kwargs && (Object.keys(kwargs).some((k) => k !== "enable_thinking") || typeof kwargs.enable_thinking !== "boolean")) {
      throw new Error("unsupported chat template settings for Anthropic");
    }
    const off = kwargs?.enable_thinking === undefined ? this.#o.thinking === "off" : kwargs.enable_thinking === false;
    if (off && ["xhigh", "max"].includes(effort)) throw new Error("Anthropic thinking off requires effort high or below");
    const thinking = off ? (r.model === "claude-sonnet-5-5" ? "between_tools" : "disabled") : "adaptive";
    const system: string[] = [];
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of r.messages) {
      if (m.role === "system" && !messages.length) system.push(m.content);
      else if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string" && !("tool_calls" in m && m.tool_calls?.length)) {
        messages.push({ role: m.role, content: m.content });
      } else throw new Error("Anthropic report-only adapter requires text turns and leading system instructions");
    }
    if (messages[0]?.role !== "user" || messages.at(-1)?.role !== "user") throw new Error("Anthropic needs a user turn last; assistant prefill is unsupported");
    // Nemotron's temperature:0 is intentionally NOT sent. The ledger records default sampling as a row difference.
    const body = { model: r.model, max_tokens: r.max_tokens, ...(system.length && { system: system.join("\n\n") }), messages,
      thinking: { type: thinking }, output_config: { effort } };
    // UTF-8 bytes plus fixed overhead is deliberately conservative for code/Unicode, unlike chars/3. Thinking is in max_tokens.
    const estIn = Buffer.byteLength(JSON.stringify(body), "utf8") + 1024;
    return { body, settings: { sampling: "default", thinking, effort, apiVersion: ANTHROPIC_VERSION }, estIn };
  }

  async chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> {
    const o = this.#o;
    const { body, settings, estIn } = this.#request(request);
    const key = ResponseCache.key(`anthropic:${ANTHROPIC_VERSION}:${request.model}`, body);
    const began = performance.now();
    if (o.cache && o.readCache !== false) {
      const hit = o.cache.get<ChatResult>(key);
      if (hit && hit.finishReason === "stop" && typeof hit.content === "string" && (!o.apiKey || !hit.content.includes(o.apiKey))) {
        return { ...hit, cached: true, costUSD: 0, latencyMs: Math.round(performance.now() - began) };
      }
    }
    if (o.offline) throw new CacheMissError("no cached Anthropic report-only dev response; no request sent");
    const estimate = costUSD(anthropicPrice(o.prices, o.model, estIn), estIn, request.max_tokens);
    const reserved = this.budget.reserve(estimate, `Anthropic report-only dev ${o.model}`);
    let recorded: number | undefined;
    const record = (value: MessageBody, status?: number, ok = false) => {
      if (recorded !== undefined) return recorded;
      const u = value.usage;
      const usageReported = tokenCount(u?.input_tokens) && tokenCount(u?.output_tokens);
      const rejected = status !== undefined && status >= 400 && status < 500;
      const plainIn = usageReported ? u.input_tokens as number : rejected ? 0 : estIn;
      const out = usageReported ? u.output_tokens as number : rejected ? 0 : request.max_tokens;
      const read = tokenCount(u?.cache_read_input_tokens) ? u.cache_read_input_tokens : 0;
      const write = tokenCount(u?.cache_creation_input_tokens) ? u.cache_creation_input_tokens : 0;
      const inputTokens = plainIn + read + write;
      const p = anthropicPrice(o.prices, o.model, inputTokens);
      // No caching is requested; if the service reports it anyway, count all input and price writes at the 1h upper rate.
      recorded = costUSD(p, plainIn + read + 2 * write, out);
      o.ledger.append({ timestamp: (o.now?.() ?? new Date()).toISOString(), provider: "anthropic", model: o.model,
        inputTokens, outputTokens: out, estCostUSD: recorded, purpose: meta.purpose, componentId: meta.componentId,
        ok, usageReported, priceEstimated: !usageReported || read + write > 0, settings });
      return recorded;
    };
    try {
      let res: Response;
      try {
        res = await (o.fetch ?? globalThis.fetch)(ANTHROPIC_URL, { method: "POST", redirect: "error",
          headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": ANTHROPIC_VERSION },
          body: JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs ?? 300_000) });
      } catch {
        record({}); // ambiguous transport/timeout: charge the bound, never surface an exception containing credentials
        throw new LlmHttpError("Anthropic request failed (transport or timeout); no fallback");
      }
      const raw: unknown = await res.json().catch(() => null);
      const value: MessageBody = raw && typeof raw === "object" ? raw as MessageBody : {};
      if (!res.ok) { record(value, res.status); throw new LlmHttpError(`Anthropic HTTP ${res.status}; no fallback`); }
      // Inspect stop and model BEFORE content. The newer stop_details form is also refused defensively.
      if (value.stop_reason === "refusal" || value.stop_details?.type === "refusal") {
        record(value, res.status); throw new LlmHttpError("Anthropic refusal: failed chunk; no fallback");
      }
      if (value.model !== o.model) { record(value, res.status); throw new LlmHttpError("Anthropic response model differs from the configured row; no fallback"); }
      if (!["end_turn", "stop_sequence", "max_tokens"].includes(value.stop_reason as string)) {
        record(value, res.status); throw new LlmHttpError("Anthropic response has an unsupported stop reason; failed chunk");
      }
      if (!Array.isArray(value.content) || value.content.some((b) => !b || typeof b !== "object")) {
        record(value, res.status); throw new LlmHttpError("Anthropic response has invalid content; failed chunk");
      }
      const texts = value.content.filter((b) => b.type === "text");
      if (texts.some((b) => typeof b.text !== "string") || !texts.length) {
        record(value, res.status); throw new LlmHttpError("Anthropic response contains no text; failed chunk");
      }
      const content = texts.map((b) => b.text as string).join("");
      if (content.includes(o.apiKey)) { record(value, res.status); throw new LlmHttpError("Anthropic returned unsafe content; failed chunk"); }
      const cost = record(value, res.status, true);
      const result: ChatResult = { content, cached: false, latencyMs: Math.round(performance.now() - began), costUSD: cost,
        inputTokens: tokenCount(value.usage?.input_tokens) ? (value.usage.input_tokens as number)
          + (tokenCount(value.usage.cache_read_input_tokens) ? value.usage.cache_read_input_tokens : 0)
          + (tokenCount(value.usage.cache_creation_input_tokens) ? value.usage.cache_creation_input_tokens : 0) : undefined,
        outputTokens: tokenCount(value.usage?.output_tokens) ? value.usage.output_tokens : undefined,
        finishReason: value.stop_reason === "max_tokens" ? "length" : "stop", message: { role: "assistant", content } };
      if (result.finishReason === "stop") o.cache?.put(key, result); // no refusal, raw thinking, key, or truncated output in cache
      return result;
    } finally { reserved.settle(recorded ?? estimate); }
  }
}
