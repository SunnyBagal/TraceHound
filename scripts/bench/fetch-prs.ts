// Pull request inputs for the diff-only reviewer (decision 055, step 2). Dev repos only: Cal.com is
// the blind test set and is refused here, except in the test-set mode of decision 061
// (`--test-set cal_dot_com`, only with TRACEHOUND_TEST_RUN=061 set; writes under <bench>/test/prs/
// instead of <bench>/prs/). For each golden entry, takes the pull request with that
// title in the greptile-<repo> fork (recorded/greptile/<repo>/pulls.json, decision 054) and saves its
// number, title, body and unified diff to <bench>/prs/<repo>/<golden index>.json. Then compares each
// diff's sha256 with the same pull request's in the coderabbit-<repo> fork (diffs are not saved).
// Prints counts only, never titles, bodies or diff text.
//   node scripts/bench/fetch-prs.ts [--bench ~/Projects/tracehound-bench] [--repos sentry,grafana,...]
//   TRACEHOUND_TEST_RUN=061 node scripts/bench/fetch-prs.ts --test-set cal_dot_com [--bench ...]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mapByTitle } from "../../packages/analyzer/src/bench/titles.ts";
import { fetchTarget } from "./test-set.ts";

const ORG = "ai-code-review-evaluations";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const { repos, root } = fetchTarget(process.argv.slice(2), process.env, bench);

function gh(args: string[]): string {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      if (attempt >= 3) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed after 3 attempts: ${(err as Error).message.split("\n")[0]}`);
    }
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sizes: number[] = [];
const statsOf = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  return `min ${s[0]} · median ${mid} · max ${s[s.length - 1]}`;
};

for (const repo of repos) {
  const golden = (JSON.parse(readFileSync(join(bench, "golden/code_review_benchmarks", `${repo}.json`), "utf8")) as { pr_title: string }[]).map((g) => g.pr_title);
  const dir = join(root, "prs", repo);
  mkdirSync(dir, { recursive: true });
  const pullsOf = (tool: string) =>
    (JSON.parse(readFileSync(join(bench, "recorded", tool, repo, "pulls.json"), "utf8")) as { number: number; title: string }[]).sort((a, b) => a.number - b.number);
  const greptile = mapByTitle(golden, pullsOf("greptile"), (p) => p.title);
  const coderabbit = new Map(mapByTitle(golden, pullsOf("coderabbit"), (p) => p.title).matched.map((m) => [m.golden, m.pr.number]));
  const repoSizes: number[] = [];
  const differed: number[] = [];
  const missingInCoderabbit: number[] = [];
  let same = 0;
  for (const { golden: g, pr } of greptile.matched) {
    const file = join(dir, `${g}.json`);
    let rec: { golden_index: number; number: number; title: string; body: string; diff: string; fork: string; diff_sha256: string };
    if (existsSync(file)) {
      rec = JSON.parse(readFileSync(file, "utf8"));
    } else {
      const fork = `${ORG}/greptile-${repo}`;
      const view = JSON.parse(gh(["pr", "view", String(pr.number), "-R", fork, "--json", "number,title,body"])) as { number: number; title: string; body: string };
      const diff = gh(["pr", "diff", String(pr.number), "-R", fork]);
      rec = { golden_index: g, number: view.number, title: view.title, body: view.body ?? "", diff, fork, diff_sha256: sha(diff) };
      writeFileSync(file, JSON.stringify(rec, null, 1) + "\n");
    }
    repoSizes.push(rec.diff.length);
    const cr = coderabbit.get(g);
    if (cr === undefined) {
      missingInCoderabbit.push(g);
      continue;
    }
    const crDiff = gh(["pr", "diff", String(cr), "-R", `${ORG}/coderabbit-${repo}`]);
    if (sha(crDiff) === rec.diff_sha256) same++;
    else differed.push(g);
  }
  sizes.push(...repoSizes);
  console.log(
    `${repo}: saved ${greptile.matched.length} · unmatched golden ${greptile.unmatchedGolden.length} · diff chars ${statsOf(repoSizes)} · ` +
      `coderabbit diff sha256 same ${same}/${greptile.matched.length - missingInCoderabbit.length}` +
      (differed.length ? ` · differed at golden indexes ${differed.join(",")}` : "") +
      (missingInCoderabbit.length ? ` · not in coderabbit fork: ${missingInCoderabbit.join(",")}` : ""),
  );
}
console.log(`all: ${sizes.length} pull requests · diff chars ${statsOf(sizes)}`);
