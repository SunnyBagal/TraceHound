// recall-v3's reduce (decision 070, P009 "What v3 is" 7), deterministic and never throwing: drop
// paths missing at the head, a null line → the file's first changed line, clamp ranges to the file,
// merge duplicates (same file, overlapping lines, similar text), cap at MAX_RECALL_FINDINGS. Input
// order is kept (lens A, lens B, missed), so the cap cuts the missed pass first.
import type { DiffFile } from "../diff.ts";

export const MAX_RECALL_FINDINGS = 60;
/** Word-set Jaccard at or above this, on overlapping lines of one file, is a duplicate. */
export const SIMILAR_TEXT = 0.5;

export const PRODUCERS = ["lensA", "lensB", "missed"] as const;
export type Producer = (typeof PRODUCERS)[number];

export interface RawRecallFinding {
  producer: Producer;
  path: unknown;
  start_line?: unknown;
  end_line?: unknown;
  body: unknown;
}

export interface RecallFinding {
  path: string;
  /** = start_line, for the neutral review format (decision 054) */
  line: number;
  start_line: number;
  end_line: number;
  body: string;
  producer: Producer;
}

export interface ReduceCounts {
  input: number;
  malformed: number;
  pathMissing: number;
  anchored: number;
  clamped: number;
  merged: number;
  capped: number;
  errors: number;
}

export interface HeadFiles {
  /** file text at the head, or null when the path does not exist there */
  show(path: string): string | null;
}

const cleanPath = (p: string) => p.trim().replace(/^(?:\.?\/)+/, "");

const toLine = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 1 ? n : null;
};

/** First added line of a file in the diff, else its first hunk's start; 1 without hunks. */
export function firstChangedLine(file: DiffFile | undefined): number {
  if (!file?.hunks.length) return 1;
  for (const h of file.hunks) {
    let n = h.newStart;
    for (const line of h.text.split("\n").slice(1)) {
      if (line.startsWith("+")) return n;
      if (line.startsWith(" ") || line === "") n++;
    }
  }
  return Math.max(1, file.hunks[0]!.newStart);
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

const lineCount = (text: string) => (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n").length;

export function reduceFindings(raw: RawRecallFinding[], files: DiffFile[], head: HeadFiles, cap = MAX_RECALL_FINDINGS): { findings: RecallFinding[]; counts: ReduceCounts } {
  const counts: ReduceCounts = { input: raw.length, malformed: 0, pathMissing: 0, anchored: 0, clamped: 0, merged: 0, capped: 0, errors: 0 };
  const byPath = new Map(files.filter((f) => f.newPath !== null).map((f) => [f.path, f]));
  const lengths = new Map<string, number | null>();
  const length = (p: string) => {
    if (!lengths.has(p)) {
      let text: string | null = null;
      try {
        text = head.show(p);
      } catch {
        text = null;
      }
      lengths.set(p, text === null ? null : lineCount(text));
    }
    return lengths.get(p)!;
  };
  const kept: RecallFinding[] = [];
  for (const f of raw) {
    try {
      if (!f || typeof f.path !== "string" || typeof f.body !== "string" || !cleanPath(f.path) || !f.body.trim()) {
        counts.malformed++;
        continue;
      }
      const candidates = [cleanPath(f.path), cleanPath(f.path).replace(/^[ab]\//, "")];
      const path = candidates.find((p) => byPath.has(p)) ?? candidates.find((p) => length(p) !== null);
      if (path === undefined) {
        counts.pathMissing++;
        continue;
      }
      let start = toLine(f.start_line);
      let end = toLine(f.end_line);
      if (start === null && end === null) {
        start = end = firstChangedLine(byPath.get(path));
        counts.anchored++;
      }
      start ??= end!;
      end ??= start;
      if (end < start) [start, end] = [end, start];
      const n = length(path) ?? Math.max(start, end);
      if (start > n || end > n) {
        start = Math.min(start, n);
        end = Math.min(end, n);
        counts.clamped++;
      }
      const finding: RecallFinding = { path, line: start, start_line: start, end_line: end, body: f.body.trim(), producer: f.producer };
      if (kept.some((k) => k.path === path && k.start_line <= end && start <= k.end_line && similarity(k.body, finding.body) >= SIMILAR_TEXT)) {
        counts.merged++;
        continue;
      }
      kept.push(finding);
    } catch {
      counts.errors++;
    }
  }
  counts.capped = Math.max(0, kept.length - cap);
  return { findings: kept.slice(0, cap), counts };
}
