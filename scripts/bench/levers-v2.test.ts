// Synthetic fixtures only. Run with: node --test scripts/bench/levers-v2.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { metrics, scorePull } from "../../packages/analyzer/src/bench/score.ts";
import type { ReviewComment, Severity } from "../../packages/analyzer/src/bench/types.ts";
import { alignIndices, bootstrap, markdown, mulberry32, persistentMisses, quantile, rankIndices, replay, replayVote, validatePair, type Results, type SavedPull } from "./levers-v2.ts";

const comment = (path: string, line: number | null, body = "synthetic fixture"): ReviewComment => ({ path, line, body });
const pull = (matches: (number | null)[], severities: Severity[] = ["High"], comments?: ReviewComment[]): SavedPull => ({
  key: "fixture/one.json", repo: "fixture", golden: severities.map((severity, i) => ({ id: `G${i + 1}`, severity, identity: `synthetic-${i}` })),
  comments: comments ?? matches.map((_, i) => comment(`file-${i}.ts`, 10)), matches,
});
const counts = (severities: Severity[], matches: (number | null)[]) => scorePull(severities, matches).counts;

test("removing the first TP lets its duplicate receive credit", () => {
  const p = pull([0, 0, null]);
  assert.equal(replay(p).duplicates, 1);
  assert.deepEqual(replay(p, [1]), counts(["High"], [0]));
  assert.equal(replay(p, [1]).tp, 1);
  assert.equal(replay(p, []).fn, 1);
});

test("Low matches, duplicate matches and false positives follow the scorer", () => {
  const p = pull([0, 0, 1, null], ["Low", "Critical"]);
  assert.deepEqual(replay(p, [1, 2, 3]), counts(["Low", "Critical"], [0, 1, null]));
  assert.equal(replay(p).lowMatched, 2);
  assert.equal(replay(p).goldenCounted, 1);
});

test("replay rejects invalid selection or missing match slots", () => {
  const p = pull([0]);
  assert.throws(() => replay(p, [0, 0]), /repeated/);
  assert.throws(() => replay(p, [-1]), /out of range/);
  assert.throws(() => replay(p, [1]), /out of range/);
  assert.throws(() => replay(p, [0.5]), /out of range/);
  assert.throws(() => replay({ ...p, matches: [] }), /length differs/);
});

test("exact alignment consumes repeated identical findings once each", () => {
  const a = comment("a.ts", 1), b = comment("b.ts", 2);
  assert.deepEqual(alignIndices([a, a, b], [a, b, a]), [0, 2, 1]);
  assert.throws(() => alignIndices([a], [a, a]), /alignment/);
  assert.throws(() => alignIndices([a], [{ ...a, body: "different fixture" }]), /alignment/);
});

test("agreement comes first, then diff, then ctx-only, stable within tiers", () => {
  const diff = [comment("solo.ts", 10), comment("a/shared.ts", 12), comment("last.ts", null)];
  const ctx = [comment("b/shared.ts", 15), comment("ctx.ts", 40), comment("ctx-null.ts", null)];
  const source = [...diff, ctx[1]!, ctx[2]!];
  assert.deepEqual(rankIndices(source, diff, ctx, "agreement"), [1, 0, 2, 3, 4]);
  assert.deepEqual(rankIndices(source, diff, ctx, "order"), [0, 1, 2, 3, 4]);
  // The agreeing ctx finding was removed from the pool; full generator output still supplies agreement.
  assert.deepEqual(rankIndices([diff[0]!, diff[1]!], diff, ctx, "agreement"), [1, 0]);
});

test("agreement respects the fixed three-line boundary and never matches null lines", () => {
  const diff = [comment("far.ts", 10), comment("near.ts", 10), comment("null.ts", null)];
  const ctx = [comment("far.ts", 14), comment("near.ts", 13), comment("null.ts", null)];
  const source = [...diff, ctx[0]!, ctx[2]!];
  assert.deepEqual(rankIndices(source, diff, ctx, "agreement"), [1, 0, 2, 3, 4]);
});

test("pairing rejects PR, golden identity, severity and order changes", () => {
  const a = pull([0], ["High", "Medium"]);
  validatePair(a, { ...a, comments: [], matches: [] });
  assert.throws(() => validatePair(a, { ...a, key: "fixture/two.json" }), /pairing/);
  assert.throws(() => validatePair(a, { ...a, repo: "other" }), /pairing/);
  assert.throws(() => validatePair(a, { ...a, golden: [...a.golden].reverse() }), /golden/);
  assert.throws(() => validatePair(a, { ...a, golden: a.golden.map((g) => ({ ...g, identity: "changed" })) }), /golden/);
  assert.throws(() => validatePair(a, { ...a, golden: a.golden.map((g) => ({ ...g, severity: "Low" })) }), /golden/);
});

test("vote uses earliest-run representative's match, not a nearby run's TP", () => {
  const a = pull([null], ["High"], [comment("v.ts", 10)]);
  const b = pull([0], ["High"], [comment("v.ts", 12)]);
  const c = pull([], ["High"]);
  const result = replayVote([a, b, c]);
  assert.equal(result.comments, 1);
  assert.equal(result.fp, 1);
  assert.equal(result.tp, 0);
  assert.equal(replayVote([b, a, c]).tp, 1);
});

test("same-run agreement does not count as a second run", () => {
  const a = pull([0, 0], ["High"], [comment("same.ts", 10), comment("same.ts", 12)]);
  const empty = pull([], ["High"]);
  assert.equal(replayVote([a, empty, empty]).comments, 0);
});

test("persistent misses intersect two runs, include Low, and count goldens once", () => {
  const a = pull([1, 1, null], ["Low", "High", "Medium", "Critical"]);
  const b = pull([2], ["Low", "High", "Medium", "Critical"]);
  assert.deepEqual(persistentMisses(a, b), [0, 3]);
  assert.deepEqual(persistentMisses(b, a), [0, 3]);
  assert.throws(() => persistentMisses(a, { ...b, key: "different" }), /pairing/);
});

test("vote retains unchanged non-transitive clustering behavior", () => {
  const a = pull([0], ["High"], [comment("chain.ts", 10)]);
  const b = pull([0], ["High"], [comment("chain.ts", 13)]);
  const c = pull([null], ["High"], [comment("chain.ts", 16)]);
  const result = replayVote([a, b, c]);
  assert.equal(result.comments, 2);
  assert.equal(result.tp, 1);
  assert.equal(result.fp, 1);
  assert.throws(() => replayVote([a, b]), /three/);
});

test("bootstrap of identical paired vectors is exactly zero", () => {
  const v = [counts(["High"], [0, null]), counts(["Medium"], [0])];
  const interval = bootstrap(v, [v], 100);
  for (const d of Object.values(interval)) assert.deepEqual(d, { delta: 0, low: 0, high: 0, undefinedResamples: 0 });
});

test("constant improvement has a constant positive interval", () => {
  const a = Array.from({ length: 4 }, () => counts(["High"], [0]));
  const b = Array.from({ length: 4 }, () => counts(["High"], [null]));
  assert.deepEqual(bootstrap(a, [b], 100).f, { delta: 1, low: 1, high: 1, undefinedResamples: 0 });
});

test("mean baseline is mean of run F, rather than F of pooled counts", () => {
  const good = [counts(["High"], [0])];
  const bad = [counts(["High"], [null, null, null])];
  const result = bootstrap(good, [good, bad, bad], 100);
  assert.equal(result.f.delta, 1 - 1 / 3);
  assert.equal(result.f.low, result.f.delta);
});

test("paired PR sampling keeps heterogeneous identical vectors exactly equal", () => {
  const vector = [counts(["High"], [0]), counts(["High", "Medium"], [null, null])];
  assert.equal(bootstrap(vector, [vector], 100).f.low, 0);
  assert.equal(bootstrap(vector, [vector], 100).f.high, 0);
});

test("seeded bootstrap is reproducible and changing seed changes mixed quantiles", () => {
  const a = [counts(["High"], [0]), counts(["High"], [null]), counts(["High"], [null, null, null])];
  const b = [counts(["High"], [null]), counts(["High"], [0]), counts(["High"], [null])];
  assert.deepEqual(bootstrap(a, [b], 37), bootstrap(a, [b], 37));
  assert.notDeepEqual(bootstrap(a, [b], 37, 72), bootstrap(a, [b], 37, 73));
  const x = mulberry32(72), y = mulberry32(72);
  for (let i = 0; i < 5; i++) assert.equal(x(), y());
});

test("undefined bootstrap replicates make the interval unavailable", () => {
  const empty = counts(["High"], []), good = counts(["High"], [0]);
  const result = bootstrap([empty, good], [[good, good]], 100);
  assert.equal(result.f.low, null);
  assert.equal(result.f.high, null);
  assert.ok(result.f.undefinedResamples > 0);
  assert.equal(bootstrap([empty], [[good]], 10).f.delta, null);
  assert.equal(metrics(empty).f, null);
});

test("bootstrap rejects mismatched sample units and invalid resampling", () => {
  const a = [counts(["High"], [0])];
  assert.throws(() => bootstrap(a, [[]], 100), /unpaired/);
  assert.throws(() => bootstrap([], [[]], 100), /unpaired/);
  assert.throws(() => bootstrap(a, [], 100), /unpaired/);
  assert.throws(() => bootstrap(a, [a], 0), /resample/);
});

test("percentiles interpolate at (B-1)*q", () => {
  assert.equal(quantile([0, 10, 20, 30], 0.25), 7.5);
  assert.equal(quantile([0, 10], 0.025), 0.25);
  assert.equal(quantile([5], 0.975), 5);
  assert.throws(() => quantile([], 0.5), /quantile/);
});

test("Markdown is counts-only and reports unavailable optional runs", () => {
  const misses = [{ repo: "total", nPRs: 40, golden: { Low: 0, Medium: 1, High: 0, Critical: 0 }, missedBoth: { Low: 0, Medium: 1, High: 0, Critical: 0 }, scoredGolden: 1, scoredMissed: 1 }];
  const judge = { caps: [], perRunCaps: [], verifier: [], vote: [], misses };
  const fixture = { plan: { sha: "303994575368050f3edbd3d4ba5f30fb510605d9", committedAt: "2026-10-27T16:01:36+05:30" }, computedAt: "synthetic timestamp", costUSD: 0, modelCalls: 0, replayNetworkCalls: 0, bootstrap: { resamples: 10000, seed: 72, unit: "PR", interval: "percentile" }, absentOptionalRuns: ["10", "11"], judges: { v1: judge, x1: judge } } satisfies Results;
  const text = markdown(fixture);
  assert.match(text, /17 earlier decisions/);
  assert.match(text, /Absent optional Ultra runs: 10, 11/);
  assert.match(text, /1\/1/);
  assert.ok(!text.includes("synthetic fixture"));
});
