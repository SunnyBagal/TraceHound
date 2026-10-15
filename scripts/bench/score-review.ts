// Score one reviewer run on the dev repos (decision 055, step 4) with `tracehound bench score`
// (judge bench-judge-v1, unchanged), then print counts only: per-repo and overall rows, and the
// reviewer's own record (calls, chunks, CHUNK_FAILED, drops, tokens, cost, latency per pull
// request). Never prints comment text. Cal.com is refused.
//   node scripts/bench/score-review.ts --run review-diff-v1/<model dir> [--bench ~/Projects/tracehound-bench]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addCounts, formatCounts, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const run = arg("--run");
if (!run) throw new Error("--run is required (e.g. review-diff-v1/nemotron-3-super-120b-a12b)");
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const label = run.replaceAll("/", "-");
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");

let overall: Counts = zeroCounts();
let judgeFailed = 0;
let judgeCalls = 0;
let judgeCost = 0;
const rows: string[] = [];
for (const repo of DEV_REPOS) {
  const summary = join(bench, "scores", `${label}-${repo}.summary.json`);
  const out = execFileSync(
    process.execPath,
    [bin, "bench", "score", "--golden", join(bench, "golden/code_review_benchmarks", `${repo}.json`), "--reviews", join(bench, "reviews", run, repo), "--detail", join(bench, "scores", `${label}-${repo}.detail.json`), "--summary", summary, "--label", `${run}/${repo}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  process.stdout.write(out);
  const s = JSON.parse(readFileSync(summary, "utf8")) as { counts: Counts; pulls: { scored: number; judgeFailed: number }; usage: { calls: number; costUSD: number } };
  overall = addCounts(overall, s.counts);
  judgeFailed += s.pulls.judgeFailed;
  judgeCalls += s.usage.calls;
  judgeCost += s.usage.costUSD;
  rows.push(`${repo.padEnd(10)} scored PRs ${s.pulls.scored} · JUDGE_FAILED ${s.pulls.judgeFailed} · ${formatCounts(s.counts)}`);
}

// the reviewer's own record, from the review files
interface Rec {
  comments: unknown[];
  review: { chunks: { status: string }[]; chunkFailed: number; findings: number; dropped: Record<string, number>; usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number }; wallMs: number };
}
const recs: Rec[] = DEV_REPOS.flatMap((repo) => {
  const dir = join(bench, "reviews", run, repo);
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Rec);
});
const sum = (f: (r: Rec) => number) => recs.reduce((a, r) => a + f(r), 0);
const dropped: Record<string, number> = {};
for (const r of recs) for (const [k, v] of Object.entries(r.review.dropped)) dropped[k] = (dropped[k] ?? 0) + v;
const wall = recs.map((r) => r.review.wallMs).sort((a, b) => a - b);
const median = wall.length % 2 ? wall[(wall.length - 1) / 2]! : (wall[wall.length / 2 - 1]! + wall[wall.length / 2]!) / 2;

console.log(`\n== ${run} ==`);
for (const r of rows) console.log(r);
console.log(`${"overall".padEnd(10)} JUDGE_FAILED ${judgeFailed} · ${formatCounts(overall)}`);
console.log(
  `reviewer: pulls ${recs.length} · calls ${sum((r) => r.review.usage.calls)} (cached ${sum((r) => r.review.usage.cached)}) · chunks ${sum((r) => r.review.chunks.length)} · ` +
    `CHUNK_FAILED ${sum((r) => r.review.chunkFailed)} · findings ${sum((r) => r.review.findings)} · kept ${sum((r) => r.comments.length)} · ` +
    `pulls with no comment ${recs.filter((r) => !r.comments.length).length} · dropped ${JSON.stringify(dropped)}`,
);
console.log(
  `reviewer: in ${sum((r) => r.review.usage.inputTokens)} · out ${sum((r) => r.review.usage.outputTokens)} tokens · $${sum((r) => r.review.usage.costUSD).toFixed(4)} · ` +
    `wall time per pull request median ${(median / 1000).toFixed(1)} s · max ${(wall.at(-1)! / 1000).toFixed(1)} s`,
);
console.log(`judge: calls ${judgeCalls} · $${judgeCost.toFixed(4)}`);
