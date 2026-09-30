// Spike: OpenAI-style tool calling on Nemotron Nano (Token Factory). At most 6 calls; each goes
// through the shared client (cache → budget → request → ledger).
// Usage: TRACEHOUND_BUDGET_TOTAL_USD=… node --env-file=.env scripts/tool-calling-spike.ts
import { writeFileSync } from "node:fs";
import type { ChatMessage, ChatRequest, ToolDefinition } from "../packages/analyzer/src/llm/client.ts";
import { createTokenFactoryClient } from "../packages/analyzer/src/llm/setup.ts";
import { DEFAULT_MODEL, NO_REASONING } from "../packages/analyzer/src/naming/llm.ts";

const tools: ToolDefinition[] = [
  { type: "function", function: { name: "add", description: "Add two numbers and return the sum.", parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } } },
  { type: "function", function: { name: "get_weather", description: "Current weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
];
const user: ChatMessage = { role: "user", content: "Use the tools: add 17 and 25, and get the weather in Paris. Then tell me both results." };
const base = (reasoningOn: boolean, messages: ChatMessage[]): ChatRequest => ({
  model: DEFAULT_MODEL, temperature: 0, max_tokens: 1000, tools, tool_choice: "auto", messages, ...(reasoningOn ? {} : NO_REASONING),
});
const trim = (v: unknown, n = 300) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…(${s.length} chars)` : s; };
const { client } = createTokenFactoryClient({ readCache: false });
const out: Record<string, unknown> = {};
const shape = (r: Awaited<ReturnType<typeof client.chat>>) => {
  const m = r.message ?? {};
  return {
    finish_reason: r.finishReason, latencyMs: r.latencyMs, usage: { in: r.inputTokens, out: r.outputTokens }, costUSD: r.costUSD,
    message_keys: Object.keys(m),
    content: trim(m.content), reasoning: trim(m.reasoning ?? m.reasoning_content, 200),
    tool_calls: (r.toolCalls ?? []).map((c) => { let valid = true; try { JSON.parse(c.function.arguments); } catch { valid = false; } return { id: c.id, type: c.type, name: c.function.name, arguments: c.function.arguments, argumentsValidJson: valid }; }),
  };
};

// (a) reasoning off
const a = await client.chat(base(false, [user]), { purpose: "tool-spike" });
out.a_reasoning_off = shape(a);
// (b) reasoning on (model default)
const b = await client.chat(base(true, [user]), { purpose: "tool-spike" });
out.b_reasoning_on = shape(b);
// (c) second turn with tool results, continuing (a)
if (a.toolCalls?.length) {
  const results: ChatMessage[] = a.toolCalls.map((c) => ({ role: "tool", tool_call_id: c.id, content: c.function.name === "add" ? JSON.stringify({ sum: 42 }) : JSON.stringify({ city: "Paris", tempC: 18, sky: "cloudy" }) }));
  const c = await client.chat(base(false, [user, { role: "assistant", content: (a.message?.content as string | null) ?? null, tool_calls: a.toolCalls }, ...results]), { purpose: "tool-spike" });
  out.c_second_turn = shape(c);
} else out.c_second_turn = "skipped: (a) returned no tool_calls";
writeFileSync(process.argv[2] ?? "/dev/stdout", JSON.stringify(out, null, 2) + "\n");
