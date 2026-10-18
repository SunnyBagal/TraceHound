// tracehound contracts --repo <git dir> --base <sha> --head <sha> --out <file.json> [--budget-s 120]
// What a pull request changed that files it didn't edit depend on, and the provable breaks as
// findings (contracts-v1, docs/contracts.md). No model, no network.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { computeContracts, type ContractsReport } from "./contracts.ts";
import { TYPED_DEFAULTS } from "./typed.ts";

export const CONTRACTS_USAGE = "usage: tracehound contracts --repo <git dir> --base <sha> --head <sha> --out <file.json> [--budget-s 120]";

export function runContracts(argv: string[]): { report: ContractsReport; text: string } {
  const { values } = parseArgs({ args: argv, options: { repo: { type: "string" }, base: { type: "string" }, head: { type: "string" }, out: { type: "string" }, "budget-s": { type: "string" } } });
  if (!values.repo || !values.base || !values.head || !values.out) throw new UsageError(CONTRACTS_USAGE);
  const budgetS = values["budget-s"] === undefined ? TYPED_DEFAULTS.budgetMs / 1000 : Number(values["budget-s"]);
  if (!Number.isFinite(budgetS) || budgetS <= 0) throw new UsageError(`--budget-s must be a positive number of seconds (got ${values["budget-s"]})\n${CONTRACTS_USAGE}`);
  const report = computeContracts({ repo: values.repo, base: values.base, head: values.head, budgetMs: budgetS * 1000 });
  mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  writeFileSync(values.out, JSON.stringify(report, null, 2) + "\n");
  return { report, text: formatReport(report) + `\n→ ${values.out}` };
}

export function formatReport(r: ContractsReport): string {
  const t = r.typed;
  const typed = "skipped" in t ? `skipped (${t.skipped}: ${t.reason})` : `${t.uneditedFiles.length} new in unedited files, ${t.editedFiles.length} in edited files (${t.files.head} files, ${t.tsconfigs.head.length} tsconfig)`;
  const by = (s: string) => r.findings.filter((f) => f.source === s).length;
  return [
    `tracehound contracts · ${r.refs.mergeBase.slice(0, 7)}..${r.refs.head.slice(0, 7)} · ${r.timings.totalMs} ms`,
    `typed: ${typed} · ${r.timings.typedMs} ms`,
    `keyed: ${r.keyed.counts.removed} changed keys (${r.keyed.counts.renamed} renamed), ${r.keyed.counts.staleUses} stale uses · ${r.timings.keyedMs} ms`,
    `dependents: ${r.dependents.counts.declarations} changed exported declarations, ${r.dependents.counts.dependents} use sites in unedited files · ${r.timings.dependentsMs} ms`,
    `findings: ${r.findings.length} (tsc ${by("tsc")}, contract ${by("contract")})`,
    ...r.findings.map((f) => `  [${f.source}] ${f.path}:${f.line}`),
  ].join("\n");
}

class UsageError extends Error {}

export function main(argv: string[]): number {
  try {
    console.log(runContracts(argv).text);
    return 0;
  } catch (error) {
    const badArgs = error instanceof UsageError || (typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code.startsWith("ERR_PARSE_ARGS"));
    console.error(`✖ ${(error as Error).message}${badArgs && !(error instanceof UsageError) ? `\n${CONTRACTS_USAGE}` : ""}`);
    return 1;
  }
}
