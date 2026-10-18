// Vote across runs (decision 064; plan `docs/bench/vote-plan.md`, pushed before any model call).
// Dev only. Each variant takes, per pull request, the outputs of the completed dev runs (1, 2r, 4,
// 5, 6) and keeps a finding when findings that agree with it (agree-rule.ts) occur in at least k
// runs; one representative per cluster, from the earliest run. The only model calls are the two
// judges (bench-judge-v1, scorer of record; bench-judge-x1, report only) on the variants' outputs.
// stdout gets counts only; variant outputs and score detail go to <bench>/reviews/vote/, outside
// this repo, and are never overwritten.
//   node scripts/bench/vote.ts [--bench <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { JUDGE_VERSION, LlmJudge } from "../../packages/analyzer/src/bench/judge.ts";
import { addCounts, loadReviews, metrics, scoreRepo, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { GoldenFile, PullReview, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { BudgetExceededError } from "../../packages/analyzer/src/llm/client.ts";
import { agrees } from "./agree-rule.ts";
import { dirs } from "./pool-verify.ts";
import { buildClients, JUDGES, TABLE_HEAD, tableRow, writeNew } from "./run-test-set.ts";
import { DEV_REPOS, EXTRA_CAP_USD, inputPaths, readRunJson, standingRunDir } from "./test-set.ts";

// ---- voting (pure) ----

export interface Vote {
  comment: ReviewComment;
  /** index of the run (in the order given) */
  run: number;
  /** position in its run's output */
  pos: number;
  /** runs holding at least one finding that agrees with this one, its own run included */
  votes: number;
}

/** Each finding of each run with its votes, in run order then file order. */
export function countVotes(runs: ReviewComment[][]): Vote[] {
  return runs.flatMap((findings, run) =>
    findings.map((comment, pos) => ({ comment, run, pos, votes: runs.filter((other) => other.some((o) => agrees(comment, o))).length })),
  );
}

/**
 * Representatives of the findings with votes ≥ k: taken in run order then file order, each joins
 * the first cluster whose representative it agrees with and which has no member from its run;
 * otherwise it starts a cluster. So a representative is its cluster's earliest-run member, and two
 * findings of one run are never merged.
 */
export function voteKeep(runs: ReviewComment[][], k: number): Vote[] {
  const clusters: { rep: Vote; runs: Set<number> }[] = [];
  for (const v of countVotes(runs).filter((v) => v.votes >= k)) {
    const c = clusters.find((c) => !c.runs.has(v.run) && agrees(v.comment, c.rep.comment));
    if (c) c.runs.add(v.run);
    else clusters.push({ rep: v, runs: new Set([v.run]) });
  }
  return clusters.map((c) => c.rep);
}

/** At most n representatives: most votes first, then the earlier run, then the earlier position; output in that rank order. */
export function capPerPull(reps: Vote[], n: number): Vote[] {
  return [...reps].sort((a, b) => b.votes - a.votes || a.run - b.run || a.pos - b.pos).slice(0, n);
}

// ---- the plan's variants ----

export type Source = "pool-verify-v1" | "pool-raw";
export interface Variant {
  name: string;
  source: Source;
  k: number;
  cap?: number;
}

/** The variants of vote-plan.md for the number of completed runs (5, or the fallback's 4 or 3). */
export function variantsFor(n: number): Variant[] {
  if (n === 5 || n === 4) {
    const of = `of${n}`;
    return [
      { name: `vote-k3${of}`, source: "pool-verify-v1", k: 3 },
      { name: `vote-k2${of}`, source: "pool-verify-v1", k: 2 },
      { name: `vote-raw-k3${of}`, source: "pool-raw", k: 3 },
      { name: `vote-k3${of}-cap2`, source: "pool-verify-v1", k: 3, cap: 2 },
    ];
  }
  if (n === 3) {
    return [
      { name: "vote-k2of3", source: "pool-verify-v1", k: 2 },
      { name: "vote-raw-k2of3", source: "pool-raw", k: 2 },
      { name: "vote-k2of3-cap2", source: "pool-verify-v1", k: 2, cap: 2 },
    ];
  }
  throw new Error(`no vote with ${n} completed runs (vote-plan.md: fewer than 3 means no vote)`);
}

export function applyVariant(v: Variant, runs: ReviewComment[][]): Vote[] {
  const reps = voteKeep(runs, v.k);
  return v.cap === undefined ? reps : capPerPull(reps, v.cap);
}

// ---- the adoption rule ----

export interface Scored {
  name: string;
  v1: Counts;
  x1: Counts;
}
export interface Baseline {
  /** per run, in run order */
  runs: { label: string; v1: Counts; x1: Counts }[];
  meanF: { v1: number; x1: number };
  meanP: { v1: number };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function baselineOf(runs: Baseline["runs"]): Baseline {
  const m = (c: Counts, k: "f" | "precision") => metrics(c)[k] ?? 0;
  return { runs, meanF: { v1: mean(runs.map((r) => m(r.v1, "f"))), x1: mean(runs.map((r) => m(r.x1, "f"))) }, meanP: { v1: mean(runs.map((r) => m(r.v1, "precision"))) } };
}

export const F_MARGIN = 0.05;

/** vote-plan.md's rule: the variant with the highest v1 F, adopted only if it passes all three conditions. */
export function adoption(variants: Scored[], base: Baseline) {
  const f = (c: Counts) => metrics(c).f ?? 0;
  const best = [...variants].sort((a, b) => f(b.v1) - f(a.v1))[0]!;
  const checks = {
    fMargin: { value: f(best.v1) - base.meanF.v1, pass: f(best.v1) - base.meanF.v1 >= F_MARGIN - 1e-12 },
    precision: { value: metrics(best.v1).precision ?? 0, pass: (metrics(best.v1).precision ?? 0) > base.meanP.v1 },
    x1: { value: f(best.x1), pass: f(best.x1) >= base.meanF.x1 },
  };
  return { best: best.name, checks, adopted: checks.fMargin.pass && checks.precision.pass && checks.x1.pass };
}

// ---- the run (I/O) ----

interface RunRef {
  label: string;
  /** the pool-verify-v1 and pool-raw review directories of a repo */
  reviews: (repo: string, source: Source) => string;
  /** a pull request's pipeline cost, by repo and file */
  cost: (repo: string, file: string) => number;
  /** summary files of the run's own pool-verify-v1 scoring */
  summary: (judge: "judge-v1" | "judge-x1", repo: string) => string;
}

type ReviewRecord = { review: { usage: { costUSD: number } } };
type VerifyRecord = { verify: { usage: { costUSD: number } } };
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;

/** Dev run 1: decision 059's records. */
function run1(bench: string): RunRef {
  return {
    label: "1",
    reviews: (repo, source) => (source === "pool-verify-v1" ? dirs(bench, repo).kept : dirs(bench, repo).raw),
    cost: (repo, file) => {
      const d = dirs(bench, repo);
      return (
        readJson<ReviewRecord>(join(d.diff, file)).review.usage.costUSD +
        readJson<ReviewRecord>(join(d.ctx, file)).review.usage.costUSD +
        readJson<VerifyRecord>(join(d.diffVerdicts, file)).verify.usage.costUSD +
        readJson<VerifyRecord>(join(d.ctxOnlyVerdicts, file)).verify.usage.costUSD
      );
    },
    // 059's scoring: bench-judge-v1 under scores/, bench-judge-x1 under scores/judge-x1/ (060)
    summary: (judge, repo) => join(bench, judge === "judge-v1" ? "scores" : "scores/judge-x1", `pool-verify-v1-super-${repo}.summary.json`),
  };
}

/** A dev repeat run, read from run-<n>r/ once restarted; null unless complete. */
function repeatRun(bench: string, run: 2 | 4 | 5 | 6): RunRef | null {
  const { dir, restarted } = standingRunDir(bench, "dev", run);
  if (!existsSync(dir) || readRunJson(dir).status !== "complete") return null;
  const pulls = readJson<{ pulls: { repo: string; file: string; costUSD: number }[] }>(join(dir, "run.json")).pulls;
  return {
    label: `${run}${restarted ? "r" : ""}`,
    reviews: (repo, source) => join(dir, source, repo),
    cost: (repo, file) => pulls.find((p) => p.repo === repo && p.file === file)!.costUSD,
    summary: (judge, repo) => join(dir, "scores", judge, `pool-verify-v1-${repo}.summary.json`),
  };
}

/** run-test-set.ts's table plus comments per pull request. */
export const VOTE_HEAD = TABLE_HEAD.replace("| F |\n", "| F | comments per PR |\n") + "---|";
const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** Exit codes: 0 done, 1 refused (nothing written), 2 stopped at the cap while judging. */
export async function main(
  bench: string,
  env: NodeJS.ProcessEnv,
  log: (l: string) => void,
  err: (l: string) => void,
  fetchImpl?: typeof fetch,
  paths = { stateDir: join(REPO_ROOT, ".tracehound"), pricesFile: join(REPO_ROOT, "config/prices.json") },
): Promise<number> {
  const runs = [run1(bench), ...([2, 4, 5, 6] as const).map((n) => repeatRun(bench, n))].filter((r): r is RunRef => r !== null);
  const variants = variantsFor(runs.length);
  const out = join(bench, "reviews/vote");
  if (existsSync(out)) {
    err(`[vote] refusing: ${out} exists (never overwritten)`);
    return 1;
  }

  // 1. variant outputs, per pull request, from the runs' files
  const pullsPerRepo: Record<string, string[]> = {};
  const kept: Record<string, number> = {};
  for (const repo of DEV_REPOS) {
    const files = loadReviews(runs[0]!.reviews(repo, "pool-verify-v1")).map((r) => r.file);
    pullsPerRepo[repo] = files;
    for (const file of files) {
      const read = (r: RunRef, s: Source) => PullReview.parse(readJson(join(r.reviews(repo, s), file)));
      const header = (({ pr_title, pr_number }) => ({ pr_title, ...(pr_number !== undefined && { pr_number }) }))(read(runs[0]!, "pool-verify-v1"));
      for (const v of variants) {
        const reps = applyVariant(v, runs.map((r) => read(r, v.source).comments));
        writeNew(join(out, v.name, repo, file), { ...header, comments: reps.map((x) => x.comment) });
        kept[v.name] = (kept[v.name] ?? 0) + reps.length;
      }
    }
  }
  const nPulls = Object.values(pullsPerRepo).reduce((s, f) => s + f.length, 0);
  err(`[vote] runs ${runs.map((r) => r.label).join(", ")} · ${nPulls} pull requests · comments ${variants.map((v) => `${v.name} ${kept[v.name]}`).join(", ")}`);

  // 2. both judges on each variant (judge cache reads allowed, as in 061)
  const apiKey = env.NEBIUS_API_KEY;
  if (!apiKey) {
    err("[vote] NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  const { judge, budget } = buildClients({ apiKey, ...paths, allowanceUSD: 10 - EXTRA_CAP_USD, env, fetch: fetchImpl });
  let capHit: BudgetExceededError | null = null;
  const judgeClient: ChatClient = {
    chat: async (request, meta) => {
      try {
        return await judge.chat(request, meta);
      } catch (e) {
        if (e instanceof BudgetExceededError) capHit ??= e;
        throw e;
      }
    },
  };
  const counts: Record<string, Record<string, Counts>> = {};
  const failed: Record<string, Record<string, number>> = {};
  for (const j of JUDGES) {
    counts[j.id] = {};
    failed[j.id] = {};
    for (const v of variants) {
      let c = zeroCounts();
      let jf = 0;
      for (const repo of DEV_REPOS) {
        const golden = GoldenFile.parse(readJson(inputPaths(bench, "dev", repo).golden));
        const lj = new LlmJudge(judgeClient, { model: j.model, reasoning: j.reasoning });
        const result = await scoreRepo({ golden, reviews: loadReviews(join(out, v.name, repo)), judges: [lj], concurrency: 4 });
        if (capHit) {
          err(`[vote] STOPPED AT THE CAP while judging ${v.name}/${repo} under ${j.id}; spent $${budget.runSpent.toFixed(4)}`);
          return 2;
        }
        const meta = { label: `${v.name}/${repo}`, judgeVersion: JUDGE_VERSION, judges: [lj.name], reasoning: j.reasoning };
        const base = join(out, "scores", j.id, `${v.name}-${repo}`);
        writeNew(`${base}.detail.json`, { ...meta, ...result });
        const { detail: _d, ...countsOnly } = result;
        writeNew(`${base}.summary.json`, { ...meta, ...countsOnly, metrics: metrics(result.counts) });
        c = addCounts(c, result.counts);
        jf += result.pulls.judgeFailed;
      }
      counts[j.id]![v.name] = c;
      failed[j.id]![v.name] = jf;
    }
  }

  // 3. the baseline: each run's own pool-verify-v1 scoring
  const sum = (r: RunRef, judgeId: "judge-v1" | "judge-x1") => {
    let c = zeroCounts();
    let jf = 0;
    for (const repo of DEV_REPOS) {
      const s = readJson<{ counts: Counts; pulls: { judgeFailed: number } }>(r.summary(judgeId, repo));
      c = addCounts(c, s.counts);
      jf += s.pulls.judgeFailed;
    }
    return { c, jf };
  };
  const baseRuns = runs.map((r) => ({ label: r.label, v1: sum(r, "judge-v1"), x1: sum(r, "judge-x1") }));
  const base = baselineOf(baseRuns.map((r) => ({ label: r.label, v1: r.v1.c, x1: r.x1.c })));
  const verdict = adoption(
    variants.map((v) => ({ name: v.name, v1: counts["judge-v1"]![v.name]!, x1: counts["judge-x1"]![v.name]! })),
    base,
  );

  // 4. counts-only report
  const lines: string[] = [`## Vote across runs (decision 064): runs ${runs.map((r) => r.label).join(", ")}, ${nPulls} dev pull requests`];
  for (const j of JUDGES) {
    const id = j.id === "judge-v1" ? "v1" : "x1";
    const perPull = (c: Counts) => (c.comments / nPulls).toFixed(2);
    lines.push("", `### ${id === "v1" ? "bench-judge-v1 (scorer of record)" : "bench-judge-x1 (report only)"}`, "", VOTE_HEAD);
    for (const v of variants) lines.push(`${tableRow(v.name, counts[j.id]![v.name]!, failed[j.id]![v.name]!)} ${perPull(counts[j.id]![v.name]!)} |`);
    for (const r of baseRuns) lines.push(`${tableRow(`baseline pool-verify-v1 run ${r.label}`, r[id].c, r[id].jf)} ${perPull(r[id].c)} |`);
    lines.push("", `baseline mean over ${runs.length} runs: F ${pct(base.meanF[id])}${id === "v1" ? ` · P ${pct(base.meanP.v1)}` : ""}`);
  }
  lines.push("", "### Adoption", "");
  lines.forEach((l) => log(l));
  log(`best under v1: ${verdict.best}`);
  log(`F − baseline mean F (v1): ${(100 * verdict.checks.fMargin.value).toFixed(1)} points, needs ≥ 5.0 → ${verdict.checks.fMargin.pass ? "pass" : "fail"}`);
  log(`precision ${pct(verdict.checks.precision.value)} vs baseline mean ${pct(base.meanP.v1)}, needs above → ${verdict.checks.precision.pass ? "pass" : "fail"}`);
  log(`F under x1 ${pct(verdict.checks.x1.value)} vs baseline mean ${pct(base.meanF.x1)}, needs at or above → ${verdict.checks.x1.pass ? "pass" : "fail"}`);
  log(`verdict: ${verdict.adopted ? `ADOPT ${verdict.best}` : "LOSS: no variant passes; pool-verify-v1 stays"}`);
  const costs = DEV_REPOS.flatMap((repo) => pullsPerRepo[repo]!.map((file) => runs.reduce((s, r) => s + r.cost(repo, file), 0)));
  log("");
  log(`cost per pull request of a ${runs.length}-run vote (sum of the runs' pipelines): median $${median(costs).toFixed(4)} · max $${Math.max(...costs).toFixed(4)}`);
  log(`judging spend this script: $${budget.runSpent.toFixed(4)}`);
  return 0;
}

if (import.meta.main) {
  try {
    if (!process.env.NEBIUS_API_KEY) process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // no .env: main reports the missing key
  }
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  process.exitCode = await main(bench, process.env, (l) => console.log(l), (l) => console.error(l));
}
