// Diff-only reviewer, review-diff-v1 (decision 055). Invented diffs only; no dataset or benchmark
// text. A scripted ChatClient stands in for the model. No network.
import { describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { PullReview } from "../src/bench/types.ts";
import { BudgetExceededError, type ChatRequest, type ChatResult } from "../src/llm/client.ts";
import { chunkDiff, newSideLines, parseDiff, renderChunk } from "../src/review/diff.ts";
import { REVIEW_SYSTEM_PROMPT } from "../src/review/prompt.ts";
import { DiffIndex, parseReviewReply, REVIEW_PROMPT_SHA256, reviewPull } from "../src/review/review.ts";

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
      return { content: next, cached: false, latencyMs: 5, inputTokens: 100, outputTokens: 20, costUSD: 0.0001 };
    },
  };
}

/** One file, one hunk: new lines 10..14 = ctx 10, added 11, added 12, ctx 13, ctx 14; one deleted line. */
const SMALL = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "index 1111111..2222222 100644",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -10,4 +10,5 @@ export function total(items) {",
  "   let sum = 0;",
  "-  for (const i of items) sum += i.price;",
  "+  for (const i of items)",
  "+    sum += i.price * i.qty;",
  "   return sum;",
  " }",
  "diff --git a/src/old.ts b/src/old.ts",
  "deleted file mode 100644",
  "index 3333333..0000000",
  "--- a/src/old.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-export const legacy = 1;",
  "-export const other = 2;",
  "",
].join("\n");

/** A file with `hunks` hunks of `linesPerHunk` added lines each. */
function bigFile(name: string, hunks: number, linesPerHunk: number): string {
  const out = [`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`];
  for (let h = 0; h < hunks; h++) {
    const start = 1 + h * (linesPerHunk + 10);
    out.push(`@@ -${start},0 +${start},${linesPerHunk} @@`);
    for (let k = 0; k < linesPerHunk; k++) out.push(`+const v${h}_${k} = "${"x".repeat(40)}";`);
  }
  return out.join("\n") + "\n";
}

const smallFile = (name: string) => [`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`, "@@ -1,1 +1,2 @@", " a", "+b", ""].join("\n");

describe("parseDiff and new-version lines", () => {
  it("reads paths, deleted files and added/context lines", () => {
    const files = parseDiff(SMALL);
    expect(files.map((f) => [f.path, f.oldPath, f.newPath])).toEqual([
      ["src/cart.ts", "src/cart.ts", "src/cart.ts"],
      ["src/old.ts", "src/old.ts", null],
    ]);
    expect([...newSideLines(files[0]!)].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14]);
    expect(newSideLines(files[1]!).size).toBe(0);
    expect(files.map((f) => f.text).join("")).toBe(SMALL);
  });

  it("numbers added and context lines in the rendered chunk, not deleted ones", () => {
    const r = renderChunk(parseDiff(SMALL)[0]!.text);
    expect(r).toContain("    10    let sum = 0;");
    expect(r).toContain("       -  for (const i of items) sum += i.price;");
    expect(r).toContain("    12 +    sum += i.price * i.qty;");
    expect(r).toContain("    14  }");
  });
});

describe("chunking", () => {
  it("keeps a diff within the limit as one chunk", () => {
    const chunks = chunkDiff(parseDiff(SMALL), 60_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(SMALL);
  });

  it("packs many small files into chunks of at most the limit, whole files only", () => {
    const diff = Array.from({ length: 30 }, (_, i) => smallFile(`f${i}.ts`)).join("");
    const files = parseDiff(diff);
    const limit = files[0]!.text.length * 7 + 3;
    const chunks = chunkDiff(files, limit);
    expect(chunks.length).toBe(Math.ceil(30 / 7));
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(limit);
    expect(chunks.flatMap((c) => c.files)).toEqual(files.map((f) => f.path));
    expect(chunks.map((c) => c.text).join("")).toBe(diff);
  });

  it("cuts one file over the limit at hunk boundaries, repeating its header", () => {
    const diff = smallFile("a.ts") + bigFile("big.ts", 10, 50) + smallFile("z.ts");
    const files = parseDiff(diff);
    const big = files[1]!;
    const limit = 12_000;
    expect(big.text.length).toBeGreaterThan(limit);
    const chunks = chunkDiff(files, limit);
    const bigChunks = chunks.filter((c) => c.files.includes("big.ts"));
    expect(bigChunks.length).toBeGreaterThan(1);
    for (const c of bigChunks) {
      expect(c.files).toEqual(["big.ts"]);
      expect(c.text.startsWith(big.header)).toBe(true);
      expect(c.text.length).toBeLessThanOrEqual(limit);
      expect(c.overLimit).toBe(false);
    }
    // every hunk lands in exactly one piece, in order
    expect(bigChunks.map((c) => c.text.slice(big.header.length)).join("")).toBe(big.hunks.map((h) => h.text).join(""));
    expect(chunks[0]!.files).toEqual(["a.ts"]);
    expect(chunks.at(-1)!.files).toEqual(["z.ts"]);
  });

  it("marks a single hunk over the limit instead of cutting inside it", () => {
    const files = parseDiff(bigFile("one.ts", 1, 400));
    const chunks = chunkDiff(files, 5_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.overLimit).toBe(true);
  });
});

describe("finding validation", () => {
  const index = new DiffIndex(parseDiff(SMALL));
  it.each([
    ["added line", { path: "src/cart.ts", line: 12, body: "x" }, "ok"],
    ["context line", { path: "src/cart.ts", line: 13, body: "x" }, "ok"],
    ["b/ prefix tolerated", { path: "b/src/cart.ts", line: 11, body: "x" }, "ok"],
    ["old number of a deleted line, outside the new hunk", { path: "src/cart.ts", line: 9, body: "x" }, "line-not-in-new-version"],
    ["outside any hunk", { path: "src/cart.ts", line: 200, body: "x" }, "line-not-in-new-version"],
    ["deleted file", { path: "src/old.ts", line: 1, body: "x" }, "file-deleted"],
    ["wrong path", { path: "src/other.ts", line: 12, body: "x" }, "path-not-in-diff"],
    ["no line", { path: "src/cart.ts", body: "x" }, "malformed"],
    ["empty body", { path: "src/cart.ts", line: 12, body: " " }, "malformed"],
  ])("%s", (_name, finding, expected) => {
    const r = index.check(finding as never);
    expect(r.ok ? "ok" : r.reason).toBe(expected);
  });

  it("parses a reply with or without a json fence, and rejects other shapes", () => {
    expect(parseReviewReply('{"findings": []}').ok).toBe(true);
    expect(parseReviewReply('```json\n{"findings": []}\n```').ok).toBe(true);
    expect(parseReviewReply("Here you go: {}")).toEqual({ ok: false, why: "the reply is not valid JSON" });
    expect(parseReviewReply('{"issues": []}')).toEqual({ ok: false, why: 'the reply has no "findings" array' });
  });
});

describe("reviewPull", () => {
  const input = { title: "Invented: multiply by quantity", description: "Invented description.", diff: SMALL, number: 7 };

  it("writes the neutral format with kept comments and counted drops", async () => {
    const reply = JSON.stringify({
      findings: [
        { path: "src/cart.ts", line: 12, body: "Quantity may be undefined." },
        { path: "src/cart.ts", line: 99, body: "Out of range." },
        { path: "nowhere.ts", line: 1, body: "Wrong path." },
      ],
    });
    const client = scriptedClient([reply]);
    const out = await reviewPull(client, input, { model: "m" });
    expect(PullReview.parse(out)).toEqual({ pr_title: input.title, pr_number: 7, comments: [{ path: "src/cart.ts", line: 12, body: "Quantity may be undefined." }] });
    expect(out.review.chunks).toHaveLength(1);
    expect(out.review.findings).toBe(3);
    expect(out.review.dropped).toEqual({ "malformed": 0, "path-not-in-diff": 1, "file-deleted": 0, "line-not-in-new-version": 1 });
    expect(out.review.chunkFailed).toBe(0);
    expect(out.review.promptSha256).toBe(REVIEW_PROMPT_SHA256);
    // one call, temperature 0, purpose "review", title and description in the message, reasoning on by default
    expect(client.requests).toHaveLength(1);
    expect(client.metas[0]!.purpose).toBe("review");
    const req = client.requests[0]!;
    expect(req.temperature).toBe(0);
    expect(req.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(req.messages[0]).toEqual({ role: "system", content: REVIEW_SYSTEM_PROMPT });
    const user = req.messages[1]!.content as string;
    expect(user).toContain(input.title);
    expect(user).toContain(input.description);
    expect(user).toContain("    12 +    sum += i.price * i.qty;");
  });

  it("gives every chunk call the title and description", async () => {
    const diff = Array.from({ length: 5 }, (_, i) => smallFile(`f${i}.ts`)).join("");
    const client = scriptedClient(Array.from({ length: 5 }, () => '{"findings": []}'));
    const out = await reviewPull(client, { ...input, diff }, { model: "m", chunkLimit: smallFile("f0.ts").length * 2 });
    expect(out.review.chunks.length).toBe(3);
    expect(client.requests).toHaveLength(3);
    for (const [i, r] of client.requests.entries()) {
      const user = r.messages[1]!.content as string;
      expect(user).toContain(input.title);
      expect(user).toContain(input.description);
      expect(user).toContain(`part ${i + 1} of 3`);
    }
  });

  it("retries an invalid reply once and then accepts a valid one", async () => {
    const client = scriptedClient(["not json", '{"findings": [{"path": "src/cart.ts", "line": 11, "body": "b"}]}']);
    const out = await reviewPull(client, input, { model: "m" });
    expect(out.review.chunks[0]).toMatchObject({ status: "OK", attempts: 2, kept: 1 });
    expect(out.comments).toHaveLength(1);
    expect(client.requests[1]!.messages.at(-1)!.content).toContain("Your reply was invalid");
  });

  it("marks a chunk CHUNK_FAILED after two invalid replies; the pull request records it", async () => {
    const client = scriptedClient(["nope", '{"wrong": 1}']);
    const out = await reviewPull(client, input, { model: "m" });
    expect(out.comments).toEqual([]);
    expect(out.review.chunkFailed).toBe(1);
    expect(out.review.chunks[0]).toMatchObject({ status: "CHUNK_FAILED", attempts: 2 });
    expect(out.review.chunks[0]!.failure).toContain("after one retry");
    expect(out.review.usage.calls).toBe(2);
  });

  it("marks a chunk CHUNK_FAILED when the request fails, but stops the run on a budget refusal", async () => {
    const failed = await reviewPull(scriptedClient([new Error("HTTP 500: boom")]), input, { model: "m" });
    expect(failed.review.chunks[0]).toMatchObject({ status: "CHUNK_FAILED", attempts: 1 });
    await expect(reviewPull(scriptedClient([new BudgetExceededError("refusing")]), input, { model: "m" })).rejects.toThrow(BudgetExceededError);
  });

  it("pins the frozen prompt", () => {
    expect(REVIEW_PROMPT_SHA256).toBe("f77c203105111e02222d8f1c985a4629d9ac8cdd07b465fdb526cf1dddea4849");
  });
});
