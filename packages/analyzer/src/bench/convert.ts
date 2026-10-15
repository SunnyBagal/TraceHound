// Recorded GitHub data (scripts/bench/fetch-recorded.ts) → the neutral review format, one file per
// pull request (decision 054). Counted: top-level line-level review comments (no in_reply_to_id)
// written by a bot account or by the tool's own account. Summaries, review bodies, issue comments,
// replies and human comments are not counted.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PullReview } from "./types.ts";

/** Each tool's own account, for the case where it posts as something GitHub doesn't type as a bot. */
export const TOOL_ACCOUNTS: Record<string, string[]> = {
  greptile: ["greptile-apps[bot]"],
  coderabbit: ["coderabbitai[bot]"],
  augment: ["augmentcode[bot]"],
  cursor: ["cursor[bot]"],
  copilot: ["Copilot", "copilot-pull-request-reviewer[bot]"],
};

export interface RecordedReviewComment {
  user: { login: string; type: string } | null;
  in_reply_to_id?: number | null;
  path: string;
  line?: number | null;
  original_line?: number | null;
  body: string;
  id: number;
}

export interface RecordedPull {
  number: number;
  title: string;
  state: string;
  reviewComments: RecordedReviewComment[];
  files: string[];
}

export function countsAsToolComment(c: RecordedReviewComment, tool: string): boolean {
  if (c.in_reply_to_id !== undefined && c.in_reply_to_id !== null) return false;
  if (!c.user) return false;
  return c.user.type === "Bot" || (TOOL_ACCOUNTS[tool] ?? []).includes(c.user.login);
}

export function convertPull(pr: RecordedPull, tool: string): { review: PullReview; authors: Record<string, number> } {
  const authors: Record<string, number> = {};
  const comments = [...pr.reviewComments]
    .sort((a, b) => a.id - b.id)
    .filter((c) => countsAsToolComment(c, tool))
    .map((c) => {
      authors[c.user!.login] = (authors[c.user!.login] ?? 0) + 1;
      return { path: c.path, line: c.line ?? c.original_line ?? null, body: c.body };
    });
  return { review: { pr_title: pr.title, pr_number: pr.number, comments }, authors };
}

/** Converts every pr-<n>.json in `recordedDir`; returns counts only (pull requests, comments, authors). */
export function convertRecorded(recordedDir: string, outDir: string, tool: string): { pulls: number; comments: number; authors: Record<string, number> } {
  mkdirSync(outDir, { recursive: true });
  const authors: Record<string, number> = {};
  let pulls = 0;
  let comments = 0;
  for (const f of readdirSync(recordedDir).filter((x) => /^pr-\d+\.json$/.test(x))) {
    const pr = JSON.parse(readFileSync(path.join(recordedDir, f), "utf8")) as RecordedPull;
    const { review, authors: a } = convertPull(pr, tool);
    writeFileSync(path.join(outDir, f), JSON.stringify(review, null, 1) + "\n");
    pulls++;
    comments += review.comments.length;
    for (const [login, n] of Object.entries(a)) authors[login] = (authors[login] ?? 0) + n;
  }
  return { pulls, comments, authors };
}
