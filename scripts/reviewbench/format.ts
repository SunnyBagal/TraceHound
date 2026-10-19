// ReviewBench's side of the adapter: the shapes of AGENT_CONTRACT.md in review-bench/ReviewBench at
// 12e9d1a (MIT), checked against the contract text and the checks scripts/try-agent.sh runs on a
// findings file. Nothing else in scripts/reviewbench/ should need to change when these move.

/** `/work/pr/pr.json`: `{ repo, pr_number, base, head, nwo, title, body }`. Only title and body are read. */
export interface RbPrJson {
  title?: unknown;
  body?: unknown;
}

/** One finding: a repository-relative path, a line range at RB_HEAD, what is wrong and why. */
export interface RbFinding {
  file: string;
  start_line: number;
  end_line: number;
  message: string;
  producer: string;
}

/** The file written at RB_OUT. `pr.head` must equal RB_HEAD and `pr.pr_number` RB_PR_NUMBER. */
export interface RbOutput {
  pr: { repo: string; pr_number: number; base: string; head: string };
  agent: string;
  findings: RbFinding[];
}

/**
 * Why `value` would fail the pull request, or null when it is accepted: the checks of
 * scripts/try-agent.sh (head, PR number, findings array, file / start_line / end_line / message
 * types, no ./ or / paths) plus the contract's own rules (positive lines, end_line >= start_line,
 * producer = the registered agent name).
 */
export function outputProblem(value: unknown, expect: { head: string; prNumber: number; agent: string }): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "not a JSON object";
  const out = value as { pr?: { head?: unknown; pr_number?: unknown }; agent?: unknown; findings?: unknown };
  if (out.pr?.head !== expect.head) return "pr.head is not RB_HEAD";
  if (out.pr?.pr_number !== expect.prNumber) return "pr.pr_number is not RB_PR_NUMBER";
  if (out.agent !== expect.agent) return "agent is not RB_AGENT";
  if (!Array.isArray(out.findings)) return "findings is not an array";
  for (const [i, item] of out.findings.entries()) {
    const f = item as Partial<RbFinding> | null;
    const line = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
    if (!f || typeof f.file !== "string" || !f.file || f.file.startsWith("./") || f.file.startsWith("/")) return `finding ${i}: bad file`;
    if (!line(f.start_line) || !line(f.end_line) || f.end_line! < f.start_line!) return `finding ${i}: bad line range`;
    if (typeof f.message !== "string" || !f.message.trim()) return `finding ${i}: empty message`;
    if (f.producer !== expect.agent) return `finding ${i}: producer is not RB_AGENT`;
  }
  return null;
}
