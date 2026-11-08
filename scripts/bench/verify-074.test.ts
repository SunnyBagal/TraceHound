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
import type { CtxVerifiedComment } from "../../packages/analyzer/src/review/verify-ctx.ts";
import type { ArmOutcome, Unit } from "./hard-chunks.ts";
import { firstRequest } from "./hard-chunks.ts";
import { stageOf } from "./recovery-ab.ts";
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
  guardClient,
  outDir,
  reportFromRecords,
  runJob,
  VERIFY_MODEL,
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
    { chunk: "sentry/5#ctx0", draw: 3, complete: false, path: "empty", capStop: "x" }, // incomplete: left out
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
  assert.equal(x.units, 5);
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
});

const row = (a: "A" | "E", tp: number, fp: number): Row => ({ arm: a, found: 0, kept: 0, verifyFailed: 0, tp, fp, duplicates: 0, low: 0, precision: tp + fp ? tp / (tp + fp) : null, distinctGoldens: 0 });
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
  const a = analyze075(occ, rs, verdicts, scores, "complete");
  assert.deepEqual(a.rows.A, { arm: "A", found: 3, kept: 3, verifyFailed: 1, tp: 3, fp: 0, duplicates: 0, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rows.E, { arm: "E", found: 6, kept: 4, verifyFailed: 1, tp: 3, fp: 0, duplicates: 1, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rowsKeepOnly.A, { arm: "A", found: 3, kept: 2, verifyFailed: 1, tp: 2, fp: 0, duplicates: 0, low: 0, precision: 1, distinctGoldens: 2 });
  assert.deepEqual(a.rowsEmpty.E, { arm: "E", found: 4, kept: 2, verifyFailed: 0, tp: 1, fp: 0, duplicates: 1, low: 0, precision: 1, distinctGoldens: 1 });
  assert.equal(a.flags.verifyRequestFailures, 1);
  assert.equal(a.gate.verdict, "INCONCLUSIVE");
  assert.equal(a.distinct, 5);
  assert.ok(Math.abs(a.cost.judge.E - 0.4) < 1e-12);
  assert.ok(Math.abs(a.cost.verify.A - 0.03) < 1e-12 && Math.abs(a.cost.verify.total - 0.05) < 1e-12);
});

test("keep-only re-scores the judge's matches without the VERIFY_FAILED findings (no new call)", () => {
  const Fa = { path: "src/x.ts", line: 2, body: "verifier failed on this one" };
  const Fb = { path: "src/x.ts", line: 12, body: "the verifier kept this one" };
  const occ: Occ[] = [Fa, Fb].map((f) => ({ arm: "E", draw: 1, chunk: "sentry/5#ctx0", pull: "sentry/5", unitPath: "empty", finding: f, key: findingKey(f) }));
  const verdicts = new Map([["sentry/5", [verdict(Fa, "failed"), verdict(Fb, true)]]]);
  const rs = chunkReviews(occ, () => true);
  const scores: ScoreRec[] = [{ arm: "E", draw: 1, chunk: "sentry/5#ctx0", costUSD: 0, status: "SCORED", severities: ["High", "Low"], matched: ["G1", "G1"] }];
  const a = analyze075(occ, rs, verdicts, scores, "complete");
  assert.equal(a.rows.E.tp, 1);
  assert.equal(a.rows.E.duplicates, 1); // Fb duplicates Fa's credit
  assert.equal(a.rowsKeepOnly.E.tp, 1); // without Fa, Fb takes the credit
  assert.equal(a.rowsKeepOnly.E.duplicates, 0);
  assert.equal(a.rowsKeepOnly.E.kept, 1);
  const failed = analyze075(occ, rs, verdicts, [{ ...scores[0]!, status: "JUDGE_FAILED" }], "complete");
  assert.equal(failed.flags.judgeFailed, 1);
  assert.equal(failed.gate.verdict, "INCONCLUSIVE");
});

// ---- the job on a synthetic bench, with a fake client ----

function benchDir() {
  const bench = mkdtempSync(join(tmpdir(), "v074-"));
  const { units, bodies } = fixture();
  const hc = join(bench, "hard-chunks-074");
  mkdirSync(join(hc, "bodies"), { recursive: true });
  writeFileSync(join(hc, "run.json"), JSON.stringify({ status: "complete" }));
  writeFileSync(join(hc, "units.json"), JSON.stringify(units));
  for (const [k, content] of Object.entries(bodies)) {
    const [c, d, n] = k.split("|") as [string, string, string];
    writeFileSync(join(hc, "bodies", bodyFile(c, Number(d), n)), JSON.stringify({ content }));
  }
  for (const [repo, name, title] of [["grafana", "0", "Grafana zero"], ["sentry", "5", "Sentry five"]] as const) {
    mkdirSync(join(bench, "prs", repo), { recursive: true });
    mkdirSync(join(bench, "repos"), { recursive: true });
    mkdirSync(join(bench, "golden/code_review_benchmarks"), { recursive: true });
    writeFileSync(join(bench, "prs", repo, `${name}.json`), JSON.stringify({ title, description: "synthetic", diff: DIFF, number: 1 }));
    writeFileSync(join(bench, "repos", `${repo}.heads.json`), JSON.stringify({ [name]: { head: "0".repeat(40) } }));
    writeFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), JSON.stringify([{ pr_title: title, comments: [{ comment: "the real bug", severity: "High" }] }]));
  }
  mkdirSync(join(bench, "state"));
  return bench;
}
/** Verifier: keep, except F3; judge: T1 matches G1, the rest nothing. Every request's stage is recorded. */
function fakeModel(o: { capOnJudge?: boolean } = {}) {
  const stages: string[] = [];
  const models: string[] = [];
  const judgeBodies: string[] = [];
  const client: ChatClient = {
    chat: async (r: ChatRequest): Promise<ChatResult> => {
      const s = stageOf(r);
      stages.push(s);
      models.push(r.model);
      let content = "";
      if (s === "verify") content = JSON.stringify({ verdict: (r.messages[1]!.content ?? "").includes("x.z is never set") ? "drop" : "keep", reason: "synthetic" });
      if (s === "judge") {
        judgeBodies.push(JSON.stringify(r));
        if (o.capOnJudge) throw new BudgetExceededError("cap");
        const ids = [...(r.messages[1]!.content ?? "").matchAll(/^(T\d+) \(/gm)].map((m) => m[1]!);
        content = JSON.stringify({ matches: ids.map((t) => ({ tool: t, golden: t === "T1" ? "G1" : null })) });
      }
      return { content, cached: false, latencyMs: 1, costUSD: 0.001, finishReason: "stop" };
    },
  };
  return { client, stages, models, judgeBodies };
}
const deps = (bench: string, client: ChatClient, log: string[]): Deps => ({
  bench,
  stateDir: join(bench, "state"),
  pricesFile: join(import.meta.dirname, "../../config/prices.json"),
  env: { TRACEHOUND_BUDGET_RUN_USD: "1.5" },
  log: (l) => log.push(l),
  err: () => {},
  client,
  freezeCheck: () => ({ ok: true, head: "h" }),
  source: () => SOURCE,
});

test("check prints counts only and calls nothing; run sends verifier and judge requests only, never a reviewer request", async () => {
  const bench = benchDir();
  try {
    const m = fakeModel();
    const log: string[] = [];
    assert.equal(await runJob("check", deps(bench, m.client, log)), 0);
    assert.equal(m.stages.length, 0);
    assert.match(log.join("\n"), /findings: A 3, E 6 .* distinct verifier requests 5 · judge reviews \(arm, draw, chunk\): A 3, E 4/);
    const wc = /worst-case reservation .* verifier \$([\d.]+) \+ judge \$([\d.]+) .* expected \$([\d.]+)/.exec(log.join("\n"))!;
    assert.ok(Number(wc[1]) > 5 * 0.0144 && Number(wc[2]) > 7 * 0.0144); // max_tokens 16,000 at $0.90/M output, plus input
    assert.equal(Number(wc[3]), Number(expectedUSD(5, 7).toFixed(4)));

    const out: string[] = [];
    assert.equal(await runJob("run", deps(bench, m.client, out)), 0);
    assert.ok(m.stages.length > 0 && m.stages.every((s) => s === "verify" || s === "judge"), `stages: ${m.stages.join(",")}`);
    assert.equal(m.stages.filter((s) => s === "verify").length, 5); // each distinct finding once per PR
    assert.equal(m.stages.filter((s) => s === "judge").length, 6); // one per (arm, draw, chunk) review with kept findings
    assert.equal(new Set(m.judgeBodies).size, 4); // A and E's shared-path reviews send byte-identical judge requests
    assert.ok(m.models.filter((_, i) => m.stages[i] === "verify").every((x) => x === VERIFY_MODEL));
    const report = reportFromRecords(outDir(bench));
    assert.deepEqual(report, out.slice(out.length - report.length)); // the report equals the run's own output
    assert.match(report.join("\n"), /\| A \| 3 \| 3 \| 0 \| 3 \| 2 \| 0 \|/); // found, kept, VERIFY_FAILED, TP, distinct goldens, FP
    assert.match(report.join("\n"), /\| E \| 6 \| 4 \| 0 \| 3 \| 2 \| 1 \|/);
    assert.match(report.join("\n"), /gate with isKept: FAIL \(P\(E\) 0\.750 < P\(A\) 1\.000; TP\(E\) - TP\(A\) = 0 < 3\)/);
    assert.match(report.at(-1)!, /both readings\): FAIL$/);
    assert.equal(JSON.parse(readFileSync(join(outDir(bench), "run.json"), "utf8")).status, "complete");
    assert.equal(await runJob("run", deps(bench, m.client, [])), 1); // the records exist: refuse
  } finally {
    rmSync(bench, { recursive: true, force: true });
  }
});

test("a cap refusal during judging stops the job: status stopped-at-cap, gate INCONCLUSIVE", async () => {
  const bench = benchDir();
  try {
    const m = fakeModel({ capOnJudge: true });
    const out: string[] = [];
    assert.equal(await runJob("run", deps(bench, m.client, out)), 2);
    assert.equal(m.stages.filter((s) => s === "judge").length, 1);
    assert.match(out.join("\n"), /gate with isKept: INCONCLUSIVE \(the job did not complete \(stopped-at-cap\)/);
    assert.match(out.at(-1)!, /both readings\): INCONCLUSIVE$/);
  } finally {
    rmSync(bench, { recursive: true, force: true });
  }
});

test("the client guard refuses a reviewer request before it reaches the model", async () => {
  const m = fakeModel();
  const refused: Error[] = [];
  const g = guardClient(m.client, (e) => refused.push(e));
  const review = firstRequest("diff", { title: "t", description: "d", diff: DIFF }, DIFF, 1, 1, SOURCE);
  await assert.rejects(g.chat(review, { purpose: "review" }), /refused a diff request/);
  assert.equal(m.stages.length, 0);
  assert.equal(refused.length, 1);
});
