// The only path to a paid model call: cache → budget reservation → request → ledger.
import { BudgetExceededError, type Budget } from "./budget.ts";
import { ResponseCache } from "./cache.ts";
import type { SpendLedger } from "./ledger.ts";
import { costUSD, estimateInputTokens, priceFor, type ModelPrice, type PriceTable } from "./prices.ts";

export const DEFAULT_BASE_URL = "https://api.tokenfactory.us-central1.nebius.com/v1";

/**
 * Models Token Factory serves only from another region. us-central1's GET /models lists 3.5 Super
 * VL, but its chat completions answer 404 "does not exist"; us-north1 answers, and has no 3 Super.
 * Exact, case-sensitive ids, as Nebius matches them.
 */
export const MODEL_BASE_URLS: Readonly<Record<string, string>> = {
  "nvidia/Nemotron-3.5-Super-VL": "https://api.tokenfactory.us-north1.nebius.com/v1",
};

const TOKEN_FACTORY_HOST = /^api\.tokenfactory\.[a-z0-9-]+\.nebius\.com$/;

/**
 * The base URL a request for `model` goes to: the model's region from MODEL_BASE_URLS when the
 * configured URL is a Token Factory host, else the configured URL unchanged. Any other host (a
 * proxy, a test server) is never rewritten.
 */
export function baseUrlFor(model: string, configured: string): string {
  if (!Object.hasOwn(MODEL_BASE_URLS, model)) return configured;
  let host: string;
  try {
    host = new URL(configured).hostname;
  } catch {
    return configured;
  }
  return TOKEN_FACTORY_HOST.test(host) ? MODEL_BASE_URLS[model]! : configured;
}

/**
 * Decision 071: the free NVIDIA API (build.nvidia.com), a second provider for one model only. A
 * request goes there only when the client was built with `nvidiaApi` (nvidiaApiFromEnv: set only by
 * TRACEHOUND_NVIDIA_API=1) and its model is exactly NVIDIA_API_MODEL; every other request takes the
 * Token Factory path unchanged. That provider has its own key, a 300 s timeout (reasoning is slow), a
 * process-wide limit of 36 requests per rolling minute (its limit is 40), and waits out HTTP 429.
 */
export const NVIDIA_API_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const NVIDIA_API_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_API_TIMEOUT_MS = 300_000;
export const NVIDIA_API_PER_MINUTE = 36;
/** On HTTP 429: Retry-After if present, else 20 s doubling; at most 5 waits, then the 429 is returned. */
export const NVIDIA_API_MAX_429_WAITS = 5;
export const NVIDIA_API_FIRST_429_WAIT_MS = 20_000;
/** Prefix to the model in the cache key of NVIDIA API requests, so they never share an entry with Token Factory. */
export const NVIDIA_API_CACHE_NAMESPACE = "nvidia-api:";

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** At most `limit` acquisitions in any rolling `windowMs`; acquire() waits for a free slot. */
export class RateWindow {
  readonly limit: number;
  readonly windowMs: number;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  #stamps: number[] = [];

  constructor(limit: number, windowMs: number, clock: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.#now = clock.now ?? Date.now;
    this.#sleep = clock.sleep ?? realSleep;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.#now();
      this.#stamps = this.#stamps.filter((t) => t > now - this.windowMs);
      if (this.#stamps.length < this.limit) {
        this.#stamps.push(now);
        return;
      }
      await this.#sleep(this.#stamps[0]! + this.windowMs - now);
    }
  }
}

/** The one window every NVIDIA API request in this process shares. */
export const NVIDIA_API_WINDOW = new RateWindow(NVIDIA_API_PER_MINUTE, 60_000);

export interface NvidiaApiOptions {
  apiKey: string;
  window?: RateWindow;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** The NVIDIA API options, only when TRACEHOUND_NVIDIA_API=1; throws if that is set without NVIDIA_API_KEY. */
export function nvidiaApiFromEnv(env: NodeJS.ProcessEnv = process.env): NvidiaApiOptions | undefined {
  if (env.TRACEHOUND_NVIDIA_API !== "1") return undefined;
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("TRACEHOUND_NVIDIA_API=1 needs NVIDIA_API_KEY (put it in .env)");
  return { apiKey };
}

/** Retry-After as milliseconds: delta-seconds or an HTTP date; undefined when absent or unreadable. */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.round(Number(value) * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** OpenAI-style tool call as returned in `message.tool_calls`. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  /** Documented in the Token Factory OpenAPI spec: none|minimal|low|medium|high|xhigh|max. */
  reasoning_effort?: string;
  /** Not in the official spec; passed through for chat templates that read it (e.g. enable_thinking). */
  chat_template_kwargs?: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  cached: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUSD: number; // 0 for cache hits
  reasoningChars?: number; // length of message.reasoning / reasoning_content, when returned
  reasoningTokens?: number; // usage.completion_tokens_details.reasoning_tokens, when reported
  toolCalls?: ToolCall[]; // message.tool_calls, when present
  finishReason?: string;
  /** choices[0].message as returned (for inspection and transcripts) */
  message?: Record<string, unknown>;
}

interface CompletionBody {
  choices?: { finish_reason?: string; message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } | null };
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
  /** --cache-only: serve cache hits, throw CacheMissError on a miss; never reserve budget or fetch. */
  offline?: boolean;
  /** false: a reply with finish_reason "length" is neither written to nor served from the cache (default true, today); keys unchanged */
  cacheTruncated?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Decision 071: route NVIDIA_API_MODEL to the NVIDIA API. Absent = no request ever goes there. */
  nvidiaApi?: NvidiaApiOptions;
}

export class LlmHttpError extends Error {
  override name = "LlmHttpError";
}

/** Offline mode found no cached response: the request would have been a real (paid) call. */
export class CacheMissError extends Error {
  override name = "CacheMissError";
}

export class TokenFactoryClient {
  readonly #opts: Required<Omit<TokenFactoryOptions, "cache" | "nvidiaApi">> & { cache?: ResponseCache; nvidiaApi?: NvidiaApiOptions };
  #nvidiaRequests = 0;
  #nvidia429s = 0;

  constructor(opts: TokenFactoryOptions) {
    // `??` rather than spread defaults: an explicit `undefined` (e.g. unset NEBIUS_BASE_URL) must not win
    this.#opts = {
      ...opts,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      readCache: opts.readCache ?? true,
      offline: opts.offline ?? false,
      cacheTruncated: opts.cacheTruncated ?? true,
      timeoutMs: opts.timeoutMs ?? 60_000,
      fetch: opts.fetch ?? globalThis.fetch,
      now: opts.now ?? (() => new Date()),
    };
  }

  /** NVIDIA API requests sent (each 429 retry included) and HTTP 429 replies; both 0 without nvidiaApi. */
  get nvidiaApiStats(): { requests: number; http429: number } {
    return { requests: this.#nvidiaRequests, http429: this.#nvidia429s };
  }

  /** `model` picks the region (baseUrlFor); without it, the configured base URL. */
  #url(p: string, model?: string) {
    const base = model === undefined ? this.#opts.baseUrl : baseUrlFor(model, this.#opts.baseUrl);
    return `${base.replace(/\/$/, "")}${p}`;
  }

  #headers() {
    return { "content-type": "application/json", authorization: `Bearer ${this.#opts.apiKey}` };
  }

  /** GET /models — free; used to confirm a model id resolves before any paid call. */
  async listModels(): Promise<string[]> {
    if (this.#opts.offline) throw new CacheMissError("GET /models is a network call; not allowed in offline (cache-only) mode");
    const res = await this.#opts.fetch(this.#url("/models"), { headers: this.#headers(), signal: AbortSignal.timeout(this.#opts.timeoutMs) });
    const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[] } & CompletionBody;
    if (!res.ok) throw new LlmHttpError(`GET /models → HTTP ${res.status}: ${errorText(body)}`);
    return (body.data ?? []).map((m) => m.id);
  }

  /** The NVIDIA API options when this request goes there (flag set, exact Ultra id), else undefined. */
  #nvidiaRoute(request: ChatRequest): NvidiaApiOptions | undefined {
    return this.#opts.nvidiaApi && request.model === NVIDIA_API_MODEL ? this.#opts.nvidiaApi : undefined;
  }

  /**
   * The table's price, except that the NVIDIA API id's $0 entry holds only on the NVIDIA route: sent
   * to Token Factory (flag unset) it is priced at placeholderFallback like any unknown id.
   */
  #priceFor(request: ChatRequest): ModelPrice {
    if (request.model === NVIDIA_API_MODEL && !this.#nvidiaRoute(request)) return { ...this.#opts.prices.placeholderFallback, estimated: true };
    return priceFor(this.#opts.prices, request.model);
  }

  async chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> {
    const { budget, ledger, cache } = this.#opts;
    const nvidia = this.#nvidiaRoute(request);
    // NVIDIA API replies live in their own cache namespace; every Token Factory key is unchanged.
    const key = ResponseCache.key(nvidia ? `${NVIDIA_API_CACHE_NAMESPACE}${request.model}` : request.model, request);
    const started = performance.now();

    if (cache && this.#opts.readCache) {
      const hit = cache.get<CompletionBody>(key);
      if (hit && (this.#opts.cacheTruncated || hit.choices?.[0]?.finish_reason !== "length")) {
        return {
          content: hit.choices?.[0]?.message?.content ?? "",
          cached: true,
          latencyMs: Math.round(performance.now() - started),
          inputTokens: hit.usage?.prompt_tokens,
          outputTokens: hit.usage?.completion_tokens,
          costUSD: 0,
          ...reasoningStats(hit),
        };
      }
    }

    if (this.#opts.offline) {
      throw new CacheMissError(`no cached response for ${meta.purpose}${meta.componentId ? ` (${meta.componentId})` : ""} on ${request.model}`);
    }

    // Worst case: estimated prompt tokens + every allowed completion token, at the (possibly
    // conservative placeholder) price. Throws before any request if a cap would be crossed.
    const price = this.#priceFor(request);
    const estIn = estimateInputTokens(request.messages, request.tools);
    const estimate = costUSD(price, estIn, request.max_tokens);
    const reservation = budget.reserve(estimate, `${meta.purpose}${meta.componentId ? ` (${meta.componentId})` : ""} on ${request.model}`);

    let recorded: number | undefined;
    const record = (body: CompletionBody, status?: number) => (recorded ??= this.#record(request, meta, body, estIn, status));
    try {
      let res: Response;
      try {
        res = nvidia
          ? await this.#nvidiaFetch(request, nvidia)
          : await this.#opts.fetch(this.#url("/chat/completions", request.model), {
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
      if ((content || body.choices?.[0]?.message?.tool_calls?.length)
        && (this.#opts.cacheTruncated || body.choices?.[0]?.finish_reason !== "length")) cache?.put(key, body);
      return {
        content,
        cached: false,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        costUSD: recorded ?? 0,
        ...reasoningStats(body),
      };
    } finally {
      reservation.settle(recorded ?? estimate);
    }
  }

  /**
   * Decision 071: one request to the NVIDIA API, through the process-wide window. A 429 is waited out
   * and the same request sent again (at most NVIDIA_API_MAX_429_WAITS waits); it is counted, never
   * ledgered. After the last wait a 429 is returned like any 4xx (ledgered at 0 tokens).
   */
  async #nvidiaFetch(request: ChatRequest, nv: NvidiaApiOptions): Promise<Response> {
    const window = nv.window ?? NVIDIA_API_WINDOW;
    const sleep = nv.sleep ?? realSleep;
    let backoff = NVIDIA_API_FIRST_429_WAIT_MS;
    for (let waits = 0; ; waits++) {
      await window.acquire();
      this.#nvidiaRequests++;
      const res = await this.#opts.fetch(`${NVIDIA_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${nv.apiKey}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(nv.timeoutMs ?? NVIDIA_API_TIMEOUT_MS),
      });
      if (res.status !== 429) return res;
      this.#nvidia429s++;
      if (waits >= NVIDIA_API_MAX_429_WAITS) return res;
      await res.body?.cancel().catch(() => {});
      const after = retryAfterMs(res.headers.get("retry-after"));
      await sleep(after ?? backoff);
      if (after === undefined) backoff *= 2;
    }
  }

  /**
   * Ledger every real call. Reported usage is charged as-is. Without usage: a 4xx was rejected
   * before inference (0 tokens); anything else (5xx, network, timeout) is charged the pre-call
   * upper bound, so the ledger can over-count but never under-count.
   */
  #record(request: ChatRequest, meta: { purpose: string; componentId?: string }, body: CompletionBody, estIn: number, status?: number): number {
    const price = this.#priceFor(request);
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

function reasoningStats(body: CompletionBody): Pick<ChatResult, "reasoningChars" | "reasoningTokens" | "toolCalls" | "finishReason" | "message"> {
  const message = body.choices?.[0]?.message;
  const reasoning = message?.reasoning ?? message?.reasoning_content;
  return {
    reasoningChars: typeof reasoning === "string" ? reasoning.length : undefined,
    reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? undefined,
    ...(message?.tool_calls?.length && { toolCalls: message.tool_calls }),
    ...(body.choices?.[0]?.finish_reason && { finishReason: body.choices[0].finish_reason }),
    ...(message && { message: message as Record<string, unknown> }),
  };
}

function errorText(body: CompletionBody): string {
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? body.detail ?? "no error message";
}

export { BudgetExceededError };
