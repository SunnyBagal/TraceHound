// Changed files per golden pull request by extension: .ts and .tsx against everything else
// (decision 054, step 4). Reads the saved file names of one tool's fork; prints the golden index,
// the fork pull request number and counts only, never paths or titles.
//   node scripts/bench/file-exts.ts --repo grafana [--tool greptile] [--bench ~/Projects/tracehound-bench]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { mapByTitle } from "../../packages/analyzer/src/bench/titles.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const repo = arg("--repo") ?? "grafana";
const tool = arg("--tool") ?? "greptile";
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");

const golden = (JSON.parse(readFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), "utf8")) as { pr_title: string }[]).map((g) => g.pr_title);
const dir = join(bench, "recorded", tool, repo);
const pulls = (JSON.parse(readFileSync(join(dir, "pulls.json"), "utf8")) as { number: number; title: string }[]).sort((a, b) => a.number - b.number);
const m = mapByTitle(golden, pulls, (p) => p.title);
console.log(`${repo} (file names from ${tool}-${repo}); golden index · fork PR · files · .ts · .tsx · other`);
let tot = { files: 0, ts: 0, tsx: 0, other: 0 };
for (const { golden: g, pr } of m.matched) {
  const files = (JSON.parse(readFileSync(join(dir, `pr-${pr.number}.json`), "utf8")) as { files: string[] }).files;
  const ts = files.filter((f) => extname(f) === ".ts").length;
  const tsx = files.filter((f) => extname(f) === ".tsx").length;
  tot = { files: tot.files + files.length, ts: tot.ts + ts, tsx: tot.tsx + tsx, other: tot.other + files.length - ts - tsx };
  console.log(`G#${g + 1}\tPR ${pr.number}\t${files.length}\t${ts}\t${tsx}\t${files.length - ts - tsx}`);
}
console.log(`total\t\t${tot.files}\t${tot.ts}\t${tot.tsx}\t${tot.other}`);
