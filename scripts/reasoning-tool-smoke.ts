// Smoke test (decision 033, diagnostic runs): ONE Nemotron Nano call with thinking on
// (chat_template_kwargs.enable_thinking = true) and the repair agent's own tool definitions,
// first turn of toy-discount with the agent-v3 prompt (graph off). Reports whether native tool
// calls come back valid, and the response shape with text trimmed. Through the shared client
// (budget → request → ledger), cache reads off.
// Usage: node --env-file=.env scripts/reasoning-tool-smoke.ts
import path from "node:path";
import { formatTestCommands, AGENT_PROMPT_FILE, renderSystemPrompt } from "../packages/analyzer/src/harness/loop.ts";
import { taskTestCommands } from "../packages/analyzer/src/harness/run.ts";
import { loadTask } from "../packages/analyzer/src/harness/task.ts";
import { REPO_TOOLS } from "../packages/analyzer/src/harness/tools.ts";
import type { ChatRequest } from "../packages/analyzer/src/llm/client.ts";
import { createTokenFactoryClient } from "../packages/analyzer/src/llm/setup.ts";
import { DEFAULT_MODEL } from "../packages/analyzer/src/naming/llm.ts";

const task = loadTask(path.resolve(import.meta.dirname, "../eval/tasks/toy-discount/task.json")).spec;
const system = renderSystemPrompt(AGENT_PROMPT_FILE, false, { TEST_COMMANDS: formatTestCommands(taskTestCommands(task)) }).text;
const request: ChatRequest = {
  model: DEFAULT_MODEL,
  temperature: 0,
  max_tokens: 4096,
  tools: REPO_TOOLS,
  tool_choice: "auto",
  messages: [
    { role: "system", content: system },
    { role: "user", content: `Issue:\n${task.issue}\n\nLimits for this task: at most ${task.limits.steps} tool calls, ${task.limits.tokens} model tokens, ${Math.round(task.limits.wallClockMs / 1000)} s. Start by exploring the repository.` },
  ],
  chat_template_kwargs: { enable_thinking: true },
};
const trim = (v: unknown, n = 160) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…(${s.length} chars)` : s;
};
const { client } = createTokenFactoryClient({ readCache: false });
const r = await client.chat(request, { purpose: "reasoning-tool-smoke" });
const m = (r.message ?? {}) as Record<string, unknown>;
const toolNames = new Set(REPO_TOOLS.map((t) => t.function.name));
const calls = (r.toolCalls ?? []).map((c) => {
  let args: unknown;
  let validJson = true;
  try {
    args = JSON.parse(c.function.arguments);
  } catch {
    validJson = false;
  }
  return { id: c.id, type: c.type, name: c.function.name, knownTool: toolNames.has(c.function.name), arguments: trim(c.function.arguments, 200), argumentsValidJson: validJson && !!args && typeof args === "object" };
});
console.log(
  JSON.stringify(
    {
      request: { model: request.model, chat_template_kwargs: request.chat_template_kwargs, tools: [...toolNames], max_tokens: request.max_tokens },
      finish_reason: r.finishReason,
      message_keys: Object.keys(m),
      content: trim(m.content ?? null),
      reasoning: trim(m.reasoning ?? m.reasoning_content ?? null),
      reasoningChars: r.reasoningChars,
      reasoningTokens: r.reasoningTokens ?? "not reported",
      tool_calls: calls,
      usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUSD: r.costUSD, latencyMs: r.latencyMs },
      verdict: calls.length > 0 && calls.every((c) => c.knownTool && c.argumentsValidJson) ? "valid native tool calls" : "NO valid native tool calls",
    },
    null,
    2,
  ),
);
