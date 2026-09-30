// The one way non-analyze commands build a Token Factory client: same cache, budget caps and
// spend ledger as naming (.tracehound/), so every call is capped and ledgered.
import path from "node:path";
import { Budget, capsFromEnv } from "./budget.ts";
import { ResponseCache } from "./cache.ts";
import { TokenFactoryClient } from "./client.ts";
import { SpendLedger } from "./ledger.ts";
import { loadPriceTable } from "./prices.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");

export function createTokenFactoryClient(opts: { apiKey?: string; readCache?: boolean } = {}) {
  const apiKey = opts.apiKey ?? process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set (put it in .env)");
  const ledger = new SpendLedger(path.join(STATE_DIR, "spend.jsonl"));
  const caps = capsFromEnv();
  const budget = new Budget(caps, ledger.totalUSD());
  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL,
    prices: loadPriceTable(path.join(WORKSPACE_ROOT, "config/prices.json")),
    budget,
    ledger,
    cache: new ResponseCache(path.join(STATE_DIR, "cache")),
    readCache: opts.readCache ?? true,
  });
  return { client, budget, caps, ledger };
}
