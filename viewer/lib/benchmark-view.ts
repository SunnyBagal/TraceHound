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

/* the blind run: TraceHound v2, v1 (history) and the five tools, not the pipeline's own stages */
const F_V1 = col(BLIND, "F (v1)");
export const blindRows = BLIND.rows
  .filter((r) => !r[0].includes("secondary"))
  .map((r) => ({ name: r[0], label: r[0].startsWith("TraceHound v2") ? "TraceHound v2" : r[0].startsWith("TraceHound v1") ? "TraceHound v1 (history)" : r[0], f: pct(r[F_V1]!), cell: r[F_V1]!, kind: r[0].startsWith("TraceHound v2") ? ("ours" as const) : r[0].startsWith("TraceHound v1") ? ("history" as const) : ("tool" as const) }));
export const v2 = blindRows.find((r) => r.kind === "ours")!;

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
export const band = { min: Math.min(...inBand.map((r) => r.f)), max: Math.max(...inBand.map((r) => r.f)) };
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const after = (prefix: string) => gapRows.filter((g) => g.sentence.startsWith(prefix)).map((g) => g.sentence.slice(prefix.length));
/** table 2's sentences, joined: "v2 is statistically tied with A, B and C, and ahead of D." */
export const gapSentence = `v2 is statistically tied with ${list(after("statistically tied with "))}${after("ahead of ").length ? `, and ahead of ${list(after("ahead of "))}` : ""}.`;

/* the full benchmark: the pre-registered v2 row's point-estimate rank */
export const RANK = col(ALL50, "rank of 6 (point estimate)");
export const rankOf = /rank of (\d+)/.exec(ALL50.headers[RANK]!)![1];
export const preRegistered = ALL50.rows.find((r) => r[0].includes("pre-registered"))!;

/* v1's three blind runs (3 Super) and the dev means per model */
export const v1Runs = V1.rows.map((r) => ({ run: r[0].split(" ")[0]!, f: pct(r[1]) }));
export const spread = (xs: number[]) => `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}%`;
const devRow = DEV.rows.find((r) => r[0] === "pool-verify-v1" && r[1] === "v1")!;
export const devChips = DEV.headers.slice(2).map((h, i) => ({ label: h.replace(": P / R / F", ""), f: devRow[i + 2]!.split("/").pop()!.trim() }));

