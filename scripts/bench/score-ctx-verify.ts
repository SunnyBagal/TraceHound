// Score verify-ctx-v1 and the agreement table on the dev repos (decision 058) and print Markdown
// tables of counts only. For verify-ctx-v1/super/<repo>/kept and agree-diff-ctx/super/<repo>,
// `tracehound bench score` (judge bench-judge-v1, unchanged; a fresh judge request per pull
// request, earlier matches are not reused) unless --no-score. review-diff-v1 and review-ctx-v1 rows
// come from their existing score summaries. Also: per pull request TP/FP (golden index), the
// verifier's verdicts against review-diff-v1's 055 judge outcomes, context statistics and the
// verifier's own record. Never prints comment, golden, reason or context text, or titles. Cal.com
// is not in DEV_REPOS and is never read.
//   node scripts/bench/score-ctx-verify.ts [--bench ~/Projects/tracehound-bench] [--no-score]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addCounts, metrics, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import { contextStats } from "../../packages/analyzer/src/review/verify-ctx-cli.ts";
import { isKept, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const MODEL = "nemotron-3-super-120b-a12b";
const bench = process.argv.includes("--bench") ? process.argv[process.argv.indexOf("--bench") + 1]! : join(homedir(), "Projects/tracehound-bench");
const score = !process.argv.includes("--no-score");
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");

interface Run {
  name: string;
  /** score label prefix in scores/ */
  label: string;
  /** review dir for a repo; set for the runs this script scores */
  reviews?: (repo: string) => string;
}
const RUNS: Run[] = [
  { name: "review-diff-v1", label: `review-diff-v1-${MODEL}` },
  { name: "review-ctx-v1", label: `review-ctx-v1-${MODEL}` },
  { name: "verify-ctx-v1", label: "verify-ctx-v1-super", reviews: (r) => join(bench, "reviews/verify-ctx-v1/super", r, "kept") },
  { name: "agree-diff-ctx", label: "agree-diff-ctx-super", reviews: (r) => join(bench, "reviews/agree-diff-ctx/super", r) },
];

interface Summary {
  counts: Counts;
  pulls: { scored: number; judgeFailed: number };
  usage: { calls: number; cached: number; inputTokens?: number; outputTokens?: number; costUSD: number };
}
const base = (run: Run, repo: string) => join(bench, "scores", `${run.label}-${repo}`);
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;

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
out.push(`Judge on this job's scoring (verify-ctx-v1 + agree-diff-ctx): ${RUNS.filter((r) => r.reviews).map((r) => `${r.name} ${overall[r.name]!.calls} uncached calls, $${overall[r.name]!.cost.toFixed(4)}`).join("; ")}.`, "");

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

// the verifier's verdicts against review-diff-v1's 055 judge outcomes (comment order lines up)
const verdicts: CtxVerifiedReview[] = [];
const joint: Record<string, { kept: number; dropped: number }> = {};
for (const repo of DEV_REPOS) {
  const dir = join(bench, "reviews/verify-ctx-v1/super", repo, "verdicts");
  const detail = readJson<{ detail: PullDetail[] }>(`${base(RUNS[0]!, repo)}.detail.json`).detail;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const v = readJson<CtxVerifiedReview>(join(dir, f));
    verdicts.push(v);
    const d = detail.find((x) => x.reviewFile === f);
    if (!d) throw new Error(`${repo}/${f}: not in the review-diff-v1 detail`);
    if (d.comments.length !== v.comments.length) throw new Error(`${repo}/${f}: ${v.comments.length} verdicts vs ${d.comments.length} scored comments`);
    d.comments.forEach((c, i) => {
      const vc = v.comments[i]!;
      if (vc.path !== c.path || vc.line !== c.line) throw new Error(`${repo}/${f}: comment ${i + 1} does not line up`);
      const k = d.status === "JUDGE_FAILED" ? "judge-failed" : c.outcome!;
      (joint[k] ??= { kept: 0, dropped: 0 })[isKept(vc) ? "kept" : "dropped"]++;
    });
  }
}
const comments = verdicts.flatMap((v) => v.comments);
const sum = (k: "calls" | "cached" | "inputTokens" | "outputTokens" | "costUSD") => comments.reduce((s, c) => s + c.usage[k], 0);
const lat = comments.filter((c) => c.usage.calls > c.usage.cached).map((c) => c.usage.latencyMs);
const verifier = {
  pulls: verdicts.length,
  findingsIn: comments.length,
  kept: comments.filter(isKept).length,
  dropped: comments.filter((c) => !isKept(c)).length,
  verdictKeep: comments.filter((c) => c.verdict === "keep").length,
  verdictDrop: comments.filter((c) => c.verdict === "drop").length,
  verifyFailed: comments.filter((c) => c.status === "VERIFY_FAILED").length,
  retried: comments.filter((c) => c.attempts > 1).length,
  calls: sum("calls"),
  cached: sum("cached"),
  inputTokens: sum("inputTokens"),
  outputTokens: sum("outputTokens"),
  costUSD: Number(sum("costUSD").toFixed(4)),
  latencyMsPerFinding: { n: lat.length, median: median(lat), max: Math.max(0, ...lat) },
  wallMsPerPull: { median: median(verdicts.map((v) => v.verify.wallMs)), max: Math.max(0, ...verdicts.map((v) => v.verify.wallMs)) },
};
out.push("### Verifier", "", "```", JSON.stringify(verifier, null, 1), "```", "");
out.push("review-diff-v1 findings by their 055 judge outcome, kept or dropped by verify-ctx-v1:", "", "| 055 outcome | kept | dropped |", "|---|---|---|");
for (const k of ["tp", "fp", "duplicate", "low", "judge-failed"]) if (joint[k]) out.push(`| ${k} | ${joint[k]!.kept} | ${joint[k]!.dropped} |`);
out.push("", "### Context", "", "```", JSON.stringify(contextStats(comments.map((c) => c.context)), null, 1), "```");
console.log(out.join("\n"));
