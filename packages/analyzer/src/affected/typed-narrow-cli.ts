// `node packages/analyzer/src/affected/typed-narrow-cli.ts --repo <git dir> --base <sha> --head <sha> --out <file.json> [--budget-s 120]`
// Side track C. The output has a `findings` array in the contract check's format, so
// scripts/track-c/review-case.ts takes it with --contracts.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { computeNarrowTyped } from "./typed-narrow.ts";

const USAGE = "usage: typed-narrow-cli.ts --repo <git dir> --base <sha> --head <sha> --out <file.json> [--budget-s 120]";

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { repo: { type: "string" }, base: { type: "string" }, head: { type: "string" }, out: { type: "string" }, "budget-s": { type: "string", default: "120" } } });
  const budgetS = Number(values["budget-s"]);
  if (!values.repo || !values.base || !values.head || !values.out || !Number.isFinite(budgetS) || budgetS <= 0) {
    console.error(USAGE);
    process.exit(2);
  }
  const report = computeNarrowTyped({ repo: values.repo, base: values.base, head: values.head, budgetMs: budgetS * 1000 });
  writeFileSync(values.out, JSON.stringify(report, null, 2) + "\n");
  console.log(`${report.status}: ${report.checked.files} unedited files checked, ${report.diagnostics.new} new diagnostics in them, ${report.findings.length} findings, ${report.ms.total} ms`);
}
