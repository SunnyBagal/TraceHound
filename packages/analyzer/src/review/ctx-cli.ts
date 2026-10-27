// tracehound review-ctx --pr <file> --repo <git dir> --head <sha> --out <file>          one pull request
// tracehound review-ctx --prs <dir> --repo <git dir> --heads <file> --out <dir>         every <dir>/*.json
//                       [--model <id>] [--reasoning on|off] [--concurrency 2] [--summary <file>]
//                       [--context-only]
// Decision 057, review-ctx-v1. Inputs as review-diff-v1's ({title, body | description, diff,
// number?}); --heads maps an input's file name without ".json" to {head} (scripts/bench/fetch-repos.ts
// writes it). --context-only builds the context records and writes them to --out without any model
// call or API key. stdout gets counts only, never comment or context text.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "../naming/llm.ts";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import { buildChunkContext, gitSource } from "./context.ts";
import { chunkDiff, parseDiff } from "./diff.ts";
import { reviewPullWithContext, type ReviewCtxOutput } from "./review-ctx.ts";
import { DROP_REASONS, type PullInput } from "./review.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound review-ctx (--pr <file> --head <sha> | --prs <dir> --heads <file>) --repo <git dir> --out <file|dir> [--model <id>] [--reasoning on|off] [--concurrency <n>] [--summary <file>] [--context-only] [--retry-on-length append|fresh] [--parser strict|lenient]";

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pr: { type: "string" },
      prs: { type: "string" },
      repo: { type: "string" },
      head: { type: "string" },
      heads: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      reasoning: { type: "string", default: "on" },
      concurrency: { type: "string", default: "2" },
      summary: { type: "string" },
      "retry-on-length": { type: "string", default: "append" },
      parser: { type: "string", default: "strict" },
      "context-only": { type: "boolean", default: false },
    },
  });
  if (!values.out || !values.repo || !!values.pr === !!values.prs || (values.pr && !values.head) || (values.prs && !values.heads) || !["on", "off"].includes(values.reasoning!)) {
    console.error(USAGE);
    return 1;
  }
  const heads = values.heads ? (JSON.parse(readFileSync(values.heads, "utf8")) as Record<string, { head: string }>) : {};
  const jobs: { input: PullInput; out: string; name: string; head: string }[] = values.pr
    ? [{ input: readInput(values.pr), out: values.out, name: path.basename(values.pr), head: values.head! }]
    : readdirSync(values.prs!)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((f) => {
          const head = heads[f.replace(/\.json$/, "")]?.head;
          if (!head) throw new Error(`--heads has no head for ${f}`);
          return { input: readInput(path.join(values.prs!, f)), out: path.join(values.out!, f), name: f, head };
        });
  if (values.prs) mkdirSync(values.out, { recursive: true });

  if (values["context-only"]) {
    const perChunk: { chars: number; refs: number; cut: boolean }[] = [];
    for (const job of jobs) {
      const source = gitSource(values.repo, job.head);
      const records = chunkDiff(parseDiff(job.input.diff)).map((c, i) => ({ chunk: i, ...buildChunkContext(source, c.text).record }));
      writeFileSync(job.out, JSON.stringify({ head: job.head, context: records }, null, 1) + "\n");
      for (const r of records) perChunk.push({ chars: r.chars, refs: r.references.shown, cut: r.cut.references + r.cut.filesToWindows + r.cut.filesDropped > 0 });
    }
    console.log(
      JSON.stringify({
        pulls: jobs.length,
        chunks: perChunk.length,
        charsMedian: median(perChunk.map((c) => c.chars)),
        charsMax: Math.max(0, ...perChunk.map((c) => c.chars)),
        refsMedian: median(perChunk.map((c) => c.refs)),
        chunksCut: perChunk.filter((c) => c.cut).length,
      }),
    );
    return 0;
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
    timeoutMs: 600_000,
  });
  const opts = {
    model: values.model!,
    reasoning: values.reasoning as "on" | "off",
    ...(values["retry-on-length"] === "fresh" && { retryOnLength: "fresh" as const }),
    ...(values.parser === "lenient" && { parser: "lenient" as const }),
  };

  const results: { name: string; r: ReviewCtxOutput }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const r = await reviewPullWithContext(client, job.input, { source: gitSource(values.repo!, job.head), head: job.head }, opts);
      mkdirSync(path.dirname(path.resolve(job.out)), { recursive: true });
      writeFileSync(job.out, JSON.stringify(r, null, 1) + "\n");
      results.push({ name: job.name, r });
      const v = r.review;
      console.error(
        `[review-ctx] ${job.name}: chunks ${v.chunks.length} · context chars ${v.context.map((c) => c.chars).join("/")} · CHUNK_FAILED ${v.chunkFailed} · findings ${v.findings} · ` +
          `kept ${r.comments.length} · dropped ${JSON.stringify(v.dropped)} · calls ${v.usage.calls} · $${v.usage.costUSD.toFixed(4)} · ${(v.wallMs / 1000).toFixed(0)} s`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));

  results.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const sum = (f: (r: ReviewCtxOutput) => number) => results.reduce((s, x) => s + f(x.r), 0);
  const summary = {
    model: opts.model,
    reasoning: opts.reasoning,
    pulls: results.length,
    chunks: sum((r) => r.review.chunks.length),
    chunkFailed: sum((r) => r.review.chunkFailed),
    findings: sum((r) => r.review.findings),
    comments: sum((r) => r.comments.length),
    dropped: Object.fromEntries(DROP_REASONS.map((k) => [k, sum((r) => r.review.dropped[k])])),
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
