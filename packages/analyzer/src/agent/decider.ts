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

export interface DeciderResult {
  ranking: { componentId: string; reason: string }[];
  /** "lexical", "nemotron", or "lexical (nemotron fallback)" - never a silent mix. */
  decider: string;
  usage: DeciderUsage;
  /** Set when nemotron gave up: "nemotron fallback: <why>". */
  fallback?: string;
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
      usage: { ...NO_USAGE },
    };
  }
}

// ── nemotron ───────────────────────────────────────────────────────────────────────────────

/** Deterministic facts per component. No model-written names or summaries, ever. */
export function localizerFacts(snapshot: Snapshot) {
  return snapshot.components.map((c) => {
    const own = new Set(c.files);
    const files = snapshot.files.filter((f) => own.has(f.path));
    const redisKeys = [...new Set([...(c.resource?.keys ?? []), ...files.flatMap((f) => f.redisOps.flatMap((o) => (o.key ? [o.key.value ?? `<dynamic: ${o.key.raw}>`] : [])))])];
    return {
      id: c.id,
      kind: c.kind,
      files: c.files,
      routes: c.routes.map((r) => `${r.method} ${r.path}`),
      exportedSymbols: [...new Set(files.flatMap((f) => f.symbols.filter((s) => s.exported).map((s) => s.name)))],
      redisKeys,
      errorMessages: [...new Set(files.flatMap((f) => (f.errorMessages ?? []).map((m) => m.message)))],
      edges: snapshot.edges
        .filter((e) => e.source === c.id || e.target === c.id)
        .map((e) => (e.source === c.id ? { kind: e.kind, direction: "out", to: e.target, label: e.label } : { kind: e.kind, direction: "in", from: e.source, label: e.label })),
    };
  });
}

export const LOCALIZER_SYSTEM_PROMPT = [
  "You locate which components of a codebase an issue is about.",
  "You get the issue text and, for each component, facts extracted deterministically from its code: id, kind, files, routes, exported symbols, Redis keys, error-message literals, and edges to other components (kind, direction, label).",
  "Use only these facts. Rank the components most likely to contain the cause or the fix of the issue.",
  'Reply with only a JSON object - no prose, no code fences: {"ranking":[{"componentId":"<id copied exactly from the list>","reason":"<one line citing the facts>"}]}',
  "Return exactly k entries (or all components if there are fewer than k), most likely first, no duplicates.",
].join("\n");

const Reply = z.object({
  ranking: z.array(z.object({ componentId: z.string(), reason: z.string().min(1).max(300) }).strict()).min(1),
}).strict();

/** Why a reply is unusable, or undefined when it's valid. */
export function validateLocalizerReply(content: string, snapshot: Snapshot, k: number): { ok: true; ranking: DeciderResult["ranking"] } | { ok: false; why: string } {
  let json: unknown;
  try {
    json = JSON.parse(content.trim());
  } catch {
    return { ok: false, why: `invalid JSON: ${JSON.stringify(content.slice(0, 80))}` };
  }
  const parsed = Reply.safeParse(json);
  if (!parsed.success) return { ok: false, why: `JSON does not match {"ranking":[{"componentId","reason"}]}: ${parsed.error.issues[0]?.message}` };
  const ids = new Set(snapshot.components.map((c) => c.id));
  const want = Math.min(k, snapshot.components.length);
  const ranking = parsed.data.ranking;
  const unknown = ranking.find((r) => !ids.has(r.componentId));
  if (unknown) return { ok: false, why: `unknown component id "${unknown.componentId}"` };
  if (new Set(ranking.map((r) => r.componentId)).size !== ranking.length) return { ok: false, why: "duplicate component ids" };
  if (ranking.length !== want) return { ok: false, why: `expected ${want} entries, got ${ranking.length}` };
  if (ranking.some((r) => /[\r\n]/.test(r.reason))) return { ok: false, why: "a reason spans more than one line" };
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
        { role: "user", content: JSON.stringify({ issue, k, components: localizerFacts(snapshot) }) },
      ],
      ...this.#reasoning,
    };
  }

  async decide({ issue, snapshot, k = 3 }: { issue: string; snapshot: Snapshot; k?: number }): Promise<DeciderResult> {
    const usage: DeciderUsage = { ...NO_USAGE };
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
    let check = validateLocalizerReply(reply.content, snapshot, k);
    if (!check.ok) {
      this.#log(`[localizer] nemotron reply rejected (${check.why}); retrying once`);
      const retry: ChatRequest = {
        ...first,
        messages: [
          ...first.messages,
          { role: "assistant", content: reply.content },
          { role: "user", content: `Your reply was invalid: ${check.why}. Reply again with only the JSON object as specified, using component ids exactly as listed.` },
        ],
      };
      reply = await call(retry);
      check = validateLocalizerReply(reply.content, snapshot, k);
    }
    if (check.ok) return { ranking: check.ranking, decider: this.name, usage, model: this.#model };

    const fallback = `nemotron fallback: ${check.why}`;
    this.#log(`[localizer] ${fallback} (after 1 retry); using the lexical ranking`);
    const lexical = await new LexicalDecider().decide({ issue, snapshot, k });
    return { ...lexical, decider: "lexical (nemotron fallback)", usage, fallback, model: this.#model };
  }
}
