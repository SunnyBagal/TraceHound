// tracehound verify-evidence --review <file> --pr <file> --head <sha> --repo <git dir> --out <file> --kept <file>
// tracehound verify-evidence --reviews <dir> --prs <dir> --heads <file> --repo <git dir> --out <dir> --kept <dir>
//                            [--model <id>] [--reasoning on|off] [--concurrency 4] [--summary <file>]
// Decision 065, verify-evidence-v1. Inputs as verify-ctx (decision 058): review files in the neutral
// format, the same pull requests' inputs matched by file name in --prs, --heads mapping a file name
// without ".json" to {head}. Writes every finding with its verdict, evidence and context record to
// --out, and the kept findings with their evidence, as `tracehound gate` input, to --kept. stdout
// gets counts only, never finding text, quotes, scenarios or context text. It loads the workspace
// .env for NEBIUS_API_KEY itself.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { PullReview } from "../bench/types.ts";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import { gitSource } from "./context.ts";
import type { PullInput } from "./review.ts";
import { gateReview, VERIFY_EVIDENCE_MODEL, verifyReviewWithEvidence, type EvidenceVerifiedReview } from "./verify-evidence.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound verify-evidence (--review <file> --pr <file> --head <sha> | --reviews <dir> --prs <dir> --heads <file>) --repo <git dir> --out <file|dir> --kept <file|dir> [--model <id>] [--reasoning on|off] [--concurrency <n>] [--summary <file>]";

const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function readInput(file: string): PullInput {
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
      review: { type: "string" },
      pr: { type: "string" },
      head: { type: "string" },
      reviews: { type: "string" },
      prs: { type: "string" },
      heads: { type: "string" },
      repo: { type: "string" },
      out: { type: "string" },
      kept: { type: "string" },
      model: { type: "string", default: VERIFY_EVIDENCE_MODEL },
      reasoning: { type: "string", default: "on" },
      concurrency: { type: "string", default: "4" },
      summary: { type: "string" },
    },
  });
  const single = !!values.review && !!values.pr && !!values.head && !values.reviews && !values.prs;
  const batch = !!values.reviews && !!values.prs && !!values.heads && !values.review && !values.pr;
  if (!values.out || !values.repo || !values.kept || (!single && !batch) || !["on", "off"].includes(values.reasoning!)) {
    console.error(USAGE);
    return 1;
  }
  const heads = values.heads ? (JSON.parse(readFileSync(values.heads, "utf8")) as Record<string, { head: string }>) : {};
  const jobs: { review: string; pr: string; out: string; kept: string; name: string; head: string }[] = single
    ? [{ review: values.review!, pr: values.pr!, out: values.out, kept: values.kept, name: path.basename(values.review!), head: values.head! }]
    : readdirSync(values.reviews!)
        .filter((f) => f.endsWith(".json"))
        .sort(byName)
        .map((f) => {
          const head = heads[f.replace(/\.json$/, "")]?.head;
          if (!head) throw new Error(`--heads has no head for ${f}`);
          return { review: path.join(values.reviews!, f), pr: path.join(values.prs!, f), out: path.join(values.out!, f), kept: path.join(values.kept!, f), name: f, head };
        });
  for (const j of jobs) {
    if (!existsSync(j.pr)) {
      console.error(`no pull request input for ${j.name}: ${j.pr}`);
      return 1;
    }
    const review = PullReview.parse(JSON.parse(readFileSync(j.review, "utf8")));
    if (review.pr_title !== readInput(j.pr).title) {
      console.error(`${j.name}: the review's pr_title differs from the pull request input's title`);
      return 1;
    }
  }
  const write = (file: string, data: unknown) => {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  };

  const envFile = path.join(WORKSPACE_ROOT, ".env");
  if (existsSync(envFile) && !process.env.NEBIUS_API_KEY) process.loadEnvFile(envFile);
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
  const opts = { model: values.model!, reasoning: values.reasoning as "on" | "off", concurrency: Math.max(1, Number(values.concurrency)) };

  const results: EvidenceVerifiedReview[] = [];
  for (const j of jobs) {
    const review = PullReview.parse(JSON.parse(readFileSync(j.review, "utf8")));
    const v = await verifyReviewWithEvidence(client, readInput(j.pr), review, { source: gitSource(values.repo, j.head), head: j.head }, opts);
    write(j.out, v);
    write(j.kept, gateReview(v));
    results.push(v);
    const r = v.verify;
    console.error(
      `[verify-evidence] ${j.name}: findings ${r.findings} · kept ${r.kept} · dropped ${r.dropped} · VERIFY_FAILED ${r.verifyFailed} · retried ${r.retried} · ` +
        `calls ${r.usage.calls} · $${r.usage.costUSD.toFixed(4)} · ${(r.wallMs / 1000).toFixed(0)} s`,
    );
  }

  const all = results.flatMap((v) => v.comments);
  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => all.reduce((s, c) => s + c.usage[k], 0);
  const lat = all.filter((c) => c.usage.calls > c.usage.cached).map((c) => c.usage.latencyMs);
  const summary = {
    model: opts.model,
    reasoning: opts.reasoning,
    pulls: results.length,
    findings: all.length,
    kept: results.reduce((s, v) => s + v.verify.kept, 0),
    dropped: results.reduce((s, v) => s + v.verify.dropped, 0),
    verifyFailed: results.reduce((s, v) => s + v.verify.verifyFailed, 0),
    retried: results.reduce((s, v) => s + v.verify.retried, 0),
    calls: sum("calls"),
    cached: sum("cached"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    costUSD: sum("costUSD"),
    latencyMsPerFinding: { n: lat.length, median: median(lat), max: Math.max(0, ...lat) },
    ledgerBeforeUSD: budget.spentBeforeRun,
    runSpentUSD: budget.runSpent,
  };
  if (values.summary) write(values.summary, summary);
  console.log(JSON.stringify(summary));
  return 0;
}
