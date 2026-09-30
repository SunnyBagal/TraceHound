// Host-side repair agent loop (decision 029): plain TypeScript, native tool calls, no framework.
// The model is reached only through ctx.llm (the harness counts tokens and cost); the sandbox only
// through ctx.exec (one provider op per repo tool = one step); graph tools read the snapshot on
// the host. The harness verifies the result itself - nothing here is trusted for that.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildContext } from "../agent/context.ts";
import { LexicalDecider, NemotronDecider } from "../agent/decider.ts";
import { getEdgeEvidence, getNeighbors, getRelatedTests, searchComponents, type Direction } from "../agent/query.ts";
import type { ChatMessage, ChatRequest, ToolCall, ToolDefinition } from "../llm/client.ts";
import { DEFAULT_MODEL, NO_REASONING } from "../naming/llm.ts";
import type { Snapshot } from "../schema.ts";
import type { Agent, AgentContext } from "./agents.ts";
import { confinePath, GRAPH_TOOLS, REPO_TOOLS, sandboxCommand, ToolInputError, truncate, WORKDIR } from "./tools.ts";

export const AGENT_PROMPT_FILE = path.resolve(import.meta.dirname, "../../../../harness/prompts/agent-v1.md");
const RECORD_RESULT_CHARS = 1500; // tool results kept in the run record (the model saw up to MAX_TOOL_RESULT)

/** The frozen prompt file; `GRAPH: ` lines are included (without the prefix) only when graph tools are on. */
export function renderSystemPrompt(file: string, graph: boolean): { text: string; fileSha256: string; renderedSha256: string } {
  const raw = readFileSync(file, "utf8");
  const text = raw
    .split("\n")
    .flatMap((line) => (line.startsWith("GRAPH: ") ? (graph ? [line.slice("GRAPH: ".length)] : []) : [line]))
    .join("\n")
    .trim();
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  return { text, fileSha256: sha(raw), renderedSha256: sha(text) };
}

export interface LoopTurn {
  turn: number;
  at: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  cached: boolean;
  finishReason?: string;
  content?: string;
  reasoningChars?: number;
  toolCalls: { id: string; name: string; arguments: string }[];
  toolResults: { id: string; name: string; ok: boolean; result: string }[];
}

export interface LoopTrace {
  agent: "nemotron-loop";
  model: string;
  reasoning: "on" | "off";
  temperature: number;
  promptFile: string;
  promptSha256: string;
  renderedPromptSha256: string;
  graph: boolean;
  decider?: string;
  tools: string[];
  turns: LoopTurn[];
  filesRead: string[];
  graphCalls: { turn: number; tool: string; args: unknown }[];
  toolCallCount: number;
  finishSummary?: string;
  stoppedBy?: string;
}

export interface LoopOptions {
  model?: string;
  reasoning?: "on" | "off";
  temperature?: number;
  promptFile?: string;
  /** --graph on: the snapshot of the repo at baseSha, and the decider for context_packet */
  graph?: { snapshot: Snapshot; decider: "lexical" | "nemotron" };
}

type ToolOutcome = { ok: boolean; content: string; finished?: boolean };

export class RepairLoopAgent implements Agent {
  readonly name = "nemotron";
  readonly trace: LoopTrace;
  readonly #opts: Required<Omit<LoopOptions, "graph">> & { graph?: LoopOptions["graph"] };
  readonly #system: string;
  readonly #tools: ToolDefinition[];

  constructor(opts: LoopOptions = {}) {
    this.#opts = {
      model: opts.model ?? DEFAULT_MODEL,
      reasoning: opts.reasoning ?? "off",
      temperature: opts.temperature ?? 0,
      promptFile: opts.promptFile ?? AGENT_PROMPT_FILE,
      graph: opts.graph,
    };
    const prompt = renderSystemPrompt(this.#opts.promptFile, Boolean(opts.graph));
    this.#system = prompt.text;
    this.#tools = [...REPO_TOOLS, ...(opts.graph ? GRAPH_TOOLS : [])];
    this.trace = {
      agent: "nemotron-loop",
      model: this.#opts.model,
      reasoning: this.#opts.reasoning,
      temperature: this.#opts.temperature,
      promptFile: path.basename(this.#opts.promptFile),
      promptSha256: prompt.fileSha256,
      renderedPromptSha256: prompt.renderedSha256,
      graph: Boolean(opts.graph),
      ...(opts.graph && { decider: opts.graph.decider }),
      tools: this.#tools.map((t) => t.function.name),
      turns: [],
      filesRead: [],
      graphCalls: [],
      toolCallCount: 0,
    };
  }

  async run(ctx: AgentContext): Promise<void> {
    if (!ctx.llm) throw new Error("the nemotron agent needs a model client (ctx.llm)");
    const limits = ctx.limits;
    const messages: ChatMessage[] = [
      { role: "system", content: this.#system },
      {
        role: "user",
        content: `Issue:\n${ctx.issue}\n\nLimits for this task: at most ${limits.steps} tool calls, ${limits.tokens} model tokens, ${Math.round(limits.wallClockMs / 1000)} s. Start by exploring the repository.`,
      },
    ];
    for (let turn = 1; ; turn++) {
      const request: ChatRequest = {
        model: this.#opts.model,
        temperature: this.#opts.temperature,
        max_tokens: this.#opts.reasoning === "on" ? 4096 : 2048,
        tools: this.#tools,
        tool_choice: "auto",
        messages,
        ...(this.#opts.reasoning === "off" ? NO_REASONING : {}),
      };
      const res = await ctx.llm.chat(request, { purpose: `repair-agent:${this.name}` }); // BudgetExhausted propagates to the harness
      const calls = res.toolCalls ?? [];
      const record: LoopTurn = {
        turn,
        at: new Date().toISOString(),
        latencyMs: res.latencyMs,
        inputTokens: res.inputTokens ?? 0,
        outputTokens: res.outputTokens ?? 0,
        costUSD: res.costUSD,
        cached: res.cached,
        finishReason: res.finishReason,
        ...(res.content && { content: truncate(res.content, 2000) }),
        ...(res.reasoningChars !== undefined && { reasoningChars: res.reasoningChars }),
        toolCalls: calls.map((c) => ({ id: c.id, name: c.function.name, arguments: truncate(c.function.arguments, 2000) })),
        toolResults: [],
      };
      this.trace.turns.push(record);

      if (!calls.length) {
        ctx.step("no tool call"); // protocol violation: counted as a step
        messages.push({ role: "assistant", content: res.content || "" });
        messages.push({ role: "user", content: "You must act through tool calls. Continue with a tool call, or call finish if you are done." });
        record.toolResults.push({ id: "-", name: "(none)", ok: false, result: "no tool call: nudged to use tools" });
        continue;
      }
      messages.push({ role: "assistant", content: res.content || null, tool_calls: calls });
      let finished = false;
      for (const call of calls) {
        const outcome: ToolOutcome = finished ? { ok: false, content: "not executed: finish was already called in this turn" } : await this.#execute(call, ctx, turn);
        this.trace.toolCallCount++;
        finished ||= Boolean(outcome.finished);
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
        record.toolResults.push({ id: call.id, name: call.function.name, ok: outcome.ok, result: truncate(outcome.content, RECORD_RESULT_CHARS) });
      }
      if (finished) return;
    }
  }

  async #execute(call: ToolCall, ctx: AgentContext, turn: number): Promise<ToolOutcome> {
    const name = call.function.name;
    const tool = this.#tools.find((t) => t.function.name === name);
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(call.function.arguments || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("arguments must be a JSON object");
      args = parsed as Record<string, unknown>;
    } catch (error) {
      ctx.step(`malformed arguments for ${name}`);
      return { ok: false, content: `error: arguments are not valid JSON (${(error as Error).message}): ${truncate(call.function.arguments ?? "", 200)}` };
    }
    if (!tool) {
      ctx.step(`unknown tool ${name}`);
      return { ok: false, content: `error: unknown tool "${name}". Available: ${this.#tools.map((t) => t.function.name).join(", ")}` };
    }
    const problem = checkArgs(tool, args);
    if (problem) {
      ctx.step(`invalid arguments for ${name}`);
      return { ok: false, content: `error: ${problem}` };
    }

    if (name === "finish") {
      ctx.step("finish");
      this.trace.finishSummary = String(args.summary);
      return { ok: true, content: "finished", finished: true };
    }
    if (GRAPH_TOOLS.some((t) => t.function.name === name)) {
      ctx.step(`graph:${name}`);
      this.trace.graphCalls.push({ turn, tool: name, args });
      try {
        return { ok: true, content: truncate(JSON.stringify(await this.#graphTool(name, args, ctx))) };
      } catch (error) {
        return { ok: false, content: `error: ${(error as Error).message}` };
      }
    }

    let cmd: string;
    try {
      cmd = sandboxCommand(name, args);
    } catch (error) {
      if (!(error instanceof ToolInputError)) throw error;
      ctx.step(`rejected ${name}`);
      return { ok: false, content: `error: ${error.message}` };
    }
    const r = await ctx.exec(cmd, { timeoutMs: ctx.limits.commandTimeoutMs }); // one provider op = one step
    const output = `${r.stdout}${r.stderr ? (r.stdout ? "\n" : "") + r.stderr : ""}`;
    if (name === "run") return { ok: r.exitCode === 0, content: truncate(`exit code ${r.exitCode}${r.timedOut ? " (timed out)" : ""}\n${output || "(no output)"}`) };
    if (r.exitCode === 0) {
      if (name === "read_file") {
        const rel = path.posix.relative(WORKDIR, confinePath(args.path)) || ".";
        if (!this.trace.filesRead.includes(rel)) this.trace.filesRead.push(rel);
      }
      return { ok: true, content: truncate(r.stdout || "(no output)") };
    }
    return { ok: false, content: truncate(`error: ${(r.stderr || r.stdout).trim() || `exit code ${r.exitCode}`}`) };
  }

  async #graphTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
    const { snapshot, decider } = this.#opts.graph!;
    switch (name) {
      case "context_packet": {
        const query = typeof args.query === "string" && args.query.trim() ? args.query : ctx.issue;
        const d = decider === "nemotron" ? new NemotronDecider({ chat: (req, meta) => ctx.llm!.chat(req, meta) }) : new LexicalDecider();
        const decided = await d.decide({ issue: query, snapshot, k: 3 });
        return buildContext(snapshot, query, { decided });
      }
      case "search_components":
        return searchComponents(snapshot, String(args.query));
      case "get_neighbors":
        return getNeighbors(snapshot, String(args.componentId), (args.direction as Direction | undefined) ?? "both", args.kinds as string[] | undefined);
      case "get_edge_evidence":
        return getEdgeEvidence(snapshot, String(args.edgeId));
      case "get_related_tests":
        return getRelatedTests(snapshot, String(args.componentId));
    }
    throw new Error(`unknown graph tool ${name}`);
  }
}

/** Minimal JSON-schema check for our flat tool schemas: required keys, primitive types, enums, no extras. */
export function checkArgs(tool: ToolDefinition, args: Record<string, unknown>): string | undefined {
  const schema = tool.function.parameters as { properties: Record<string, { type?: string; enum?: string[]; minimum?: number }>; required?: string[] };
  for (const key of schema.required ?? []) if (!(key in args)) return `${tool.function.name}: missing required argument "${key}"`;
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key];
    if (!prop) return `${tool.function.name}: unknown argument "${key}"`;
    const ok =
      prop.type === "string" ? typeof value === "string" : prop.type === "integer" ? Number.isInteger(value) : prop.type === "array" ? Array.isArray(value) : true;
    if (!ok) return `${tool.function.name}: "${key}" must be ${prop.type === "integer" ? "an integer" : `a ${prop.type}`}`;
    if (prop.enum && !prop.enum.includes(value as string)) return `${tool.function.name}: "${key}" must be one of ${prop.enum.join(", ")}`;
    if (prop.minimum !== undefined && typeof value === "number" && value < prop.minimum) return `${tool.function.name}: "${key}" must be >= ${prop.minimum}`;
  }
  return undefined;
}
