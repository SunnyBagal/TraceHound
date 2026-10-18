import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FIX_MODEL, runFixes, validateFix, type FixClient } from "../src/fix.ts";
import { FIX_SYSTEM_PROMPT } from "../src/fix-prompt.ts";
import type { Execute } from "../src/pipeline.ts";
import { buildReview, type Finding } from "../src/action.ts";
import { parseDiff } from "../../analyzer/src/review/diff.ts";

const finding: Finding = { path: "src/widget.ts", line: 45, body: "Synthetic missing-value defect" };
const current = Array.from({ length: 100 }, (_, i) => `  value${i + 1}`);
const diff = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -44,3 +44,3 @@\n   value44\n-  old\n+  value45\n   value46\n";
const hunks = parseDiff(diff)[0]!.hunks;
const proposal = { startLine: 45, endLine: 46, replacement: "  fixed45\n  fixed46", explanation: "Handle the missing value." };
function fake(responses = [JSON.stringify(proposal)]) {
  const exec = vi.fn<Execute>(async (file, args, options) => {
    expect(file).toBe("git");
    expect(args).toEqual(["-C", "/fake/repo", "show", "abcdef12:src/widget.ts"]);
    expect(options.env.GIT_DIR).toBeUndefined();
    return { stdout: current.join("\n") + "\n" };
  });
  const chat = vi.fn<FixClient["chat"]>(async () => ({ content: responses.shift() ?? "{}" }));
  return { exec, chat, run: (findings = [finding]) => runFixes(findings, diff, "/fake/repo", "abcdef12", { chat }, exec) };
}

it("pins the product-only fix prompt", () => {
  expect(createHash("sha256").update(FIX_SYSTEM_PROMPT).digest("hex")).toBe("0ab261ca5d21b68252a31f25d215302a9f9ad5b42a90f6e9571e065424a56af4");
});

it("reads the PR head via git, supplies an exact numbered ±40 window and file hunks, and uses Super at zero temperature", async () => {
  const f = fake();
  const output = await f.run();
  expect(output).toEqual({ suggestions: [{ startLine: 45, endLine: 46, replacement: proposal.replacement, original: "  value45\n  value46" }],
    counts: { attempted: 1, valid: 1, rejected: 0 } });
  expect(f.chat).toHaveBeenCalledOnce();
  const [request, meta] = f.chat.mock.calls[0]!;
  expect(request).toMatchObject({ model: FIX_MODEL, temperature: 0, max_tokens: 4096,
    chat_template_kwargs: { enable_thinking: false } });
  expect(meta).toEqual({ purpose: "action-fix" });
  expect(request.messages[0]).toEqual({ role: "system", content: FIX_SYSTEM_PROMPT });
  const packet = JSON.parse(request.messages[1]!.content!);
  expect(packet.finding).toEqual(finding);
  expect(packet.file.split("\n")).toHaveLength(81);
  expect(packet.file.split("\n")[0]).toBe("5:   value5");
  expect(packet.file.split("\n").at(-1)).toBe("85:   value85");
  expect(packet.diff).toBe(diff.slice(diff.indexOf("@@")));
});

describe("validation rejects unsafe suggestions", () => {
  it.each([
    ["reversed range", { ...proposal, startLine: 46, endLine: 45 }],
    ["16-line range", { ...proposal, startLine: 1, endLine: 16 }],
    ["zero start", { ...proposal, startLine: 0 }],
    ["fractional start", { ...proposal, startLine: 44.5 }],
    ["fractional end", { ...proposal, endLine: 45.5 }],
    ["non-numeric range", { ...proposal, startLine: "44" }],
    ["off-diff end", { ...proposal, endLine: 47 }],
    ["off-diff middle", { ...proposal, startLine: 43, endLine: 46 }],
    ["unchanged", { ...proposal, replacement: "  value45\n  value46" }],
    ["too many replacement lines", { ...proposal, replacement: Array(16).fill("new").join("\n") }],
    ["fence escape", { ...proposal, replacement: "```\ninjected" }],
    ["non-string replacement", { ...proposal, replacement: 7 }],
    ["missing explanation", { ...proposal, explanation: "" }],
    ["extra fields", { ...proposal, extra: true }],
    ["none", { none: true, explanation: "No safe fix." }],
    ["array", [proposal]], ["null", null],
  ])("%s leaves the finding without a suggestion", async (_name, value) => {
    const f = fake([JSON.stringify(value)]);
    expect(await f.run()).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
    expect(f.chat).toHaveBeenCalledOnce();
  });

  it("rejects a gap even when both endpoints are allowed and bounds beyond the current file", () => {
    expect(validateFix(proposal, current, new Set([45, 46]), 45, hunks)).not.toBeNull();
    expect(validateFix({ ...proposal, endLine: 47 }, current, new Set([45, 47]), 45, hunks)).toBeNull();
    expect(validateFix(proposal, current.slice(0, 45), new Set([45, 46]), 45, hunks)).toBeNull();
  });

  it("accepts deletion, a single line and the inclusive 15-line limit", () => {
    expect(validateFix({ ...proposal, startLine: 45, endLine: 45, replacement: "" }, current, new Set([45]), 45, hunks))
      .toMatchObject({ startLine: 45, endLine: 45, replacement: "" });
    const addedHunks = parseDiff("diff --git a/src/widget.ts b/src/widget.ts\n--- /dev/null\n+++ b/src/widget.ts\n@@ -0,0 +1,15 @@\n"
      + current.slice(0, 15).map(line => `+${line}`).join("\n") + "\n")[0]!.hunks;
    expect(validateFix({ ...proposal, startLine: 1, endLine: 15 }, current, new Set(Array.from({ length: 15 }, (_, i) => i + 1)), 7, addedHunks))
      .toMatchObject({ startLine: 1, endLine: 15 });
  });
});

describe("committable suggestion ranges", () => {
  const replaced = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -59,3 +59,3 @@\n   value59\n-  old60\n+  value60\n   value61\n";

  it("rejects context/deleted/added/context across RIGHT 59–61 and preserves the finding at line 60", async () => {
    const f = fake([JSON.stringify({ ...proposal, startLine: 59, endLine: 61 })]);
    const anchored = { ...finding, line: 60 };
    const result = await runFixes([anchored], replaced, "/fake/repo", "abcdef12", { chat: f.chat }, f.exec);
    expect(result).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
    const review = buildReview([anchored], replaced, "abcdef12", "fake", 15, false, "pool-verify-v1", { pool: 1, kept: 1 }, {
      sources: ["diff"], fixes: result,
    });
    expect(review.comments).toEqual([{ ...anchored, side: "RIGHT" }]);
  });

  it("accepts the same proposal narrowed to added line 60 after a deletion", async () => {
    const f = fake([JSON.stringify({ ...proposal, startLine: 60, endLine: 60 })]);
    const result = await runFixes([{ ...finding, line: 60 }], replaced, "/fake/repo", "abcdef12", { chat: f.chat }, f.exec);
    expect(result.counts).toEqual({ attempted: 1, valid: 1, rejected: 0 });
    expect(result.suggestions[0]).toMatchObject({ startLine: 60, endLine: 60, original: "  value60" });
  });

  it("accepts consecutive added lines when the deletion precedes the range", async () => {
    const consecutive = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -59,3 +59,4 @@\n   value59\n-  old60\n+  value60\n+  value61\n   value62\n";
    const f = fake([JSON.stringify({ ...proposal, startLine: 60, endLine: 61 })]);
    const result = await runFixes([{ ...finding, line: 60 }], consecutive, "/fake/repo", "abcdef12", { chat: f.chat }, f.exec);
    expect(result.counts).toEqual({ attempted: 1, valid: 1, rejected: 0 });
    expect(result.suggestions[0]).toMatchObject({ startLine: 60, endLine: 61, original: "  value60\n  value61" });
  });

  it("rejects a range spanning separate hunks even when RIGHT line numbers are consecutive", async () => {
    const separate = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -60 +60 @@\n-  old60\n+  value60\n@@ -61 +61 @@\n-  old61\n+  value61\n";
    const f = fake([JSON.stringify({ ...proposal, startLine: 60, endLine: 61 })]);
    const result = await runFixes([{ ...finding, line: 60 }], separate, "/fake/repo", "abcdef12", { chat: f.chat }, f.exec);
    expect(result).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
  });
});

it("retries invalid JSON once and gives up after two invalid responses", async () => {
  const f = fake(["not json", "```json\n{}\n```"]);
  expect(await f.run()).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
  expect(f.chat).toHaveBeenCalledTimes(2);
});

it("accepts a valid JSON retry and counts one attempted finding", async () => {
  const f = fake(["bad", JSON.stringify(proposal)]);
  expect((await f.run()).counts).toEqual({ attempted: 1, valid: 1, rejected: 0 });
  expect(f.chat).toHaveBeenCalledTimes(2);
});

it("isolates client errors without retrying or leaking error text", async () => {
  const f = fake();
  f.chat.mockRejectedValue(new Error("private error"));
  expect(await f.run()).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
  expect(f.chat).toHaveBeenCalledOnce();
});

it("counts missing source as rejected and never calls the model with missing evidence", async () => {
  const f = fake();
  f.exec.mockRejectedValue(new Error("private git error"));
  expect(await f.run()).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
  expect(f.chat).not.toHaveBeenCalled();
});

it("uses the first hunk as the window center for findings without a line", async () => {
  const f = fake([JSON.stringify({ ...proposal, startLine: 45, endLine: 45 })]);
  expect((await f.run([{ ...finding, line: null }])).counts).toEqual({ attempted: 1, valid: 1, rejected: 0 });
  const packet = JSON.parse(f.chat.mock.calls[0]![0].messages[1]!.content!);
  expect(packet.file.split("\n")[0]).toBe("4:   value4");
});

it("rejects a fix 30 lines away and keeps the inline comment on the finding's line", async () => {
  const distant = { ...proposal, startLine: 75, endLine: 75 };
  const f = fake([JSON.stringify(distant)]);
  const twoHunks = diff + "@@ -75 +75 @@\n-  previous75\n+  value75\n";
  const result = await runFixes([finding], twoHunks, "/fake/repo", "abcdef12", { chat: f.chat }, f.exec);
  expect(result).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
  const payload = buildReview([finding], twoHunks, "abcdef12", "fake", 15, false, "pool-verify-v1", { pool: 1, kept: 1 }, {
    fixes: result, sources: ["diff"],
  });
  expect(payload.comments).toEqual([{ ...finding, side: "RIGHT" }]);
  expect(payload.comments[0]!.line).toBe(45);
  expect(payload.comments[0]!.body).not.toContain("```suggestion");
});

it.each([
  [44, 44], [44, 45], [45, 46], [46, 46],
])("rejects context lines in a null-line finding's proposed range %s–%s", async (startLine, endLine) => {
  const f = fake([JSON.stringify({ ...proposal, startLine, endLine })]);
  expect(await f.run([{ ...finding, line: null }])).toEqual({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
});

it("limits concurrent calls to four and keeps suggestion order", async () => {
  const f = fake();
  let active = 0;
  let peak = 0;
  f.chat.mockImplementation(async request => {
    peak = Math.max(peak, ++active);
    const body = JSON.parse(request.messages[1]!.content!).finding.body;
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { content: JSON.stringify({ ...proposal, replacement: body }) };
  });
  const findings = Array.from({ length: 11 }, (_, i) => ({ ...finding, body: `Synthetic ${i}` }));
  const output = await f.run(findings);
  expect(peak).toBe(4);
  expect(output.suggestions.map(fix => fix?.replacement)).toEqual(findings.map(f => f.body));
  expect(output.counts).toEqual({ attempted: 11, valid: 11, rejected: 0 });
});
