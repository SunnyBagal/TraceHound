// Title mapping counts per fork (decision 054, step 2d). Prints counts only, never titles.
//   node scripts/bench/map-titles.ts [--bench ~/Projects/tracehound-bench]
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mapByTitle } from "../../packages/analyzer/src/bench/titles.ts";

const TOOLS = ["greptile", "coderabbit", "augment", "cursor", "copilot"];
const REPOS = ["sentry", "cal_dot_com", "grafana", "keycloak", "discourse"];
const i = process.argv.indexOf("--bench");
const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");

console.log("fork\tpulls\tmatched\tunmatched pulls\tunmatched golden\tduplicate-title pulls");
for (const tool of TOOLS) {
  for (const repo of REPOS) {
    const pullsFile = join(bench, "recorded", tool, repo, "pulls.json");
    if (!existsSync(pullsFile)) {
      console.log(`${tool}-${repo}\tnot fetched`);
      continue;
    }
    const golden = (JSON.parse(readFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), "utf8")) as { pr_title: string }[]).map((g) => g.pr_title);
    const pulls = (JSON.parse(readFileSync(pullsFile, "utf8")) as { number: number; title: string }[]).sort((a, b) => a.number - b.number);
    const m = mapByTitle(golden, pulls, (p) => p.title);
    console.log(`${tool}-${repo}\t${pulls.length}\t${m.matched.length}\t${m.unmatchedPrs.length}\t${m.unmatchedGolden.length}\t${m.duplicatePrs.length}`);
  }
}
