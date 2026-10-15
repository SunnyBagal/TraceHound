// Changed names for the context reviewer (decision 057): the functions, methods and classes a
// diff adds, removes or modifies. Heuristic and language-agnostic in shape: line patterns per
// language, chosen by file extension (every pattern for an unknown extension). Sources, in the
// order they are read: a hunk header's function context (the text after the second `@@`), then
// every definition line inside the hunk that is added or removed, or that is the nearest
// definition above a changed line. No parser, so some names are wrong and some are missed.

export type Lang = "python" | "go" | "java" | "ruby" | "ts";

const EXT_LANG: Record<string, Lang> = {
  py: "python",
  go: "go",
  java: "java",
  kt: "java",
  scala: "java",
  rb: "ruby",
  rake: "ruby",
  ts: "ts",
  tsx: "ts",
  js: "ts",
  jsx: "ts",
  mjs: "ts",
  cjs: "ts",
  mts: "ts",
  cts: "ts",
};

/**
 * Definition patterns; the first capture group is the name.
 * - Python: `def name`, `async def name`, `class Name`.
 * - Go: `func name(`, `func (r *T) name(`, `type Name struct|interface`.
 * - Java: `class|interface|enum|record Name`; a method is a line with at least one modifier
 *   (public, private, protected, static, final, abstract, synchronized, default, native), a return
 *   type, then `name(` (package-private methods without a modifier are missed).
 * - Ruby: `def name`, `def self.name` (with `?`/`!` dropped), `class|module A::Name` (last segment).
 * - TypeScript / JavaScript: `function name`, `class Name`, `interface|type Name`,
 *   `const|let|var name = (async) function | (...) => | x =>`, and a method line
 *   `[modifiers] name(...) [: type] {` (not if, for, while, switch, catch, with, return).
 */
export const DEFINITION_PATTERNS: Record<Lang, RegExp[]> = {
  python: [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/],
  go: [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[[(]/, /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/],
  java: [
    /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|static|final|abstract|synchronized|default|native)\s+)+(?:<[^>]*>\s+)?[\w$.<>[\],?\s]+?\s+([A-Za-z_$][\w$]*)\s*\(/,
  ],
  ruby: [/^\s*def\s+(?:self\.)?([A-Za-z_]\w*)[?!=]?/, /^\s*(?:class|module)\s+(?:[A-Z]\w*::)*([A-Z]\w*)/],
  ts: [
    /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/,
    /\bclass\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/,
    /^\s*(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set)\s+)*(?!(?:if|for|while|switch|catch|with|return)\b)([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/,
  ],
};

/** Names below this length are skipped. */
export const MIN_NAME_LENGTH = 4;

/**
 * Common words skipped as names: control keywords a method pattern can catch, and generic method
 * or class names whose whole-word matches are mostly unrelated code.
 */
export const NAME_STOPLIST: ReadonlySet<string> = new Set([
  // keywords and literals
  "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "elif", "else", "elsif", "ensure", "except",
  "export", "extends", "false", "final", "finally", "function", "import", "interface", "lambda", "module", "None", "null", "private",
  "protected", "public", "raise", "rescue", "return", "self", "static", "super", "switch", "this", "throw", "true", "unless", "until",
  "void", "while", "with", "yield",
  // generic names
  "__init__", "__call__", "__str__", "__repr__", "__eq__", "__hash__", "apply", "build", "call", "close", "config", "constructor",
  "context", "create", "data", "delete", "equals", "error", "execute", "handle", "handler", "hashCode", "index", "init", "initialize",
  "items", "list", "load", "main", "name", "open", "options", "params", "parse", "process", "read", "render", "request", "response",
  "result", "save", "setUp", "setup", "show", "start", "stop", "String", "tearDown", "test", "toString", "type", "update", "validate",
  "value", "values", "write",
]);

export function langOf(path: string): Lang | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();
  return ext ? (EXT_LANG[ext] ?? null) : null;
}

const ALL_LANGS = Object.keys(DEFINITION_PATTERNS) as Lang[];

/** The defined name on a line, or null. */
export function definitionName(line: string, lang: Lang | null): string | null {
  for (const l of lang ? [lang] : ALL_LANGS) {
    for (const re of DEFINITION_PATTERNS[l]) {
      const m = re.exec(line);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

export const keepName = (n: string) => n.length >= MIN_NAME_LENGTH && !NAME_STOPLIST.has(n);

/**
 * Changed names in one file's hunks (the hunk texts, `@@` line first), in order of first appearance.
 */
export function changedNames(path: string, hunkTexts: string[]): string[] {
  const lang = langOf(path);
  const out: string[] = [];
  const add = (n: string | null) => {
    if (n && keepName(n) && !out.includes(n)) out.push(n);
  };
  for (const text of hunkTexts) {
    const lines = text.replace(/\n$/, "").split("\n");
    const header = /^@@ [^@]* @@ ?(.*)$/.exec(lines[0] ?? "");
    if (header?.[1]) add(definitionName(header[1], lang));
    let enclosing: string | null = null; // nearest definition above, inside the hunk
    let enclosingUsed = false;
    for (const line of lines.slice(1)) {
      const sign = line[0];
      const body = line.slice(1);
      const def = definitionName(body, lang);
      const changed = sign === "+" || sign === "-";
      if (def) {
        enclosing = def;
        enclosingUsed = false;
        if (changed) add(def);
      }
      if (changed && enclosing && !enclosingUsed) {
        add(enclosing);
        enclosingUsed = true;
      }
    }
  }
  return out;
}
