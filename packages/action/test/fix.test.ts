import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FIX_MODEL, runFixes, validateFix, type FixClient } from "../src/fix.ts";
import { FIX_SYSTEM_PROMPT } from "../src/fix-prompt.ts";
import type { Execute } from "../src/pipeline.ts";
import { buildReview, type Finding } from "../src/action.ts";

const finding: Finding = { path: "src/widget.ts", line: 45, body: "Synthetic missing-value defect" };
const current = Array.from({ length: 100 }, (_, i) => `  value${i + 1}`);
const diff = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -44,3 +44,3 @@\n   value44\n-  old\n+  value45\n   value46\n";
const proposal = { startLine: 44, endLine: 45, replacement: "  fixed44\n  fixed45", explanation: "Handle the missing value." };
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
  expect(output).toEqual({ suggestions: [{ startLine: 44, endLine: 45, replacement: proposal.replacement, original: "  value44\n  value45" }],
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
    ["unchanged", { ...proposal, replacement: "  value44\n  value45" }],
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
    expect(validateFix(proposal, current, new Set([44, 45]), 45)).not.toBeNull();
    expect(validateFix({ ...proposal, endLine: 46 }, current, new Set([44, 46]), 45)).toBeNull();
    expect(validateFix(proposal, current.slice(0, 44), new Set([44, 45]), 45)).toBeNull();
  });

  it("accepts deletion, a single line and the inclusive 15-line limit", () => {
    expect(validateFix({ ...proposal, startLine: 45, replacement: "" }, current, new Set([45]), 45))
      .toMatchObject({ startLine: 45, endLine: 45, replacement: "" });
    expect(validateFix({ ...proposal, startLine: 1, endLine: 15 }, current, new Set(Array.from({ length: 15 }, (_, i) => i + 1)), 7))
      .toMatchObject({ startLine: 1, endLine: 15 });
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
