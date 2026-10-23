// Decision 067's scoring (scripts/bench/dev-3-5.ts): the adoption rule and the paired bootstrap, on
// invented counts. No files, no network.
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { attemptsUsage, bootstrap, meanF, mulberry32, verdict, type RunScores } from "../../../scripts/bench/dev-3-5.ts";
import { zeroCounts, type Counts } from "../src/bench/score.ts";

type Pr = { tp: number; fp: number; fn: number };
function run(label: string, prs: Record<string, Pr>, x1 = prs): RunScores {
  const tot = (m: Record<string, Pr>) => Object.values(m).reduce<Counts>((c, p) => ({ ...c, tp: c.tp + p.tp, fp: c.fp + p.fp, fn: c.fn + p.fn }), zeroCounts());
  return { label, pulls: { "judge-v1": new Map(Object.entries(prs)), "judge-x1": new Map(Object.entries(x1)) }, totals: { "judge-v1": tot(prs), "judge-x1": tot(x1) } };
}
const KEYS = ["a/0.json", "a/1.json", "b/0.json", "b/1.json"];
const prs = (tp: number, fp: number, fn: number) => Object.fromEntries(KEYS.map((k) => [k, { tp, fp, fn }]));

describe("dev-3-5 scoring (decision 067)", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(67);
    const b = mulberry32(67);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("mean F is the mean of per-run F on summed counts", () => {
    // run 1: P 0.5, R 0.5 → F 0.5; run 2: tp 1 fp 0 fn 1 → P 1, R 0.5 → F 2/3
    expect(meanF([run("1", prs(1, 1, 1)), run("2", prs(1, 0, 1))], "judge-v1", KEYS)).toBeCloseTo((0.5 + 2 / 3) / 2, 12);
  });

  it("bootstrap: identical runs give a zero interval; the same seed gives the same interval", () => {
    const base = [run("1", prs(1, 1, 1))];
    expect(bootstrap(base, [run("7", prs(1, 1, 1))], "judge-v1", KEYS, 200)).toEqual({ point: 0, lo: 0, hi: 0, below0: 0 });
    const cand = [run("7", { ...prs(1, 1, 1), "a/0.json": { tp: 2, fp: 0, fn: 0 } })];
    const b1 = bootstrap(base, cand, "judge-v1", KEYS, 500);
    expect(bootstrap(base, cand, "judge-v1", KEYS, 500)).toEqual(b1);
    expect(b1.lo).toBeLessThanOrEqual(b1.point);
    expect(b1.hi).toBeGreaterThanOrEqual(b1.point);
  });

  it("verdict: all three conditions, F margin 3.0 points", () => {
    const base = [run("1", prs(1, 1, 1))]; // P 0.5, F 0.5
    // F 0.53 needs P ≥ 0.5 too: tp 53 fp 47 fn 47 → P = R = F = 0.53
    const at = (tp: number, fp: number, fn: number, x1?: Record<string, Pr>) => [run("7", prs(tp, fp, fn), x1)];
    expect(verdict(base, at(53, 47, 47)).adopted).toBe(true);
    expect(verdict(base, at(52, 48, 48)).pass.f).toBe(false);
    expect(verdict(base, at(1, 1, 0)).pass).toMatchObject({ f: true, precision: true }); // P 0.5, R 1
    expect(verdict(base, at(53, 47, 47, prs(1, 2, 1))).pass.x1).toBe(false);
    expect(verdict(base, at(60, 61, 1)).pass.precision).toBe(false);
  });
  it("attemptsUsage: a run the cap stopped before some repos counts the pull requests it has", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-067-usage-"));
    const u = { inputTokens: 10, outputTokens: 20, costUSD: 0.01 };
    mkdirSync(path.join(dir, "attempts", "sentry"), { recursive: true });
    const attempt = { diff: { review: { usage: u } }, ctx: { review: { usage: u } }, diffVerdicts: { verify: { usage: u } }, ctxOnlyVerdicts: { verify: { usage: u } } };
    writeFileSync(path.join(dir, "attempts", "sentry", "0.attempt-1.json"), JSON.stringify(attempt));
    const out = attemptsUsage(dir);
    expect(out).toHaveLength(1);
    expect(out[0]!.inputTokens).toBe(40);
    expect(out[0]!.outputTokens).toBe(80);
  });
});
