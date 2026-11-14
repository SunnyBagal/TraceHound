// `node packages/analyzer/src/affected/cli.ts --repo <checkout at head> --diff <base>..<head>`
// Side track C: a standalone entry point, not registered in `tracehound` (the frozen CLI is unchanged).
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { AffectedError, computeAffected, DEFAULT_BUDGET_MS, DEFAULT_MAX_REFS, formatAffected, type AffectedReport } from "./affected.ts";
import { ChangesError } from "../changes/git.ts";

export const AFFECTED_USAGE =
  "usage: node packages/analyzer/src/affected/cli.ts --repo <checkout at head> --diff <base>..<head> [--max-refs 12] [--budget-s 120] [--out file] [--json]";

export function runAffected(argv: string[]): { report: AffectedReport; text: string } {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      diff: { type: "string" },
      "max-refs": { type: "string" },
      "budget-s": { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
    },
  });
  if (!values.repo || !values.diff) throw new AffectedError(AFFECTED_USAGE);
  const maxRefs = values["max-refs"] === undefined ? DEFAULT_MAX_REFS : Number(values["max-refs"]);
  const budgetMs = values["budget-s"] === undefined ? DEFAULT_BUDGET_MS : Number(values["budget-s"]) * 1000;
  if (!Number.isInteger(maxRefs) || maxRefs < 1 || !Number.isFinite(budgetMs) || budgetMs <= 0) throw new AffectedError(AFFECTED_USAGE);
  const report = computeAffected({ repo: values.repo, diff: values.diff, maxRefs, budgetMs });
  if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + "\n");
  return { report, text: values.json ? JSON.stringify(report, null, 2) : formatAffected(report) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(runAffected(process.argv.slice(2)).text);
  } catch (error) {
    if (error instanceof AffectedError || error instanceof ChangesError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}
