// `pnpm spend`: provider-separated totals; Anthropic's dev-only ledger never changes the Nebius hard stop.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capsFromEnv } from "./llm/budget.ts";
import { SpendLedger, summarize, type SpendSummaryRow } from "./llm/ledger.ts";

export function formatSpendReport(stateDir = path.resolve(import.meta.dirname, "../../../.tracehound"), env: NodeJS.ProcessEnv = process.env): string {
  const nebius = new SpendLedger(path.join(stateDir, "spend.jsonl")).entries();
  const anthropic = new SpendLedger(path.join(stateDir, "spend.anthropic.jsonl")).entries();
  const entries = [...nebius, ...anthropic];
  const caps = capsFromEnv(env);
  const lines = [`Ledgers: ${path.relative(process.cwd(), stateDir)}/{spend,spend.anthropic}.jsonl · ${entries.length} real calls (cache hits are free and not listed)`];
  const table = (title: string, rows: SpendSummaryRow[]) => {
    lines.push(`\nBy ${title}`, `  ${"".padEnd(44)} ${"calls".padStart(5)} ${"in tok".padStart(9)} ${"out tok".padStart(9)} ${"est. USD".padStart(10)}`);
    for (const r of rows) lines.push(`  ${r.key.padEnd(44)} ${String(r.calls).padStart(5)} ${String(r.inputTokens).padStart(9)} ${String(r.outputTokens).padStart(9)} ${("$" + r.costUSD.toFixed(5)).padStart(10)}`);
  };
  if (entries.length) {
    table("provider", summarize(entries, "provider"));
    table("model", summarize(entries, "model"));
    table("purpose", summarize(entries, "purpose"));
    const estimated = entries.filter((e) => e.priceEstimated).length;
    if (estimated) lines.push(`\nNote: ${estimated} call(s) use conservative estimates; see ledger usageReported/priceEstimated.`);
  }
  const nb = nebius.reduce((n, e) => n + e.estCostUSD, 0), an = anthropic.reduce((n, e) => n + e.estCostUSD, 0);
  lines.push(`\nNebius est. spend: $${nb.toFixed(5)} of $${caps.totalUSD} cap (remaining $${(caps.totalUSD - nb).toFixed(5)})`);
  const raw = env.TRACEHOUND_BUDGET_ANTHROPIC_USD;
  const cap = raw !== undefined && raw.trim() !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : undefined;
  lines.push(`Anthropic est. spend (Sunny's money): $${an.toFixed(5)}` + (cap === undefined ? " · cap unset/invalid; execution refused" : ` of $${cap} cap (remaining $${(cap - an).toFixed(5)})`));
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(formatSpendReport());
