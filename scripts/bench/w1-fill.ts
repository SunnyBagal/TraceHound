// W1 fill helper (decision 076z item 2; docs/runbooks/W1-writeup.md). Fills the W1 skeleton's {{placeholders}} from
// the committed result files and keeps or drops every {{if …}} … {{end if}} block, so W1 does not copy numbers by hand.
// It writes no number of its own: every value is a field of a named file, or a formula stated below. What it cannot
// resolve stays as it is and is listed for the writer (the prediction verdicts, R, …).
//
//   node scripts/bench/w1-fill.ts --summary docs/bench/ts-heldout.summary.json [--secondary f] [--pooled f]
//     [--values f.json] [--alias tracehound=a0 …] [--write | --out-dir d] [--check] <file> …
//
// Without --write or --out-dir it is a dry run: it prints the report and writes nothing. --check exits 1 if any
// placeholder or marker is left outside HTML comments (the skeleton's comments are deleted by W1 itself).
//
// Names (the legend at the top of docs/bench/ts-heldout.md):
//   tools.<t>.<path> · pairs[<a>,<b>].<field> · exposure.<f> · handcheckGuess.<f> · handcheckX1Fallback · registeredTests.<f>
//                                         --summary (absent handcheckX1Fallback = false, as the scorer omits it)
//   secondary:<path> · pooled:<path>      --secondary / --pooled
//   anything else (R, decision-number, ho-score:…, h1:…, budget:…, p1:…, flag:…)   --values, a JSON object keyed by
//                                         the full name, e.g. {"R": "…", "flag:pooledRan": false}
//   G[a,b]        |onlyA − onlyB| of that pair
//   outcome[a,b]  W1 §3.2: "floor" if reviewedByBoth < registeredTests.min_reviewed_by_both (checked first), else
//                 A if p < alpha and onlyA > onlyB, B if p < alpha and onlyA < onlyB, else C
// A token written "{{ x }}" (a space after the braces, as in GitHub Actions expressions) is not a placeholder.
// Expressions: terms joined by "+", " − " (spaced) or "×"; "×" binds first. A bare term after a dotted one takes its
// parent ("tools.x.completedBug+completedClean"). Conditions: <expr> (==|!=|<|>|≤|≥|<=|>=) <expr>, or a bare <expr>
// that must be true. A condition that cannot be decided keeps its block and markers, and is listed.
// Formats (as docs/bench/ts-dev.md and score-testset.ts print them): …Wilson[0] "23.7", …Wilson[1] "56.2%"; every p
// field (pairs[a,b].p, pooled:….p, secondary:….p) to 10 significant figures as score-testset.ts prints it, "–" when
// the source gave none (counts only: under the floor, or not tested); costUSD and "×" products to 4 decimals; other
// non-integers to 2; integers and --values strings as they are.
// Grammar (decision 076aa item 15(a)): a placeholder filled with 1 and followed by " bugs" is written "1 bug".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

export class FillError extends Error {}

type Json = unknown;
export interface Sources { summary: Json; secondary?: Json; pooled?: Json; values?: Record<string, Json>; alias?: Record<string, string> }

interface Pair { a: string; b: string; registered: boolean; reviewedByBoth: number; onlyA: number; onlyB: number; p: number | null }

const SUMMARY_ROOTS = ["tools.", "pairs[", "exposure.", "handcheckGuess.", "handcheckX1Fallback", "registeredTests."];
const NAME = /^[A-Za-z0-9_\-:.[\],]+$/;
const LITERALS = new Set(["A", "B", "C", "floor"]);

function isObj(x: Json): x is Record<string, Json> { return typeof x === "object" && x !== null && !Array.isArray(x); }

/** walk "a.b[0].c" (pairs[x,y] is handled by the caller) */
function walk(root: Json, path: string): Json {
  let cur: Json = root;
  for (const seg of path.split(".").filter(Boolean)) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(seg);
    if (!m) return undefined;
    cur = isObj(cur) ? cur[m[1]!] : undefined;
    for (const idx of m[2]!.match(/\d+/g) ?? []) cur = Array.isArray(cur) ? cur[Number(idx)] : undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

export class Resolver {
  readonly s: Sources;
  constructor(s: Sources) { this.s = s; }

  private tool(t: string): string { return this.s.alias?.[t] ?? t; }

  pair(a: string, b: string): Pair {
    const pairs = walk(this.s.summary, "pairs");
    const A = this.tool(a), B = this.tool(b);
    const p = Array.isArray(pairs) ? (pairs as Pair[]).find((x) => x.a === A && x.b === B) : undefined;
    if (!p) throw new FillError(`pairs[${a},${b}]: no such pair in the summary (pairs are in --tool order)`);
    return p;
  }

  outcome(a: string, b: string): string {
    const p = this.pair(a, b);
    const reg = walk(this.s.summary, "registeredTests") as { alpha?: number; min_reviewed_by_both?: number } | undefined;
    if (!p.registered || !reg || typeof reg.alpha !== "number" || typeof reg.min_reviewed_by_both !== "number") {
      throw new FillError(`outcome[${a},${b}]: not a registered pair with an alpha and a floor in the summary`);
    }
    if (p.reviewedByBoth < reg.min_reviewed_by_both) return "floor";
    if (typeof p.p !== "number") throw new FillError(`outcome[${a},${b}]: at or above the floor but the summary has no p`);
    if (p.p < reg.alpha) {
      if (p.onlyA === p.onlyB) throw new FillError(`outcome[${a},${b}]: p < alpha with onlyA = onlyB`);
      return p.onlyA > p.onlyB ? "A" : "B";
    }
    return "C";
  }

  /** a name's raw value; undefined when no source has it */
  ref(name: string): Json {
    let m = /^(outcome|G)\[([^,\]]+),([^\]]+)\]$/.exec(name);
    if (m) {
      if (m[1] === "outcome") return this.outcome(m[2]!, m[3]!);
      const p = this.pair(m[2]!, m[3]!);
      return Math.abs(p.onlyA - p.onlyB);
    }
    if (name.startsWith("secondary:")) return this.s.secondary === undefined ? undefined : walk(this.s.secondary, name.slice(10));
    if (name.startsWith("pooled:")) return this.s.pooled === undefined ? undefined : walk(this.s.pooled, name.slice(7));
    if (SUMMARY_ROOTS.some((r) => name.startsWith(r))) {
      m = /^pairs\[([^,\]]+),([^\]]+)\]\.(.+)$/.exec(name);
      if (m) return walk(this.pair(m[1]!, m[2]!), m[3]!);
      if (name === "handcheckX1Fallback") return walk(this.s.summary, name) ?? false;
      const t = /^tools\.([^.]+)(\..*)?$/.exec(name);
      return walk(this.s.summary, t ? `tools.${this.tool(t[1]!)}${t[2] ?? ""}` : name);
    }
    return this.s.values?.[name];
  }
}

type Val = number | string | boolean | null | undefined;

function literal(term: string): Val | typeof NOT_LITERAL {
  const n = term.replace(/^−/, "-");
  if (/^-?\d+(\.\d+)?$/.test(n)) return Number(n);
  if (term === "true") return true;
  if (term === "false") return false;
  if (LITERALS.has(term)) return term;
  return NOT_LITERAL;
}
const NOT_LITERAL = Symbol("not a literal");

/** evaluate an expression; returns { value, name } or null if it is not an expression at all */
export function evaluate(r: Resolver, expr: string): { value: Val; product: boolean } | null {
  const text = expr.trim();
  const abs = /^\|(.+)\|$/.exec(text);
  if (abs) {
    const inner = evaluate(r, abs[1]!);
    if (!inner) return null;
    return { value: typeof inner.value === "number" ? Math.abs(inner.value) : undefined, product: inner.product };
  }
  // sum of products; binary minus is " − " with spaces, so names with "-" (decision-number) stay whole
  const sumParts = text.split(/\s*\+\s*|\s+−\s+/);
  const signs = [1, ...[...text.matchAll(/\s*\+\s*|\s+−\s+/g)].map((x) => (x[0].includes("−") ? -1 : 1))];
  let total: Val = 0, prevPath = "", product = false;
  for (const [i, part] of sumParts.entries()) {
    const factors = part.split(/\s*×\s*/);
    if (factors.length > 1) product = true;
    let value: Val = 1;
    for (const raw of factors) {
      const f = raw.trim();
      let v = literal(f);
      if (v === NOT_LITERAL) {
        if (!NAME.test(f)) return null;
        const name = !/[.:[]/.test(f) && prevPath ? `${prevPath}.${f}` : f;
        if (/[.:]/.test(f)) prevPath = f.includes(".") ? f.slice(0, f.lastIndexOf(".")) : "";
        v = r.ref(name) as Val;
      }
      if (factors.length === 1 && sumParts.length === 1) return { value: v as Val, product };
      if (typeof v !== "number" || typeof value !== "number") { value = undefined; continue; }
      value *= v;
    }
    if (typeof value !== "number" || typeof total !== "number") total = undefined;
    else total += signs[i]! * value;
  }
  return { value: total, product };
}

const CMP = /^(.*?)\s*(==|!=|<=|>=|≤|≥|<|>)\s*(.*)$/;

/** true / false, or undefined when it cannot be decided */
export function condition(r: Resolver, cond: string): boolean | undefined {
  const m = CMP.exec(cond.trim());
  if (!m) {
    const v = evaluate(r, cond);
    return v && typeof v.value === "boolean" ? v.value : undefined;
  }
  const l = evaluate(r, m[1]!)?.value, rr = evaluate(r, m[3]!)?.value;
  if (l === undefined || rr === undefined || l === null || rr === null) return undefined;
  switch (m[2]) {
    case "==": return l === rr;
    case "!=": return l !== rr;
  }
  if (typeof l !== "number" || typeof rr !== "number") return undefined;
  switch (m[2]) {
    case "<": return l < rr;
    case ">": return l > rr;
    case "<=": case "≤": return l <= rr;
    default: return l >= rr;
  }
}

/** a p value: the scorer prints Number(p.toPrecision(10)) (score-testset.ts, pairs line) */
const P_FIELD = /^(pairs\[[^\]]+\]\.|(pooled|secondary):(.+\.)?)p$/;

export function format(name: string, v: Val, product: boolean): string | undefined {
  if (v === undefined || typeof v === "boolean") return undefined;
  if (/Wilson\[[01]\]$/.test(name)) {
    if (v === null) return undefined;
    const s = (Number(v) * 100).toFixed(1);
    return name.endsWith("[1]") ? `${s}%` : s;
  }
  if (P_FIELD.test(name)) return v === null ? "–" : String(Number(Number(v).toPrecision(10)));
  if (v === null) return undefined;
  if (typeof v === "string") return v;
  if (product || /costUSD/.test(name)) return v.toFixed(4);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export interface Report { filled: number; left: { name: string; line: number }[]; kept: number; dropped: number; undecided: { cond: string; line: number }[] }

interface Tok { start: number; end: number; body: string }

/** "{{name}}"; a token with a space after "{{" (GitHub Actions' "${{ github.… }}" in the README) is not one */
const PLACEHOLDER = /\{\{(?!\s)([^{}]*)\}\}/g;

/** fill one file's text; HTML comments are left exactly as they are */
export function fill(text: string, r: Resolver, opts: { tsSource?: boolean } = {}): { text: string; report: Report } {
  const comments: [number, number][] = [];
  for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) comments.push([m.index, m.index + m[0].length]);
  const inComment = (i: number) => comments.some(([a, b]) => i >= a && i < b);
  const toks: Tok[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!inComment(m.index)) toks.push({ start: m.index, end: m.index + m[0].length, body: m[1]!.trim() });
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;
  const report: Report = { filled: 0, left: [], kept: 0, dropped: 0, undecided: [] };

  // a cut that leaves its line empty takes the whole line; one that starts a line takes the spaces after it
  const lineStart = (i: number) => text.lastIndexOf("\n", i - 1) + 1;
  const cut = (from: number, to: number): [number, number] => {
    if (text.slice(lineStart(from), from).trim() !== "") return [from, to];
    const rest = /^[ \t]*/.exec(text.slice(to))![0].length;
    const after = to + rest;
    if (after === text.length) return [lineStart(from), after];
    if (text[after] === "\n") return [lineStart(from), after + 1];
    return [lineStart(from), after];
  };

  // match {{if}} … {{end if}}
  const stack: number[] = [];
  const close = new Map<number, number>();
  toks.forEach((t, i) => {
    if (/^if\s/.test(t.body)) stack.push(i);
    else if (t.body === "end if") {
      const o = stack.pop();
      if (o === undefined) throw new FillError(`line ${lineOf(t.start)}: {{end if}} without {{if}}`);
      close.set(o, i);
    }
  });
  if (stack.length) throw new FillError(`line ${lineOf(toks[stack[0]!]!.start)}: {{if}} without {{end if}}`);

  const edits: { from: number; to: number; with: string }[] = [];
  let i = 0;
  const skipTo = (j: number) => { i = j + 1; };
  while (i < toks.length) {
    const t = toks[i]!;
    if (/^if\s/.test(t.body)) {
      const j = close.get(i)!;
      const end = toks[j]!;
      const cond = t.body.slice(3);
      const ok = condition(r, cond);
      if (ok === undefined) { report.undecided.push({ cond, line: lineOf(t.start) }); i++; continue; }
      if (ok) {
        report.kept++;
        const [a, b] = cut(t.start, t.end);
        const [c, d] = /^[ \t]*(\n|$)/.test(text.slice(end.end)) && text.slice(lineStart(end.start), end.start).trim() === ""
          ? cut(end.start, end.end) : [end.start, end.end];
        edits.push({ from: a, to: b, with: "" }, { from: c, to: d, with: "" });
        i++;
      } else {
        report.dropped++;
        const [a, b] = cut(t.start, end.end);
        edits.push({ from: a, to: /^[ \t]*(\n|$)/.test(text.slice(end.end)) ? b : end.end, with: "" });
        skipTo(j);
      }
      continue;
    }
    if (t.body === "end if") { i++; continue; } // its {{if}} was undecided
    const v = evaluate(r, t.body);
    const s = v ? format(t.body, v.value, v.product) : undefined;
    if (s === undefined) report.left.push({ name: t.body, line: lineOf(t.start) });
    else {
      if (opts.tsSource && /["`\\]/.test(s)) throw new FillError(`${t.body}: value contains a quote or backslash; not written into TypeScript source`);
      // 076aa item 15(a): "1 bugs" → "1 bug"; nothing else in the template changes
      const plural = s === "1" ? /^ bugs(?![\p{L}\p{N}])/u.exec(text.slice(t.end)) : null;
      edits.push(plural ? { from: t.start, to: t.end + plural[0].length, with: "1 bug" } : { from: t.start, to: t.end, with: s });
      report.filled++;
    }
    i++;
  }
  edits.sort((x, y) => y.from - x.from);
  let out = text;
  let floor = Infinity;
  for (const e of edits) {
    const to = Math.min(e.to, floor);
    if (e.from >= floor) continue; // inside a dropped block already removed
    out = out.slice(0, e.from) + e.with + out.slice(to);
    floor = e.from;
  }
  return { text: out, report };
}

/** placeholders and markers left outside HTML comments */
export function leftovers(text: string): number {
  const bare = text.replace(/<!--[\s\S]*?-->/g, "");
  return (bare.match(PLACEHOLDER) ?? []).length;
}

const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Json;

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const { values: o, positionals: files } = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        summary: { type: "string" }, secondary: { type: "string" }, pooled: { type: "string" }, values: { type: "string" },
        alias: { type: "string", multiple: true }, write: { type: "boolean" }, "out-dir": { type: "string" }, check: { type: "boolean" },
      },
    });
    if (!o.summary || files.length === 0) throw new FillError("usage: --summary <file> [--secondary f] [--pooled f] [--values f] [--alias t=x] [--write | --out-dir d] [--check] <file> …");
    if (o.write && o["out-dir"]) throw new FillError("--write and --out-dir are exclusive");
    const values = o.values ? readJson(o.values) : {};
    if (!isObj(values)) throw new FillError("--values must be a JSON object");
    const alias = Object.fromEntries((o.alias ?? []).map((a) => {
      const [k, v] = a.split("=");
      if (!k || !v) throw new FillError(`--alias ${a}: expected name=tool`);
      return [k, v];
    }));
    const r = new Resolver({ summary: readJson(o.summary), secondary: o.secondary ? readJson(o.secondary) : undefined, pooled: o.pooled ? readJson(o.pooled) : undefined, values, alias });
    const reg = walk(r.s.summary, "registeredTests") as { alpha?: number; min_reviewed_by_both?: number } | undefined;
    if (reg && (reg.alpha !== 0.05 || reg.min_reviewed_by_both !== 15)) log(`warning: the summary's alpha ${reg.alpha} / floor ${reg.min_reviewed_by_both} differ from the skeleton's wording (0.05 / 15)`);
    let left = 0;
    for (const f of files) {
      const { text, report } = fill(readFileSync(f, "utf8"), r, { tsSource: f.endsWith(".ts") || f.endsWith(".tsx") });
      log(`${f}: filled ${report.filled} · blocks kept ${report.kept}, dropped ${report.dropped}, undecided ${report.undecided.length} · left ${report.left.length}`);
      for (const u of report.undecided) log(`  undecided line ${u.line}: {{if ${u.cond}}}`);
      for (const l of report.left) log(`  left line ${l.line}: {{${l.name}}}`);
      left += leftovers(text);
      if (o.write) writeFileSync(f, text);
      else if (o["out-dir"]) {
        const dest = join(o["out-dir"], relative(process.cwd(), resolve(f)));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, text);
      }
    }
    if (!o.write && !o["out-dir"]) log("dry run: nothing written");
    if (o.check && left > 0) { log(`check: ${left} placeholder(s) or marker(s) left outside comments`); return 1; }
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof FillError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : `an input could not be read (${(e as Error).message})`}`);
    return 2;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
