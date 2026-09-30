// Repair-agent tools (decision 029). Every repo tool is exactly ONE provider operation (so one
// step), executed inside the offline sandbox. Paths are confined to /work twice: on the host
// (normalized path must stay under /work) and in the sandbox (realpath of the nearest existing
// ancestor must stay under /work, which also catches symlinks pointing outside).
import path from "node:path";
import type { ToolDefinition } from "../llm/client.ts";

export const WORKDIR = "/work";
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
  if (abs !== WORKDIR && !abs.startsWith(`${WORKDIR}/`)) throw new ToolInputError(`path escapes the repository: ${p}`);
  return abs;
}

export function truncate(text: string, max = MAX_TOOL_RESULT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[output truncated: showing the first ${max} of ${text.length} characters]`;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// Runs inside the sandbox with bun. op = argv[1]; arguments = base64(JSON) in TH_ARGS.
// Exit 0 = result on stdout; exit 2 = tool error on stderr (the model sees it as "error: …").
const SANDBOX_HELPER = String.raw`
const fs = require("fs"), path = require("path");
const ROOT = "/work";
const fail = (m) => { process.stderr.write(m); process.exit(2); };
const args = JSON.parse(Buffer.from(process.env.TH_ARGS || "e30=", "base64").toString("utf8"));
function confine(p) {
  const abs = path.resolve(ROOT, p);
  let probe = abs, rest = "";
  while (!fs.existsSync(probe)) { rest = path.join(path.basename(probe), rest); probe = path.dirname(probe); }
  const real = path.join(fs.realpathSync(probe), rest);
  if (real !== ROOT && !real.startsWith(ROOT + "/")) fail("path escapes the repository: " + p);
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
  const text = fs.readFileSync(f, "utf8");
  const n = text.split(args.oldText).length - 1;
  if (n === 0) fail("oldText not found in " + args.path + ". Copy it exactly from read_file output, without the '<n>| ' prefixes.");
  if (n > 1) fail("oldText occurs " + n + " times in " + args.path + "; include more surrounding lines so it matches exactly once.");
  const at = text.indexOf(args.oldText);
  const line = text.slice(0, at).split("\n").length;
  fs.writeFileSync(f, text.slice(0, at) + args.newText + text.slice(at + args.oldText.length));
  process.stdout.write("edited " + args.path + ": replaced 1 occurrence starting at line " + line + "\n");
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
      `case "$p" in ${WORKDIR}|${WORKDIR}/*) ;; *) echo "path escapes the repository: ${String(args.path ?? ".").replace(/[^\w./-]/g, "")}" >&2; exit 2;; esac`,
      `grep -rnIE --exclude-dir=.git --exclude-dir=node_modules -e ${shq(String(args.pattern))} "$p" | sed "s#^${WORKDIR}/##" | head -n 200`,
    ].join("; ");
  }
  confinePath(args.path); // host-side check first; the helper re-checks with realpath in the sandbox
  const payload = b64(JSON.stringify(args));
  if (payload.length > MAX_WRITE_BYTES * 1.4) throw new ToolInputError(`arguments too large (${payload.length} bytes encoded); split the change into smaller edits`);
  return `TH_ARGS=${payload} bun -e "$(printf %s ${HELPER_B64} | base64 -d)" ${name}`;
}
