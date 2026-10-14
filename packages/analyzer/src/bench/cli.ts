// tracehound bench convert --recorded <dir> --tool <name> --out <dir>
// tracehound bench score --golden <file> --reviews <dir> --detail <file outside the repo>
//                        [--summary <file>] [--model <id>] [--concurrency 4] [--label <text>]
// Decision 054. stdout gets counts only; per-comment detail (comment text, which tool comment
// matched which golden comment) goes only to --detail, which must be outside this repo.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Budget, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import { convertRecorded } from "./convert.ts";
import { JUDGE_SYSTEM_PROMPT, JUDGE_VERSION, LlmJudge, SUPER_MODEL } from "./judge.ts";
import { formatCounts, loadReviews, metrics, scoreRepo } from "./score.ts";
import { GoldenFile } from "./types.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const USAGE =
  "usage: tracehound bench convert --recorded <dir> --tool <name> --out <dir>\n" +
  "       tracehound bench score --golden <file> --reviews <dir> --detail <file outside the repo> [--summary <file>] [--model <id>] [--concurrency <n>] [--label <text>]";

const insideRepo = (p: string) => !path.relative(WORKSPACE_ROOT, path.resolve(p)).startsWith("..");

export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "convert") return convert(rest);
  if (sub === "score") return score(rest);
  console.error(USAGE);
  return 1;
}

function convert(argv: string[]): number {
  const { values } = parseArgs({ args: argv, options: { recorded: { type: "string" }, tool: { type: "string" }, out: { type: "string" } } });
  if (!values.recorded || !values.tool || !values.out) {
    console.error(USAGE);
    return 1;
  }
  const r = convertRecorded(values.recorded, values.out, values.tool);
  console.log(JSON.stringify(r));
  return 0;
}

async function score(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      golden: { type: "string" },
      reviews: { type: "string" },
      detail: { type: "string" },
      summary: { type: "string" },
      model: { type: "string", default: SUPER_MODEL },
      concurrency: { type: "string", default: "4" },
      label: { type: "string" },
    },
  });
  if (!values.golden || !values.reviews || !values.detail) {
    console.error(USAGE);
    return 1;
  }
  if (insideRepo(values.detail)) {
    console.error(`--detail must be outside ${WORKSPACE_ROOT}: it holds comment text from the dataset`);
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
    timeoutMs: 300_000, // a reasoning judge over ten long comments can take minutes
  });
  const judges = [new LlmJudge(client, { model: values.model })];
  const golden = GoldenFile.parse(JSON.parse(readFileSync(values.golden, "utf8")));
  const reviews = loadReviews(values.reviews);
  const label = values.label ?? path.basename(values.reviews);
  const result = await scoreRepo({
    golden,
    reviews,
    judges,
    concurrency: Number(values.concurrency),
    onPull: (done, total) => console.error(`[bench] ${label}: ${done}/${total} pull requests judged`),
  });

  const promptSha256 = createHash("sha256").update(JUDGE_SYSTEM_PROMPT).digest("hex");
  const meta = { label, judgeVersion: JUDGE_VERSION, judges: judges.map((j) => j.name), promptSha256, ledgerBeforeUSD: budget.spentBeforeRun, runSpentUSD: budget.runSpent };
  mkdirSync(path.dirname(path.resolve(values.detail)), { recursive: true });
  writeFileSync(values.detail, JSON.stringify({ ...meta, ...result }, null, 1) + "\n");
  const { detail: _detail, ...countsOnly } = result;
  const summary = { ...meta, ...countsOnly, metrics: metrics(result.counts) };
  if (values.summary) {
    mkdirSync(path.dirname(path.resolve(values.summary)), { recursive: true });
    writeFileSync(values.summary, JSON.stringify(summary, null, 1) + "\n");
  }
  const m = result.mapping;
  console.log(`${label}: review files ${m.reviewFiles} · mapped ${m.matched} · unmatched reviews ${m.unmatchedReviews} · unmatched golden ${m.unmatchedGolden} · duplicate-title reviews ${m.duplicateReviews}`);
  console.log(`${label}: scored ${result.pulls.scored} · JUDGE_FAILED ${result.pulls.judgeFailed}`);
  console.log(`${label}: ${formatCounts(result.counts)}`);
  console.log(`${label}: judge calls ${result.usage.calls} (cached ${result.usage.cached}) · in ${result.usage.inputTokens} · out ${result.usage.outputTokens} tokens · $${result.usage.costUSD.toFixed(4)}`);
  return 0;
}
