// Synthetic fixtures only; no network. Run with: node --test scripts/bench/hard-chunks.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import type { ChatRequest, ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import type { GitSource } from "../../packages/analyzer/src/review/context.ts";
import { reviewPullWithContext } from "../../packages/analyzer/src/review/review-ctx.ts";
import { reviewPull } from "../../packages/analyzer/src/review/review.ts";
import { analyze, appendRetry, capturedFirsts, firstRequest, MIN_COMPLETE, MODEL, RESPONSE_FORMAT, runUnit, schemaRetry, splitHalves, type Plan, type Unit } from "./hard-chunks.ts";

const file = (p: string, hunks: string[]) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, ...hunks].join("\n") + "\n";
const H1 = "@@ -1,1 +1,2 @@\n const a = 1;\n+const b = a.c;";
const H2 = "@@ -10,1 +11,2 @@\n const x = 1;\n+const y = x.z;";
const DIFF = file("src/x.ts", [H1, H2]) + file("src/y.ts", [H1]);
const INPUT = { title: "synthetic", description: "synthetic fixture", diff: DIFF, number: 1 };
const SOURCE: GitSource = { show: () => "const a = 1;\nconst b = a.c;\n", grep: () => [] };
const FINDINGS = '{"findings":[{"path":"src/x.ts","line":2,"body":"a.c is undefined"}]}';

test("splitHalves: by files, else by hunks with the header repeated, else null", () => {
  const two = splitHalves(DIFF)!;
  assert.equal(two[0] + two[1], DIFF);
  assert.ok(two[0].includes("src/x.ts") && !two[0].includes("src/y.ts") && two[1].includes("src/y.ts"));
  const one = splitHalves(file("src/x.ts", [H1, H2]))!;
  assert.ok(one[0].startsWith("diff --git a/src/x.ts") && one[1].startsWith("diff --git a/src/x.ts"));
  assert.ok(one[0].includes("+const b") && one[1].includes("+const y"));
  assert.equal(splitHalves(file("src/x.ts", [H1])), null);
});

test("the rebuilt first requests equal the pipeline's, both stages", async () => {
  const seen = await capturedFirsts(INPUT, { source: SOURCE, head: "0".repeat(40) });
  assert.deepEqual(firstRequest("diff", INPUT, DIFF, 1, 1, SOURCE), seen.diff[0]);
  assert.deepEqual(firstRequest("ctx", INPUT, DIFF, 1, 1, SOURCE), seen.ctx[0]);
});

test("the append retry after an empty reply equals the pipeline's; the schema retry is the first request, reasoning off, with response_format", async () => {
  const reqs: ChatRequest[] = [];
  const c: ChatClient = { chat: async (r: ChatRequest): Promise<ChatResult> => (reqs.push(r), { content: reqs.length === 1 ? "" : FINDINGS, cached: false, latencyMs: 0, costUSD: 0, finishReason: "stop" }) };
  await reviewPull(c, INPUT, { model: MODEL });
  assert.deepEqual(appendRetry(reqs[0]!, "", "the reply is not valid JSON"), reqs[1]);
  reqs.length = 0;
  await reviewPullWithContext(c, INPUT, { source: SOURCE, head: "0".repeat(40) }, { model: MODEL });
  assert.deepEqual(appendRetry(reqs[0]!, "", "the reply is not valid JSON"), reqs[1]);
  const s = schemaRetry(reqs[0]!);
  assert.deepEqual(s.messages, reqs[0]!.messages);
  assert.equal(s.max_tokens, 32_000);
  assert.deepEqual(s.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(s.response_format, RESPONSE_FORMAT);
});

const plan = (): Plan => {
  const first = firstRequest("diff", INPUT, DIFF, 1, 1, SOURCE);
  const h = splitHalves(DIFF)!;
  return { chunk: { id: "r/1#diff0", pull: "r/1", stage: "diff", index: 0, runs: ["8"] }, input: INPUT, first, halves: [firstRequest("diff", INPUT, h[0], 1, 1, SOURCE), firstRequest("diff", INPUT, h[1], 1, 1, SOURCE)], key: "k" };
};
/** A fake model: the first request gets `first`; follow-ups are answered by kind. */
function model(first: { content: string; finishReason: string }, opts: { schemaStatus?: number } = {}) {
  const calls: string[] = [];
  const p = plan();
  const client: ChatClient = {
    chat: async (r: ChatRequest): Promise<ChatResult> => {
      const kind = (r as { response_format?: unknown }).response_format ? "schema" : r.messages.length > 2 ? "append" : JSON.stringify(r) === JSON.stringify(p.first) ? "first" : "half";
      calls.push(kind);
      if (kind === "schema" && opts.schemaStatus) throw new Error(`HTTP ${opts.schemaStatus}: response_format not supported`);
      const content = kind === "first" ? first.content : FINDINGS;
      return { content, cached: false, latencyMs: 10, costUSD: 0.01, finishReason: kind === "first" ? first.finishReason : "stop", outputTokens: 100, reasoningTokens: kind === "first" && !first.content ? 100 : 10 };
    },
  };
  return { client, calls, plan: p };
}

test("valid first reply: one call, every arm the same", async () => {
  const m = model({ content: FINDINGS, finishReason: "stop" });
  const u = await runUnit(m.client, m.plan, 1, { schemaDropped: false }, () => {});
  assert.deepEqual(m.calls, ["first"]);
  assert.equal(u.path, "valid");
  assert.deepEqual(u.arms!.A, u.arms!.D);
  assert.ok(u.arms!.A.success && u.complete);
});

test("non-empty invalid first reply: the shared append retry for every arm", async () => {
  const m = model({ content: "not json", finishReason: "stop" });
  const u = await runUnit(m.client, m.plan, 1, { schemaDropped: false }, () => {});
  assert.deepEqual(m.calls, ["first", "append"]);
  assert.equal(u.path, "invalid");
  assert.deepEqual(u.arms!.A, u.arms!.E);
});

test("empty first reply: A appends, D reviews two halves, E sends the schema retry; costs and wall times per arm", async () => {
  const m = model({ content: "", finishReason: "length" });
  const u = await runUnit(m.client, m.plan, 1, { schemaDropped: false }, () => {});
  assert.deepEqual([...m.calls].sort(), ["append", "first", "half", "half", "schema"]);
  assert.equal(u.path, "empty");
  assert.ok(u.arms!.A.success && u.arms!.D.success && u.arms!.E.success);
  assert.ok(Math.abs(u.arms!.A.costUSD - 0.02) < 1e-12 && Math.abs(u.arms!.D.costUSD - 0.03) < 1e-12 && Math.abs(u.arms!.E.costUSD - 0.02) < 1e-12);
  assert.equal(u.arms!.D.wallMs, 20); // the halves run side by side
  assert.ok(u.complete);
});

test("the endpoint refusing response_format (HTTP 4xx) drops E: no further schema calls", async () => {
  const state = { schemaDropped: false };
  const m = model({ content: "", finishReason: "length" }, { schemaStatus: 400 });
  const u = await runUnit(m.client, m.plan, 1, state, () => {});
  assert.equal(state.schemaDropped, true);
  assert.equal(u.arms!.E.note, "E unsupported");
  const m2 = model({ content: "", finishReason: "length" });
  const u2 = await runUnit(m2.client, m2.plan, 2, state, () => {});
  assert.ok(!m2.calls.includes("schema"));
  assert.equal(u2.schema, "dropped");
  assert.equal(analyze([u, u2], true).gate.E, "DROPPED (unsupported)");
});

const unit = (a: boolean, d: boolean, cost = { A: 0.02, D: 0.03 }): Unit => ({
  chunk: "c", draw: 1, path: "empty", complete: true,
  arms: { A: { success: a, valid: a, kept: a ? 1 : 0, costUSD: cost.A, wallMs: 1, complete: true }, D: { success: d, valid: d, kept: d ? 2 : 0, costUSD: cost.D, wallMs: 1, complete: true }, E: { success: false, valid: false, kept: 0, costUSD: cost.A, wallMs: 1, complete: true } },
});

test("gate: at least max(1.5 × A, A + 1) successes at no more than 1.5 × A's cost per unit, on ≥ MIN_COMPLETE units", () => {
  const n = MIN_COMPLETE;
  const mk = (aS: number, dS: number, cost?: { A: number; D: number }) => Array.from({ length: n }, (_, i) => unit(i < aS, i < dS, cost));
  assert.equal(analyze(mk(10, 15), false).gate.D, "WIN");
  assert.equal(analyze(mk(10, 14), false).gate.D, "NO WIN");
  assert.equal(analyze(mk(0, 1), false).gate.D, "WIN");
  assert.equal(analyze(mk(0, 0), false).gate.D, "NO WIN");
  assert.equal(analyze(mk(10, 15, { A: 0.02, D: 0.031 }), false).gate.D, "NO WIN"); // 0.031 > 1.5 × 0.02
  assert.equal(analyze(mk(10, 15).slice(0, n - 1), false).gate.D, "INCONCLUSIVE");
  const r = analyze(mk(10, 15), false).rows;
  assert.equal(r.D.keptPerSuccess, 2);
  assert.ok(Math.abs(r.D.costPerUnit - 0.03) < 1e-12);
});

// ---- codex 074 review: points 1–6 ----
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetExceededError } from "../../packages/analyzer/src/llm/budget.ts";
import { hardChunks, SOURCE_RUNS, type SchemaState } from "./hard-chunks.ts";

function benchWith(pulls: Record<string, { repo: string; file: string; attempts: number }[]>) {
  const b = mkdtempSync(join(tmpdir(), "hc-"));
  for (const dir of Object.values(SOURCE_RUNS)) {
    mkdirSync(join(b, "reviews/dev-repeat", dir), { recursive: true });
    writeFileSync(join(b, "reviews/dev-repeat", dir, "run.json"), JSON.stringify({ pulls: pulls[dir] ?? [] }));
  }
  return b;
}

test("pull records are checked before any path is built from them: other repos, odd file names, odd attempts refuse", () => {
  const d = SOURCE_RUNS["8"];
  for (const bad of [{ repo: "cal_dot_com", file: "0.json", attempts: 1 }, { repo: "sentry", file: "../../x.json", attempts: 1 }, { repo: "sentry", file: "0.json", attempts: 3 }])
    assert.throws(() => hardChunks(benchWith({ [d]: [bad] })), /unexpected pull record/);
});

test("the set must be the registered 20 failures / 14 distinct requests", () => {
  assert.throws(() => hardChunks(benchWith({})), /0 failures \/ 0 distinct, expected 20 \/ 14/);
});

const EMPTY = { content: "", finishReason: "length" };
function slowModel(o: { halfThrows?: boolean; schemaError?: string; schemaDelay?: number; halfContent?: string[]; log?: { start: number; end: number }[] } = {}) {
  const p = plan();
  const live = { active: 0, max: 0, schemaCalls: 0 };
  let half = 0;
  const client: ChatClient = {
    chat: async (r: ChatRequest): Promise<ChatResult> => {
      const kind = (r as { response_format?: unknown }).response_format ? "schema" : r.messages.length > 2 ? "append" : JSON.stringify(r) === JSON.stringify(p.first) ? "first" : "half";
      if (kind === "half" && o.halfThrows) throw new BudgetExceededError("cap");
      live.active++;
      live.max = Math.max(live.max, live.active);
      if (kind === "schema") live.schemaCalls++;
      const start = performance.now();
      await new Promise((res) => setTimeout(res, kind === "append" ? 40 : kind === "schema" ? (o.schemaDelay ?? 5) : 5));
      if (kind === "schema") o.log?.push({ start, end: performance.now() });
      live.active--;
      if (kind === "schema" && o.schemaError) throw new Error(o.schemaError);
      const content = kind === "first" ? EMPTY.content : kind === "half" && o.halfContent ? o.halfContent[half++]! : FINDINGS;
      return { content, cached: false, latencyMs: 10, costUSD: 0.01, finishReason: kind === "first" ? "length" : "stop" };
    },
  };
  return { client, plan: p, live };
}

test("at a cap refusal inside a unit, every sibling call already sent finishes, and the unit keeps its partial record", async () => {
  const m = slowModel({ halfThrows: true });
  const u = await runUnit(m.client, m.plan, 1, { schemaDropped: false }, () => {});
  assert.equal(m.live.active, 0); // the slow append retry was awaited
  assert.match(u.capStop!, /BudgetExceededError/);
  assert.equal(u.complete, false);
  assert.ok(u.first && u.shared && u.schema && u.shared.ok); // the partial unit keeps what it received
  assert.equal(u.arms, undefined);
});

test("E's probe: a fast feature refusal stops E in a concurrent unit, even while the first unit's siblings are still running", async () => {
  const state: SchemaState = { schemaDropped: false };
  const a = slowModel({ schemaError: "HTTP 400: response_format json_schema is not supported for this model" });
  const b = slowModel();
  const [ua, ub] = await Promise.all([runUnit(a.client, a.plan, 1, state, () => {}), runUnit(b.client, b.plan, 1, state, () => {})]);
  assert.equal(state.schemaDropped, true);
  assert.equal(a.live.schemaCalls + b.live.schemaCalls, 1);
  assert.equal(ua.arms!.E.note, "E unsupported");
  assert.equal(ub.schema, "dropped");
});

test("a 4xx that is not about the schema (e.g. 429) does not drop E: that unit is incomplete, the next one probes again", async () => {
  const state: SchemaState = { schemaDropped: false };
  const a = slowModel({ schemaError: "HTTP 429: rate limit exceeded" });
  const ua = await runUnit(a.client, a.plan, 1, state, () => {});
  assert.equal(state.schemaDropped, false);
  assert.equal(ua.complete, false);
  const b = slowModel();
  const ub = await runUnit(b.client, b.plan, 2, state, () => {});
  assert.equal(b.live.schemaCalls, 1);
  assert.ok(ub.arms!.E.success && ub.complete);
});

test("D: any valid half with a kept finding is a success (noted 'one half'); the same finding from both halves counts once", async () => {
  const one = slowModel({ halfContent: [FINDINGS, "not json"] });
  const u1 = await runUnit(one.client, one.plan, 1, { schemaDropped: false }, () => {});
  assert.equal(u1.arms!.D.success, true);
  assert.equal(u1.arms!.D.valid, false);
  assert.equal(u1.arms!.D.note, "one half");
  const both = slowModel({ halfContent: [FINDINGS, FINDINGS] });
  const u2 = await runUnit(both.client, both.plan, 1, { schemaDropped: false }, () => {});
  assert.equal(u2.arms!.D.kept, 1);
});

test("E: a refusal after a successful probe still drops E at once for every later unit", async () => {
  const state: SchemaState = { schemaDropped: false };
  const ok = slowModel();
  await runUnit(ok.client, ok.plan, 1, state, () => {});
  assert.equal(state.probeDone, true);
  const refuse = slowModel({ schemaError: "HTTP 400: response_format is not supported" });
  const u = await runUnit(refuse.client, refuse.plan, 2, state, () => {});
  assert.equal(state.schemaDropped, true);
  assert.equal(u.arms!.E.note, "E unsupported");
  const later = slowModel();
  await runUnit(later.client, later.plan, 3, state, () => {});
  assert.equal(later.live.schemaCalls, 0);
});

test("E: after a transient probe error, the waiting units send exactly one new probe, not one each", async () => {
  const state: SchemaState = { schemaDropped: false };
  const first = slowModel({ schemaError: "HTTP 503: overloaded", schemaDelay: 30 });
  const log: { start: number; end: number }[] = [];
  const waiters = [slowModel({ log, schemaDelay: 15 }), slowModel({ log, schemaDelay: 15 }), slowModel({ log, schemaDelay: 15 })];
  const p1 = runUnit(first.client, first.plan, 1, state, () => {});
  await new Promise((r) => setTimeout(r, 5)); // the probe is out; three more units arrive
  const ws = waiters.map((w, i) => runUnit(w.client, w.plan, i + 2, state, () => {}));
  await Promise.all([p1, ...ws]);
  // one replacement probe went out alone; only after it returned did the other two go
  assert.equal(log.length, 3);
  const [p, ...rest] = [...log].sort((x, y) => x.start - y.start);
  for (const r of rest) assert.ok(r.start >= p!.end, "a waiter sent E while the replacement probe was out");
  assert.equal(state.probeDone, true);
});
