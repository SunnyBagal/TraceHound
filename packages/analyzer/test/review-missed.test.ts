// The missed-issue pass, review-missed-v1 (P008 amendment 2): the pooled-findings list per chunk,
// the request it sends through review-ctx-v1's loop, line validation, and the frozen prompts. Mini
// repos are invented (git init in a temp dir); nothing from any dataset or benchmark pull request.
// A scripted ChatClient stands in for the model. No network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";
import { buildChunkContext, CONTEXT_CLOSE, gitSource } from "../src/review/context.ts";
import { chunkDiff, parseDiff, renderChunk } from "../src/review/diff.ts";
import { main as missedMain, readPool } from "../src/review/missed-cli.ts";
import { REVIEW_MISSED_PROMPT_SHA256, REVIEW_MISSED_VERSION, reviewMissed } from "../src/review/missed.ts";
import {
  MAX_POOLED_BODY_CHARS,
  POOL_CLOSE,
  POOL_OPEN,
  pooledFindingsBlock,
  pooledForChunk,
  REVIEW_MISSED_SYSTEM_PROMPT,
  reviewMissedUserMessage,
} from "../src/review/prompt-missed.ts";
import { REVIEW_CTX_PROMPT_SHA256 } from "../src/review/review-ctx.ts";
import { parseReviewReply, REASONING_ON, REVIEW_PROMPT_SHA256 } from "../src/review/review.ts";
import { VERIFY_CTX_PROMPT_SHA256 } from "../src/review/verify-ctx.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Commit `base`, then `head`; return the repo, head sha and `git diff base head`. */
function miniRepo(base: Record<string, string>, head: Record<string, string>): { dir: string; head: string; diff: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-missed-test-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() });
  const write = (files: Record<string, string>) => {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), text);
    }
  };
  git("init", "-q", "-b", "main");
  write(base);
  git("add", "-A");
  git("commit", "-qm", "base");
  write(head);
  git("add", "-A");
  git("commit", "-qm", "head");
  return { dir, head: git("rev-parse", "HEAD").trim(), diff: git("diff", "--no-color", "HEAD~1", "HEAD") };
}

const reply = (content: string): ChatResult => ({ content, cached: false, latencyMs: 1, inputTokens: 1, outputTokens: 1, costUSD: 0 });

/** A client that records requests and answers each one from `replies` in order. */
function scripted(replies: (string | Error)[]): { client: ChatClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  let n = 0;
  return {
    requests,
    client: {
      async chat(request: ChatRequest): Promise<ChatResult> {
        requests.push(request);
        const r = replies[n++] ?? '{"findings": []}';
        if (r instanceof Error) throw r;
        return reply(r);
      },
    },
  };
}

// Two files, each its own chunk at a small chunk limit.
const PRICE = "def scale_price(p):\n    return p\n\n\n\n\nX = 1\n";
const PRICE_HEAD = "def scale_price(p):\n    return p * 2\n\n\n\n\nX = 1\n";
const STOCK = "def take(stock, n):\n    return stock - n\n";
const STOCK_HEAD = "def take(stock, n):\n    return stock - n - 1\n";

describe("the pooled findings list", () => {
  it("keeps only findings on the chunk's files, numbered in pool order; paths are compared normalised", () => {
    const pool = [
      { path: "a.py", line: 2, body: "first" },
      { path: "b.py", line: 1, body: "other file" },
      { path: "./a.py", line: 5, body: "second" },
    ];
    const listed = pooledForChunk(pool, ["a.py"]);
    expect(listed.map((f) => f.body)).toEqual(["first", "second"]);
    expect(pooledFindingsBlock(listed)).toBe(`${POOL_OPEN}\n1. a.py:2: first\n2. a.py:5: second\n${POOL_CLOSE}\n`);
  });

  it("cuts each body at 400 characters and keeps it on one line; an empty list says (none)", () => {
    const long = `${"x".repeat(MAX_POOLED_BODY_CHARS)}TAIL`;
    expect(MAX_POOLED_BODY_CHARS).toBe(400);
    const block = pooledFindingsBlock([{ path: "a.py", line: 3, body: `two\nlines` }, { path: "a.py", line: 4, body: long }, { path: "a.py", line: null, body: "file level" }]);
    expect(block.split("\n")).toEqual([POOL_OPEN, "1. a.py:3: two lines", `2. a.py:4: ${"x".repeat(400)} [cut]`, "3. a.py: file level", POOL_CLOSE, ""]);
    expect(block).not.toContain("TAIL");
    expect(pooledFindingsBlock([])).toBe(`${POOL_OPEN}\n(none)\n${POOL_CLOSE}\n`);
  });
});

describe("review-missed-v1 through review-ctx-v1's loop", () => {
  it("renders the list per chunk, scoped to that chunk's files, after the diff and the context block", async () => {
    const r = miniRepo({ "price.py": PRICE, "stock.py": STOCK }, { "price.py": PRICE_HEAD, "stock.py": STOCK_HEAD });
    const long = `${"y".repeat(450)}END`;
    const pool = [
      { path: "price.py", line: 2, body: "price finding" },
      { path: "stock.py", line: 2, body: long },
      { path: "elsewhere.py", line: 1, body: "not in this diff" },
    ];
    const chunkLimit = 300;
    const chunks = chunkDiff(parseDiff(r.diff), chunkLimit);
    expect(chunks.map((c) => c.files)).toEqual([["price.py"], ["stock.py"]]);
    const s = scripted([]);
    const out = await reviewMissed(s.client, { title: "Scale and take", description: "", diff: r.diff }, pool, { source: gitSource(r.dir, r.head), head: r.head }, { model: "m", chunkLimit });

    expect(s.requests).toHaveLength(2);
    const users = s.requests.map((q) => q.messages[1]!.content as string);
    for (const [i, q] of s.requests.entries()) {
      expect(q.messages[0]!.content).toBe(REVIEW_MISSED_SYSTEM_PROMPT);
      expect(q.temperature).toBe(0);
      expect(q.max_tokens).toBe(32_000);
      expect(q.chat_template_kwargs).toEqual(REASONING_ON.chat_template_kwargs);
      // byte for byte what reviewMissedUserMessage builds from the chunk and review-ctx-v1's context block
      const chunk = chunks[i]!;
      expect(users[i]).toBe(
        reviewMissedUserMessage({ title: "Scale and take", description: "", renderedChunk: renderChunk(chunk.text), part: i + 1, parts: 2, context: buildChunkContext(gitSource(r.dir, r.head), chunk.text).text, listed: pooledForChunk(pool, chunk.files) }),
      );
      expect(users[i]!.indexOf("Diff (part")).toBeLessThan(users[i]!.indexOf(CONTEXT_CLOSE));
      expect(users[i]!.indexOf(CONTEXT_CLOSE)).toBeLessThan(users[i]!.indexOf(POOL_OPEN));
    }
    expect(users[0]).toContain(`${POOL_OPEN}\n1. price.py:2: price finding\n${POOL_CLOSE}\n`);
    expect(users[0]).not.toContain("yyyy");
    expect(users[1]).toContain(`${POOL_OPEN}\n1. stock.py:2: ${"y".repeat(400)} [cut]\n${POOL_CLOSE}\n`);
    expect(users[1]).not.toContain("END");
    expect(users.join("")).not.toContain("not in this diff");

    expect(out.review.version).toBe(REVIEW_MISSED_VERSION);
    expect(out.review.promptSha256).toBe(REVIEW_MISSED_PROMPT_SHA256);
    expect(out.review.pool).toBe(3);
    expect(out.review.context.map((c) => c.listed)).toEqual([1, 1]);
    expect(out.review.chunkFailed).toBe(0);
    expect(out.comments).toEqual([]);
  });

  it('writes "(none)" for a chunk with no pooled findings on its files', async () => {
    const r = miniRepo({ "stock.py": STOCK }, { "stock.py": STOCK_HEAD });
    const s = scripted([]);
    await reviewMissed(s.client, { title: "t", description: "", diff: r.diff }, [{ path: "price.py", line: 2, body: "other file" }], { source: gitSource(r.dir, r.head), head: r.head }, { model: "m" });
    expect(s.requests[0]!.messages[1]!.content).toContain(`${POOL_OPEN}\n(none)\n${POOL_CLOSE}\n`);
  });

  it("drops a finding on a line that is not on the diff, through the existing DiffIndex check", async () => {
    const r = miniRepo({ "price.py": PRICE }, { "price.py": PRICE_HEAD });
    const s = scripted([JSON.stringify({ findings: [{ path: "price.py", line: 2, body: "doubles twice" }, { path: "price.py", line: 40, body: "nowhere" }, { path: "other.py", line: 1, body: "not in the diff" }] })]);
    const out = await reviewMissed(s.client, { title: "t", description: "", diff: r.diff }, [], { source: gitSource(r.dir, r.head), head: r.head }, { model: "m" });
    expect(out.comments).toEqual([{ path: "price.py", line: 2, body: "doubles twice" }]);
    expect(out.review.dropped).toMatchObject({ "line-not-in-new-version": 1, "path-not-in-diff": 1 });
    expect(out.review.findings).toBe(3);
  });

  it("retries an invalid reply once with the same messages, then records CHUNK_FAILED", async () => {
    const r = miniRepo({ "price.py": PRICE }, { "price.py": PRICE_HEAD });
    const s = scripted(["not json", "still not json"]);
    const out = await reviewMissed(s.client, { title: "t", description: "", diff: r.diff }, [], { source: gitSource(r.dir, r.head), head: r.head }, { model: "m" });
    expect(s.requests).toHaveLength(2);
    expect(s.requests[1]!.messages[0]!.content).toBe(REVIEW_MISSED_SYSTEM_PROMPT);
    expect(s.requests[1]!.messages[1]).toEqual(s.requests[0]!.messages[1]);
    expect(s.requests[1]!.messages.at(-1)!.content).toMatch(/^Your reply was invalid/);
    expect(out.review.chunkFailed).toBe(1);
    expect(out.review.chunks[0]!.failure).toMatch(/after one retry/);
  });

  it("reads the pool file strictly", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-missed-pool-"));
    repos.push(dir);
    const file = path.join(dir, "pool.json");
    writeFileSync(file, JSON.stringify({ comments: [{ path: "a.py", line: 2, body: "x" }, { path: "a.py", line: null, body: "y" }] }));
    expect(readPool(file)).toEqual([{ path: "a.py", line: 2, body: "x" }, { path: "a.py", line: null, body: "y" }]);
    writeFileSync(file, JSON.stringify({ findings: [] }));
    expect(() => readPool(file)).toThrow(/"comments" array/);
    writeFileSync(file, JSON.stringify({ comments: [{ path: "a.py", line: "2", body: "x" }] }));
    expect(() => readPool(file)).toThrow(/comment 1/);
  });

  it("the CLI needs every required flag", async () => {
    expect(await missedMain(["--pr", "x.json", "--repo", ".", "--head", "abc", "--out", "o.json"])).toBe(1);
  });
});

describe("frozen prompts", () => {
  it("review-missed-v1: sha256 pinned; its reply format is review-diff-v1's", () => {
    expect(createHash("sha256").update(REVIEW_MISSED_SYSTEM_PROMPT).digest("hex")).toBe(REVIEW_MISSED_PROMPT_SHA256);
    expect(REVIEW_MISSED_PROMPT_SHA256).toBe("a5a2115f559b82de82c51ee2629e30b05c37ebe0e528e5a02b3de753b42053bc");
    expect(REVIEW_MISSED_SYSTEM_PROMPT.endsWith('Reply with JSON only, no other text, in exactly this shape:\n{"findings": [{"path": "src/example.ts", "line": 42, "body": "..."}]}')).toBe(true);
    expect(parseReviewReply('{"findings": [{"path": "src/example.ts", "line": 42, "body": "..."}]}').ok).toBe(true);
  });

  it("the three existing prompts are unchanged", () => {
    expect(REVIEW_PROMPT_SHA256).toBe("f77c203105111e02222d8f1c985a4629d9ac8cdd07b465fdb526cf1dddea4849");
    expect(REVIEW_CTX_PROMPT_SHA256).toBe("0c4dcdcf4d764919b87c581278943e1c6d7b0714aa72b0f3cf60aa0f728089e0");
    expect(VERIFY_CTX_PROMPT_SHA256).toBe("75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70");
  });
});
