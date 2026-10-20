// tracehound review-missed --pr <input.json> --findings <pool.json> --repo <git dir> --head <sha> --out <file>
//                          [--model <id>] [--reasoning on|off]
// P008 amendment 2, review-missed-v1: one pull request. The input is review-diff-v1's ({title,
// body | description, diff, number?}); the pool file is {comments: [{path, line, body}]}, the
// pooled findings of review-diff-v1 and review-ctx-v1. The output is review-ctx-v1's format with
// only the pass's own findings in `comments`; merging them into the pool is the caller's job.
// stdout gets counts only, never comment, finding or context text.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "../naming/llm.ts";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import { gitSource } from "./context.ts";
import { reviewMissed } from "./missed.ts";
import type { PooledFinding } from "./prompt-missed.ts";
import type { PullInput } from "./review.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound review-missed --pr <file> --findings <pool.json> --repo <git dir> --head <sha> --out <file> [--model <id>] [--reasoning on|off]";

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

/** `{comments: [{path, line, body}]}`; a malformed pool is an error, never an empty list. */
export function readPool(file: string): PooledFinding[] {
  const comments = (JSON.parse(readFileSync(file, "utf8")) as { comments?: unknown } | null)?.comments;
  if (!Array.isArray(comments)) throw new Error(`${file}: needs a "comments" array`);
  return comments.map((c, i) => {
    const f = c as Partial<PooledFinding> | null;
    if (!f || typeof f.path !== "string" || typeof f.body !== "string" || !(f.line === null || (typeof f.line === "number" && Number.isInteger(f.line))))
      throw new Error(`${file}: comment ${i + 1} needs string "path" and "body" and an integer or null "line"`);
    return { path: f.path, line: f.line, body: f.body };
  });
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pr: { type: "string" },
      findings: { type: "string" },
      repo: { type: "string" },
      head: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      reasoning: { type: "string", default: "on" },
    },
  });
  if (!values.pr || !values.findings || !values.repo || !values.head || !values.out || !["on", "off"].includes(values.reasoning!)) {
    console.error(USAGE);
    return 1;
  }
  const input = readInput(values.pr);
  const pool = readPool(values.findings);
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    console.error("NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  const ledger = new SpendLedger(path.join(STATE_DIR, "spend.jsonl"));
  const budget = new Budget(capsFromEnv(), ledger.totalUSD());
  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL,
    prices: loadPriceTable(path.join(WORKSPACE_ROOT, "config/prices.json")),
    budget,
    ledger,
    cache: new ResponseCache(path.join(STATE_DIR, "cache")),
    timeoutMs: 600_000,
  });
  const opts = { model: values.model!, reasoning: values.reasoning as "on" | "off" };

  const r = await reviewMissed(client, input, pool, { source: gitSource(values.repo, values.head), head: values.head }, opts);
  mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  writeFileSync(values.out, JSON.stringify(r, null, 1) + "\n");
  const v = r.review;
  console.error(
    `[review-missed] ${path.basename(values.pr)}: chunks ${v.chunks.length} · pool ${v.pool} · listed ${v.context.map((c) => c.listed).join("/")} · ` +
      `context chars ${v.context.map((c) => c.chars).join("/")} · CHUNK_FAILED ${v.chunkFailed} · findings ${v.findings} · kept ${r.comments.length} · ` +
      `dropped ${JSON.stringify(v.dropped)} · calls ${v.usage.calls} · $${v.usage.costUSD.toFixed(4)} · ${(v.wallMs / 1000).toFixed(0)} s`,
  );
  console.log(
    JSON.stringify({
      model: opts.model,
      reasoning: opts.reasoning,
      chunks: v.chunks.length,
      chunkFailed: v.chunkFailed,
      pool: v.pool,
      findings: v.findings,
      comments: r.comments.length,
      dropped: v.dropped,
      calls: v.usage.calls,
      cached: v.usage.cached,
      inputTokens: v.usage.inputTokens,
      outputTokens: v.usage.outputTokens,
      costUSD: v.usage.costUSD,
      ledgerBeforeUSD: budget.spentBeforeRun,
      runSpentUSD: budget.runSpent,
    }),
  );
  return 0;
}
