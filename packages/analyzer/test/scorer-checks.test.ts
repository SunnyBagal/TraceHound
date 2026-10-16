// Scorer checks (decision 060): bench-judge-v1's default request unchanged, bench-judge-x1's request,
// validity-v1 (prompt pin, reply shape, retry, no-diff), deduplication, kappa and tau on hand-worked
// examples, augmented precision arithmetic and the partial-result rule. Invented data only; no network.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { augmentedPrecision, cohenKappa, dedupFps, kendallTauB } from "../../../scripts/bench/scorer-checks-lib.ts";
import type { ChatClient } from "../src/agent/decider.ts";
import { JUDGE_SYSTEM_PROMPT, LlmJudge, type JudgeInput } from "../src/bench/judge.ts";
import { VALIDITY_SYSTEM_PROMPT } from "../src/bench/validity-prompt.ts";
import { judgeValidity, parseValidityReply, VALIDITY_PROMPT_SHA256, type FpItem, type Verdict } from "../src/bench/validity.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";

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
    { id: "T2", path: "src/cache.ts", line: null, body: "x".repeat(4100) },
  ],
};

describe("bench-judge-v1's default request", () => {
  it("is byte-identical to the request before decision 060 (snapshot of the body)", () => {
    const body = JSON.stringify(new LlmJudge(scriptedClient([])).buildRequest(input));
    // sha256 of the body built by judge.ts as it was at the 059 merge, on this input
    expect(createHash("sha256").update(body).digest("hex")).toBe("e935fbeec0fc60473fcd311cba33a4cd6566ea5c335874a4a174d29a503fdcca");
    expect(JSON.parse(body)).toMatchObject({ model: "nvidia/nemotron-3-super-120b-a12b", temperature: 0, max_tokens: 16000, chat_template_kwargs: { enable_thinking: true } });
    expect(JSON.stringify(new LlmJudge(scriptedClient([]), { reasoning: "on" }).buildRequest(input))).toBe(body);
    expect(createHash("sha256").update(JUDGE_SYSTEM_PROMPT).digest("hex")).toBe("23de4e9e571f18a4269eaa5da9b1df14dabf34b8c0fad6774f2c7aa727058460");
  });

  it("bench-judge-x1 differs only in the model and the absent reasoning field", () => {
    const v1 = new LlmJudge(scriptedClient([])).buildRequest(input);
    const x1 = new LlmJudge(scriptedClient([]), { model: "Qwen/Qwen3-235B-A22B-Instruct-2507", reasoning: "off" }).buildRequest(input);
    expect("chat_template_kwargs" in x1).toBe(false);
    expect("reasoning_effort" in x1).toBe(false);
    const { chat_template_kwargs: _r, ...rest } = v1;
    expect(x1).toEqual({ ...rest, model: "Qwen/Qwen3-235B-A22B-Instruct-2507" });
  });
});

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " const a = 1;",
  "+const b = a / 0;",
  " export { a };",
  "",
].join("\n");
const pr = { title: "Add b", description: "Adds b.", diff: DIFF };
const item: FpItem = { key: "fp1", repo: "invented", goldenIndex: 0, path: "src/a.ts", line: 2, body: "Division by zero." };

describe("validity-v1", () => {
  it("prompt is pinned by sha256", () => {
    expect(createHash("sha256").update(VALIDITY_SYSTEM_PROMPT).digest("hex")).toBe("c11d8fb63ff56c9e41f510715e0b33494fd42780e632746518dbf4a0a48721c6");
    expect(VALIDITY_PROMPT_SHA256).toBe("c11d8fb63ff56c9e41f510715e0b33494fd42780e632746518dbf4a0a48721c6");
  });

  it("accepts exactly the three verdicts with a reason", () => {
    expect(parseValidityReply('{"verdict": "valid", "reason": "r"}')).toEqual({ ok: true, verdict: "valid", reason: "r" });
    expect(parseValidityReply('```json\n{"verdict": "unsure", "reason": "r"}\n```')).toMatchObject({ ok: true, verdict: "unsure" });
    expect(parseValidityReply('{"verdict": "maybe", "reason": "r"}').ok).toBe(false);
    expect(parseValidityReply('{"verdict": "valid"}').ok).toBe(false);
    expect(parseValidityReply("valid").ok).toBe(false);
  });

  it("sends the title, description, comment and that file's numbered diff; Super has reasoning on, Qwen no reasoning field", async () => {
    const s = scriptedClient(['{"verdict": "valid", "reason": "r"}']);
    const r = await judgeValidity(s, { model: "nvidia/nemotron-3-super-120b-a12b", reasoning: "on" }, pr, item);
    expect(r).toMatchObject({ verdict: "valid", status: "answered", attempts: 1 });
    const req = s.requests[0]!;
    expect(req).toMatchObject({ temperature: 0, chat_template_kwargs: { enable_thinking: true } });
    const user = req.messages[1]!.content as string;
    expect(user).toContain("Pull request title: Add b");
    expect(user).toContain("Adds b.");
    expect(user).toContain("Division by zero.");
    expect(user).toContain("     2 +const b = a / 0;"); // the added line, with its new-version line number
    const q = scriptedClient(['{"verdict": "invalid", "reason": "r"}']);
    await judgeValidity(q, { model: "Qwen/Qwen3-235B-A22B-Instruct-2507", reasoning: "off" }, pr, item);
    expect("chat_template_kwargs" in q.requests[0]!).toBe(false);
  });

  it("retries an invalid reply once, then counts the comment as unsure", async () => {
    const ok = await judgeValidity(scriptedClient(["nope", '{"verdict": "invalid", "reason": "r"}']), { model: "m", reasoning: "off" }, pr, item);
    expect(ok).toMatchObject({ verdict: "invalid", status: "answered", attempts: 2 });
    const bad = await judgeValidity(scriptedClient(["nope", "still nope"]), { model: "m", reasoning: "off" }, pr, item);
    expect(bad).toMatchObject({ verdict: "unsure", status: "invalid-reply", attempts: 2 });
  });

  it("a path not in the diff gets no request and counts as unsure; a failed request counts as unsure", async () => {
    const s = scriptedClient([]);
    const r = await judgeValidity(s, { model: "m", reasoning: "off" }, pr, { ...item, path: "src/other.ts" });
    expect(r).toMatchObject({ verdict: "unsure", status: "no-diff", attempts: 0 });
    expect(s.requests).toHaveLength(0);
    const f = await judgeValidity(s, { model: "m", reasoning: "off" }, pr, item); // no scripted reply: the request throws
    expect(f).toMatchObject({ verdict: "unsure", status: "failed", attempts: 1 });
  });
});

describe("dedupFps", () => {
  it("one item per pull request, path, line and body", () => {
    const c = { repo: "r", goldenIndex: 1, path: "a.ts", line: 3, body: "b" };
    const items = dedupFps([c, { ...c }, { ...c, line: 4 }, { ...c, goldenIndex: 2 }, { ...c, repo: "s" }, { ...c, body: "b " }, { ...c, line: null }, { ...c, line: null }]);
    expect(items.map((i) => i.key)).toEqual(["fp1", "fp2", "fp3", "fp4", "fp5", "fp6"]);
    expect(items[0]).toEqual({ key: "fp1", ...c });
  });
});

describe("cohenKappa", () => {
  it("hand-worked: 10 pairs, 7 agree, marginals 5/5 and 6/4 → p_o 0.7, p_e 0.5, kappa 0.4", () => {
    const pairs: [string, string][] = [...Array(4).fill(["a", "a"]), ["a", "b"], ...Array(3).fill(["b", "b"]), ["b", "a"], ["b", "a"]];
    const k = cohenKappa(pairs);
    expect(k.n).toBe(10);
    expect(k.observed).toBeCloseTo(0.7, 12);
    expect(k.expected).toBeCloseTo(0.5, 12);
    expect(k.kappa).toBeCloseTo(0.4, 12);
  });
  it("perfect agreement on more than one class is 1; one class only is undefined", () => {
    expect(cohenKappa([["a", "a"], ["b", "b"]]).kappa).toBe(1);
    expect(cohenKappa([["a", "a"], ["a", "a"]]).kappa).toBeNull();
    expect(cohenKappa([]).kappa).toBeNull();
  });
});

describe("kendallTauB", () => {
  it("hand-worked without ties: one discordant pair of six → 4/6", () => {
    expect(kendallTauB([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(4 / 6, 12);
  });
  it("hand-worked with ties: C 4, D 0, one tie in each list → 4 / sqrt(5 × 5) = 0.8", () => {
    expect(kendallTauB([1, 2, 2, 3], [1, 2, 3, 3])).toBeCloseTo(0.8, 12);
  });
  it("reversed order is −1", () => {
    expect(kendallTauB([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
  });
});

describe("augmentedPrecision", () => {
  const sv = new Map<string, Verdict>([["fp1", "valid"], ["fp2", "invalid"], ["fp3", "valid"]]);
  const qv = new Map<string, Verdict>([["fp1", "valid"], ["fp2", "valid"], ["fp3", "unsure"]]);
  const runs = [
    { run: "A", tp: 2, fp: 3, fpKeys: ["fp1", "fp2", "fp3"] },
    { run: "B", tp: 0, fp: 2, fpKeys: ["fp1", "fp1"] },
  ];
  it("(TP + FPs judged valid) / (TP + FP) under each judge and under both", () => {
    const ap = augmentedPrecision(["fp1", "fp2", "fp3"], sv, qv, runs);
    expect(ap.completed).toBe(true);
    if (!ap.completed) return;
    expect(ap.runs[0]).toMatchObject({ validSuper: 2, validQwen: 2, validBoth: 1, apSuper: 0.8, apQwen: 0.8, apBoth: 0.6 });
    expect(ap.runs[1]).toMatchObject({ validSuper: 2, validQwen: 2, validBoth: 2, apSuper: 1, apQwen: 1, apBoth: 1 });
  });
  it("partial-result rule: one missing verdict means no number for any run", () => {
    const partial = new Map(qv);
    partial.delete("fp3");
    expect(augmentedPrecision(["fp1", "fp2", "fp3"], sv, partial, runs)).toEqual({ completed: false, done: { superJudged: 3, qwenJudged: 2, both: 2, items: 3 } });
  });
  it("refuses FP keys that do not add up to the run's FP count", () => {
    expect(() => augmentedPrecision(["fp1", "fp2", "fp3"], sv, qv, [{ run: "C", tp: 1, fp: 2, fpKeys: ["fp1"] }])).toThrow(/FP keys/);
  });
});
