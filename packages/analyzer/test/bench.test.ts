// Benchmark scorer (decision 054). Invented fixtures only; no dataset text. A scripted fake judge
// stands in for the model; LlmJudge runs against a scripted ChatClient. No network.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { convertPull, convertRecorded, type RecordedPull } from "../src/bench/convert.ts";
import { LlmJudge, panelVerdict, validateJudgeReply, type Judge, type JudgeInput, type JudgeVerdict } from "../src/bench/judge.ts";
import { metrics, scorePull, scoreRepo } from "../src/bench/score.ts";
import { mapByTitle } from "../src/bench/titles.ts";
import type { GoldenEntry, PullReview } from "../src/bench/types.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";

const usage = { calls: 1, cached: 0, inputTokens: 10, outputTokens: 5, costUSD: 0.001 };

/** Answers from a script keyed by pull request title; a function lets a test see the input. */
function fakeJudge(script: Record<string, Record<string, string | null> | "fail">, name = "fake"): Judge {
  return {
    name,
    async judge(input: JudgeInput): Promise<JudgeVerdict> {
      const s = script[input.prTitle];
      if (!s || s === "fail") return { ok: false, why: "scripted failure", usage };
      return { ok: true, matches: s, usage };
    },
  };
}

function scriptedClient(replies: string[]): ChatClient & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    requests,
    async chat(request: ChatRequest): Promise<ChatResult> {
      requests.push(request);
      const content = replies.shift();
      if (content === undefined) throw new Error("no scripted reply left");
      return { content, cached: false, latencyMs: 1, inputTokens: 100, outputTokens: 20, costUSD: 0.0001 };
    },
  };
}

const input: JudgeInput = {
  prTitle: "Add widget cache",
  golden: [
    { id: "G1", text: "cache key ignores the tenant" },
    { id: "G2", text: "typo in log message" },
  ],
  tool: [
    { id: "T1", path: "src/cache.ts", line: 12, body: "The key leaves out tenant id, so tenants share entries." },
    { id: "T2", path: "src/cache.ts", line: 40, body: "Consider renaming this variable." },
  ],
};

describe("scorePull: the README rules", () => {
  it("a match to a Medium-or-higher golden is a true positive; no match is a false positive; a missed one is a false negative", () => {
    const { counts, outcomes } = scorePull(["High", "Medium", "Critical"], [0, null, 2]);
    expect(outcomes).toEqual(["tp", "fp", "tp"]);
    expect(counts).toMatchObject({ comments: 3, tp: 2, fp: 1, duplicates: 0, fn: 1, goldenCounted: 3 });
  });

  it("Low: a match counts as nothing and a miss counts as nothing", () => {
    const { counts, outcomes } = scorePull(["Low", "Low", "High"], [0, 0]);
    expect(outcomes).toEqual(["low", "low"]);
    expect(counts).toMatchObject({ comments: 2, tp: 0, fp: 0, duplicates: 0, lowMatched: 2, fn: 1, goldenCounted: 1 });
  });

  it("duplicates: each golden is credited once; later matches are neither true nor false positives", () => {
    const { counts, outcomes } = scorePull(["High"], [0, 0, 0]);
    expect(outcomes).toEqual(["tp", "duplicate", "duplicate"]);
    expect(counts).toMatchObject({ tp: 1, fp: 0, duplicates: 2, fn: 0 });
  });

  it("metrics come from summed counts; empty denominators are n/a", () => {
    expect(metrics({ comments: 4, tp: 1, fp: 3, duplicates: 0, lowMatched: 0, fn: 1, goldenCounted: 2 })).toEqual({ precision: 0.25, recall: 0.5, f: 1 / 3 });
    expect(metrics({ comments: 0, tp: 0, fp: 0, duplicates: 0, lowMatched: 0, fn: 0, goldenCounted: 0 })).toEqual({ precision: null, recall: null, f: null });
  });
});

describe("mapByTitle", () => {
  it("matches after trimming whitespace and counts both unmatched sides", () => {
    const prs = [
      { n: 1, t: "  Fix the parser\n" },
      { n: 2, t: "bump some dependency" },
      { n: 3, t: "Add retries" },
    ];
    const m = mapByTitle(["Add retries", "Fix the parser", "Never opened"], prs, (p) => p.t);
    expect(m.matched.map((x) => [x.golden, x.pr.n])).toEqual([
      [0, 3],
      [1, 1],
    ]);
    expect(m.unmatchedPrs.map((p) => p.n)).toEqual([2]);
    expect(m.unmatchedGolden).toEqual([2]);
    expect(m.duplicatePrs).toEqual([]);
  });

  it("a second pull request with a title already taken is left out and counted", () => {
    const m = mapByTitle(["Same"], [{ t: "Same", n: 1 }, { t: "Same ", n: 2 }], (p) => p.t);
    expect(m.matched.map((x) => x.pr.n)).toEqual([1]);
    expect(m.duplicatePrs.map((p) => p.n)).toEqual([2]);
  });

  it("titles are compared case-sensitively and otherwise exactly", () => {
    const m = mapByTitle(["Add Retries"], [{ t: "add retries" }], (p) => p.t);
    expect(m.matched).toEqual([]);
  });
});

describe("validateJudgeReply", () => {
  it("accepts every tool id once with a golden id or null, with or without a json fence", () => {
    const reply = '{"matches":[{"tool":"T1","golden":"G1"},{"tool":"T2","golden":null}]}';
    expect(validateJudgeReply(reply, input)).toEqual({ ok: true, matches: { T1: "G1", T2: null } });
    expect(validateJudgeReply("```json\n" + reply + "\n```", input).ok).toBe(true);
  });

  it.each([
    ['{"matches":[{"tool":"T1","golden":"G9"},{"tool":"T2","golden":null}]}', /unknown reference id "G9"/],
    ['{"matches":[{"tool":"T7","golden":null},{"tool":"T2","golden":null}]}', /unknown review comment id "T7"/],
    ['{"matches":[{"tool":"T1","golden":null}]}', /missing from the reply: T2/],
    ['{"matches":[{"tool":"T1","golden":null},{"tool":"T1","golden":"G1"},{"tool":"T2","golden":null}]}', /more than once/],
    ['{"matches":[{"tool":"T1","golden":"none"},{"tool":"T2","golden":null}]}', /unknown reference id "none"/],
    ["T1 matches G1", /not valid JSON/],
    ['{"result":[]}', /no "matches" array/],
  ])("rejects %s", (reply, why) => {
    const r = validateJudgeReply(reply, input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(why);
  });
});

describe("LlmJudge", () => {
  it("sends one request per pull request at temperature 0, with ids and without severities", async () => {
    const client = scriptedClient(['{"matches":[{"tool":"T1","golden":"G1"},{"tool":"T2","golden":null}]}']);
    const v = await new LlmJudge(client).judge(input);
    expect(v).toMatchObject({ ok: true, matches: { T1: "G1", T2: null }, usage: { calls: 1 } });
    expect(client.requests).toHaveLength(1);
    const req = client.requests[0]!;
    expect(req.model).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(req.temperature).toBe(0);
    const user = req.messages[1]!.content as string;
    expect(user).toContain("G1: cache key ignores the tenant");
    expect(user).toContain("T2 (src/cache.ts:40)");
    expect(user).not.toMatch(/High|Low|Medium|Critical/);
  });

  it("retries once on an invalid id and uses the valid second reply", async () => {
    const client = scriptedClient(['{"matches":[{"tool":"T1","golden":"G3"},{"tool":"T2","golden":null}]}', '{"matches":[{"tool":"T1","golden":"G2"},{"tool":"T2","golden":null}]}']);
    const v = await new LlmJudge(client).judge(input);
    expect(v).toMatchObject({ ok: true, matches: { T1: "G2", T2: null }, usage: { calls: 2 } });
    expect(client.requests[1]!.messages.at(-1)!.content).toMatch(/invalid: unknown reference id "G3"/);
  });

  it("fails after a second invalid reply, and on a request error", async () => {
    const twice = await new LlmJudge(scriptedClient(["nope", '{"matches":[]}'])).judge(input);
    expect(twice.ok).toBe(false);
    expect(!twice.ok && twice.why).toMatch(/not valid JSON; after one retry: review comment ids missing/);
    const broken = await new LlmJudge(scriptedClient([])).judge(input);
    expect(broken).toMatchObject({ ok: false, usage: { calls: 0 } });
  });
});

describe("panelVerdict", () => {
  const title = input.prTitle;
  it("one judge: its verdict as it is", async () => {
    const v = await panelVerdict([fakeJudge({ [title]: { T1: "G1", T2: null } })], input);
    expect(v).toMatchObject({ ok: true, matches: { T1: "G1", T2: null } });
  });

  it("three judges: majority per comment; no majority is no match", async () => {
    const v = await panelVerdict(
      [fakeJudge({ [title]: { T1: "G1", T2: "G2" } }), fakeJudge({ [title]: { T1: "G1", T2: null } }), fakeJudge({ [title]: { T1: null, T2: "G1" } })],
      input,
    );
    expect(v).toMatchObject({ ok: true, matches: { T1: "G1", T2: null } });
  });

  it("fails unless more than half of the judges answered", async () => {
    const two = await panelVerdict([fakeJudge({ [title]: { T1: "G1", T2: null } }), fakeJudge({ [title]: "fail" }), fakeJudge({ [title]: "fail" })], input);
    expect(two.ok).toBe(false);
    const one = await panelVerdict([fakeJudge({ [title]: "fail" })], input);
    expect(one).toMatchObject({ ok: false, failures: ["fake: scripted failure"] });
  });
});

describe("scoreRepo", () => {
  const golden: GoldenEntry[] = [
    { pr_title: "Add widget cache", comments: [{ comment: "cache key ignores the tenant", severity: "High" }, { comment: "typo in log message", severity: "Low" }] },
    { pr_title: "Rework retries", comments: [{ comment: "retry loop never sleeps", severity: "Medium" }] },
    { pr_title: "Rename module", comments: [{ comment: "old import path still used", severity: "Critical" }] },
    { pr_title: "Not in the fork", comments: [{ comment: "anything", severity: "High" }] },
  ];
  const c = (body: string) => ({ path: "a.ts", line: 1, body });
  const reviews: { file: string; review: PullReview }[] = [
    { file: "pr-1.json", review: { pr_title: "Add widget cache", pr_number: 1, comments: [c("tenant missing from key"), c("same: tenant"), c("log typo"), c("unrelated nit")] } },
    { file: "pr-2.json", review: { pr_title: "Rework retries ", pr_number: 2, comments: [c("loop spins")] } },
    { file: "pr-3.json", review: { pr_title: "Rename module", pr_number: 3, comments: [c("something")] } },
    { file: "pr-4.json", review: { pr_title: "chore: bump a dependency", pr_number: 4, comments: [c("x")] } },
  ];

  it("sums counts over scored pull requests; JUDGE_FAILED is left out and counted, never scored as zero", async () => {
    const judge = fakeJudge({
      "Add widget cache": { T1: "G1", T2: "G1", T3: "G2", T4: null },
      "Rework retries": "fail",
      "Rename module": { T1: null },
    });
    const r = await scoreRepo({ golden, reviews, judges: [judge] });
    expect(r.mapping).toEqual({ reviewFiles: 4, matched: 3, unmatchedReviews: 1, unmatchedGolden: 1, duplicateReviews: 0 });
    expect(r.pulls).toEqual({ scored: 2, judgeFailed: 1 });
    // PR 1: TP 1, dup 1, low 1, FP 1; PR 3: FP 1, FN 1; PR 2 (JUDGE_FAILED) contributes nothing, not an FN
    expect(r.counts).toEqual({ comments: 5, tp: 1, fp: 2, duplicates: 1, lowMatched: 1, fn: 1, goldenCounted: 2 });
    const failed = r.detail.find((d) => d.status === "JUDGE_FAILED")!;
    expect(failed).toMatchObject({ goldenIndex: 1, judgeFailure: expect.stringContaining("scripted failure") });
    expect(failed.counts).toBeUndefined();
    const first = r.detail.find((d) => d.goldenIndex === 0)!;
    expect(first.comments.map((x) => x.outcome)).toEqual(["tp", "duplicate", "low", "fp"]);
    expect(first.golden[0]!.creditedBy).toEqual(["T1"]);
  });

  it("a pull request with no tool comments is scored without a judge request", async () => {
    let calls = 0;
    const judge: Judge = { name: "counting", judge: async () => (calls++, { ok: false, why: "should not be called", usage }) };
    const r = await scoreRepo({ golden: [golden[2]!], reviews: [{ file: "pr-9.json", review: { pr_title: "Rename module", comments: [] } }], judges: [judge] });
    expect(calls).toBe(0);
    expect(r.counts).toMatchObject({ comments: 0, tp: 0, fp: 0, fn: 1 });
  });
});

describe("convert", () => {
  const pr: RecordedPull = {
    number: 7,
    title: "Add widget cache",
    state: "open",
    files: ["a.ts"],
    reviewComments: [
      { id: 3, user: { login: "reviewbot[bot]", type: "Bot" }, path: "a.ts", line: 5, body: "top-level bot" },
      { id: 4, user: { login: "reviewbot[bot]", type: "Bot" }, path: "a.ts", line: 5, body: "bot reply", in_reply_to_id: 3 },
      { id: 5, user: { login: "someone", type: "User" }, path: "a.ts", line: 6, body: "human" },
      { id: 6, user: { login: "Copilot", type: "User" }, path: "b.ts", line: null, original_line: 9, body: "tool's own account" },
      { id: 1, user: { login: "otherbot[bot]", type: "Bot" }, path: "c.ts", line: 2, body: "earlier bot" },
    ],
  };

  it("keeps top-level line comments by bots or the tool's own account, in id order", () => {
    const { review, authors } = convertPull(pr, "copilot");
    expect(review).toEqual({
      pr_title: "Add widget cache",
      pr_number: 7,
      comments: [
        { path: "c.ts", line: 2, body: "earlier bot" },
        { path: "a.ts", line: 5, body: "top-level bot" },
        { path: "b.ts", line: 9, body: "tool's own account" },
      ],
    });
    expect(authors).toEqual({ "otherbot[bot]": 1, "reviewbot[bot]": 1, Copilot: 1 });
    expect(convertPull(pr, "greptile").review.comments).toHaveLength(2);
  });

  it("writes one neutral file per pull request and returns counts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bench-"));
    writeFileSync(path.join(dir, "pr-7.json"), JSON.stringify(pr));
    writeFileSync(path.join(dir, "pulls.json"), "[]");
    const out = path.join(dir, "out");
    expect(convertRecorded(dir, out, "greptile")).toEqual({ pulls: 1, comments: 2, authors: { "otherbot[bot]": 1, "reviewbot[bot]": 1 } });
  });
});
