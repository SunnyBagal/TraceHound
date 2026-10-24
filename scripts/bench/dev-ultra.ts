// Decision 071's scoring (report only): Nemotron 3 Ultra via the NVIDIA API (dev runs 10–11) against
// 3 Super (dev runs 1, 2r, 4, 5, 6) and 3.5 Super (dev runs 7r, 8), for the rows pool-verify-v1 and
// pool-raw, under bench-judge-v1 (scorer of record) and bench-judge-x1. No model call: it reads score
// files, attempts, run.json files and the spend ledger. Per run, P/R/F come from the counts summed over
// the four dev repos; a mean is the mean of the per-run values (067's). The paired bootstrap
// (docs/bench/dev-ultra-plan.md) resamples the 40 pull requests with replacement, 10,000 times, seed
// 71 (mulberry32, as dev-3-5.ts); each resample recomputes every run's F on the drawn pull requests
// and takes mean F (Ultra) − mean F (baseline); the interval is the 2.5th and 97.5th percentiles.
// stdout gets counts only, never titles or comment text.
//   node scripts/bench/dev-ultra.ts [--bench <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { addCounts, metrics, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { attemptsUsage, mulberry32 } from "./dev-3-5.ts";
import { dev071RunDir, DEV_REPOS, MODEL_071, modelRunDir, modelSlug, readRunJson, standingRunDir, type Dev067Run, type Dev071Run } from "./test-set.ts";

const ROOT = resolve(import.meta.dirname, "../..");
export const RESAMPLES = 10_000;
export const SEED = 71;
export const ROWS = ["pool-verify-v1", "pool-raw"] as const;
export type RowName = (typeof ROWS)[number];
type Judge = "judge-v1" | "judge-x1";
const JUDGES: Judge[] = ["judge-v1", "judge-x1"];
type Pr = { tp: number; fp: number; fn: number };
interface RunScores {
  label: string;
  pulls: Record<Judge, Map<string, Pr>>;
  totals: Record<Judge, Counts>;
}
/** The plan's stated v1 F means (percent) the recomputed baselines must match within 0.1. */
export const STATED_BASELINES: Record<RowName, Record<"3 Super" | "3.5 Super", number>> = {
  "pool-verify-v1": { "3 Super": 42.3, "3.5 Super": 50.4 },
  "pool-raw": { "3 Super": 38.2, "3.5 Super": 53.9 },
};
const SUPER_35 = "nvidia/Nemotron-3.5-Super-VL";

const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
const fOf = (c: Pr) => metrics({ ...zeroCounts(), ...c }).f ?? 0;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : (100 * x).toFixed(1));
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;

function readRun(label: string, file: (j: Judge, repo: string, kind: "detail" | "summary") => string): RunScores {
  const pulls = { "judge-v1": new Map<string, Pr>(), "judge-x1": new Map<string, Pr>() };
  const totals = { "judge-v1": zeroCounts(), "judge-x1": zeroCounts() };
  for (const j of JUDGES) {
    for (const repo of DEV_REPOS) {
      const d = readJson<{ detail: { reviewFile: string; status: string; counts?: Counts }[] }>(file(j, repo, "detail"));
      let sum = zeroCounts();
      for (const p of d.detail) {
        if (p.status !== "SCORED" || !p.counts) continue;
        pulls[j].set(`${repo}/${p.reviewFile}`, { tp: p.counts.tp, fp: p.counts.fp, fn: p.counts.fn });
        sum = addCounts(sum, p.counts);
      }
      const s = readJson<{ counts: Counts }>(file(j, repo, "summary")).counts;
      if (s.tp !== sum.tp || s.fp !== sum.fp || s.fn !== sum.fn) throw new Error(`run ${label} ${j} ${repo}: detail counts differ from the summary`);
      totals[j] = addCounts(totals[j], s);
    }
  }
  return { label, pulls, totals };
}

const runAt = (label: string, dir: string, row: RowName) => readRun(label, (j, repo, kind) => join(dir, "scores", j, `${row}-${repo}.${kind}.json`));
/** Dev run 1: decision 059's scoring (v1 under scores/, x1 under scores/judge-x1/, "-super-" names). */
const run1 = (bench: string, row: RowName) => readRun("1", (j, repo, kind) => join(bench, j === "judge-v1" ? "scores" : "scores/judge-x1", `${row}-super-${repo}.${kind}.json`));

function complete(dir: string, what: string) {
  if (readRunJson(dir).status !== "complete") throw new Error(`${what} is not complete`);
}
export const super3Dirs = (bench: string) => ([2, 4, 5, 6] as const).map((n) => ({ n, ...standingRunDir(bench, "dev", n) }));
export function super35Dirs(bench: string) {
  return ([7, 8] as Dev067Run[]).map((n) => {
    const r = modelRunDir(bench, n, modelSlug(SUPER_35), true);
    const dir = existsSync(r) ? r : modelRunDir(bench, n, modelSlug(SUPER_35));
    return { n, dir, restarted: dir === r };
  });
}
export function ultraDirs(bench: string) {
  return ([10, 11] as Dev071Run[]).map((n) => {
    const r = dev071RunDir(bench, n, true);
    const dir = existsSync(r) ? r : dev071RunDir(bench, n);
    return { n, dir, restarted: dir === r, status: existsSync(dir) ? readRunJson(dir).status : ("absent" as const) };
  });
}

function groups(bench: string, row: RowName) {
  const s3 = [run1(bench, row), ...super3Dirs(bench).map(({ n, dir, restarted }) => (complete(dir, `dev run ${n}`), runAt(`${n}${restarted ? "r" : ""}`, dir, row)))];
  const s35 = super35Dirs(bench).map(({ n, dir, restarted }) => (complete(dir, `3.5 dev run ${n}`), runAt(`${n}${restarted ? "r" : ""}`, dir, row)));
  const ultra = ultraDirs(bench)
    .filter((u) => u.status === "complete")
    .map(({ n, dir, restarted }) => runAt(`${n}${restarted ? "r" : ""}`, dir, row));
  return { "3 Super": s3, "3.5 Super": s35, Ultra: ultra };
}

const sumOver = (m: Map<string, Pr>, keys: string[]): Pr => {
  const c = { tp: 0, fp: 0, fn: 0 };
  for (const k of keys) {
    const p = m.get(k);
    if (p) (c.tp += p.tp), (c.fp += p.fp), (c.fn += p.fn);
  }
  return c;
};
const meanF = (runs: RunScores[], j: Judge, keys: string[]) => mean(runs.map((r) => fOf(sumOver(r.pulls[j], keys))));

export function bootstrap(base: RunScores[], cand: RunScores[], j: Judge, keys: string[], resamples = RESAMPLES, seed = SEED) {
  const rand = mulberry32(seed);
  const diffs: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const draw = Array.from({ length: keys.length }, () => keys[Math.floor(rand() * keys.length)]!);
    diffs.push(meanF(cand, j, draw) - meanF(base, j, draw));
  }
  diffs.sort((a, b) => a - b);
  return { point: meanF(cand, j, keys) - meanF(base, j, keys), lo: diffs[Math.floor(0.025 * resamples) - 1]!, hi: diffs[Math.ceil(0.975 * resamples) - 1]!, below0: diffs.filter((d) => d < 0).length / resamples };
}

// ---- operations: failed chunks, truncations, 429s, wall time, tokens ----

type Chunk = { failure?: string };
type Verdict = { failure?: string };
type AttemptFile = { diff: { review: { chunks: Chunk[] } }; ctx: { review: { chunks: Chunk[] } }; diffVerdicts: { comments: Verdict[] }; ctxOnlyVerdicts: { comments: Verdict[] } };

/** Failed reviewer chunks and VERIFY_FAILED in the attempt each pull request used. */
export function failures(dir: string) {
  let prs = 0;
  let chunks = 0;
  let verifyFailed = 0;
  const strings = new Map<string, number>();
  for (const repo of DEV_REPOS) {
    const ad = join(dir, "attempts", repo);
    if (!existsSync(ad)) continue;
    const files = readdirSync(ad);
    for (const pr of new Set(files.map((f) => f.replace(/\.attempt-\d\.json$/, "")))) {
      const used = files.includes(`${pr}.attempt-2.json`) ? `${pr}.attempt-2.json` : `${pr}.attempt-1.json`;
      const a = readJson<AttemptFile>(join(ad, used));
      const failed = [...a.diff.review.chunks, ...a.ctx.review.chunks].filter((c) => c.failure);
      if (failed.length) prs++;
      chunks += failed.length;
      for (const c of failed) strings.set(c.failure!, (strings.get(c.failure!) ?? 0) + 1);
      verifyFailed += [...a.diffVerdicts.comments, ...a.ctxOnlyVerdicts.comments].filter((c) => c.failure).length;
    }
  }
  return { prs, chunks, verifyFailed, strings };
}

/** Ledger entries of a model inside a run's time window (judge calls excluded: bench-judge-v1 is 3 Super), and those at their max_tokens (32,000 reviewer, 16,000 verifier). */
export function ledgerWindow(model: string, dir: string) {
  const j = readRunJson(dir) as { startedAt?: string; finishedAt?: string | null };
  const es = new SpendLedger(join(ROOT, ".tracehound/spend.jsonl"))
    .entries()
    .filter((e) => e.model === model && e.purpose !== "bench-judge" && j.startedAt !== undefined && e.timestamp >= j.startedAt && (!j.finishedAt || e.timestamp <= j.finishedAt));
  const atMax = es.filter((e) => e.outputTokens >= (e.purpose.startsWith("verify") ? 16_000 : 32_000)).length;
  return { calls: es.length, failedCalls: es.filter((e) => e.ok === false).length, atMax, inputTokens: es.reduce((s, e) => s + e.inputTokens, 0), outputTokens: es.reduce((s, e) => s + e.outputTokens, 0) };
}

const wallSeconds = (dir: string) => ((readRunJson(dir) as { pulls?: { wallMs: number }[] }).pulls ?? []).map((p) => p.wallMs / 1000);

export function report(bench: string, log: (l: string) => void) {
  const ultra = ultraDirs(bench);
  log(`Ultra runs: ${ultra.map((u) => `${u.n}${u.restarted ? "r" : ""} ${u.status}`).join(" · ")}`);
  const gs = Object.fromEntries(ROWS.map((row) => [row, groups(bench, row)])) as Record<RowName, ReturnType<typeof groups>>;

  // baseline check against the plan's stated numbers
  log("");
  for (const row of ROWS) {
    for (const name of ["3 Super", "3.5 Super"] as const) {
      const got = 100 * mean(gs[row][name].map((r) => metrics(r.totals["judge-v1"]).f ?? 0));
      const stated = STATED_BASELINES[row][name];
      log(`baseline check ${row} ${name} v1 mean F: recomputed ${got.toFixed(2)} · stated ${stated} · ${Math.abs(got - stated) <= 0.1 + 1e-9 ? "ok" : "DIFFERS BY MORE THAN 0.1: STOP"}`);
    }
  }

  for (const row of ROWS) {
    log("");
    log(`### ${row}`);
    log("");
    log("| judge | model | run | comments | TP | FP | FN | P | R | F |");
    log("|---|---|---|---|---|---|---|---|---|---|");
    for (const j of JUDGES) {
      for (const name of ["3 Super", "3.5 Super", "Ultra"] as const) {
        const rs = gs[row][name];
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
  }

  const ultraCount = gs["pool-verify-v1"].Ultra.length;
  if (ultraCount) {
    const keys = [...new Set(gs["pool-verify-v1"]["3 Super"].flatMap((r) => [...r.pulls["judge-v1"].keys(), ...r.pulls["judge-x1"].keys()]))].sort();
    log("");
    log(`paired bootstrap: ${RESAMPLES} resamples, seed ${SEED}, ${keys.length} pull requests, Ultra runs ${ultraCount}`);
    log("");
    log("| row | judge | comparison | mean F difference | 95% interval | resamples below 0 | interval excludes 0 |");
    log("|---|---|---|---|---|---|---|");
    for (const row of ROWS) {
      for (const j of JUDGES) {
        for (const base of ["3.5 Super", "3 Super"] as const) {
          const b = bootstrap(gs[row][base], gs[row].Ultra, j, keys);
          const excl = b.lo > 0 ? "yes, above 0" : b.hi < 0 ? "yes, below 0" : "no";
          log(`| ${row} | ${j} | Ultra − ${base} | ${pts(b.point)} | [${pts(b.lo)}, ${pts(b.hi)}] | ${(100 * b.below0).toFixed(1)}% | ${excl} |`);
        }
      }
    }
  }

  // operations
  log("");
  log("| model | run | PRs with a failed chunk | failed chunks | VERIFY_FAILED | calls (ledger) | at max_tokens | wall s median | wall s max |");
  log("|---|---|---|---|---|---|---|---|---|");
  const opsRows: { name: string; model: string; n: string; dir: string }[] = [
    ...super3Dirs(bench).map(({ n, dir, restarted }) => ({ name: "3 Super", model: "nvidia/nemotron-3-super-120b-a12b", n: `${n}${restarted ? "r" : ""}`, dir })),
    ...super35Dirs(bench).map(({ n, dir, restarted }) => ({ name: "3.5 Super", model: SUPER_35, n: `${n}${restarted ? "r" : ""}`, dir })),
    ...ultra.filter((u) => u.status !== "absent").map(({ n, dir, restarted }) => ({ name: "Ultra", model: MODEL_071, n: `${n}${restarted ? "r" : ""}`, dir })),
  ];
  for (const o of opsRows) {
    const f = failures(o.dir);
    const l = ledgerWindow(o.model, o.dir);
    const w = wallSeconds(o.dir);
    log(`| ${o.name} | ${o.n} | ${f.prs} | ${f.chunks} | ${f.verifyFailed} | ${l.calls} | ${l.atMax} | ${median(w).toFixed(0)} | ${Math.max(0, ...w).toFixed(0)} |`);
  }
  log("");
  for (const u of ultra.filter((x) => x.status !== "absent")) {
    const f = failures(u.dir);
    const j = readRunJson(u.dir) as { nvidiaApi?: { requests: number; http429: number }; startedAt?: string; finishedAt?: string | null; costUSD: number };
    const l = ledgerWindow(MODEL_071, u.dir);
    log(`Ultra run ${u.n}${u.restarted ? "r" : ""}: NVIDIA API requests ${j.nvidiaApi?.requests ?? "n/a"} · HTTP 429 ${j.nvidiaApi?.http429 ?? "n/a"} · ledgered Ultra calls ${l.calls} (failed ${l.failedCalls}) · Ultra tokens in ${l.inputTokens} out ${l.outputTokens} · started ${j.startedAt} · finished ${j.finishedAt} · Nebius spend (judges) $${j.costUSD.toFixed(4)}`);
    for (const [s, k] of f.strings) log(`  failed-chunk string ×${k}: ${s.slice(0, 200)}`);
  }

  // tokens per pull request (pipeline only, every attempt counted)
  log("");
  log("| pipeline per pull request | n | input tokens median | output tokens median | output tokens mean |");
  log("|---|---|---|---|---|");
  for (const [name, dirs] of [
    ["3 Super (runs 2r, 4, 5, 6)", super3Dirs(bench).map((d) => d.dir)],
    ["3.5 Super (runs 7r, 8)", super35Dirs(bench).map((d) => d.dir)],
    ["Ultra", ultra.filter((u) => u.status !== "absent").map((u) => u.dir)],
  ] as const) {
    const us = dirs.flatMap((d) => (existsSync(join(d, "attempts")) ? attemptsUsage(d) : []));
    if (!us.length) continue;
    log(`| ${name} | ${us.length} | ${median(us.map((u) => u.inputTokens)).toFixed(0)} | ${median(us.map((u) => u.outputTokens)).toFixed(0)} | ${mean(us.map((u) => u.outputTokens)).toFixed(0)} |`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { bench: { type: "string" } }, strict: true });
  report(values.bench ?? join(homedir(), "Projects/tracehound-bench"), (l) => console.log(l));
}
