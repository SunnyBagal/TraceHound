// Repair-agent tools (decision 029). Every repo tool is exactly ONE provider operation (so one
// step), executed inside the offline sandbox. Paths are confined to /work or /scratch (agent-v4,
// decision 034) twice: on the host (the normalized path must stay under one of them) and in the
// sandbox (the realpath of the nearest existing ancestor must too, which also catches symlinks
// pointing outside).
import path from "node:path";
import type { ToolDefinition } from "../llm/client.ts";

export const WORKDIR = "/work";
/** agent-v4 (decision 034): writable scratch space outside the repo, never part of the diff. */
export const SCRATCH = "/scratch";
const underRoot = (abs: string) => [WORKDIR, SCRATCH].some((root) => abs === root || abs.startsWith(`${root}/`));
export const MAX_TOOL_RESULT = 8000; // characters sent back to the model per tool call
export const MAX_WRITE_BYTES = 64_000; // write_file/edit_file payloads travel in an env var

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDefinition => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const REPO_TOOLS: ToolDefinition[] = [
  fn("list_dir", "List a directory in the repository (directories end with /).", { path: { type: "string", description: "Directory relative to the repo root; '.' for the root" } }, ["path"]),
  fn(
    "read_file",
    "Read a file with line numbers ('<n>| <text>'). Optionally a 1-based inclusive line range.",
    { path: { type: "string" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } },
    ["path"],
  ),
  fn(
    "search",
    "Search file contents with grep -E (extended regex), skipping .git and node_modules. Returns 'file:line:text', at most 200 lines.",
    { pattern: { type: "string" }, path: { type: "string", description: "Directory or file to search; default '.'" } },
    ["pattern"],
  ),
  fn(
    "edit_file",
    "Replace one exact occurrence of oldText with newText in an existing file. Fails if oldText occurs 0 times or more than once.",
    { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } },
    ["path", "oldText", "newText"],
  ),
  fn("write_file", "Create a NEW file with the given content. Fails if the file already exists (use edit_file for existing files).", { path: { type: "string" }, content: { type: "string" } }, [
    "path",
    "content",
  ]),
  fn("run", "Run a shell command in the repository root (e.g. tests or a typecheck). No network. Output is truncated.", { cmd: { type: "string" } }, ["cmd"]),
  fn("finish", "End your turn. The summary is recorded but not used to judge the fix.", { summary: { type: "string" } }, ["summary"]),
];

export const GRAPH_TOOLS: ToolDefinition[] = [
  fn("context_packet", "A ranked context packet for the issue (or a query): likely components, their files, key edges with file:line evidence, related tests.", { query: { type: "string", description: "Defaults to the issue text" } }, []),
  fn("search_components", "Find architecture components matching a query; returns ids, kinds, scores and the matching facts.", { query: { type: "string" } }, ["query"]),
  fn(
    "get_neighbors",
    "Components directly connected to one component, with edge ids, kinds and confidence labels.",
    { componentId: { type: "string" }, direction: { type: "string", enum: ["in", "out", "both"] }, kinds: { type: "array", items: { type: "string" } } },
    ["componentId"],
  ),
  fn("get_edge_evidence", "The code behind one edge: file:line, extractor and a short snippet per piece of evidence.", { edgeId: { type: "string" } }, ["edgeId"]),
  fn("get_related_tests", "Test files that import a component's files.", { componentId: { type: "string" } }, ["componentId"]),
];

export class ToolInputError extends Error {
  override name = "ToolInputError";
}

/** Host-side confinement: a repo-relative (or /work-absolute) path that stays inside /work. */
export function confinePath(p: unknown): string {
  if (typeof p !== "string" || !p.length || p.includes("\0")) throw new ToolInputError("path must be a non-empty string");
  const abs = path.posix.normalize(path.posix.isAbsolute(p) ? p : path.posix.join(WORKDIR, p));
  if (!underRoot(abs)) throw new ToolInputError(`path escapes the repository: ${p}`);
  return abs;
}

/** agent-v3 (decision 033): results longer than this keep their head and tail, the middle is omitted. */
export const OUTPUT_CAP = { over: 4000, head: 2000, tail: 1500 } as const;

/** Every tool result the model sees goes through this: head + "[harness: N characters omitted]" + tail. */
export function capOutput(text: string): { text: string; omitted: number } {
  if (text.length <= OUTPUT_CAP.over) return { text, omitted: 0 };
  const omitted = text.length - OUTPUT_CAP.head - OUTPUT_CAP.tail;
  return { text: `${text.slice(0, OUTPUT_CAP.head)}\n[harness: ${omitted} characters omitted]\n${text.slice(-OUTPUT_CAP.tail)}`, omitted };
}

export function truncate(text: string, max = MAX_TOOL_RESULT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[output truncated: showing the first ${max} of ${text.length} characters]`;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// edit_file matching (agent-v2, decision 030; agent-v6, decision 047), plain JS so the sandbox
// helper can embed it and tests can evaluate it on the host.
export const EDIT_FALLBACK_JS = String.raw`
function wsNormalizedEdit(text, oldText, newText) {
  const file = text.split("\n");
  const pat = oldText.split("\n");
  while (pat.length && !pat[0].trim()) pat.shift();
  while (pat.length && !pat[pat.length - 1].trim()) pat.pop();
  if (!pat.length) return { ok: false, lines: [] };
  const p = pat.map((l) => l.trim());
  const hits = [];
  for (let i = 0; i + p.length <= file.length; i++) {
    let j = 0;
    while (j < p.length && file[i + j].trim() === p[j]) j++;
    if (j === p.length) hits.push(i);
  }
  if (hits.length !== 1) return { ok: false, lines: hits.map((i) => i + 1) };
  const at = hits[0];
  // re-indent newText only if every non-blank line is off by the same indentation shift
  const indent = (l) => /^[ \t]*/.exec(l)[0];
  let shift;
  for (let j = 0; j < pat.length && shift !== null; j++) {
    if (!p[j]) continue;
    const m = indent(pat[j]), f = indent(file[at + j]);
    const s = f === m ? "=" : f.endsWith(m) ? "+" + f.slice(0, f.length - m.length) : m.endsWith(f) ? "-" + m.slice(0, m.length - f.length) : null;
    shift = shift === undefined || shift === s ? s : null;
  }
  let lines = newText === "" ? [] : newText.split("\n");
  if (newText.endsWith("\n")) lines.pop();
  let reindent = "as given";
  if (shift === "=" || shift === undefined) reindent = "unchanged";
  else if (shift) {
    const by = shift.slice(1);
    lines = lines.map((l) => (!l.trim() ? l : shift[0] === "+" ? by + l : l.startsWith(by) ? l.slice(by.length) : l));
    reindent = "shifted";
  }
  return { ok: true, text: [...file.slice(0, at), ...lines, ...file.slice(at + pat.length)].join("\n"), startLine: at + 1, endLine: at + pat.length, reindent };
}
// agent-v6 (decision 047): s without the CR of each CRLF and without the spaces and tabs before each
// line end (and at the very end). map[i] is the index in s of the i-th kept character; no "\n" is
// dropped, so line numbers are the same in both.
function normalizeLineEnds(s) {
  const out = [], map = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\r" && s[i + 1] === "\n") { i++; continue; }
    if (c === " " || c === "\t") {
      let j = i;
      while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
      if (!(j === s.length || s[j] === "\n" || (s[j] === "\r" && s[j + 1] === "\n"))) for (let k = i; k < j; k++) { out.push(s[k]); map.push(k); }
      i = j;
      continue;
    }
    out.push(c); map.push(i); i++;
  }
  return { text: out.join(""), map };
}
// agent-v6 (decision 047): oldText matched with trailing whitespace and line endings ignored on both
// sides; applied only at exactly one location. newText gets CRLF line ends if the file uses them.
function lineEndEdit(text, oldText, newText) {
  const t = normalizeLineEnds(text), p = normalizeLineEnds(oldText).text;
  if (!p.trim()) return { ok: false, lines: [] };
  const hits = [];
  for (let i = t.text.indexOf(p); i !== -1; i = t.text.indexOf(p, i + 1)) hits.push(i);
  const lineAt = (i) => t.text.slice(0, i).split("\n").length;
  if (hits.length !== 1) return { ok: false, lines: hits.map(lineAt) };
  const at = hits[0], start = t.map[at], end = t.map[at + p.length - 1] + 1;
  const nt = text.includes("\r\n") && !newText.includes("\r") ? newText.replace(/\n/g, "\r\n") : newText;
  return { ok: true, text: text.slice(0, start) + nt + text.slice(end), startLine: lineAt(at), endLine: lineAt(at + p.length - 1) };
}
// The file's lines most similar to oldText (character bigrams, whitespace squashed), with line
// numbers, at most 40 lines. Undefined only for an empty file.
function closestRegion(text, oldText) {
  const file = text.split("\n");
  if (file.length && file[file.length - 1] === "") file.pop();
  if (!file.length) return undefined;
  const n = Math.max(1, Math.min(oldText.trim().split("\n").length, file.length));
  const squash = (s) => s.replace(/\s+/g, " ").trim();
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const target = grams(squash(oldText));
  const tn = [...target.values()].reduce((a, b) => a + b, 0);
  let best = { score: -1, start: 0 };
  for (let i = 0; i + n <= file.length; i++) {
    const g = grams(squash(file.slice(i, i + n).join("\n")));
    let common = 0, gn = 0;
    for (const [k, v] of g) { gn += v; common += Math.min(v, target.get(k) || 0); }
    const score = tn + gn ? (2 * common) / (tn + gn) : 0;
    if (score > best.score) best = { score, start: i };
  }
  const shown = file.slice(best.start, best.start + Math.min(n, 40));
  return { startLine: best.start + 1, endLine: best.start + shown.length, score: Math.round(best.score * 100) / 100, snippet: shown.map((l, k) => best.start + 1 + k + "| " + l).join("\n") };
}
// One edit_file call on a file's text. Order: exact (once) → trailing whitespace and line endings
// ignored (agent-v6) → indentation and trailing spaces ignored (agent-v2) → an error with the closest
// region. Returns { ok, text?, message, how }; the sandbox helper writes text and prints message.
function applyEdit(text, oldText, newText, label) {
  const n = text.split(oldText).length - 1;
  if (n === 1) {
    const at = text.indexOf(oldText);
    return { ok: true, how: "exact", text: text.slice(0, at) + newText + text.slice(at + oldText.length), message: "edited " + label + ": replaced 1 occurrence starting at line " + text.slice(0, at).split("\n").length };
  }
  if (n > 1) return { ok: false, how: "exact-multiple", message: "oldText occurs " + n + " times in " + label + "; include more surrounding lines so it matches exactly once." };
  const region = () => {
    const near = closestRegion(text, oldText);
    return near ? "\nClosest region of the file as it is now (lines " + near.startLine + "-" + near.endLine + ", similarity " + near.score + "):\n" + near.snippet : "";
  };
  const le = lineEndEdit(text, oldText, newText);
  if (le.ok) return { ok: true, how: "line-ends", text: le.text, message: "edited " + label + ": oldText did not match exactly; ignoring trailing whitespace and line endings it matched once, at lines " + le.startLine + "-" + le.endLine + ", and was replaced there. Read those lines back to check." };
  if (le.lines.length > 1) return { ok: false, how: "ambiguous-line-ends", message: "oldText not found exactly in " + label + "; ignoring trailing whitespace and line endings it matches " + le.lines.length + " places (starting at lines " + le.lines.join(", ") + "), so nothing was changed. Include more surrounding lines so it matches once." + region() };
  const ws = wsNormalizedEdit(text, oldText, newText);
  if (ws.ok) {
    const how = ws.reindent === "shifted" ? "newText was re-indented by the same shift" : ws.reindent === "as given" ? "newText was inserted as given (its indentation was not adjusted)" : "indentation already matched";
    return { ok: true, how: "whitespace-normalized", text: ws.text, message: "edited " + label + ": oldText did not match exactly, so a whitespace-normalized match (indentation and trailing spaces ignored) was applied to lines " + ws.startLine + "-" + ws.endLine + "; " + how + ". Read those lines back to check." };
  }
  if (ws.lines.length > 1) return { ok: false, how: "ambiguous-whitespace", message: "oldText not found exactly in " + label + "; ignoring indentation and trailing spaces it matches " + ws.lines.length + " places (starting at lines " + ws.lines.join(", ") + "), so nothing was changed. Include more surrounding lines so it matches once." + region() };
  return { ok: false, how: "not-found", message: "oldText not found in " + label + ", even ignoring indentation, trailing whitespace and line endings. Copy it exactly from read_file output, without the '<n>| ' prefixes." + region() };
}
`;

// Runs inside the sandbox with bun. op = argv[1]; arguments = base64(JSON) in TH_ARGS.
// Exit 0 = result on stdout; exit 2 = tool error on stderr (the model sees it as "error: …").
const SANDBOX_HELPER =
  EDIT_FALLBACK_JS +
  String.raw`
const fs = require("fs"), path = require("path");
const ROOT = "/work", SCRATCH = "/scratch";
const fail = (m) => { process.stderr.write(m); process.exit(2); };
const args = JSON.parse(Buffer.from(process.env.TH_ARGS || "e30=", "base64").toString("utf8"));
function confine(p) {
  const abs = path.resolve(ROOT, p);
  let probe = abs, rest = "";
  while (!fs.existsSync(probe)) { rest = path.join(path.basename(probe), rest); probe = path.dirname(probe); }
  const real = path.join(fs.realpathSync(probe), rest);
  if (![ROOT, SCRATCH].some((r) => real === r || real.startsWith(r + "/"))) fail("path escapes the repository: " + p);
  return real;
}
const op = process.argv[1];
if (op === "list_dir") {
  const d = confine(args.path);
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) fail("not a directory: " + args.path);
  const names = fs.readdirSync(d, { withFileTypes: true }).map((e) => e.name + (e.isDirectory() ? "/" : "")).sort();
  process.stdout.write(names.join("\n") + "\n");
} else if (op === "read_file") {
  const f = confine(args.path);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) fail("not a file: " + args.path);
  const lines = fs.readFileSync(f, "utf8").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const s = Math.max(1, args.startLine || 1), e = Math.min(lines.length, args.endLine || lines.length);
  const out = [];
  for (let i = s; i <= e; i++) out.push(i + "| " + lines[i - 1]);
  process.stdout.write("[" + args.path + ": lines " + s + "-" + e + " of " + lines.length + "]\n" + out.join("\n") + "\n");
} else if (op === "edit_file") {
  const f = confine(args.path);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) fail("not a file: " + args.path + " (write_file creates new files)");
  if (!args.oldText) fail("oldText must not be empty");
  const r = applyEdit(fs.readFileSync(f, "utf8"), args.oldText, args.newText, args.path);
  if (!r.ok) fail(r.message);
  fs.writeFileSync(f, r.text);
  process.stdout.write(r.message + "\n");
} else if (op === "write_file") {
  const f = confine(args.path);
  if (fs.existsSync(f)) fail(args.path + " already exists; use edit_file to change it");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, args.content);
  process.stdout.write("wrote " + args.path + " (" + Buffer.byteLength(args.content) + " bytes)\n");
} else fail("unknown helper op " + op);
`;
const HELPER_B64 = b64(SANDBOX_HELPER);

/** The single shell command that performs a repo tool inside the sandbox. */
export function sandboxCommand(name: string, args: Record<string, unknown>): string {
  if (name === "run") return String(args.cmd);
  if (name === "search") {
    const dir = confinePath(args.path ?? ".");
    return [
      `p=$(realpath -m -- ${shq(dir)})`,
      `case "$p" in ${WORKDIR}|${WORKDIR}/*|${SCRATCH}|${SCRATCH}/*) ;; *) echo "path escapes the repository: ${String(args.path ?? ".").replace(/[^\w./-]/g, "")}" >&2; exit 2;; esac`,
      `grep -rnIE --exclude-dir=.git --exclude-dir=node_modules -e ${shq(String(args.pattern))} "$p" | sed "s#^${WORKDIR}/##" | head -n 200`,
    ].join("; ");
  }
  confinePath(args.path); // host-side check first; the helper re-checks with realpath in the sandbox
  const payload = b64(JSON.stringify(args));
  if (payload.length > MAX_WRITE_BYTES * 1.4) throw new ToolInputError(`arguments too large (${payload.length} bytes encoded); split the change into smaller edits`);
  return `TH_ARGS=${payload} bun -e "$(printf %s ${HELPER_B64} | base64 -d)" ${name}`;
}
