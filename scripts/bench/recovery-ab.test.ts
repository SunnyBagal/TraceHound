// Synthetic fixtures only; no network. Run with: node --test scripts/bench/recovery-ab.test.ts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import type { PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import { Budget } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { CacheMissError, TokenFactoryClient, type ChatRequest, type ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import type { GitSource } from "../../packages/analyzer/src/review/context.ts";
import { ARMS, ARM_IDS, attemptKind, budgetFor, compareJudge, CorpusClient, JOB_CAP_USD, MODEL, pipeline, REPOS, stageOf, storingFetch } from "./recovery-ab.ts";
import { pipeline as runnerPipeline } from "./run-test-set.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const DIFF = ["diff --git a/src/x.ts b/src/x.ts", "--- a/src/x.ts", "+++ b/src/x.ts", "@@ -1,1 +1,2 @@", " const a = 1;", "+const b = a.c;", ""].join("\n");
const INPUT = { title: "synthetic", description: "synthetic fixture", diff: DIFF, number: 1 };
const SOURCE: GitSource = { show: (p) => (p === "src/x.ts" ? "const a = 1;\nconst b = a.c;\n" : null), grep: () => [] };
const REPO = { source: SOURCE, head: "0".repeat(40) };
const FINDINGS = '{"findings":[{"path":"src/x.ts","line":2,"body":"a.c is undefined"}]}';
const VERDICT = '{"verdict":"keep","reason":"synthetic"}';

/** A fake model: reviewers get FINDINGS (or `firstReviewer` on a first attempt), the verifier VERDICT. */
function fake(firstReviewer?: { content: string; finishReason: string }) {
  const requests: ChatRequest[] = [];
  const client: ChatClient = {
    chat: async (request: ChatRequest): Promise<ChatResult> => {
      requests.push(request);
      const s = stageOf(request);
      const reviewer = s === "diff" || s === "ctx";
      const first = reviewer && attemptKind(request) === "first" && firstReviewer;
      return { content: first ? firstReviewer.content : reviewer ? FINDINGS : VERDICT, cached: false, latencyMs: 0, costUSD: 0, finishReason: first ? firstReviewer.finishReason : "stop" };
    },
  };
  return { client, requests };
}
const noWall = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "wallMs" || k === "latencyMs" ? 0 : v)));

test("the arms differ only in the two reviewer switches", () => {
  assert.deepEqual(ARM_IDS, ["A", "B1", "B2"]);
  assert.deepEqual(ARMS.A, {});
  assert.deepEqual(ARMS.B1, { parser: "lenient" });
  assert.deepEqual(ARMS.B2, { parser: "lenient", retryOnLength: "fresh" });
  assert.equal(MODEL, "nvidia/Nemotron-3.5-Super-VL");
});

test("dev repos only: Cal.com is not reachable", () => {
  assert.deepEqual([...REPOS], ["sentry", "grafana", "keycloak", "discourse"]);
  assert.ok(!REPOS.some((r) => /cal/i.test(r)));
});

test("arm A is run-test-set's pipeline: same requests, same records", async () => {
  const x = fake();
  const y = fake();
  const a = await pipeline(x.client, INPUT, REPO, ARMS.A);
  const b = await runnerPipeline(y.client, INPUT, REPO, MODEL);
  assert.deepEqual(x.requests, y.requests);
  assert.deepEqual(noWall(a), noWall(b));
  assert.equal(a.kept.length, 1); // the ctx finding agrees with the diff finding, so ctx-only is empty
});

test("with a strict-valid reply, all three arms send the same requests and keep the same findings", async () => {
  const runs = await Promise.all(ARM_IDS.map(async (arm) => {
    const f = fake();
    return { arm, out: await pipeline(f.client, INPUT, REPO, ARMS[arm]), requests: f.requests };
  }));
  for (const r of runs.slice(1)) {
    assert.deepEqual(r.requests, runs[0]!.requests, r.arm);
    assert.deepEqual(noWall(r.out.kept), noWall(runs[0]!.out.kept), r.arm);
  }
});

test("prose around the JSON: A retries (append), B1 and B2 accept the first reply", async () => {
  const prose = { content: `Here is my review.\n\`\`\`json\n${FINDINGS}\n\`\`\`\nDone.`, finishReason: "stop" };
  const a = fake(prose);
  await pipeline(a.client, INPUT, REPO, ARMS.A);
  assert.equal(a.requests.filter((r) => attemptKind(r) === "append-retry").length, 2); // diff + ctx
  for (const arm of ["B1", "B2"] as const) {
    const b = fake(prose);
    const out = await pipeline(b.client, INPUT, REPO, ARMS[arm]);
    assert.equal(b.requests.filter((r) => attemptKind(r) !== "first" && stageOf(r) !== "verify").length, 0, arm);
    assert.equal(out.diff.review.chunks[0]!.attempts, 1);
  }
});

test("a reply cut off at max_tokens: A and B1 append, B2 resends the original messages with reasoning off", async () => {
  const cut = { content: '{"findings":[{"path":"src/x.ts","li', finishReason: "length" };
  for (const [arm, kind] of [["A", "append-retry"], ["B1", "append-retry"], ["B2", "fresh-retry"]] as const) {
    const f = fake(cut);
    const out = await pipeline(f.client, INPUT, REPO, ARMS[arm]);
    const retries = f.requests.filter((r) => stageOf(r) === "diff" && attemptKind(r) !== "first");
    assert.equal(retries.length, 1, arm);
    assert.equal(attemptKind(retries[0]!), kind, arm);
    if (kind === "fresh-retry") {
      const first = f.requests.find((r) => stageOf(r) === "diff")!;
      assert.deepEqual(retries[0]!.messages, first.messages);
      assert.equal(retries[0]!.max_tokens, first.max_tokens);
      assert.deepEqual(retries[0]!.chat_template_kwargs, { enable_thinking: false });
    }
    assert.equal(out.diff.review.chunks[0]!.status, "OK", arm);
  }
});

function client(dir: string, opts: { offline: boolean; fetch?: typeof fetch }) {
  const corpus = new ResponseCache(join(dir, "corpus"));
  const tf = new TokenFactoryClient({
    apiKey: "test",
    prices: loadPriceTable(join(ROOT, "config/prices.json")),
    budget: new Budget({ runUSD: 1, totalUSD: 1 }, 0),
    ledger: new SpendLedger(join(dir, "spend.jsonl")),
    cache: corpus,
    readCache: true,
    offline: opts.offline,
    fetch: storingFetch(corpus, opts.fetch ?? (async () => { throw new Error("no network in tests"); })),
  });
  return { corpus, tf };
}
const REQ: ChatRequest = { model: MODEL, temperature: 0, max_tokens: 100, messages: [{ role: "system", content: "s" }, { role: "user", content: "u" }] };
const body = (content: string) => ({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });

test("corpus client: a shared-cache hit is read by key, copied, and then served from the corpus", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rab-"));
  const gets: string[] = [];
  const shared = { get: <T>(key: string) => (gets.push(key), (key === ResponseCache.key(REQ.model, REQ) ? body("hello") : undefined) as T | undefined) };
  const { corpus, tf } = client(dir, { offline: true });
  const cc = new CorpusClient({ corpus, shared, client: tf });
  cc.arm = "A";
  assert.equal((await cc.chat(REQ, { purpose: "review" })).content, "hello");
  cc.arm = "B1";
  assert.equal((await cc.chat(REQ, { purpose: "review" })).content, "hello");
  assert.deepEqual(cc.log.map((p) => p.source), ["shared", "corpus"]);
  assert.equal(gets.length, 1); // the second request never looked at the shared cache
  assert.equal(Object.keys(shared).join(), "get"); // nothing but get exists to call
  await assert.rejects(cc.chat({ ...REQ, max_tokens: 99 }, { purpose: "review" }), CacheMissError);
  assert.equal(cc.log.at(-1)!.source, "miss");
});

test("corpus client: a live reply is stored even with empty content, so no request goes out twice", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rab-"));
  let calls = 0;
  const f = (async () => (calls++, new Response(JSON.stringify(body("")), { status: 200, headers: { "content-type": "application/json" } }))) as unknown as typeof fetch;
  const { corpus, tf } = client(dir, { offline: false, fetch: f });
  const cc = new CorpusClient({ corpus, shared: { get: () => undefined }, client: tf });
  cc.arm = "A";
  await cc.chat(REQ, { purpose: "review" });
  cc.arm = "B2";
  const again = await cc.chat(REQ, { purpose: "review" });
  assert.equal(calls, 1);
  assert.equal(again.content, "");
  assert.deepEqual(cc.log.map((p) => [p.arm, p.source]), [["A", "fresh"], ["B2", "corpus"]]);
});

test("the job budget: run cap $4, total cap = ledger at start + $4, refused when the env run cap is lower", () => {
  assert.equal(JOB_CAP_USD, 4);
  assert.equal(budgetFor({}, 40).ok, false); // default TRACEHOUND_BUDGET_RUN_USD=1
  const b = budgetFor({ TRACEHOUND_BUDGET_RUN_USD: "4" }, 40.43804);
  assert.ok(b.ok);
  if (b.ok) assert.deepEqual(b.budget.caps, { runUSD: 4, totalUSD: 44.43804 });
  const c = budgetFor({ TRACEHOUND_BUDGET_RUN_USD: "4", TRACEHOUND_BUDGET_TOTAL_USD: "42" }, 40);
  if (c.ok) assert.equal(c.budget.caps.totalUSD, 42);
});

const det = (tp: number, fp: number, comments: { body: string; outcome: "tp" | "fp" }[] = [], status: "SCORED" | "JUDGE_FAILED" = "SCORED"): PullDetail => ({
  goldenIndex: 0, prTitle: "t", reviewFile: "x.json", status, golden: [],
  counts: { comments: tp + fp, tp, fp, duplicates: 0, lowMatched: 0, fn: 1, goldenCounted: tp + 1 },
  comments: comments.map((c, i) => ({ id: `T${i + 1}`, path: "p", line: 1, body: c.body, matched: null, outcome: c.outcome })),
});

test("E3 (devin's gate): no fewer TPs and no lower precision; recovered findings counted; unchanged pulls must score the same", () => {
  const a = new Map([["r/1", det(1, 1, [{ body: "x", outcome: "tp" }, { body: "y", outcome: "fp" }])], ["r/2", det(1, 0)]]);
  // r/1 changed: one more TP and one more FP → P 2/4 = 50% vs A 2/3: precision fails
  const b = new Map([["r/1", det(2, 2, [{ body: "x", outcome: "tp" }, { body: "y", outcome: "fp" }, { body: "z", outcome: "tp" }, { body: "w", outcome: "fp" }])], ["r/2", det(1, 0)]]);
  const c = compareJudge(a, b, new Set(["r/1"]), new Set());
  assert.equal(c.tpOk, true);
  assert.equal(c.precisionOk, false);
  assert.deepEqual(c.recovered, { tp: 1, fp: 1, duplicate: 0, low: 0 });
  // one more TP only → both pass
  const d = new Map([["r/1", det(2, 1, [{ body: "x", outcome: "tp" }, { body: "y", outcome: "fp" }, { body: "z", outcome: "tp" }])], ["r/2", det(1, 0)]]);
  const e = compareJudge(a, d, new Set(["r/1"]), new Set());
  assert.ok(e.tpOk && e.precisionOk);
  // an unchanged pull that scores differently is flagged; a changed pull that failed judging is counted
  const f = compareJudge(a, new Map([["r/1", det(1, 1, [], "JUDGE_FAILED")], ["r/2", det(0, 1)]]), new Set(["r/1"]), new Set());
  assert.equal(f.unchangedDiffer, 1);
  assert.equal(f.changedJudgeFailed, 1);
});
