// tracehound review-recall --pr <input.json> --repo <git dir> --head <sha> --out <file> [--model <id>]
// recall-v3 (decision 070) on one pull request. The input is review-diff-v1's ({title, body |
// description, diff, number?}). The output is the neutral review format (decision 054) with each
// finding's range and producer (lensA, lensB, missed) and a `review` record. Once the arguments are
// valid it always writes the output and exits 0: an error leaves the findings so far, or none, and
// says why in the record. stderr gets counts only, never finding text.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "../../naming/llm.ts";
import { Budget, capsFromEnv } from "../../llm/budget.ts";
import { ResponseCache } from "../../llm/cache.ts";
import { TokenFactoryClient } from "../../llm/client.ts";
import { SpendLedger } from "../../llm/ledger.ts";
import { loadPriceTable, priceFor } from "../../llm/prices.ts";
import { gitSource } from "../context.ts";
import type { PullInput } from "../review.ts";
import { reviewRecall, type RecallOutput } from "./run.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE = "usage: tracehound review-recall --pr <file> --repo <git dir> --head <sha> --out <file> [--model <id>]";

export function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

/** One line of counts for a record. */
export function summaryLine(name: string, r: RecallOutput): string {
  const v = r.review;
  const n = (s: string) => v.calls.filter((c) => c.status === s).length;
  return `[review-recall] ${name}: chunks ${v.chunks.length} · skipped files ${v.skipped.length} · calls ok ${n("OK")} failed ${n("FAILED")} skipped ${n("SKIPPED")} · ` +
    `truncated ${v.calls.reduce((s, c) => s + c.truncated, 0)} · retries ${v.calls.reduce((s, c) => s + c.retries, 0)} · missed ${v.missed.status} pool ${v.missed.pool} found ${v.missed.findings} · ` +
    `findings ${r.comments.length} (A ${v.byProducer.lensA} B ${v.byProducer.lensB} M ${v.byProducer.missed}) · reduce ${JSON.stringify(v.reduce)} · ` +
    `budget refused ${v.budget.refused} · guard ${v.guard.hit ? "hit" : "no"} · errors ${v.errors.length} · $${v.costUSD.toFixed(4)} · ${(v.wallMs / 1000).toFixed(0)} s`;
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pr: { type: "string" },
      repo: { type: "string" },
      head: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
    },
  });
  if (!values.pr || !values.repo || !values.head || !values.out) {
    console.error(USAGE);
    return 1;
  }
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    console.error("NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  const input = readInput(values.pr);
  const ledger = new SpendLedger(path.join(STATE_DIR, "spend.jsonl"));
  const prices = loadPriceTable(path.join(WORKSPACE_ROOT, "config/prices.json"));
  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL,
    prices,
    budget: new Budget(capsFromEnv(), ledger.totalUSD()),
    ledger,
    cache: new ResponseCache(path.join(STATE_DIR, "cache")),
    timeoutMs: 600_000,
  });
  const r = await reviewRecall(client, input, { model: values.model!, price: priceFor(prices, values.model!), repo: { source: gitSource(values.repo, values.head), head: values.head } });
  mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  writeFileSync(values.out, JSON.stringify(r, null, 1) + "\n");
  console.error(summaryLine(path.basename(values.pr), r));
  return 0;
}
