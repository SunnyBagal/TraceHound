import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { analyzeRepo } from "./analyze.ts";
import { Budget, BudgetExceededError, capsFromEnv } from "./llm/budget.ts";
import { ResponseCache } from "./llm/cache.ts";
import { TokenFactoryClient } from "./llm/client.ts";
import { SpendLedger } from "./llm/ledger.ts";
import { closestModel } from "./llm/models.ts";
import { loadPriceTable, priceFor } from "./llm/prices.ts";
import { readManifest, upsertManifest, writeManifest } from "./manifest.ts";
import { DEFAULT_MODEL, formatCall, nameComponentsWithLlm, NO_REASONING } from "./naming/llm.ts";
import { Snapshot } from "./schema.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../..");
const STATE_DIR = path.join(WORKSPACE_ROOT, ".tracehound");
const LEDGER_FILE = path.join(STATE_DIR, "spend.jsonl");
const PRICES_FILE = path.join(WORKSPACE_ROOT, "config/prices.json");

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    config: { type: "string" },
    out: { type: "string", default: "snapshots" },
    naming: { type: "string", default: "llm" }, // "llm" (falls back per component) | "heuristic"
    model: { type: "string" }, // default Nano; Super/Ultra only when passed explicitly
    "no-cache": { type: "boolean", default: false },
    reasoning: { type: "string", default: "off" }, // naming: "off" (enable_thinking=false) | "on" (model default)
  },
});
if (!values.repo || !["llm", "heuristic"].includes(values.naming!)) {
  console.error("usage: node src/cli.ts --repo <path> [--config <tracehound.json>] [--naming llm|heuristic] [--model <id>] [--no-cache] [--out <dir>]");
  process.exit(1);
}

const fail = (message: string): never => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const started = performance.now();
let snapshot = analyzeRepo(values.repo, { configPath: values.config });

const apiKey = process.env.NEBIUS_API_KEY;
if (values.naming === "llm" && apiKey) {
  const model = values.model ?? DEFAULT_MODEL;
  if (values.model && values.model !== DEFAULT_MODEL) console.error(`[naming] ⚠ non-default model ${model} requested explicitly`);

  const prices = loadPriceTable(PRICES_FILE);
  const ledger = new SpendLedger(LEDGER_FILE);
  const caps = capsFromEnv();
  const budget = new Budget(caps, ledger.totalUSD());
  const price = priceFor(prices, model);
  console.error(
    `[budget] spent so far $${budget.spentBeforeRun.toFixed(4)} · caps: run $${caps.runUSD}, total $${caps.totalUSD} · ${model} priced ` +
      (price.estimated
        ? `CONSERVATIVELY (placeholder → $${price.inputPer1M}/$${price.outputPer1M} per 1M in/out)`
        : `$${price.inputPer1M}/$${price.outputPer1M} per 1M in/out`),
  );

  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL,
    prices,
    budget,
    ledger,
    cache: new ResponseCache(path.join(STATE_DIR, "cache")),
    readCache: !values["no-cache"],
  });

  // Free preflight: make sure the model id resolves before spending anything.
  const available = await client.listModels().catch((error: Error) => fail(`could not list models: ${error.message}`));
  if (!available.includes(model)) {
    const suggestion = closestModel(model, available);
    fail(
      `model id "${model}" is not in GET /models (${available.length} models).` +
        (suggestion ? ` Did you mean "${suggestion.id}"? (${suggestion.reason})` : ` Available: ${available.join(", ")}`),
    );
  }
  console.error(`[naming] model ${model} resolved via GET /models`);

  try {
    const reasoning = values.reasoning === "on" ? {} : NO_REASONING;
    console.error(`[naming] reasoning ${values.reasoning === "on" ? "on (model default)" : "off (chat_template_kwargs.enable_thinking=false)"}`);
    snapshot = Snapshot.parse(await nameComponentsWithLlm(snapshot, { client, model, reasoning, log: (call) => console.error(formatCall(call)) }));
  } catch (error) {
    if (error instanceof BudgetExceededError) fail(`budget guard: ${error.message}. No snapshot written.`);
    throw error;
  }
  console.error(`[budget] this run ~$${budget.runSpent.toFixed(5)} · total now ~$${(budget.spentBeforeRun + budget.runSpent).toFixed(5)} of $${caps.totalUSD}`);
} else if (values.naming === "llm") {
  console.error("[naming] NEBIUS_API_KEY not set; using heuristic names");
}

const outDir = path.resolve(values.out!);
const relFile = `${snapshot.repo.commitSha}/${snapshot.analyzerVersion}.json`;
const file = path.join(outDir, relFile);
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
const manifestFile = writeManifest(
  outDir,
  upsertManifest(readManifest(outDir), {
    repo: snapshot.repo.name,
    sha: snapshot.repo.commitSha,
    analyzerVersion: snapshot.analyzerVersion,
    path: relFile,
    createdAt: snapshot.generatedAt,
  }),
);

const ms = Math.round(performance.now() - started);
console.log(`${snapshot.repo.name}@${snapshot.repo.commitSha.slice(0, 7)} · analyzer ${snapshot.analyzerVersion} · ${ms}ms`);
console.log(`${snapshot.files.length} files · ${snapshot.components.length} components · ${snapshot.edges.length} edges · ${snapshot.evidence.length} evidence · ${snapshot.warnings.length} warnings`);
if (snapshot.llmCalls.length) {
  const named = snapshot.components.filter((c) => c.naming.source === "llm").length;
  const tokens = snapshot.llmCalls.reduce((n, c) => n + (c.totalTokens ?? 0), 0);
  const cost = snapshot.llmCalls.reduce((n, c) => n + c.estCostUSD, 0);
  const cached = snapshot.llmCalls.filter((c) => c.cached).length;
  console.log(`naming: ${named}/${snapshot.llmCalls.length} named by ${snapshot.llmCalls[0]!.model} · ${tokens} tokens · ${cached} cached · ~$${cost.toFixed(5)}`);
}
console.log(`→ ${path.relative(process.cwd(), file)}`);
console.log(`→ ${path.relative(process.cwd(), manifestFile)} (latest)`);
