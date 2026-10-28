import { BENCHMARK_TABLES } from "./benchmark";

/*
 * Every number here is lib/benchmark.ts's (itself docs/bench/results.md's, checked by
 * test/benchmark.test.tsx). Tables are found by their title, never by position or by reading
 * their notes, and the figures above the tables only re-draw cells of those tables.
 */
type Table = (typeof BENCHMARK_TABLES)[number];
export function table(prefix: string): Table {
  const found = BENCHMARK_TABLES.find((t) => t.title.startsWith(prefix));
  if (!found) throw new Error(`lib/benchmark.ts has no table titled "${prefix}…"`);
  return found;
}
const col = (t: Table, header: string) => {
  const i = (t.headers as readonly string[]).indexOf(header);
  if (i < 0) throw new Error(`"${t.title}" has no column "${header}"`);
  return i;
};
const pct = (cell: string) => Number.parseFloat(cell);
export const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export const word = (n: number) => WORDS[n] ?? String(n);

export const BLIND = table("Blind test: Cal.com, v2");
export const GAPS = table("Cal.com: v2 minus each reviewer");
export const ALL50 = table("All 50 PRs, bench-judge-v1");
export const DEV = table("Dev set (40 PRs");
export const V1 = table("v1 history");

/** The two judges: bench-judge-v1 is the scorer of record, bench-judge-x1 reports alongside. */
export type Judge = "v1" | "x1";
export const JUDGES: readonly Judge[] = ["v1", "x1"];

/** Which reviewer a row names, for its logo: the five tools, or TraceHound (any of its pipelines). */
export type Reviewer = "augment" | "cursor" | "greptile" | "copilot" | "coderabbit" | "tracehound";
export function reviewerOf(name: string): Reviewer | null {
  const n = name.toLowerCase();
  if (/^(tracehound|3 super pool-verify|review-diff-v1|pool-raw)/.test(n)) return "tracehound";
  return (["augment", "cursor", "greptile", "copilot", "coderabbit"] as const).find((t) => n === t) ?? null;
}

/* the blind run: TraceHound v2, v1 (history) and the five tools, not the pipeline's own stages */
const BLIND_COL = { f: col(BLIND, "F (v1)"), fx: col(BLIND, "F (x1)"), p: col(BLIND, "P (n)"), r: col(BLIND, "R (n)"), tp: col(BLIND, "TP"), fp: col(BLIND, "FP"), fn: col(BLIND, "FN") };
const secondary = (name: string) => name.includes("secondary") || name.includes("not ranked");
export const blindRows = BLIND.rows
  .filter((r) => !secondary(r[0]))
  .map((r) => ({
    name: r[0],
    label: r[0].startsWith("TraceHound v2") ? "TraceHound v2" : r[0].startsWith("TraceHound v1") ? "TraceHound v1" : r[0],
    f: pct(r[BLIND_COL.f]!), cell: r[BLIND_COL.f]!,
    by: { v1: { f: pct(r[BLIND_COL.f]!), cell: r[BLIND_COL.f]! }, x1: { f: pct(r[BLIND_COL.fx]!), cell: r[BLIND_COL.fx]! } },
    p: r[BLIND_COL.p]!, r: r[BLIND_COL.r]!, tp: r[BLIND_COL.tp]!, fp: r[BLIND_COL.fp]!, fn: r[BLIND_COL.fn]!,
    kind: r[0].startsWith("TraceHound v2") ? ("ours" as const) : r[0].startsWith("TraceHound v1") ? ("history" as const) : ("tool" as const),
  }));
export type BlindRow = (typeof blindRows)[number];
export const v2 = blindRows.find((r) => r.kind === "ours")!;
/** the blind rows in rank order under a judge: highest F first, so v2 sits where its F puts it */
export const blindRanked = (judge: Judge) => [...blindRows].sort((a, b) => b.by[judge].f - a.by[judge].f);

/* table 2's "sentence the rule allows": which rows are statistically tied with v2 */
const SENTENCE = col(GAPS, "sentence the rule allows");
const gapRows = GAPS.rows.map((r) => ({ name: r[0], sentence: r[SENTENCE]! }));
/** the blind-run row a table-2 row is about ("3 Super pool-verify-v1 (run 1)" is v1) */
const blindRowFor = (gapName: string) => (gapName.startsWith("3 Super") ? blindRows.find((r) => r.kind === "history") : blindRows.find((r) => r.name.toLowerCase() === gapName.toLowerCase()));
export const tiedNames = new Set(gapRows.filter((g) => g.sentence.startsWith("statistically tied with")).map((g) => blindRowFor(g.name)?.name).filter(Boolean) as string[]);
export const tools = gapRows.filter((g) => !g.name.startsWith("3 Super"));
export const tiedTools = tools.filter((g) => g.sentence.startsWith("statistically tied with"));
export const aheadTools = tools.filter((g) => g.sentence.startsWith("ahead of"));
const inBand = blindRows.filter((r) => r.kind === "ours" || tiedNames.has(r.name));
/** the F range of v2 and every reviewer table 2 calls tied with it, under a judge */
export const bandFor = (judge: Judge) => ({ min: Math.min(...inBand.map((r) => r.by[judge].f)), max: Math.max(...inBand.map((r) => r.by[judge].f)) });
export const band = bandFor("v1");
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const after = (prefix: string) => gapRows.filter((g) => g.sentence.startsWith(prefix)).map((g) => g.sentence.slice(prefix.length));
/** table 2's sentences, joined: "v2 is statistically tied with A, B and C, and ahead of D." */
export const gapSentence = `v2 is statistically tied with ${list(after("statistically tied with "))}${after("ahead of ").length ? `, and ahead of ${list(after("ahead of "))}` : ""}.`;

/* table 2's intervals, "−16.0 [−30.9, +3.5]" → numbers; rows ordered by the observed v1 gap, so the
   reviewers ahead of v2 come first */
const interval = (cell: string) => {
  const m = /([-+]?[\d.]+)\s*\[([-+]?[\d.]+),\s*([-+]?[\d.]+)\]/.exec(cell.replaceAll("−", "-"));
  if (!m) throw new Error(`not an interval: "${cell}"`);
  return { obs: Number(m[1]), lo: Number(m[2]), hi: Number(m[3]), cell };
};
const GAP_COL = { v1: col(GAPS, "v1: observed [95%]"), x1: col(GAPS, "x1: observed [95%]") };
export const gapIntervals = GAPS.rows
  .map((r) => ({ name: r[0], label: r[0].startsWith("3 Super") ? "TraceHound v1" : r[0], sentence: r[SENTENCE]!, tied: r[SENTENCE]!.startsWith("statistically tied with"), by: { v1: interval(r[GAP_COL.v1]!), x1: interval(r[GAP_COL.x1]!) } }))
  .sort((a, b) => a.by.v1.obs - b.by.v1.obs);

/* the full benchmark: the pre-registered v2 row's point-estimate rank */
export const RANK = col(ALL50, "rank of 6 (point estimate)");
export const rankOf = /rank of (\d+)/.exec(ALL50.headers[RANK]!)![1];
export const preRegistered = ALL50.rows.find((r) => r[0].includes("pre-registered"))!;
/* both judges' full-benchmark F for the ranked rows (v2 as pre-registered), in rank order */
const ALL50_X1 = table("All 50 PRs, bench-judge-x1");
const fOf = (t: Table, name: string) => { const row = t.rows.find((r) => r[0] === name)!; return { f: pct(row[col(t, "F")]!), cell: row[col(t, "F")]! }; };
export const fullRows = ALL50.rows
  .filter((r) => !secondary(r[0]) && (!r[0].startsWith("TraceHound") || r[0].includes("pre-registered")))
  .map((r) => ({ name: r[0], label: r[0].startsWith("TraceHound v2") ? "TraceHound v2" : r[0], kind: r[0].startsWith("TraceHound") ? ("ours" as const) : ("tool" as const), by: { v1: fOf(ALL50, r[0]), x1: fOf(ALL50_X1, r[0]) } }))
  .sort((a, b) => b.by.v1.f - a.by.v1.f);
/** the full benchmark's golden-finding count, the denominator of its R (n) cells */
export const fullN = /\/(\d+)\)/.exec(ALL50.rows[0]![col(ALL50, "R (n)")]!)![1]!;

/* v1's three blind runs (3 Super) and the dev means per model */
export const v1Runs = V1.rows.map((r) => ({ run: r[0].split(" ")[0]!, f: pct(r[1]) }));
export const spread = (xs: number[]) => `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}%`;

/**
 * A table's rows in the order the page shows them: the blind test ranked by F (v1), table 2 by the
 * observed gap; pipeline stages that are not ranked stay last. Other tables keep the report's order.
 */
export function orderedRows(t: Table): readonly (readonly string[])[] {
  if (t === BLIND) {
    const f = BLIND_COL.f;
    return [...BLIND.rows.filter((r) => !secondary(r[0])).sort((a, b) => pct(b[f]!) - pct(a[f]!)), ...BLIND.rows.filter((r) => secondary(r[0]))];
  }
  if (t === GAPS) return gapIntervals.map((g) => GAPS.rows.find((r) => r[0] === g.name)!);
  return t.rows;
}
export const isSecondary = secondary;

