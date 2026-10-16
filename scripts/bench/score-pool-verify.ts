// Score pool-verify-v1 on the dev repos (decision 059) and print Markdown tables of counts only.
// For pool-raw/super/<repo> and pool-verify-v1/super/<repo>, `tracehound bench score` (judge
// bench-judge-v1, unchanged; a fresh judge request per pull request, earlier matches are not
// reused) unless --no-score. review-diff-v1, review-ctx-v1, verify-ctx-v1 and agree-diff-ctx rows
// come from their existing score summaries. Also: per pull request TP/FP (golden index), pool and
// verifier statistics, and the whole pipeline's cost per pull request from the existing reviewer
// and verifier records (no new calls). Never prints comment, golden, reason or context text, or
// titles. Cal.com is not in DEV_REPOS and is never read.
//   node scripts/bench/score-pool-verify.ts [--bench ~/Projects/tracehound-bench] [--no-score]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addCounts, metrics, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import { isKept, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";
import { DEV_REPOS, dirs } from "./pool-verify.ts";

const bench = process.argv.includes("--bench") ? process.argv[process.argv.indexOf("--bench") + 1]! : join(homedir(), "Projects/tracehound-bench");
const score = !process.argv.includes("--no-score");
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");
const MODEL = "nemotron-3-super-120b-a12b";

interface Run {
  name: string;
  label: string;
  /** review dir for a repo; set for the runs this script scores */
  reviews?: (repo: string) => string;
}
const RUNS: Run[] = [
  { name: "review-diff-v1", label: `review-diff-v1-${MODEL}` },
  { name: "review-ctx-v1", label: `review-ctx-v1-${MODEL}` },
  { name: "verify-ctx-v1", label: "verify-ctx-v1-super" },
  { name: "agree-diff-ctx", label: "agree-diff-ctx-super" },
  { name: "pool-raw", label: "pool-raw-super", reviews: (r) => dirs(bench, r).raw },
  { name: "pool-verify-v1", label: "pool-verify-v1-super", reviews: (r) => dirs(bench, r).kept },
];

interface Summary {
  counts: Counts;
  pulls: { scored: number; judgeFailed: number };
  usage: { calls: number; cached: number; costUSD: number };
}
const base = (run: Run, repo: string) => join(bench, "scores", `${run.label}-${repo}`);
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
const jsonFiles = (dir: string) => readdirSync(dir).filter((x) => x.endsWith(".json")).sort();

if (score) {
  for (const run of RUNS.filter((r) => r.reviews)) {
    for (const repo of DEV_REPOS) {
      const b = base(run, repo);
      execFileSync(
        process.execPath,
        [bin, "bench", "score", "--golden", join(bench, "golden/code_review_benchmarks", `${repo}.json`), "--reviews", run.reviews!(repo), "--detail", `${b}.detail.json`, "--summary", `${b}.summary.json`, "--label", `${run.name}/super/${repo}`],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
    }
  }
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};
const row = (name: string, c: Counts, jf: number) => {
  const m = metrics(c);
  return `| ${name} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.duplicates} | ${c.lowMatched} | ${c.fn} | ${jf} | ${pct(m.precision)} (${c.tp}/${c.tp + c.fp}) | ${pct(m.recall)} (${c.tp}/${c.tp + c.fn}) | ${pct(m.f)} |`;
};
const HEAD = "| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |\n|---|---|---|---|---|---|---|---|---|---|---|";

const out: string[] = [];
const overall: Record<string, { c: Counts; jf: number; calls: number; cost: number }> = {};
const perRepo: Record<string, Record<string, { c: Counts; jf: number }>> = {};
for (const run of RUNS) {
  let c = zeroCounts();
  let jf = 0;
  let calls = 0;
  let cost = 0;
  for (const repo of DEV_REPOS) {
    const s = readJson<Summary>(`${base(run, repo)}.summary.json`);
    c = addCounts(c, s.counts);
    jf += s.pulls.judgeFailed;
    calls += s.usage.calls - s.usage.cached;
    cost += s.usage.costUSD;
    (perRepo[repo] ??= {})[run.name] = { c: s.counts, jf: s.pulls.judgeFailed };
  }
  overall[run.name] = { c, jf, calls, cost };
}
out.push("### Overall (40 dev pull requests)", "", HEAD, ...RUNS.map((r) => row(r.name, overall[r.name]!.c, overall[r.name]!.jf)), "");
for (const repo of DEV_REPOS) out.push(`### ${repo}`, "", HEAD, ...RUNS.map((r) => row(r.name, perRepo[repo]![r.name]!.c, perRepo[repo]![r.name]!.jf)), "");
out.push(`Judge on this job's scoring: ${RUNS.filter((r) => r.reviews).map((r) => `${r.name} ${overall[r.name]!.calls} uncached calls, $${overall[r.name]!.cost.toFixed(4)}`).join("; ")}.`, "");

// per pull request TP / FP, by golden index
out.push("### Per pull request TP / FP (golden index)", "", `| repo | golden index | ${RUNS.map((r) => `${r.name} TP/FP`).join(" | ")} |`, `|---|---|${RUNS.map(() => "---").join("|")}|`);
for (const repo of DEV_REPOS) {
  const details = RUNS.map((run) => new Map(readJson<{ detail: PullDetail[] }>(`${base(run, repo)}.detail.json`).detail.map((d) => [d.goldenIndex, d])));
  const idx = [...new Set(details.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  for (const i of idx) {
    const cells = details.map((m) => {
      const d = m.get(i);
      return !d ? "–" : d.status === "JUDGE_FAILED" ? "JF" : `${d.counts!.tp}/${d.counts!.fp}`;
    });
    out.push(`| ${repo} | ${i} | ${cells.join(" | ")} |`);
  }
}
out.push("");

// pool statistics, from the pool files' own counts
type PoolMeta = { comments: { line: number | null }[]; pool: { diffFindings: number; ctxFindings: number; ctxOnly: number } };
const pool: Record<string, { pulls: number; diff: number; ctx: number; agreed: number; ctxOnly: number; ctxOnlyNullLine: number; pool: number }> = {};
for (const repo of [...DEV_REPOS, "total"]) pool[repo] = { pulls: 0, diff: 0, ctx: 0, agreed: 0, ctxOnly: 0, ctxOnlyNullLine: 0, pool: 0 };
for (const repo of DEV_REPOS) {
  const d = dirs(bench, repo);
  for (const f of jsonFiles(d.ctxOnly)) {
    const m = readJson<PoolMeta>(join(d.ctxOnly, f));
    for (const t of [pool[repo]!, pool.total!]) {
      t.pulls++;
      t.diff += m.pool.diffFindings;
      t.ctx += m.pool.ctxFindings;
      t.agreed += m.pool.ctxFindings - m.pool.ctxOnly;
      t.ctxOnly += m.pool.ctxOnly;
      t.ctxOnlyNullLine += m.comments.filter((c) => c.line === null).length;
      t.pool += m.pool.diffFindings + m.pool.ctxOnly;
    }
  }
}
out.push(
  "### Pool",
  "",
  "| repo | pull requests | review-diff-v1 findings | review-ctx-v1 findings | review-ctx-v1 agreed (not added) | ctx-only added | null-line ctx-only | pool |",
  "|---|---|---|---|---|---|---|---|",
  ...Object.entries(pool).map(([r, t]) => `| ${r} | ${t.pulls} | ${t.diff} | ${t.ctx} | ${t.agreed} | ${t.ctxOnly} | ${t.ctxOnlyNullLine} | ${t.pool} |`),
  "",
);

// verifier statistics: ctx-only (this job) and the reused 058 verdicts
const verifierStats = (files: string[]) => {
  const vs = files.map((f) => readJson<CtxVerifiedReview>(f));
  const cs = vs.flatMap((v) => v.comments);
  const lat = cs.filter((c) => c.usage.calls > c.usage.cached).map((c) => c.usage.latencyMs);
  return {
    in: cs.length,
    kept: cs.filter(isKept).length,
    dropped: cs.filter((c) => !isKept(c)).length,
    verifyFailed: cs.filter((c) => c.status === "VERIFY_FAILED").length,
    retried: cs.filter((c) => c.attempts > 1).length,
    calls: cs.reduce((s, c) => s + c.usage.calls, 0),
    cached: cs.reduce((s, c) => s + c.usage.cached, 0),
    inputTokens: cs.reduce((s, c) => s + c.usage.inputTokens, 0),
    outputTokens: cs.reduce((s, c) => s + c.usage.outputTokens, 0),
    costUSD: Number(cs.reduce((s, c) => s + c.usage.costUSD, 0).toFixed(4)),
    latencyMsPerFinding: { n: lat.length, median: median(lat), max: Math.max(0, ...lat) },
    promptSha256: [...new Set(vs.map((v) => v.verify.promptSha256))],
  };
};
out.push("### Verifier", "", "| repo | set | in | kept | dropped | VERIFY_FAILED | retries |", "|---|---|---|---|---|---|---|");
const all = { ctxOnly: [] as string[], reused: [] as string[] };
for (const repo of DEV_REPOS) {
  const d = dirs(bench, repo);
  const c = jsonFiles(d.ctxOnlyVerdicts).map((f) => join(d.ctxOnlyVerdicts, f));
  const r = jsonFiles(d.diffVerdicts).map((f) => join(d.diffVerdicts, f));
  all.ctxOnly.push(...c);
  all.reused.push(...r);
  for (const [name, files] of [["ctx-only (this job)", c], ["review-diff-v1 (058, reused)", r]] as const) {
    const s = verifierStats(files);
    out.push(`| ${repo} | ${name} | ${s.in} | ${s.kept} | ${s.dropped} | ${s.verifyFailed} | ${s.retried} |`);
  }
}
out.push("", "ctx-only, all repos:", "", "```", JSON.stringify(verifierStats(all.ctxOnly), null, 1), "```", "");

// product cost: the whole pipeline per pull request, from existing records
type ReviewRecord = { review: { usage: { costUSD: number }; wallMs: number } };
const perPull: { cost: number; wallMs: number }[] = [];
for (const repo of DEV_REPOS) {
  const d = dirs(bench, repo);
  for (const f of jsonFiles(d.ctxOnly)) {
    const a = readJson<ReviewRecord>(join(d.diff, f)).review;
    const b = readJson<ReviewRecord>(join(d.ctx, f)).review;
    const v1 = readJson<CtxVerifiedReview>(join(d.diffVerdicts, f)).verify;
    const v2 = readJson<CtxVerifiedReview>(join(d.ctxOnlyVerdicts, f)).verify;
    perPull.push({ cost: a.usage.costUSD + b.usage.costUSD + v1.usage.costUSD + v2.usage.costUSD, wallMs: a.wallMs + b.wallMs + v1.wallMs + v2.wallMs });
  }
}
const costs = perPull.map((p) => p.cost);
const walls = perPull.map((p) => p.wallMs);
out.push(
  "### Product cost per pull request (review-diff-v1 + review-ctx-v1 + verify-ctx-v1 on the pool; summed, from existing records)",
  "",
  "| pull requests | cost median | cost max | wall time median | wall time max |",
  "|---|---|---|---|---|",
  `| ${perPull.length} | $${median(costs).toFixed(4)} | $${Math.max(...costs).toFixed(4)} | ${(median(walls) / 1000).toFixed(0)} s | ${(Math.max(...walls) / 1000).toFixed(0)} s |`,
);
console.log(out.join("\n"));
