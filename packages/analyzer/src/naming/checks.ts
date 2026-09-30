// Deterministic checks on a model's {name, summary} before it is stored. Anything that fails
// falls back to the heuristic name, and the reason is logged on the LlmCall.
import type { NamingFacts } from "./facts.ts";

// ── Unicode normalization ──────────────────────────────────────────────────────────────────
const DASHES = /[‐-―−⸺⸻﹘﹣－]/g; // ‐ ‑ ‒ – — ― − ⸺ ⸻ ﹘ ﹣ －
const SINGLE_QUOTES = /[‘’‚‛′‵]/g;
const DOUBLE_QUOTES = /[“-‟″‶«»]/g;
const SPACES = /[   -   　]/g;
const INVISIBLE = /[­​-‍⁠﻿]/g;
const ARROWS: [RegExp, string][] = [[/[→⟶⇒]/g, "->"], [/[←⟵⇐]/g, "<-"]];

/** ASCII-fold punctuation: every dash variant → "-", smart quotes → ASCII, odd spaces → " ". */
export function normalizeText(text: string): string {
  let s = text.normalize("NFKC").replace(INVISIBLE, "").replace(DASHES, "-").replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
  s = s.replace(/…/g, "...").replace(/[•·‧]/g, "-").replace(SPACES, " ");
  for (const [re, ascii] of ARROWS) s = s.replace(re, ascii);
  // any remaining non-ASCII punctuation or symbol is dropped; non-ASCII letters are kept
  s = s.replace(/[^\x00-\x7F]/g, (ch) => (/[\p{P}\p{S}]/u.test(ch) ? "" : ch));
  return s.replace(/\s+/g, " ").trim();
}

// ── Identifier-like tokens must come from the facts ────────────────────────────────────────
const TRIM = /^[\s.,;:!?()[\]{}"'`]+|[\s.,;:!?()[\]{}"'`]+$/g;
const cleanToken = (t: string) => t.replace(TRIM, "").replace(/\(\)$/, "");

/**
 * Tokens that name something in code rather than being English: paths, routes, file names,
 * camelCase / SNAKE_CASE symbols, multi-hyphen keys, patterns with `*` or `<…>`, and any token
 * that still carries a non-ASCII dash between word characters.
 */
export function isIdentifierLike(token: string): boolean {
  return (
    token.startsWith("/") ||
    (token.includes("/") && /[._-]/.test(token)) ||
    token.includes("_") ||
    /[*<>]/.test(token) ||
    /^[\w-]+\.[a-z]{1,5}$/i.test(token) ||
    /^[a-z0-9]+(?:-[a-z0-9*]+){2,}$/.test(token) ||
    /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(token) ||
    /\w[‐-―−]\w/.test(token)
  );
}

const JOINERS = /[/,|+]/;
const ALL_CAPS = /^[A-Z][A-Z0-9]+$/;

/**
 * Identifier-like tokens in `text`. A joined token ("BRPOP/LPUSH", "brPop,lPush", "a|b", "a+b")
 * is also split, and each piece counts when it is identifier-like, ALL-CAPS (an op or constant
 * spelled differently from the code), or a case variant of an identifier in `vocab`. A whole
 * token that is itself a fact (a route like /depth/:symbol) is never split.
 */
export function identifierTokens(text: string, vocab?: Set<string>): string[] {
  const variants = new Set([...(vocab ?? [])].filter(isIdentifierLike).map((v) => v.toLowerCase()));
  const looksLike = (t: string) => isIdentifierLike(t) || variants.has(t.toLowerCase());
  const out: string[] = [];
  for (const token of text.split(/\s+/).map(cleanToken)) {
    if (!token) continue;
    if (!/[,|+]/.test(token) && looksLike(token)) out.push(token); // a list is checked piece by piece only
    if (vocab?.has(token) || !JOINERS.test(token)) continue;
    for (const piece of token.split(JOINERS).map(cleanToken)) {
      if (piece && piece !== token && (looksLike(piece) || ALL_CAPS.test(piece))) out.push(piece);
    }
  }
  return out;
}

/** Every string a summary may legitimately cite: facts, their tokens, file basenames and stems. */
export function factVocabulary(facts: NamingFacts, extra: string[] = []): Set<string> {
  const vocab = new Set<string>();
  const add = (s: string) => {
    if (!s) return;
    vocab.add(s);
    for (const t of s.split(/[\s,;()[\]{}"'=]+/)) {
      const token = cleanToken(t);
      if (token) vocab.add(token);
    }
  };
  const walk = (v: unknown) => {
    if (typeof v === "string") add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  extra.forEach(add);
  for (const file of facts.files) {
    const base = file.split("/").pop()!;
    vocab.add(base);
    vocab.add(base.replace(/\.d\.ts$|\.[^.]+$/, ""));
  }
  return vocab;
}

// ── Names must describe the whole component ───────────────────────────────────────────────
const GENERIC = new Set([
  "service", "services", "api", "server", "manager", "module", "component", "handler", "handlers", "layer", "gateway",
  "system", "app", "application", "backend", "frontend", "core", "data", "store", "the", "and", "of", "for", "a", "an",
  "processor", "worker", "engine", "client", "bridge", "registry", "utilities", "utils", "shared", "queue", "database",
]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const related = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

function singlePartReason(name: string, facts: NamingFacts): string | undefined {
  const several = facts.fileCount > 1 || facts.routeCount > 1 || (facts.entryPoint?.mountsRouters.length ?? 0) > 0;
  if (!several) return undefined;
  const exempt = new Set(words(facts.currentName));
  const routeWords = facts.routes.map((r) => ({ label: r, words: words(r.replace(/^[A-Z]+\s+/, "")) }));
  const fileWords = facts.files.map((f) => ({ label: f, words: words((f.split("/").pop() ?? f).replace(/\.[^.]+$/, "")) }));
  for (const w of words(name)) {
    if (GENERIC.has(w) || exempt.has(w) || [...exempt].some((e) => related(e, w))) continue;
    const hits = [...routeWords, ...fileWords].filter((p) => p.words.some((pw) => related(pw, w)));
    if (hits.length === 1) {
      const parts = [
        facts.fileCount > 1 ? `${facts.fileCount} files` : "",
        facts.routeCount > 1 ? `${facts.routeCount} routes` : "",
        facts.entryPoint?.mountsRouters.length ? `mounts ${facts.entryPoint.mountsRouters.length} routers` : "",
      ].filter(Boolean);
      return `name "${name}" describes only ${hits[0]!.label} ("${w}"), but the component has ${parts.join(", ")}`;
    }
  }
  return undefined;
}

// ── Entry point ──────────────────────────────────────────────────────────────────────────────
export type CheckResult = { ok: true; name: string; summary: string } | { ok: false; reason: string };

/** Normalize, then verify. `extraVocabulary`: more fact strings (e.g. exported symbol names). */
export function checkReply(reply: { name: string; summary: string }, facts: NamingFacts, extraVocabulary: string[] = []): CheckResult {
  const name = normalizeText(reply.name);
  const summary = normalizeText(reply.summary);
  const vocab = factVocabulary(facts, extraVocabulary);
  const unknown = [...identifierTokens(name, vocab), ...identifierTokens(summary, vocab)].filter((t) => !vocab.has(t));
  if (unknown.length) return { ok: false, reason: `identifier(s) not in extracted facts: ${[...new Set(unknown)].join(", ")}` };
  const single = singlePartReason(name, facts);
  if (single) return { ok: false, reason: single };
  return { ok: true, name, summary };
}
