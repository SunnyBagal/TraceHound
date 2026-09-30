// Deciders rank the components an issue is most likely about (step 1 of repair: localize).
// "lexical" is ranking v1 (decision 025). "nemotron" asks Nemotron Nano over deterministic facts
// only, validates every id, retries once, and otherwise falls back to lexical - visibly.
import { z } from "zod";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import { DEFAULT_MODEL, NO_REASONING, type ReasoningMode } from "../naming/llm.ts";
import type { Snapshot } from "../schema.ts";
import { rankComponents } from "./rank.ts";

export interface DeciderUsage {
  calls: number; // model requests (cache hits included)
  cached: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  latencyMs: number;
}

export interface RankedComponent {
  componentId: string;
  /** Display text. For nemotron it is built from snapshot facts, plus the labelled model note. */
  reason: string;
  /** nemotron only: a verbatim substring of the issue that the facts relate to */
  issuePhrase?: string;
  /** nemotron only: cited facts, with text taken from the snapshot (never from the model) */
  facts?: { id: string; text: string }[];
  /** nemotron only: optional short prose - model-written, unverified */
  modelNote?: string;
}

export interface DeciderResult {
  /** Up to k entries. nemotron may return fewer, or none when no fact relates to the issue. */
  ranking: RankedComponent[];
  /** "lexical", "nemotron", or "lexical (nemotron fallback)" - never a silent mix. */
  decider: string;
  usage: DeciderUsage;
  /** Set when nemotron gave up: "nemotron fallback: <why>". */
  fallback?: string;
  /** The k that was asked for (a shorter ranking is itself a signal). */
  k: number;
  model?: string;
}

export interface Decider {
  readonly name: string;
  decide(input: { issue: string; snapshot: Snapshot; k?: number }): Promise<DeciderResult>;
}

const NO_USAGE: DeciderUsage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, latencyMs: 0 };

export class LexicalDecider implements Decider {
  readonly name = "lexical";
  async decide({ issue, snapshot, k = 3 }: { issue: string; snapshot: Snapshot; k?: number }): Promise<DeciderResult> {
    const { ranked } = rankComponents(snapshot, issue);
    return {
      ranking: ranked.filter((r) => r.score > 0).slice(0, k).map((r) => ({ componentId: r.id, reason: `score ${r.score}: ${r.reason}` })),
      decider: this.name,
      k,
      usage: { ...NO_USAGE },
    };
  }
}

// ── nemotron ───────────────────────────────────────────────────────────────────────────────

export interface LocalizerFact {
  id: string; // "<componentId>#f<n>", stable for a given snapshot
  componentId: string;
  kind: "file" | "route" | "symbol" | "redis-key" | "error-message" | "edge";
  text: string;
}

/**
 * Deterministic facts per component, each with a stable id. No model-written names or summaries,
 * ever. Order is fixed (files, routes, symbols, keys, error messages, edges) so ids are stable.
 */
export function localizerFacts(snapshot: Snapshot): { components: { id: string; kind: string; facts: { id: string; kind: string; text: string }[] }[]; index: Map<string, LocalizerFact> } {
  const index = new Map<string, LocalizerFact>();
  const components = snapshot.components.map((c) => {
    const own = new Set(c.files);
    const files = snapshot.files.filter((f) => own.has(f.path));
    const texts: [LocalizerFact["kind"], string][] = [
      ...c.files.map((f): [LocalizerFact["kind"], string] => ["file", f]),
      ...c.routes.map((r): [LocalizerFact["kind"], string] => ["route", `${r.method} ${r.path}`]),
      ...[...new Set(files.flatMap((f) => f.symbols.filter((s) => s.exported).map((s) => s.name)))].map((s): [LocalizerFact["kind"], string] => ["symbol", `exports ${s}`]),
      ...[...new Set([...(c.resource?.keys ?? []), ...files.flatMap((f) => f.redisOps.flatMap((o) => (o.key ? [o.key.value ?? `<dynamic: ${o.key.raw}>`] : [])))])].map(
        (k): [LocalizerFact["kind"], string] => ["redis-key", `redis key ${k}`],
      ),
      ...[...new Set(files.flatMap((f) => (f.errorMessages ?? []).map((m) => m.message)))].map((m): [LocalizerFact["kind"], string] => ["error-message", `error message ${JSON.stringify(m)}`]),
      ...snapshot.edges
        .filter((e) => e.source === c.id || e.target === c.id)
        .map((e): [LocalizerFact["kind"], string] => ["edge", e.source === c.id ? `${e.kind} -> ${e.target} (${e.label})` : `${e.kind} <- ${e.source} (${e.label})`]),
    ];
    const facts = texts.map(([kind, text], i) => {
      const fact: LocalizerFact = { id: `${c.id}#f${i + 1}`, componentId: c.id, kind, text };
      index.set(fact.id, fact);
      return { id: fact.id, kind, text };
    });
    return { id: c.id, kind: c.kind, facts };
  });
  return { components, index };
}

export const LOCALIZER_SYSTEM_PROMPT = [
  "You locate which components of a codebase an issue is about.",
  "You get the issue text and, for each component, facts extracted deterministically from its code. Every fact has an id like \"<componentId>#f<n>\".",
  "Use only these facts. Rank the components most likely to contain the cause or the fix of the issue.",
  'Reply with only a JSON object - no prose around it, no code fences: {"ranking":[{"componentId":"<id>","issuePhrase":"<exact words copied from the issue>","factIds":["<fact id>", ...],"note":"<optional, at most 120 characters>"}]}',
  "Rules: at most k entries, most likely first, no duplicate components. issuePhrase must be copied verbatim from the issue text. factIds must be ids of facts listed under that same component, and they must be the facts that relate to issuePhrase.",
  'If no fact relates to the issue, reply {"ranking":[]}. Fewer than k entries is fine; do not add components just to reach k.',
].join("\n");

const Reply = z
  .object({
    ranking: z.array(
      z.object({ componentId: z.string(), issuePhrase: z.string(), factIds: z.array(z.string()), note: z.string().optional() }).strict(),
    ),
  })
  .strict();

/** Deterministic checks: shape, ids, verbatim phrase, fact ownership. */
export function validateLocalizerReply(
  content: string,
  snapshot: Snapshot,
  issue: string,
  k: number,
  index: Map<string, LocalizerFact> = localizerFacts(snapshot).index,
): { ok: true; ranking: RankedComponent[] } | { ok: false; why: string } {
  let json: unknown;
  try {
    json = JSON.parse(content.trim());
  } catch {
    return { ok: false, why: `invalid JSON: ${JSON.stringify(content.slice(0, 80))}` };
  }
  const parsed = Reply.safeParse(json);
  if (!parsed.success) return { ok: false, why: `JSON does not match {"ranking":[{"componentId","issuePhrase","factIds","note"?}]}: ${parsed.error.issues[0]?.message}` };
  const entries = parsed.data.ranking;
  if (entries.length > k) return { ok: false, why: `more than k=${k} entries (${entries.length})` };
  const ids = new Set(snapshot.components.map((c) => c.id));
  const seen = new Set<string>();
  const ranking: RankedComponent[] = [];
  for (const e of entries) {
    if (!ids.has(e.componentId)) return { ok: false, why: `unknown component id "${e.componentId}"` };
    if (seen.has(e.componentId)) return { ok: false, why: `duplicate component id "${e.componentId}"` };
    seen.add(e.componentId);
    if (!e.issuePhrase.trim() || !issue.includes(e.issuePhrase)) return { ok: false, why: `issuePhrase ${JSON.stringify(e.issuePhrase)} is not a verbatim substring of the issue` };
    if (!e.factIds.length) return { ok: false, why: `no factIds for "${e.componentId}"` };
    for (const f of e.factIds) {
      const fact = index.get(f);
      if (!fact) return { ok: false, why: `unknown fact id "${f}"` };
      if (fact.componentId !== e.componentId) return { ok: false, why: `fact "${f}" belongs to "${fact.componentId}", not "${e.componentId}"` };
    }
    if (e.note !== undefined && (e.note.length > 200 || /[\r\n]/.test(e.note))) return { ok: false, why: "note must be one short line" };
    const facts = [...new Set(e.factIds)].map((f) => ({ id: f, text: index.get(f)!.text }));
    ranking.push({
      componentId: e.componentId,
      issuePhrase: e.issuePhrase,
      facts,
      ...(e.note && { modelNote: e.note }),
      reason: `"${e.issuePhrase}" ↔ ${facts.map((f) => f.text).join("; ")}${e.note ? ` · model-written note: ${e.note}` : ""}`,
    });
  }
  return { ok: true, ranking };
}

export interface ChatClient {
  chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult>;
}

export class NemotronDecider implements Decider {
  readonly name = "nemotron";
  readonly #client: ChatClient;
  readonly #model: string;
  readonly #reasoning: ReasoningMode;
  readonly #log: (line: string) => void;

  constructor(client: ChatClient, opts: { model?: string; reasoning?: ReasoningMode; log?: (line: string) => void } = {}) {
    this.#client = client;
    this.#model = opts.model ?? DEFAULT_MODEL; // Nano
    this.#reasoning = opts.reasoning ?? NO_REASONING; // reasoning off
    this.#log = opts.log ?? ((line) => console.error(line));
  }

  buildRequest(issue: string, snapshot: Snapshot, k: number): ChatRequest {
    return {
      model: this.#model,
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: LOCALIZER_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ issue, k, components: localizerFacts(snapshot).components }) },
      ],
      ...this.#reasoning,
    };
  }

  async decide({ issue, snapshot, k = 3 }: { issue: string; snapshot: Snapshot; k?: number }): Promise<DeciderResult> {
    const usage: DeciderUsage = { ...NO_USAGE };
    const { index } = localizerFacts(snapshot);
    const call = async (request: ChatRequest) => {
      const r = await this.#client.chat(request, { purpose: "localizer" });
      usage.calls++;
      if (r.cached) usage.cached++;
      usage.inputTokens += r.inputTokens ?? 0;
      usage.outputTokens += r.outputTokens ?? 0;
      usage.costUSD += r.costUSD;
      usage.latencyMs += r.latencyMs;
      return r;
    };

    const first = this.buildRequest(issue, snapshot, k);
    let reply = await call(first);
    let check = validateLocalizerReply(reply.content, snapshot, issue, k, index);
    if (!check.ok) {
      this.#log(`[localizer] nemotron reply rejected (${check.why}); retrying once`);
      const retry: ChatRequest = {
        ...first,
        messages: [
          ...first.messages,
          { role: "assistant", content: reply.content },
          { role: "user", content: `Your reply was invalid: ${check.why}. Reply again with only the JSON object as specified.` },
        ],
      };
      reply = await call(retry);
      check = validateLocalizerReply(reply.content, snapshot, issue, k, index);
    }
    if (check.ok) return { ranking: check.ranking, decider: this.name, usage, model: this.#model, k };

    const fallback = `nemotron fallback: ${check.why}`;
    this.#log(`[localizer] ${fallback} (after 1 retry); using the lexical ranking`);
    const lexical = await new LexicalDecider().decide({ issue, snapshot, k });
    return { ...lexical, decider: "lexical (nemotron fallback)", usage, fallback, model: this.#model };
  }
}
