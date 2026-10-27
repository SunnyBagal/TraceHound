// tracehound review --pr <file> --out <file>            one pull request
// tracehound review --prs <dir> --out <dir>             every <dir>/*.json, one review file each
//                   [--model <id>] [--reasoning on|off] [--concurrency 2] [--summary <file>]
// Decision 055, review-diff-v1. Input files: {title, body | description, diff, number?}. Output: the
// neutral review format of decision 054 ({pr_title, pr_number, comments, review}). stdout gets
// counts only, never comment text.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "../naming/llm.ts";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import { DROP_REASONS, reviewPull, type PullInput, type ReviewOutput } from "./review.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound review (--pr <file> | --prs <dir>) --out <file|dir> [--model <id>] [--reasoning on|off] [--concurrency <n>] [--summary <file>] [--retry-on-length append|fresh] [--parser strict|lenient]";

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pr: { type: "string" },
      prs: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      reasoning: { type: "string", default: "on" },
      concurrency: { type: "string", default: "2" },
      summary: { type: "string" },
      "retry-on-length": { type: "string", default: "append" },
      parser: { type: "string", default: "strict" },
    },
  });
  if (!values.out || !!values.pr === !!values.prs || !["on", "off"].includes(values.reasoning!)) {
    console.error(USAGE);
    return 1;
  }
  if (!["append", "fresh"].includes(values["retry-on-length"]!) || !["strict", "lenient"].includes(values.parser!)) {
    console.error(USAGE);
    return 1;
  }
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
    timeoutMs: 600_000, // a reasoning model over a 60,000-character chunk can take minutes
  });
  const opts = {
    model: values.model!,
    reasoning: values.reasoning as "on" | "off",
    ...(values["retry-on-length"] === "fresh" && { retryOnLength: "fresh" as const }),
    ...(values.parser === "lenient" && { parser: "lenient" as const }),
  };

  const jobs: { input: PullInput; out: string; name: string }[] = values.pr
    ? [{ input: readInput(values.pr), out: values.out, name: path.basename(values.pr) }]
    : readdirSync(values.prs!)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((f) => ({ input: readInput(path.join(values.prs!, f)), out: path.join(values.out!, f), name: f }));
  if (values.prs) mkdirSync(values.out, { recursive: true });

  const results: { name: string; r: ReviewOutput }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const r = await reviewPull(client, job.input, opts);
      mkdirSync(path.dirname(path.resolve(job.out)), { recursive: true });
      writeFileSync(job.out, JSON.stringify(r, null, 1) + "\n");
      results.push({ name: job.name, r });
      const v = r.review;
      console.error(
        `[review] ${job.name}: chunks ${v.chunks.length} · CHUNK_FAILED ${v.chunkFailed} · findings ${v.findings} · kept ${r.comments.length} · ` +
          `dropped ${JSON.stringify(v.dropped)} · calls ${v.usage.calls} · $${v.usage.costUSD.toFixed(4)} · ${(v.wallMs / 1000).toFixed(0)} s`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));

  results.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const sum = (f: (r: ReviewOutput) => number) => results.reduce((s, x) => s + f(x.r), 0);
  const dropped = Object.fromEntries(DROP_REASONS.map((k) => [k, sum((r) => r.review.dropped[k])]));
  const summary = {
    model: opts.model,
    reasoning: opts.reasoning,
    pulls: results.length,
    chunks: sum((r) => r.review.chunks.length),
    overLimitChunks: sum((r) => r.review.chunks.filter((c) => c.overLimit).length),
    chunkFailed: sum((r) => r.review.chunkFailed),
    findings: sum((r) => r.review.findings),
    comments: sum((r) => r.comments.length),
    emptyPulls: results.filter((x) => !x.r.comments.length).length,
    dropped,
    calls: sum((r) => r.review.usage.calls),
    cached: sum((r) => r.review.usage.cached),
    inputTokens: sum((r) => r.review.usage.inputTokens),
    outputTokens: sum((r) => r.review.usage.outputTokens),
    costUSD: sum((r) => r.review.usage.costUSD),
    wallMsPerPull: results.map((x) => ({ file: x.name, ms: x.r.review.wallMs })),
    ledgerBeforeUSD: budget.spentBeforeRun,
    runSpentUSD: budget.runSpent,
  };
  if (values.summary) {
    mkdirSync(path.dirname(path.resolve(values.summary)), { recursive: true });
    writeFileSync(values.summary, JSON.stringify(summary, null, 1) + "\n");
  }
  const { wallMsPerPull: _w, ...counts } = summary;
  console.log(JSON.stringify(counts));
  return 0;
}
