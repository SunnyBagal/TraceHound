// Score one tool's recorded reviews on all five repos (decision 054, step 4). Converts the recorded
// data to the neutral format, runs `tracehound bench score` per repo, and prints counts only:
// the counted author logins (Cal.com: counts only), per-repo and overall rows beside the
// published figure. Detail and summaries go to <bench>/scores/.
//   node scripts/bench/score-tool.ts --tool greptile [--bench ~/Projects/tracehound-bench] [--repos a,b]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { convertRecorded } from "../../packages/analyzer/src/bench/convert.ts";
import { addCounts, formatCounts, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";

const REPOS = ["sentry", "cal_dot_com", "grafana", "keycloak", "discourse"];
const BLIND = "cal_dot_com";
/** Augment's write-up of this dataset (updated 18 June 2026, all 50 pull requests): precision / recall / F-score, %. */
export const PUBLISHED: Record<string, [number, number, number]> = {
  greptile: [45, 45, 45],
  coderabbit: [36, 43, 39],
  augment: [65, 55, 59],
  cursor: [60, 41, 49],
  copilot: [20, 34, 25],
};

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tool = arg("--tool");
if (!tool) throw new Error("--tool is required");
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const repos = arg("--repos")?.split(",") ?? REPOS;
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");

// 1. convert; logins are printed for dev repos, Cal.com's only as counts against them
const seen: Record<string, number> = {};
const blind = { comments: 0, unseenLogins: 0, unseenComments: 0 };
const blindAuthors: Record<string, number> = {};
for (const repo of repos) {
  const r = convertRecorded(join(bench, "recorded", tool, repo), join(bench, "reviews", tool, repo), tool);
  if (repo === BLIND) {
    blind.comments = r.comments;
    Object.assign(blindAuthors, r.authors);
    continue;
  }
  console.log(`[convert] ${tool}/${repo}: pulls ${r.pulls} · counted comments ${r.comments} · by ${JSON.stringify(r.authors)}`);
  for (const [login, n] of Object.entries(r.authors)) seen[login] = (seen[login] ?? 0) + n;
}
for (const [login, n] of Object.entries(blindAuthors)) {
  if (login in seen) seen[login] += n;
  else (blind.unseenLogins++, (blind.unseenComments += n));
}
if (repos.includes(BLIND))
  console.log(`[convert] ${tool}/${BLIND}: counted comments ${blind.comments} · logins not seen in the dev repos: ${blind.unseenLogins} (${blind.unseenComments} comments)`);
console.log(`[convert] ${tool} logins counted, all repos (Cal.com comments added to logins seen in dev repos): ${JSON.stringify(seen)}`);

// 2. score
let overall: Counts = zeroCounts();
let judgeFailed = 0;
let calls = 0;
let cost = 0;
const rows: string[] = [];
for (const repo of repos) {
  const summary = join(bench, "scores", `${tool}-${repo}.summary.json`);
  const out = execFileSync(
    process.execPath,
    [bin, "bench", "score", "--golden", join(bench, "golden/code_review_benchmarks", `${repo}.json`), "--reviews", join(bench, "reviews", tool, repo), "--detail", join(bench, "scores", `${tool}-${repo}.detail.json`), "--summary", summary, "--label", `${tool}/${repo}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  process.stdout.write(out);
  const s = JSON.parse(readFileSync(summary, "utf8")) as { counts: Counts; pulls: { scored: number; judgeFailed: number }; usage: { calls: number; costUSD: number } };
  overall = addCounts(overall, s.counts);
  judgeFailed += s.pulls.judgeFailed;
  calls += s.usage.calls;
  cost += s.usage.costUSD;
  rows.push(`${repo.padEnd(12)} scored PRs ${s.pulls.scored} · JUDGE_FAILED ${s.pulls.judgeFailed} · ${formatCounts(s.counts)}`);
}
console.log(`\n== ${tool} ==`);
for (const r of rows) console.log(r);
console.log(`${"overall".padEnd(12)} JUDGE_FAILED ${judgeFailed} · ${formatCounts(overall)}`);
const p = PUBLISHED[tool];
if (p) console.log(`${"published".padEnd(12)} precision ${p[0]}% · recall ${p[1]}% · F ${p[2]}% (Augment's write-up, all 50 PRs, judge not stated)`);
console.log(`judge calls ${calls} · $${cost.toFixed(4)}`);
