import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfig } from "../config.ts";
import { parseDiff } from "../review/diff.ts";
import { gateFindings } from "./gate.ts";
import type { Candidate, GateOptions } from "./gate.ts";

const severity = z.enum(["low", "medium", "high", "critical"]);
const candidate = z.object({
  path: z.string().min(1), line: z.number().int().positive().nullable(), body: z.string().min(1),
  source: z.string().optional(), votes: z.number().int().nonnegative().optional(),
  evidence: z.array(z.object({ path: z.string().min(1), line: z.number().int().positive(), quote: z.string() })).optional(),
  scenario: z.string().optional(), severity: severity.optional(), category: z.string().optional(),
}).passthrough();

/** Never follow a finding or evidence path outside the head checkout, including symlinks. */
export function headReader(repo: string): (file: string) => string | undefined {
  const root = realpathSync(repo);
  return (file) => {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) return undefined;
    try {
      const target = realpathSync(path.resolve(root, file));
      const relative = path.relative(root, target);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
      return readFileSync(target, "utf8");
    } catch {
      return undefined;
    }
  };
}

/** Reject declared test-set identities without reading or contacting any repository. */
function forbiddenRepository(input: Record<string, unknown>): boolean {
  const identity = [input.repository, input.repo, input.repo_full_name, input.url, input.html_url];
  return identity.some((value) => /(?:^|[^a-z0-9])calcom\/cal\.com(?:$|[^a-z0-9])/i.test(JSON.stringify(value) ?? ""));
}

export function main(argv: string[]): number {
  try {
    const { values } = parseArgs({ args: argv, options: {
      pr: { type: "string" }, findings: { type: "string" }, repo: { type: "string" }, out: { type: "string" },
      "require-evidence": { type: "boolean" }, "min-severity": { type: "string" }, "max-per-pr": { type: "string" },
    } });
    if (!values.pr || !values.findings || !values.repo || !values.out) {
      console.error("usage: tracehound gate --pr <input.json> --findings <file.json> --repo <head checkout> --out <file.json> [--require-evidence] [--min-severity medium] [--max-per-pr N]");
      return 1;
    }
    const options: GateOptions = { requireEvidence: values["require-evidence"] ?? false };
    if (values["min-severity"] !== undefined) options.minSeverity = severity.parse(values["min-severity"]);
    if (values["max-per-pr"] !== undefined) {
      if (!/^\d+$/.test(values["max-per-pr"])) throw new Error("invalid cap");
      options.maxPerPr = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(Number(values["max-per-pr"]));
    }
    const input = z.object({ diff: z.string() }).passthrough().parse(JSON.parse(readFileSync(values.pr, "utf8")));
    if (forbiddenRepository(input)) {
      console.error("gate: repository excluded by blindness policy");
      return 1;
    }
    const raw: unknown = JSON.parse(readFileSync(values.findings, "utf8"));
    const envelope = z.object({ findings: z.array(candidate).optional(), comments: z.array(candidate).optional() }).parse(Array.isArray(raw) ? { findings: raw } : raw);
    const findings = envelope.findings ?? envelope.comments;
    if (!findings) throw new Error("missing findings");
    options.ignore = loadConfig(values.repo).config.review?.ignore ?? [];
    const result = gateFindings(findings as Candidate[], {
      diff: parseDiff(input.diff), readFileAt: headReader(values.repo), suppressions: [], options,
    });
    const counts: Record<string, number> = {};
    for (const { rule } of result.dropped) counts[rule] = (counts[rule] ?? 0) + 1;
    writeFileSync(values.out, JSON.stringify({ ...result, counts }, null, 2) + "\n");
    return 0;
  } catch {
    // Input may contain secrets: never echo JSON, file contents or underlying error text.
    console.error("gate: invalid input, options, or inaccessible files");
    return 1;
  }
}
