// Evaluation runner (decision 046):
//   node packages/analyzer/src/harness/evaluate.ts --tasks <dir> [--arms on,off] [--repeats 1]
//        [--kind <kind>] [--out <dir>] [--concurrency 1] [--max-spend-usd <usd>]
//        [--reasoning on|off] [--decider lexical|nemotron]
// Every (task, arm, repeat) is one `tracehound repair --agent nemotron` process: the same code path,
// budget caps and ledger as a single run, a fresh client (and per-process cap) per run. Writes
// <out>/results.json and <out>/results.md, and keeps each run record under <out>/runs/.
// The tasks directory may be outside this repo. No significance claims: every total has its n.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { SpendLedger } from "../llm/ledger.ts";
import { cleanGitEnv } from "../git-env.ts";
import type { LoopTrace } from "./loop.ts";
import type { RunRecord } from "./run.ts";
import { loadTask } from "./task.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const BIN = path.resolve(import.meta.dirname, "../bin.ts");
const LEDGER = path.join(WORKSPACE_ROOT, ".tracehound", "spend.jsonl");
export const USAGE =
  "usage: node packages/analyzer/src/harness/evaluate.ts --tasks <dir> [--arms on,off] [--repeats 1] [--kind <kind>] [--out <dir>] [--concurrency 1] [--max-spend-usd <usd>] [--reasoning on|off] [--decider lexical|nemotron]";

export type Arm = "on" | "off";
export interface Job {
  taskId: string;
  taskFile: string;
  kind?: string;
  arm: Arm;
  repeat: number;
  /** the task's per-run cost limit: reserved against --max-spend-usd while the run is in flight */
  costLimitUSD: number;
}

export interface ResultRow {
  taskId: string;
  kind?: string;
  arm: Arm;
  repeat: number;
  state: string; // RESOLVED | UNRESOLVED | FAILED | CANCELLED | NOT_RUN
  reason?: string;
  steps?: number;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  wallMs?: number;
  /** base files the agent read (decision 034: feature 7 metrics use baseFilesRead only) */
  filesOpened?: number;
  graphToolCalls?: number;
  packetInjected?: boolean;
  packetChars?: number;
  runFile?: string;
}

/** A directory of task directories (each with task.json), or one task directory. Sorted by id. */
export function discoverTasks(dir: string, kind?: string): { taskId: string; taskFile: string; kind?: string; costLimitUSD: number }[] {
  const abs = path.resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`tasks directory ${abs} does not exist`);
  const files = existsSync(path.join(abs, "task.json"))
    ? [path.join(abs, "task.json")]
    : readdirSync(abs)
        .map((d) => path.join(abs, d, "task.json"))
        .filter((f) => existsSync(f));
  const tasks = files.map((taskFile) => {
    const { spec } = loadTask(taskFile); // validates the spec, the repro, the seed and the profile
    return { taskId: spec.id, taskFile, ...(spec.kind && { kind: spec.kind }), costLimitUSD: spec.limits.costUSD };
  });
  const picked = kind ? tasks.filter((t) => t.kind === kind) : tasks;
  if (!picked.length) throw new Error(`no task.json under ${abs}${kind ? ` with kind "${kind}"` : ""}`);
  return picked.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

/** Task-major order: every arm of a task's repeat r before the next repeat, then the next task. */
export function planJobs(tasks: ReturnType<typeof discoverTasks>, arms: Arm[], repeats: number): Job[] {
  return tasks.flatMap((t) => Array.from({ length: repeats }, (_, i) => arms.map((arm) => ({ ...t, arm, repeat: i + 1 }))).flat());
}

/** One run record → one row of the table. */
export function rowFromRecord(job: Job, record: RunRecord, runFile?: string): ResultRow {
  const trace = record.agentRun?.trace as Partial<LoopTrace> | undefined;
  return {
    taskId: job.taskId,
    ...(job.kind && { kind: job.kind }),
    arm: job.arm,
    repeat: job.repeat,
    state: record.finalState ?? "FAILED",
    ...(record.reason && { reason: record.reason }),
    steps: record.agentRun?.steps ?? 0,
    tokens: record.usage.tokens,
    inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens,
    costUSD: record.usage.costUSD,
    ...(record.endedAt && { wallMs: Date.parse(record.endedAt) - Date.parse(record.startedAt) }),
    filesOpened: trace?.baseFilesRead?.length ?? 0,
    graphToolCalls: record.arm?.graphToolCalls ?? trace?.graphCalls?.length ?? 0,
    packetInjected: record.arm?.packetInjected ?? false,
    ...(record.arm?.packetChars !== undefined && { packetChars: record.arm.packetChars }),
    ...(runFile && { runFile }),
  };
}

export interface ArmTotal {
  arm: Arm;
  /** runs with a record (NOT_RUN rows are counted separately) */
  n: number;
  notRun: number;
  resolved: number;
  unresolved: number;
  failed: number;
  steps: number;
  tokens: number;
  costUSD: number;
  wallMs: number;
  filesOpened: number;
  graphToolCalls: number;
}

export function armTotals(rows: ResultRow[], arms: Arm[]): ArmTotal[] {
  return arms.map((arm) => {
    const all = rows.filter((r) => r.arm === arm);
    const ran = all.filter((r) => r.state !== "NOT_RUN");
    const sum = (k: keyof ResultRow) => ran.reduce((n, r) => n + ((r[k] as number | undefined) ?? 0), 0);
    return {
      arm,
      n: ran.length,
      notRun: all.length - ran.length,
      resolved: ran.filter((r) => r.state === "RESOLVED").length,
      unresolved: ran.filter((r) => r.state === "UNRESOLVED").length,
      failed: ran.filter((r) => r.state !== "RESOLVED" && r.state !== "UNRESOLVED").length,
      steps: sum("steps"),
      tokens: sum("tokens"),
      costUSD: sum("costUSD"),
      wallMs: sum("wallMs"),
      filesOpened: sum("filesOpened"),
      graphToolCalls: sum("graphToolCalls"),
    };
  });
}

const s = (ms?: number) => (ms === undefined ? "—" : `${Math.round(ms / 1000)} s`);
const usd = (x?: number) => (x === undefined ? "—" : `$${x.toFixed(5)}`);
const num = (x?: number) => (x === undefined ? "—" : String(x));
const mean = (total: number, n: number, f: (x: number) => string) => (n ? f(total / n) : "—");
const armName = (a: Arm) => `graph-${a}`;

export function markdownTable(rows: ResultRow[], totals: ArmTotal[], meta: { tasksDir: string; repeats: number; generatedAt: string }): string {
  const out: string[] = [];
  out.push(`# Evaluation results`, "");
  out.push(`Tasks: \`${meta.tasksDir}\` · arms: ${totals.map((t) => armName(t.arm)).join(", ")} · repeats: ${meta.repeats} · ${meta.generatedAt}`, "");
  out.push("| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |");
  out.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows)
    out.push(`| ${r.taskId} | ${armName(r.arm)} | ${r.repeat} | ${r.state} | ${num(r.steps)} | ${num(r.tokens)} | ${usd(r.costUSD)} | ${s(r.wallMs)} | ${num(r.filesOpened)} | ${num(r.graphToolCalls)} |`);
  out.push("", "## Per arm (totals; n = runs with a record)", "");
  out.push("| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const t of totals) {
    const n = `n = ${t.n}`;
    out.push(
      `| ${armName(t.arm)} | ${t.n}${t.notRun ? ` (+${t.notRun} not run)` : ""} | ${t.resolved} of ${t.n} | ${t.unresolved} of ${t.n} | ${t.failed} of ${t.n} | ${t.steps} (${mean(t.steps, t.n, (x) => x.toFixed(1))}; ${n}) | ${t.tokens} (${mean(t.tokens, t.n, (x) => String(Math.round(x)))}; ${n}) | ${usd(t.costUSD)} (${mean(t.costUSD, t.n, usd)}; ${n}) | ${s(t.wallMs)} (${mean(t.wallMs, t.n, s)}; ${n}) | ${t.filesOpened} (${mean(t.filesOpened, t.n, (x) => x.toFixed(1))}; ${n}) | ${t.graphToolCalls} (${n}) |`,
    );
  }
  out.push("", "Counts and sums over the runs above, with the sample size beside each. No significance test was run and none is implied.");
  return out.join("\n") + "\n";
}

/** Runs one job; returns its record (and file) or why there is none. */
export type Execute = (job: Job) => Promise<{ record?: RunRecord; runFile?: string; error?: string }>;

/** Spawns `tracehound repair` for one job and reads the record it wrote (its stdout names the file). */
export function spawnRepair(opts: { runsDir: string; reasoning: string; decider: string }): Execute {
  return (job) =>
    new Promise((resolve) => {
      const args = [BIN, "repair", "--task", job.taskFile, "--agent", "nemotron", "--graph", job.arm, "--reasoning", opts.reasoning, "--decider", opts.decider, "--provider", "docker", "--runs-dir", opts.runsDir];
      const child = spawn(process.execPath, args, { cwd: WORKSPACE_ROOT, stdio: ["ignore", "pipe", "pipe"], env: cleanGitEnv() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (code) => {
        const m = /^→ (.+\.json)$/m.exec(stdout);
        if (!m) return resolve({ error: `repair exited ${code} without a record: ${(stderr.trim().split("\n").at(-1) ?? "").slice(0, 300)}` });
        const runFile = path.resolve(WORKSPACE_ROOT, m[1]!);
        try {
          resolve({ record: JSON.parse(readFileSync(runFile, "utf8")) as RunRecord, runFile });
        } catch (error) {
          resolve({ error: `could not read ${runFile}: ${(error as Error).message}` });
        }
      });
    });
}

/**
 * Runs every job (at most `concurrency` at a time). Before a job starts, the spend since the
 * runner started plus the cost limits of the runs in flight and of this one must stay within
 * `maxSpendUSD`; otherwise it and every later job are NOT_RUN.
 */
export async function runJobs(
  jobs: Job[],
  execute: Execute,
  opts: { concurrency?: number; maxSpendUSD?: number; spentUSD?: () => number; onRow?: (row: ResultRow, done: number) => void } = {},
): Promise<ResultRow[]> {
  const rows: ResultRow[] = new Array(jobs.length);
  const start = opts.spentUSD?.() ?? 0;
  let inFlightReserve = 0;
  let stopped: string | undefined;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      const job = jobs[i]!;
      if (!stopped && opts.maxSpendUSD !== undefined && opts.spentUSD) {
        const spent = opts.spentUSD() - start;
        if (spent + inFlightReserve + job.costLimitUSD > opts.maxSpendUSD + 1e-9) stopped = `spend cap: $${spent.toFixed(5)} spent + $${(inFlightReserve + job.costLimitUSD).toFixed(2)} reserved > $${opts.maxSpendUSD}`;
      }
      if (stopped) {
        rows[i] = { taskId: job.taskId, ...(job.kind && { kind: job.kind }), arm: job.arm, repeat: job.repeat, state: "NOT_RUN", reason: stopped };
      } else {
        inFlightReserve += job.costLimitUSD;
        const r = await execute(job);
        inFlightReserve -= job.costLimitUSD;
        rows[i] = r.record ? rowFromRecord(job, r.record, r.runFile) : { taskId: job.taskId, ...(job.kind && { kind: job.kind }), arm: job.arm, repeat: job.repeat, state: "FAILED", reason: r.error ?? "no record" };
      }
      opts.onRow?.(rows[i]!, ++done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));
  return rows;
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      tasks: { type: "string" },
      arms: { type: "string", default: "on,off" },
      repeats: { type: "string", default: "1" },
      kind: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string", default: "1" },
      "max-spend-usd": { type: "string" },
      reasoning: { type: "string", default: "on" },
      decider: { type: "string", default: "lexical" },
    },
  });
  const fail = (msg: string) => (console.error(`✖ ${msg}\n${USAGE}`), 3);
  if (!values.tasks) return fail("--tasks is required");
  const arms = values.arms!.split(",").map((a) => a.trim());
  if (!arms.length || arms.some((a) => a !== "on" && a !== "off") || new Set(arms).size !== arms.length) return fail("--arms must be on, off or on,off");
  const repeats = Number(values.repeats);
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(repeats) || repeats < 1) return fail("--repeats must be a positive integer");
  if (!Number.isInteger(concurrency) || concurrency < 1) return fail("--concurrency must be a positive integer");
  const maxSpendUSD = values["max-spend-usd"] === undefined ? undefined : Number(values["max-spend-usd"]);
  if (maxSpendUSD !== undefined && !(maxSpendUSD > 0)) return fail("--max-spend-usd must be a positive number");
  if (!["on", "off"].includes(values.reasoning!) || !["lexical", "nemotron"].includes(values.decider!)) return fail("--reasoning on|off, --decider lexical|nemotron");

  const tasks = discoverTasks(values.tasks, values.kind);
  const jobs = planJobs(tasks, arms as Arm[], repeats);
  const out = path.resolve(values.out ?? path.join(WORKSPACE_ROOT, "runs", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`));
  const runsDir = path.join(out, "runs");
  mkdirSync(runsDir, { recursive: true });
  const ledger = new SpendLedger(LEDGER);
  const ledgerBefore = ledger.totalUSD();
  console.error(`[evaluate] ${tasks.length} task(s) × ${arms.length} arm(s) × ${repeats} repeat(s) = ${jobs.length} run(s), concurrency ${concurrency} → ${out}`);
  const startedAt = new Date().toISOString();
  const rows = await runJobs(jobs, spawnRepair({ runsDir, reasoning: values.reasoning!, decider: values.decider! }), {
    concurrency,
    ...(maxSpendUSD !== undefined && { maxSpendUSD }),
    spentUSD: () => ledger.totalUSD(),
    onRow: (r, done) => console.error(`[evaluate] ${done}/${jobs.length} ${r.taskId} graph-${r.arm} #${r.repeat}: ${r.state}${r.reason ? ` · ${r.reason.slice(0, 160)}` : ""}`),
  });
  const totals = armTotals(rows, arms as Arm[]);
  const ledgerAfter = ledger.totalUSD();
  const results = {
    generatedAt: new Date().toISOString(),
    startedAt,
    tasksDir: path.resolve(values.tasks),
    arms,
    repeats,
    kind: values.kind ?? null,
    settings: { agent: "nemotron", reasoning: values.reasoning, decider: values.decider, concurrency, maxSpendUSD: maxSpendUSD ?? null },
    ledger: { beforeUSD: ledgerBefore, afterUSD: ledgerAfter, spentUSD: ledgerAfter - ledgerBefore },
    rows: rows.map((r) => ({ ...r, ...(r.runFile && { runFile: path.relative(out, r.runFile) }) })),
    totals,
    note: "Counts and sums only; n is given with every total. No significance test was run.",
  };
  writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
  const md = markdownTable(rows, totals, { tasksDir: values.tasks, repeats, generatedAt: results.generatedAt });
  writeFileSync(path.join(out, "results.md"), md);
  console.log(md);
  console.log(`ledger: $${ledgerBefore.toFixed(5)} → $${ledgerAfter.toFixed(5)} (+$${(ledgerAfter - ledgerBefore).toFixed(5)})`);
  console.log(`→ ${path.relative(process.cwd(), path.join(out, "results.json"))}, ${path.relative(process.cwd(), path.join(out, "results.md"))}`);
  return rows.some((r) => r.state === "NOT_RUN" || r.state === "FAILED" || r.state === "CANCELLED") ? 2 : 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
