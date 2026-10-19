import { closeSync, existsSync, openSync, readSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export const FILE_CHAR_LIMIT = 4_000;
export const TOTAL_CHAR_LIMIT = 8_000;
export interface Conventions { files: { path: string; chars: number }[]; text: string }
const ROOT_FILES = ["AGENTS.md", "CLAUDE.md", ".cursor/BUGBOT.md", ".github/copilot-instructions.md"];
const FILE_CUT = "\n[cut: 4,000 characters per file]\n";
const TOTAL_CUT = "\n[cut: 8,000 characters in total]\n";

function inside(root: string, file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const actual = realpathSync(file), relative = path.relative(root, actual);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? undefined : actual;
}

/** Bounded UTF-8 read, enough bytes for 4,001 UTF-16 characters even for non-ASCII text. */
function read(root: string, relative: string): string | undefined {
  const actual = inside(root, path.join(root, relative));
  if (!actual || !statSync(actual).isFile()) return undefined;
  const fd = openSync(actual, "r");
  try {
    const buffer = Buffer.alloc((FILE_CHAR_LIMIT + 1) * 4);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytes).toString("utf8");
  } finally { closeSync(fd); }
}

function slice(text: string, length: number): string {
  const cut = text.slice(0, Math.max(0, length));
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

function unquote(text: string): string {
  const value = text.trim();
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

/** Commas separate globs except inside brace alternatives or character classes. */
function splitGlobs(value: string): string[] {
  const result: string[] = []; let start = 0, depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "{" || value[i] === "[") depth++;
    if (value[i] === "}" || value[i] === "]") depth--;
    if (value[i] === "," && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

export function appliesTo(text: string, changed: readonly string[]): boolean {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (!frontmatter) return false;
  const value = /^applyTo:\s*(.+)$/m.exec(frontmatter)?.[1];
  if (!value) return false;
  const globs = splitGlobs(unquote(value));
  return changed.some(file => globs.some(glob => path.matchesGlob(file.replace(/\\/g, "/").replace(/^\.\//, ""), glob)));
}

/** Read convention text only. No prompt, model, git or network entry point is involved. */
export function readConventions(repo: string, changed: readonly string[]): Conventions {
  const root = realpathSync(repo), candidates = [...ROOT_FILES];
  const instructions = inside(root, path.join(root, ".github/instructions"));
  if (instructions && statSync(instructions).isDirectory()) {
    candidates.push(...readdirSync(instructions).filter(file => file.endsWith(".instructions.md")).sort()
      .map(file => `.github/instructions/${file}`));
  }
  candidates.push(".tracehound/rules.md");
  const loaded = candidates.flatMap(file => {
    const text = read(root, file);
    if (text === undefined || (file.startsWith(".github/instructions/") && !appliesTo(text, changed))) return [];
    return [{ path: file, source: slice(text, FILE_CHAR_LIMIT), fileCut: text.length > FILE_CHAR_LIMIT }];
  });
  // Reserve headings and cut markers first so every included file's cut is explicit even when
  // earlier files exhaust the source budget. Metadata itself is bounded by the total cap.
  const included: typeof loaded = []; let overhead = 0, omitted = 0;
  const omittedNote = "\n[cut: additional convention files omitted by total limit]\n";
  for (const item of loaded) {
    const cost = `\n--- ${item.path} ---\n`.length + (item.fileCut ? FILE_CUT.length : 0) + TOTAL_CUT.length;
    if (overhead + cost + omittedNote.length > TOTAL_CHAR_LIMIT) { omitted++; continue; }
    included.push(item); overhead += cost;
  }
  let budget = TOTAL_CHAR_LIMIT - overhead - (omitted ? omittedNote.length : 0);
  const files: Conventions["files"] = [], sections: string[] = [];
  for (const item of included) {
    const source = slice(item.source, budget); budget -= source.length;
    files.push({ path: item.path, chars: source.length });
    sections.push(`\n--- ${item.path} ---\n${source}${item.fileCut ? FILE_CUT : ""}${source.length < item.source.length ? TOTAL_CUT : ""}`);
  }
  return { files, text: sections.join("") + (omitted ? omittedNote : "") };
}

export function main(args: string[]): number {
  try {
    const { values } = parseArgs({ args, options: { repo: { type: "string" }, changed: { type: "string" }, out: { type: "string" } } });
    if (!values.repo || values.changed === undefined || !values.out) throw new Error("Missing conventions arguments");
    const changed = values.changed.split(/[,\n]/).map(file => file.trim()).filter(Boolean);
    writeFileSync(values.out, JSON.stringify(readConventions(values.repo, changed), null, 2) + "\n");
    return 0;
  } catch {
    console.error("usage: tracehound conventions --repo <dir> --changed <comma-or-newline-separated-files> --out <file.json>");
    return 1;
  }
}
