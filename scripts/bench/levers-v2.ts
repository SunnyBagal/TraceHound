// Offline only. Reads whitelisted dev records; emits aggregate numbers, never record text.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { addCounts, metrics, scorePull, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import type { ReviewComment, Severity } from "../../packages/analyzer/src/bench/types.ts";
import { agrees } from "./agree-rule.ts";
import { voteKeep } from "./vote.ts";

const REPOS = ["sentry", "grafana", "keycloak", "discourse"] as const;
const JUDGES = ["v1", "x1"] as const;
const SOURCES = ["pool-verify-v1", "pool-raw"] as const;
const MODELS = ["3 Super", "3.5 Super", "Ultra"] as const;
const PLAN = { sha: "303994575368050f3edbd3d4ba5f30fb510605d9", committedAt: "2026-10-27T16:01:36+05:30" };
type Judge = typeof JUDGES[number];
type Source = typeof SOURCES[number];
type Model = typeof MODELS[number];
export type Ranking = "agreement" | "order";
type Review = { comments: ReviewComment[] };
type Golden = { id: string; severity: Severity; identity: string };
export interface SavedPull {
  key: string;
  repo: string;
  golden: Golden[];
  comments: ReviewComment[];
  matches: (number | null)[];
}
interface Run { run: string; model: Model; dir?: string }
const RUNS: Run[] = [
  { run: "1", model: "3 Super" },
  ...["2r", "4", "5", "6"].map((run) => ({ run, model: "3 Super" as const, dir: `run-${run}` })),
  { run: "7r", model: "3.5 Super", dir: "run-7-nvidia-nemotron-3-5-super-vlr" },
  { run: "8", model: "3.5 Super", dir: "run-8-nvidia-nemotron-3-5-super-vl" },
  { run: "10", model: "Ultra", dir: "run-10-nvidia-nemotron-3-ultra-550b-a55b" },
  { run: "11", model: "Ultra", dir: "run-11-nvidia-nemotron-3-ultra-550b-a55b" },
];
class ReplayError extends Error {}
function requireThat(ok: unknown, why: string): asserts ok {
  if (!ok) throw new ReplayError(why);
}
const signature = (c: ReviewComment) => JSON.stringify([c.path, c.line, c.body]);
const sum = (c: Counts[]) => c.reduce(addCounts, zeroCounts());
const summarize = (c: Counts[]) => ({ nPRs: c.length, counts: sum(c), ...metrics(sum(c)) });

/** Exact one-to-one alignment, including repeated identical findings. No fuzzy match reuse. */
export function alignIndices(source: ReviewComment[], target: ReviewComment[]): number[] {
  const queues = new Map<string, number[]>();
  source.forEach((c, i) => {
    const key = signature(c);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push(i);
  });
  return target.map((c) => {
    const i = queues.get(signature(c))?.shift();
    requireThat(i !== undefined, "finding alignment failed");
    return i;
  });
}

export function rankIndices(source: ReviewComment[], diff: ReviewComment[], ctx: ReviewComment[], ranking: Ranking): number[] {
  const raw = [...diff, ...ctx.filter((c) => !diff.some((d) => agrees(d, c)))];
  const origins = alignIndices(raw, source);
  const tier = (i: number) => {
    const other = origins[i]! < diff.length ? ctx : diff;
    return other.some((c) => agrees(source[i]!, c)) ? 0 : origins[i]! < diff.length ? 1 : 2;
  };
  return source.map((_, i) => i).sort((a, b) => ranking === "order" ? a - b : tier(a) - tier(b) || a - b);
}

export function replay(p: SavedPull, kept = p.comments.map((_, i) => i)): Counts {
  requireThat(p.matches.length === p.comments.length, "match length differs");
  requireThat(new Set(kept).size === kept.length, "repeated retained index");
  for (const i of kept) requireThat(Number.isInteger(i) && i >= 0 && i < p.matches.length, "retained index out of range");
  return scorePull(p.golden.map((g) => g.severity), kept.map((i) => p.matches[i]!)).counts;
}

export function validatePair(a: SavedPull, b: SavedPull) {
  requireThat(a.key === b.key && a.repo === b.repo, "PR pairing differs");
  requireThat(JSON.stringify(a.golden) === JSON.stringify(b.golden), "golden identity/order/severity differs");
}

/** voteKeep's representative carries the only match we reuse for that finding. */
export function replayVote(pulls: SavedPull[]): Counts {
  requireThat(pulls.length === 3, "vote requires three runs");
  for (const p of pulls) validatePair(pulls[0]!, p);
  const reps = voteKeep(pulls.map((p) => p.comments), 2);
  return scorePull(pulls[0]!.golden.map((g) => g.severity), reps.map((r) => pulls[r.run]!.matches[r.pos]!)).counts;
}

export function persistentMisses(a: SavedPull, b: SavedPull): number[] {
  validatePair(a, b);
  const matched = new Set([...a.matches, ...b.matches]);
  return a.golden.map((_, i) => i).filter((i) => !matched.has(i));
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function quantile(sorted: number[], q: number) {
  requireThat(sorted.length > 0 && q >= 0 && q <= 1, "invalid quantile");
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
type Metric = "precision" | "recall" | "f";
const METRICS: Metric[] = ["precision", "recall", "f"];
export interface Difference { delta: number | null; low: number | null; high: number | null; undefinedResamples: number }
export type Intervals = Record<Metric, Difference>;
const average = (values: (number | null)[]) => values.some((v) => v === null) ? null : values.reduce<number>((s, v) => s + v!, 0) / values.length;

/** Paired PR bootstrap; multiple baseline vectors mean arithmetic mean of their metrics. */
export function bootstrap(a: Counts[], baselines: Counts[][], resamples = 10_000, seed = 72): Intervals {
  requireThat(a.length > 0 && baselines.length > 0 && baselines.every((b) => b.length === a.length), "unpaired bootstrap");
  requireThat(Number.isInteger(resamples) && resamples > 0, "invalid resample count");
  const vectors = [a, ...baselines];
  const point = vectors.map((v) => metrics(sum(v)));
  const samples: Record<Metric, number[]> = { precision: [], recall: [], f: [] };
  const rng = mulberry32(seed);
  for (let b = 0; b < resamples; b++) {
    const totals = vectors.map(() => zeroCounts());
    for (let i = 0; i < a.length; i++) {
      const index = Math.floor(rng() * a.length);
      vectors.forEach((v, j) => {
        const c = v[index]!, t = totals[j]!;
        t.tp += c.tp; t.fp += c.fp; t.fn += c.fn;
      });
    }
    const m = totals.map(metrics);
    for (const key of METRICS) {
      const base = average(m.slice(1).map((x) => x[key]));
      if (m[0]![key] !== null && base !== null) samples[key].push(m[0]![key]! - base);
    }
  }
  return Object.fromEntries(METRICS.map((key) => {
    const values = samples[key].sort((x, y) => x - y);
    const base = average(point.slice(1).map((x) => x[key]));
    return [key, {
      delta: point[0]![key] === null || base === null ? null : point[0]![key]! - base,
      low: values.length === resamples ? quantile(values, 0.025) : null,
      high: values.length === resamples ? quantile(values, 0.975) : null,
      undefinedResamples: resamples - values.length,
    }];
  })) as Intervals;
}

interface ScoreFile { counts: Counts; pulls: { scored: number; judgeFailed: number }; detail: PullDetail[] }
interface RunState { status: string; pulls: { repo: string; file: string; attempts: number }[] }
interface Attempt { diff: Review; ctx: Review; ctxOnly: ReviewComment[]; kept: ReviewComment[] }
type Loaded = { pulls: SavedPull[]; counts: Counts[]; generators: { diff: ReviewComment[]; ctx: ReviewComment[] }[] };
type Cell = ReturnType<typeof summarize>;
interface CapResult {
  model: Model; runs: string[]; source: Source; ranking: Ranking; nPRs: number; nPRRuns: number;
  baseline: Cell; caps: { k: number; result: Cell; difference: Intervals }[];
}
interface VerifierResult { model: Model; run: string; raw: Cell; verified: Cell; difference: Intervals }
interface VoteResult {
  runs: string[]; source: Source; result: Cell; baselines: { run: string; result: Cell }[];
  meanF: number | null; difference: Intervals;
}
interface MissRow { repo: string; nPRs: number; golden: Record<Severity, number>; missedBoth: Record<Severity, number>; scoredGolden: number; scoredMissed: number }
interface JudgeResult { caps: CapResult[]; perRunCaps: CapResult[]; verifier: VerifierResult[]; vote: VoteResult[]; misses: MissRow[] }
export interface Results {
  plan: typeof PLAN; computedAt: string; costUSD: number; modelCalls: number; replayNetworkCalls: number;
  bootstrap: { resamples: number; seed: number; unit: string; interval: string }; absentOptionalRuns: string[];
  judges: Record<Judge, JudgeResult>;
}

export function compute(bench: string): Results {
  const computedAt = new Date().toISOString();
  // realpath containment prevents a dev-shaped symlink from crossing into a prohibited set.
  const root = realpathSync(bench);
  const allowed = ["reviews/dev-repeat", "reviews/review-diff-v1/nemotron-3-super-120b-a12b", "reviews/review-ctx-v1/nemotron-3-super-120b-a12b", "reviews/pool-raw/super", "reviews/pool-verify-v1/super", "scores"].map((p) => resolve(root, p));
  const read = <T>(file: string): T => {
    const path = realpathSync(file);
    requireThat(allowed.some((p) => path.startsWith(p + sep)), "refusing non-dev record path");
    requireThat(!/(?:^|[/\\])(?:test|calcom|cal[._-]com|ReviewBench|reviewbench|linea-seeded|recall-seeded|tracehound-seeds)(?:[/\\]|$)/i.test(path), "refusing prohibited record path");
    return JSON.parse(readFileSync(path, "utf8")) as T;
  };
  const absentOptionalRuns: string[] = [];
  const active = RUNS.filter((run) => {
    if (run.model !== "Ultra" || existsSync(join(root, "reviews/dev-repeat", run.dir!))) return true;
    absentOptionalRuns.push(run.run);
    return false;
  });
  const cache = new Map<string, Loaded>();
  const states = new Map<string, RunState>();
  const generators = new Map<string, { diff: ReviewComment[]; ctx: ReviewComment[] }>();
  const load = (run: Run, source: Source, judge: Judge): Loaded => {
    const ck = `${run.run}/${source}/${judge}`;
    if (cache.has(ck)) return cache.get(ck)!;
    const dir = run.dir ? join(root, "reviews/dev-repeat", run.dir) : root;
    if (run.dir && !states.has(run.run)) {
      const state = read<RunState>(join(dir, "run.json"));
      requireThat(state.status === "complete" && state.pulls.length === 40, "incomplete dev run");
      requireThat(new Set(state.pulls.map((p) => `${p.repo}/${p.file}`)).size === 40, "duplicate run PR");
      requireThat(state.pulls.every((p) => (REPOS as readonly string[]).includes(p.repo)), "non-dev repo in run");
      states.set(run.run, state);
    }
    const pulls: SavedPull[] = [], gens: Loaded["generators"] = [];
    for (const repo of REPOS) {
      const base = run.dir ? join(dir, "scores", `judge-${judge}`, `${source}-${repo}`) : join(root, "scores", ...(judge === "x1" ? ["judge-x1"] : []), `${source}-super-${repo}`);
      const detail = read<ScoreFile>(`${base}.detail.json`);
      const summary = read<ScoreFile>(`${base}.summary.json`);
      requireThat(detail.detail.length === 10 && summary.pulls.scored === 10 && summary.pulls.judgeFailed === 0, "missing or failed judged PRs");
      requireThat(detail.pulls.scored === 10 && detail.pulls.judgeFailed === 0, "detail contains judge failures");
      const local: SavedPull[] = [];
      for (const p of [...detail.detail].sort((a, b) => a.reviewFile.localeCompare(b.reviewFile))) {
        requireThat(p.status === "SCORED", "judge failed");
        requireThat(/^[^/\\]+\.json$/.test(p.reviewFile) && !p.reviewFile.includes(".."), "invalid review filename");
        const key = `${repo}/${p.reviewFile}`;
        const reviewPath = run.dir ? join(dir, source, repo, p.reviewFile) : join(root, "reviews", source, "super", repo, p.reviewFile);
        const review = read<Review>(reviewPath);
        requireThat(JSON.stringify(review.comments.map(signature)) === JSON.stringify(p.comments.map(signature)), "judged/source output order differs");
        const golden = p.golden.map((g) => ({ id: g.id, severity: g.severity, identity: createHash("sha256").update(g.comment).digest("hex") }));
        requireThat(new Set(golden.map((g) => g.id)).size === golden.length, "duplicate golden IDs");
        requireThat(golden.every((g) => ["Low", "Medium", "High", "Critical"].includes(g.severity)), "invalid golden severity");
        const matches = p.comments.map((c) => {
          if (c.matched === null) return null;
          const i = golden.findIndex((g) => g.id === c.matched);
          requireThat(i >= 0, "unknown saved golden match");
          return i;
        });
        const saved: SavedPull = { key, repo, golden, comments: review.comments, matches };
        requireThat(p.counts && JSON.stringify(replay(saved)) === JSON.stringify(p.counts), "unfiltered pull counts differ");
        local.push(saved);
        const gk = `${run.run}/${key}`;
        if (!generators.has(gk)) {
          let diff: ReviewComment[], ctx: ReviewComment[];
          if (run.dir) {
            const entry = states.get(run.run)!.pulls.find((x) => x.repo === repo && x.file === p.reviewFile);
            requireThat(entry && [1, 2].includes(entry.attempts), "used attempt missing");
            const attempt = read<Attempt>(join(dir, "attempts", repo, p.reviewFile.replace(/\.json$/, `.attempt-${entry.attempts}.json`)));
            diff = attempt.diff.comments; ctx = attempt.ctx.comments;
            const raw = read<Review>(join(dir, "pool-raw", repo, p.reviewFile));
            const kept = read<Review>(join(dir, "pool-verify-v1", repo, p.reviewFile));
            requireThat(JSON.stringify(raw.comments.map(signature)) === JSON.stringify([...diff, ...attempt.ctxOnly].map(signature)), "used raw attempt differs");
            requireThat(JSON.stringify(kept.comments.map(signature)) === JSON.stringify(attempt.kept.map(signature)), "used kept attempt differs");
          } else {
            diff = read<Review>(join(root, "reviews/review-diff-v1/nemotron-3-super-120b-a12b", repo, p.reviewFile)).comments;
            ctx = read<Review>(join(root, "reviews/review-ctx-v1/nemotron-3-super-120b-a12b", repo, p.reviewFile)).comments;
          }
          const raw = read<Review>(run.dir ? join(dir, "pool-raw", repo, p.reviewFile) : join(root, "reviews/pool-raw/super", repo, p.reviewFile));
          const expected = [...diff, ...ctx.filter((c) => !diff.some((d) => agrees(d, c)))];
          requireThat(JSON.stringify(raw.comments.map(signature)) === JSON.stringify(expected.map(signature)), "pool construction differs");
          generators.set(gk, { diff, ctx });
        }
        gens.push(generators.get(gk)!);
      }
      requireThat(JSON.stringify(sum(local.map((p) => replay(p)))) === JSON.stringify(summary.counts), "saved summary differs from replay");
      requireThat(JSON.stringify(summary.counts) === JSON.stringify(detail.counts), "detail and summary differ");
      pulls.push(...local);
    }
    requireThat(new Set(pulls.map((p) => p.key)).size === 40, "duplicate/missing dev PRs");
    if (cache.size) {
      const reference = cache.values().next().value!;
      pulls.forEach((p, i) => validatePair(p, reference.pulls[i]!));
    }
    const loaded = { pulls, counts: pulls.map((p) => replay(p)), generators: gens };
    cache.set(ck, loaded);
    return loaded;
  };
  const judges = {} as Record<Judge, JudgeResult>;
  for (const judge of JUDGES) {
    const perRunCaps: CapResult[] = [], caps: CapResult[] = [];
    const capped = new Map<string, Counts[]>();
    for (const run of active) for (const source of SOURCES) {
      const data = load(run, source, judge);
      for (const ranking of ["agreement", "order"] as const) {
        const variants = [1, 2, 3, 4, 5].map((k) => {
          const counts = data.pulls.map((p, i) => replay(p, rankIndices(p.comments, data.generators[i]!.diff, data.generators[i]!.ctx, ranking).slice(0, k)));
          capped.set(`${run.run}/${source}/${ranking}/${k}`, counts);
          return { k, result: summarize(counts), difference: bootstrap(counts, [data.counts]) };
        });
        perRunCaps.push({ model: run.model, runs: [run.run], source, ranking, nPRs: 40, nPRRuns: 40, baseline: summarize(data.counts), caps: variants });
      }
    }
    for (const model of MODELS) {
      const runs = active.filter((r) => r.model === model);
      if (!runs.length) continue;
      const pool = (vectors: Counts[][]) => vectors[0]!.map((_, i) => sum(vectors.map((v) => v[i]!)));
      for (const source of SOURCES) for (const ranking of ["agreement", "order"] as const) {
        const baseline = pool(runs.map((r) => load(r, source, judge).counts));
        const variants = [1, 2, 3, 4, 5].map((k) => {
          const counts = pool(runs.map((r) => capped.get(`${r.run}/${source}/${ranking}/${k}`)!));
          return { k, result: summarize(counts), difference: bootstrap(counts, [baseline]) };
        });
        caps.push({ model, runs: runs.map((r) => r.run), source, ranking, nPRs: 40, nPRRuns: 40 * runs.length, baseline: summarize(baseline), caps: variants });
      }
    }
    const verifier = active.map((run) => {
      const raw = load(run, "pool-raw", judge).counts, verified = load(run, "pool-verify-v1", judge).counts;
      return { model: run.model, run: run.run, raw: summarize(raw), verified: summarize(verified), difference: bootstrap(verified, [raw]) };
    });
    const vote = [["4", "5", "6"], ["1", "2r", "4"]].map((group) => {
      const data = group.map((run) => load(active.find((r) => r.run === run)!, "pool-verify-v1", judge));
      const counts = data[0]!.pulls.map((_, i) => replayVote(data.map((d) => d.pulls[i]!)));
      const baselines = group.map((run, i) => ({ run, result: summarize(data[i]!.counts) }));
      return { runs: group, source: "pool-verify-v1" as const, result: summarize(counts), baselines, meanF: average(baselines.map((b) => b.result.f)), difference: bootstrap(counts, data.map((d) => d.counts)) };
    });
    const both = ["7r", "8"].map((run) => load(active.find((r) => r.run === run)!, "pool-verify-v1", judge));
    const severityCounts = (): Record<Severity, number> => ({ Low: 0, Medium: 0, High: 0, Critical: 0 });
    const misses: MissRow[] = REPOS.map((repo) => {
      const row: MissRow = { repo, nPRs: 10, golden: severityCounts(), missedBoth: severityCounts(), scoredGolden: 0, scoredMissed: 0 };
      both[0]!.pulls.forEach((p, i) => {
        if (p.repo !== repo) return;
        const missed = new Set(persistentMisses(p, both[1]!.pulls[i]!));
        p.golden.forEach((g, j) => {
          row.golden[g.severity]++;
          if (missed.has(j)) row.missedBoth[g.severity]++;
        });
      });
      row.scoredGolden = row.golden.Medium + row.golden.High + row.golden.Critical;
      row.scoredMissed = row.missedBoth.Medium + row.missedBoth.High + row.missedBoth.Critical;
      return row;
    });
    const total: MissRow = { repo: "total", nPRs: 40, golden: severityCounts(), missedBoth: severityCounts(), scoredGolden: 0, scoredMissed: 0 };
    for (const row of misses) {
      for (const s of Object.keys(total.golden) as Severity[]) { total.golden[s] += row.golden[s]; total.missedBoth[s] += row.missedBoth[s]; }
      total.scoredGolden += row.scoredGolden; total.scoredMissed += row.scoredMissed;
    }
    misses.push(total);
    judges[judge] = { caps, perRunCaps, verifier, vote, misses };
  }
  return { plan: PLAN, computedAt, costUSD: 0, modelCalls: 0, replayNetworkCalls: 0, bootstrap: { resamples: 10_000, seed: 72, unit: "PR (all runs clustered)", interval: "percentile, linear interpolation" }, absentOptionalRuns, judges };
}

const pct = (v: number | null) => v === null ? "NA" : (100 * v).toFixed(1);
const pp = (v: number | null) => v === null ? "NA" : (100 * v).toFixed(2);
const delta = (d: Difference) => `${pp(d.delta)} [${pp(d.low)}, ${pp(d.high)}]`;
const prf = (m: Cell) => `${pct(m.precision)}/${pct(m.recall)}/${pct(m.f)}`;
export function markdown(result: Results): string {
  const out = ["# Levers v2: offline replay on dev", "", "The 40 dev PRs have been used for 17 earlier decisions; any gain here is a hypothesis, not a result, and none is adopted.", "", `Plan: ${result.plan.sha}, committed ${result.plan.committedAt}; pushed before computation. First computation: ${result.computedAt}. Report only, no decision number. Frozen reviewer: review-freeze-2, pool-verify-v1 on Nemotron 3.5 Super.`, "", "New model calls: 0; replay network calls: 0; new inference cost: $0. Only saved dev records and matches were read. Git transport delivers the report.", "", "P/R/F are percentages; differences and 95% intervals are percentage points. Bootstrap: 10,000 paired PR resamples, seed 72, percentile intervals with linear interpolation; all runs of a PR stay together. Intervals are exploratory and unadjusted for the many comparisons. Undefined metrics/intervals print NA. Raw means pool-raw; verified means pool-verify-v1. Aggregate top-k rows pool scorer counts across the listed model's runs, with 40 distinct PRs and the PR-run exposure count shown. Per-run cap counts/P/R/F and all intervals are available with --json."];
  if (result.absentOptionalRuns.length) out.push("", `Absent optional Ultra runs: ${result.absentOptionalRuns.join(", ")}.`);
  for (const judge of JUDGES) {
    const r = result.judges[judge];
    out.push("", `## bench-judge-${judge}${judge === "v1" ? " (scorer of record)" : " (report only)"}`, "", "### 1. Per-PR cap", "", "Each k cell is F; delta-F [95% interval] versus uncapped. Agreement uses full saved generator output; order is the control. Both preserve original order within tiers.", "", "| Model (runs) | Source | Rank | n PRs / PR-runs | Uncapped F | k=1 | k=2 | k=3 | k=4 | k=5 |", "|---|---|---|---:|---:|---|---|---|---|---|");
    for (const c of r.caps) out.push(`| ${c.model} (${c.runs.join(",")}) | ${c.source === "pool-raw" ? "raw" : "verified"} | ${c.ranking} | ${c.nPRs} / ${c.nPRRuns} | ${pct(c.baseline.f)} | ${c.caps.map((x) => `${pct(x.result.f)}; ${delta(x.difference.f)}`).join(" | ")} |`);
    const capPositive = r.caps.flatMap((c) => c.caps.filter((v) => v.difference.f.low !== null && v.difference.f.low > 0).map((v) => `${c.model}/${c.source === "pool-raw" ? "raw" : "verified"}/${c.ranking}/k=${v.k}`));
    out.push("", `Answer: ${capPositive.length ? `The following pooled cap comparisons are better than their own uncapped baseline by the stated interval rule: ${capPositive.join("; ")}.` : "No pooled cap comparison has a positive delta-F interval excluding zero."} All k values are reported; no k is selected.`, "", "### 2. Verifier on/off", "", "P/R/F columns describe existing numbers. Difference is verified minus raw. Counts, denominators and delta-P/R intervals are in --json.", "", "| Model | Run | n PRs | Raw comments / TP / FP / FN | Verified comments / TP / FP / FN | Raw P/R/F | Verified P/R/F | Delta-F [95% interval] |", "|---|---|---:|---|---|---|---|---|");
    const countCell = (m: Cell) => [m.counts.comments, m.counts.tp, m.counts.fp, m.counts.fn].join("/");
    for (const v of r.verifier) out.push(`| ${v.model} | ${v.run} | ${v.raw.nPRs} | ${countCell(v.raw)} | ${countCell(v.verified)} | ${prf(v.raw)} | ${prf(v.verified)} | ${delta(v.difference.f)} |`);
    const improves = r.verifier.filter((v) => v.difference.f.low !== null && v.difference.f.low > 0);
    const declines = r.verifier.filter((v) => v.difference.f.high !== null && v.difference.f.high < 0);
    out.push("", `Answer: verification is better in ${improves.length}/${r.verifier.length} run comparisons by the interval rule${improves.length ? ` (runs ${improves.map((v) => v.run).join(", ")})` : ""}; ${declines.length} have intervals entirely below zero; the remaining ${r.verifier.length - improves.length - declines.length} include zero or are unavailable.`, "", "### 3. Cheaper vote", "", "3 Super, verified source; unchanged voteKeep, threshold 2 of 3, no cap. Each representative uses its own run's saved match. Delta compares vote F with the arithmetic mean of constituent-run F values, paired at PR level.", "", "| Runs | n PRs | Vote comments / TP / FP / FN | Vote P/R/F | Individual run F (same order) | Three-run mean F | Delta-F [95% interval] |", "|---|---:|---|---|---|---:|---|");
    for (const v of r.vote) out.push(`| ${v.runs.join(", ")} | ${v.result.nPRs} | ${countCell(v.result)} | ${prf(v.result)} | ${v.baselines.map((b) => pct(b.result.f)).join(" / ")} | ${pct(v.meanF)} | ${delta(v.difference.f)} |`);
    out.push("", `Answer: ${r.vote.every((v) => v.difference.f.low !== null && v.difference.f.low > 0) ? "Both three-run votes are better than their three-run mean by the interval rule." : r.vote.some((v) => v.difference.f.low !== null && v.difference.f.low > 0) ? "Only some three-run votes have a positive interval excluding zero; see the two rows." : "Neither three-run vote has a positive interval excluding zero against its three-run mean."} This replay does not estimate the cost of new runs.`, "", "### 4. Where the misses are", "", "3.5 verified, runs 7r and 8. Cells are missed-in-both / golden denominator. Low is shown separately from the Medium-or-higher scorer subtotal. Golden identity/order/severity is checked across runs. Counts only.", "", "| Repo | n PRs | Low | Medium | High | Critical | Medium+ | All severities |", "|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const m of r.misses) {
      const sev = (["Low", "Medium", "High", "Critical"] as Severity[]).map((s) => `${m.missedBoth[s]}/${m.golden[s]}`);
      out.push(`| ${m.repo} | ${m.nPRs} | ${sev.join(" | ")} | ${m.scoredMissed}/${m.scoredGolden} | ${Object.values(m.missedBoth).reduce((a, b) => a + b, 0)}/${Object.values(m.golden).reduce((a, b) => a + b, 0)} |`);
    }
    const total = r.misses[r.misses.length - 1]!;
    out.push("", `Answer: ${total.scoredMissed} of ${total.scoredGolden} Medium-or-higher goldens were missed in both runs across ${total.nPRs} PRs. The repository/severity counts localize persistent misses; they do not identify their causes.`);
  }
  out.push("", "## Reproduce and validation", "", "`node scripts/bench/levers-v2.ts` prints these four tables per judge; `--json` prints all computed aggregate and per-run numbers without record text. `--bench <root>` may point to the saved benchmark root; reads stay within the dev paths and reject prohibited paths and symlink escapes. The script never calls the original run or judge entry points. Full unfiltered replay counts must equal every saved pull and repository summary before reporting.", "");
  return out.join("\n");
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    requireThat(args.every((a, i) => a === "--json" || a === "--bench" || args[i - 1] === "--bench"), "unknown argument");
    const index = args.indexOf("--bench");
    requireThat(index < 0 || (args[index + 1] && !args[index + 1]!.startsWith("--")), "missing benchmark root");
    const result = compute(index < 0 ? join(homedir(), "Projects/tracehound-bench") : args[index + 1]!);
    console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : markdown(result));
  } catch (error) {
    // Do not echo a record, parse error, filename, title, token or body on failure.
    console.error(`levers-v2: replay refused; ${error instanceof ReplayError ? error.message : "missing, unreadable or invalid records"}`);
    process.exitCode = 1;
  }
}
