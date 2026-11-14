// --provider-config on the review, review-ctx and verify-ctx CLIs (decision 076g item 4, AGENTS.md exception (1)):
// an explicit report-only dev Anthropic row; without it nothing changes. Invented text, injected fetch, no network.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_URL } from "../src/llm/anthropic.ts";
import { SpendLedger } from "../src/llm/ledger.ts";
import { parseAnthropicRowConfig } from "../src/llm/provider.ts";
import { providerClient } from "../src/review/provider-option.ts";
import { REVIEW_PROMPT_SHA256, reviewPull } from "../src/review/review.ts";
import { main as reviewMain } from "../src/review/cli.ts";
import { main as ctxMain } from "../src/review/ctx-cli.ts";
import { main as verifyCtxMain } from "../src/review/verify-ctx-cli.ts";

const KEY = "invented-anthropic-key-for-provider-option";
const HAIKU = "claude-haiku-5-5";
const env = { ANTHROPIC_API_KEY: KEY, TRACEHOUND_BUDGET_ANTHROPIC_USD: "2.5", TRACEHOUND_BUDGET_ANTHROPIC_RUN_USD: "0.2" };
const DIFF = "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1,2 @@\n-a\n+b\n+c\n";

function dir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "th-provider-option-"));
}
function configFile(d: string, config: unknown): string {
  const f = path.join(d, "row.json");
  writeFileSync(f, JSON.stringify(config));
  return f;
}
const row = { provider: "anthropic", scope: "report-only-dev", model: HAIKU };

afterEach(() => vi.restoreAllMocks());

describe("parseAnthropicRowConfig", () => {
  it("accepts only an explicit report-only dev row on a ruled model", () => {
    expect(parseAnthropicRowConfig(row)).toEqual(row);
    expect(parseAnthropicRowConfig({ ...row, effort: "high", thinking: "off" })).toMatchObject({ effort: "high", thinking: "off" });
    for (const bad of [{}, { provider: "nebius" }, { ...row, scope: "primary" }, { ...row, model: "nvidia/Nemotron-3.5-Super-VL" },
      { ...row, extra: 1 }, { ...row, effort: "max", thinking: "off" }, null, "anthropic"]) {
      expect(parseAnthropicRowConfig(bad)).toBeNull();
    }
  });
});

describe("providerClient", () => {
  it("refuses an unreadable file, a non-Anthropic config, a model that differs from --model, and missing caps or key", () => {
    const d = dir();
    expect(providerClient(path.join(d, "missing.json"), HAIKU, { env, stateDir: d })).toEqual({ error: "--provider-config is not a readable JSON file" });
    expect(providerClient(configFile(d, { provider: "nebius" }), HAIKU, { env, stateDir: d })).toMatchObject({ error: expect.stringMatching(/^--provider-config must be/) });
    expect(providerClient(configFile(d, row), "nvidia/Nemotron-3.5-Super-VL", { env, stateDir: d }))
      .toEqual({ error: "--model must equal the provider config's model (no model fallback)" });
    expect(providerClient(configFile(d, row), HAIKU, { env: { ANTHROPIC_API_KEY: KEY }, stateDir: d }))
      .toMatchObject({ error: expect.stringMatching(/^TRACEHOUND_BUDGET_ANTHROPIC_USD must be explicitly set/) });
    const noKey = providerClient(configFile(d, row), HAIKU, { env: { ...env, ANTHROPIC_API_KEY: "" }, stateDir: d });
    expect(noKey).toMatchObject({ error: expect.stringMatching(/^ANTHROPIC_API_KEY is not set/) });
    expect(JSON.stringify(noKey)).not.toContain(KEY);
  });

  it("runs the frozen review prompt on the row's model: same system prompt sha, no temperature, its own ledger and caps", async () => {
    const d = dir();
    const bodies: Record<string, unknown>[] = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe(ANTHROPIC_URL);
      bodies.push(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ model: HAIKU, stop_reason: "end_turn",
        content: [{ type: "text", text: '{"findings":[]}' }], usage: { input_tokens: 1000, output_tokens: 200 } }), { status: 200 });
    }) as typeof globalThis.fetch;
    const p = providerClient(configFile(d, row), HAIKU, { env, stateDir: d, fetch });
    if ("error" in p) throw new Error(p.error);
    expect(p.budget.caps).toEqual({ totalUSD: 2.5, runUSD: 0.2 });
    const out = await reviewPull(p.client, { title: "Invented change", description: "", diff: DIFF }, { model: HAIKU, reasoning: "on" });
    expect(out.review.chunks.map((c) => c.status)).toEqual(["OK"]);
    expect(out.review.promptSha256).toBe(REVIEW_PROMPT_SHA256);
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(createHash("sha256").update(body.system as string).digest("hex")).toBe(REVIEW_PROMPT_SHA256);
    expect(body).toMatchObject({ model: HAIKU, thinking: { type: "adaptive" }, output_config: { effort: "medium" } });
    expect(body).not.toHaveProperty("temperature");
    const rows = new SpendLedger(path.join(d, "spend.anthropic.jsonl")).entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "anthropic", model: HAIKU, ok: true, usageReported: true, purpose: expect.any(String),
      settings: { sampling: "default", thinking: "adaptive", effort: "medium" } });
    expect(readFileSync(path.join(d, "spend.anthropic.jsonl"), "utf8")).not.toContain(KEY);
  });
});

describe("the three CLIs take --provider-config and refuse a mismatched row before any request", () => {
  function inputs() {
    const d = dir();
    const pr = path.join(d, "pr.json");
    writeFileSync(pr, JSON.stringify({ title: "Invented change", description: "", diff: DIFF }));
    const review = path.join(d, "review.json");
    writeFileSync(review, JSON.stringify({ pr_title: "Invented change", comments: [] }));
    return { d, pr, review, cfg: configFile(d, row) };
  }
  const cases: [string, (i: ReturnType<typeof inputs>) => Promise<number>][] = [
    ["review", (i) => reviewMain(["--pr", i.pr, "--out", path.join(i.d, "out.json"), "--provider-config", i.cfg])],
    ["review-ctx", (i) => ctxMain(["--pr", i.pr, "--head", "a".repeat(40), "--repo", i.d, "--out", path.join(i.d, "out.json"), "--provider-config", i.cfg])],
    ["verify-ctx", (i) => verifyCtxMain(["--review", i.review, "--pr", i.pr, "--head", "a".repeat(40), "--repo", i.d,
      "--out", path.join(i.d, "v.json"), "--kept", path.join(i.d, "k.json"), "--provider-config", i.cfg])],
  ];
  for (const [name, run] of cases) {
    it(`${name}: the default --model is not the row's model, so it exits 1 with a fixed line and no network`, async () => {
      const errors: string[] = [];
      vi.spyOn(console, "error").mockImplementation((m: unknown) => { errors.push(String(m)); });
      const fetch = vi.spyOn(globalThis, "fetch");
      expect(await run(inputs())).toBe(1);
      expect(errors).toContain("--model must equal the provider config's model (no model fallback)");
      expect(fetch).not.toHaveBeenCalled();
    });
  }
  it("review with the row's model but no Anthropic caps exits 1 on the cap line (never a Nebius fallback)", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((m: unknown) => { errors.push(String(m)); });
    const i = inputs();
    expect(await reviewMain(["--pr", i.pr, "--out", path.join(i.d, "out.json"), "--model", HAIKU, "--provider-config", i.cfg])).toBe(1);
    expect(errors.join("\n")).toMatch(/TRACEHOUND_BUDGET_ANTHROPIC_USD must be explicitly set/);
    expect(errors.join("\n")).not.toMatch(/NEBIUS_API_KEY/);
  });
});
