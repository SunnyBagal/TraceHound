import { appendFile, readFile } from "node:fs/promises";
import { SpendEntry } from "../../analyzer/src/llm/ledger.ts";

/** Model-calling stages of the Action, in pipeline order. */
export const STAGES = ["diff reviewer", "ctx reviewer", "verifier", "fixes"] as const;
export type Stage = (typeof STAGES)[number];

/** The usage record each stage already writes (review.usage, verify.usage) or the fix client returns. */
export interface StageUsage { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number }
const FIELDS = ["calls", "cached", "inputTokens", "outputTokens", "costUSD"] as const;
const zero = (): StageUsage => ({ calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 });

/** A stage's usage record, or null when the value is not one (a malformed record is never summed). */
export function readUsage(value: unknown): StageUsage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!FIELDS.every(k => typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0)) return null;
  return Object.fromEntries(FIELDS.map(k => [k, v[k]])) as unknown as StageUsage;
}

/** Collects every stage record the run produced, including stages that later failed validation. */
export class UsageRecorder {
  readonly stages = new Map<Stage, StageUsage>();
  /** Records that were present but not a usage record (counted, never summed). */
  unreadable = 0;
  /** The last "TraceHound:" log line (the action's and the pipeline's), the summary's outcome. */
  outcome = "";

  /** A log function that also keeps the outcome line; cli.ts gives it to the action and to runPipeline. */
  logger = (log: (message: string) => void) => (message: string): void => {
    if (message.startsWith("TraceHound:")) this.outcome = message;
    log(message);
  };

  add = (stage: Stage, value: unknown): void => {
    const usage = readUsage(value);
    if (!usage) { this.unreadable++; return; }
    const sum = this.stages.get(stage) ?? zero();
    for (const k of FIELDS) sum[k] += usage[k];
    this.stages.set(stage, sum);
  };
}

type ChatLike = { content: string; cached?: boolean; inputTokens?: number; outputTokens?: number; costUSD?: number };
/** Wraps a fix client so each answered call is recorded under "fixes". A call that throws is not in any stage
 * record; its ledger charge shows as unattributed in the summary. */
export function recordingClient<R extends ChatLike, A extends unknown[]>(
  client: { chat(...args: A): Promise<R> }, recorder: UsageRecorder, stage: Stage,
): { chat(...args: A): Promise<R> } {
  return {
    chat: async (...args: A) => {
      const r = await client.chat(...args);
      recorder.add(stage, { calls: 1, cached: r.cached ? 1 : 0, inputTokens: r.inputTokens ?? 0,
        outputTokens: r.outputTokens ?? 0, costUSD: r.costUSD ?? 0 });
      return r;
    },
  };
}

/** The spend ledger's line count now; entries after it belong to this run. */
export async function ledgerMark(file: string): Promise<number> {
  try { return (await readFile(file, "utf8")).split("\n").filter(l => l.trim()).length; } catch { return 0; }
}

/** Every real (non-cached) call ledgered after `mark`: failed and partial stages included. */
export async function ledgerSince(file: string, mark: number): Promise<StageUsage | null> {
  let text: string;
  try { text = await readFile(file, "utf8"); } catch { return mark === 0 ? zero() : null; }
  const sum = zero();
  try {
    for (const line of text.split("\n").filter(l => l.trim()).slice(mark)) {
      const e = SpendEntry.parse(JSON.parse(line));
      sum.calls++;
      sum.inputTokens += e.inputTokens;
      sum.outputTokens += e.outputTokens;
      sum.costUSD += e.estCostUSD;
    }
  } catch { return null; }
  return sum;
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const int = (n: number) => n.toLocaleString("en-US");

/** Markdown for $GITHUB_STEP_SUMMARY: per-stage calls, tokens and estimated $, the total, and the ledger check. */
export function formatUsageSummary(recorder: UsageRecorder, ledger: StageUsage | null, outcome: string): string {
  const rows = ["| stage | calls | cached | input tokens | output tokens | est. $ |", "|---|---:|---:|---:|---:|---:|"];
  const total = zero();
  for (const stage of STAGES) {
    const u = recorder.stages.get(stage);
    if (!u) { rows.push(`| ${stage} | - | - | - | - | - |`); continue; }
    for (const k of FIELDS) total[k] += u[k];
    rows.push(`| ${stage} | ${u.calls} | ${u.cached} | ${int(u.inputTokens)} | ${int(u.outputTokens)} | ${usd(u.costUSD)} |`);
  }
  rows.push(`| **total** | **${total.calls}** | **${total.cached}** | **${int(total.inputTokens)}** | **${int(total.outputTokens)}** | **${usd(total.costUSD)}** |`);
  const lines = ["### TraceHound model usage", "", `Outcome: ${outcome.replace(/\s+/g, " ").trim()}`, "", ...rows, ""];
  lines.push("Est. $ = tokens × config/prices.json rates, as the client charged them to the spend ledger; cache hits cost $0. "
    + "\"-\" means the stage wrote no usage record (not run, or failed before writing it).");
  if (ledger) {
    const gap = ledger.costUSD - total.costUSD;
    lines.push("", `Spend ledger, this run (every real call, failed ones included): ${ledger.calls} calls, `
      + `${int(ledger.inputTokens)} input / ${int(ledger.outputTokens)} output tokens, ${usd(ledger.costUSD)}.`);
    if (Math.abs(gap) > 1e-9) {
      lines.push("", gap > 0
        ? `Unattributed: ${usd(gap)} charged in the ledger but in no stage record (a call or stage failed before writing its usage).`
        : `Mismatch: the stage records sum to ${usd(-gap)} more than the ledger.`);
    }
  } else {
    lines.push("", "Spend ledger: unreadable, so failed calls are not shown.");
  }
  if (recorder.unreadable) lines.push("", `${recorder.unreadable} stage usage record(s) were malformed and are not summed.`);
  return lines.join("\n") + "\n";
}

export async function writeUsageSummary(file: string, markdown: string): Promise<void> {
  await appendFile(file, markdown);
}
