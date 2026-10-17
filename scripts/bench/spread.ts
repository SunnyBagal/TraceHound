// Run-to-run spread of decision 061: min, median and max of P, R and F per row over runs 1–3, under
// each judge. Counts only. Cal.com runs 1–3 come from <bench>/test/run-<n>/scores/; dev run 1 is
// decision 059's scoring (<bench>/scores/ for bench-judge-v1, <bench>/scores/judge-x1/ for
// bench-judge-x1, decision 060), dev runs 2–3 from <bench>/reviews/dev-repeat/run-<n>/scores/. A run
// with no complete scores is shown as not done and left out of the spread. A restarted run (061a)
// is read from run-<n>r/, stands for run n, and is labelled "(restarted)".
//   TRACEHOUND_TEST_RUN=061 node scripts/bench/spread.ts --set cal_dot_com [--bench <dir>]
//   node scripts/bench/spread.ts --set dev [--bench <dir>]
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { addCounts, metrics, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { JUDGES } from "./run-test-set.ts";
import { reposOf, requireTestRun, SETS, standingRunDir, TEST_SET, TRACEHOUND_ROWS, type Row, type RunNumber, type SetName } from "./test-set.ts";

/** Labels of 059's dev scoring (scores/<label>-<repo>.summary.json). */
const DEV_RUN1_LABELS: Record<string, string> = {
  "pool-verify-v1": "pool-verify-v1-super",
  "review-diff-v1": "review-diff-v1-nemotron-3-super-120b-a12b",
  "pool-raw": "pool-raw-super",
};

/** min, median (mean of the two middle values for an even count) and max; null for an empty list. */
export function minMedMax(xs: number[]): { min: number; median: number; max: number } | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  return { min: s[0]!, median, max: s[s.length - 1]! };
}

export interface RowSpread {
  row: string;
  /** F per run in run order; null = not done */
  f: (number | null)[];
  /** per run: read from run-<n>r/ (061a) */
  restarted: boolean[];
  runs: number;
  p: ReturnType<typeof minMedMax>;
  r: ReturnType<typeof minMedMax>;
  fSpread: ReturnType<typeof minMedMax>;
}

/** Spread of one row from its per-run counts (null = run not done). P, R and F are micro-averaged per run first. */
export function rowSpread(row: string, perRun: (Counts | null)[], restarted: boolean[] = perRun.map(() => false)): RowSpread {
  const ms = perRun.map((c) => (c ? metrics(c) : null));
  const done = ms.filter((m): m is NonNullable<typeof m> => m !== null);
  const vals = (k: "precision" | "recall" | "f") => done.map((m) => m[k]).filter((x): x is number => x !== null);
  return { row, f: ms.map((m) => m?.f ?? null), restarted, runs: done.length, p: minMedMax(vals("precision")), r: minMedMax(vals("recall")), fSpread: minMedMax(vals("f")) };
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${(100 * x).toFixed(1)}%`);
const trio = (s: ReturnType<typeof minMedMax>) => (s ? `${pct(s.min)} / ${pct(s.median)} / ${pct(s.max)}` : "n/a");

export const SPREAD_HEAD = "| row | runs done | F run 1 / 2 / 3 | P min / median / max | R min / median / max | F min / median / max |\n|---|---|---|---|---|---|";
export const spreadLine = (s: RowSpread) => `| ${s.row} | ${s.runs} | ${s.f.map((x, i) => (x === null ? "not done" : pct(x)) + (s.restarted[i] ? " (restarted)" : "")).join(" / ")} | ${trio(s.p)} | ${trio(s.r)} | ${trio(s.fSpread)} |`;

/** A run's summed counts for a row under a judge, or null unless every repo's summary exists. */
function runCounts(bench: string, set: SetName, run: RunNumber, row: Row, judgeId: string): Counts | null {
  let c = zeroCounts();
  for (const repo of reposOf(set)) {
    const f =
      set === "dev" && run === 1
        ? join(bench, "scores", ...(judgeId === "judge-x1" ? ["judge-x1"] : []), `${DEV_RUN1_LABELS[row]}-${repo}.summary.json`)
        : join(standingRunDir(bench, set, run).dir, "scores", judgeId, `${row}-${repo}.summary.json`);
    if (!existsSync(f)) return null;
    c = addCounts(c, (JSON.parse(readFileSync(f, "utf8")) as { counts: Counts }).counts);
  }
  return c;
}

export function spreadReport(bench: string, set: SetName): string[] {
  const out: string[] = [`## Spread over runs 1–3: ${set} (decision 061)`];
  for (const j of JUDGES) {
    out.push("", `### ${j.id === "judge-v1" ? "bench-judge-v1 (scorer of record)" : "bench-judge-x1 (report only)"}`, "", SPREAD_HEAD);
    const runs = [1, 2, 3] as const;
    const restarted = runs.map((n) => !(set === "dev" && n === 1) && standingRunDir(bench, set, n).restarted);
    for (const row of TRACEHOUND_ROWS) out.push(spreadLine(rowSpread(row, runs.map((n) => runCounts(bench, set, n, row, j.id)), restarted)));
  }
  return out;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { set: { type: "string" }, bench: { type: "string" } }, strict: true });
  if (!(SETS as readonly string[]).includes(values.set ?? "")) throw new Error(`--set must be one of ${SETS.join(", ")}`);
  if (values.set === TEST_SET) requireTestRun(process.env);
  console.log(spreadReport(values.bench ?? join(homedir(), "Projects/tracehound-bench"), values.set as SetName).join("\n"));
}
