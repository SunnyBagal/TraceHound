// Verification pass, verify-v1 (decision 056). Invented findings and diffs only; no dataset or
// benchmark text. A scripted ChatClient stands in for the model. No network.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { PullReview } from "../src/bench/types.ts";
import { BudgetExceededError, type ChatRequest, type ChatResult } from "../src/llm/client.ts";
import { parseDiff } from "../src/review/diff.ts";
import { VERIFY_SYSTEM_PROMPT } from "../src/review/verify-prompt.ts";
import { fileDiffFor, filterAtThreshold, parseVerifyReply, VERIFY_PROMPT_SHA256, verifyReview, type VerifiedReview } from "../src/review/verify.ts";

function scriptedClient(replies: (string | Error)[]): ChatClient & { requests: ChatRequest[]; metas: { purpose: string }[] } {
  const requests: ChatRequest[] = [];
  const metas: { purpose: string }[] = [];
  return {
    requests,
    metas,
    async chat(request: ChatRequest, meta: { purpose: string }): Promise<ChatResult> {
      requests.push(request);
      metas.push(meta);
      const next = replies.shift();
      if (next === undefined) throw new Error("no scripted reply left");
      if (next instanceof Error) throw next;
      return { content: next, cached: false, latencyMs: 7, inputTokens: 200, outputTokens: 30, costUSD: 0.0002 };
    },
  };
}

const DIFF = [
  "diff --git a/lib/shelf.ts b/lib/shelf.ts",
  "--- a/lib/shelf.ts",
  "+++ b/lib/shelf.ts",
  "@@ -3,3 +3,4 @@ export function pick(books) {",
  "   const out = [];",
  "-  for (let i = 0; i < books.length; i++) out.push(books[i]);",
  "+  for (let i = 0; i <= books.length; i++)",
  "+    out.push(books[i].title);",
  "   return out;",
  "diff --git a/lib/lamp.ts b/lib/lamp.ts",
  "--- a/lib/lamp.ts",
  "+++ b/lib/lamp.ts",
  "@@ -1,1 +1,2 @@",
  " export const on = true;",
  "+export const watts = 60;",
  "",
].join("\n");

const INPUT = { title: "Pick titles from the shelf", description: "Returns titles instead of objects.", diff: DIFF };
const REVIEW: PullReview = {
  pr_title: INPUT.title,
  pr_number: 7,
  comments: [
    { path: "lib/shelf.ts", line: 4, body: "The loop reads one past the end of the array." },
    { path: "lib/lamp.ts", line: 2, body: "The constant name is unclear." },
  ],
};

describe("parseVerifyReply", () => {
  it("accepts an integer confidence from 1 to 5 and a reason, with or without a fence", () => {
    expect(parseVerifyReply('{"confidence": 4, "reason": "Off by one."}')).toEqual({ ok: true, confidence: 4, reason: "Off by one." });
    expect(parseVerifyReply('```json\n{"confidence": 1, "reason": " Not a bug. "}\n```')).toEqual({ ok: true, confidence: 1, reason: "Not a bug." });
    expect(parseVerifyReply('{"confidence": "5", "reason": "x"}')).toEqual({ ok: true, confidence: 5, reason: "x" });
  });
  it("rejects anything else", () => {
    for (const bad of ["not json", "[]", '{"reason": "x"}', '{"confidence": 0, "reason": "x"}', '{"confidence": 6, "reason": "x"}', '{"confidence": 3.5, "reason": "x"}', '{"confidence": "high", "reason": "x"}', '{"confidence": 3}', '{"confidence": 3, "reason": "  "}'])
      expect(parseVerifyReply(bad).ok, bad).toBe(false);
  });
});

describe("verifyReview", () => {
  it("makes one call per finding showing only that finding and its file's diff, with line numbers", async () => {
    const client = scriptedClient(['{"confidence": 5, "reason": "Reads past the end."}', '{"confidence": 1, "reason": "Naming only."}']);
    const v = await verifyReview(client, INPUT, REVIEW);
    expect(client.requests).toHaveLength(2);
    expect(client.metas.every((m) => m.purpose === "verify")).toBe(true);
    const [r1, r2] = client.requests;
    expect(r1!.temperature).toBe(0);
    expect(r1!.model).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(r1!.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(r1!.messages[0]!.content).toBe(VERIFY_SYSTEM_PROMPT);
    const u1 = r1!.messages[1]!.content as string;
    expect(u1).toContain(INPUT.title);
    expect(u1).toContain(INPUT.description);
    expect(u1).toContain(REVIEW.comments[0]!.body);
    expect(u1).toContain("     4 +  for (let i = 0; i <= books.length; i++)");
    expect(u1).not.toContain("lib/lamp.ts"); // not the other file
    expect(u1).not.toContain(REVIEW.comments[1]!.body); // not the other finding
    const u2 = r2!.messages[1]!.content as string;
    expect(u2).toContain("     2 +export const watts = 60;");
    expect(u2).not.toContain("books");
    expect(v.comments.map((c) => [c.status, c.confidence, c.reason])).toEqual([
      ["VERIFIED", 5, "Reads past the end."],
      ["VERIFIED", 1, "Naming only."],
    ]);
    expect(v.verify).toMatchObject({ version: "verify-v1", findings: 2, verified: 2, verifyFailed: 0, byConfidence: { "1": 1, "5": 1 }, promptSha256: VERIFY_PROMPT_SHA256 });
    expect(v.verify.usage).toMatchObject({ calls: 2, inputTokens: 400, outputTokens: 60 });
    expect(v.pr_number).toBe(7);
  });

  it("retries an invalid reply once with the reason, then accepts a valid one", async () => {
    const client = scriptedClient(['{"confidence": 9}', '{"confidence": 3, "reason": "Plausible."}', '{"confidence": 2, "reason": "Doubtful."}']);
    const v = await verifyReview(client, INPUT, REVIEW);
    expect(client.requests).toHaveLength(3);
    const retry = client.requests[1]!.messages;
    expect(retry).toHaveLength(4);
    expect(retry[2]).toEqual({ role: "assistant", content: '{"confidence": 9}' });
    expect(retry[3]!.content).toContain("invalid");
    expect(v.comments[0]).toMatchObject({ status: "VERIFIED", confidence: 3, attempts: 2 });
    expect(v.comments[1]).toMatchObject({ status: "VERIFIED", confidence: 2, attempts: 1 });
  });

  it("marks VERIFY_FAILED after two invalid replies, after a failed request, and for a path not in the diff", async () => {
    const client = scriptedClient(["nope", "still nope", new Error("HTTP 503")]);
    const review: PullReview = { ...REVIEW, comments: [...REVIEW.comments, { path: "lib/missing.ts", line: 1, body: "Something." }] };
    const v = await verifyReview(client, INPUT, review);
    expect(client.requests).toHaveLength(3); // no call for the missing path
    expect(v.comments.map((c) => [c.status, c.confidence])).toEqual([
      ["VERIFY_FAILED", null],
      ["VERIFY_FAILED", null],
      ["VERIFY_FAILED", null],
    ]);
    expect(v.comments[0]!.failure).toContain("after one retry");
    expect(v.comments[1]!.failure).toContain("HTTP 503");
    expect(v.comments[2]!.failure).toContain("not in the diff");
    expect(v.verify).toMatchObject({ findings: 3, verified: 0, verifyFailed: 3 });
  });

  it("stops the run on a budget error instead of failing the finding", async () => {
    const client = scriptedClient([new BudgetExceededError("cap")]);
    await expect(verifyReview(client, INPUT, REVIEW)).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

describe("fileDiffFor", () => {
  it("shows the part of an over-limit file that holds the line", () => {
    const out = ["diff --git a/big.ts b/big.ts", "--- a/big.ts", "+++ b/big.ts"];
    for (let h = 0; h < 3; h++) {
      const start = 1 + h * 1000;
      out.push(`@@ -${start},0 +${start},500 @@`);
      for (let k = 0; k < 500; k++) out.push(`+const h${h}_${k} = "${"y".repeat(40)}";`);
    }
    const files = parseDiff(out.join("\n") + "\n");
    const shown = fileDiffFor(files, { path: "big.ts", line: 2010 })!;
    expect(shown.parts).toBeGreaterThan(1);
    expect(shown.rendered).toContain("  2010 +const h2_9 ");
    expect(shown.rendered).not.toContain("h0_0 ");
    expect(fileDiffFor(files, { path: "other.ts", line: 1 })).toBeNull();
  });
});

describe("filterAtThreshold", () => {
  const verified = (): VerifiedReview => {
    const base = { attempts: 1, diffChars: 10, partial: false, usage: { calls: 1, cached: 0, inputTokens: 1, outputTokens: 1, costUSD: 0, latencyMs: 1 } };
    return {
      pr_title: "Invented",
      pr_number: 3,
      comments: [
        { path: "a.ts", line: 1, body: "one", confidence: 1, reason: "r", status: "VERIFIED", ...base },
        { path: "a.ts", line: 2, body: "three", confidence: 3, reason: "r", status: "VERIFIED", ...base },
        { path: "a.ts", line: 3, body: "failed", confidence: null, reason: null, status: "VERIFY_FAILED", failure: "x", ...base },
        { path: "a.ts", line: 4, body: "five", confidence: 5, reason: "r", status: "VERIFIED", ...base },
      ],
      verify: { version: "verify-v1", model: "m", reasoning: "on", promptSha256: "s", findings: 4, verified: 3, verifyFailed: 1, byConfidence: { "1": 1, "2": 0, "3": 1, "4": 0, "5": 1 }, usage: { calls: 4, cached: 0, inputTokens: 4, outputTokens: 4, costUSD: 0 }, wallMs: 1 },
    };
  };
  it("keeps confidence >= threshold and every VERIFY_FAILED finding, in order", () => {
    const bodies = (t: number) => filterAtThreshold(verified(), t).comments.map((c) => c.body);
    expect(bodies(1)).toEqual(["one", "three", "failed", "five"]);
    expect(bodies(2)).toEqual(["three", "failed", "five"]);
    expect(bodies(4)).toEqual(["failed", "five"]);
    expect(bodies(5)).toEqual(["failed", "five"]);
    expect(filterAtThreshold(verified(), 4).verify).toMatchObject({ threshold: 4, kept: 2, removed: 2, keptVerifyFailed: 1 });
    expect(() => filterAtThreshold(verified(), 0)).toThrow();
    expect(() => filterAtThreshold(verified(), 2.5)).toThrow();
  });
  it("both output files still parse as the scorer's neutral format", () => {
    const v = verified();
    const all = PullReview.parse(JSON.parse(JSON.stringify(v)));
    expect(all.comments).toEqual(v.comments.map((c) => ({ path: c.path, line: c.line, body: c.body })));
    const f = PullReview.parse(JSON.parse(JSON.stringify(filterAtThreshold(v, 3))));
    expect(f).toEqual({ pr_title: "Invented", pr_number: 3, comments: [{ path: "a.ts", line: 2, body: "three" }, { path: "a.ts", line: 3, body: "failed" }, { path: "a.ts", line: 4, body: "five" }] });
  });
});

describe("the frozen prompt", () => {
  it("is unchanged (sha256 recorded in decision 056)", () => {
    expect(createHash("sha256").update(VERIFY_SYSTEM_PROMPT).digest("hex")).toBe("ab2d61057b7b5adb7a35329876dbc7ce9003d4d170506fdd957d433f3fac6586");
    expect(VERIFY_PROMPT_SHA256).toBe("ab2d61057b7b5adb7a35329876dbc7ce9003d4d170506fdd957d433f3fac6586");
  });
});
