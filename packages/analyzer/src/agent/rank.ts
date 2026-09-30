// Ranking v1 (docs/decisions.md 025): deterministic lexical match of issue text against
// extracted facts. No model, no embeddings. Model-written names/summaries are NOT used.
import type { Component, Snapshot } from "../schema.ts";

/** Where a term matched, and how much that kind of fact counts. */
export const FIELD_WEIGHTS = { name: 3, route: 3, symbol: 2, file: 2, "redis-key": 2, env: 1 } as const;
export type Field = keyof typeof FIELD_WEIGHTS;

// Common English function words (plus "any"/"some" style quantifiers): they never identify code.
const STOPWORDS = new Set(
  "a an and any are as at be been but by can could did do does for from had has have how i if in into is it its just me my no not of on or our so some than that the their them then there these they this those to too up us was we were what when where which while who why will with would you your".split(" "),
);

/** Light suffix stripping: -ing, -ed, -es, -s. Deliberately crude and documented. */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** camelCase / snake_case / kebab-case / paths / prose → lowercase stemmed terms (≥3 chars, no stopwords). */
export function terms(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words.map(stem).filter((w) => w.length >= 3))];
}

/** Equal, or one is a prefix of the other and the shorter has at least 4 characters. */
export function termsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

export interface FieldValue {
  field: Field;
  value: string; // the fact as written (route path, symbol, file, key, env var, id/name)
  terms: string[];
}

/** Every fact of a component that ranking looks at. */
export function componentFields(snapshot: Snapshot, c: Component): FieldValue[] {
  const own = new Set(c.files);
  const files = snapshot.files.filter((f) => own.has(f.path));
  const out: FieldValue[] = [];
  const add = (field: Field, value: string) => out.push({ field, value, terms: terms(value) });
  add("name", c.id);
  add("name", c.naming.heuristicName);
  if (c.naming.source === "override") add("name", c.name); // human-written; model-written names are skipped
  for (const r of c.routes) add("route", r.path);
  for (const f of files) for (const s of f.symbols) if (s.exported) add("symbol", s.name);
  for (const f of c.files) add("file", f);
  const keys = new Set([...(c.resource?.keys ?? []), ...files.flatMap((f) => f.redisOps.flatMap((o) => (o.key ? [o.key.value ?? o.key.raw] : [])))]);
  for (const k of keys) if (k !== "<dynamic>") add("redis-key", k);
  for (const e of new Set([...c.envVars, ...files.flatMap((f) => f.envReads.map((r) => r.name))])) add("env", e);
  return out.filter((f) => f.terms.length);
}

export interface Match {
  term: string;
  field: Field;
  value: string;
  weight: number;
}

export interface Ranked {
  id: string;
  score: number;
  matches: Match[]; // one per issue term that matched, its best field
  reason: string;
}

/**
 * Score = Σ over distinct issue terms of the highest field weight that term matches in the
 * component (name/route 3, symbol/file/redis-key 2, env 1). Each term counts once per component.
 */
export function rankComponents(snapshot: Snapshot, text: string): { terms: string[]; ranked: Ranked[] } {
  const issueTerms = terms(text);
  const ranked = snapshot.components.map((c): Ranked => {
    const fields = componentFields(snapshot, c);
    const matches: Match[] = [];
    for (const term of issueTerms) {
      let best: Match | undefined;
      for (const f of fields) {
        const weight = FIELD_WEIGHTS[f.field];
        if ((!best || weight > best.weight) && f.terms.some((t) => termsMatch(term, t))) best = { term, field: f.field, value: f.value, weight };
      }
      if (best) matches.push(best);
    }
    const score = matches.reduce((n, m) => n + m.weight, 0);
    const reason = matches.length ? `matched ${matches.map((m) => `"${m.term}" in ${m.field} ${m.value}`).join(", ")}` : "no match";
    return { id: c.id, score, matches, reason };
  });
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { terms: issueTerms, ranked };
}

/** Estimated tokens: characters / 4. Always labelled "estimated" where shown. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4);

/** Whole-repo estimate from the snapshot's per-file `chars` (analyzer 0.5.0+); undefined for older snapshots. */
export function repoTokens(snapshot: Snapshot): number | undefined {
  if (snapshot.files.some((f) => f.chars === undefined)) return undefined;
  return estimateTokens(snapshot.files.reduce((n, f) => n + f.chars!, 0));
}
