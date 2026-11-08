// Synthetic fixtures only; no network. Run with: node --test scripts/bench/verify-074.test.ts
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { BudgetExceededError } from "../../packages/analyzer/src/llm/budget.ts";
import type { ChatRequest, ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import type { GitSource } from "../../packages/analyzer/src/review/context.ts";
import { verifyReviewWithContext, type CtxVerifiedComment } from "../../packages/analyzer/src/review/verify-ctx.ts";
import type { ArmOutcome, Unit } from "./hard-chunks.ts";
import { firstRequest } from "./hard-chunks.ts";
import { JobStoppedError, stageOf } from "./recovery-ab.ts";
import {
  analyze075,
  bodyFile,
  chunkReviews,
  distinctFindings,
  expectedUSD,
  extractFindings,
  findingKey,
  gate075,
  gateBoth,
  JobClient,
  judgeTag,
  outDir,
  POPULATION,
  populationCheck,
  reportFromRecords,
  runJob,
  VERIFY_MODEL,
  VERIFY_OPTS,
  verifyTag,
  type Accounting,
  type CallRec,
  type Deps,
  type Flags,
  type Occ,
  type Row,
  type ScoreRec,
  type Sources,
} from "./verify-074.ts";

const file = (p: string, hunks: string[]) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, ...hunks].join("\n") + "\n";
const H1 = "@@ -1,1 +1,2 @@\n const a = 1;\n+const b = a.c;";
const H2 = "@@ -10,1 +11,2 @@\n const x = 1;\n+const y = x.z;";
const DIFF = file("src/x.ts", [H1, H2]) + file("src/y.ts", [H1]);
const SOURCE: GitSource = { show: () => "const a = 1;\nconst b = a.c;\n", grep: () => [] };
const F1 = { path: "src/x.ts", line: 2, body: "a.c is undefined" };
const F2 = { path: "src/y.ts", line: 2, body: "b may be undefined in y" };
const F3 = { path: "src/x.ts", line: 12, body: "x.z is never set (the verifier drops this one)" };
const OFF_DIFF = { path: "src/nope.ts", line: 1, body: "not in the diff" };
const reply = (...fs: object[]) => JSON.stringify({ findings: fs });

const arm = (success: boolean, kept: number): ArmOutcome => ({ success, valid: success, kept, costUSD: 0.01, wallMs: 10, complete: true });
function unit(chunk: string, draw: number, path: "valid" | "invalid" | "empty", A: ArmOutcome, E: ArmOutcome = A): Unit {
  return { chunk, draw, path, arms: { A, D: A, E }, complete: true };
}
/** Three paths: grafana/0 has two hard chunks (pooled); sentry/5 has two empty-first draws. */
function fixture() {
  const units: Unit[] = [
    unit("grafana/0#diff0", 1, "valid", arm(true, 1)),
    unit("grafana/0#ctx0", 1, "invalid", arm(true, 1)),
    unit("sentry/5#ctx0", 1, "empty", arm(true, 1), arm(true, 3)),
    unit("sentry/5#ctx0", 2, "empty", arm(false, 0), arm(true, 1)),
  ];
  const bodies: Record<string, string> = {
    "grafana/0#diff0|1|first": reply(F1, OFF_DIFF),
    "grafana/0#ctx0|1|first": "not json",
    "grafana/0#ctx0|1|append": reply(F2),
    "sentry/5#ctx0|1|first": "",
    "sentry/5#ctx0|1|append": reply(F1),
    "sentry/5#ctx0|1|schema": reply(F1, F2, F3),
    "sentry/5#ctx0|2|first": "",
    "sentry/5#ctx0|2|append": "still not json",
    "sentry/5#ctx0|2|schema": reply(F3),
  };
  const src: Sources = { body: (c, d, n) => bodies[`${c}|${d}|${n}`] ?? null, diff: () => DIFF };
  return { units, bodies, src };
}
const strip = (o: Occ) => ({ chunk: o.chunk, draw: o.draw, finding: o.finding });

test("findings per arm: valid → the first reply for both; invalid → the shared append retry for both; empty → A append, E schema", () => {
  const { units, src } = fixture();
  const x = extractFindings(units, src);
  assert.equal(x.units, 4);
  assert.equal(x.complete, 4);
  assert.deepEqual(x.paths, { valid: 1, invalid: 1, empty: 2 });
  assert.deepEqual(x.successes, { A: 3, E: 4 });
  assert.deepEqual(x.successesEmpty, { A: 1, E: 2 });
  const of = (a: "A" | "E", path: string) => x.occ.filter((o) => o.arm === a && o.unitPath === path).map(strip);
  assert.deepEqual(of("A", "valid"), [{ chunk: "grafana/0#diff0", draw: 1, finding: F1 }]); // the off-diff finding is not kept
  assert.deepEqual(of("A", "invalid"), [{ chunk: "grafana/0#ctx0", draw: 1, finding: F2 }]);
  assert.deepEqual(of("A", "empty"), [{ chunk: "sentry/5#ctx0", draw: 1, finding: F1 }]);
  assert.deepEqual(of("E", "empty"), [
    { chunk: "sentry/5#ctx0", draw: 1, finding: F1 },
    { chunk: "sentry/5#ctx0", draw: 1, finding: F2 },
    { chunk: "sentry/5#ctx0", draw: 1, finding: F3 },
    { chunk: "sentry/5#ctx0", draw: 2, finding: F3 },
  ]);
  assert.ok(x.occ.every((o) => o.pull === o.chunk.split("#")[0] && o.key === findingKey(o.finding)));
});

test("A and E are identical on the shared paths; any inconsistency with units.json refuses", () => {
  const { units, bodies, src } = fixture();
  const x = extractFindings(units, src);
  for (const path of ["valid", "invalid"]) assert.deepEqual(x.occ.filter((o) => o.arm === "A" && o.unitPath === path).map(strip), x.occ.filter((o) => o.arm === "E" && o.unitPath === path).map(strip));
  const bad = (us: Unit[], re: RegExp, s: Sources = src) => assert.throws(() => extractFindings(us, s), re);
  bad([unit("grafana/0#diff0", 1, "valid", arm(true, 1), arm(true, 2))], /A and E differ/);
  bad([unit("grafana/0#diff0", 1, "valid", arm(true, 2))], /units.json says 2/);
  bad([unit("grafana/0#diff0", 1, "valid", arm(true, 1))], /no kept finding/, { ...src, body: (c, d, n) => (n === "first" ? reply(OFF_DIFF) : (bodies[`${c}|${d}|${n}`] ?? null)) });
  bad([unit("grafana/0#diff0", 1, "valid", arm(true, 1))], /no first body/, { ...src, body: () => null });
  bad([unit("grafana/0#diff0", 1, "valid", arm(false, 0))], /recorded as no success/);
  bad([unit("calcom/1#diff0", 1, "valid", arm(true, 1))], /not a dev repo/);
  bad([unit("cal_dot_com/1#diff0", 1, "valid", arm(true, 1))], /unexpected chunk id/);
  bad([unit("../x/1#diff0", 1, "valid", arm(true, 1))], /unexpected chunk id/);
  bad([units[0]!, units[0]!], /duplicate unit/);
  bad([unit("grafana/0#diff0", 4, "valid", arm(true, 1))], /draw out of range/);
  bad([...units, { chunk: "sentry/5#ctx0", draw: 3, complete: false, path: "empty", capStop: "x" }], /incomplete unit/); // no silent exclusion
  bad([{ ...units[0]!, arms: undefined }], /incomplete unit/);
});

const row = (a: "A" | "E", tp: number, fp: number): Row => ({ arm: a, found: 0, kept: 0, verifyFailed: 0, tp, fp, duplicates: 0, low: 0, precision: tp + fp ? tp / (tp + fp) : null, distinctGoldens: 0 });
const NO_CALLS: Accounting = { calls: [], ledgerUSD: 0, budgetUSD: 0 };
const OK: Flags = { status: "complete", judgeFailed: 0, verifyRequestFailures: 0, unverified: 0, unjudged: 0 };
const verdict = (f: { path: string; line: number; body: string }, keep: boolean | "failed", failure?: string): CtxVerifiedComment =>
  ({ ...f, verdict: keep === "failed" ? null : keep ? "keep" : "drop", reason: "r", status: keep === "failed" ? "VERIFY_FAILED" : "VERIFIED", attempts: 1, ...(failure && { failure }), context: {} as CtxVerifiedComment["context"], usage: { calls: 1, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0.01, latencyMs: 0 } }) as CtxVerifiedComment;

test("gate: P(E kept) ≥ P(A kept) and TP(E) − TP(A) ≥ 3, else FAIL; INCONCLUSIVE on a judge failure, a verifier request failure or a stop", () => {
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 7), OK).verdict, "PASS (adopt E)");
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 8), OK).verdict, "PASS (adopt E)"); // equal precision is enough (exact)
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 10), OK).verdict, "FAIL"); // lower precision
  assert.equal(gate075(row("A", 5, 5), row("E", 7, 3), OK).verdict, "FAIL"); // ΔTP = 2
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 7), { ...OK, judgeFailed: 1 }).verdict, "INCONCLUSIVE");
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 7), { ...OK, verifyRequestFailures: 1 }).verdict, "INCONCLUSIVE");
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 7), { ...OK, status: "stopped-at-cap" }).verdict, "INCONCLUSIVE");
  assert.equal(gate075(row("A", 5, 5), row("E", 8, 7), { ...OK, unjudged: 1 }).verdict, "INCONCLUSIVE");
  assert.equal(gate075(row("A", 0, 0), row("E", 3, 0), OK).verdict, "INCONCLUSIVE"); // no precision for A
});

test("gate, both readings (Amendment 1.3): PASS needs isKept and keep-only; PASS only with VERIFY_FAILED kept is INCONCLUSIVE", () => {
  const P = { verdict: "PASS (adopt E)" as const, why: "" };
  const F = { verdict: "FAIL" as const, why: "" };
  const I = { verdict: "INCONCLUSIVE" as const, why: "" };
  assert.equal(gateBoth(P, P).verdict, "PASS (adopt E)");
  assert.equal(gateBoth(P, F).verdict, "INCONCLUSIVE");
  assert.match(gateBoth(P, F).why, /holds only with VERIFY_FAILED kept/);
  assert.equal(gateBoth(F, P).verdict, "FAIL");
  assert.equal(gateBoth(F, F).verdict, "FAIL");
  assert.equal(gateBoth(I, P).verdict, "INCONCLUSIVE");
  assert.equal(gateBoth(P, I).verdict, "INCONCLUSIVE");
});

test("pricing (Amendment 1.5): expected = verifier calls × $0.0032 + judge calls × $0.0009; the run refuses above $1.20", () => {
  assert.ok(Math.abs(expectedUSD(140, 70) - (140 * 0.0032 + 70 * 0.0009)) < 1e-12);
  assert.ok(expectedUSD(300, 300) > 1.2);
  assert.ok(expectedUSD(300, 200) < 1.2);
});


test("population (075b): exactly the registered 42 units, all complete, 15 valid-first / 1 invalid / 26 empty-first", () => {
  const paths = { valid: 15, invalid: 1, empty: 26 };
  assert.deepEqual(POPULATION, { units: 42, ...paths });
  assert.equal(populationCheck({ units: 42, complete: 42, paths }), null);
  assert.match(populationCheck({ units: 42, complete: 41, paths })!, /1 incomplete units/);
  assert.match(populationCheck({ units: 41, complete: 41, paths: { ...paths, empty: 25 } })!, /registered/);
  assert.match(populationCheck({ units: 42, complete: 42, paths: { valid: 16, invalid: 0, empty: 26 } })!, /registered/);
});

test("verifying one finding per call sends the same request bytes as one call per PR (contexts are per finding)", async () => {
  const seen: Record<"pr" | "one", string[]> = { pr: [], one: [] };
  const cap = (k: "pr" | "one"): ChatClient => ({ chat: async (r: ChatRequest): Promise<ChatResult> => (seen[k].push(JSON.stringify(r)), { content: '{"verdict":"keep","reason":"r"}', cached: false, latencyMs: 0, costUSD: 0 }) });
  const input = { title: "t", description: "d", diff: DIFF };
  const repo = { source: SOURCE, head: "0".repeat(40) };
  await verifyReviewWithContext(cap("pr"), input, { pr_title: "t", comments: [F1, F2, F3] }, repo, VERIFY_OPTS);
  for (const f of [F1, F2, F3]) await verifyReviewWithContext(cap("one"), input, { pr_title: "t", comments: [f] }, repo, { ...VERIFY_OPTS, concurrency: 1 });
  assert.equal(seen.pr.length, 3);
  assert.deepEqual([...seen.one].sort(), [...seen.pr].sort());
});

test("one review per (arm, draw, hard chunk) of verifier-kept findings; each distinct finding verified once per PR", () => {
  const { units, src } = fixture();
  const { occ } = extractFindings(units, src);
  const d = distinctFindings(occ);
  assert.deepEqual(d.get("grafana/0"), [F2, F1]); // A and E share them: once each
  assert.deepEqual(d.get("sentry/5"), [F1, F2, F3]); // F1 in A and E, F3 in two draws: once each
  const rs = chunkReviews(occ, (o) => o.finding.body !== F3.body);
  const key = (r: { arm: string; draw: number; chunk: string }) => `${r.arm} d${r.draw} ${r.chunk}`;
  // grafana/0 has two hard chunks: two reviews per (arm, draw); A has no success in sentry draw 2
  assert.deepEqual(rs.map(key), ["A d1 grafana/0#ctx0", "A d1 grafana/0#diff0", "A d1 sentry/5#ctx0", "E d1 grafana/0#ctx0", "E d1 grafana/0#diff0", "E d1 sentry/5#ctx0", "E d2 sentry/5#ctx0"]);
  for (const c of ["grafana/0#ctx0", "grafana/0#diff0"]) {
    const [ra, re] = [rs.find((r) => key(r) === `A d1 ${c}`)!, rs.find((r) => key(r) === `E d1 ${c}`)!];
    assert.deepEqual(ra.comments, re.comments); // shared path: byte-identical reviews for A and E
    assert.equal(JSON.stringify(ra.comments), JSON.stringify(re.comments));
  }
  assert.equal(rs.find((r) => key(r) === "E d1 grafana/0#diff0")!.file, "0.json");
  assert.deepEqual(rs.find((r) => key(r) === "E d1 sentry/5#ctx0")!.comments, [F1, F2]);
  assert.deepEqual(rs.find((r) => key(r) === "E d2 sentry/5#ctx0")!.comments, []); // all dropped: no judge call
  for (const r of rs) r.sources.forEach((i, k) => assert.deepEqual(occ[i]!.finding, r.comments[k]));
});

test("the tables: outcomes go back to their findings; distinct goldens; duplicates within a review only; the empty-first table", () => {
  const { units, src } = fixture();
  const { occ } = extractFindings(units, src);
  const verdicts = new Map([
    ["grafana/0", [verdict(F2, true), verdict(F1, "failed", "request failed: boom")]],
    ["sentry/5", [verdict(F1, true), verdict(F2, true), verdict(F3, false)]],
  ]);
  const rs = chunkReviews(occ, (o) => o.finding.body !== F3.body);
  // the judge: every comment matches G1 (High); within one review the second is a duplicate, across reviews each counts
  const scores: ScoreRec[] = rs.map((r) => ({ arm: r.arm, draw: r.draw, chunk: r.chunk, costUSD: 0.1, status: "SCORED", severities: ["High"], matched: r.comments.map(() => "G1") }));
  // calls: one per distinct finding ($0.01), plus a failed (charged) retry of grafana F1; one judge call per review with comments
  const calls: CallRec[] = [...distinctFindings(occ)].flatMap(([pull, fs]) => fs.map((f, i) => ({ id: `${pull}${i}`, tag: verifyTag(pull, findingKey(f)), stage: "verify", ok: true, cached: false, chargedUSD: 0.01 })));
  calls.push({ id: "x1", tag: verifyTag("grafana/0", findingKey(F1)), stage: "verify", ok: false, cached: false, chargedUSD: 0.02, error: "TypeError: fetch failed" });
  for (const r of rs.filter((r) => r.comments.length)) calls.push({ id: `j${judgeTag(r)}`, tag: judgeTag(r), stage: "judge", ok: true, cached: false, chargedUSD: 0.1 });
  calls.push({ id: "u", tag: "something else", stage: "verify", ok: true, cached: false, chargedUSD: 0.005 });
  const total = calls.reduce((t, c) => t + c.chargedUSD, 0);
  const a = analyze075(occ, rs, verdicts, scores, "complete", { calls, ledgerUSD: total, budgetUSD: total });
  assert.deepEqual(a.rows.A, { arm: "A", found: 3, kept: 3, verifyFailed: 1, tp: 3, fp: 0, duplicates: 0, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rows.E, { arm: "E", found: 6, kept: 4, verifyFailed: 1, tp: 3, fp: 0, duplicates: 1, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rowsKeepOnly.A, { arm: "A", found: 3, kept: 2, verifyFailed: 1, tp: 2, fp: 0, duplicates: 0, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rowsEmpty.E, { arm: "E", found: 4, kept: 2, verifyFailed: 0, tp: 1, fp: 0, duplicates: 1, low: 0, precision: 1, distinctGoldens: 1 });
  assert.equal(a.flags.verifyRequestFailures, 1);
  assert.equal(a.gate.verdict, "INCONCLUSIVE");
  assert.equal(a.distinct, 5);
  const near = (x: number, y: number) => assert.ok(Math.abs(x - y) < 1e-12, `${x} != ${y}`);
  near(a.cost.judge.E, 0.3); // 3 E reviews with kept findings (E d2's review is empty: no call)
  near(a.cost.verify.A, 0.05); // F2 + F1 (with its failed, charged call) + sentry F1
  near(a.cost.verify.total, 0.075);
  assert.equal(a.accounting.failed, 1);
  near(a.accounting.failedUSD, 0.02);
  near(a.accounting.unattributedUSD, 0.005);
  assert.equal(a.accounting.reconciled, true);
  assert.equal(analyze075(occ, rs, verdicts, scores, "complete", { calls, ledgerUSD: total - 0.02, budgetUSD: total }).accounting.reconciled, false);
});

test("keep-only re-scores the judge's matches without the VERIFY_FAILED findings (no new call)", () => {
  const Fa = { path: "src/x.ts", line: 2, body: "verifier failed on this one" };
  const Fb = { path: "src/x.ts", line: 12, body: "the verifier kept this one" };
  const occ: Occ[] = [Fa, Fb].map((f) => ({ arm: "E", draw: 1, chunk: "sentry/5#ctx0", pull: "sentry/5", unitPath: "empty", finding: f, key: findingKey(f) }));
  const verdicts = new Map([["sentry/5", [verdict(Fa, "failed"), verdict(Fb, true)]]]);
  const rs = chunkReviews(occ, () => true);
  const scores: ScoreRec[] = [{ arm: "E", draw: 1, chunk: "sentry/5#ctx0", costUSD: 0, status: "SCORED", severities: ["High", "Low"], matched: ["G1", "G1"] }];
  const a = analyze075(occ, rs, verdicts, scores, "complete", NO_CALLS);
  assert.equal(a.rows.E.tp, 1);
  assert.equal(a.rows.E.duplicates, 1); // Fb duplicates Fa's credit
  assert.equal(a.rowsKeepOnly.E.tp, 1); // without Fa, Fb takes the credit
  assert.equal(a.rowsKeepOnly.E.duplicates, 0);
  assert.equal(a.rowsKeepOnly.E.kept, 1);
  const failed = analyze075(occ, rs, verdicts, [{ ...scores[0]!, status: "JUDGE_FAILED" }], "complete", NO_CALLS);
  assert.equal(failed.flags.judgeFailed, 1);
  assert.equal(failed.gate.verdict, "INCONCLUSIVE");
});

// ---- the job on a synthetic bench: the real TokenFactoryClient, budget, ledger and cache, with a fake fetch ----

const PRICES = join(import.meta.dirname, "../../config/prices.json");
const PULLS = [
  { repo: "grafana", name: "0", title: "Grafana zero" },
  { repo: "sentry", name: "5", title: "Sentry five" },
];
const SMALL = { units: 4, valid: 1, invalid: 1, empty: 2 };
function benchDir(units: Unit[], bodies: Record<string, string>, pulls = PULLS) {
  const bench = mkdtempSync(join(tmpdir(), "v074-"));
  const hc = join(bench, "hard-chunks-074");
  mkdirSync(join(hc, "bodies"), { recursive: true });
  writeFileSync(join(hc, "run.json"), JSON.stringify({ status: "complete" }));
  writeFileSync(join(hc, "units.json"), JSON.stringify(units));
  for (const [k, content] of Object.entries(bodies)) {
    const [c, d, n] = k.split("|") as [string, string, string];
    writeFileSync(join(hc, "bodies", bodyFile(c, Number(d), n)), JSON.stringify({ content }));
  }
  mkdirSync(join(bench, "repos"), { recursive: true });
  mkdirSync(join(bench, "golden/code_review_benchmarks"), { recursive: true });
  for (const { repo, name, title } of pulls) {
    mkdirSync(join(bench, "prs", repo), { recursive: true });
    writeFileSync(join(bench, "prs", repo, `${name}.json`), JSON.stringify({ title, description: "synthetic", diff: DIFF, number: 1 }));
    writeFileSync(join(bench, "repos", `${repo}.heads.json`), JSON.stringify({ [name]: { head: "0".repeat(40) } }));
    writeFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), JSON.stringify([{ pr_title: title, comments: [{ comment: "the real bug", severity: "High" }] }]));
  }
  mkdirSync(join(bench, "state"));
  return bench;
}
/** The API: verifier keeps all but F3; judge matches T1 to G1. Every request that reaches it is recorded. */
function fakeApi(o: { delay?: (r: ChatRequest) => number; usage?: (r: ChatRequest) => { prompt_tokens: number; completion_tokens: number } | undefined; fail?: (r: ChatRequest) => boolean } = {}) {
  const live = { active: 0, stages: [] as string[], models: [] as string[], judgeBodies: [] as string[] };
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    const r = JSON.parse(String(init!.body)) as ChatRequest;
    const s = stageOf(r);
    live.stages.push(s);
    live.models.push(r.model);
    if (s === "judge") live.judgeBodies.push(JSON.stringify(r));
    live.active++;
    try {
      await new Promise((res) => setTimeout(res, o.delay?.(r) ?? 1));
      if (o.fail?.(r)) throw new TypeError("fetch failed (synthetic network error)");
      const user = r.messages[1]?.content ?? "";
      let content = "";
      if (s === "verify") content = JSON.stringify({ verdict: user.includes("x.z is never set") ? "drop" : "keep", reason: "synthetic" });
      if (s === "judge") {
        const ids = [...user.matchAll(/^(T\d+) \(/gm)].map((m) => m[1]!);
        content = JSON.stringify({ matches: ids.map((t) => ({ tool: t, golden: t === "T1" ? "G1" : null })) });
      }
      const usage = o.usage?.(r) ?? { prompt_tokens: 100, completion_tokens: 50 };
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage }), { status: 200, headers: { "content-type": "application/json" } });
    } finally {
      live.active--;
    }
  }) as typeof fetch;
  return { fetch: f, live };
}
const userOf = (r: ChatRequest) => r.messages[1]?.content ?? "";
const deps = (bench: string, f: typeof fetch, log: string[], errs: string[] = [], population = SMALL): Deps => ({
  bench,
  stateDir: join(bench, "state"),
  pricesFile: PRICES,
  env: { TRACEHOUND_BUDGET_RUN_USD: "1.5", NEBIUS_API_KEY: "synthetic" },
  log: (l) => log.push(l),
  err: (l) => errs.push(l),
  fetch: f,
  freezeCheck: () => ({ ok: true, head: "h" }),
  source: () => SOURCE,
  population,
});
const records = (bench: string, f: string) => JSON.parse(readFileSync(join(outDir(bench), f), "utf8"));
const withBench = async (units: Unit[], bodies: Record<string, string>, fn: (bench: string) => Promise<void>, pulls = PULLS) => {
  const bench = benchDir(units, bodies, pulls);
  try {
    await fn(bench);
  } finally {
    rmSync(bench, { recursive: true, force: true });
  }
};

test("the registered population is enforced: a bench that is not 42/15/1/26 refuses before any call", async () => {
  const { units, bodies } = fixture();
  await withBench(units, bodies, async (bench) => {
    const api = fakeApi();
    const errs: string[] = [];
    assert.equal(await runJob("check", deps(bench, api.fetch, [], errs, POPULATION)), 1);
    assert.match(errs.join("\n"), /not the registered population: 074 has \{"units":4,"valid":1,"invalid":1,"empty":2\}/);
    assert.equal(await runJob("run", deps(bench, api.fetch, [], errs, POPULATION)), 1);
    assert.equal(api.live.stages.length, 0);
  });
});

test("check calls nothing; run sends verifier and judge requests only, never a reviewer request; costs reconcile with the ledger", async () => {
  const { units, bodies } = fixture();
  await withBench(units, bodies, async (bench) => {
    const api = fakeApi();
    const log: string[] = [];
    assert.equal(await runJob("check", deps(bench, api.fetch, log)), 0);
    assert.equal(api.live.stages.length, 0);
    assert.match(log.join("\n"), /findings: A 3, E 6 .* distinct verifier requests 5 · judge reviews \(arm, draw, chunk\): A 3, E 4/);
    const wc = /worst-case reservation .* verifier \$([\d.]+) \+ judge \$([\d.]+) .* expected \$([\d.]+)/.exec(log.join("\n"))!;
    assert.ok(Number(wc[1]) > 5 * 0.0144 && Number(wc[2]) > 7 * 0.0144); // max_tokens 16,000 at $0.90/M output, plus input
    assert.equal(Number(wc[3]), Number(expectedUSD(5, 7).toFixed(4)));

    const out: string[] = [];
    assert.equal(await runJob("run", deps(bench, api.fetch, out)), 0);
    assert.ok(api.live.stages.every((s) => s === "verify" || s === "judge"), `stages: ${api.live.stages.join(",")}`);
    assert.equal(api.live.stages.filter((s) => s === "verify").length, 5); // each distinct finding once per PR
    assert.ok(api.live.models.filter((_, i) => api.live.stages[i] === "verify").every((x) => x === VERIFY_MODEL));
    // 6 judge reviews with kept findings; A and E's shared-path reviews are byte-identical: 2 served from the cache
    assert.equal(api.live.judgeBodies.length, 4);
    assert.equal(new Set(api.live.judgeBodies).size, 4);
    const calls = records(bench, "calls.json") as CallRec[];
    assert.equal(calls.filter((c) => c.stage === "judge").length, 6);
    assert.equal(calls.filter((c) => c.cached).length, 2);
    const report = reportFromRecords(outDir(bench));
    assert.deepEqual(report, out.slice(out.length - report.length)); // the report equals the run's own output
    const text = report.join("\n");
    assert.match(text, /\| A \| 3 \| 3 \| 0 \| 3 \| 2 \| 0 \|/); // found, kept, VERIFY_FAILED, TP, distinct goldens, FP
    assert.match(text, /\| E \| 6 \| 4 \| 0 \| 3 \| 2 \| 1 \|/);
    assert.match(text, /accounting: calls 11 \(cache hits 2, failed 0\) .* · reconciled$/m);
    assert.match(text, /gate with isKept: FAIL \(P\(E\) 0\.750 < P\(A\) 1\.000; TP\(E\) - TP\(A\) = 0 < 3\)/);
    assert.match(report.at(-1)!, /both readings\): FAIL$/);
    assert.equal(records(bench, "run.json").status, "complete");
    assert.equal(await runJob("run", deps(bench, api.fetch, [])), 1); // the records exist: refuse
  });
});

test("a failed verifier call's ledger charge is attributed to its finding and arm, and reconciles", async () => {
  const { units, bodies } = fixture();
  await withBench(units, bodies, async (bench) => {
    const api = fakeApi({ fail: (r) => stageOf(r) === "verify" && userOf(r).includes(F2.body) && userOf(r).includes("Grafana zero") }) // F2 is in sentry/5 too;
    const out: string[] = [];
    assert.equal(await runJob("run", deps(bench, api.fetch, out)), 0);
    const calls = records(bench, "calls.json") as CallRec[];
    const failed = calls.filter((c) => !c.ok);
    assert.equal(failed.length, 1);
    assert.equal(failed[0]!.tag, verifyTag("grafana/0", findingKey(F2)));
    assert.ok(failed[0]!.chargedUSD > 0.0144); // a network error is ledgered at the upper bound (input + 16,000 output)
    const entry = readFileSync(join(bench, "state/spend.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.componentId === failed[0]!.id);
    assert.equal(entry.ok, false);
    assert.equal(entry.estCostUSD, failed[0]!.chargedUSD);
    const text = out.join("\n");
    assert.ok(Number(/verifier A \$([\d.]+)/.exec(text)![1]) > 0.0144); // in A's cost (F2 is A's finding in grafana/0#ctx0)
    assert.match(text, /failed calls 1, charged \$0\.01\d\d/);
    assert.match(text, /reconciled$/m);
    assert.match(out.at(-1)!, /INCONCLUSIVE$/); // a verifier request failure
  });
});

test("a cap during verification: no new dispatch, slow siblings drained, partial verdicts kept, stable spend, INCONCLUSIVE", async () => {
  const many = "abcdefgh".split("").map((c) => ({ path: "src/x.ts", line: 2, body: `finding-${c}` }));
  const units = [unit("sentry/5#ctx0", 1, "empty", arm(false, 0), arm(true, 8))];
  const bodies = { "sentry/5#ctx0|1|first": "", "sentry/5#ctx0|1|append": "not json", "sentry/5#ctx0|1|schema": reply(...many) };
  await withBench(
    units,
    bodies,
    async (bench) => {
      // finding-a returns at once and costs ~$1.48; its three siblings are slow; the next reservation crosses $1.50
      const fast = (r: ChatRequest) => stageOf(r) === "verify" && userOf(r).includes("finding-a");
      const api = fakeApi({ delay: (r) => (fast(r) ? 5 : 80), usage: (r) => (fast(r) ? { prompt_tokens: 100, completion_tokens: 1_640_000 } : undefined) });
      const out: string[] = [];
      assert.equal(await runJob("run", deps(bench, api.fetch, out, [], { units: 1, valid: 0, invalid: 0, empty: 1 })), 2);
      assert.equal(api.live.active, 0); // every dispatched call settled before runJob returned
      assert.equal(api.live.stages.length, 4); // a-d sent; e refused at reservation; f-h never dispatched
      const run = records(bench, "run.json");
      assert.equal(run.status, "stopped-at-cap");
      const calls = records(bench, "calls.json") as CallRec[];
      assert.equal(calls.length, 5);
      assert.match(calls.find((c) => !c.ok)!.error!, /BudgetExceededError/);
      const v = records(bench, "verdicts/sentry_5.json");
      assert.equal(v.partial, true);
      assert.equal(v.comments.length, 4); // the four answered verdicts are kept
      const ledger = () => readFileSync(join(bench, "state/spend.jsonl"), "utf8");
      const before = ledger();
      await new Promise((res) => setTimeout(res, 150));
      assert.equal(ledger(), before); // nothing still running
      assert.equal(api.live.stages.length, 4);
      assert.ok(Math.abs(run.spendUSD - run.ledgerJobUSD) < 1e-9);
      assert.match(out.join("\n"), /reconciled$/m);
      assert.match(out.join("\n"), /gate with isKept: INCONCLUSIVE \(the job did not complete \(stopped-at-cap\)/);
      assert.match(out.at(-1)!, /both readings\): INCONCLUSIVE$/);
    },
    [PULLS[1]!],
  );
});

test("a cap during judging stops the job: status stopped-at-cap, gate INCONCLUSIVE", async () => {
  const { units, bodies } = fixture();
  await withBench(units, bodies, async (bench) => {
    const api = fakeApi({ usage: (r) => (stageOf(r) === "judge" ? { prompt_tokens: 100, completion_tokens: 1_660_000 } : undefined) });
    const out: string[] = [];
    assert.equal(await runJob("run", deps(bench, api.fetch, out)), 2);
    assert.equal(api.live.stages.filter((s) => s === "judge").length, 1);
    assert.equal(api.live.active, 0);
    assert.match(out.join("\n"), /gate with isKept: INCONCLUSIVE \(the job did not complete \(stopped-at-cap\)/);
    assert.match(out.at(-1)!, /both readings\): INCONCLUSIVE$/);
  });
});

test("the job client: a reviewer request is refused before the model and halts; once halted, every call gets JobStoppedError unsent", async () => {
  const sent: string[] = [];
  const inner: ChatClient = { chat: async (r: ChatRequest): Promise<ChatResult> => (sent.push(stageOf(r)), { content: "{}", cached: false, latencyMs: 0, costUSD: 0 }) };
  const jc = new JobClient(inner, null, "t");
  const review = firstRequest("diff", { title: "t", description: "d", diff: DIFF }, DIFF, 1, 1, SOURCE);
  await assert.rejects(jc.tagged("x").chat(review, { purpose: "review" }), /refused a diff request/);
  assert.deepEqual(sent, []);
  assert.ok(jc.halted);
  const jc2 = new JobClient(inner, null, "t");
  jc2.halt(new BudgetExceededError("cap"));
  const verifyReq = { model: VERIFY_MODEL, messages: [{ role: "system" as const, content: (await import("../../packages/analyzer/src/review/verify-ctx-prompt.ts")).VERIFY_CTX_SYSTEM_PROMPT }, { role: "user" as const, content: "u" }] } as ChatRequest;
  await assert.rejects(jc2.tagged("x").chat(verifyReq, { purpose: "review" }), (e: unknown) => e instanceof JobStoppedError && e instanceof BudgetExceededError);
  assert.deepEqual(sent, []);
  assert.equal(jc2.refusedAfterHalt, 1);
  assert.equal(jc2.active, 0);
});
