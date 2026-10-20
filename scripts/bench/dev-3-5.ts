// Decision 067's scoring: pool-verify-v1 with Nemotron 3.5 Super (dev runs 7–9) against the 3 Super
// baseline (dev runs 1, 2r, 4, 5, 6; decision 064's). No model call: it reads the runs' score files
// and records. Per run, P/R/F come from the counts summed over the four dev repos; a mean is the mean
// of the per-run values (vote.ts's baseline). The paired bootstrap (plan: docs/bench/dev-3.5-plan.md)
// resamples the 40 pull requests with replacement, 10,000 times, seed 67 (mulberry32); each resample
// recomputes every run's F on the drawn pull requests and takes mean F (candidate) − mean F
// (baseline); the interval is the 2.5th and 97.5th percentiles (sorted indices 249 and 9749).
// stdout gets counts only, never titles or comment text.
//   node scripts/bench/dev-3-5.ts [--bench <dir>] [--model <id>] [--runs 7,8,9]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { addCounts, metrics, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { dirs } from "./pool-verify.ts";
import { DEV_REPOS, modelRunDir, modelSlug, readRunJson, standingRunDir, type Dev067Run } from "./test-set.ts";

export const BOOTSTRAP_RESAMPLES = 10_000;
export const BOOTSTRAP_SEED = 67;
export const CANDIDATE_MODEL = "nvidia/Nemotron-3.5-Super-VL";
/** The plan's rule. */
export const F_MARGIN = 0.03;

type Judge = "judge-v1" | "judge-x1";
type Pr = { tp: number; fp: number; fn: number };
/** per run: pull request key → counts (absent when JUDGE_FAILED) */
export interface RunScores {
  label: string;
  pulls: Record<Judge, Map<string, Pr>>;
  totals: Record<Judge, Counts>;
}

const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const fOf = (c: Pr) => metrics({ ...zeroCounts(), ...c }).f ?? 0;

/** Deterministic PRNG: mulberry32. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sumOver = (m: Map<string, Pr>, keys: string[]): Pr => {
  const c = { tp: 0, fp: 0, fn: 0 };
  for (const k of keys) {
    const p = m.get(k);
    if (p) (c.tp += p.tp), (c.fp += p.fp), (c.fn += p.fn);
  }
  return c;
};

/** mean over runs of F on the given pull requests (a key may repeat) */
export const meanF = (runs: RunScores[], judge: Judge, keys: string[]) => mean(runs.map((r) => fOf(sumOver(r.pulls[judge], keys))));

/** The paired per-PR bootstrap of mean F (candidate) − mean F (baseline). */
export function bootstrap(base: RunScores[], cand: RunScores[], judge: Judge, keys: string[], resamples = BOOTSTRAP_RESAMPLES, seed = BOOTSTRAP_SEED) {
  const rand = mulberry32(seed);
  const diffs: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const draw = Array.from({ length: keys.length }, () => keys[Math.floor(rand() * keys.length)]!);
    diffs.push(meanF(cand, judge, draw) - meanF(base, judge, draw));
  }
  diffs.sort((a, b) => a - b);
  return { point: meanF(cand, judge, keys) - meanF(base, judge, keys), lo: diffs[Math.floor(0.025 * resamples) - 1]!, hi: diffs[Math.ceil(0.975 * resamples) - 1]!, below0: diffs.filter((d) => d < 0).length / resamples };
}

/** The plan's adoption rule over per-run counts. */
export function verdict(base: RunScores[], cand: RunScores[]) {
  const m = (runs: RunScores[], j: Judge, k: "f" | "precision") => mean(runs.map((r) => metrics(r.totals[j])[k] ?? 0));
  const checks = {
    f: { cand: m(cand, "judge-v1", "f"), need: m(base, "judge-v1", "f") + F_MARGIN },
    precision: { cand: m(cand, "judge-v1", "precision"), need: m(base, "judge-v1", "precision") },
    x1: { cand: m(cand, "judge-x1", "f"), need: m(base, "judge-x1", "f") },
  };
  const pass = (c: { cand: number; need: number }) => c.cand >= c.need - 1e-12;
  return { checks, pass: { f: pass(checks.f), precision: pass(checks.precision), x1: pass(checks.x1) }, adopted: pass(checks.f) && pass(checks.precision) && pass(checks.x1) };
}

// ---- reading runs ----

function readRun(label: string, detail: (j: Judge, repo: string) => string, summary: (j: Judge, repo: string) => string): RunScores {
  const pulls = { "judge-v1": new Map<string, Pr>(), "judge-x1": new Map<string, Pr>() };
  const totals = { "judge-v1": zeroCounts(), "judge-x1": zeroCounts() };
  for (const j of ["judge-v1", "judge-x1"] as const) {
    for (const repo of DEV_REPOS) {
      const d = readJson<{ detail: { reviewFile: string; status: string; counts?: Counts }[] }>(detail(j, repo));
      let sum = zeroCounts();
      for (const p of d.detail) {
        if (p.status !== "SCORED" || !p.counts) continue;
        pulls[j].set(`${repo}/${p.reviewFile}`, { tp: p.counts.tp, fp: p.counts.fp, fn: p.counts.fn });
        sum = addCounts(sum, p.counts);
      }
      const s = readJson<{ counts: Counts }>(summary(j, repo)).counts;
      if (s.tp !== sum.tp || s.fp !== sum.fp || s.fn !== sum.fn) throw new Error(`run ${label} ${j} ${repo}: detail counts differ from the summary`);
      totals[j] = addCounts(totals[j], s);
    }
  }
  return { label, pulls, totals };
}

/** Dev run 1: decision 059's scoring (v1 under scores/, x1 under scores/judge-x1/). */
const run1 = (bench: string) =>
  readRun(
    "1",
    (j, repo) => join(bench, j === "judge-v1" ? "scores" : "scores/judge-x1", `pool-verify-v1-super-${repo}.detail.json`),
    (j, repo) => join(bench, j === "judge-v1" ? "scores" : "scores/judge-x1", `pool-verify-v1-super-${repo}.summary.json`),
  );
const runAt = (label: string, dir: string) =>
  readRun(
    label,
    (j, repo) => join(dir, "scores", j, `pool-verify-v1-${repo}.detail.json`),
    (j, repo) => join(dir, "scores", j, `pool-verify-v1-${repo}.summary.json`),
  );

export function baselineRuns(bench: string): RunScores[] {
  return [
    run1(bench),
    ...([2, 4, 5, 6] as const).map((n) => {
      const { dir, restarted } = standingRunDir(bench, "dev", n);
      if (readRunJson(dir).status !== "complete") throw new Error(`baseline dev run ${n} is not complete`);
      return runAt(`${n}${restarted ? "r" : ""}`, dir);
    }),
  ];
}

/** Candidate runs that completed (the plan's fallback decides on at least 2). */
export function candidateRuns(bench: string, model: string, runs: Dev067Run[]): { done: RunScores[]; notDone: string[] } {
  const done: RunScores[] = [];
  const notDone: string[] = [];
  for (const n of runs) {
    const r = modelRunDir(bench, n, modelSlug(model), true);
    const dir = existsSync(r) ? r : modelRunDir(bench, n, modelSlug(model));
    const label = `${n}${dir === r ? "r" : ""}`;
    if (!existsSync(dir) || readRunJson(dir).status !== "complete") notDone.push(`${label} (${existsSync(dir) ? readRunJson(dir).status : "absent"})`);
    else done.push(runAt(label, dir));
  }
  return { done, notDone };
}

// ---- tokens and cost of the pipeline (judges excluded) ----

type Usage = { inputTokens: number; outputTokens: number; costUSD: number };
type Attempt = { diff: { review: { usage: Usage } }; ctx: { review: { usage: Usage } }; diffVerdicts: { verify: { usage: Usage } }; ctxOnlyVerdicts: { verify: { usage: Usage } } };
const addU = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUSD: a.costUSD + b.costUSD });
const Z: Usage = { inputTokens: 0, outputTokens: 0, costUSD: 0 };

/** Per pull request (every attempt counted), for a run directory with attempts/. */
function attemptsUsage(dir: string): Usage[] {
  const out: Usage[] = [];
  for (const repo of DEV_REPOS) {
    const files = readdirSync(join(dir, "attempts", repo));
    const prs = [...new Set(files.map((f) => f.replace(/\.attempt-\d\.json$/, "")))];
    for (const pr of prs) {
      let u = Z;
      for (const f of files.filter((x) => x.startsWith(`${pr}.attempt-`))) {
        const a = readJson<Attempt>(join(dir, "attempts", repo, f));
        u = [a.diff.review.usage, a.ctx.review.usage, a.diffVerdicts.verify.usage, a.ctxOnlyVerdicts.verify.usage].reduce(addU, u);
      }
      out.push(u);
    }
  }
  return out;
}

/** Dev run 1's four stage records per pull request. */
function run1Usage(bench: string): Usage[] {
  const out: Usage[] = [];
  for (const repo of DEV_REPOS) {
    const d = dirs(bench, repo);
    for (const f of readdirSync(d.diff).filter((x) => x.endsWith(".json"))) {
      out.push(
        [
          readJson<{ review: { usage: Usage } }>(join(d.diff, f)).review.usage,
          readJson<{ review: { usage: Usage } }>(join(d.ctx, f)).review.usage,
          readJson<{ verify: { usage: Usage } }>(join(d.diffVerdicts, f)).verify.usage,
          readJson<{ verify: { usage: Usage } }>(join(d.ctxOnlyVerdicts, f)).verify.usage,
        ].reduce(addU, Z),
      );
    }
  }
  return out;
}

// ---- report ----

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : (100 * x).toFixed(1));
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

export function report(bench: string, model: string, runs: Dev067Run[], log: (l: string) => void) {
  const base = baselineRuns(bench);
  const keys = [...new Set(base.flatMap((r) => [...r.pulls["judge-v1"].keys(), ...r.pulls["judge-x1"].keys()]))].sort();
  log(`baseline (3 Super): runs ${base.map((r) => r.label).join(", ")} · pull requests ${keys.length}`);
  const { done: cand, notDone } = candidateRuns(bench, model, runs);
  log(`candidate (${model}): runs done ${cand.map((r) => r.label).join(", ") || "none"}${notDone.length ? ` · not done ${notDone.join(", ")}` : ""}`);
  log("");
  log("| judge | model | run | comments | TP | FP | FN | P | R | F |");
  log("|---|---|---|---|---|---|---|---|---|---|");
  for (const j of ["judge-v1", "judge-x1"] as const) {
    for (const [name, rs] of [["3 Super", base], ["3.5 Super", cand]] as const) {
      for (const r of rs) {
        const c = r.totals[j];
        const m = metrics(c);
        log(`| ${j} | ${name} | ${r.label} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f)} |`);
      }
      if (rs.length) {
        const mm = (k: "precision" | "recall" | "f") => mean(rs.map((r) => metrics(r.totals[j])[k] ?? 0));
        log(`| ${j} | ${name} | **mean (${rs.length})** | | | | | **${pct(mm("precision"))}** | **${pct(mm("recall"))}** | **${pct(mm("f"))}** |`);
      }
    }
  }
  if (cand.length < 2) {
    log("");
    log(`fewer than 2 candidate runs done: no verdict (plan's fallback)`);
    return;
  }
  log("");
  for (const j of ["judge-v1", "judge-x1"] as const) {
    const b = bootstrap(base, cand, j, keys);
    log(`bootstrap ${j}: mean F difference ${pts(b.point)} points, 95% interval [${pts(b.lo)}, ${pts(b.hi)}] · share of resamples below 0: ${(100 * b.below0).toFixed(1)}% (${BOOTSTRAP_RESAMPLES} resamples, seed ${BOOTSTRAP_SEED}, ${keys.length} pull requests)`);
  }
  const v = verdict(base, cand);
  log("");
  log(`rule: F (v1) ${pct(v.checks.f.cand)} ≥ ${pct(v.checks.f.need)}: ${v.pass.f ? "pass" : "fail"} · P (v1) ${pct(v.checks.precision.cand)} ≥ ${pct(v.checks.precision.need)}: ${v.pass.precision ? "pass" : "fail"} · F (x1) ${pct(v.checks.x1.cand)} ≥ ${pct(v.checks.x1.need)}: ${v.pass.x1 ? "pass" : "fail"}`);
  log(`verdict: ${v.adopted ? "ADOPT 3.5 as the Action's default" : "LOSS: 3 Super stays"}${cand.length < runs.length ? ` (on ${cand.length} completed runs: the plan's fallback)` : ""}`);

  // tokens and cost per pull request (pipeline only; judges excluded)
  const baseU = [...run1Usage(bench), ...([2, 4, 5, 6] as const).flatMap((n) => attemptsUsage(standingRunDir(bench, "dev", n).dir))];
  const candU = runs.flatMap((n) => {
    const r = modelRunDir(bench, n, modelSlug(model), true);
    const dir = existsSync(r) ? r : modelRunDir(bench, n, modelSlug(model));
    return existsSync(join(dir, "attempts")) ? attemptsUsage(dir) : [];
  });
  log("");
  log("| pipeline per pull request | n | input tokens median | output tokens median | output tokens mean | cost median | cost mean | cost max |");
  log("|---|---|---|---|---|---|---|---|");
  for (const [name, us] of [["3 Super", baseU], ["3.5 Super", candU]] as const) {
    if (!us.length) continue;
    const f = (k: keyof Usage) => us.map((u) => u[k]);
    log(`| ${name} | ${us.length} | ${median(f("inputTokens")).toFixed(0)} | ${median(f("outputTokens")).toFixed(0)} | ${mean(f("outputTokens")).toFixed(0)} | $${median(f("costUSD")).toFixed(4)} | $${mean(f("costUSD")).toFixed(4)} | $${Math.max(...f("costUSD")).toFixed(4)} |`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { bench: { type: "string" }, model: { type: "string" }, runs: { type: "string" } }, strict: true });
  const bench = values.bench ?? join(homedir(), "Projects/tracehound-bench");
  const runs = (values.runs ?? "7,8,9").split(",").map(Number) as Dev067Run[];
  report(bench, values.model ?? CANDIDATE_MODEL, runs, (l) => console.log(l));
}
