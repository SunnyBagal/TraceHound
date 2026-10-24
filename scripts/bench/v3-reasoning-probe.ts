// Decision 070, before the dev runs: does Token Factory honour a reasoning budget for each recall-v3
// model? One lens A request on one small dev pull request per model and per variant: reasoning on with
// no budget (the baseline), chat_template_kwargs.reasoning_budget = 256, and reasoning_effort "low".
// A budget is honoured when its reasoning stays near 256 tokens while the baseline's does not. Prints
// counts only (reasoning and output tokens, characters, finish reason), never reply text.
//   TRACEHOUND_BUDGET_TOTAL_USD=60 node scripts/bench/v3-reasoning-probe.ts [--pr discourse/4] [--bench <dir>]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Budget, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { TokenFactoryClient, type ChatRequest } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import { parseDiff, renderChunk } from "../../packages/analyzer/src/review/diff.ts";
import { prepareChunks } from "../../packages/analyzer/src/review/recall/chunk.ts";
import { LENS_A_SYSTEM_PROMPT, recallUserMessage } from "../../packages/analyzer/src/review/recall/prompts.ts";
import { MAX_TOKENS, TEMPERATURE, TOP_P } from "../../packages/analyzer/src/review/recall/run.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const pr = arg("--pr") ?? "discourse/4";
if (/cal_dot_com/.test(pr)) throw new Error("dev pull requests only");
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
try {
  if (!process.env.NEBIUS_API_KEY) process.loadEnvFile(join(ROOT, ".env"));
} catch {}
const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");

const input = JSON.parse(readFileSync(join(bench, "prs", `${pr}.json`), "utf8")) as { title: string; body?: string; diff: string };
const files = parseDiff(input.diff);
const chunk = prepareChunks(files).chunks[0]!;
const messages = [
  { role: "system" as const, content: LENS_A_SYSTEM_PROMPT },
  { role: "user" as const, content: recallUserMessage({ title: input.title, description: input.body ?? "", changedFiles: files.map((f) => f.path), renderedChunk: renderChunk(chunk.text), part: 1, parts: 1 }) },
];
const ledger = new SpendLedger(join(ROOT, ".tracehound/spend.jsonl"));
const client = new TokenFactoryClient({
  apiKey,
  baseUrl: process.env.NEBIUS_BASE_URL,
  prices: loadPriceTable(join(ROOT, "config/prices.json")),
  budget: new Budget(capsFromEnv(), ledger.totalUSD()),
  ledger,
  readCache: false,
  timeoutMs: 600_000,
});

const MODELS = ["nvidia/nemotron-3-super-120b-a12b", "nvidia/Nemotron-3.5-Super-VL"];
const VARIANTS: [string, Record<string, unknown>][] = [
  ["baseline (enable_thinking)", { chat_template_kwargs: { enable_thinking: true } }],
  ["chat_template_kwargs.reasoning_budget=256", { chat_template_kwargs: { enable_thinking: true, reasoning_budget: 256 } }],
  ["reasoning_effort=low", { chat_template_kwargs: { enable_thinking: true }, reasoning_effort: "low" }],
];
console.log(`probe on ${pr}: ${files.length} files, chunk ${chunk.text.length} chars`);
for (const model of MODELS) {
  for (const [name, extra] of VARIANTS) {
    const request = { model, temperature: TEMPERATURE, top_p: TOP_P, max_tokens: MAX_TOKENS, messages, ...extra } as ChatRequest;
    try {
      const r = await client.chat(request, { purpose: "review-recall-probe" });
      console.log(`${model} · ${name}: finish ${r.finishReason} · out ${r.outputTokens} tokens · reasoning tokens ${r.reasoningTokens ?? "not reported"} · reasoning chars ${r.reasoningChars ?? "none"} · content chars ${r.content.length} · $${r.costUSD.toFixed(4)} · ${(r.latencyMs / 1000).toFixed(1)} s`);
    } catch (e) {
      console.log(`${model} · ${name}: ERROR ${(e as Error).message.split("\n")[0]!.slice(0, 300)}`);
    }
  }
}
