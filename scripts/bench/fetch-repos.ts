// Repositories for the context reviewer (decision 057, step 2). Dev repos only: Cal.com is the
// blind test set and is refused here. For each dev repo, a bare clone of the greptile-<repo> fork
// at <bench>/repos/<repo>/, plus refs/pull/<n>/head for each of its saved pull requests
// (<bench>/prs/<repo>/<golden index>.json, decision 055). Then each head's diff against the merge
// base with the pull request's base is compared with the saved diff (sha256, and normalised: git
// and GitHub differ in `index` line abbreviation and hunk-header function context). Writes <bench>/repos/<repo>.heads.json
// ({golden index: {number, head, base, mergeBase, match}}). Prints counts only.
//   node scripts/bench/fetch-repos.ts [--bench ~/Projects/tracehound-bench] [--repos sentry,...]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const ORG = "ai-code-review-evaluations";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const repos = arg("--repos")?.split(",") ?? DEV_REPOS;
for (const r of repos) if (!DEV_REPOS.includes(r)) throw new Error(`refusing repo ${r}: dev repos only (${DEV_REPOS.join(", ")})`);

const run = (cmd: string, args: string[], cwd?: string) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, env: cleanGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/**
 * Drops `index` lines (hash abbreviation) and the function context after a hunk header's second
 * `@@` (git's default funcname rule against GitHub's language-aware one); the rest must be equal.
 */
const normalise = (d: string) =>
  d
    .split("\n")
    .filter((l) => !l.startsWith("index "))
    .map((l) => l.replace(/^(@@ [^@]* @@).*$/, "$1"))
    .join("\n")
    .trimEnd();

let total = 0;
let matched = 0;
for (const repo of repos) {
  const t0 = performance.now();
  const dir = join(bench, "repos", repo);
  const fork = `${ORG}/greptile-${repo}`;
  if (!existsSync(dir)) run("git", ["clone", "--bare", "--quiet", `https://github.com/${fork}.git`, dir]);
  const prs = Array.from({ length: 10 }, (_, g) => JSON.parse(readFileSync(join(bench, "prs", repo, `${g}.json`), "utf8")) as { golden_index: number; number: number; diff: string; diff_sha256: string });
  run("git", ["fetch", "--quiet", "origin", ...prs.map((p) => `+refs/pull/${p.number}/head:refs/pull/${p.number}/head`)], dir);
  const heads: Record<number, { number: number; head: string; base: string; mergeBase: string; exact: boolean; match: boolean }> = {};
  let repoMatched = 0;
  let exact = 0;
  for (const p of prs) {
    const view = JSON.parse(run("gh", ["pr", "view", String(p.number), "-R", fork, "--json", "baseRefName,headRefOid"])) as { baseRefName: string; headRefOid: string };
    const head = run("git", ["rev-parse", `refs/pull/${p.number}/head`], dir).trim();
    const base = run("git", ["rev-parse", `refs/heads/${view.baseRefName}`], dir).trim();
    const mergeBase = run("git", ["merge-base", base, head], dir).trim();
    const diff = run("git", ["diff", "--no-color", "--no-ext-diff", mergeBase, head], dir);
    const isExact = sha(diff) === p.diff_sha256;
    const match = head === view.headRefOid && (isExact || normalise(diff) === normalise(p.diff));
    if (isExact) exact++;
    if (match) repoMatched++;
    heads[p.golden_index] = { number: p.number, head, base, mergeBase, exact: isExact, match };
  }
  writeFileSync(join(bench, "repos", `${repo}.heads.json`), JSON.stringify(heads, null, 1) + "\n");
  const size = run("du", ["-sk", dir]).split("\t")[0];
  total += prs.length;
  matched += repoMatched;
  console.log(`${repo}: diff matches ${repoMatched}/${prs.length} (sha256 exact ${exact}) · clone ${(Number(size) / 1024).toFixed(0)} MB · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`all: diff matches ${matched}/${total}`);
