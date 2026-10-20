// The missed-issue pass's prompt, review-missed-v1 (P008 amendment 2, candidate 6 of ReviewBench).
// It runs after review-diff-v1 and review-ctx-v1 have been pooled: per chunk it sees the chunk, the
// same repository context block review-ctx-v1 builds (context.ts), and the pooled findings on that
// chunk's files, and asks only for defects the pool does not already contain. The reply format is
// review-diff-v1's, so parseReviewReply and DiffIndex validate it unchanged. Frozen: written from
// the idea and general defect categories only, before any model call and without reading any
// benchmark data; its sha256 is pinned in test/review-missed.test.ts and recorded in P008.
import { norm } from "../../../../scripts/bench/agree-rule.ts";
import { reviewCtxUserMessage } from "./prompt-ctx.ts";

export const REVIEW_MISSED_VERSION = "review-missed-v1";

/** A pooled finding's body is cut here in the list. */
export const MAX_POOLED_BODY_CHARS = 400;

export const POOL_OPEN = "<<<ALREADY REPORTED";
export const POOL_CLOSE = "ALREADY REPORTED>>>";

export const REVIEW_MISSED_SYSTEM_PROMPT = `You are a careful senior software engineer doing a second review of a pull request before it is merged. Other reviewers have already looked at it; your job is to find what they missed.

You get the pull request's title, its description, and its unified diff (possibly one part of a larger diff). In the diff, every added line ("+") and every unchanged context line (" ") is prefixed with its line number in the new version of the file; removed lines ("-") have no number.

After the diff you get a block between "<<<REPOSITORY CONTEXT" and "REPOSITORY CONTEXT>>>", taken from the repository at the pull request's head commit: the changed files with their line numbers in the new version, and lines elsewhere in the repository that mention the functions and classes the diff changes. Use it to check whether a problem is real and how callers use the changed code.

Last comes a numbered list between "<<<ALREADY REPORTED" and "ALREADY REPORTED>>>": the findings other reviewers have already reported on the files in this part of the diff, as "path:line: text", with long texts cut; it says "(none)" if there are none. Do not repeat these findings, rephrase them, or report the same problem at another line.

Look for real defects in the changed code that the list does not contain and that you would block the merge for:
- correctness: logic errors, wrong conditions, off-by-one errors, wrong values, missing cases;
- error handling and reliability: unhandled errors or rejections, null or undefined access, failures that are swallowed or leave state half-updated, missing timeouts or retries where the code depends on them;
- security: injection, missing authentication or authorisation, leaked secrets or personal data, unsafe input handling;
- API or contract breaks: changed signatures, return values, types, formats or behaviour that callers, callees or stored data still rely on;
- concurrency: race conditions, missing awaits, unsafe shared state, ordering assumptions;
- resource leaks: connections, files, handles, timers, listeners or subscriptions that are not released;
- tests: missing tests for changed behaviour that can break, or a test that no longer checks what it claims or asserts the wrong thing.

Every finding must point at an added or context line of this diff; a line that appears only in the context block is not a valid place for a finding. Do not report style, naming, formatting, documentation or comments, or speculative improvements. If the list already covers every defect you see, or you find none, return an empty list.

For each defect give:
- "path": the file path exactly as it appears in the diff (the new path, without an "a/" or "b/" prefix);
- "line": a line number in the new version of the file, taken from the numbers shown in the diff, on an added or context line where the defect is;
- "body": what is wrong and what it breaks, in one to four sentences.

Reply with JSON only, no other text, in exactly this shape:
{"findings": [{"path": "src/example.ts", "line": 42, "body": "..."}]}`;

export interface PooledFinding {
  path: string;
  line: number | null;
  body: string;
}

/** The pooled findings whose path is one of the chunk's files, in pool order. */
export function pooledForChunk(pool: PooledFinding[], files: string[]): PooledFinding[] {
  const inChunk = new Set(files.map(norm));
  return pool.filter((f) => inChunk.has(norm(f.path)));
}

/** The numbered list, one finding per line with its body on one line and cut at MAX_POOLED_BODY_CHARS; "(none)" when empty. */
export function pooledFindingsBlock(listed: PooledFinding[]): string {
  const lines = listed.map((f, i) => {
    const body = f.body.replace(/\s+/g, " ").trim();
    const cut = body.length > MAX_POOLED_BODY_CHARS ? `${body.slice(0, MAX_POOLED_BODY_CHARS)} [cut]` : body;
    return `${i + 1}. ${norm(f.path)}${f.line === null ? "" : `:${f.line}`}: ${cut}`;
  });
  return `${POOL_OPEN}\n${lines.length ? lines.join("\n") : "(none)"}\n${POOL_CLOSE}\n`;
}

export function reviewMissedUserMessage(input: {
  title: string;
  description: string;
  renderedChunk: string;
  part: number;
  parts: number;
  context: string;
  listed: PooledFinding[];
}): string {
  return `${reviewCtxUserMessage(input)}\n${pooledFindingsBlock(input.listed)}`;
}
