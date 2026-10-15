// Score verify-v1 (decision 056) on the dev repos at thresholds 1 to 5. For each threshold:
// `tracehound verify filter` (no model call) from the verified files, then `tracehound bench score`
// (judge bench-judge-v1, unchanged; pull requests whose kept comments did not change hit the judge's
// cache). Prints counts only: per-repo and overall rows per threshold, the threshold the rule
// chooses (highest overall F; on a tie, the higher threshold), the confidence-against-outcome table
// from the threshold-1 score detail, and the verifier's own record. Never prints comment text,
// reasons or titles. Cal.com is not in DEV_REPOS and is never read.
//   node scripts/bench/score-verify.ts [--model-dir nemotron-3-super-120b-a12b] [--bench ~/Projects/tracehound-bench] [--thresholds 1,2,3,4,5]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addCounts, formatCounts, metrics, scorePull, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import type { VerifiedReview } from "../../packages/analyzer/src/review/verify.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const modelDir = arg("--model-dir") ?? "nemotron-3-super-120b-a12b";
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const thresholds = (arg("--thresholds") ?? "1,2,3,4,5").split(",").map(Number);
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");
const root = join(bench, "reviews", "verify-v1", modelDir);

interface Row {
  counts: Counts;
  judgeFailed: number;
  scored: number;
  judgeCalls: number;
  judgeCached: number;
  judgeCostUSD: number;
}
const results: Record<number, { overall: Row; repos: Record<string, Row> }> = {};

for (const t of thresholds) {
  const repos: Record<string, Row> = {};
  let overall: Row = { counts: zeroCounts(), judgeFailed: 0, scored: 0, judgeCalls: 0, judgeCached: 0, judgeCostUSD: 0 };
  for (const repo of DEV_REPOS) {
    const dir = join(root, `t${t}`, repo);
    execFileSync(process.execPath, [bin, "verify", "filter", "--verified", join(root, "all", repo), "--threshold", String(t), "--out", dir], { stdio: ["ignore", "ignore", "inherit"] });
    const base = join(bench, "scores", `verify-v1-${modelDir}-t${t}-${repo}`);
    execFileSync(
      process.execPath,
      [bin, "bench", "score", "--golden", join(bench, "golden/code_review_benchmarks", `${repo}.json`), "--reviews", dir, "--detail", `${base}.detail.json`, "--summary", `${base}.summary.json`, "--label", `verify-v1/t${t}/${repo}`],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const s = JSON.parse(readFileSync(`${base}.summary.json`, "utf8")) as { counts: Counts; pulls: { scored: number; judgeFailed: number }; usage: { calls: number; cached: number; costUSD: number } };
    const row: Row = { counts: s.counts, judgeFailed: s.pulls.judgeFailed, scored: s.pulls.scored, judgeCalls: s.usage.calls, judgeCached: s.usage.cached, judgeCostUSD: s.usage.costUSD };
    repos[repo] = row;
    overall = {
      counts: addCounts(overall.counts, row.counts),
      judgeFailed: overall.judgeFailed + row.judgeFailed,
      scored: overall.scored + row.scored,
      judgeCalls: overall.judgeCalls + row.judgeCalls,
      judgeCached: overall.judgeCached + row.judgeCached,
      judgeCostUSD: overall.judgeCostUSD + row.judgeCostUSD,
    };
  }
  results[t] = { overall, repos };
  console.log(`\n== verify-v1 threshold ${t} ==`);
  for (const repo of DEV_REPOS) {
    const r = repos[repo]!;
    console.log(`${repo.padEnd(10)} scored PRs ${r.scored} · JUDGE_FAILED ${r.judgeFailed} · ${formatCounts(r.counts)}`);
  }
  console.log(`${"overall".padEnd(10)} scored PRs ${overall.scored} · JUDGE_FAILED ${overall.judgeFailed} · ${formatCounts(overall.counts)}`);
  console.log(`judge: calls ${overall.judgeCalls} (cached ${overall.judgeCached}) · $${overall.judgeCostUSD.toFixed(4)}`);
}

// the rule (decision 056, step 4): highest overall dev F; on a tie, the higher threshold
let chosen: number | null = null;
for (const t of [...thresholds].sort((a, b) => b - a)) {
  const f = metrics(results[t]!.overall.counts).f ?? -1;
  if (chosen === null || f > (metrics(results[chosen]!.overall.counts).f ?? -1) + 1e-12) chosen = t;
}
console.log(`\nchosen threshold (highest overall F, ties to the higher threshold): ${chosen}`);

// confidence against outcome, from the threshold-1 detail (every finding is kept at 1)
const outcomes = ["tp", "fp", "duplicate", "low", "judge-failed"] as const;
const keys = ["1", "2", "3", "4", "5", "VERIFY_FAILED"] as const;
const table: Record<string, Record<string, number>> = Object.fromEntries(keys.map((k) => [k, Object.fromEntries(outcomes.map((o) => [o, 0]))]));
let joined = 0;
const all: VerifiedReview[] = [];
if (thresholds.includes(1)) {
  for (const repo of DEV_REPOS) {
    const detail = JSON.parse(readFileSync(join(bench, "scores", `verify-v1-${modelDir}-t1-${repo}.detail.json`), "utf8")) as { detail: PullDetail[] };
    for (const d of detail.detail) {
      const v = JSON.parse(readFileSync(join(root, "all", repo, d.reviewFile), "utf8")) as VerifiedReview;
      if (v.comments.length !== d.comments.length) throw new Error(`${repo}/${d.reviewFile}: ${v.comments.length} verified vs ${d.comments.length} scored comments`);
      d.comments.forEach((c, i) => {
        const vc = v.comments[i]!;
        if (vc.path !== c.path || vc.line !== c.line) throw new Error(`${repo}/${d.reviewFile}: comment ${i + 1} does not line up`);
        const key = vc.status === "VERIFY_FAILED" ? "VERIFY_FAILED" : String(vc.confidence);
        table[key]![d.status === "JUDGE_FAILED" ? "judge-failed" : c.outcome!]!++;
        joined++;
      });
    }
  }
  // sensitivity, not the rule's input: each threshold scored by reusing the threshold-1 matches
  // (scorePull on the kept comments) instead of re-judging the smaller comment sets
  console.log(`\nreusing the threshold-1 matches (no re-judging; for comparison only)`);
  for (const t of thresholds) {
    let c = zeroCounts();
    for (const repo of DEV_REPOS) {
      const detail = JSON.parse(readFileSync(join(bench, "scores", `verify-v1-${modelDir}-t1-${repo}.detail.json`), "utf8")) as { detail: PullDetail[] };
      for (const d of detail.detail) {
        if (d.status !== "SCORED") continue;
        const v = JSON.parse(readFileSync(join(root, "all", repo, d.reviewFile), "utf8")) as VerifiedReview;
        const kept = d.comments.filter((_, i) => v.comments[i]!.confidence === null || v.comments[i]!.confidence! >= t);
        c = addCounts(c, scorePull(d.golden.map((g) => g.severity), kept.map((k) => (k.matched === null ? null : Number(k.matched.slice(1)) - 1))).counts);
      }
    }
    console.log(`threshold ${t}: ${formatCounts(c)}`);
  }
  console.log(`\nconfidence × outcome (threshold-1 detail, ${joined} findings joined)`);
  console.log(["confidence".padEnd(14), ...outcomes.map((o) => o.padStart(13)), "total".padStart(7)].join(""));
  for (const k of keys) {
    const r = table[k]!;
    console.log([k.padEnd(14), ...outcomes.map((o) => String(r[o]).padStart(13)), String(outcomes.reduce((s, o) => s + r[o]!, 0)).padStart(7)].join(""));
  }
}

// the verifier's own record
for (const repo of DEV_REPOS) for (const f of readdirSync(join(root, "all", repo)).filter((x) => x.endsWith(".json"))) all.push(JSON.parse(readFileSync(join(root, "all", repo, f), "utf8")) as VerifiedReview);
const comments = all.flatMap((v) => v.comments);
const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => comments.reduce((s, c) => s + c.usage[k], 0);
const lat = comments.filter((c) => c.usage.calls > c.usage.cached).map((c) => c.usage.latencyMs).sort((a, b) => a - b);
const median = lat.length ? (lat.length % 2 ? lat[(lat.length - 1) / 2]! : (lat[lat.length / 2 - 1]! + lat[lat.length / 2]!) / 2) : null;
const verifier = {
  pulls: all.length,
  findings: comments.length,
  verifyFailed: comments.filter((c) => c.status === "VERIFY_FAILED").length,
  retried: comments.filter((c) => c.attempts > 1).length,
  partialDiffs: comments.filter((c) => c.partial).length,
  calls: sum("calls"),
  cached: sum("cached"),
  inputTokens: sum("inputTokens"),
  outputTokens: sum("outputTokens"),
  costUSD: sum("costUSD"),
  latencyMsPerFinding: { n: lat.length, median, max: lat.at(-1) ?? null },
};
console.log(`\nverifier: ${JSON.stringify(verifier)}`);

const out = join(bench, "scores", `verify-v1-${modelDir}.results.json`);
writeFileSync(out, JSON.stringify({ thresholds: results, chosen, confidenceOutcome: table, joined, verifier }, null, 1) + "\n");
console.log(`counts written to ${out}`);
