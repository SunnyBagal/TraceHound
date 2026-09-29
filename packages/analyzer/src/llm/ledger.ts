import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const SpendEntry = z.object({
  timestamp: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estCostUSD: z.number().nonnegative(),
  purpose: z.string(),
  // extra context (not required by readers)
  componentId: z.string().optional(),
  ok: z.boolean().optional(),
  usageReported: z.boolean().optional(), // false → tokens are our pre-call upper-bound estimate
  priceEstimated: z.boolean().optional(), // true → placeholder price, cost is a conservative estimate
});
export type SpendEntry = z.infer<typeof SpendEntry>;

/** Append-only JSONL ledger of every real (non-cached) model call. */
export class SpendLedger {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  entries(): SpendEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => SpendEntry.parse(JSON.parse(line)));
  }

  totalUSD(): number {
    return this.entries().reduce((sum, e) => sum + e.estCostUSD, 0);
  }

  append(entry: SpendEntry): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(SpendEntry.parse(entry)) + "\n");
  }
}

export interface SpendSummaryRow {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export function summarize(entries: SpendEntry[], by: "model" | "purpose"): SpendSummaryRow[] {
  const rows = new Map<string, SpendSummaryRow>();
  for (const e of entries) {
    const key = e[by];
    const row = rows.get(key) ?? { key, calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
    row.calls++;
    row.inputTokens += e.inputTokens;
    row.outputTokens += e.outputTokens;
    row.costUSD += e.estCostUSD;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.costUSD - a.costUSD);
}
