// tracehound bench validity --fps <file> --prs <dir> --model <id> --reasoning on|off --out <file outside the repo> [--concurrency 4]
// Decision 060, validity-v1. --fps is {"items": FpItem[]} (the deduplicated bench-judge-v1 FPs);
// --prs is the folder holding <repo>/<golden index>.json inputs ({title, body | description, diff}).
// --out gets every verdict with its reason, so it must be outside this repo; an existing --out from
// the same model, reasoning and prompt is resumed (keys already judged are skipped). A budget stop
// writes what is done with "completed": false and exits 2. stdout gets counts only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Budget, BudgetExceededError, capsFromEnv } from "../llm/budget.ts";
import { ResponseCache } from "../llm/cache.ts";
import { TokenFactoryClient } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { loadPriceTable } from "../llm/prices.ts";
import type { PullInput } from "../review/review.ts";
import { judgeValidity, validityMeta, VERDICTS, type FpItem, type ValidityResult } from "./validity.ts";

const USAGE = "usage: tracehound bench validity --fps <file> --prs <dir> --model <id> --reasoning on|off --out <file outside the repo> [--concurrency <n>]";
const BLIND = "cal_dot_com";

export interface ValidityFile {
  version: string;
  promptSha256: string;
  model: string;
  reasoning: "on" | "off";
  completed: boolean;
  items: number;
  results: ValidityResult[];
}

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff };
}

export async function validityMain(argv: string[], env: { workspaceRoot: string; stateDir: string }): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      fps: { type: "string" },
      prs: { type: "string" },
      model: { type: "string" },
      reasoning: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "4" },
    },
  });
  if (!values.fps || !values.prs || !values.model || !values.out || !["on", "off"].includes(values.reasoning ?? "")) {
    console.error(USAGE);
    return 1;
  }
  if (!path.relative(env.workspaceRoot, path.resolve(values.out)).startsWith("..")) {
    console.error(`--out must be outside ${env.workspaceRoot}: it holds comment text and reasons`);
    return 1;
  }
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    console.error("NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  const reasoning = values.reasoning as "on" | "off";
  const items = (JSON.parse(readFileSync(values.fps, "utf8")) as { items: FpItem[] }).items;
  if (items.some((i) => i.repo === BLIND)) {
    console.error(`refusing: ${BLIND} is the test set`);
    return 1;
  }
  const header = { ...validityMeta, model: values.model, reasoning };
  const done = new Map<string, ValidityResult>();
  if (existsSync(values.out)) {
    const prev = JSON.parse(readFileSync(values.out, "utf8")) as ValidityFile;
    if (prev.promptSha256 !== header.promptSha256 || prev.model !== header.model || prev.reasoning !== header.reasoning) {
      console.error(`${values.out} exists from another model, reasoning or prompt; refusing to overwrite`);
      return 1;
    }
    for (const r of prev.results) done.set(r.key, r);
  }

  const ledger = new SpendLedger(path.join(env.stateDir, "spend.jsonl"));
  const budget = new Budget(capsFromEnv(), ledger.totalUSD());
  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: process.env.NEBIUS_BASE_URL,
    prices: loadPriceTable(path.join(env.workspaceRoot, "config/prices.json")),
    budget,
    ledger,
    cache: new ResponseCache(path.join(env.stateDir, "cache")),
    timeoutMs: 300_000,
  });
  const inputs = new Map<string, PullInput>();
  const inputFor = (i: FpItem) => {
    const k = `${i.repo}/${i.goldenIndex}`;
    if (!inputs.has(k)) inputs.set(k, readInput(path.join(values.prs!, i.repo, `${i.goldenIndex}.json`)));
    return inputs.get(k)!;
  };
  const todo = items.filter((i) => !done.has(i.key));
  const write = (completed: boolean) => {
    const results = items.flatMap((i) => (done.has(i.key) ? [done.get(i.key)!] : []));
    const file: ValidityFile = { ...header, completed, items: items.length, results };
    mkdirSync(path.dirname(path.resolve(values.out!)), { recursive: true });
    writeFileSync(values.out!, JSON.stringify(file, null, 1) + "\n");
  };

  let stopped = null as string | null; // set by the workers
  let next = 0;
  let n = 0;
  const worker = async () => {
    while (next < todo.length && !stopped) {
      const item = todo[next++]!;
      try {
        done.set(item.key, await judgeValidity(client, { model: values.model!, reasoning }, inputFor(item), item));
      } catch (err) {
        if (err instanceof BudgetExceededError) stopped = err.message;
        else throw err;
      }
      if (++n % 20 === 0) {
        write(false);
        console.error(`[validity] ${values.model}: ${done.size}/${items.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));
  const completed = !stopped && items.every((i) => done.has(i.key));
  write(completed);

  const rs = [...done.values()];
  const count = (f: (r: ValidityResult) => boolean) => rs.filter(f).length;
  const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => rs.reduce((s, r) => s + r.usage[k], 0);
  console.log(
    JSON.stringify({
      model: values.model,
      reasoning,
      completed,
      items: items.length,
      judged: rs.length,
      verdicts: Object.fromEntries(VERDICTS.map((v) => [v, count((r) => r.verdict === v)])),
      status: { answered: count((r) => r.status === "answered"), invalidReply: count((r) => r.status === "invalid-reply"), noDiff: count((r) => r.status === "no-diff"), failed: count((r) => r.status === "failed") },
      retried: count((r) => r.attempts > 1),
      usage: { calls: sum("calls"), cached: sum("cached"), inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), costUSD: Number(sum("costUSD").toFixed(4)) },
      ...(stopped && { stopped: "budget" }),
    }),
  );
  return completed ? 0 : 2;
}
