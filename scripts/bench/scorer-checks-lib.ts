// Pure computations for the scorer checks (decision 060): deduplication of bench-judge-v1 FPs,
// Cohen's kappa, Kendall's tau-b, augmented precision with the partial-result rule. No I/O.
import type { FpItem, Verdict } from "../../packages/analyzer/src/bench/validity.ts";

export const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];

/** The dedup key: same pull request (repo + golden index), path, line and body. */
export const fpKey = (c: { repo: string; goldenIndex: number; path: string; line: number | null; body: string }) =>
  JSON.stringify([c.repo, c.goldenIndex, c.path, c.line, c.body]);

/** Identical comments (same pull request, path, line and body) become one item, in first-seen order; keys are stable ids. */
export function dedupFps(comments: { repo: string; goldenIndex: number; path: string; line: number | null; body: string }[]): FpItem[] {
  const seen = new Map<string, FpItem>();
  for (const c of comments) {
    const k = fpKey(c);
    if (!seen.has(k)) seen.set(k, { key: `fp${seen.size + 1}`, repo: c.repo, goldenIndex: c.goldenIndex, path: c.path, line: c.line, body: c.body });
  }
  return [...seen.values()];
}

/** Cohen's unweighted kappa over paired labels; p_e from each rater's marginal shares. null when undefined (no pairs, or p_e = 1). */
export function cohenKappa<T>(pairs: [T, T][]): { n: number; observed: number | null; expected: number | null; kappa: number | null } {
  const n = pairs.length;
  if (!n) return { n, observed: null, expected: null, kappa: null };
  const a = new Map<T, number>();
  const b = new Map<T, number>();
  let agree = 0;
  for (const [x, y] of pairs) {
    a.set(x, (a.get(x) ?? 0) + 1);
    b.set(y, (b.get(y) ?? 0) + 1);
    if (x === y) agree++;
  }
  const po = agree / n;
  let pe = 0;
  for (const [k, na] of a) pe += (na / n) * ((b.get(k) ?? 0) / n);
  return { n, observed: po, expected: pe, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}

/** Kendall's tau-b between two score lists over the same items (ties corrected). null when either list is all ties. */
export function kendallTauB(x: number[], y: number[]): number | null {
  if (x.length !== y.length) throw new Error("kendallTauB: lists differ in length");
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < x.length; i++)
    for (let j = i + 1; j < x.length; j++) {
      const dx = Math.sign(x[i]! - x[j]!);
      const dy = Math.sign(y[i]! - y[j]!);
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) tiesX++;
      else if (dy === 0) tiesY++;
      else if (dx === dy) concordant++;
      else discordant++;
    }
  const denom = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
  return denom === 0 ? null : (concordant - discordant) / denom;
}

export interface RunFps {
  run: string;
  tp: number;
  fp: number;
  /** dedup keys of the run's own v1-FP comments, one per comment (repeats allowed) */
  fpKeys: string[];
}

export type AugmentedResult =
  | { completed: false; done: { superJudged: number; qwenJudged: number; both: number; items: number } }
  | {
      completed: true;
      runs: { run: string; tp: number; fp: number; validSuper: number; validQwen: number; validBoth: number; apSuper: number | null; apQwen: number | null; apBoth: number | null }[];
    };

/**
 * Augmented precision per run: (TP + FPs judged valid) / (TP + FP) under each validity judge and
 * under "both say valid". The partial-result rule: unless every deduplicated FP has a verdict from
 * both judges, no run gets a number and only the counts done are returned.
 */
export function augmentedPrecision(items: string[], superV: Map<string, Verdict>, qwenV: Map<string, Verdict>, runs: RunFps[]): AugmentedResult {
  const superJudged = items.filter((k) => superV.has(k)).length;
  const qwenJudged = items.filter((k) => qwenV.has(k)).length;
  const both = items.filter((k) => superV.has(k) && qwenV.has(k)).length;
  if (both < items.length) return { completed: false, done: { superJudged, qwenJudged, both, items: items.length } };
  const ap = (tp: number, fp: number, valid: number) => (tp + fp ? (tp + valid) / (tp + fp) : null);
  return {
    completed: true,
    runs: runs.map((r) => {
      for (const k of r.fpKeys) if (!superV.has(k)) throw new Error(`${r.run}: FP key ${k} not in the deduplicated set`);
      if (r.fpKeys.length !== r.fp) throw new Error(`${r.run}: ${r.fpKeys.length} FP keys for FP count ${r.fp}`);
      const validSuper = r.fpKeys.filter((k) => superV.get(k) === "valid").length;
      const validQwen = r.fpKeys.filter((k) => qwenV.get(k) === "valid").length;
      const validBoth = r.fpKeys.filter((k) => superV.get(k) === "valid" && qwenV.get(k) === "valid").length;
      return { run: r.run, tp: r.tp, fp: r.fp, validSuper, validQwen, validBoth, apSuper: ap(r.tp, r.fp, validSuper), apQwen: ap(r.tp, r.fp, validQwen), apBoth: ap(r.tp, r.fp, validBoth) };
    }),
  };
}
