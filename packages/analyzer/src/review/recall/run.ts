// recall-v3 on one pull request (decision 070, P009 "What v3 is"): prep (chunk.ts), lens A and lens
// B on every chunk (prompts.ts), the frozen missed-issue pass review-missed-v1 (missed.ts, unchanged)
// over the deduplicated A+B findings, then reduce (reduce.ts). Every finding keeps its producer
// (lensA, lensB, missed), so "without the missed pass" and "without lens B" are scored from one run.
// It never throws: a failed call, an invalid reply, the per-pull-request budget, the wall-clock guard
// or an error anywhere leaves the findings so far (or none) and a record of what happened.
import { createHash } from "node:crypto";
import type { ChatClient } from "../../agent/decider.ts";
import { Budget, BudgetExceededError } from "../../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../../llm/client.ts";
import { costUSD, estimateInputTokens, type ModelPrice } from "../../llm/prices.ts";
import type { GitSource } from "../context.ts";
import { parseDiff, renderChunk } from "../diff.ts";
import { reviewMissed } from "../missed.ts";
import { parseReviewReply, type PullInput } from "../review.ts";
import { prepareChunks, type SkipReason } from "./chunk.ts";
import { LENS_A_SYSTEM_PROMPT, LENS_B_SYSTEM_PROMPT, RECALL_VERSION, recallUserMessage } from "./prompts.ts";
import { MAX_RECALL_FINDINGS, reduceFindings, type Producer, type RawRecallFinding, type RecallFinding, type ReduceCounts } from "./reduce.ts";

export { RECALL_VERSION };
export const LENS_A_PROMPT_SHA256 = createHash("sha256").update(LENS_A_SYSTEM_PROMPT).digest("hex");
export const LENS_B_PROMPT_SHA256 = createHash("sha256").update(LENS_B_SYSTEM_PROMPT).digest("hex");
export const RECALL_PURPOSE = "review-recall";

/** P009 6: NVIDIA's recommended sampling for the lenses. The missed pass keeps review-missed-v1's own settings. */
export const TEMPERATURE = 1.0;
export const TOP_P = 0.95;
export const MAX_TOKENS = 16_000;
/** P009 8: hard per-pull-request budget (worst case reserved before each call) and the wall-clock guard. */
export const PR_BUDGET_USD = 0.12;
export const WALL_MS = 20 * 60_000;
/** Lens calls start no later than this before the guard; the missed pass starts only with at least MISSED_MIN_MS left. */
export const LENS_MARGIN_MS = 5 * 60_000;
export const MISSED_MIN_MS = 3 * 60_000;
export const LENS_CONCURRENCY = 4;

/**
 * How each model is asked to reason, fixed from one probe call per model before the dev runs
 * (docs/bench/v3-recall-plan.md, "Builder's details"). `budget`: Token Factory honours a reasoning
 * budget for the model and it is sent; `length-retry`: it does not, so reasoning is on with
 * MAX_TOKENS and a reply cut at the limit is retried once with reasoning off.
 */
export type ReasoningPlan = { kind: "budget"; extra: Partial<ChatRequest> } | { kind: "length-retry" };
export const REASONING_BUDGET_TOKENS = 3_000;
export const REASONING_PLANS: Readonly<Record<string, ReasoningPlan>> = {};
const THINKING_ON = { chat_template_kwargs: { enable_thinking: true } };
const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };
export const planFor = (model: string): ReasoningPlan => REASONING_PLANS[model] ?? { kind: "length-retry" };

export type CallStatus = "OK" | "FAILED" | "SKIPPED";
export interface CallRecord {
  lens: "lensA" | "lensB";
  chunk: number;
  status: CallStatus;
  attempts: number;
  /** a reply cut at max_tokens (finish_reason "length"), each one counted */
  truncated: number;
  /** retries: after a cut reply (reasoning off) or an invalid one */
  retries: number;
  failure?: string;
  findings: number;
  costUSD: number;
  latencyMs: number;
  reasoningTokens?: number;
}

export interface RecallOutput {
  pr_title: string;
  pr_number?: number;
  comments: RecallFinding[];
  review: {
    version: string;
    model: string;
    reasoning: ReasoningPlan["kind"];
    temperature: number;
    topP: number;
    lensASha256: string;
    lensBSha256: string;
    files: number;
    chunks: { files: string[]; diffChars: number }[];
    skipped: { path: string; reason: SkipReason }[];
    calls: CallRecord[];
    missed: { status: "OK" | "FAILED" | "SKIPPED"; pool: number; findings: number; chunkFailed: number; failure?: string; costUSD: number };
    reduce: ReduceCounts;
    byProducer: Record<Producer, number>;
    budget: { limitUSD: number; refused: number };
    guard: { wallMs: number; hit: boolean };
    /** errors outside a call (never thrown); a global budget refusal is listed here too */
    errors: string[];
    costUSD: number;
    wallMs: number;
  };
}

export interface RecallOptions {
  model: string;
  /** the model's price, for the per-pull-request worst-case reservation */
  price: ModelPrice;
  repo: { source: GitSource; head: string };
  wallMs?: number;
  budgetUSD?: number;
  concurrency?: number;
  now?: () => number;
}

/** The per-pull-request cap: a plain Error, so the missed pass's loop records a failed chunk instead of stopping. */
export class PrBudgetError extends Error {
  override name = "PrBudgetError";
}
/** The wall-clock guard has passed: no new call starts. */
export class GuardError extends Error {
  override name = "GuardError";
}

const message = (e: unknown) => (e instanceof Error ? `${e.name === "Error" ? "" : `${e.name}: `}${e.message}` : String(e)).split("\n")[0]!.slice(0, 300);

async function pool<T>(items: T[], n: number, f: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await f(items[next++]!);
  }));
}

/** recall-v3 on one pull request; never throws (an error before any call gives no findings and says why). */
export async function reviewRecall(client: ChatClient, input: PullInput, opts: RecallOptions): Promise<RecallOutput> {
  const started = (opts.now ?? Date.now)();
  try {
    return await run(client, input, opts);
  } catch (e) {
    return {
      pr_title: input.title,
      ...(input.number !== undefined && { pr_number: input.number }),
      comments: [],
      review: {
        version: RECALL_VERSION, model: opts.model, reasoning: planFor(opts.model).kind, temperature: TEMPERATURE, topP: TOP_P,
        lensASha256: LENS_A_PROMPT_SHA256, lensBSha256: LENS_B_PROMPT_SHA256, files: 0, chunks: [], skipped: [], calls: [],
        missed: { status: "SKIPPED", pool: 0, findings: 0, chunkFailed: 0, costUSD: 0 },
        reduce: { input: 0, malformed: 0, pathMissing: 0, anchored: 0, clamped: 0, merged: 0, capped: 0, errors: 0 },
        byProducer: { lensA: 0, lensB: 0, missed: 0 }, budget: { limitUSD: opts.budgetUSD ?? PR_BUDGET_USD, refused: 0 },
        guard: { wallMs: opts.wallMs ?? WALL_MS, hit: false }, errors: [message(e)], costUSD: 0, wallMs: (opts.now ?? Date.now)() - started,
      },
    };
  }
}

async function run(client: ChatClient, input: PullInput, opts: RecallOptions): Promise<RecallOutput> {
  const now = opts.now ?? Date.now;
  const started = now();
  const wallMs = opts.wallMs ?? WALL_MS;
  const deadline = started + wallMs;
  const plan = planFor(opts.model);
  const errors: string[] = [];
  const calls: CallRecord[] = [];
  const raw: RawRecallFinding[] = [];
  let spent = 0;
  let refused = 0;
  let guardHit = false;
  const prBudget = new Budget({ runUSD: opts.budgetUSD ?? PR_BUDGET_USD, totalUSD: Number.POSITIVE_INFINITY }, 0);

  // every call of this pull request, lenses and missed pass: the guard, then the per-PR reservation
  const guarded: ChatClient = {
    async chat(request, meta) {
      if (now() >= deadline) {
        guardHit = true;
        throw new GuardError("wall-clock guard reached");
      }
      let reservation: { settle: (usd: number) => void };
      try {
        reservation = prBudget.reserve(costUSD(opts.price, estimateInputTokens(request.messages, request.tools), request.max_tokens), meta.purpose);
      } catch (e) {
        refused++;
        throw new PrBudgetError(`per-pull-request budget $${prBudget.caps.runUSD} reached (${(e as Error).message})`);
      }
      let cost = 0;
      try {
        const r = await client.chat(request, meta);
        cost = r.costUSD;
        return r;
      } catch (e) {
        if (e instanceof BudgetExceededError) errors.push(`global budget: ${message(e)}`);
        throw e;
      } finally {
        spent += cost;
        reservation.settle(cost);
      }
    },
  };

  const files = parseDiff(input.diff);
  const prep = prepareChunks(files);
  const changedFiles = files.map((f) => f.path);
  const renders = prep.chunks.map((c) => renderChunk(c.text));
  const missedRecord: RecallOutput["review"]["missed"] = { status: "SKIPPED", pool: 0, findings: 0, chunkFailed: 0, costUSD: 0 };
  let reduceCounts: ReduceCounts = { input: 0, malformed: 0, pathMissing: 0, anchored: 0, clamped: 0, merged: 0, capped: 0, errors: 0 };
  let comments: RecallFinding[] = [];

  const lensCall = async (lens: "lensA" | "lensB", i: number) => {
    const rec: CallRecord = { lens, chunk: i, status: "OK", attempts: 0, truncated: 0, retries: 0, findings: 0, costUSD: 0, latencyMs: 0 };
    calls.push(rec);
    if (now() >= deadline - LENS_MARGIN_MS) {
      rec.status = "SKIPPED";
      rec.failure = "wall-clock guard: no time for lens calls";
      guardHit = true;
      return;
    }
    const base = {
      model: opts.model,
      temperature: TEMPERATURE,
      top_p: TOP_P,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system" as const, content: lens === "lensA" ? LENS_A_SYSTEM_PROMPT : LENS_B_SYSTEM_PROMPT },
        { role: "user" as const, content: recallUserMessage({ title: input.title, description: input.description, changedFiles, renderedChunk: renders[i]!, part: i + 1, parts: prep.chunks.length }) },
      ],
      ...(plan.kind === "budget" ? plan.extra : THINKING_ON),
    };
    const send = async (request: ChatRequest): Promise<ChatResult> => {
      rec.attempts++;
      const r = await guarded.chat(request, { purpose: RECALL_PURPOSE });
      rec.costUSD += r.costUSD;
      rec.latencyMs += r.latencyMs;
      if (r.reasoningTokens !== undefined) rec.reasoningTokens = (rec.reasoningTokens ?? 0) + r.reasoningTokens;
      if (r.finishReason === "length") rec.truncated++;
      return r;
    };
    try {
      let r = await send(base as ChatRequest);
      let parsed = parseReviewReply(r.content);
      if (r.finishReason === "length") {
        // one retry with reasoning off (P009 6); its reply is used whatever it is
        rec.retries++;
        r = await send({ ...base, ...THINKING_OFF } as ChatRequest);
        parsed = parseReviewReply(r.content);
      } else if (!parsed.ok) {
        rec.retries++;
        r = await send(base as ChatRequest);
        parsed = parseReviewReply(r.content);
      }
      if (!parsed.ok) {
        rec.status = "FAILED";
        rec.failure = parsed.why;
        return;
      }
      rec.findings = parsed.findings.length;
      for (const f of parsed.findings) {
        const o = (f ?? {}) as unknown as Record<string, unknown>;
        raw.push({ producer: lens, path: o.path, start_line: o.start_line ?? o.line, end_line: o.end_line ?? o.line, body: o.body });
      }
    } catch (e) {
      rec.status = "FAILED";
      rec.failure = `request failed: ${message(e)}`;
    }
  };

  const work = (async () => {
    try {
      const jobs = prep.chunks.flatMap((_, i) => [["lensA", i], ["lensB", i]] as const);
      await pool([...jobs], opts.concurrency ?? LENS_CONCURRENCY, ([lens, i]) => lensCall(lens, i));
      // lens A's findings first, then lens B's, each in chunk order (calls finish in any order)
      raw.sort((a, b) => Number(a.producer === "lensB") - Number(b.producer === "lensB"));
      const ab = reduceFindings(raw, files, opts.repo.source, Number.POSITIVE_INFINITY);
      reduceCounts = ab.counts;
      comments = ab.findings.slice(0, MAX_RECALL_FINDINGS);
      if (deadline - now() < MISSED_MIN_MS) {
        missedRecord.failure = "wall-clock guard: no time for the missed pass";
        guardHit = true;
      } else {
        missedRecord.pool = ab.findings.length;
        const before = spent;
        try {
          const m = await reviewMissed(guarded, input, ab.findings.map((f) => ({ path: f.path, line: f.line, body: f.body })), opts.repo, { model: opts.model, reasoning: "on" });
          missedRecord.status = m.review.chunkFailed === m.review.chunks.length && m.review.chunks.length > 0 ? "FAILED" : "OK";
          missedRecord.chunkFailed = m.review.chunkFailed;
          missedRecord.findings = m.comments.length;
          const failure = m.review.chunks.find((c) => c.status === "CHUNK_FAILED")?.failure;
          if (failure) missedRecord.failure = failure.slice(0, 300);
          const all = [...ab.findings.map((f) => ({ ...f })), ...m.comments.map((c) => ({ producer: "missed" as const, path: c.path, start_line: c.line, end_line: c.line, body: c.body }))];
          const final = reduceFindings(all, files, opts.repo.source);
          reduceCounts = { ...final.counts, input: ab.counts.input + m.comments.length, malformed: ab.counts.malformed + final.counts.malformed, pathMissing: ab.counts.pathMissing + final.counts.pathMissing, anchored: ab.counts.anchored + final.counts.anchored, clamped: ab.counts.clamped + final.counts.clamped, merged: ab.counts.merged + final.counts.merged, errors: ab.counts.errors + final.counts.errors };
          comments = final.findings;
        } catch (e) {
          missedRecord.status = "FAILED";
          missedRecord.failure = message(e);
        }
        missedRecord.costUSD = spent - before;
      }
    } catch (e) {
      errors.push(message(e));
    }
  })();

  // the guard: whatever is still running at the deadline is left behind, the findings so far are kept
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((resolve) => (timer = setTimeout(() => ((guardHit = true), resolve()), Math.max(0, deadline - now()))))]);
  clearTimeout(timer);

  const byProducer: Record<Producer, number> = { lensA: 0, lensB: 0, missed: 0 };
  for (const c of comments) byProducer[c.producer]++;
  return {
    pr_title: input.title,
    ...(input.number !== undefined && { pr_number: input.number }),
    comments: [...comments],
    review: {
      version: RECALL_VERSION,
      model: opts.model,
      reasoning: plan.kind,
      temperature: TEMPERATURE,
      topP: TOP_P,
      lensASha256: LENS_A_PROMPT_SHA256,
      lensBSha256: LENS_B_PROMPT_SHA256,
      files: files.length,
      chunks: prep.chunks.map((c) => ({ files: c.files, diffChars: c.text.length })),
      skipped: prep.skipped,
      calls: [...calls].sort((a, b) => a.chunk - b.chunk || a.lens.localeCompare(b.lens)),
      missed: { ...missedRecord },
      reduce: reduceCounts,
      byProducer,
      budget: { limitUSD: prBudget.caps.runUSD, refused },
      guard: { wallMs, hit: guardHit },
      errors: [...errors],
      costUSD: spent,
      wallMs: now() - started,
    },
  };
}
