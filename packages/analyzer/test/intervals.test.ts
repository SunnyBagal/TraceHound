// Intervals for the v2 gaps (069b, scripts/bench/intervals.ts): synthetic counts only. A known-gap
// fixture, seed determinism, the JUDGE_FAILED drop, pairing, and the wording rule. No bench data.
import { describe, expect, it } from "vitest";
import { commentBootstrap, microF, pair, pairedBootstrap, quantile, rng, sentence, sum, type PrCounts } from "../../../scripts/bench/intervals.ts";

const pr = (i: number, tp: number, fp: number, fn: number, judgeFailed = false): PrCounts => ({ key: `r#${i}`, tp, fp, fn, judgeFailed });
const rowOf = (n: number, f: (i: number) => [number, number, number]) => Array.from({ length: n }, (_, i) => pr(i, ...f(i)));

describe("micro F and quantiles", () => {
  it("F = 2TP / (2TP + FP + FN), 0 on an empty row", () => {
    expect(microF({ tp: 12, fp: 7, fn: 11 })).toBeCloseTo(24 / 42, 12);
    expect(microF({ tp: 0, fp: 0, fn: 0 })).toBe(0);
  });
  it("quantile interpolates between order statistics", () => {
    expect(quantile([0, 1, 2, 3, 4], 0.5)).toBe(2);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
});

describe("paired bootstrap", () => {
  it("a known gap: a perfect row against an all-miss row is +100 in every resample", () => {
    const a = rowOf(20, () => [2, 0, 0]);
    const b = rowOf(20, () => [0, 1, 2]);
    const r = pairedBootstrap(a, b, 2000);
    expect(r).toMatchObject({ observed: 1, lo: 1, hi: 1, shareAbove0: 1, prs: 20, dropped: 0 });
  });

  it("identical rows give exactly 0 in every resample (the pairing is exact)", () => {
    const a = rowOf(15, (i) => [i % 3, i % 2, (i + 1) % 3]);
    const r = pairedBootstrap(a, a.map((p) => ({ ...p })), 2000);
    expect(r).toMatchObject({ observed: 0, lo: 0, hi: 0, shareAbove0: 0 });
  });

  it("a mixed fixture: the interval brackets the observed gap and the share is in between", () => {
    const a = rowOf(30, (i) => (i % 2 ? [2, 0, 0] : [1, 1, 1]));
    const b = rowOf(30, (i) => (i % 3 ? [1, 1, 1] : [0, 2, 2]));
    const r = pairedBootstrap(a, b, 5000);
    expect(r.observed).toBeCloseTo(microF(sum(a)) - microF(sum(b)), 12);
    expect(r.lo).toBeLessThan(r.observed);
    expect(r.hi).toBeGreaterThan(r.observed);
    expect(r.shareAbove0).toBeGreaterThan(0.5);
  });

  it("is deterministic for a seed and changes with it", () => {
    const a = rowOf(10, (i) => [i % 3, 1, i % 2]);
    const b = rowOf(10, (i) => [(i + 1) % 2, i % 3, 1]);
    expect(pairedBootstrap(a, b, 3000, 69)).toEqual(pairedBootstrap(a, b, 3000, 69));
    const g = rng(69);
    const h = rng(69);
    const k = rng(70);
    expect([g(), g(), g()]).toEqual([h(), h(), h()]);
    expect(k()).not.toBe(rng(69)());
  });

  it("drops a PR that is JUDGE_FAILED on either side from both rows, and counts it", () => {
    const a = [pr(0, 2, 0, 0), pr(1, 0, 5, 3, true), pr(2, 1, 0, 0), pr(3, 0, 0, 0)];
    const b = [pr(0, 0, 0, 2), pr(1, 3, 0, 0), pr(2, 0, 0, 1), pr(3, 5, 5, 5, true)];
    const p = pair(a, b);
    expect(p.dropped).toBe(2);
    expect(p.a.map((x) => x.key)).toEqual(["r#0", "r#2"]);
    expect(p.b.map((x) => x.key)).toEqual(["r#0", "r#2"]);
    const r = pairedBootstrap(a, b, 1000);
    expect(r).toMatchObject({ prs: 2, dropped: 2, observed: 1, lo: 1, hi: 1 });
  });

  it("pairs by key, not by position, and refuses different PR sets", () => {
    const a = [pr(0, 1, 0, 0), pr(1, 0, 1, 1)];
    expect(pair(a, [...a].reverse()).b.map((x) => x.key)).toEqual(["r#0", "r#1"]);
    expect(() => pair(a, [pr(0, 1, 0, 0), pr(2, 0, 1, 1)])).toThrow(/same pull requests/);
    expect(() => pair(a, [pr(0, 1, 0, 0)])).toThrow(/same pull requests/);
  });
});

describe("comment-level bootstrap (secondary)", () => {
  it("is deterministic, and the inflated interval is wider by about sqrt(deff)", () => {
    const a = { tp: 14, fp: 11, fn: 9 };
    const b = { tp: 10, fp: 7, fn: 13 };
    const r = commentBootstrap(a, b, 20000);
    expect(r).toEqual(commentBootstrap(a, b, 20000));
    expect(r.observed).toBeCloseTo(microF(a) - microF(b), 12);
    const ratio = (r.inflatedHi - r.inflatedLo) / (r.hi - r.lo);
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.4);
  });
});

describe("wording rule", () => {
  const iv = (lo: number, hi: number) => ({ observed: (lo + hi) / 2, lo, hi, shareAbove0: 0.5 });
  it("ahead / behind only when the interval excludes 0, otherwise tied", () => {
    expect(sentence("Greptile", iv(0.01, 0.2))).toBe("ahead of Greptile");
    expect(sentence("Augment", iv(-0.3, -0.02))).toBe("behind Augment");
    expect(sentence("Cursor", iv(-0.1, 0.1))).toBe("statistically tied with Cursor");
    expect(sentence("Copilot", iv(0, 0.2))).toBe("statistically tied with Copilot");
  });
});
