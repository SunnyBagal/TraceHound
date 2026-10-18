// ReviewBench PR → pool-verify-v1 input → ReviewBench findings (spike cc-02). No model call here:
// the middle step is the existing pipeline (packages/action/src/pipeline.ts runPipeline, or
// scripts/bench/run-test-set.ts pipeline()), which reads the ReviewerInput this file writes and
// produces the kept file this file converts. ReviewBench's shapes live in format.ts.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Finding, ReviewerInput } from "../../packages/action/src/action.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import type { RbFinding, RbTask } from "./format.ts";

/**
 * The pull request's unified diff from a local clone of its mirror: base...head (merge base to
 * head), as GitHub's `application/vnd.github.diff` gives it to the Action. Both commits must be in
 * `gitDir` already; nothing is fetched.
 */
export function prDiff(gitDir: string, task: RbTask): string {
  return execFileSync("git", ["-C", gitDir, "diff", "--no-color", "--no-ext-diff", `${task.base}...${task.head}`], {
    encoding: "utf8", env: cleanGitEnv(), maxBuffer: 64 * 1024 * 1024,
  });
}

/** The reviewer's input (the `--pr` file of `tracehound review`, `review-ctx` and `verify-ctx`). */
export function taskToInput(task: RbTask, diff: string): ReviewerInput {
  if (!diff.trim()) throw new Error(`task ${task.id}: empty diff`);
  return {
    // review-diff-v1's prompt shows the title; without one in the manifest the PR's address stands in.
    title: task.title?.trim() || `${task.repo}#${task.pr_number}`,
    body: task.body ?? "",
    number: task.pr_number,
    diff,
  };
}

export const SUBMISSION_DROPS = ["no-line", "empty-body"] as const;
export type SubmissionDrop = (typeof SUBMISSION_DROPS)[number];
export interface Submission {
  findings: RbFinding[];
  dropped: Record<SubmissionDrop, number>;
}

/**
 * pool-verify-v1's kept findings → ReviewBench findings, in order. A finding has one line, so
 * start_line = end_line. A file-level finding (line null) is dropped and counted: the judge's
 * format (as far as the spike could see) needs a line range, and the reviewers already drop
 * findings off the diff's new-side lines, so these should be rare.
 */
export function toSubmission(kept: Finding[]): Submission {
  const dropped: Record<SubmissionDrop, number> = { "no-line": 0, "empty-body": 0 };
  const findings: RbFinding[] = [];
  for (const finding of kept) {
    if (finding.line === null) { dropped["no-line"]++; continue; }
    if (!finding.body.trim()) { dropped["empty-body"]++; continue; }
    findings.push({ file: finding.path, start_line: finding.line, end_line: finding.line, message: finding.body.trim() });
  }
  return { findings, dropped };
}

/** The kept file `tracehound verify-ctx --kept` writes: `{ comments: Finding[], ... }`. */
export function parseKept(value: unknown): Finding[] {
  const comments = value && typeof value === "object" ? (value as { comments?: unknown }).comments : undefined;
  if (!Array.isArray(comments)) throw new Error("kept file has no comments array");
  return comments.map((item) => {
    const f = item as Partial<Finding> | null;
    if (!f || typeof f.path !== "string" || !f.path.trim() || typeof f.body !== "string"
      || !(f.line === null || (typeof f.line === "number" && Number.isSafeInteger(f.line) && f.line > 0))) {
      throw new Error("kept file has an invalid finding");
    }
    return { path: f.path, line: f.line, body: f.body };
  });
}

/** Language of a task, for strata: the manifest's field, else "unknown". */
export const languageOf = (task: RbTask) => task.language?.trim() || "unknown";

/**
 * A stratified subset of `size` tasks: each language gets its share by largest remainder (ties to
 * the larger stratum, then by name), and within a language tasks are taken in the order of
 * sha256(seed + id), so the subset is fixed by the seed and does not depend on manifest order.
 * The result is in manifest order.
 */
export function stratify(tasks: RbTask[], size: number, seed: string): RbTask[] {
  if (!Number.isSafeInteger(size) || size < 0 || size > tasks.length) throw new Error(`subset size must be 0..${tasks.length}`);
  const strata = new Map<string, RbTask[]>();
  for (const task of tasks) strata.set(languageOf(task), [...(strata.get(languageOf(task)) ?? []), task]);
  const shares = [...strata].map(([language, members]) => {
    const exact = (members.length * size) / tasks.length;
    return { language, members, take: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = size - shares.reduce((sum, s) => sum + s.take, 0);
  const byRemainder = [...shares].sort((a, b) =>
    b.remainder - a.remainder || b.members.length - a.members.length || a.language.localeCompare(b.language));
  for (const share of byRemainder) {
    if (left === 0) break;
    share.take++;
    left--;
  }
  const rank = (task: RbTask) => createHash("sha256").update(`${seed}\0${task.id}`).digest("hex");
  const chosen = new Set<string>();
  for (const share of shares) {
    const ordered = [...share.members].sort((a, b) => rank(a).localeCompare(rank(b)));
    for (const task of ordered.slice(0, share.take)) chosen.add(task.id);
  }
  return tasks.filter((task) => chosen.has(task.id));
}

/** Tasks per language, largest first (ties by name). */
export function languageCounts(tasks: RbTask[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(languageOf(task), (counts.get(languageOf(task)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
