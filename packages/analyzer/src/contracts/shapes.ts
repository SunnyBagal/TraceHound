// contracts-v1: the shapes a string literal must have to count as a key, for the keyed stage's
// literal diff (any language). Conservative on purpose: a shape needs both the literal's form and a
// context word on the same line, except env names, which are distinctive enough on an env line.

export type KeyKind = "route" | "queue" | "redis-key" | "env" | "event";

export interface Shape {
  kind: KeyKind;
  /** what the literal itself must look like */
  pattern: RegExp;
  /** a word on the same line that says what the literal is for (definition-style sites only) */
  context: RegExp;
  /** literals of the right form that still aren't keys */
  exclude?: RegExp;
  description: string;
}

/** Checked in order; the first match wins. */
export const SHAPES: Shape[] = [
  {
    kind: "env",
    pattern: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/,
    context: /\b(?:get|lookup|set|read|must)?env(?:iron)?\b|\bENV\b/i,
    description: "SCREAMING_SNAKE name with an underscore, on a line that reads the environment (os.Getenv, os.environ, process.env, ENV[…])",
  },
  {
    kind: "route",
    pattern: /^(?:\/(?:[A-Za-z0-9_.~-]+|:[A-Za-z_]\w*|\{[A-Za-z_][\w:]*\}|<(?:\w+:)?\w+>|\*))+\/?$/,
    context: /@\w+\.(?:route|get|post|put|patch|delete|api_route)\b|\b(?:route|router|HandleFunc|Handle|HandlerFunc|mux|urlpatterns|re_path|path|app|blueprint|bp)\b|\.(?:GET|POST|PUT|PATCH|DELETE)\(|@(?:Get|Post|Put|Patch|Delete|Request)Mapping\b/,
    exclude: /^\/(?:etc|usr|tmp|var|home|dev|proc|bin|opt|sys)(?:\/|$)|\.\w{1,5}$/,
    description: "URL path of one or more segments (`/api/users`, `/users/:id`, `/users/{id}`, `/users/<int:id>`), on a line that registers a route; filesystem paths and file names are not routes",
  },
  {
    kind: "redis-key",
    pattern: /^[A-Za-z][\w-]*(?::[\w{}*.-]*)+$/,
    context: /redis|\brdb\b|cache|\b(?:get|set|setex|setnx|hget|hset|hgetall|del|expire|incr|lpush|rpush|lpop|rpop|sadd|zadd|keys|scan)\b/i,
    description: "colon-separated key or prefix (`session:`, `user:{id}:profile`), on a line that talks to Redis or a cache",
  },
  {
    kind: "queue",
    pattern: /^[A-Za-z][\w-]*(?:[.:/][\w-]+)*$/,
    context: /queue|\bjobs?\b|\btask\b|send_task|apply_async|\bworker\b|consumer|producer|\btopic\b|perform_async|sidekiq|celery/i,
    exclude: /^.{0,2}$/,
    description: "queue, job or task name (`emails`, `emails.welcome`), on a line that defines, sends to or consumes a queue or task",
  },
  {
    kind: "event",
    pattern: /^[A-Za-z][\w-]*(?:[.:][\w-]+)+$/,
    context: /\b(?:emit|on|once|off|addListener|removeListener|addEventListener|dispatch|trigger|publish|subscribe|broadcast|channel|listen|event)\b/i,
    description: "dotted or colon-separated event or channel name (`user.created`, `order:paid`), on a line that emits, publishes or listens",
  },
];

export function classifyLiteral(literal: string, line: string, kinds?: readonly KeyKind[]): KeyKind | undefined {
  for (const s of SHAPES) {
    if (kinds && !kinds.includes(s.kind)) continue;
    if (s.pattern.test(literal) && !s.exclude?.test(literal) && s.context.test(line)) return s.kind;
  }
  return undefined;
}

export interface Literal {
  value: string;
  column: number; // 1-based, of the opening quote
}

/** Quoted string literals on one line: "…", '…', and `…` without interpolation. */
export function quotedLiterals(line: string): Literal[] {
  const out: Literal[] = [];
  for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    if (m[1] === "`" && m[2]!.includes("${")) continue;
    out.push({ value: m[2]!, column: m.index! + 1 });
  }
  return out;
}

/** `NAME=value` / `export NAME=value` in a dotenv file. */
export const isDotenvFile = (file: string) => /(?:^|\/)\.env(?:\.[\w.-]+)?$|\.env$/.test(file);
export function dotenvName(line: string): string | undefined {
  return /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does `line` use `key` as a whole key, not as part of a longer string? A route may follow a
 * template hole (`${base}/api/users`) and be followed by a query; a prefix may be followed by
 * anything inside its string; an env name needs an env reader or a config line around it.
 */
export function usesKey(line: string, key: string, kind: KeyKind, prefix = false): boolean {
  const k = esc(key);
  if (kind === "env") {
    if (!new RegExp(`(?<![\\w$])${k}(?![\\w$])`).test(line)) return false;
    return SHAPES[0]!.context.test(line) || new RegExp(`^\\s*(?:export\\s+|-\\s*)?["']?${k}["']?\\s*[=:]|\\$\\{?${k}\\b|\\bENV\\s+${k}\\b|\\bARG\\s+${k}\\b`).test(line);
  }
  if (prefix) return new RegExp(`["'\`]${k}`).test(line);
  if (kind === "route") return new RegExp(`["'\`}]${k}(?=["'\`?#])`).test(line);
  return new RegExp(`(["'\`])${k}\\1`).test(line);
}

/** Paths whose literals say nothing about a contract: docs, lockfiles, vendored and built code. */
export const NOT_CODE = /(?:^|\/)(?:node_modules|vendor|dist|build|\.next|coverage)\/|\.(?:md|mdx|rst|txt|lock|min\.js|map|snap|svg|csv)$|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$|(?:^|\/)CHANGELOG/i;

/** Test files: they use keys, but a key a test stops using hasn't changed. */
export const TEST_FILE = /(?:^|\/)(?:test|tests|__tests__|spec|e2e)\/|[._-](?:test|spec)\.[\w]+$|_test\.go$|(?:^|\/)test_[^/]*\.py$/;
