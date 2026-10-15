// Unified diff parsing, chunking and line rendering for the diff-only reviewer (decision 055).
// A file is the text from its `diff --git` line to the next one. Its lines in the new version are
// the added and context lines of its hunks; nothing else is a valid place for a comment.

export interface Hunk {
  /** the hunk's text, `@@` line first */
  text: string;
  newStart: number;
  newCount: number;
}

export interface DiffFile {
  /** path in the new version; for a deleted file, the old path */
  path: string;
  oldPath: string | null;
  newPath: string | null;
  /** the file's lines before its first hunk (`diff --git`, `index`, `---`, `+++`, ...) */
  header: string;
  hunks: Hunk[];
  /** header plus every hunk: the file's text in the diff */
  text: string;
}

export interface Chunk {
  /** diff text of the chunk */
  text: string;
  /** paths of the files in it (a file cut at hunk boundaries is in several chunks) */
  files: string[];
  /** true when a single hunk alone is over the limit and could not be cut further */
  overLimit: boolean;
}

/** The whole diff is one chunk when it fits; otherwise files are packed, and a file over the limit is cut at hunk boundaries. */
export const CHUNK_LIMIT_CHARS = 60_000;

function unquote(p: string): string {
  if (!p.startsWith('"')) return p;
  try {
    return JSON.parse(p) as string;
  } catch {
    return p.slice(1, -1);
  }
}

/** `--- a/x` / `+++ b/x` / `/dev/null` → path without its a/ or b/ prefix, or null. */
function sidePath(line: string): string | null {
  const raw = unquote(line.slice(4).replace(/\t.*$/, "").trim());
  if (raw === "/dev/null") return null;
  return raw.replace(/^[ab]\//, "");
}

export function parseDiff(diff: string): DiffFile[] {
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const files: DiffFile[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("diff --git ")) i++;
  while (i < lines.length) {
    const start = i;
    i++;
    while (i < lines.length && !lines[i]!.startsWith("diff --git ") && !lines[i]!.startsWith("@@")) i++;
    const headerLines = lines.slice(start, i);
    let oldPath: string | null = null;
    let newPath: string | null = null;
    let sawMinus = false;
    let sawPlus = false;
    for (const h of headerLines) {
      if (h.startsWith("--- ")) (oldPath = sidePath(h)), (sawMinus = true);
      else if (h.startsWith("+++ ")) (newPath = sidePath(h)), (sawPlus = true);
      else if (h.startsWith("rename from ")) oldPath = h.slice("rename from ".length);
      else if (h.startsWith("rename to ")) newPath = h.slice("rename to ".length);
    }
    if (!sawMinus && !sawPlus) {
      // no ---/+++ (binary, mode-only or pure rename): take the paths from `diff --git a/x b/y`
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(headerLines[0]!);
      if (m) {
        oldPath ??= m[1]!;
        newPath ??= headerLines.some((h) => h.startsWith("deleted file mode")) ? null : m[2]!;
        if (headerLines.some((h) => h.startsWith("new file mode"))) oldPath = null;
      }
    }
    const hunks: Hunk[] = [];
    while (i < lines.length && lines[i]!.startsWith("@@")) {
      const hStart = i;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]!);
      i++;
      while (i < lines.length && !lines[i]!.startsWith("@@") && !lines[i]!.startsWith("diff --git ")) i++;
      hunks.push({ text: lines.slice(hStart, i).join("\n") + "\n", newStart: m ? Number(m[1]) : 0, newCount: m ? (m[2] === undefined ? 1 : Number(m[2])) : 0 });
    }
    const header = headerLines.join("\n") + "\n";
    files.push({ path: newPath ?? oldPath ?? "", oldPath, newPath, header, hunks, text: header + hunks.map((h) => h.text).join("") });
  }
  return files;
}

/** New-version line numbers of a file's added and context lines. Empty for a deleted file. */
export function newSideLines(file: DiffFile): Set<number> {
  const valid = new Set<number>();
  if (file.newPath === null) return valid;
  for (const h of file.hunks) {
    let n = h.newStart;
    for (const line of h.text.split("\n").slice(1)) {
      if (line.startsWith("+")) valid.add(n++);
      else if (line.startsWith(" ") || line === "") {
        // an empty line inside a hunk is a context line whose leading space was stripped
        if (n < h.newStart + h.newCount) valid.add(n++);
      }
    }
  }
  return valid;
}

export function chunkDiff(files: DiffFile[], limit = CHUNK_LIMIT_CHARS): Chunk[] {
  const total = files.reduce((s, f) => s + f.text.length, 0);
  if (total <= limit) return files.length ? [{ text: files.map((f) => f.text).join(""), files: files.map((f) => f.path), overLimit: false }] : [];
  const chunks: Chunk[] = [];
  let cur: DiffFile[] = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length) chunks.push({ text: cur.map((f) => f.text).join(""), files: cur.map((f) => f.path), overLimit: false });
    cur = [];
    curLen = 0;
  };
  for (const f of files) {
    if (f.text.length > limit) {
      flush();
      // cut at hunk boundaries; every piece repeats the file's header
      let piece: Hunk[] = [];
      let pieceLen = f.header.length;
      const flushPiece = () => {
        if (!piece.length) return;
        chunks.push({ text: f.header + piece.map((h) => h.text).join(""), files: [f.path], overLimit: pieceLen > limit });
        piece = [];
        pieceLen = f.header.length;
      };
      for (const h of f.hunks) {
        if (piece.length && pieceLen + h.text.length > limit) flushPiece();
        piece.push(h);
        pieceLen += h.text.length;
      }
      flushPiece();
      if (!f.hunks.length) chunks.push({ text: f.header, files: [f.path], overLimit: f.header.length > limit });
      continue;
    }
    if (curLen + f.text.length > limit) flush();
    cur.push(f);
    curLen += f.text.length;
  }
  flush();
  return chunks;
}

/**
 * The chunk as the model sees it: every hunk line gets its line number in the new version
 * (deleted lines get none), so the model can name a line without counting.
 */
export function renderChunk(text: string): string {
  const out: string[] = [];
  let n = 0;
  let end = 0;
  let inHunk = false;
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  for (const line of body.split("\n")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      n = Number(m[1]);
      end = n + (m[2] === undefined ? 1 : Number(m[2]));
      inHunk = true;
      out.push(line);
    } else if (line.startsWith("diff --git ")) {
      inHunk = false;
      out.push(line);
    } else if (!inHunk) {
      out.push(line);
    } else if (line.startsWith("+")) {
      out.push(`${String(n++).padStart(6)} ${line}`);
    } else if (line.startsWith("-")) {
      out.push(`${"".padStart(6)} ${line}`);
    } else if ((line.startsWith(" ") || line === "") && n < end) {
      out.push(`${String(n++).padStart(6)} ${line === "" ? " " : line}`);
    } else {
      out.push(`${"".padStart(6)} ${line}`); // "\ No newline at end of file" and the like
    }
  }
  return out.join("\n") + "\n";
}
