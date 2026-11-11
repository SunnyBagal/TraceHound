/**
 * Shared pieces of the Track B scoring kit (B2; protocol docs/eval/ts-protocol.md, decision 076): the side guard,
 * file readers, the golden format, the location-hit rule, Wilson intervals (no continuity correction), the exact
 * two-sided sign test, a seeded shuffle and sha256. No model, no network. Node >= 24 type stripping.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export class RefusalError extends Error {}

export type Side = "dev" | "heldout";

/**
 * Every kit command names its side. Held-out needs `--heldout-ok` as well (artu1 and bunny never pass it); on the dev
 * side, any input or output path with a `heldout` segment is refused, so a dev command cannot read held-out by accident.
 */
export function checkSide(side: string | undefined, heldoutOk: boolean, paths: (string | undefined)[]): Side {
  if (side !== "dev" && side !== "heldout") throw new RefusalError("--side dev|heldout is required");
  if (side === "heldout" && !heldoutOk) throw new RefusalError("--side heldout needs --heldout-ok (never passed by tuning agents)");
  if (side === "dev") {
    for (const p of paths) {
      if (p && path.resolve(p).split(path.sep).some((s) => /^heldout$/i.test(s))) throw new RefusalError(`--side dev refuses a held-out path: ${p}`);
    }
  }
  return side;
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
export const readJsonl = (file: string): Record<string, unknown>[] =>
  fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);

/** Write a new file; never overwrite (the kit's outputs are evidence). */
export function writeNew(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { flag: "wx" });
}

/** `name=value` pairs from repeated flags (`--tool tracehound=dir`). */
export function pairs(values: string[] | undefined, flag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of values ?? []) {
    const i = v.indexOf("=");
    if (i <= 0 || i === v.length - 1) throw new RefusalError(`${flag} must be name=path, got ${JSON.stringify(v)}`);
    const name = v.slice(0, i);
    if (out.has(name)) throw new RefusalError(`${flag} names ${name} twice`);
    out.set(name, v.slice(i + 1));
  }
  return out;
}

// ---- goldens ---------------------------------------------------------------------------------------------------

export interface Target { file: string; lines: [number, number]; role: "primary" | "alternate" }
export interface GoldenCase {
  case: string;
  pr_title: string;
  label: "bug" | "clean";
  /** bug cases: the starting fix and the introducing commit of the one scored defect */
  fix_sha?: string;
  introducing_sha?: string;
  /** bug cases: the primary row first, then alternates; a comment matching any of them catches the bug once */
  targets: Target[];
  description?: string;
}
export interface Goldens { v: 1; side: Side; cases: GoldenCase[] }

export function readGoldens(file: string): Goldens {
  const g = readJson(file) as Goldens;
  if (!g || g.v !== 1 || !Array.isArray(g.cases)) throw new RefusalError(`${file} is not a goldens file (v1)`);
  for (const c of g.cases) {
    if (c.label === "bug" && (!c.targets.length || c.targets[0]!.role !== "primary" || c.targets.filter((t) => t.role === "primary").length !== 1)) {
      throw new RefusalError(`${c.case}: a bug case needs exactly one primary target, first`);
    }
    if (c.label === "clean" && c.targets.length) throw new RefusalError(`${c.case}: a clean case has no targets`);
  }
  return g;
}

// ---- reviews ---------------------------------------------------------------------------------------------------

export interface Comment { path: string; line: number | null; body: string }
export interface Review { pr_title: string; pr_number?: number; comments: Comment[] }

/** A tool's neutral review files (decision 054 format), by case id: `<dir>/<case>.json`. */
export function readReviews(dir: string, cases: string[]): Map<string, Review> {
  const out = new Map<string, Review>();
  for (const id of cases) {
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) continue;
    const r = readJson(file) as Review;
    if (!r || typeof r.pr_title !== "string" || !Array.isArray(r.comments)) throw new RefusalError(`${file} is not a review file`);
    out.set(id, r);
  }
  return out;
}

// ---- rules -----------------------------------------------------------------------------------------------------

export const LOCATION_LINES = 10;

/** Location hit (protocol §4): a comment on a target's file within ±10 lines of its inclusive range; null lines never hit. */
export function commentHits(c: Comment, targets: Target[]): boolean {
  return c.line !== null && targets.some((t) => t.file === c.path && c.line! >= t.lines[0] - LOCATION_LINES && c.line! <= t.lines[1] + LOCATION_LINES);
}
export const locationHit = (comments: Comment[], targets: Target[]) => comments.some((c) => commentHits(c, targets));

/** 95% Wilson score interval, no continuity correction. k of n; n = 0 gives null. */
export function wilson(k: number, n: number, z = 1.959963984540054): [number, number] | null {
  if (n === 0) return null;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z / den) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
/**
 * Exact two-sided sign test on discordant cases (exact McNemar, protocol §4): a caught only by A, b only by B,
 * p = min(1, 2·P[Binomial(a+b, ½) ≤ min(a, b)]); p = 1 when a + b = 0.
 */
export function signTest(a: number, b: number): number {
  const n = a + b;
  if (n === 0) return 1;
  let tail = 0;
  for (let i = 0; i <= Math.min(a, b); i++) tail += choose(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** mulberry32: a small seeded PRNG, so a shuffle is reproducible from its recorded seed. */
export function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
