import { agrees, norm } from "../../../../scripts/bench/agree-rule.ts";
import { newSideLines } from "../review/diff.ts";
import type { DiffFile } from "../review/diff.ts";
import { nitMatch } from "./nits.ts";
import { prefilterDiff } from "./prefilter.ts";
import type { PrefilterOptions, PrefilterResult } from "./prefilter.ts";

export type Severity = "low" | "medium" | "high" | "critical";
export interface Candidate {
  path: string;
  line: number | null;
  body: string;
  source?: string;
  votes?: number;
  evidence?: { path: string; line: number; quote: string; side?: "base" | "head" }[];
  scenario?: string;
  severity?: Severity;
  category?: string;
}
/** Fingerprint matching is injected; codex-09 will supply the persisted implementation. */
export interface Suppression {
  matches(finding: Candidate): boolean;
}
export interface GateOptions extends PrefilterOptions {
  requireEvidence?: boolean;
  minSeverity?: Severity;
  maxPerPr?: number;
}
export interface GateContext {
  diff: readonly DiffFile[];
  readFileAt(path: string): string | undefined;
  readBaseFileAt?(path: string): string | undefined;
  suppressions: readonly Suppression[];
  options?: GateOptions;
  /** Supply the S1 result when already computed; otherwise it is computed from diff. */
  prefiltered?: PrefilterResult;
}
export type GateRule = "prefiltered" | "not-in-diff" | "evidence-missing" | "evidence-mismatch"
  | "style" | "suppressed" | "duplicate" | "severity-floor" | "cap";
export interface GateResult {
  kept: Candidate[];
  dropped: { finding: Candidate; rule: GateRule; detail: string }[];
  /** Checks skipped for lack of a base reader; these are not finding drops. */
  skipped?: { finding: Candidate; rule: "evidence-mismatch"; detail: string }[];
}

const severityRank: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const rank = (finding: Candidate) => finding.severity === undefined ? 0 : severityRank[finding.severity];

/** A quote's first line must start within ±3 of the cited 1-based revision line. */
function evidenceMatches(evidence: NonNullable<Candidate["evidence"]>[number], read: GateContext["readFileAt"]): boolean {
  if (!Number.isInteger(evidence.line) || evidence.line < 1 || !evidence.quote.trim()) return false;
  const text = read(norm(evidence.path));
  if (text === undefined) return false;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const quote = evidence.quote.trim().split(/\r?\n/).map((line) => line.trim());
  for (let start = Math.max(0, evidence.line - 4); start <= Math.min(lines.length - 1, evidence.line + 2); start++) {
    if (quote.every((line, offset) => lines[start + offset] === line)) return true;
  }
  return false;
}

/** Pure S6 gate. All stages operate in rule order; ties retain the earliest input. */
export function gateFindings(candidates: readonly Candidate[], ctx: GateContext): GateResult {
  const options = ctx.options ?? {};
  if (options.maxPerPr !== undefined && (!Number.isSafeInteger(options.maxPerPr) || options.maxPerPr < 0)) {
    throw new Error("maxPerPr must be a non-negative safe integer");
  }
  const filtered = ctx.prefiltered ?? prefilterDiff(ctx.diff, options);
  const keptPaths = new Set(filtered.kept.map((file) => norm(file.path)));
  const prefilteredPaths = new Set(filtered.dropped.filter(({ path }) => !keptPaths.has(norm(path))).map(({ path }) => norm(path)));
  const linesByPath = new Map<string, Set<number>>();
  for (const file of filtered.kept) {
    const path = norm(file.path);
    const lines = linesByPath.get(path) ?? new Set<number>();
    for (const line of newSideLines(file)) lines.add(line);
    linesByPath.set(path, lines);
  }
  type Entry = { finding: Candidate; index: number };
  let entries: Entry[] = candidates.map((finding, index) => ({ finding, index }));
  const dropped: GateResult["dropped"] = [];
  const skipped: NonNullable<GateResult["skipped"]> = [];
  const apply = (rule: GateRule, reason: (finding: Candidate) => string | undefined) => {
    entries = entries.filter(({ finding }) => {
      const detail = reason(finding);
      if (detail === undefined) return true;
      dropped.push({ finding, rule, detail });
      return false;
    });
  };
  apply("prefiltered", (f) => prefilteredPaths.has(norm(f.path)) ? "path removed by S1" : undefined);
  apply("not-in-diff", (f) => {
    if (f.source === "contract" || f.source === "tsc") {
      return ctx.readFileAt(norm(f.path)) === undefined ? "exempt source path is absent at head" : undefined;
    }
    if (f.line === null) return keptPaths.has(norm(f.path)) ? undefined : "file-level comment path is absent from the retained diff";
    return linesByPath.get(norm(f.path))?.has(f.line) ? undefined : "line is not added or context in the retained diff";
  });
  apply("evidence-missing", (f) => options.requireEvidence && !f.evidence?.length ? "evidence is required" : undefined);
  apply("evidence-mismatch", (f) => {
    let mismatch: string | undefined;
    for (const [index, evidence] of (f.evidence ?? []).entries()) {
      const read = evidence.side === "base" ? ctx.readBaseFileAt : ctx.readFileAt;
      if (!read) {
        skipped.push({ finding: f, rule: "evidence-mismatch", detail: `base-side evidence ${index + 1} skipped: no base reader supplied` });
      } else if (!evidenceMatches(evidence, read)) {
        mismatch ??= `a cited quote does not match the ${evidence.side ?? "head"} file within 3 lines`;
      }
    }
    return mismatch;
  });
  apply("style", (f) => {
    if (f.category === "contract" || f.source === "contract" || f.source === "tsc") return undefined;
    return f.category === "style" ? "style category" : nitMatch(f.body);
  });
  apply("suppressed", (f) => ctx.suppressions.some((s) => s.matches(f)) ? "matches a suppression fingerprint" : undefined);

  const compare = (a: Entry, b: Entry) => (b.finding.votes ?? 0) - (a.finding.votes ?? 0)
    || rank(b.finding) - rank(a.finding) || a.index - b.index;
  const winners: Entry[] = [];
  for (const entry of [...entries].sort(compare)) {
    const winner = winners.find(({ finding }) => agrees(entry.finding, finding));
    if (winner) dropped.push({ finding: entry.finding, rule: "duplicate", detail: `agrees with input ${winner.index + 1}` });
    else winners.push(entry);
  }
  entries = winners.sort((a, b) => a.index - b.index);
  apply("severity-floor", (f) => options.minSeverity !== undefined && f.severity !== undefined
    && rank(f) < severityRank[options.minSeverity] ? `severity below ${options.minSeverity}` : undefined);
  if (options.maxPerPr !== undefined) {
    const selected = new Set([...entries].sort(compare).slice(0, options.maxPerPr));
    entries = entries.filter((entry) => {
      if (selected.has(entry)) return true;
      dropped.push({ finding: entry.finding, rule: "cap", detail: `exceeds maxPerPr ${options.maxPerPr}` });
      return false;
    });
  }
  return { kept: entries.map(({ finding }) => finding), dropped, ...(skipped.length ? { skipped } : {}) };
}
