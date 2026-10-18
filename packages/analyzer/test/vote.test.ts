// Vote across runs (decision 064, scripts/bench/vote.ts): votes, clusters and representatives, the
// per-PR cap, the fallback variants, the adoption rule, and one run on an invented bench with a fake
// judge. No network, no dataset text.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { adoption, applyVariant, baselineOf, capPerPull, countVotes, main, variantsFor, voteKeep } from "../../../scripts/bench/vote.ts";
import { DEV_REPOS, runDir } from "../../../scripts/bench/test-set.ts";
import { JUDGE_SYSTEM_PROMPT } from "../src/bench/judge.ts";
import { zeroCounts, type Counts } from "../src/bench/score.ts";
import type { ChatRequest } from "../src/llm/client.ts";

const c = (line: number | null, body = `b${line}`, p = "src/a.ts") => ({ path: p, line, body });

describe("votes", () => {
  it("count the runs holding an agreeing finding, the finding's own run included", () => {
    const runs = [[c(10), c(50)], [c(12)], [c(14), c(90)], [], [c(10, "x", "./src/a.ts")]];
    // 10 agrees with 10, 12 and ./src/a.ts:10 (14 is 4 away); 14 only with 12 and itself
    expect(countVotes(runs).map((v) => [v.run, v.pos, v.comment.line, v.votes])).toEqual([
      [0, 0, 10, 3],
      [0, 1, 50, 1],
      [1, 0, 12, 4],
      [2, 0, 14, 2],
      [2, 1, 90, 1],
      [4, 0, 10, 3],
    ]);
  });

  it("a null line agrees with nothing, not even itself", () => {
    expect(countVotes([[c(null)], [c(null)]]).map((v) => v.votes)).toEqual([0, 0]);
    expect(voteKeep([[c(null)], [c(null)]], 1)).toEqual([]);
  });
});

describe("clusters and representatives", () => {
  it("keep votes ≥ k; the representative is the earliest run's member; output in cluster order", () => {
    const runs = [[c(10, "r0")], [c(11, "r1"), c(40, "r1-40")], [c(12, "r2"), c(41, "r2-41")], [c(70, "r3")], []];
    expect(voteKeep(runs, 3).map((v) => v.comment.body)).toEqual(["r0"]);
    expect(voteKeep(runs, 2).map((v) => v.comment.body)).toEqual(["r0", "r1-40"]);
    expect(voteKeep(runs, 1).map((v) => v.comment.body)).toEqual(["r0", "r1-40", "r3"]);
    expect(voteKeep(runs, 2)[1]).toMatchObject({ run: 1, pos: 1, votes: 2 });
  });

  it("two findings of one run are never merged", () => {
    const runs = [[c(10, "a"), c(12, "b")], [c(11, "c")], [c(11, "d")]];
    // a and b both agree with c and d: three votes each; b starts its own cluster
    expect(voteKeep(runs, 3).map((v) => v.comment.body)).toEqual(["a", "b"]);
  });

  it("a later finding joins the first cluster that agrees with its representative", () => {
    const runs = [[c(10, "a")], [c(16, "b")], [c(13, "m")]];
    // m agrees with a (3) and b (3); a and b do not agree (6 apart)
    expect(countVotes(runs).map((v) => v.votes)).toEqual([2, 2, 3]);
    expect(voteKeep(runs, 2).map((v) => v.comment.body)).toEqual(["a", "b"]); // m joined a's cluster
  });

  it("findings in other files never agree", () => {
    expect(voteKeep([[c(10, "a", "x.ts")], [c(10, "b", "y.ts")]], 2)).toEqual([]);
    expect(voteKeep([[c(10, "a", "a/x.ts")], [c(10, "b", "b/x.ts")]], 2).map((v) => v.comment.body)).toEqual(["a"]); // diff prefixes normalised
  });
});

describe("the per-PR cap", () => {
  it("keeps the n with most votes, ties to the earlier run then the earlier position", () => {
    const runs = [[c(10, "a"), c(30, "b")], [c(11), c(31), c(60, "e")], [c(12), c(61)], [c(13), c(62)], [c(31), c(90, "z")]];
    const reps = voteKeep(runs, 1);
    expect(reps.map((v) => [v.comment.body, v.votes])).toEqual([["a", 4], ["b", 3], ["e", 3], ["z", 1]]);
    expect(capPerPull(reps, 2).map((v) => v.comment.body)).toEqual(["a", "b"]); // b and e tie on votes: b's run is earlier
    const tie = voteKeep([[c(10, "a"), c(30, "b")], [c(11), c(31)]], 2);
    expect(capPerPull(tie, 1).map((v) => v.comment.body)).toEqual(["a"]);
  });
});

describe("variants", () => {
  it("five runs: the plan's four; the fallback for four and three; none below three", () => {
    expect(variantsFor(5).map((v) => [v.name, v.source, v.k, v.cap])).toEqual([
      ["vote-k3of5", "pool-verify-v1", 3, undefined],
      ["vote-k2of5", "pool-verify-v1", 2, undefined],
      ["vote-raw-k3of5", "pool-raw", 3, undefined],
      ["vote-k3of5-cap2", "pool-verify-v1", 3, 2],
    ]);
    expect(variantsFor(4).map((v) => v.name)).toEqual(["vote-k3of4", "vote-k2of4", "vote-raw-k3of4", "vote-k3of4-cap2"]);
    expect(variantsFor(3).map((v) => v.name)).toEqual(["vote-k2of3", "vote-raw-k2of3", "vote-k2of3-cap2"]);
    expect(() => variantsFor(2)).toThrow(/fewer than 3/);
  });

  it("cap2 is k3 then the cap", () => {
    const runs = [[c(10), c(30), c(50)], [c(10), c(30), c(50)], [c(10), c(30), c(50)], [c(10)], []];
    const [k3, , , cap2] = variantsFor(5);
    expect(applyVariant(k3!, runs).map((v) => v.comment.line)).toEqual([10, 30, 50]);
    expect(applyVariant(cap2!, runs).map((v) => v.comment.line)).toEqual([10, 30]);
  });
});

describe("the adoption rule", () => {
  const counts = (tp: number, fp: number, fn: number): Counts => ({ ...zeroCounts(), comments: tp + fp, tp, fp, fn });
  // baseline: two runs, F 40% and 50% (mean 45%), P 40% and 50% (mean 45%)
  const base = baselineOf([
    { label: "1", v1: counts(4, 6, 6), x1: counts(4, 6, 6) },
    { label: "2", v1: counts(5, 5, 5), x1: counts(5, 5, 5) },
  ]);

  it("baseline means are plain means of the per-run values", () => {
    expect(base.meanF.v1).toBeCloseTo(0.45, 12);
    expect(base.meanP.v1).toBeCloseTo(0.45, 12);
  });

  it("adopts the best v1 F only with ≥ 5.0 points, precision above the mean, and x1 at or above its mean", () => {
    // F exactly 50%: 5.0 points above 45%
    expect(adoption([{ name: "a", v1: counts(5, 5, 5), x1: counts(5, 5, 5) }], base)).toMatchObject({ best: "a", adopted: true });
    // 4.x points: fails the margin
    expect(adoption([{ name: "a", v1: counts(49, 51, 51), x1: counts(5, 5, 5) }], base).adopted).toBe(false);
    // F high through recall, precision below the mean
    const lowP = adoption([{ name: "a", v1: counts(4, 6, 0), x1: counts(5, 5, 5) }], base);
    expect(lowP.checks.fMargin.pass && !lowP.checks.precision.pass && !lowP.adopted).toBe(true);
    // x1 below its mean
    expect(adoption([{ name: "a", v1: counts(6, 4, 4), x1: counts(4, 6, 6) }], base)).toMatchObject({ adopted: false, checks: { x1: { pass: false } } });
    // only the best under v1 is considered, even when a lower one would pass
    expect(adoption([{ name: "pass", v1: counts(6, 4, 4), x1: counts(6, 4, 4) }, { name: "best", v1: counts(7, 6, 0), x1: counts(0, 1, 9) }], base)).toMatchObject({ best: "best", adopted: false });
  });
});

// ---- one run on an invented bench: run 1 in 059's layout, runs 2r, 4, 5, 6 in 061's ----

const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const put = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
};
const PRICES = path.resolve(import.meta.dirname, "../../../config/prices.json");

describe("vote.ts on invented data", () => {
  it("writes the variants, judges them with both judges, reads the baseline, prints counts only", async () => {
    const bench = mkdtempSync(path.join(tmpdir(), "tracehound-064-vote-"));
    temps.push(bench);
    const pr = (repo: string, comments: unknown[]) => ({ pr_title: `SECRET-TITLE-${repo}`, pr_number: 1, comments });
    const real = c(10, "SECRET-REAL");
    const noise = (i: number) => c(100 + 10 * i, `SECRET-NOISE-${i}`);
    const counts: Counts = { ...zeroCounts(), comments: 2, tp: 1, fp: 1, fn: 0, goldenCounted: 1 };
    const usage = { costUSD: 0.01 };
    for (const repo of DEV_REPOS) {
      put(path.join(bench, "golden/code_review_benchmarks", `${repo}.json`), [{ pr_title: `SECRET-TITLE-${repo}`, comments: [{ comment: "SECRET-GOLDEN", severity: "High" }] }]);
      // run 1 (059's layout)
      put(path.join(bench, "reviews/pool-verify-v1/super", repo, "0.json"), pr(repo, [real, noise(0)]));
      put(path.join(bench, "reviews/pool-raw/super", repo, "0.json"), pr(repo, [real, noise(0), noise(9)]));
      put(path.join(bench, "reviews/review-diff-v1/nemotron-3-super-120b-a12b", repo, "0.json"), { review: { usage } });
      put(path.join(bench, "reviews/review-ctx-v1/nemotron-3-super-120b-a12b", repo, "0.json"), { review: { usage } });
      put(path.join(bench, "reviews/verify-ctx-v1/super", repo, "verdicts/0.json"), { verify: { usage } });
      put(path.join(bench, "reviews/pool-verify-v1/super", repo, "ctx-only-verdicts/0.json"), { verify: { usage } });
      for (const j of ["scores", "scores/judge-x1"]) put(path.join(bench, j, `pool-verify-v1-super-${repo}.summary.json`), { counts, pulls: { judgeFailed: 0 } });
    }
    put(path.join(runDir(bench, "dev", 2), "run.json"), { status: "running", costUSD: 1 });
    for (const [n, r] of [[2, true], [4, false], [5, false], [6, false]] as const) {
      const dir = runDir(bench, "dev", n, r);
      put(path.join(dir, "run.json"), { status: "complete", costUSD: 1, pulls: DEV_REPOS.map((repo) => ({ repo, file: "0.json", costUSD: 0.05 })) });
      for (const repo of DEV_REPOS) {
        put(path.join(dir, "pool-verify-v1", repo, "0.json"), pr(repo, n === 6 ? [] : [real, noise(n)]));
        put(path.join(dir, "pool-raw", repo, "0.json"), pr(repo, [real, noise(n), noise(9)]));
        for (const j of ["judge-v1", "judge-x1"]) put(path.join(dir, "scores", j, `pool-verify-v1-${repo}.summary.json`), { counts, pulls: { judgeFailed: 0 } });
      }
    }
    // dev run 3, stopped at 061's cap, plays no part
    put(path.join(runDir(bench, "dev", 3), "run.json"), { status: "stopped-at-cap", costUSD: 1 });

    let judgeCalls = 0;
    const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      const req = JSON.parse(String(init?.body)) as ChatRequest;
      if (req.messages[0]!.content !== JUDGE_SYSTEM_PROMPT) throw new Error("unexpected request");
      judgeCalls++;
      const blocks = (req.messages[1]!.content as string).split("Review comments:\n\n")[1]!.split("\n\n---\n\n");
      const content = JSON.stringify({ matches: blocks.map((b) => ({ tool: /^(T\d+)/.exec(b)![1], golden: b.includes("SECRET-REAL") ? "G1" : null })) });
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200 });
    }) as typeof globalThis.fetch;
    const out: string[] = [];
    const env = { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "15" };
    const state = mkdtempSync(path.join(tmpdir(), "tracehound-064-state-"));
    temps.push(state);
    expect(await main(bench, env, (l) => out.push(l), (l) => out.push(l), fetch, { stateDir: state, pricesFile: PRICES })).toBe(0);

    const lines = (variant: string) => JSON.parse(readFileSync(path.join(bench, "reviews/vote", variant, "sentry/0.json"), "utf8")).comments.map((x: { line: number }) => x.line);
    expect(lines("vote-k3of5")).toEqual([10]); // real: 5 runs; each noise once
    expect(lines("vote-k2of5")).toEqual([10]);
    expect(lines("vote-raw-k3of5")).toEqual([10, 190]); // noise(9) is in every pool-raw
    expect(lines("vote-k3of5-cap2")).toEqual([10]);
    expect(judgeCalls).toBe(2 * 4 * 2); // k3, k2 and cap2 send the same request per repo: the judge cache answers two of them
    expect(readdirSync(path.join(bench, "reviews/vote/scores/judge-x1")).filter((f) => f.endsWith(".summary.json"))).toHaveLength(16);
    const text = out.join("\n");
    expect(text).toContain("runs 1, 2r, 4, 5, 6");
    expect(text).toContain("| vote-k3of5 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 100.0% (4/4) | 100.0% (4/4) | 100.0% | 1.00 |");
    expect(text).toContain("| vote-raw-k3of5 | 8 | 4 | 4 | 0 | 0 | 0 | 0 | 50.0% (4/8) | 100.0% (4/4) | 66.7% | 2.00 |");
    expect(text).toContain("| baseline pool-verify-v1 run 2r | 8 | 4 | 4 |");
    expect(text).toContain("baseline mean over 5 runs: F 66.7% · P 50.0%");
    expect(text).toContain("verdict: ADOPT vote-k3of5");
    expect(text).toContain("cost per pull request of a 5-run vote (sum of the runs' pipelines): median $0.2400 · max $0.2400");
    for (const s of ["SECRET-TITLE", "SECRET-REAL", "SECRET-NOISE", "SECRET-GOLDEN"]) expect(text).not.toContain(s);
    // never overwritten
    expect(await main(bench, env, (l) => out.push(l), (l) => out.push(l), fetch, { stateDir: state, pricesFile: PRICES })).toBe(1);
  });
});
