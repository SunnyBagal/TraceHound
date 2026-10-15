// The context reviewer's prompt, review-ctx-v1 (decision 057). It is review-diff-v1's prompt
// (prompt.ts, unchanged and byte-identical here) plus one added paragraph of three sentences, and
// the user message is review-diff-v1's plus the repository context block (context.ts), between
// CONTEXT_OPEN and CONTEXT_CLOSE. Frozen: written before the first run on any benchmark pull request
// and never changed after seeing output or scores. Its sha256 is pinned in test/review-ctx.test.ts
// and recorded in docs/decisions.md.
import { REVIEW_SYSTEM_PROMPT, reviewUserMessage } from "./prompt.ts";

export const REVIEW_CTX_VERSION = "review-ctx-v1";

/** The three added sentences, as one paragraph after review-diff-v1's second paragraph. */
export const CONTEXT_SENTENCES =
  'After the diff you also get a block between "<<<REPOSITORY CONTEXT" and "REPOSITORY CONTEXT>>>", taken from the repository at the pull request\'s head commit: the changed files with their line numbers in the new version, and lines elsewhere in the repository that mention the functions and classes the diff changes. ' +
  "Use it to check whether a problem you see in the diff is real and how callers use the changed code. " +
  "Comment only on lines of the diff; a line that appears only in the context block is not a valid place for a finding.";

const ANCHOR = "\n\nReport the defects in the changed code";
if (!REVIEW_SYSTEM_PROMPT.includes(ANCHOR)) throw new Error("review-diff-v1 prompt changed: review-ctx-v1 anchor missing");

export const REVIEW_CTX_SYSTEM_PROMPT = REVIEW_SYSTEM_PROMPT.replace(ANCHOR, `\n\n${CONTEXT_SENTENCES}${ANCHOR}`);

export function reviewCtxUserMessage(input: { title: string; description: string; renderedChunk: string; part: number; parts: number; context: string }): string {
  return `${reviewUserMessage(input)}\n${input.context}`;
}
