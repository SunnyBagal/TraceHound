// Decision 076g item 4 (AGENTS.md exception (1)): `--provider-config <file>` on the review, review-ctx and verify-ctx
// CLIs selects the report-only dev Anthropic client (llm/provider.ts). Without the option each CLI builds its Nebius
// client exactly as before; there is no env switch and no default change.
import { readFileSync } from "node:fs";
import type { ChatClient } from "../agent/decider.ts";
import type { Budget } from "../llm/budget.ts";
import { createDevReportClient, parseAnthropicRowConfig } from "../llm/provider.ts";

/** The Anthropic client for an explicit row config, or a fixed error line (never a key or a raw exception). */
export function providerClient(file: string, model: string, reasoning: "on" | "off",
  inject: { env?: NodeJS.ProcessEnv; stateDir?: string; fetch?: typeof fetch } = {}, // tests only
): { client: ChatClient; budget: Budget } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { error: "--provider-config is not a readable JSON file" };
  }
  const config = parseAnthropicRowConfig(raw);
  if (!config) return { error: "--provider-config must be {provider: anthropic, scope: report-only-dev, model, effort?, thinking?} with a ruled model" };
  if (config.model !== model) return { error: "--model must equal the provider config's model (no model fallback)" };
  // the CLI's --reasoning becomes the request's enable_thinking, which the Anthropic client honours over the row's own
  // thinking setting: a row that says one thing while the request asks for the other is refused, never run as recorded
  if (config.thinking !== undefined && (config.thinking === "off") !== (reasoning === "off")) {
    return { error: `--provider-config thinking ${config.thinking} conflicts with --reasoning ${reasoning} (thinking off needs --reasoning off; adaptive needs --reasoning on)` };
  }
  try {
    // 600 s as the Nebius path of these CLIs: a timeout fails the chunk and charges the upper bound
    const { client, budget } = createDevReportClient(config, { ...inject, timeoutMs: 600_000 });
    return { client, budget };
  } catch (e) {
    // the provider's own messages are fixed strings (missing key, missing caps); nothing else is echoed
    const m = (e as Error).message;
    return { error: /^(ANTHROPIC_API_KEY is not set|TRACEHOUND_BUDGET_ANTHROPIC_(RUN_)?USD must be)/.test(m) ? m : "Anthropic client setup failed" };
  }
}
