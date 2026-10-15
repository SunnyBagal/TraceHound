// Repository context for one review chunk, review-ctx-v1 (decision 057). Deterministic, no model,
// language-agnostic: it reads a git repository (a bare clone is enough) at the pull request's head
// commit and returns a text block plus a record of what went in and what was cut.
//   a. Changed files: each changed file of the chunk at the head, with new-version line numbers. A
//      file over FILE_FULL_LIMIT_CHARS is cut to windows of WINDOW_LINES either side of each of the
//      chunk's hunks, merged where they overlap. Deleted files are skipped.
//   b. Changed names: see names.ts.
//   c. References: per changed name, whole-word fixed-string matches (`git grep -n -w -F`) at the
//      head outside the chunk's changed files, ordered test files last, then path, then line; at
//      most REFS_PER_NAME per name and REFS_PER_CHUNK per chunk (a line already shown for an earlier
//      name is skipped), each with REF_CONTEXT_LINES either side.
//   d. Budget: the whole block is at most CONTEXT_BUDGET_CHARS. When over: drop references, last
//      first; then cut changed files to their hunk windows, last file first; then drop changed
//      files, last first.
import { execFileSync } from "node:child_process";
import { cleanGitEnv } from "../git-env.ts";
import { parseDiff, type DiffFile } from "./diff.ts";
import { changedNames } from "./names.ts";

export const FILE_FULL_LIMIT_CHARS = 12_000;
export const WINDOW_LINES = 60;
export const REFS_PER_NAME = 8;
export const REFS_PER_CHUNK = 30;
export const REF_CONTEXT_LINES = 3;
export const CONTEXT_BUDGET_CHARS = 40_000;
/** A shown line longer than this (minified code, data) is cut, with a marker. */
export const MAX_LINE_CHARS = 300;

export const CONTEXT_OPEN = "<<<REPOSITORY CONTEXT";
export const CONTEXT_CLOSE = "REPOSITORY CONTEXT>>>";

/** Test files: a `test`, `tests`, `__tests__`, `spec` or `specs` directory, or a test-named file. */
const TEST_DIR = /(^|\/)(test|tests|__tests__|spec|specs|testing)\//i;
const TEST_FILE = /(^|\/)(test_[^/]*\.py|[^/]*_test\.(py|go|rb)|[^/]*_spec\.rb|[^/]*Tests?\.(java|kt)|[^/]*\.(test|spec)\.[cm]?[jt]sx?)$/;
export const isTestPath = (p: string) => TEST_DIR.test(p) || TEST_FILE.test(p);

export interface GitSource {
  /** file text at the head, or null when the path does not exist there */
  show(path: string): string | null;
  /** whole-word fixed-string matches at the head outside `exclude`: [path, line] */
  grep(name: string, exclude: string[]): [string, number][];
}

/** A GitSource over a repository directory (bare or not) at one commit. */
export function gitSource(gitDir: string, head: string): GitSource {
  const files = new Map<string, string | null>();
  const git = (args: string[]) => execFileSync("git", ["-C", gitDir, ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, env: cleanGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
  return {
    show(path) {
      if (!files.has(path)) {
        let text: string | null;
        try {
          text = git(["show", `${head}:${path}`]);
        } catch {
          text = null;
        }
        files.set(path, text);
      }
      return files.get(path)!;
    },
    grep(name, exclude) {
      let out: string;
      try {
        out = git(["grep", "-n", "-w", "-F", "-I", "-z", "--no-color", "-e", name, head, "--", ".", ...exclude.map((p) => `:(exclude,literal)${p}`)]);
      } catch (err) {
        if ((err as { status?: number }).status === 1) return []; // no match
        throw err;
      }
      const matches: [string, number][] = [];
      for (const rec of out.split("\n")) {
        if (!rec) continue;
        // <rev>:<path>\0<line>\0<text>
        const [revPath, line] = rec.split("\0");
        if (revPath === undefined || line === undefined) continue;
        matches.push([revPath.slice(head.length + 1), Number(line)]);
      }
      return matches;
    },
  };
}

export interface FileEntry {
  path: string;
  /** full: whole file · windows: over the size limit, cut to hunk windows · cut-to-windows: cut by the budget · dropped: removed by the budget · deleted · missing: not at the head */
  status: "full" | "windows" | "cut-to-windows" | "dropped" | "deleted" | "missing";
  fileChars: number;
  shownChars: number;
}

export interface ContextRecord {
  chars: number;
  files: FileEntry[];
  names: string[];
  references: { matches: number; selected: number; shown: number; droppedForBudget: number; perName: Record<string, number> };
  cut: { references: number; filesToWindows: number; filesDropped: number };
}

export interface ChunkContext {
  text: string;
  record: ContextRecord;
}

const cutLine = (s: string) => (s.length > MAX_LINE_CHARS ? `${s.slice(0, MAX_LINE_CHARS)} [line cut]` : s);
const numbered = (n: number, s: string) => `${String(n).padStart(6)}  ${cutLine(s)}`;

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Merged 1-based inclusive line ranges, WINDOW_LINES either side of each hunk's new range. */
export function hunkWindows(file: DiffFile, lineCount: number): [number, number][] {
  const raw = file.hunks
    .map((h): [number, number] => [Math.max(1, h.newStart - WINDOW_LINES), Math.min(lineCount, h.newStart + Math.max(h.newCount, 1) - 1 + WINDOW_LINES)])
    .filter(([a, b]) => a <= b)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

function renderFull(path: string, lines: string[]): string {
  return [`## Changed file ${path} (whole file, ${lines.length} lines)`, ...lines.map((l, i) => numbered(i + 1, l))].join("\n") + "\n";
}

function renderWindows(path: string, lines: string[], windows: [number, number][]): string {
  const out = [`## Changed file ${path} (lines around the changes; ${lines.length} lines in the file)`];
  let next = 1;
  for (const [a, b] of windows) {
    if (a > next) out.push(`        [lines ${next}-${a - 1} not shown]`);
    for (let n = a; n <= b; n++) out.push(numbered(n, lines[n - 1]!));
    next = b + 1;
  }
  if (next <= lines.length) out.push(`        [lines ${next}-${lines.length} not shown]`);
  return out.join("\n") + "\n";
}

interface Ref {
  name: string;
  path: string;
  line: number;
  text: string;
}

function renderRef(r: Ref, lines: string[]): string {
  const a = Math.max(1, r.line - REF_CONTEXT_LINES);
  const b = Math.min(lines.length, r.line + REF_CONTEXT_LINES);
  const out = [`### ${r.path}:${r.line}`];
  for (let n = a; n <= b; n++) out.push(numbered(n, lines[n - 1]!));
  return out.join("\n") + "\n";
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The context block for one chunk (its diff text, as review-diff-v1 sends it). Same source and
 * chunk → the same text, byte for byte.
 */
export function buildChunkContext(src: GitSource, chunkText: string, budget = CONTEXT_BUDGET_CHARS): ChunkContext {
  // a file cut across chunks appears once per chunk; within a chunk, merge its pieces
  const files: DiffFile[] = [];
  for (const f of parseDiff(chunkText)) {
    const same = files.find((g) => g.path === f.path && g.newPath === f.newPath);
    if (same) same.hunks.push(...f.hunks);
    else files.push({ ...f, hunks: [...f.hunks] });
  }
  const chunkPaths = files.map((f) => f.path);

  // a. changed files
  interface FileSection {
    entry: FileEntry;
    lines: string[];
    windows: [number, number][];
    text: string;
  }
  const sections: FileSection[] = [];
  const entries: FileEntry[] = [];
  for (const f of files) {
    if (f.newPath === null) {
      entries.push({ path: f.path, status: "deleted", fileChars: 0, shownChars: 0 });
      continue;
    }
    const content = src.show(f.newPath);
    if (content === null) {
      entries.push({ path: f.path, status: "missing", fileChars: 0, shownChars: 0 });
      continue;
    }
    const lines = splitLines(content);
    const windows = hunkWindows(f, lines.length);
    const full = content.length <= FILE_FULL_LIMIT_CHARS;
    const text = full ? renderFull(f.path, lines) : renderWindows(f.path, lines, windows);
    const entry: FileEntry = { path: f.path, status: full ? "full" : "windows", fileChars: content.length, shownChars: text.length };
    entries.push(entry);
    sections.push({ entry, lines, windows, text });
  }

  // b. changed names, per file in chunk order
  const names: string[] = [];
  for (const f of files) for (const n of changedNames(f.path, f.hunks.map((h) => h.text))) if (!names.includes(n)) names.push(n);

  // c. references
  const refs: Ref[] = [];
  const seen = new Set<string>();
  const perName: Record<string, number> = {};
  let matches = 0;
  for (const name of names) {
    const found = src
      .grep(name, chunkPaths)
      .filter(([p]) => !chunkPaths.includes(p))
      .sort((x, y) => Number(isTestPath(x[0])) - Number(isTestPath(y[0])) || byPath(x[0], y[0]) || x[1] - y[1]);
    matches += found.length;
    let taken = 0;
    for (const [path, line] of found) {
      if (taken >= REFS_PER_NAME || refs.length >= REFS_PER_CHUNK) break;
      const key = `${path}:${line}`;
      if (seen.has(key)) continue;
      const content = src.show(path);
      if (content === null) continue;
      const lines = splitLines(content);
      seen.add(key);
      refs.push({ name, path, line, text: renderRef({ name, path, line, text: "" }, lines) });
      taken++;
    }
    perName[name] = taken;
    if (refs.length >= REFS_PER_CHUNK) break;
  }
  const selected = refs.length;

  // d. render and fit the budget
  const render = (): string => {
    const parts = [`${CONTEXT_OPEN}\n`];
    for (const s of sections) if (s.entry.status !== "dropped") parts.push(s.text);
    let current: string | null = null;
    for (const r of refs) {
      if (r.name !== current) {
        parts.push(`## Lines outside the changed files that mention ${r.name}\n`);
        current = r.name;
      }
      parts.push(r.text);
    }
    parts.push(`${CONTEXT_CLOSE}\n`);
    return parts.join("");
  };
  const cut = { references: 0, filesToWindows: 0, filesDropped: 0 };
  let text = render();
  while (text.length > budget && refs.length) {
    refs.pop();
    cut.references++;
    text = render();
  }
  for (let i = sections.length - 1; i >= 0 && text.length > budget; i--) {
    const s = sections[i]!;
    if (s.entry.status !== "full") continue;
    s.text = renderWindows(s.entry.path, s.lines, s.windows);
    s.entry.status = "cut-to-windows";
    s.entry.shownChars = s.text.length;
    cut.filesToWindows++;
    text = render();
  }
  for (let i = sections.length - 1; i >= 0 && text.length > budget; i--) {
    const s = sections[i]!;
    s.entry.status = "dropped";
    s.entry.shownChars = 0;
    cut.filesDropped++;
    text = render();
  }

  return {
    text,
    record: {
      chars: text.length,
      files: entries,
      names,
      references: { matches, selected, shown: refs.length, droppedForBudget: cut.references, perName },
      cut,
    },
  };
}
