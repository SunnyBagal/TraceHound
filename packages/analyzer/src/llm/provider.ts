// Explicit opt-in for decision 076g's report-only dev rows. Existing Action/primary factories do not use this module.
import path from "node:path";
import { z } from "zod";
import { AnthropicClient, ANTHROPIC_MODELS, anthropicCapsFromEnv } from "./anthropic.ts";
import { Budget, capsFromEnv } from "./budget.ts";
import { ResponseCache, cacheReadFromEnv } from "./cache.ts";
import { TokenFactoryClient } from "./client.ts";
import { SpendLedger } from "./ledger.ts";
import { loadPriceTable, type PriceTable } from "./prices.ts";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const NebiusConfig = z.object({ provider: z.literal("nebius").optional(), scope: z.literal("report-only-dev").optional() }).strict();
const AnthropicConfig = z.object({ provider: z.literal("anthropic"), scope: z.literal("report-only-dev"), model: z.enum(ANTHROPIC_MODELS),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(), thinking: z.enum(["adaptive", "off"]).optional() }).strict();

export type AnthropicRowConfig = z.infer<typeof AnthropicConfig>;

/** The same check createDevReportClient applies, for callers that validate a row config before any client exists. */
export function parseAnthropicRowConfig(config: unknown): AnthropicRowConfig | null {
  const c = AnthropicConfig.safeParse(config);
  if (!c.success || (c.data.thinking === "off" && ["xhigh", "max"].includes(c.data.effort ?? ""))) return null;
  return c.data;
}

export function createDevReportClient(config: unknown = {}, opts: {
  env?: NodeJS.ProcessEnv; stateDir?: string; prices?: PriceTable; fetch?: typeof fetch; readCache?: boolean; offline?: boolean;
  timeoutMs?: number; // Anthropic only; the client default (300 s) when unset
} = {}) {
  const env = opts.env ?? process.env;
  const dir = opts.stateDir ?? path.join(ROOT, ".tracehound");
  const prices = opts.prices ?? loadPriceTable(path.join(ROOT, "config/prices.json"));
  const readCache = opts.readCache ?? cacheReadFromEnv(env);
  const cache = new ResponseCache(path.join(dir, "cache"));
  const selected = config && typeof config === "object" ? (config as { provider?: unknown }).provider : null;
  if (selected === "anthropic") {
    const c = AnthropicConfig.safeParse(config);
    if (!c.success) throw new Error("Anthropic config requires scope report-only-dev, a ruled model, and supported effort/thinking settings");
    if (c.data.thinking === "off" && ["xhigh", "max"].includes(c.data.effort ?? "")) throw new Error("Anthropic thinking off requires effort high or below");
    const caps = anthropicCapsFromEnv(env);
    const ledger = new SpendLedger(path.join(dir, "spend.anthropic.jsonl"));
    const client = new AnthropicClient({ ...c.data, apiKey: env.ANTHROPIC_API_KEY ?? "", caps, ledger, prices, cache,
      readCache, offline: opts.offline, fetch: opts.fetch, ...(opts.timeoutMs !== undefined && { timeoutMs: opts.timeoutMs }) });
    return { client, budget: client.budget, caps, ledger, model: c.data.model };
  }
  if (!NebiusConfig.safeParse(config).success) throw new Error("invalid report-only dev provider config (default: nebius)");
  const apiKey = env.NEBIUS_API_KEY;
  if (!apiKey && !opts.offline) throw new Error("NEBIUS_API_KEY is not set (put it in .env)");
  const caps = capsFromEnv(env);
  const ledger = new SpendLedger(path.join(dir, "spend.jsonl"));
  const budget = new Budget(caps, ledger.totalUSD());
  const client = new TokenFactoryClient({ apiKey: apiKey ?? "", baseUrl: env.NEBIUS_BASE_URL,
    prices, budget, ledger, cache, readCache, offline: opts.offline, fetch: opts.fetch });
  return { client, budget, caps, ledger };
}
