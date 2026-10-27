// Decision 070, step 5: P009's dev selection from records, no model call. Prints counts only.
// - baselines: pool-raw's dev rows under bench-judge-v1 (and x1 where scored), per run and mean:
//   3 Super runs 1, 2r, 4, 5, 6; 3.5 Super runs 7r, 8;
// - per arm (S, V): P/R/F under both judges, findings per PR, and the same without the missed pass and
//   without lens B, recomputed from the judge's per-comment matches (the scorer's own scorePull on
//   the comments left; no new judge call); cost and seconds per PR; truncation and retry counts;
// - the floor (v1 precision ≥ same-model pool-raw mean − 10.0), the pick (higher v1 recall; within
//   2.0 points the cheaper per PR) and cost per PR × 657.
//   node scripts/bench/v3-results.ts [--bench <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { addCounts, metrics, scorePull, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import type { RecallOutput } from "../../packages/analyzer/src/review/recall/run.ts";
import { DEV_REPOS } from "./test-set.ts";

const bench = process.argv.includes("--bench") ? process.argv[process.argv.indexOf("--bench") + 1]! : join(homedir(), "Projects/tracehound-bench");
const REVIEWBENCH_PRS = 657;
const pct = (x: number | null) => (x === null ? "n/a" : (100 * x).toFixed(1));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const sumRepos = (file: (repo: string) => string) => DEV_REPOS.reduce((c, repo) => addCounts(c, (JSON.parse(readFileSync(file(repo), "utf8")) as { counts: Counts }).counts), zeroCounts());
const row = (name: string, c: Counts) => {
  const m = metrics(c);
  return `| ${name} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f)} |`;
};
const HEAD = "| row | comments | TP | FP | FN | P | R | F |\n|---|---|---|---|---|---|---|---|";

// ---- baselines ----
const dr = (run: string) => join(bench, "reviews/dev-repeat", run, "scores");
const BASE: Record<"S" | "V", { run: string; v1: (r: string) => string; x1: ((r: string) => string) | null }[]> = {
  S: [
    { run: "1", v1: (r) => join(bench, "scores", `pool-raw-super-${r}.summary.json`), x1: null },
    ...["2r", "4", "5", "6"].map((n) => ({ run: n, v1: (r: string) => join(dr(`run-${n}`), "judge-v1", `pool-raw-${r}.summary.json`), x1: (r: string) => join(dr(`run-${n}`), "judge-x1", `pool-raw-${r}.summary.json`) })),
  ],
  V: [
    { run: "7r", v1: (r) => join(dr("run-7-nvidia-nemotron-3-5-super-vlr"), "judge-v1", `pool-raw-${r}.summary.json`), x1: (r) => join(dr("run-7-nvidia-nemotron-3-5-super-vlr"), "judge-x1", `pool-raw-${r}.summary.json`) },
    { run: "8", v1: (r) => join(dr("run-8-nvidia-nemotron-3-5-super-vl"), "judge-v1", `pool-raw-${r}.summary.json`), x1: (r) => join(dr("run-8-nvidia-nemotron-3-5-super-vl"), "judge-x1", `pool-raw-${r}.summary.json`) },
  ],
};
const baseMean: Record<string, { p: number; r: number }> = {};
console.log("## pool-raw dev baselines (recomputed from the run records)\n");
for (const arm of ["S", "V"] as const) {
  for (const judge of ["v1", "x1"] as const) {
    console.log(`### ${arm === "S" ? "3 Super" : "3.5 Super"}, bench-judge-${judge}\n\n${HEAD}`);
    const ms: { p: number; r: number; f: number }[] = [];
    for (const b of BASE[arm]) {
      const f = judge === "v1" ? b.v1 : b.x1;
      if (!f || !existsSync(f(DEV_REPOS[0]))) {
        console.log(`| run ${b.run} | not scored by this judge | | | | | | |`);
        continue;
      }
      const c = sumRepos(f);
      const m = metrics(c);
      ms.push({ p: m.precision!, r: m.recall!, f: m.f! });
      console.log(row(`run ${b.run}`, c));
    }
    const mean = (k: "p" | "r" | "f") => ms.reduce((s, x) => s + x[k], 0) / ms.length;
    console.log(`| **mean of ${ms.length}** | | | | | ${pct(mean("p"))} | ${pct(mean("r"))} | ${pct(mean("f"))} |\n`);
    if (judge === "v1") baseMean[arm] = { p: mean("p"), r: mean("r") };
  }
}

// ---- arms ----
type Producer = "lensA" | "lensB" | "missed";
const armStats: Record<string, { p: number; r: number; costMedian: number; costMean: number }> = {};
for (const arm of ["S", "V"] as const) {
  const dir = join(bench, "reviews/dev-v3", arm);
  if (!existsSync(join(dir, "scores/judge-v1"))) {
    console.log(`## arm ${arm}: not scored\n`);
    continue;
  }
  const recs = new Map<string, RecallOutput>();
  for (const repo of DEV_REPOS) for (const f of readdirSync(join(dir, repo))) recs.set(`${repo}/${f}`, JSON.parse(readFileSync(join(dir, repo, f), "utf8")) as RecallOutput);
  console.log(`## arm ${arm} (${[...recs.values()][0]!.review.model})\n`);
  for (const judge of ["judge-v1", "judge-x1"]) {
    if (!existsSync(join(dir, "scores", judge, `${DEV_REPOS[0]}.detail.json`))) continue;
    const variants: Record<string, Counts> = { all: zeroCounts(), "without missed": zeroCounts(), "without lens B": zeroCounts(), "lens A only": zeroCounts() };
    let judgeFailed = 0;
    for (const repo of DEV_REPOS) {
      const d = JSON.parse(readFileSync(join(dir, "scores", judge, `${repo}.detail.json`), "utf8")) as { detail: PullDetail[] };
      for (const pull of d.detail) {
        if (pull.status !== "SCORED") {
          judgeFailed++;
          continue;
        }
        const producers = recs.get(`${repo}/${pull.reviewFile}`)!.comments.map((c) => c.producer as Producer);
        const sev = pull.golden.map((g) => g.severity);
        const keep = (drop: Producer[]) => pull.comments.filter((_, i) => !drop.includes(producers[i]!)).map((c) => (c.matched ? Number(c.matched.slice(1)) - 1 : null));
        variants.all = addCounts(variants.all, scorePull(sev, keep([])).counts);
        variants["without missed"] = addCounts(variants["without missed"]!, scorePull(sev, keep(["missed"])).counts);
        variants["without lens B"] = addCounts(variants["without lens B"]!, scorePull(sev, keep(["lensB"])).counts);
        variants["lens A only"] = addCounts(variants["lens A only"]!, scorePull(sev, keep(["lensB", "missed"])).counts);
      }
    }
    const summed = sumRepos((r) => join(dir, "scores", judge, `${r}.summary.json`));
    if (JSON.stringify(summed) !== JSON.stringify(variants.all)) throw new Error(`${arm} ${judge}: recomputed counts differ from the summaries`);
    console.log(`### bench-judge-${judge.slice(6)} (JUDGE_FAILED ${judgeFailed})\n\n${HEAD}`);
    for (const [k, c] of Object.entries(variants)) console.log(row(k, c));
    console.log("");
    if (judge === "judge-v1") {
      const m = metrics(variants.all);
      armStats[arm] = { p: m.precision!, r: m.recall!, costMedian: 0, costMean: 0 };
    }
  }
  const all = [...recs.values()];
  const v = all.map((r) => r.review);
  const costs = v.map((x) => x.costUSD);
  const secs = v.map((x) => x.wallMs / 1000);
  const calls = v.flatMap((x) => x.calls);
  const n = (s: string) => calls.filter((c) => c.status === s).length;
  const found = all.map((r) => r.comments.length);
  const by = (p: Producer) => all.reduce((s, r) => s + r.comments.filter((c) => c.producer === p).length, 0);
  armStats[arm]!.costMedian = median(costs);
  armStats[arm]!.costMean = costs.reduce((a, b) => a + b, 0) / costs.length;
  console.log(`- pull requests ${all.length}; findings ${found.reduce((a, b) => a + b, 0)} (lens A ${by("lensA")}, lens B ${by("lensB")}, missed ${by("missed")}); per PR median ${median(found)}, max ${Math.max(...found)}; PRs with 0 findings ${found.filter((x) => x === 0).length}; capped at 60 ${v.filter((x) => x.reduce.capped > 0).length}`);
  console.log(`- lens calls ${calls.length}: OK ${n("OK")}, FAILED ${n("FAILED")}, SKIPPED ${n("SKIPPED")}; truncated replies ${calls.reduce((s, c) => s + c.truncated, 0)} (calls with one ${calls.filter((c) => c.truncated > 0).length}); retries ${calls.reduce((s, c) => s + c.retries, 0)}`);
  const failures = new Map<string, number>();
  for (const c of calls) if (c.failure) failures.set(c.failure.slice(0, 160), (failures.get(c.failure.slice(0, 160)) ?? 0) + 1);
  for (const [f, k] of failures) console.log(`  - lens failure ×${k}: ${f}`);
  console.log(`- missed pass: OK ${v.filter((x) => x.missed.status === "OK").length}, FAILED ${v.filter((x) => x.missed.status === "FAILED").length}, SKIPPED ${v.filter((x) => x.missed.status === "SKIPPED").length}; chunks failed ${v.reduce((s, x) => s + x.missed.chunkFailed, 0)}`);
  const mf = new Map<string, number>();
  for (const x of v) if (x.missed.failure) mf.set(x.missed.failure.slice(0, 160), (mf.get(x.missed.failure.slice(0, 160)) ?? 0) + 1);
  for (const [f, k] of mf) console.log(`  - missed failure ×${k}: ${f}`);
  console.log(`- skipped files ${v.reduce((s, x) => s + x.skipped.length, 0)} (${JSON.stringify(v.flatMap((x) => x.skipped.map((s) => s.reason)).reduce<Record<string, number>>((o, r) => ((o[r] = (o[r] ?? 0) + 1), o), {}))}); chunks ${v.reduce((s, x) => s + x.chunks.length, 0)}; per-PR budget refusals ${v.reduce((s, x) => s + x.budget.refused, 0)} on ${v.filter((x) => x.budget.refused > 0).length} PRs; guard hit ${v.filter((x) => x.guard.hit).length}; errors ${v.reduce((s, x) => s + x.errors.length, 0)}`);
  console.log(`- cost per PR median $${median(costs).toFixed(4)}, mean $${armStats[arm]!.costMean.toFixed(4)}, max $${Math.max(...costs).toFixed(4)}, total $${costs.reduce((a, b) => a + b, 0).toFixed(4)}; seconds per PR median ${median(secs).toFixed(0)}, max ${Math.max(...secs).toFixed(0)}`);
  console.log(`- ReviewBench final estimate: mean $${(armStats[arm]!.costMean * REVIEWBENCH_PRS).toFixed(2)} (median $${(median(costs) * REVIEWBENCH_PRS).toFixed(2)}) for ${REVIEWBENCH_PRS} PRs\n`);
}

// ---- floor and pick ----
console.log("## P009 dev selection\n");
const qualifying: string[] = [];
for (const arm of ["S", "V"] as const) {
  const a = armStats[arm];
  if (!a) continue;
  const floor = baseMean[arm]!.p - 0.1;
  const ok = a.p >= floor;
  if (ok) qualifying.push(arm);
  console.log(`- arm ${arm}: v1 precision ${pct(a.p)} vs floor ${pct(floor)} (pool-raw mean ${pct(baseMean[arm]!.p)} − 10.0) → ${ok ? "qualifies" : "does not qualify"}; v1 recall ${pct(a.r)}; cost per PR mean $${a.costMean.toFixed(4)}`);
}
if (!qualifying.length) console.log("- pick: none qualifies → v3 stops here; the P008 winner gets the final");
else if (qualifying.length === 1) console.log(`- pick: ${qualifying[0]} (the only qualifying arm)`);
else {
  const [s, v] = [armStats.S!, armStats.V!];
  const diff = 100 * (s.r - v.r);
  const pick = Math.abs(diff) <= 2.0 ? (s.costMean <= v.costMean ? "S" : "V") + " (recall tie within 2.0 points: the cheaper per PR)" : diff > 0 ? "S (higher v1 recall)" : "V (higher v1 recall)";
  console.log(`- recall S − V = ${diff.toFixed(1)} points → pick: ${pick}`);
}
