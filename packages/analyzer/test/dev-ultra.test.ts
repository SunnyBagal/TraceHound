// Decision 071's report (scripts/bench/dev-ultra.ts), fixed after review of #63: a baseline mismatch
// stops the report, and verifier calls (ledgered with the reviewer's purpose) are told apart by their
// token counts. Invented counts in temp folders; no network, no dataset text. The last test compares
// the report on the real dev records with the saved one, and runs only where both exist.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baselineCheck, ledgerWindow, report, STATED_BASELINES, verifierCalls, type RunScores } from "../../../scripts/bench/dev-ultra.ts";
import { DEV_REPOS, MODEL_071 } from "../../../scripts/bench/test-set.ts";
import { zeroCounts, type Counts } from "../src/bench/score.ts";

const ROWS = ["pool-verify-v1", "pool-raw"] as const;
const JUDGES = ["judge-v1", "judge-x1"] as const;
const counts = (tp: number, fp: number, fn: number): Counts => ({ ...zeroCounts(), comments: tp + fp, tp, fp, fn, goldenCounted: tp + fn });
const write = (f: string, v: unknown) => (mkdirSync(path.dirname(f), { recursive: true }), writeFileSync(f, JSON.stringify(v)));
const usage = (calls: number, inputTokens: number, outputTokens: number) => ({ calls, cached: 0, inputTokens, outputTokens, costUSD: 0, latencyMs: 1 });
const STARTED = "2001-01-01T00:00:00.000Z";
const FINISHED = "2001-01-01T01:00:00.000Z";

/** Score files for one run: every pull request TP 1 · FP 1 · FN 1, so every F is 50.0. */
function scores(file: (j: string, repo: string, kind: string) => string) {
  for (const j of JUDGES) {
    for (const repo of DEV_REPOS) {
      const c = counts(1, 1, 1);
      write(file(j, repo, "detail"), { detail: [{ reviewFile: "0.json", status: "SCORED", counts: c }] });
      write(file(j, repo, "summary"), { counts: c });
    }
  }
}

/** One attempt per repo whose verifier made the given calls; the reviewer's chunks all succeeded. */
function attempts(dir: string, verdicts: ReturnType<typeof usage>[]) {
  for (const repo of DEV_REPOS) {
    const review = { chunks: [{}], usage: usage(1, 0, 0) };
    write(path.join(dir, "attempts", repo, "0.attempt-1.json"), {
      diff: { review },
      ctx: { review },
      diffVerdicts: { comments: repo === DEV_REPOS[0] ? verdicts.map((u) => ({ usage: u })) : [], verify: { usage: usage(0, 0, 0) } },
      ctxOnlyVerdicts: { comments: [], verify: { usage: usage(0, 0, 0) } },
    });
  }
}

const entry = (inputTokens: number, outputTokens: number) => ({
  timestamp: "2001-01-01T00:30:00.000Z",
  model: MODEL_071,
  inputTokens,
  outputTokens,
  estCostUSD: 0,
  purpose: "review", // reviewer and verify-ctx alike
  ok: true,
  usageReported: true,
  priceEstimated: false,
});

/** A bench with runs 1, 2, 4–6 (3 Super), 7, 8 (3.5 Super) and Ultra run 10, plus a ledger. */
function fixtureBench() {
  const bench = mkdtempSync(path.join(tmpdir(), "tracehound-071-"));
  const rd = (name: string) => path.join(bench, "reviews/dev-repeat", name);
  for (const row of ROWS) scores((j, repo, kind) => path.join(bench, j === "judge-v1" ? "scores" : "scores/judge-x1", `${row}-super-${repo}.${kind}.json`));
  for (const dir of [...[2, 4, 5, 6].map((n) => rd(`run-${n}`)), ...[7, 8].map((n) => rd(`run-${n}-nvidia-nemotron-3-5-super-vl`)), rd("run-10-nvidia-nemotron-3-ultra-550b-a55b")]) {
    write(path.join(dir, "run.json"), { status: "complete", costUSD: 0, startedAt: STARTED, finishedAt: FINISHED, pulls: [{ wallMs: 1000 }] });
    for (const row of ROWS) scores((j, repo, kind) => path.join(dir, "scores", j, `${row}-${repo}.${kind}.json`));
  }
  const ultra = rd("run-10-nvidia-nemotron-3-ultra-550b-a55b");
  attempts(ultra, [usage(1, 5000, 16_000), usage(2, 9000, 16_600)]);
  const ledger = path.join(bench, "spend.jsonl");
  writeFileSync(ledger, [entry(40_000, 32_000), entry(40_000, 20_000), entry(5000, 16_000), entry(4000, 16_000), entry(5000, 600)].map((e) => JSON.stringify(e)).join("\n") + "\n");
  return { bench, ultra, ledger };
}

const allFifty = { "pool-verify-v1": { "3 Super": 50, "3.5 Super": 50 }, "pool-raw": { "3 Super": 50, "3.5 Super": 50 } };

describe("baseline check (review of #63: a mismatch stops the report)", () => {
  const run = (tp: number, fp: number, fn: number): RunScores => ({ label: "x", pulls: { "judge-v1": new Map(), "judge-x1": new Map() }, totals: { "judge-v1": counts(tp, fp, fn), "judge-x1": counts(tp, fp, fn) } });
  const gs = { "pool-verify-v1": { "3 Super": [run(1, 1, 1)], "3.5 Super": [run(1, 1, 1)] }, "pool-raw": { "3 Super": [run(1, 1, 1)], "3.5 Super": [run(1, 1, 1)] } };

  it("is ok within 0.1 and prints a STOP line otherwise", () => {
    expect(baselineCheck(gs, allFifty).ok).toBe(true);
    const off = baselineCheck(gs, { ...allFifty, "pool-raw": { "3 Super": 50, "3.5 Super": 50.2 } });
    expect(off.ok).toBe(false);
    expect(off.lines.filter((l) => l.endsWith("DIFFERS BY MORE THAN 0.1: STOP"))).toEqual(["baseline check pool-raw 3.5 Super v1 mean F: recomputed 50.00 · stated 50.2 · DIFFERS BY MORE THAN 0.1: STOP"]);
  });

  it("report prints the check lines and no table when a baseline differs, and returns baselinesOk false", () => {
    const { bench, ledger } = fixtureBench();
    const lines: string[] = [];
    expect(report(bench, (l) => lines.push(l), { ledgerFile: ledger, stated: STATED_BASELINES })).toEqual({ baselinesOk: false });
    expect(lines.some((l) => l.includes("STOP"))).toBe(true);
    expect(lines.filter((l) => l.startsWith("|") || l.startsWith("#") || l.startsWith("paired bootstrap") || l.startsWith("Ultra run "))).toEqual([]);

    const ok: string[] = [];
    expect(report(bench, (l) => ok.push(l), { ledgerFile: ledger, stated: allFifty })).toEqual({ baselinesOk: true });
    expect(ok).toContain("### pool-verify-v1");
    expect(ok.some((l) => l.startsWith("paired bootstrap"))).toBe(true);
  });
});

describe("verifier truncations (review of #63: verify-ctx ledgers as review)", () => {
  it("verifierCalls matches a one-call verdict by its tokens, and a two-call verdict by a pair of calls", () => {
    const entries = [
      { inputTokens: 40_000, outputTokens: 20_000 }, // reviewer
      { inputTokens: 5000, outputTokens: 16_000 }, // verifier, one call
      { inputTokens: 4000, outputTokens: 16_000 }, // verifier, first of two
      { inputTokens: 5000, outputTokens: 600 }, // verifier, second of two
    ];
    expect(verifierCalls(entries, [usage(1, 5000, 16_000), usage(2, 9000, 16_600)])).toEqual([false, true, true, true]);
    expect(verifierCalls(entries, [])).toEqual([false, false, false, false]);
    // a two-call verdict whose halves are equal needs two such calls
    expect(verifierCalls([{ inputTokens: 1, outputTokens: 2 }], [usage(2, 2, 4)])).toEqual([false]);
    expect(verifierCalls([{ inputTokens: 1, outputTokens: 2 }, { inputTokens: 1, outputTokens: 2 }], [usage(2, 2, 4)])).toEqual([true, true]);
  });

  it("ledgerWindow counts reviewer calls at 32,000 and verifier calls at 16,000 apart, though all are purpose review", () => {
    const { ultra, ledger } = fixtureBench();
    expect(ledgerWindow(MODEL_071, ultra, ledger)).toEqual({ calls: 5, failedCalls: 0, noUsage: 0, atMax: 1, verifierAtMax: 2, inputTokens: 94_000, outputTokens: 84_600 });
  });

  it("the operations table shows the verifier column", () => {
    const { bench, ledger } = fixtureBench();
    const lines: string[] = [];
    report(bench, (l) => lines.push(l), { ledgerFile: ledger, stated: allFifty });
    expect(lines).toContain("| model | run | PRs with a failed chunk | failed chunks | VERIFY_FAILED | calls (ledger) | at max_tokens | verifier at max_tokens | wall s median | wall s max |");
    expect(lines.find((l) => l.startsWith("| Ultra | 10 |"))).toBe("| Ultra | 10 | 0 | 0 | 0 | 5 | 1 | 2 | 1 | 1 |");
  });
});

// The saved report (runs/, gitignored) and the dev records (the bench folder) exist only on the
// machine that ran 071; elsewhere this is skipped.
const SAVED = path.resolve(import.meta.dirname, "../../../runs/071-report-final.txt");
const BENCH = path.join(homedir(), "Projects/tracehound-bench");
const haveRecords = existsSync(SAVED) && existsSync(path.join(BENCH, "reviews/dev-repeat/run-10-nvidia-nemotron-3-ultra-550b-a55b"));

describe.skipIf(!haveRecords)("the report on the real dev records equals the one saved before the fixes", () => {
  it("is byte-identical except for the added verifier column", () => {
    const lines: string[] = [];
    expect(report(BENCH, (l) => lines.push(l)).baselinesOk).toBe(true);
    // drop column 8 (verifier at max_tokens) from the operations table: its header and every line up to the next blank one
    let ops = false;
    const without = lines.map((l) => {
      if (l.startsWith("| model | run | PRs with a failed chunk")) ops = true;
      if (l === "") ops = false;
      if (!ops) return l;
      const cells = l.split("|");
      return [...cells.slice(0, 8), ...cells.slice(9)].join("|");
    });
    expect(without.join("\n") + "\n").toBe(readFileSync(SAVED, "utf8"));
  });
});
