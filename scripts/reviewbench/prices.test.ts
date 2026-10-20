import path from "node:path";
import { describe, expect, it } from "vitest";
import { Budget, BudgetExceededError, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { costUSD, estimateInputTokens, loadPriceTable, priceFor } from "../../packages/analyzer/src/llm/prices.ts";
import { CONTEXT_BUDGET_CHARS } from "../../packages/analyzer/src/review/context.ts";
import { CHUNK_LIMIT_CHARS } from "../../packages/analyzer/src/review/diff.ts";
import { MAX_POOLED_BODY_CHARS, REVIEW_MISSED_SYSTEM_PROMPT, reviewMissedUserMessage } from "../../packages/analyzer/src/review/prompt-missed.ts";
import { MAX_DESCRIPTION_CHARS } from "../../packages/analyzer/src/review/prompt.ts";
import { DEFAULT_MODEL } from "./entry.ts";

// A model without a real price falls back to $5 / $15 per 1M tokens. At that price one review call
// (60,000 diff characters, max_tokens 32,000) reserves about $0.58, two concurrent reservations
// cross TRACEHOUND_BUDGET_RUN_USD=1, the call is refused, and the never-fail wrapper writes zero
// findings with exit 0: a whole ReviewBench run would score 0 without failing.
const table = loadPriceTable(path.resolve(import.meta.dirname, "../../config/prices.json"));
const CANDIDATE_MODELS = [DEFAULT_MODEL, "nvidia/Nemotron-3.5-Super-VL"];

/** The worst-case reservation the client makes for one request (packages/analyzer/src/llm/client.ts). */
const reservation = (model: string, inputChars: number, maxTokens: number) =>
  costUSD(priceFor(table, model), estimateInputTokens([{ content: "x".repeat(inputChars) }]), maxTokens);

describe("prices of the ReviewBench candidate models", () => {
  it.each(CANDIDATE_MODELS)("%s has a real price, not the placeholder fallback", model => {
    expect(priceFor(table, model)).toEqual({ inputPer1M: 0.3, outputPer1M: 0.9, estimated: false });
  });

  it.each(CANDIDATE_MODELS)("two concurrent review reservations on %s fit under the default run cap", model => {
    expect(CHUNK_LIMIT_CHARS).toBe(60_000);
    const budget = new Budget(capsFromEnv({}), 0);
    expect(budget.caps.runUSD).toBe(1);
    const each = reservation(model, CHUNK_LIMIT_CHARS, 32_000);
    expect(each).toBeCloseTo(0.0348, 3);
    expect(() => [budget.reserve(each, "first"), budget.reserve(each, "second")]).not.toThrow();
  });

  it.each(CANDIDATE_MODELS)("four concurrent verify-ctx reservations on %s fit too (24,000 context characters, 16,000 max_tokens)", model => {
    const budget = new Budget(capsFromEnv({}), 0);
    const each = reservation(model, 24_000 + 2_000, 16_000);
    expect(() => [1, 2, 3, 4].map(i => budget.reserve(each, `verify ${i}`))).not.toThrow();
  });

  it.each(CANDIDATE_MODELS)("two concurrent review-missed reservations on %s fit too, with the pooled findings list making the input larger", model => {
    // The largest request review-missed-v1 builds: a full chunk, a full context block, a description
    // at its cut, and every one of 60 pooled findings (more than the 40 a pull request can output) on
    // this chunk's files with a body at the 400-character cut.
    const listed = Array.from({ length: 60 }, (_, i) => ({ path: `src/some/deeply/nested/module-${i}.ts`, line: 10_000 + i, body: "b".repeat(MAX_POOLED_BODY_CHARS + 100) }));
    const user = reviewMissedUserMessage({
      title: "t".repeat(200), description: "d".repeat(MAX_DESCRIPTION_CHARS + 1), renderedChunk: "c".repeat(CHUNK_LIMIT_CHARS * 1.2), part: 1, parts: 9,
      context: "x".repeat(CONTEXT_BUDGET_CHARS), listed,
    });
    expect(user.length).toBeGreaterThan(CHUNK_LIMIT_CHARS + CONTEXT_BUDGET_CHARS + 60 * MAX_POOLED_BODY_CHARS);
    const each = costUSD(priceFor(table, model), estimateInputTokens([{ content: REVIEW_MISSED_SYSTEM_PROMPT }, { content: user }]), 32_000);
    expect(each).toBeGreaterThan(reservation(model, CHUNK_LIMIT_CHARS, 32_000));
    expect(each).toBeLessThan(0.06);
    const budget = new Budget(capsFromEnv({}), 0);
    expect(budget.caps.runUSD).toBe(1);
    expect(() => [budget.reserve(each, "first"), budget.reserve(each, "second")]).not.toThrow();
  });

  it("without a price, the second concurrent review reservation is refused (the blocker this entry fixes)", () => {
    const unpriced = "nvidia/not-in-the-table";
    expect(priceFor(table, unpriced).estimated).toBe(true);
    const budget = new Budget(capsFromEnv({}), 0);
    const each = reservation(unpriced, CHUNK_LIMIT_CHARS, 32_000);
    expect(each).toBeCloseTo(0.58, 2);
    budget.reserve(each, "first");
    expect(() => budget.reserve(each, "second")).toThrow(BudgetExceededError);
  });
});
