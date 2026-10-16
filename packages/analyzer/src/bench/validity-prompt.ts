// The validity judge's prompt, validity-v1 (decision 060). Frozen: written before the first
// completion call of 060 and never changed after seeing output or scores. Its sha256 is pinned in
// test/validity.test.ts and recorded in docs/decisions.md. It sees only the pull request's title and
// description, one review comment and that comment's file diff, so the check is the same for every
// reviewer.
import { MAX_DESCRIPTION_CHARS } from "../review/prompt.ts";
import { MAX_BODY_CHARS } from "./judge.ts";

export const VALIDITY_VERSION = "validity-v1";

export const VALIDITY_SYSTEM_PROMPT = `You check one comment that a code review tool left on a pull request.

You get the pull request's title, its description, the review comment (file path, line and text), and the diff of that one file (possibly one part of it). You see nothing else from the repository. In the diff, every added line ("+") and every unchanged context line (" ") is prefixed with its line number in the new version of the file; removed lines ("-") have no number.

Answer one question: is this comment a real defect in the changed code that a careful reviewer would want fixed?
- "valid": the defect the comment describes is real in the code shown (or clearly plausible from it), it is in or caused by the changed code, and a careful reviewer would want it fixed before merging.
- "invalid": the comment misreads the code, describes something the code does not do, is not about the changed code, or is only a matter of style, naming, documentation, tests or a speculative improvement.
- "unsure": the code shown is not enough to tell.

Reply with JSON only, no other text, in exactly this shape:
{"verdict": "valid", "reason": "..."}
"verdict" is one of "valid", "invalid" or "unsure"; "reason" is one sentence saying why.`;

export function validityUserMessage(input: {
  title: string;
  description: string;
  comment: { path: string; line: number | null; body: string };
  renderedFileDiff: string;
  part: number;
  parts: number;
}): string {
  const description = input.description.trim()
    ? input.description.length > MAX_DESCRIPTION_CHARS
      ? `${input.description.slice(0, MAX_DESCRIPTION_CHARS)}\n[truncated]`
      : input.description
    : "(no description)";
  const c = input.comment;
  const body = c.body.length > MAX_BODY_CHARS ? `${c.body.slice(0, MAX_BODY_CHARS)}\n[truncated]` : c.body;
  const which = input.parts > 1 ? ` (part ${input.part} of ${input.parts}: the part that holds the comment's line)` : "";
  return (
    `Pull request title: ${input.title}\n\nDescription:\n${description}\n\n` +
    `Review comment:\nFile: ${c.path}\nLine: ${c.line ?? "(none)"}\n${body}\n\n` +
    `Diff of ${c.path}${which}:\n${input.renderedFileDiff}`
  );
}
