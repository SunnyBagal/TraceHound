// Test helper: the YAML subset GitHub workflow files here use (block maps and sequences, flow
// sequences, quoted and plain scalars, | and > block scalars, comments). Anything else throws, so a
// workflow this cannot read fails the test instead of being half-read. Keys stay strings ("on" too).
export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

interface Line { indent: number; text: string; raw: string }

const significant = (raw: string) => raw.trim() !== "" && !raw.trimStart().startsWith("#");

/** Index of an unquoted " #" comment, or -1. */
function commentAt(text: string): number {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) { if (c === quote) quote = null; continue; }
    // A quoted scalar starts the value; an apostrophe inside plain text is just a character.
    if ((c === "'" || c === '"') && text.slice(0, i).trim() === "") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]!))) return i;
  }
  return -1;
}
const stripComment = (text: string) => { const i = commentAt(text); return (i < 0 ? text : text.slice(0, i)).trimEnd(); };

/** Index of the mapping separator ": " (or a trailing ":") outside quotes and ${{ }}, or -1. */
function separatorAt(text: string): number {
  let quote: string | null = null;
  let expr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) { if (c === quote) quote = null; continue; }
    if (text.startsWith("${{", i)) { expr++; i += 2; continue; }
    if (expr && text.startsWith("}}", i)) { expr--; i++; continue; }
    if (expr) continue;
    if ((c === "'" || c === '"') && i === 0) quote = c;
    else if (c === ":" && (i === text.length - 1 || text[i + 1] === " ")) return i;
  }
  return -1;
}

function splitFlow(inner: string): string[] {
  const out: string[] = [];
  let quote: string | null = null, depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === "," && !depth) { out.push(inner.slice(start, i)); start = i + 1; }
  }
  out.push(inner.slice(start));
  return out.map(s => s.trim()).filter(s => s !== "");
}

export function scalar(text: string): Yaml {
  const t = stripComment(text).trim();
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new Error(`unterminated quote: ${t}`);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new Error(`unterminated quote: ${t}`);
    return t.slice(1, -1).replace(/\\(["\\n])/g, (_m, c: string) => (c === "n" ? "\n" : c));
  }
  if (t.startsWith("[")) {
    if (!t.endsWith("]")) throw new Error(`multi-line flow sequence: ${t}`);
    return splitFlow(t.slice(1, -1)).map(scalar);
  }
  if (t === "{}") return {};
  if (t.startsWith("{")) throw new Error(`flow mapping not supported: ${t}`);
  if (/^[&*!]/.test(t) || t === "---") throw new Error(`unsupported YAML: ${t}`);
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true" || t === "false") return t === "true";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

export function parseYaml(source: string): Yaml {
  const lines: Line[] = source.replace(/\t/g, () => { throw new Error("tab indentation"); }).split("\n")
    .map(raw => ({ raw, indent: raw.length - raw.trimStart().length, text: raw.trim() }));
  let i = 0;
  const peek = (): Line | undefined => {
    while (i < lines.length && !significant(lines[i]!.raw)) i++;
    return lines[i];
  };

  function blockScalar(header: string, parentIndent: number): string {
    const indicator = header.trim();
    if (!/^[|>][-+]?$/.test(indicator)) throw new Error(`unsupported block scalar header: ${header}`);
    const body: string[] = [];
    let contentIndent = -1;
    while (i < lines.length) {
      const l = lines[i]!;
      if (l.text !== "" && l.indent <= parentIndent) break;
      if (l.text !== "" && contentIndent < 0) contentIndent = l.indent;
      body.push(l.text === "" ? "" : l.raw.slice(contentIndent));
      i++;
    }
    while (body.length && body.at(-1) === "") body.pop();
    const text = indicator.startsWith(">")
      ? body.reduce((acc, l) => (acc === "" ? l : l === "" ? `${acc}\n` : acc.endsWith("\n") ? acc + l : `${acc} ${l}`), "")
      : body.join("\n");
    return indicator.endsWith("-") ? text : `${text}\n`;
  }

  function value(rest: string, indent: number): Yaml {
    const r = stripComment(rest).trim();
    if (/^[|>]/.test(r)) { i++; return blockScalar(r, indent); }
    i++;
    if (r !== "") return scalar(r);
    const next = peek();
    if (!next) return null;
    if (next.indent > indent) return block(next.indent);
    if (next.indent === indent && next.text.startsWith("-")) return sequence(indent);
    return null;
  }

  function mapping(indent: number): { [key: string]: Yaml } {
    const out: { [key: string]: Yaml } = {};
    for (let l = peek(); l && l.indent === indent && !/^-( |$)/.test(l.text); l = peek()) {
      const sep = separatorAt(l.text);
      if (sep < 0) throw new Error(`line ${i + 1}: expected "key: value": ${l.text}`);
      const key = String(scalar(l.text.slice(0, sep)));
      if (Object.hasOwn(out, key)) throw new Error(`duplicate key ${key}`);
      out[key] = value(l.text.slice(sep + 1), indent);
    }
    const l = peek();
    if (l && l.indent > indent) throw new Error(`line ${i + 1}: unexpected indentation`);
    return out;
  }

  function sequence(indent: number): Yaml[] {
    const out: Yaml[] = [];
    for (let l = peek(); l && l.indent === indent && /^-( |$)/.test(l.text); l = peek()) {
      const content = l.text.slice(1).trimStart();
      if (content === "") { i++; const n = peek(); out.push(n && n.indent > indent ? block(n.indent) : null); continue; }
      const offset = indent + (l.text.length - content.length);
      if (separatorAt(content) >= 0 && !/^['"[]/.test(content)) {
        // "- key: v" opens a mapping at the content's column.
        lines[i] = { indent: offset, text: content, raw: " ".repeat(offset) + content };
        out.push(mapping(offset));
      } else {
        out.push(value(content, indent));
      }
    }
    return out;
  }

  function block(indent: number): Yaml {
    const l = peek();
    if (!l) return null;
    return /^-( |$)/.test(l.text) ? sequence(indent) : mapping(indent);
  }

  const first = peek();
  const doc = first ? block(first.indent) : null;
  if (peek()) throw new Error(`line ${i + 1}: unparsed content`);
  return doc;
}

// GitHub Actions `if:` expressions: ||, &&, !, ==, !=, parentheses, '…' strings, true/false/null,
// and property paths read from a context object (missing → null). Comparisons follow GitHub's
// loose rules only as far as these files need: strings compare case-insensitively.
export function evaluate(expression: string, context: Record<string, unknown>): unknown {
  const src = expression.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1");
  const tokens = src.match(/\|\||&&|==|!=|!|\(|\)|'(?:[^']|'')*'|[A-Za-z_][\w.-]*|\S/g) ?? [];
  let p = 0;
  const take = () => tokens[p++];
  const truthy = (v: unknown) => v !== null && v !== undefined && v !== false && v !== "" && v !== 0;
  const eq = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b);
  function operand(): unknown {
    const t = take();
    if (t === undefined) throw new Error(`unexpected end of ${expression}`);
    if (t === "(") { const v = or(); if (take() !== ")") throw new Error(`missing ) in ${expression}`); return v; }
    if (t === "!") return !truthy(operand());
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t === "true" || t === "false") return t === "true";
    if (t === "null") return null;
    if (t === "format" && tokens[p] === "(") {
      p++;
      const args: unknown[] = [];
      while (tokens[p] !== ")") { args.push(or()); if (tokens[p] === ",") p++; else if (tokens[p] !== ")") throw new Error(`bad format() in ${expression}`); }
      p++;
      return String(args[0]).replace(/\{(\d+)\}/g, (_m, n: string) => String(args[Number(n) + 1] ?? ""));
    }
    if (/^[A-Za-z_]/.test(t)) return t.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] ?? null : null), context);
    throw new Error(`unsupported token ${t} in ${expression}`);
  }
  function comparison(): unknown {
    const left = operand();
    if (tokens[p] === "==" || tokens[p] === "!=") { const op = take(); const right = operand(); return op === "==" ? eq(left, right) : !eq(left, right); }
    return left;
  }
  function and(): unknown { let v = comparison(); while (tokens[p] === "&&") { p++; const r = comparison(); v = truthy(v) ? r : v; } return v; }
  function or(): unknown { let v = and(); while (tokens[p] === "||") { p++; const r = and(); v = truthy(v) ? v : r; } return v; }
  const result = or();
  if (p !== tokens.length) throw new Error(`unparsed tokens in ${expression}: ${tokens.slice(p).join(" ")}`);
  return result;
}

export const truthy = (v: unknown) => v !== null && v !== undefined && v !== false && v !== "" && v !== 0;
