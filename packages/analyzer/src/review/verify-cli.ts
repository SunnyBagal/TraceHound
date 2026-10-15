// tracehound verify run --review <file> --pr <file> --out <file> --filtered <file> [--threshold n]
// tracehound verify run --reviews <dir> --prs <dir> --out <dir> --filtered <dir> [--threshold n]
//                       [--model <id>] [--reasoning on|off] [--concurrency 4] [--summary <file>]
// tracehound verify filter --verified <file|dir> --threshold <n> --out <file|dir>     (no model call)
// Decision 056, verify-v1. `run` reads review files in the neutral format (decision 054) and the
// same pull requests' inputs ({title, body | description, diff}; matched by file name in --prs),
// writes every finding with its confidence to --out and the findings kept at the threshold to
// --filtered. stdout gets counts only, never finding text or reasons.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { PullReview } from "../bench/types.ts";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import type { PullInput } from "./review.ts";
import { filterAtThreshold, VERIFY_MODEL, VERIFY_THRESHOLD, verifyReview, type VerifiedReview } from "./verify.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound verify run (--review <file> --pr <file> | --reviews <dir> --prs <dir>) --out <file|dir> --filtered <file|dir> [--threshold <1-5>] [--model <id>] [--reasoning on|off] [--concurrency <n>] [--summary <file>]\n" +
  "       tracehound verify filter --verified <file|dir> --threshold <1-5> --out <file|dir>";

const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

function parseThreshold(s: string | undefined): number | null {
  const t = Number(s);
  return Number.isInteger(t) && t >= 1 && t <= 5 ? t : null;
}

export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "run") return run(rest);
  if (sub === "filter") return filter(rest);
  console.error(USAGE);
  return 1;
}

function filter(argv: string[]): number {
  const { values } = parseArgs({ args: argv, options: { verified: { type: "string" }, threshold: { type: "string" }, out: { type: "string" } } });
  const threshold = parseThreshold(values.threshold);
  if (!values.verified || !values.out || threshold === null) {
    console.error(USAGE);
    return 1;
  }
  const dir = statSync(values.verified).isDirectory();
  const jobs = dir
    ? readdirSync(values.verified).filter((f) => f.endsWith(".json")).sort(byName).map((f) => ({ src: path.join(values.verified!, f), out: path.join(values.out!, f) }))
    : [{ src: values.verified, out: values.out }];
  let findings = 0;
  let kept = 0;
  let keptFailed = 0;
  for (const j of jobs) {
    const v = JSON.parse(readFileSync(j.src, "utf8")) as VerifiedReview;
    const f = filterAtThreshold(v, threshold);
    PullReview.parse(f); // the scorer must still read it
    mkdirSync(path.dirname(path.resolve(j.out)), { recursive: true });
    writeFileSync(j.out, JSON.stringify(f, null, 1) + "\n");
    findings += v.comments.length;
    kept += f.comments.length;
    keptFailed += f.verify.keptVerifyFailed;
  }
  console.log(JSON.stringify({ threshold, pulls: jobs.length, findings, kept, removed: findings - kept, keptVerifyFailed: keptFailed }));
  return 0;
}

async function run(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      review: { type: "string" },
      pr: { type: "string" },
      reviews: { type: "string" },
      prs: { type: "string" },
      out: { type: "string" },
      filtered: { type: "string" },
      threshold: { type: "string", default: String(VERIFY_THRESHOLD) },
      model: { type: "string", default: VERIFY_MODEL },
      reasoning: { type: "string", default: "on" },
      concurrency: { type: "string", default: "4" },
      summary: { type: "string" },
    },
  });
  const single = !!values.review && !!values.pr && !values.reviews && !values.prs;
  const batch = !!values.reviews && !!values.prs && !values.review && !values.pr;
  const threshold = parseThreshold(values.threshold);
  if (!values.out || !values.filtered || (!single && !batch) || threshold === null || !["on", "off"].includes(values.reasoning!)) {
    console.error(USAGE);
    return 1;
  }
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    console.error("NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  const jobs: { review: string; pr: string; out: string; filtered: string; name: string }[] = single
    ? [{ review: values.review!, pr: values.pr!, out: values.out, filtered: values.filtered, name: path.basename(values.review!) }]
    : readdirSync(values.reviews!)
        .filter((f) => f.endsWith(".json"))
        .sort(byName)
        .map((f) => ({ review: path.join(values.reviews!, f), pr: path.join(values.prs!, f), out: path.join(values.out!, f), filtered: path.join(values.filtered!, f), name: f }));
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

  const results: VerifiedReview[] = [];
  for (const j of jobs) {
    const review = PullReview.parse(JSON.parse(readFileSync(j.review, "utf8")));
    const v = await verifyReview(client, readInput(j.pr), review, opts);
    const f = filterAtThreshold(v, threshold);
    for (const [file, data] of [[j.out, v], [j.filtered, f]] as const) {
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
    }
    results.push(v);
    const r = v.verify;
    console.error(
      `[verify] ${j.name}: findings ${r.findings} · VERIFY_FAILED ${r.verifyFailed} · by confidence ${JSON.stringify(r.byConfidence)} · kept at ${threshold} ${f.comments.length} · ` +
        `calls ${r.usage.calls} · $${r.usage.costUSD.toFixed(4)} · ${(r.wallMs / 1000).toFixed(0)} s`,
    );
  }

  const all = results.flatMap((v) => v.comments);
  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => all.reduce((s, c) => s + c.usage[k], 0);
  const byConfidence = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const c of all) if (c.confidence !== null) byConfidence[String(c.confidence) as keyof typeof byConfidence]++;
  const summary = {
    model: opts.model,
    reasoning: opts.reasoning,
    threshold,
    pulls: results.length,
    findings: all.length,
    verifyFailed: all.filter((c) => c.status === "VERIFY_FAILED").length,
    partialDiffs: all.filter((c) => c.partial).length,
    byConfidence,
    calls: sum("calls"),
    cached: sum("cached"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    costUSD: sum("costUSD"),
    ledgerBeforeUSD: budget.spentBeforeRun,
    runSpentUSD: budget.runSpent,
  };
  if (values.summary) {
    mkdirSync(path.dirname(path.resolve(values.summary)), { recursive: true });
    writeFileSync(values.summary, JSON.stringify(summary, null, 1) + "\n");
  }
  console.log(JSON.stringify(summary));
  return 0;
}
