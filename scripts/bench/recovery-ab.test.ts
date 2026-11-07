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

// ---- the A2 review's points: single flight, coverage, the bench folder, the cap, an end-to-end run ----

test("single flight: identical requests in flight together are sent once and get the same bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rab-"));
  let calls = 0;
  const f = (async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return new Response(JSON.stringify(body(`reply-${calls}`)), { status: 200 });
  }) as unknown as typeof fetch;
  const { corpus, tf } = client(dir, { offline: false, fetch: f });
  const cc = new CorpusClient({ corpus, shared: { get: () => undefined }, client: tf });
  cc.arm = "A";
  const [x, y] = await Promise.all([cc.chat(REQ, { purpose: "review" }), cc.chat(REQ, { purpose: "review" })]);
  assert.equal(calls, 1);
  assert.equal(x.content, y.content);
  assert.deepEqual(cc.log.map((p) => p.source).sort(), ["fresh", "joined"]);
  cc.arm = "B1";
  assert.equal((await cc.chat(REQ, { purpose: "review" })).content, x.content);
});

test("the bench folder must resolve outside the repository, symlinks included", async () => {
  const { checkBench } = await import("./recovery-ab.ts");
  const t = mkdtempSync(join(tmpdir(), "rab-"));
  const { mkdirSync, symlinkSync } = await import("node:fs");
  mkdirSync(join(t, "repo/sub"), { recursive: true });
  mkdirSync(join(t, "bench"));
  symlinkSync(join(t, "repo/sub"), join(t, "alias"));
  assert.equal(checkBench(join(t, "repo/sub"), join(t, "repo")).ok, false);
  assert.equal(checkBench(join(t, "repo"), join(t, "repo")).ok, false);
  assert.equal(checkBench(join(t, "alias"), join(t, "repo")).ok, false);
  assert.equal(checkBench(join(t, "bench"), join(t, "repo")).ok, true);
  assert.equal(checkBench(ROOT).ok, false); // this repository itself
});

// A synthetic bench: 40 dev pull requests, one golden comment each. sentry/0's diff chunk is the
// case the switches target: the first reply has prose around valid JSON and the correction retry is
// invalid, so A loses the chunk and B1/B2 keep it.
async function syntheticBench(opts: { pulls?: number; judgeFails?: string } = {}) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const t = mkdtempSync(join(tmpdir(), "rab-"));
  const bench = join(t, "bench");
  for (const repo of REPOS) {
    const n = repo === "discourse" && opts.pulls ? opts.pulls - 30 : 10;
    mkdirSync(join(bench, "prs", repo), { recursive: true });
    mkdirSync(join(bench, "repos"), { recursive: true });
    const heads: Record<string, { head: string }> = {};
    for (let i = 0; i < n; i++) {
      writeFileSync(join(bench, "prs", repo, `${i}.json`), JSON.stringify({ title: `${repo} pull ${i}`, description: "synthetic", diff: DIFF, number: i }));
      heads[String(i)] = { head: "0".repeat(40) };
    }
    writeFileSync(join(bench, "repos", `${repo}.heads.json`), JSON.stringify(heads));
    mkdirSync(join(bench, "golden/code_review_benchmarks"), { recursive: true });
    writeFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ pr_title: `${repo} pull ${i}`, comments: [{ comment: "a.c is undefined", severity: "High" }] }))));
  }
  const live = { active: 0, calls: 0 };
  const f = (async (_url: string, init: RequestInit) => {
    live.active++;
    live.calls++;
    await new Promise((r) => setTimeout(r, 2));
    const req = JSON.parse(init.body as string) as ChatRequest;
    const s = stageOf(req);
    const user = req.messages[1]!.content ?? "";
    let content: string;
    if (s === "judge") {
      const tools = [...user.matchAll(/^(T\d+) \(/gm)].map((m) => m[1]!);
      content = opts.judgeFails && user.includes(`Pull request: ${opts.judgeFails}\n`) ? "no json" : JSON.stringify({ matches: tools.map((t, i) => ({ tool: t, golden: i === 0 ? "G1" : null })) });
    } else if (s === "verify") content = VERDICT;
    else if (s === "diff" && user.includes("sentry pull 0")) content = attemptKind(req) === "first" ? `Review:\n\`\`\`json\n${FINDINGS}\n\`\`\`\nend` : "still not json";
    else if (s === "ctx" && user.includes("sentry pull 0")) content = '{"findings":[]}';
    else content = FINDINGS;
    live.active--;
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const lines: string[] = [];
  const deps = {
    bench, stateDir: join(t, "state"), pricesFile: join(ROOT, "config/prices.json"), env: { TRACEHOUND_BUDGET_RUN_USD: "4", NEBIUS_API_KEY: "test" } as NodeJS.ProcessEnv,
    log: (l: string) => lines.push(l), err: () => {}, fetch: f, freezeCheck: () => ({ ok: true, head: "test" }), shared: { get: () => undefined }, source: () => SOURCE,
  };
  return { bench, deps, live, lines };
}

test("end to end: A loses one chunk, B1 and B2 recover it, coverage complete, verdict PASS (B2)", async () => {
  const { runJob, analyze, outDir } = await import("./recovery-ab.ts");
  const { bench, deps, live } = await syntheticBench();
  assert.equal(await runJob("run", deps), 0);
  assert.equal(live.active, 0);
  const r = analyze(outDir(bench), new SpendLedger(join(deps.stateDir, "spend.jsonl")).totalUSD());
  assert.deepEqual(r.coverage, { ok: true, problems: [] });
  assert.equal(r.arms.A!.chunkFailed.total, 1);
  assert.equal(r.arms.B1!.chunkFailed.total, 0);
  assert.equal(r.arms.A!.emptyByFailure, 1); // sentry/0: the ctx reply had no findings
  assert.equal(r.changedPulls.B1, 1);
  assert.equal(r.firstAttempts.failedChunks, 1);
  assert.equal(r.e4.lenientDiffers, 0);
  assert.deepEqual(r.unpairedPulls, []);
  for (const j of ["judge-v1", "judge-x1"]) assert.equal(r.judges[j]!.B2!.x.tp, r.judges[j]!.B2!.a.tp + 1);
  assert.equal(r.verdict.overall, "PASS");
  assert.equal(r.verdict.adopted, "B2");
});

test("a pull request that fails judging in every arm makes the result INCONCLUSIVE, not a silent drop", async () => {
  const { runJob, analyze, outDir } = await import("./recovery-ab.ts");
  const { bench, deps, live } = await syntheticBench({ judgeFails: "grafana pull 3" });
  assert.equal(await runJob("run", deps), 0);
  const r = analyze(outDir(bench), new SpendLedger(join(deps.stateDir, "spend.jsonl")).totalUSD());
  assert.equal(r.coverage.ok, false);
  assert.equal(r.verdict.overall, "INCONCLUSIVE");
});

test("not the expected 40 pull requests: refused before any call", async () => {
  const { runJob } = await import("./recovery-ab.ts");
  const { deps, live } = await syntheticBench({ pulls: 39 });
  assert.equal(await runJob("run", deps), 1);
  assert.equal(live.calls, 0);
});

test("at the cap: nothing new is sent, in-flight calls finish before the final snapshot, every charge is attributed", async () => {
  const { runJob, outDir } = await import("./recovery-ab.ts");
  const { readFileSync } = await import("node:fs");
  const { bench, deps, live } = await syntheticBench();
  // reviewer reservations are ≈ $0.029, verifier ones ≈ $0.014: the fourth concurrent verifier reservation crosses $0.05
  const FOUR = '{"findings":[' + [1, 2, 3, 4].map((i) => `{"path":"src/x.ts","line":2,"body":"finding ${i}"}`).join(",") + "]}";
  const inner = deps.fetch;
  deps.fetch = (async (url: string, init: RequestInit) => {
    const req = JSON.parse(init.body as string) as ChatRequest;
    if (stageOf(req) === "diff" || stageOf(req) === "ctx") {
      live.calls++;
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: FOUR } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 });
    }
    return inner(url, init);
  }) as unknown as typeof fetch;
  deps.env = { ...deps.env, TRACEHOUND_BUDGET_TOTAL_USD: "0.05" };
  assert.equal(await runJob("run", deps), 2);
  assert.equal(live.active, 0);
  const prov = JSON.parse(readFileSync(join(outDir(bench), "provenance.json"), "utf8")) as { source: string; ok: boolean; costUSD: number }[];
  const ledger = readFileSync(join(deps.stateDir, "spend.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { estCostUSD: number });
  assert.equal(prov.filter((p) => p.source === "fresh" && p.ok).length, ledger.length);
  assert.ok(Math.abs(prov.reduce((s, p) => s + p.costUSD, 0) - ledger.reduce((s, e) => s + e.estCostUSD, 0)) < 1e-12);
  const run = JSON.parse(readFileSync(join(outDir(bench), "run.json"), "utf8")) as { status: string };
  assert.equal(run.status, "stopped-at-cap");
});

test("an unpaired pull request makes an otherwise passing result INCONCLUSIVE; E3 always covers all 40", async () => {
  const { runJob, analyze, outDir } = await import("./recovery-ab.ts");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { bench, deps } = await syntheticBench();
  assert.equal(await runJob("run", deps), 0);
  const spend = new SpendLedger(join(deps.stateDir, "spend.jsonl")).totalUSD();
  assert.equal(analyze(outDir(bench), spend).verdict.overall, "PASS");
  for (const j of ["judge-v1", "judge-x1"]) assert.equal(analyze(outDir(bench), spend).judges[j]!.B2!.scoredBoth, 40);
  // the same request recorded as sent live in a second arm (as a transient failure and resend would): unpaired
  const f = join(outDir(bench), "provenance.json");
  const prov = JSON.parse(readFileSync(f, "utf8")) as { arm: string; pull: string; source: string; costUSD: number }[];
  const sent = prov.find((p) => p.arm === "A" && p.pull === "grafana/1" && p.source === "fresh")!;
  writeFileSync(f, JSON.stringify([...prov, { ...sent, arm: "B1", callId: 1e9, costUSD: 0 }]));
  const r = analyze(outDir(bench), spend);
  assert.deepEqual(r.unpairedPulls, ["grafana/1"]);
  assert.equal(r.coverage.ok, false);
  assert.equal(r.verdict.overall, "INCONCLUSIVE");
  assert.equal(r.verdict.B2!.pass, false);
});

// ---- 073a: the transport and the restart ----

test("longFetch: same status, body and headers as the server sent; the caller's signal ends it", async () => {
  const { longFetch } = await import("./recovery-ab.ts");
  const { createServer } = await import("node:http");
  const seen: { method?: string; body: string; auth?: string } = { body: "" };
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      Object.assign(seen, { method: req.method, body: b, auth: req.headers.authorization });
      if (b === "slow") return; // never answers
      setTimeout(() => res.writeHead(201, { "content-type": "application/json", "x-test": "1" }).end('{"ok":true}'), 30);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/chat`;
  try {
    const res = await longFetch(url, { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: '{"a":1}' });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("x-test"), "1");
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(seen, { method: "POST", body: '{"a":1}', auth: "Bearer t" });
    await assert.rejects(longFetch(url, { method: "POST", body: "slow", signal: AbortSignal.timeout(50) }));
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("the job budget across a restart: only the rest of the $4 is left, total cap from the job's start", () => {
  const b = budgetFor({ TRACEHOUND_BUDGET_RUN_USD: "4" }, 40.78219, 40.43804);
  assert.ok(b.ok);
  if (b.ok) {
    assert.ok(Math.abs(b.budget.caps.runUSD - (4 - (40.78219 - 40.43804))) < 1e-9);
    assert.equal(b.budget.caps.totalUSD, 44.43804);
    assert.equal(b.budget.spentBeforeRun, 40.78219);
  }
  assert.equal(budgetFor({ TRACEHOUND_BUDGET_RUN_USD: "4" }, 44.5, 40.43804).ok, false);
});

test("restart: once, after a run that did not complete; the void run is untouched and its replies are carried by key", async () => {
  const { runJob, analyze, outDir } = await import("./recovery-ab.ts");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { bench, deps, live } = await syntheticBench();
  assert.equal(await runJob("run", deps, { restart: true }), 1); // nothing to restart
  assert.equal(await runJob("run", deps), 0);
  assert.equal(await runJob("run", deps, { restart: true }), 1); // a complete run is not restarted
  const vf = join(outDir(bench), "run.json");
  const v = JSON.parse(readFileSync(vf, "utf8"));
  writeFileSync(vf, JSON.stringify({ ...v, status: "running" })); // as if the process had died
  const before = readFileSync(vf, "utf8");
  const callsBefore = live.calls;
  assert.equal(await runJob("run", deps, { restart: true }), 0);
  assert.equal(live.calls, callsBefore); // every request came from the void run's corpus
  assert.equal(readFileSync(vf, "utf8"), before);
  const r = JSON.parse(readFileSync(join(outDir(bench, false, true), "run.json"), "utf8"));
  assert.equal(r.restartOf.status, "running");
  assert.equal(r.ledgerStartUSD, v.ledgerStartUSD);
  const spend = new SpendLedger(join(deps.stateDir, "spend.jsonl")).totalUSD();
  const a = analyze(outDir(bench, false, true), spend - r.ledgerRunStartUSD, spend - r.ledgerStartUSD);
  assert.equal(a.verdict.overall, "PASS");
  assert.equal(a.firstAttempts.carried, a.firstAttempts.total);
  assert.equal(await runJob("run", deps, { restart: true }), 1); // one restart only
});

test("longFetch: a bodyless status gets a null body; a response that cannot be built rejects the promise", async () => {
  const { longFetch } = await import("./recovery-ab.ts");
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    if (req.url === "/204") res.writeHead(204).end();
    else res.writeHead(999).end("x"); // a status Response() refuses (RangeError)
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const r = await longFetch(`${base}/204`, { method: "POST", body: "{}" });
    assert.equal(r.status, 204);
    assert.equal(r.body, null);
    await assert.rejects(longFetch(`${base}/999`, { method: "POST", body: "{}" }), RangeError);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("storingFetch stores HTTP 200 bodies only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rab-"));
  const corpus = new ResponseCache(join(dir, "corpus"));
  for (const status of [200, 201]) {
    const req = { ...REQ, max_tokens: status };
    const f = storingFetch(corpus, (async () => new Response(JSON.stringify(body("x")), { status })) as unknown as typeof fetch);
    await f("http://unused", { method: "POST", body: JSON.stringify(req) });
    assert.equal(corpus.get(ResponseCache.key(req.model, req)) !== undefined, status === 200, String(status));
  }
});
