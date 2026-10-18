// contracts-v1, keyed: string-keyed contracts the pull request changes (HTTP route paths, queue and
// job names, Redis keys and prefixes, env var names, event and channel names), and the files it
// didn't edit that still use the old key. TypeScript files go through the analyzer's extractors at
// base and head; other files through a conservative literal diff (contracts/shapes.ts). Stale uses
// come from `git grep -F` of the exact literal at head. No model.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import { extractBullmq } from "../extract/bullmq.ts";
import { extractEnv } from "../extract/env.ts";
import { EvidenceStore, type ExtractContext } from "../extract/evidence.ts";
import { extractHttp } from "../extract/http-routes.ts";
import { extractRedis } from "../extract/redis.ts";
import { gitGrep, TreeProjects, TS_SOURCE } from "./projects.ts";
import { classifyLiteral, dotenvName, isDotenvFile, NOT_CODE, quotedLiterals, TEST_FILE, usesKey, type KeyKind } from "./shapes.ts";
import type { Trees } from "./trees.ts";

export const KEYED_LIMITS = { staleUsesPerKey: 50, keys: 200 };

export interface StaleUse {
  path: string;
  line: number;
  text: string;
}

export interface KeyedContract {
  key: string; // "<kind>:<old value>"
  kind: KeyKind;
  before: string;
  after?: string; // the new value when the change is a rename
  prefix: boolean; // a key prefix (a Redis key built from a template), matched at the start of a string
  via: "extractor" | "literal" | "dotenv";
  changedAt: { path: string; line: number; side: "base"; text: string };
  afterAt?: { path: string; line: number; side: "head"; text: string };
  staleUses: StaleUse[];
  truncated?: number; // stale uses past the per-key cap, counted, not listed
  note?: string; // why the key wasn't searched, or why its uses aren't stale
}

export interface KeyedResult {
  keys: KeyedContract[];
  counts: { files: { extractor: number; literal: number }; removed: number; renamed: number; searched: number; staleUses: number; extractorErrors: number };
  ms: number;
}

interface Fact {
  kind: KeyKind;
  value: string;
  prefix: boolean;
  file: string;
  line: number;
  role?: string;
  via: KeyedContract["via"];
}

const MIN_PREFIX = 3;

/** Key facts of one TypeScript file, from the analyzer's extractors. */
function extractorFacts(projects: TreeProjects, sf: SourceFile, file: string, errors: { n: number }): Fact[] {
  const evidence = new EvidenceStore();
  const ctx: ExtractContext = { rel: projects.rel, evidence };
  const lines = sf.getFullText().split(/\r?\n/);
  // the line inside the fact's evidence that carries the literal (a call can span lines)
  const lineOf = (id: string, value: string, kind: KeyKind, prefix: boolean) => {
    const range = evidence.get(id)!.range;
    for (let l = range.startLine; l <= range.endLine; l++) if (usesKey(lines[l - 1] ?? "", value, kind, prefix)) return l;
    return range.startLine;
  };
  const facts: Fact[] = [];
  const add = (kind: KeyKind, raw: string | undefined, id: string, role?: string) => {
    if (!raw) return;
    const hole = raw.indexOf("*");
    const prefix = hole >= 0;
    const value = prefix ? raw.slice(0, hole) : raw;
    if (prefix && (kind !== "redis-key" || value.length < MIN_PREFIX)) return; // a template name is dynamic
    if (!value) return;
    facts.push({ kind, value, prefix, file, line: lineOf(id, value, kind, prefix), ...(role && { role }), via: "extractor" });
  };
  const guard = (run: () => void) => {
    try {
      run();
    } catch {
      errors.n++;
    }
  };
  guard(() => extractHttp(sf, ctx).routes.forEach((r) => add("route", r.path, r.evidenceId, "define")));
  guard(() => extractBullmq(sf, ctx).forEach((q) => q.role !== "unsupported" && add("queue", q.queue?.value, q.evidenceId, q.role)));
  guard(() => extractRedis(sf, ctx).ops.forEach((r) => add("redis-key", r.key?.value, r.evidenceId, r.role)));
  guard(() => extractEnv(sf, ctx).forEach((e) => add("env", e.name, e.evidenceId)));
  return facts;
}

/** Key-shaped literals on the given lines (1-based line numbers into `lines`). */
function literalFacts(file: string, lineNumbers: number[], lines: string[], kinds?: KeyKind[]): Fact[] {
  const facts: Fact[] = [];
  const dotenv = isDotenvFile(file);
  for (const n of lineNumbers) {
    const text = lines[n - 1] ?? "";
    if (dotenv) {
      const name = dotenvName(text);
      if (name) facts.push({ kind: "env", value: name, prefix: false, file, line: n, via: "dotenv" });
      continue;
    }
    for (const lit of quotedLiterals(text)) {
      const kind = classifyLiteral(lit.value, text, kinds);
      if (kind) facts.push({ kind, value: lit.value, prefix: false, file, line: n, via: "literal" });
    }
  }
  return facts;
}

const readLines = (root: string, file: string): string[] => {
  try {
    return readFileSync(path.join(root, file), "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
};
const id = (f: { kind: KeyKind; value: string }) => `${f.kind}:${f.value}`;

export function computeKeyed(trees: Trees, opts: { baseProjects?: TreeProjects; headProjects?: TreeProjects } = {}): KeyedResult {
  const started = performance.now();
  const baseProjects = opts.baseProjects ?? new TreeProjects(trees.base);
  const headProjects = opts.headProjects ?? new TreeProjects(trees.head);
  const errors = { n: 0 };
  const files = { extractor: 0, literal: 0 };
  const removedFacts: Fact[] = [];
  const addedFacts: Fact[] = [];
  const headFacts: Fact[] = []; // every extractor fact at head in an edited file
  const baseFacts: Fact[] = [];
  const baseText = new Map<string, string[]>();
  const headText = new Map<string, string[]>();

  for (const f of [...trees.files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (f.binary || NOT_CODE.test(f.path)) continue;
    const bLines = readLines(trees.base, f.path);
    const hLines = readLines(trees.head, f.path);
    baseText.set(f.path, bLines);
    headText.set(f.path, hLines);
    if (TEST_FILE.test(f.path)) continue; // a key a test stops using hasn't changed
    const removedLines = f.hunks.flatMap((h) => h.removed.map((_, i) => h.oldStart + i));
    const addedLines = f.hunks.flatMap((h) => h.added.map((_, i) => h.newStart + i));
    if (TS_SOURCE.test(f.path)) {
      files.extractor++;
      const b = baseProjects.sourceFile(f.path);
      const h = headProjects.sourceFile(f.path);
      const bf = b ? extractorFacts(baseProjects, b, f.path, errors) : [];
      const hf = h ? extractorFacts(headProjects, h, f.path, errors) : [];
      baseFacts.push(...bf);
      headFacts.push(...hf);
      const inHead = new Set(hf.map(id));
      const inBase = new Set(bf.map(id));
      removedFacts.push(...bf.filter((x) => !inHead.has(id(x))));
      addedFacts.push(...hf.filter((x) => !inBase.has(id(x))));
      // events and channels have no extractor: the literal diff, for that kind only
      removedFacts.push(...literalFacts(f.path, removedLines, bLines, ["event"]));
      addedFacts.push(...literalFacts(f.path, addedLines, hLines, ["event"]));
    } else {
      files.literal++;
      removedFacts.push(...literalFacts(f.path, removedLines, bLines));
      addedFacts.push(...literalFacts(f.path, addedLines, hLines));
    }
  }

  // a key is gone only when no edited file still has it at head, as a fact or as the literal
  const stillAt = (texts: Map<string, string[]>, facts: Fact[], x: { kind: KeyKind; value: string; prefix: boolean }) =>
    facts.some((f) => id(f) === id(x)) || [...texts.values()].some((lines) => lines.some((l) => usesKey(l, x.value, x.kind, x.prefix)));
  const removed = removedFacts.filter((x) => !stillAt(headText, headFacts, x));
  const added = addedFacts.filter((x) => !stillAt(baseText, baseFacts, x));

  // one contract per old key; a rename pairs it with a new key of the same kind in the same file, in line order
  const firstPerKey = (facts: Fact[]) => [...new Map(facts.map((x) => [`${x.file}\u0000${id(x)}`, x])).values()].sort((a, b) => a.line - b.line);
  const group = (x: Fact) => `${x.file}\u0000${x.kind}`;
  const partner = new Map<string, Fact>(); // "<file>\0<old key>" → the new key's fact
  for (const g of new Set(removed.map(group))) {
    const r = firstPerKey(removed.filter((x) => group(x) === g).reverse()); // reverse: the map keeps the first site
    const a = firstPerKey(added.filter((x) => group(x) === g).reverse());
    r.forEach((x, i) => a[i] && partner.set(`${x.file}\u0000${id(x)}`, a[i]!));
  }
  const byKey = new Map<string, Fact[]>();
  for (const x of [...removed].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) byKey.set(id(x), [...(byKey.get(id(x)) ?? []), x]);
  const keys: KeyedContract[] = [];
  for (const [key, sites] of byKey) {
    const first = sites[0]!;
    const after = sites.map((s) => partner.get(`${s.file}\u0000${key}`)).find(Boolean);
    keys.push({
      key,
      kind: first.kind,
      before: first.value,
      ...(after && { after: after.value }),
      prefix: first.prefix,
      via: first.via,
      changedAt: { path: first.file, line: first.line, side: "base", text: trees.lineText("base", first.file, first.line) },
      ...(after && { afterAt: { path: after.file, line: after.line, side: "head" as const, text: trees.lineText("head", after.file, after.line) } }),
      staleUses: [],
    });
  }

  // stale uses: the old literal at head, in files the pull request didn't edit
  let searched = 0;
  for (const k of keys) {
    if (k.kind === "env" && !k.after) {
      k.note = "env var removed without a rename: not a break by itself, not searched";
      continue;
    }
    if (searched >= KEYED_LIMITS.keys) {
      k.note = `not searched: more than ${KEYED_LIMITS.keys} changed keys`;
      continue;
    }
    searched++;
    const hits = gitGrep(trees.repo, trees.headSha, k.before, k.kind === "env").filter((h) => !trees.edited.has(h.path) && !NOT_CODE.test(h.path) && usesKey(h.text, k.before, k.kind, k.prefix));
    const alive = stillProvided(k, hits, headProjects, errors);
    if (alive) {
      k.note = `still provided at head by ${alive}: uses are not stale`;
      continue;
    }
    k.staleUses = hits.slice(0, KEYED_LIMITS.staleUsesPerKey);
    if (hits.length > KEYED_LIMITS.staleUsesPerKey) k.truncated = hits.length - KEYED_LIMITS.staleUsesPerKey;
  }
  return {
    keys,
    counts: { files, removed: keys.length, renamed: keys.filter((k) => k.after !== undefined).length, searched, staleUses: keys.reduce((n, k) => n + k.staleUses.length, 0), extractorErrors: errors.n },
    ms: Math.round(performance.now() - started),
  };
}

/**
 * An unedited TypeScript file at head that still provides the key, so its other uses aren't stale:
 * a route still registered, a queue still both fed and consumed, a Redis key still both written and read.
 */
function stillProvided(k: KeyedContract, hits: { path: string; line: number }[], projects: TreeProjects, errors: { n: number }): string | undefined {
  if (k.kind !== "route" && k.kind !== "queue" && k.kind !== "redis-key") return undefined;
  const roles = new Map<string, string>();
  for (const file of new Set(hits.map((h) => h.path))) {
    const sf = projects.sourceFile(file);
    if (!sf) continue;
    for (const f of extractorFacts(projects, sf, file, errors)) {
      if (f.kind !== k.kind || f.value !== k.before) continue;
      if (k.kind === "route") return `${file}:${f.line}`;
      roles.set(f.role ?? "", `${file}:${f.line}`);
    }
  }
  const side = (...r: string[]) => r.map((x) => roles.get(x)).find(Boolean);
  const supply = k.kind === "queue" ? side("define", "produce") : side("write", "produce");
  const demand = k.kind === "queue" ? side("consume") : side("read", "consume");
  return supply && demand ? `${supply} and ${demand}` : undefined;
}
