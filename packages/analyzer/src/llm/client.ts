// The only path to a paid model call: cache → budget reservation → request → ledger.
import { BudgetExceededError, type Budget } from "./budget.ts";
import { ResponseCache } from "./cache.ts";
import type { SpendLedger } from "./ledger.ts";
import { costUSD, estimateInputTokens, priceFor, type PriceTable } from "./prices.ts";

export const DEFAULT_BASE_URL = "https://api.tokenfactory.us-central1.nebius.com/v1";

export interface ChatRequest {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
}

export interface ChatResult {
  content: string;
  cached: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUSD: number; // 0 for cache hits
}

interface CompletionBody {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string } | string;
  detail?: string;
}

export interface TokenFactoryOptions {
  apiKey: string;
  baseUrl?: string;
  prices: PriceTable;
  budget: Budget;
  ledger: SpendLedger;
  cache?: ResponseCache;
  readCache?: boolean; // false = --no-cache: always call, still refresh the cache
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

export class LlmHttpError extends Error {
  override name = "LlmHttpError";
}

export class TokenFactoryClient {
  readonly #opts: Required<Omit<TokenFactoryOptions, "cache">> & { cache?: ResponseCache };

  constructor(opts: TokenFactoryOptions) {
    // `??` rather than spread defaults: an explicit `undefined` (e.g. unset NEBIUS_BASE_URL) must not win
    this.#opts = {
      ...opts,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      readCache: opts.readCache ?? true,
      timeoutMs: opts.timeoutMs ?? 60_000,
      fetch: opts.fetch ?? globalThis.fetch,
      now: opts.now ?? (() => new Date()),
    };
  }

  #url(p: string) {
    return `${this.#opts.baseUrl.replace(/\/$/, "")}${p}`;
  }

  #headers() {
    return { "content-type": "application/json", authorization: `Bearer ${this.#opts.apiKey}` };
  }

  /** GET /models — free; used to confirm a model id resolves before any paid call. */
  async listModels(): Promise<string[]> {
    const res = await this.#opts.fetch(this.#url("/models"), { headers: this.#headers(), signal: AbortSignal.timeout(this.#opts.timeoutMs) });
    const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[] } & CompletionBody;
    if (!res.ok) throw new LlmHttpError(`GET /models → HTTP ${res.status}: ${errorText(body)}`);
    return (body.data ?? []).map((m) => m.id);
  }

  async chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> {
    const { budget, ledger, cache, prices } = this.#opts;
    const key = ResponseCache.key(request.model, request);
    const started = performance.now();

    if (cache && this.#opts.readCache) {
      const hit = cache.get<CompletionBody>(key);
      if (hit) {
        return {
          content: hit.choices?.[0]?.message?.content ?? "",
          cached: true,
          latencyMs: Math.round(performance.now() - started),
          inputTokens: hit.usage?.prompt_tokens,
          outputTokens: hit.usage?.completion_tokens,
          costUSD: 0,
        };
      }
    }

    // Worst case: estimated prompt tokens + every allowed completion token, at the (possibly
    // conservative placeholder) price. Throws before any request if a cap would be crossed.
    const price = priceFor(prices, request.model);
    const estIn = estimateInputTokens(request.messages);
    const estimate = costUSD(price, estIn, request.max_tokens);
    const reservation = budget.reserve(estimate, `${meta.purpose}${meta.componentId ? ` (${meta.componentId})` : ""} on ${request.model}`);

    let recorded: number | undefined;
    const record = (body: CompletionBody, status?: number) => (recorded ??= this.#record(request, meta, body, estIn, status));
    try {
      let res: Response;
      try {
        res = await this.#opts.fetch(this.#url("/chat/completions"), {
          method: "POST",
          headers: this.#headers(),
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.#opts.timeoutMs),
        });
      } catch (error) {
        record({}); // network error / timeout: the model may have run, charge the upper bound
        throw error;
      }
      const body = (await res.json().catch(() => ({}))) as CompletionBody;
      record(body, res.status);
      if (!res.ok) throw new LlmHttpError(`HTTP ${res.status}: ${errorText(body)}`);
      const content = body.choices?.[0]?.message?.content ?? "";
      if (content) cache?.put(key, body);
      return {
        content,
        cached: false,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        costUSD: recorded ?? 0,
      };
    } finally {
      reservation.settle(recorded ?? estimate);
    }
  }

  /**
   * Ledger every real call. Reported usage is charged as-is. Without usage: a 4xx was rejected
   * before inference (0 tokens); anything else (5xx, network, timeout) is charged the pre-call
   * upper bound, so the ledger can over-count but never under-count.
   */
  #record(request: ChatRequest, meta: { purpose: string; componentId?: string }, body: CompletionBody, estIn: number, status?: number): number {
    const price = priceFor(this.#opts.prices, request.model);
    const usageReported = body.usage?.prompt_tokens !== undefined && body.usage?.completion_tokens !== undefined;
    const rejected = status !== undefined && status >= 400 && status < 500;
    const inputTokens = body.usage?.prompt_tokens ?? (rejected ? 0 : estIn);
    const outputTokens = body.usage?.completion_tokens ?? (rejected ? 0 : request.max_tokens);
    const cost = costUSD(price, inputTokens, outputTokens);
    this.#opts.ledger.append({
      timestamp: this.#opts.now().toISOString(),
      model: request.model,
      inputTokens,
      outputTokens,
      estCostUSD: cost,
      purpose: meta.purpose,
      componentId: meta.componentId,
      ok: status !== undefined && status < 400,
      usageReported,
      priceEstimated: price.estimated,
    });
    return cost;
  }
}

function errorText(body: CompletionBody): string {
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? body.detail ?? "no error message";
}

export { BudgetExceededError };
