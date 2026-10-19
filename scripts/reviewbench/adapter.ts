// ReviewBench pull request → our ReviewerInput, and our findings → the contract's findings. No model
// call, no git, no file system: entry.ts reads the contract's files and runs the pipeline.
import type { Finding, ReviewerInput } from "../../packages/action/src/action.ts";
import { agrees } from "../bench/agree-rule.ts";
import type { RbFinding, RbPrJson } from "./format.ts";

/** Findings per pull request, after drops, in pipeline order (decision in docs/bench/reviewbench.md). */
export const MAX_FINDINGS = 40;

/**
 * The reviewer's input (the `--pr` file of `tracehound review`, `review-ctx` and `verify-ctx`). The
 * number is RB_PR_NUMBER; title and body come from pr.json. review-diff-v1's prompt shows the title,
 * so an empty one is replaced by the pull request's address.
 */
export function toInput(pr: RbPrJson, diff: string, number: number, nwo: string): ReviewerInput {
  const title = typeof pr.title === "string" && pr.title.trim() ? pr.title : `${nwo}#${number}`;
  return { title, body: typeof pr.body === "string" ? pr.body : "", number, diff };
}

/** `x/y.ts`, never `./x/y.ts` or `/x/y.ts`; the contract fails a pull request on either. */
export const repoPath = (p: string) => p.trim().replace(/^(?:\.?\/)+/, "");

export interface Converted {
  findings: RbFinding[];
  /** no-line: a file-level finding (line null); empty: no path or no message left after trimming. */
  dropped: { noLine: number; empty: number };
  /** Findings past MAX_FINDINGS, cut from the end. */
  capped: number;
}

/** Our findings → contract findings, in order. A finding has one line: start_line = end_line. */
export function toFindings(findings: Finding[], producer: string, max = MAX_FINDINGS): Converted {
  const dropped = { noLine: 0, empty: 0 };
  const out: RbFinding[] = [];
  for (const finding of findings) {
    if (finding.line === null || !Number.isSafeInteger(finding.line) || finding.line < 1) { dropped.noLine++; continue; }
    const file = repoPath(finding.path);
    const message = finding.body.trim();
    if (!file || !message) { dropped.empty++; continue; }
    out.push({ file, start_line: finding.line, end_line: finding.line, message, producer });
  }
  return { findings: out.slice(0, max), dropped, capped: Math.max(0, out.length - max) };
}

/** pool-raw-x2's union: every finding that agrees (decision 058's rule) with none kept before it. */
export function unionFindings(passes: Finding[][]): Finding[] {
  const kept: Finding[] = [];
  for (const finding of passes.flat()) if (!kept.some(k => agrees(k, finding))) kept.push(finding);
  return kept;
}
