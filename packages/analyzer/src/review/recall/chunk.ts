// recall-v3's prep (decision 070, P009 "What v3 is" 1), deterministic: parse the diff, drop
// lockfiles, generated, minified and binary files (and files with nothing to anchor at the head),
// pack per file into chunks of at most CHUNK_LIMIT_CHARS (about 8k diff tokens at 4 characters a
// token) split at hunk boundaries, and keep at most MAX_CHUNKS chunks, filled source > tests >
// config > docs. Every file that is left out is listed with its reason, never silently dropped.
import { isTestPath } from "../context.ts";
import type { DiffFile, Hunk } from "../diff.ts";

/** About 8k diff tokens (chars/4, the repo's token estimate). */
export const CHUNK_LIMIT_CHARS = 32_000;
export const MAX_CHUNKS = 8;
/** An added line this long is taken as minified or generated output. */
export const MINIFIED_LINE_CHARS = 2_000;

export const KINDS = ["source", "test", "config", "docs"] as const;
export type FileKind = (typeof KINDS)[number];
export type SkipReason = "lockfile" | "generated" | "minified" | "binary" | "deleted" | "no-hunks" | "chunk-cap";

export interface RecallChunk {
  /** diff text: per file its header, then its hunks; renderChunk numbers the new-side lines */
  text: string;
  files: string[];
  kinds: FileKind[];
}

export interface Prepared {
  chunks: RecallChunk[];
  /** files left out, or (chunk-cap) whose hunks were partly or wholly past MAX_CHUNKS */
  skipped: { path: string; reason: SkipReason }[];
  /** the files the chunks show, in priority order */
  reviewed: string[];
}

const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "Cargo.lock",
  "Gemfile.lock", "poetry.lock", "Pipfile.lock", "composer.lock", "go.sum", "mix.lock", "pubspec.lock", "Podfile.lock",
  "packages.lock.json", "flake.lock", "uv.lock", "gradle.lockfile",
]);
const GENERATED = [
  /(^|\/)(generated|__generated__)\//i, /\.(pb|pb\.gw)\.go$/, /_pb2(_grpc)?\.pyi?$/, /\.pb\.(cc|h|ts|js)$/, /\.(gen|generated)\.[a-z0-9]+$/i,
  /(^|\/)(dist|vendor|node_modules)\//, /\.snap$/, /\.map$/,
];
const MINIFIED = /\.min\.(js|css|mjs)$/i;
const DOCS = /(\.(md|mdx|markdown|rst|adoc|txt)$)|((^|\/)(docs?|documentation)\/)|(^|\/)(README|CHANGELOG|CHANGES|LICENSE|NOTICE)[^/]*$/i;
const CONFIG = /(\.(json|jsonc|ya?ml|toml|ini|cfg|conf|properties|xml|gradle|env|editorconfig|lock)$)|((^|\/)(Dockerfile|Makefile|Procfile|\.[a-z]+rc)[^/]*$)/i;

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** Why a file is left out before packing, or null when it is reviewed. */
export function skipReason(f: DiffFile): SkipReason | null {
  if (f.newPath === null) return "deleted";
  if (LOCKFILES.has(basename(f.path)) || /\.lock$/.test(f.path)) return "lockfile";
  if (/^(Binary files |GIT binary patch)/m.test(f.header)) return "binary";
  if (!f.hunks.length) return "no-hunks";
  if (GENERATED.some((r) => r.test(f.path)) || /@generated|DO NOT EDIT|auto-generated/i.test(f.hunks[0]!.text.slice(0, 2_000))) return "generated";
  if (MINIFIED.test(f.path) || f.hunks.some((h) => h.text.split("\n").some((l) => l.startsWith("+") && l.length > MINIFIED_LINE_CHARS))) return "minified";
  return null;
}

export function fileKind(path: string): FileKind {
  if (isTestPath(path)) return "test";
  if (DOCS.test(path)) return "docs";
  if (CONFIG.test(path)) return "config";
  return "source";
}

/**
 * A hunk over `limit` cut into consecutive hunks of whole lines, each with its own `@@` header, so a
 * piece's new-side numbers stay right and the cut is a hunk boundary.
 */
export function splitHunk(h: Hunk, oldStart: number, limit: number): Hunk[] {
  if (h.text.length <= limit) return [h];
  const lines = h.text.split("\n").slice(1);
  if (lines.at(-1) === "") lines.pop();
  const out: Hunk[] = [];
  let o = oldStart;
  let n = h.newStart;
  let body: string[] = [];
  let len = 0;
  let pieceOld = o;
  let pieceNew = n;
  let oc = 0;
  let nc = 0;
  const flush = () => {
    if (!body.length) return;
    const header = `@@ -${pieceOld},${oc} +${pieceNew},${nc} @@`;
    out.push({ text: `${header}\n${body.join("\n")}\n`, newStart: pieceNew, newCount: nc });
    body = [];
    len = 0;
    pieceOld = o;
    pieceNew = n;
    oc = 0;
    nc = 0;
  };
  for (const line of lines) {
    if (body.length && len + line.length + 1 > limit - 40) flush();
    body.push(line);
    len += line.length + 1;
    if (line.startsWith("+")) (n++, nc++);
    else if (line.startsWith("-")) (o++, oc++);
    else if (line.startsWith(" ") || line === "") (o++, n++, oc++, nc++);
  }
  flush();
  return out;
}

const oldStartOf = (h: Hunk) => Number(/^@@ -(\d+)/.exec(h.text)?.[1] ?? 1);

export function prepareChunks(files: DiffFile[], limit = CHUNK_LIMIT_CHARS, maxChunks = MAX_CHUNKS): Prepared {
  const skipped: Prepared["skipped"] = [];
  const kept: { file: DiffFile; kind: FileKind }[] = [];
  for (const f of files) {
    const why = skipReason(f);
    if (why) skipped.push({ path: f.path, reason: why });
    else kept.push({ file: f, kind: fileKind(f.path) });
  }
  // stable: diff order within a kind
  kept.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));

  const all: { text: string; files: string[]; kinds: FileKind[]; len: number }[] = [];
  let cur: (typeof all)[number] | null = null;
  const add = (path: string, kind: FileKind, text: string) => {
    if (cur && cur.len + text.length > limit) cur = null;
    if (!cur) all.push((cur = { text: "", files: [], kinds: [], len: 0 }));
    cur.text += text;
    cur.len += text.length;
    if (!cur.files.includes(path)) (cur.files.push(path), cur.kinds.push(kind));
  };
  for (const { file, kind } of kept) {
    if (file.text.length <= limit) {
      add(file.path, kind, file.text);
      continue;
    }
    // over the limit: pieces of whole hunks, each repeating the file's header
    let piece = "";
    const hunks = file.hunks.flatMap((h) => splitHunk(h, oldStartOf(h), limit - file.header.length));
    for (const h of hunks) {
      if (piece && file.header.length + piece.length + h.text.length > limit) {
        add(file.path, kind, file.header + piece);
        cur = null; // a piece fills its own chunk
        piece = "";
      }
      piece += h.text;
    }
    if (piece) add(file.path, kind, file.header + piece);
  }

  const chunks = all.slice(0, maxChunks).map(({ text, files: fs, kinds }) => ({ text, files: fs, kinds }));
  const shown = new Set(chunks.flatMap((c) => c.files));
  for (const c of all.slice(maxChunks)) for (const p of c.files) if (!skipped.some((s) => s.path === p && s.reason === "chunk-cap")) skipped.push({ path: p, reason: "chunk-cap" });
  return { chunks, skipped, reviewed: kept.map((k) => k.file.path).filter((p) => shown.has(p)) };
}
