// `pnpm spend`: totals from .tracehound/spend.jsonl by model and purpose.
import path from "node:path";
import { capsFromEnv } from "./llm/budget.ts";
import { SpendLedger, summarize, type SpendSummaryRow } from "./llm/ledger.ts";

const ledger = new SpendLedger(path.resolve(import.meta.dirname, "../../../.tracehound/spend.jsonl"));
const entries = ledger.entries();
const caps = capsFromEnv();

const table = (title: string, rows: SpendSummaryRow[]) => {
  console.log(`\nBy ${title}`);
  console.log(`  ${"".padEnd(44)} ${"calls".padStart(5)} ${"in tok".padStart(9)} ${"out tok".padStart(9)} ${"est. USD".padStart(10)}`);
  for (const r of rows) {
    console.log(`  ${r.key.padEnd(44)} ${String(r.calls).padStart(5)} ${String(r.inputTokens).padStart(9)} ${String(r.outputTokens).padStart(9)} ${("$" + r.costUSD.toFixed(5)).padStart(10)}`);
  }
};

const total = entries.reduce((n, e) => n + e.estCostUSD, 0);
console.log(`Ledger: ${path.relative(process.cwd(), ledger.file)} · ${entries.length} real calls (cache hits are free and not listed)`);
if (entries.length) {
  table("model", summarize(entries, "model"));
  table("purpose", summarize(entries, "purpose"));
  const estimated = entries.filter((e) => e.priceEstimated).length;
  if (estimated) console.log(`\nNote: ${estimated} call(s) priced with the placeholder fallback in config/prices.json; real cost is likely lower.`);
}
console.log(`\nTotal est. spend: $${total.toFixed(5)} of $${caps.totalUSD} cap (remaining $${(caps.totalUSD - total).toFixed(5)})`);
