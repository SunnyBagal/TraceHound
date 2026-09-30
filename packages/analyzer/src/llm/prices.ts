import { readFileSync } from "node:fs";
import { z } from "zod";

const Price = z.object({ inputPer1M: z.number().nonnegative(), outputPer1M: z.number().nonnegative() });

export const PriceTable = z.object({
  _readme: z.string().optional(),
  placeholderFallback: Price,
  models: z.record(
    z.string(),
    z.object({ inputPer1M: z.number().nonnegative().nullable(), outputPer1M: z.number().nonnegative().nullable(), placeholder: z.boolean().default(false) }),
  ),
});
export type PriceTable = z.infer<typeof PriceTable>;

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  /** true when the table has no real price for this model and the conservative fallback is used */
  estimated: boolean;
}

export function loadPriceTable(file: string): PriceTable {
  return PriceTable.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Real price when known; otherwise the table's deliberately high fallback, never zero. */
export function priceFor(table: PriceTable, model: string): ModelPrice {
  const entry = table.models[model];
  if (entry && !entry.placeholder && entry.inputPer1M !== null && entry.outputPer1M !== null) {
    return { inputPer1M: entry.inputPer1M, outputPer1M: entry.outputPer1M, estimated: false };
  }
  return { ...table.placeholderFallback, estimated: true };
}

export function costUSD(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.inputPer1M + outputTokens * price.outputPer1M) / 1_000_000;
}

/** Upper-bound token count for a prompt: ~3 chars/token (English/JSON is ~4) plus per-message overhead. */
export function estimateInputTokens(messages: { content: string | null; tool_calls?: unknown }[], tools?: unknown): number {
  const chars = (m: { content: string | null; tool_calls?: unknown }) => (m.content ?? "").length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0);
  return messages.reduce((n, m) => n + Math.ceil(chars(m) / 3) + 8, 0) + (tools ? Math.ceil(JSON.stringify(tools).length / 3) : 0);
}
