// Repository context for one finding, verify-ctx-v1 (decision 058). Deterministic, no model: it
// reads a git repository (a bare clone is enough) at the pull request's head commit and returns a
// text block plus a record of what went in and what was cut.
//   a. Window: the finding's file at the head with new-version line numbers, WINDOW_LINES either
//      side of the finding's line, clipped to the file.
//   b. Diff: the finding's file's hunks only, rendered as review-diff-v1 renders them (renderChunk),
//      hunks nearest the finding's line taken first up to DIFF_LIMIT_CHARS, shown in file order.
//   c. Names: the nearest definition at or above the finding's line (names.ts patterns), then a name
//      defined on the line itself, then names called on it (`name(`); names.ts's length and
//      stoplist rule (keepName) applies to all of them.
//   d. References: per name, whole-word fixed-string matches at the head (context.ts's gitSource)
//      outside the finding's file, non-test files first, then path, then line; at most
//      REFS_PER_NAME per name and REFS_PER_FINDING per finding (a line already shown for an earlier
//      name is skipped), REF_CONTEXT_LINES either side, lines cut at MAX_LINE_CHARS.
//   e. Budget: the block is at most BUDGET_CHARS. When over: drop references, last first; then shrink
//      the window evenly, one line a side at a time, toward MIN_WINDOW_LINES either side; then drop
//      diff hunks, farthest from the finding's line first. The window at MIN_WINDOW_LINES is never
//      dropped.
import { CONTEXT_CLOSE, CONTEXT_OPEN, isTestPath, MAX_LINE_CHARS, REF_CONTEXT_LINES, type GitSource } from "./context.ts";
import { parseDiff, renderChunk, type DiffFile, type Hunk } from "./diff.ts";
import { definitionName, keepName, langOf } from "./names.ts";

export const WINDOW_LINES = 80;
export const MIN_WINDOW_LINES = 40;
export const DIFF_LIMIT_CHARS = 12_000;
export const REFS_PER_NAME = 6;
export const REFS_PER_FINDING = 15;
export const BUDGET_CHARS = 24_000;

/** A call on the finding's line: an identifier directly followed by `(`. */
const CALL = /([A-Za-z_$][\w$]*)\s*\(/g;

export interface FindingContextRecord {
  /** characters of the whole block, markers included */
  chars: number;
  window: { status: "shown" | "missing"; fileLines: number; anchor: number | null; from: number; to: number; radius: number; chars: number };
  diff: { status: "shown" | "missing"; hunks: number; selected: number; shown: number; omittedOverLimit: number; truncated: boolean; chars: number };
  names: { enclosing: string | null; defined: string | null; called: string[]; all: string[] };
  references: { matches: number; selected: number; shown: number; perName: Record<string, number>; chars: number };
  cut: { references: number; windowShrunk: boolean; windowLinesRemoved: number; hunksDropped: number; overBudget: boolean };
}

export interface FindingContext {
  text: string;
  record: FindingContextRecord;
}

const cutLine = (s: string) => (s.length > MAX_LINE_CHARS ? `${s.slice(0, MAX_LINE_CHARS)} [line cut]` : s);
const numbered = (n: number, s: string) => `${String(n).padStart(6)}  ${cutLine(s)}`;
const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** The finding's file in the diff, matched as verify-v1 matches it (exact, without `./`, without `a/` or `b/`). */
export function findDiffFile(files: DiffFile[], findingPath: string): DiffFile | null {
  const raw = findingPath.trim();
  const candidates = [raw, raw.replace(/^\.?\//, ""), raw.replace(/^[ab]\//, "")];
  for (const p of candidates) {
    const same = files.filter((f) => f.path === p);
    if (same.length) return { ...same[0]!, hunks: same.flatMap((f) => f.hunks) };
  }
  return null;
}

/** Lines between the finding's line and a hunk's new range; 0 when the line is inside it. */
export function hunkDistance(h: Hunk, line: number): number {
  const end = h.newStart + Math.max(h.newCount, 1) - 1;
  return line < h.newStart ? h.newStart - line : line > end ? line - end : 0;
}

/** Names for the finding's line: the enclosing definition, a name defined on the line, names called on it. */
export function findingNames(path: string, lines: string[], line: number): FindingContextRecord["names"] {
  const lang = langOf(path);
  let enclosing: string | null = null;
  for (let n = Math.min(line, lines.length); n >= 1; n--) {
    const def = definitionName(lines[n - 1]!, lang);
    if (def) {
      enclosing = keepName(def) ? def : null;
      break;
    }
  }
  const text = lines[line - 1] ?? "";
  const def = definitionName(text, lang);
  const defined = def && keepName(def) ? def : null;
  const called: string[] = [];
  for (const m of text.matchAll(CALL)) {
    const n = m[1]!;
    if (keepName(n) && n !== defined && !called.includes(n)) called.push(n);
  }
  const all: string[] = [];
  for (const n of [enclosing, defined, ...called]) if (n && !all.includes(n)) all.push(n);
  return { enclosing, defined, called, all };
}

interface Ref {
  name: string;
  text: string;
}

/**
 * The context block for one finding of a pull request (its diff text, as review-diff-v1 reads it).
 * Same source, diff and finding → the same text, byte for byte.
 */
export function buildFindingContext(src: GitSource, diff: string, finding: { path: string; line: number | null }, budget = BUDGET_CHARS): FindingContext {
  const file = findDiffFile(parseDiff(diff), finding.path);
  const path = file?.newPath ?? file?.path ?? finding.path.trim();
  const content = file?.newPath === null ? null : src.show(path);
  const lines = content === null ? [] : splitLines(content);
  // a finding without a line is anchored at its file's first hunk
  const anchor = finding.line ?? file?.hunks[0]?.newStart ?? null;

  // a. window
  let radius = WINDOW_LINES;
  const renderWindow = (): string => {
    if (content === null || anchor === null) return "";
    const from = Math.max(1, anchor - radius);
    const to = Math.min(lines.length, anchor + radius);
    const out = [`## ${path} at the pull request's head, lines ${from}-${to} of ${lines.length}`];
    for (let n = from; n <= to; n++) out.push(numbered(n, lines[n - 1]!));
    return out.join("\n") + "\n";
  };

  // b. diff hunks, nearest first up to the limit; a nearest hunk alone over the limit is cut at a line
  const hunks = file?.hunks ?? [];
  const order = hunks
    .map((h, i) => ({ h, i, d: anchor === null ? i : hunkDistance(h, anchor) }))
    .sort((x, y) => x.d - y.d || x.i - y.i);
  const renderHunks = (idx: number[]): string => (file && idx.length ? renderChunk(file.header + [...idx].sort((a, b) => a - b).map((i) => hunks[i]!.text).join("")) : "");
  let selected: number[] = []; // nearest first
  let truncated = false;
  let omittedOverLimit = 0;
  for (const o of order) {
    if (renderHunks([...selected, o.i]).length <= DIFF_LIMIT_CHARS) selected.push(o.i);
    else if (!selected.length) {
      selected.push(o.i);
      truncated = true;
    } else omittedOverLimit++;
    if (truncated) {
      omittedOverLimit += order.length - 1;
      break;
    }
  }
  const renderDiff = (): string => {
    if (!file || !selected.length) return "";
    let body = renderHunks(selected);
    if (truncated && body.length > DIFF_LIMIT_CHARS) body = body.slice(0, body.lastIndexOf("\n", DIFF_LIMIT_CHARS) + 1) + "[diff cut]\n";
    const which = selected.length < hunks.length ? `${selected.length} of ${hunks.length} hunks, those nearest the finding's line` : `${hunks.length} hunk${hunks.length === 1 ? "" : "s"}`;
    return `## Diff of ${path} (${which})\n${body}`;
  };

  // c. names
  const names = content !== null && anchor !== null ? findingNames(path, lines, anchor) : { enclosing: null, defined: null, called: [], all: [] };

  // d. references
  const refs: Ref[] = [];
  const seen = new Set<string>();
  const perName: Record<string, number> = {};
  let matches = 0;
  for (const name of names.all) {
    if (refs.length >= REFS_PER_FINDING) break;
    const found = src
      .grep(name, [path])
      .filter(([p]) => p !== path)
      .sort((x, y) => Number(isTestPath(x[0])) - Number(isTestPath(y[0])) || byPath(x[0], y[0]) || x[1] - y[1]);
    matches += found.length;
    let taken = 0;
    for (const [p, line] of found) {
      if (taken >= REFS_PER_NAME || refs.length >= REFS_PER_FINDING) break;
      const key = `${p}:${line}`;
      if (seen.has(key)) continue;
      const text = src.show(p);
      if (text === null) continue;
      const refLines = splitLines(text);
      seen.add(key);
      const a = Math.max(1, line - REF_CONTEXT_LINES);
      const b = Math.min(refLines.length, line + REF_CONTEXT_LINES);
      const out = [`### ${p}:${line}`];
      for (let n = a; n <= b; n++) out.push(numbered(n, refLines[n - 1]!));
      refs.push({ name, text: out.join("\n") + "\n" });
      taken++;
    }
    perName[name] = taken;
  }
  const selectedRefs = refs.length;
  const renderRefs = (): string => {
    const parts: string[] = [];
    let current: string | null = null;
    for (const r of refs) {
      if (r.name !== current) {
        parts.push(`## Lines outside ${path} that mention ${r.name}\n`);
        current = r.name;
      }
      parts.push(r.text);
    }
    return parts.join("");
  };

  // e. render and fit the budget
  const render = () => {
    const w = renderWindow();
    const d = renderDiff();
    const r = renderRefs();
    return { w, d, r, text: `${CONTEXT_OPEN}\n${w}${d}${r}${CONTEXT_CLOSE}\n` };
  };
  const cut = { references: 0, windowShrunk: false, windowLinesRemoved: 0, hunksDropped: 0, overBudget: false };
  let out = render();
  while (out.text.length > budget && refs.length) {
    refs.pop();
    cut.references++;
    out = render();
  }
  const fullWindow = out.w.split("\n").length;
  while (out.text.length > budget && radius > MIN_WINDOW_LINES) {
    radius--;
    cut.windowShrunk = true;
    out = render();
  }
  cut.windowLinesRemoved = cut.windowShrunk ? fullWindow - out.w.split("\n").length : 0;
  while (out.text.length > budget && selected.length) {
    selected = selected.slice(0, -1); // the farthest of those still shown
    cut.hunksDropped++;
    out = render();
  }
  cut.overBudget = out.text.length > budget;

  const shownRefs = refs.length;
  const perNameShown: Record<string, number> = {};
  for (const n of Object.keys(perName)) perNameShown[n] = refs.filter((r) => r.name === n).length;
  return {
    text: out.text,
    record: {
      chars: out.text.length,
      window:
        content === null || anchor === null
          ? { status: "missing", fileLines: 0, anchor, from: 0, to: 0, radius, chars: 0 }
          : { status: "shown", fileLines: lines.length, anchor, from: Math.max(1, anchor - radius), to: Math.min(lines.length, anchor + radius), radius, chars: out.w.length },
      diff: { status: file ? "shown" : "missing", hunks: hunks.length, selected: selected.length + cut.hunksDropped, shown: selected.length, omittedOverLimit, truncated, chars: out.d.length },
      names,
      references: { matches, selected: selectedRefs, shown: shownRefs, perName: perNameShown, chars: out.r.length },
      cut,
    },
  };
}
