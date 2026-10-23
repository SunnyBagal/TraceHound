// Intervals for the v2 gaps (decision 069, note 069b; plan docs/bench/v2-intervals-plan.md).
// Primary: a PR-level paired bootstrap of the micro-F difference. Secondary: the cc-01 audit's
// comment-level multinomial bootstrap with its design effect (audit-cc01.md §3.2 (b) and appendix),
// used only if it reproduces the audit's published 3 Super numbers to 0.1 point. Reads the per-PR
// counts and status of existing score files and prints counts and intervals only: no comment text,
// golden text or titles are read into the output. No model, no network.
//   node scripts/bench/intervals.ts [--bench <dir>] [--json]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

export interface PrCounts {
  /** repo + goldenIndex */
  key: string;
  tp: number;
  fp: number;
  fn: number;
  judgeFailed: boolean;
}
export interface Totals { tp: number; fp: number; fn: number }

export const PRIMARY_RESAMPLES = 10_000;
export const SECONDARY_DRAWS = 200_000;
export const SEED = 69;
/** the audit's median design effect (audit-cc01.md §3.2 (b)), reused unchanged */
export const DESIGN_EFFECT = 1.63;

/** mulberry32: a small seeded generator; one fresh instance per gap */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const microF = (t: Totals) => (2 * t.tp + t.fp + t.fn ? (2 * t.tp) / (2 * t.tp + t.fp + t.fn) : 0);
export const sum = (prs: PrCounts[]): Totals => prs.reduce((s, p) => ({ tp: s.tp + p.tp, fp: s.fp + p.fp, fn: s.fn + p.fn }), { tp: 0, fp: 0, fn: 0 });

/** linear interpolation between order statistics (R type 7) */
export function quantile(sorted: Float64Array | number[], q: number): number {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

export interface Interval { observed: number; lo: number; hi: number; shareAbove0: number }
export interface Paired extends Interval { prs: number; dropped: number }

/** Pair two rows by PR key; refuse different PR sets; drop a PR that is JUDGE_FAILED on either side. */
export function pair(a: PrCounts[], b: PrCounts[]): { a: PrCounts[]; b: PrCounts[]; dropped: number } {
  const bm = new Map(b.map((p) => [p.key, p]));
  if (a.length !== b.length || a.some((p) => !bm.has(p.key)) || bm.size !== b.length || new Set(a.map((p) => p.key)).size !== a.length) throw new Error("the two rows do not cover the same pull requests");
  const keep = a.filter((p) => !p.judgeFailed && !bm.get(p.key)!.judgeFailed);
  return { a: keep, b: keep.map((p) => bm.get(p.key)!), dropped: a.length - keep.length };
}

/** Primary: resample PRs with replacement, the same draws for both rows; F(a) − F(b). */
export function pairedBootstrap(rowA: PrCounts[], rowB: PrCounts[], resamples = PRIMARY_RESAMPLES, seed = SEED): Paired {
  const { a, b, dropped } = pair(rowA, rowB);
  const n = a.length;
  if (!n) throw new Error("no pull requests left to resample");
  const next = rng(seed);
  const diffs = new Float64Array(resamples);
  let above = 0;
  for (let r = 0; r < resamples; r++) {
    let atp = 0, afp = 0, afn = 0, btp = 0, bfp = 0, bfn = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(next() * n);
      atp += a[j]!.tp; afp += a[j]!.fp; afn += a[j]!.fn;
      btp += b[j]!.tp; bfp += b[j]!.fp; bfn += b[j]!.fn;
    }
    const d = microF({ tp: atp, fp: afp, fn: afn }) - microF({ tp: btp, fp: bfp, fn: bfn });
    diffs[r] = d;
    if (d > 0) above++;
  }
  diffs.sort();
  return { observed: microF(sum(a)) - microF(sum(b)), lo: quantile(diffs, 0.025), hi: quantile(diffs, 0.975), shareAbove0: above / resamples, prs: n, dropped };
}

export interface Comment extends Interval { inflatedLo: number; inflatedHi: number }

/** One multinomial draw of a reviewer's TP / FP / FN events at its observed shares. */
function drawF(t: Totals, next: () => number): number {
  const n = t.tp + t.fp + t.fn;
  let tp = 0, fp = 0;
  for (let i = 0; i < n; i++) {
    const u = next() * n;
    if (u < t.tp) tp++;
    else if (u < t.tp + t.fp) fp++;
  }
  return microF({ tp, fp, fn: n - tp - fp });
}

/** Secondary: the audit's comment-level bootstrap (independent multinomials) plus the design-effect inflation. */
export function commentBootstrap(a: Totals, b: Totals, draws = SECONDARY_DRAWS, seed = SEED, deff = DESIGN_EFFECT): Comment {
  const next = rng(seed);
  const diffs = new Float64Array(draws);
  let above = 0, s = 0, s2 = 0;
  for (let r = 0; r < draws; r++) {
    const d = drawF(a, next) - drawF(b, next);
    diffs[r] = d;
    s += d; s2 += d * d;
    if (d > 0) above++;
  }
  diffs.sort();
  const mean = s / draws;
  const sd = Math.sqrt(Math.max(0, s2 / draws - mean * mean));
  const half = 1.96 * sd * Math.sqrt(deff);
  return { observed: microF(a) - microF(b), lo: quantile(diffs, 0.025), hi: quantile(diffs, 0.975), shareAbove0: above / draws, inflatedLo: mean - half, inflatedHi: mean + half };
}

/** The wording rule of the plan, applied to the primary interval only. */
export function sentence(other: string, iv: Interval): string {
  if (iv.lo > 0) return `ahead of ${other}`;
  if (iv.hi < 0) return `behind ${other}`;
  return `statistically tied with ${other}`;
}

// ---- inputs ----

export const TOOLS = ["augment", "cursor", "greptile", "copilot", "coderabbit"] as const;
export const DEV = ["discourse", "grafana", "keycloak", "sentry"] as const;
export type Judge = "v1" | "x1";

/** Per-PR counts and status of one score detail file; nothing else is kept. */
export function readDetail(file: string, repo: string): PrCounts[] {
  const j = JSON.parse(readFileSync(file, "utf8")) as { detail: { goldenIndex: number; status: string; counts: Totals }[] };
  return j.detail.map((d) => ({ key: `${repo}#${d.goldenIndex}`, tp: d.counts.tp, fp: d.counts.fp, fn: d.counts.fn, judgeFailed: d.status !== "SCORED" }));
}

const CAL = "cal_dot_com";
const RUN4 = "test/run-4-nvidia-nemotron-3-5-super-vl";
const DEV_V2: Record<string, string> = { "7r": "reviews/dev-repeat/run-7-nvidia-nemotron-3-5-super-vlr", "8": "reviews/dev-repeat/run-8-nvidia-nemotron-3-5-super-vl" };

export function rows(bench: string, judge: Judge) {
  const devRun1 = (label: string, repo: string) => join(bench, judge === "v1" ? "scores" : "scores/judge-x1", `${label}-${repo}.detail.json`);
  const run1 = (label: string) => join(bench, "test/run-1/scores", `judge-${judge}`, `${label}-${CAL}.detail.json`);
  const v2Dev = (run: string) => DEV.flatMap((r) => readDetail(join(bench, DEV_V2[run]!, "scores", `judge-${judge}`, `pool-verify-v1-${r}.detail.json`), r));
  const v2Cal = readDetail(join(bench, RUN4, "scores", `judge-${judge}`, `pool-verify-v1-${CAL}.detail.json`), CAL);
  const others: { name: string; cal: PrCounts[]; dev: PrCounts[] }[] = [
    ...TOOLS.map((t) => ({ name: t, cal: readDetail(run1(t), CAL), dev: DEV.flatMap((r) => readDetail(devRun1(t, r), r)) })),
    { name: "3 Super pool-verify-v1", cal: readDetail(run1("pool-verify-v1"), CAL), dev: DEV.flatMap((r) => readDetail(devRun1("pool-verify-v1-super", r), r)) },
  ];
  return { v2Cal, v2Dev7r: v2Dev("7r"), v2Dev8: v2Dev("8"), others };
}

// ---- reproduction check of the audit's published 3 Super numbers (audit-cc01.md §3.2 (b)) ----

/** [tool, judge, comment-level lo, hi, inflated lo, hi (null = not published), share > 0 (null = not published)] */
export const AUDIT_PUBLISHED: [string, Judge, number, number, number | null, number | null, number | null][] = [
  ["augment", "v1", -38.1, 8.4, -44.0, 14.3, 0.10],
  ["cursor", "v1", -32.3, 16.1, -39.2, 22.5, 0.24],
  ["greptile", "v1", -17.0, 33.9, -24.0, 40.7, 0.74],
  ["copilot", "v1", -11.1, 33.6, -16.6, 40.9, 0.86],
  ["coderabbit", "v1", -3.0, 45.6, -9.1, 52.3, 0.96],
  ["greptile", "x1", -21.7, 28.9, null, null, null],
  ["copilot", "x1", -15.7, 29.4, null, null, null],
];

const pts = (x: number) => Math.round(1000 * x) / 10;

export function reproduce(bench: string) {
  const lines = AUDIT_PUBLISHED.map(([tool, judge, lo, hi, ilo, ihi, share]) => {
    const base = join(bench, "test/run-1/scores", `judge-${judge}`);
    const th = sum(readDetail(join(base, `pool-verify-v1-${CAL}.detail.json`), CAL));
    const other = sum(readDetail(join(base, `${tool}-${CAL}.detail.json`), CAL));
    const got = commentBootstrap(th, other);
    const pairs: [number, number][] = [[lo, pts(got.lo)], [hi, pts(got.hi)]];
    if (ilo !== null && ihi !== null) pairs.push([ilo, pts(got.inflatedLo)], [ihi, pts(got.inflatedHi)]);
    const maxDiff = Math.max(...pairs.map(([p, g]) => Math.abs(p - g)));
    return { tool, judge, published: { lo, hi, inflatedLo: ilo, inflatedHi: ihi, share }, got: { lo: pts(got.lo), hi: pts(got.hi), inflatedLo: pts(got.inflatedLo), inflatedHi: pts(got.inflatedHi), share: Math.round(100 * got.shareAbove0) / 100 }, maxDiff: Math.round(10 * maxDiff) / 10 };
  });
  return { ok: lines.every((l) => l.maxDiff <= 0.1 + 1e-9), lines };
}

// ---- the run ----

export function compute(bench: string) {
  const check = reproduce(bench);
  const gaps: Record<string, unknown>[] = [];
  const sensitivity: Record<string, unknown>[] = [];
  const rank: Record<string, unknown>[] = [];
  for (const judge of ["v1", "x1"] as const) {
    const r = rows(bench, judge);
    const all50 = [...r.v2Dev7r, ...r.v2Cal];
    rank.push({ judge, reviewer: "TraceHound v2", ...sum(all50), f: microF(sum(all50)) });
    for (const o of r.others) {
      const oAll = [...o.dev, ...o.cal];
      rank.push({ judge, reviewer: o.name, ...sum(oAll), f: microF(sum(oAll)) });
      for (const [set, a, b] of [["Cal.com", r.v2Cal, o.cal], ["all 50", all50, oAll]] as const) {
        const primary = pairedBootstrap(a, b);
        const secondary = check.ok ? commentBootstrap(sum(a), sum(b)) : null;
        gaps.push({ set, judge, other: o.name, a: sum(a), b: sum(b), primary, secondary, sentence: sentence(o.name, primary) });
      }
      sensitivity.push({ judge, other: o.name, primary: pairedBootstrap([...r.v2Dev8, ...r.v2Cal], oAll) });
    }
  }
  return { check, gaps, sensitivity, rank };
}

const p1 = (x: number) => (100 * x).toFixed(1);
const signed = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + p1(Math.abs(x));
const iv = (lo: number, hi: number) => `[${signed(lo)}, ${signed(hi)}]`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { bench: { type: "string", default: join(homedir(), "Projects/tracehound-bench") }, json: { type: "boolean", default: false } } });
  const out = compute(values.bench!);
  if (values.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`reproduction check (secondary method): ${out.check.ok ? "reproduced" : "NOT reproduced"}`);
    for (const l of out.check.lines) console.log(`  ${l.judge} ${l.tool}: published ${JSON.stringify(l.published)} got ${JSON.stringify(l.got)} max |diff| ${l.maxDiff}`);
    console.log("\n| set | judge | TraceHound v2 − | TP/FP/FN (v2) | TP/FP/FN (other) | observed | primary 95% | share > 0 | PRs (dropped) | secondary comment-level 95% | secondary inflated 95% | sentence |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const g of out.gaps as any[]) {
      const s = g.secondary ? [iv(g.secondary.lo, g.secondary.hi), iv(g.secondary.inflatedLo, g.secondary.inflatedHi)] : ["not reproduced", "not reproduced"];
      console.log(`| ${g.set} | ${g.judge} | ${g.other} | ${g.a.tp}/${g.a.fp}/${g.a.fn} | ${g.b.tp}/${g.b.fp}/${g.b.fn} | ${signed(g.primary.observed)} | ${iv(g.primary.lo, g.primary.hi)} | ${g.primary.shareAbove0.toFixed(3)} | ${g.primary.prs} (${g.primary.dropped}) | ${s[0]} | ${s[1]} | ${g.sentence} |`);
    }
    console.log("\nsensitivity (report only): all 50 with dev run 8 instead of 7r");
    for (const s of out.sensitivity as any[]) console.log(`  ${s.judge} ${s.other}: observed ${signed(s.primary.observed)} primary ${iv(s.primary.lo, s.primary.hi)} share > 0 ${s.primary.shareAbove0.toFixed(3)} (${s.primary.dropped} dropped)`);
    console.log("\nall-50 rows");
    for (const r of out.rank as any[]) console.log(`  ${r.judge} ${r.reviewer}: TP ${r.tp} FP ${r.fp} FN ${r.fn} F ${p1(r.f)}%`);
  }
}
