// Decision 070, step 4: one dev run of recall-v3 for one arm, then both judges. Dev repos only, never
// Cal.com. One pull request at a time, reviewer cache reads off (every request is sent), records in
// <bench>/reviews/dev-v3/<arm>/<repo>/<n>.json (the neutral format plus the `review` record), a
// status file <arm>/status.json after every pull request, and the run refuses an existing arm
// directory. It stops at once on a global budget refusal. stdout gets counts only.
//   TRACEHOUND_BUDGET_TOTAL_USD=60 TRACEHOUND_BUDGET_RUN_USD=<allowance> node scripts/bench/run-v3-dev.ts run --arm S|V [--bench <dir>]
//   node scripts/bench/run-v3-dev.ts score --arm S|V [--bench <dir>]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { JUDGE_SYSTEM_PROMPT, JUDGE_VERSION, LlmJudge } from "../../packages/analyzer/src/bench/judge.ts";
import { loadReviews, metrics, scoreRepo } from "../../packages/analyzer/src/bench/score.ts";
import { GoldenFile } from "../../packages/analyzer/src/bench/types.ts";
import { Budget, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { TokenFactoryClient } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable, priceFor } from "../../packages/analyzer/src/llm/prices.ts";
import { gitSource } from "../../packages/analyzer/src/review/context.ts";
import { readInput, summaryLine } from "../../packages/analyzer/src/review/recall/cli.ts";
import { reviewRecall, type RecallOutput } from "../../packages/analyzer/src/review/recall/run.ts";
import { JUDGES } from "./run-test-set.ts";
import { DEV_REPOS, inputPaths } from "./test-set.ts";

export const ARMS = Object.freeze({ S: "nvidia/nemotron-3-super-120b-a12b", V: "nvidia/Nemotron-3.5-Super-VL" } as const);
type Arm = keyof typeof ARMS;
const ROOT = resolve(import.meta.dirname, "../..");
const STATE_DIR = join(ROOT, ".tracehound");

/** A failure that is a request error for the stop rule: an HTTP status or a global budget refusal. */
export const isRequestError = (s: string | undefined) => !!s && (/HTTP [45]\d\d/.test(s) || /global budget|BudgetExceededError|TRACEHOUND_BUDGET_(TOTAL|RUN)_USD/.test(s));

export function requestErrors(r: RecallOutput): string[] {
  return [...r.review.calls.map((c) => c.failure), r.review.missed.failure, ...r.review.errors].filter(isRequestError) as string[];
}

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

async function run(arm: Arm, bench: string) {
  const model = ARMS[arm];
  const dir = join(bench, "reviews/dev-v3", arm);
  mkdirSync(join(bench, "reviews/dev-v3"), { recursive: true });
  mkdirSync(dir); // not recursive: refuses an existing arm directory
  const ledger = new SpendLedger(join(STATE_DIR, "spend.jsonl"));
  const prices = loadPriceTable(join(ROOT, "config/prices.json"));
  const budget = new Budget(capsFromEnv(), ledger.totalUSD());
  const client = new TokenFactoryClient({ apiKey: process.env.NEBIUS_API_KEY!, baseUrl: process.env.NEBIUS_BASE_URL, prices, budget, ledger, cache: new ResponseCache(join(STATE_DIR, "cache")), readCache: false, timeoutMs: 600_000 });
  const jobs = DEV_REPOS.flatMap((repo) => {
    const p = inputPaths(bench, "dev", repo);
    const heads = JSON.parse(readFileSync(p.heads, "utf8")) as Record<string, { head: string }>;
    return readdirSync(p.prs).filter((f) => f.endsWith(".json")).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((file) => ({ repo, file, prs: p.prs, gitDir: p.gitDir, head: heads[file.replace(/\.json$/, "")]!.head }));
  });
  const status = { decision: "070", arm, model, status: "running", startedAt: new Date().toISOString(), finishedAt: null as string | null, ledgerBeforeUSD: budget.spentBeforeRun, total: jobs.length, done: 0, zeroFindings: 0, requestErrors: [] as string[], costUSD: 0, error: null as string | null };
  const save = () => writeFileSync(join(dir, "status.json"), JSON.stringify(status, null, 1) + "\n");
  save();
  for (const job of jobs) {
    const input = readInput(join(job.prs, job.file));
    const r = await reviewRecall(client, input, { model, price: priceFor(prices, model), repo: { source: gitSource(job.gitDir, job.head), head: job.head } });
    mkdirSync(join(dir, job.repo), { recursive: true });
    writeFileSync(join(dir, job.repo, job.file), JSON.stringify(r, null, 1) + "\n", { flag: "wx" });
    status.done++;
    if (!r.comments.length) status.zeroFindings++;
    for (const e of requestErrors(r)) status.requestErrors.push(`${job.repo}/${job.file}: ${e.slice(0, 200)}`);
    status.costUSD = budget.runSpent;
    save();
    console.log(summaryLine(`${job.repo}/${job.file}`, r));
    if (r.review.errors.some((e) => /global budget/.test(e))) {
      status.status = "stopped-at-cap";
      status.error = "global budget refusal";
      break;
    }
  }
  if (status.status === "running") status.status = "complete";
  status.finishedAt = new Date().toISOString();
  save();
  console.log(`arm ${arm}: ${status.status} · ${status.done}/${status.total} · zero findings ${status.zeroFindings} · request errors ${status.requestErrors.length} · $${status.costUSD.toFixed(4)}`);
}

async function score(arm: Arm, bench: string) {
  const dir = join(bench, "reviews/dev-v3", arm);
  const ledger = new SpendLedger(join(STATE_DIR, "spend.jsonl"));
  const judgeClient = new TokenFactoryClient({ apiKey: process.env.NEBIUS_API_KEY!, baseUrl: process.env.NEBIUS_BASE_URL, prices: loadPriceTable(join(ROOT, "config/prices.json")), budget: new Budget(capsFromEnv(), ledger.totalUSD()), ledger, cache: new ResponseCache(join(STATE_DIR, "cache")), readCache: true, timeoutMs: 300_000 });
  for (const j of JUDGES) {
    for (const repo of DEV_REPOS) {
      const golden = GoldenFile.parse(JSON.parse(readFileSync(inputPaths(bench, "dev", repo).golden, "utf8")));
      const lj = new LlmJudge(judgeClient, { model: j.model, reasoning: j.reasoning });
      const result = await scoreRepo({ golden, reviews: loadReviews(join(dir, repo)), judges: [lj], concurrency: 4 });
      const meta = { label: `recall-v3/${arm}/${repo}`, judgeVersion: JUDGE_VERSION, judges: [lj.name], reasoning: j.reasoning, promptSha256: (await import("node:crypto")).createHash("sha256").update(JUDGE_SYSTEM_PROMPT).digest("hex") };
      const base = join(dir, "scores", j.id, repo);
      mkdirSync(join(dir, "scores", j.id), { recursive: true });
      writeFileSync(`${base}.detail.json`, JSON.stringify({ ...meta, ...result }, null, 1) + "\n", { flag: "wx" });
      const { detail: _d, ...countsOnly } = result;
      writeFileSync(`${base}.summary.json`, JSON.stringify({ ...meta, ...countsOnly, metrics: metrics(result.counts) }, null, 1) + "\n", { flag: "wx" });
      console.log(`${arm} ${j.id} ${repo}: ${JSON.stringify(result.counts)} · JUDGE_FAILED ${result.pulls.judgeFailed} · judge $${result.usage.costUSD.toFixed(4)}`);
    }
  }
}

if (import.meta.main) {
  try {
    if (!process.env.NEBIUS_API_KEY) process.loadEnvFile(join(ROOT, ".env"));
  } catch {}
  const [command] = process.argv.slice(2);
  const arm = arg("--arm") as Arm;
  if (!(arm in ARMS) || !["run", "score"].includes(command!)) throw new Error("usage: run-v3-dev.ts run|score --arm S|V [--bench <dir>]");
  if (!process.env.NEBIUS_API_KEY) throw new Error("NEBIUS_API_KEY is not set");
  const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
  await (command === "run" ? run(arm, bench) : score(arm, bench));
  process.exit(0);
}
