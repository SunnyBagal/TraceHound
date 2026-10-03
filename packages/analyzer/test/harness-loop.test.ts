// Repair loop (decision 029) with a scripted fake model. Protocol/limit cases use the in-memory
// provider; the end-to-end fix and the symlink escape use a real Docker sandbox (skipped without Docker).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import type { ChatRequest, ChatResult, ToolCall } from "../src/llm/client.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import {
  AGENT_PROMPT_FILE,
  AGENT_PROMPT_V1_FILE,
  AGENT_PROMPT_V2_FILE,
  AGENT_PROMPT_V3_FILE,
  AGENT_PROMPT_V4_FILE,
  checkArgs,
  EMPTY_FINISH_MESSAGE,
  formatTestCommands,
  noEditNudge,
  PACKET_HEADING,
  RepairLoopAgent,
  renderSystemPrompt,
  type LoopTrace,
} from "../src/harness/loop.ts";
import { repoStateCommand, runRepair, SQUASH_HISTORY } from "../src/harness/run.ts";
import { loadTask, type LoadedTask, type TaskSpec } from "../src/harness/task.ts";
import { capOutput, confinePath, EDIT_FALLBACK_JS, GRAPH_TOOLS, REPO_TOOLS } from "../src/harness/tools.ts";
import { buildContext, formatContext } from "../src/agent/context.ts";
import { LexicalDecider } from "../src/agent/decider.ts";
import { NoopAgent } from "../src/harness/agents.ts";
import { loadSnapshot } from "../src/agent/query.ts";

/** A real snapshot (Recall @ 57d920e, eval/snapshots), so graph-on runs build a real context packet. */
const RECALL_SNAPSHOT = loadSnapshot(path.resolve(import.meta.dirname, "../../../eval/snapshots/57d920e4c93b9185c8dbe7350d98633c4732c78e/0.10.0.json")).snapshot;

let n = 0;
const call = (name: string, args: unknown, raw?: string): ToolCall => ({ id: `call-${++n}`, type: "function", function: { name, arguments: raw ?? JSON.stringify(args) } });
/** Fake model: each turn returns the next scripted tool calls (or text), with fixed usage. */
function fakeModel(script: (turn: number, req: ChatRequest) => ToolCall[] | string) {
  const requests: ChatRequest[] = [];
  let turn = 0;
  return {
    requests,
    client: {
      async chat(req: ChatRequest): Promise<ChatResult> {
        requests.push(structuredClone(req));
        const out = script(++turn, req);
        const toolCalls = typeof out === "string" ? undefined : out;
        return { content: typeof out === "string" ? out : "", cached: false, latencyMs: 5, inputTokens: 100, outputTokens: 10, costUSD: 0.0001, ...(toolCalls && { toolCalls, finishReason: "tool_calls" }) };
      },
    },
  };
}

/**
 * Fake sandbox: every edit_file/write_file (or a `run` containing "touch") changes the repo state;
 * only edit_file (or the `run` command "delete-base-file") changes a file that existed at the base commit.
 */
class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  execs: string[] = [];
  changes = 0;
  baseChanges = 0;
  async create(): Promise<SandboxHandle> {
    return { id: "fake-1", provider: this.name };
  }
  async disableNetwork() {}
  async exec(_h: SandboxHandle, cmd: string): Promise<ExecResult> {
    this.execs.push(cmd);
    if (cmd === SQUASH_HISTORY) return { exitCode: 0, stdout: `${"b".repeat(40)}\n`, stderr: "", durationMs: 1, timedOut: false };
    if (cmd === repoStateCommand("b".repeat(40)))
      return { exitCode: 0, stdout: `${String(this.changes).padStart(64, "0")}\n${this.changes ? 100 : 0}\n${this.baseChanges}\n`, stderr: "", durationMs: 1, timedOut: false };
    if (cmd.startsWith("git ls-tree")) return { exitCode: 0, stdout: "package.json\0src/cart.ts\0tests/cart.test.ts\0", stderr: "", durationMs: 1, timedOut: false };
    if (/ (edit_file|write_file)$/.test(cmd) || cmd.includes("touch") || cmd === "delete-base-file") this.changes++;
    if (/ edit_file$/.test(cmd) || cmd === "delete-base-file") this.baseChanges++;
    if (cmd === "print-long") return { exitCode: 0, stdout: Array.from({ length: 10_000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join(""), stderr: "", durationMs: 1, timedOut: false };
    const fail = cmd.startsWith("curl") || cmd.startsWith("run-repro");
    return { exitCode: fail ? 1 : 0, stdout: "", stderr: "", durationMs: 1, timedOut: false };
  }
  async writeFile() {}
  async readFile() {
    return "";
  }
  async destroy() {}
}
const fakeTask = (limits: Partial<TaskSpec["limits"]> = {}): LoadedTask => ({
  spec: {
    id: "fake",
    source: { localPath: "/x" },
    baseSha: "a".repeat(40),
    setup: [],
    issue: "discounts are wrong",
    repro: { testFile: "r.ts", dest: "r.test.ts", command: "run-repro" },
    regression: ["bun test ./tests"],
    typecheck: { packages: ["."], command: "tsc --noEmit" },
    limits: { steps: 10, wallClockMs: 60_000, tokens: 100_000, commandTimeoutMs: 5_000, costUSD: 0.1, ...limits },
  },
  dir: "/tasks",
  reproContent: "",
  localPath: "/x",
});
const trace = (r: { agentRun?: { trace?: unknown } }) => r.agentRun!.trace as LoopTrace;

describe("prompt", () => {
  it("agent-v5 is the default: one frozen file for both conditions; only the two GRAPH sentences differ; environment facts identical", () => {
    const vars = { TEST_COMMANDS: formatTestCommands(["bun test ./tests", "tsc --noEmit"]) };
    const off = renderSystemPrompt(AGENT_PROMPT_FILE, false, vars);
    const on = renderSystemPrompt(AGENT_PROMPT_FILE, true, vars);
    expect(off.fileSha256).toBe(on.fileSha256);
    expect(on.text.startsWith(off.text)).toBe(true);
    expect(on.text.slice(off.text.length).trim().split("\n")).toHaveLength(2); // the graph tools, and the injected packet (agent-v5)
    expect(on.text.split("\n").at(-1)).toMatch(/^The first message also contains a context packet built from that graph/);
    expect(off.text).not.toMatch(/GRAPH|graph|context_packet|component|packet/);
    expect(off.text).toContain("- Test commands for this repository (run from /work):\n  - `bun test ./tests`\n  - `tsc --noEmit`");
    expect(off.text).toMatch(/Not installed: node, npm, npx, yarn, ts-node, ripgrep \(rg\)/);
    expect(() => renderSystemPrompt(AGENT_PROMPT_FILE, false)).toThrow(/no value for \{\{TEST_COMMANDS\}\}/);
    // agent-v4: one way to run scratch code, in /scratch; no `bun -e`
    expect(off.text).toContain("- To run scratch code: write the file in /scratch with write_file");
    expect(off.text).toContain("then run it with `bun run /scratch/check.ts`. /scratch is outside the repository and never part of your change. This is the only way to run scratch code.");
    expect(off.text).not.toContain("bun -e");
    // v1-v4 are kept, and their GRAPH sentence is v5's first one
    for (const file of [AGENT_PROMPT_V1_FILE, AGENT_PROMPT_V2_FILE, AGENT_PROMPT_V3_FILE, AGENT_PROMPT_V4_FILE]) expect(renderSystemPrompt(file, true, vars).text.split("\n").at(-1)).toBe(on.text.split("\n").at(-2));
    // v5 only adds lines to v4 (the packet's GRAPH line, and the tuning rounds' lines, which both arms get)
    const v4 = renderSystemPrompt(AGENT_PROMPT_V4_FILE, true, vars).text.split("\n");
    const v5 = on.text.split("\n");
    let at = 0;
    for (const line of v5) if (line === v4[at]) at++;
    expect(at).toBe(v4.length);
    expect(new RepairLoopAgent().trace.reasoning).toBe("on"); // agent-v4 default, kept in v5
    const agent = new RepairLoopAgent({ reasoning: "off" });
    expect(agent.trace).toMatchObject({ loopVersion: "agent-v5", promptFile: "agent-v5.md", promptSha256: off.fileSha256, graph: false, reasoning: "off", deciderVersion: "decider-v1" });
    expect(agent.trace.tools).toEqual(["list_dir", "read_file", "search", "edit_file", "write_file", "run", "finish"]);
  });

  it("the rendered prompt (with the task's test commands) and its hash are recorded, the same text with graph off and on", async () => {
    const run = async (graph: boolean) => {
      const { client, requests } = fakeModel(() => [call("finish", { summary: "x" })]);
      const agent = new RepairLoopAgent(graph ? { graph: { snapshot: RECALL_SNAPSHOT, decider: "lexical" } } : {});
      const r = await runRepair({ task: fakeTask(), agent, provider: new FakeProvider(), image: "img", llm: client });
      return { system: requests[0]!.messages[0]!.content as string, t: trace(r) };
    };
    const [off, on] = [await run(false), await run(true)];
    expect(off.t.testCommands).toEqual(["bun test ./tests", "tsc --noEmit"]);
    expect(on.t.testCommands).toEqual(off.t.testCommands);
    expect(off.t.renderedPromptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(on.system.startsWith(off.system)).toBe(true);
    expect(on.system.slice(off.system.length).trim().split("\n")).toHaveLength(2);
  });
});

describe("agent-v5: the graph-on arm (decision 045; fake provider, fake model)", () => {
  const graphOn = () => new RepairLoopAgent({ graph: { snapshot: RECALL_SNAPSHOT, decider: "lexical" } });
  const firstUser = (requests: ChatRequest[]) => requests[0]!.messages[1]!.content as string;
  const finishTwice = () => fakeModel(() => [call("finish", { summary: "x" })]);

  it("graph on: the first message carries the context tool's packet for the issue; graph off: the same message without it", async () => {
    const off = finishTwice();
    const on = finishTwice();
    const rOff = await runRepair({ task: fakeTask(), agent: new RepairLoopAgent(), provider: new FakeProvider(), image: "img", llm: off.client });
    const rOn = await runRepair({ task: fakeTask(), agent: graphOn(), provider: new FakeProvider(), image: "img", llm: on.client });
    // exactly what `tracehound context --issue <issue>` prints for this snapshot (lexical decider, default budget)
    const packet = formatContext(buildContext(RECALL_SNAPSHOT, "discounts are wrong", { decided: await new LexicalDecider().decide({ issue: "discounts are wrong", snapshot: RECALL_SNAPSHOT, k: 3 }) }));
    expect(firstUser(on.requests)).toBe(firstUser(off.requests).replace("\n\nLimits for this task", `\n\n${PACKET_HEADING}\n${packet}\n\nLimits for this task`));
    expect(firstUser(off.requests)).toBe("Issue:\ndiscounts are wrong\n\nLimits for this task: at most 10 tool calls, 100000 model tokens, 60 s. Start by exploring the repository.");
    expect(trace(rOn).packet).toEqual({ injected: true, chars: packet.length, tokensEstimated: Math.ceil(packet.length / 4), sha256: expect.stringMatching(/^[0-9a-f]{64}$/), decider: "lexical", confidence: expect.any(String) });
    expect(trace(rOff).packet).toEqual({ injected: false });
    expect(rOn.arm).toEqual({ arm: "graph-on", packetInjected: true, packetChars: packet.length, packetTokensEstimated: Math.ceil(packet.length / 4), graphToolCalls: 0 });
    expect(rOff.arm).toEqual({ arm: "graph-off", packetInjected: false, graphToolCalls: 0 });
    // graph tools only with graph on; the packet costs no step
    expect(on.requests[0]!.tools!.map((t) => t.function.name)).toEqual([...REPO_TOOLS, ...GRAPH_TOOLS].map((t) => t.function.name));
    expect(off.requests[0]!.tools!.map((t) => t.function.name)).toEqual(REPO_TOOLS.map((t) => t.function.name));
    expect(rOn.agentRun!.steps).toBe(rOff.agentRun!.steps);
  });

  it("graph tool calls are counted in the record's arm", async () => {
    const { client } = fakeModel((turn) =>
      turn === 1 ? [call("search_components", { query: "worker" }), call("get_neighbors", { componentId: "recall-backend:worker" })] : [call("finish", { summary: "x" })],
    );
    const r = await runRepair({ task: fakeTask(), agent: graphOn(), provider: new FakeProvider(), image: "img", llm: client });
    expect(r.arm).toMatchObject({ arm: "graph-on", packetInjected: true, graphToolCalls: 2 });
    expect(trace(r).graphCalls.map((c) => c.tool)).toEqual(["search_components", "get_neighbors"]);
  });

  it("the packet counts against the token budget: the same limit that lets graph off start stops graph on", async () => {
    // a model that bills input tokens as characters / 4 of everything it is sent
    const billing = () => ({
      async chat(req: ChatRequest): Promise<ChatResult> {
        const chars = req.messages.reduce((n, m) => n + String(m.content ?? "").length, 0);
        return { content: "", cached: false, latencyMs: 1, inputTokens: Math.ceil(chars / 4), outputTokens: 10, costUSD: 0, toolCalls: [call("finish", { summary: "x" })], finishReason: "tool_calls" };
      },
    });
    const limit = { tokens: 1500 }; // the system prompt + issue are under it; with a ~1,000-token packet they are over
    const rOff = await runRepair({ task: fakeTask(limit), agent: new RepairLoopAgent(), provider: new FakeProvider(), image: "img", llm: billing() });
    const rOn = await runRepair({ task: fakeTask(limit), agent: graphOn(), provider: new FakeProvider(), image: "img", llm: billing() });
    expect(rOff.agentRun!.budgetExhausted).toBeUndefined();
    expect(rOn.agentRun!.budgetExhausted).toBe("tokens 1500");
    // graph off made two calls (finish, then the confirming finish); graph on stopped after its first
    expect(rOn.usage.inputTokens).toBeGreaterThan(rOff.usage.inputTokens / 2 + rOn.arm!.packetTokensEstimated!);
  });

  it("scripted agents record no arm", async () => {
    const r = await runRepair({ task: fakeTask(), agent: new NoopAgent(), provider: new FakeProvider(), image: "img" });
    expect(r.arm).toBeUndefined();
  });
});

describe("path confinement", () => {
  it("rejects paths that leave /work on the host side", () => {
    expect(confinePath("src/cart.ts")).toBe("/work/src/cart.ts");
    expect(confinePath("/work/src")).toBe("/work/src");
    for (const bad of ["../etc/passwd", "/etc/passwd", "src/../../root", "/workshop/x", "/scratchy/x", "/scratch/../etc/passwd", "../scratch2"]) expect(() => confinePath(bad)).toThrow(/escapes the repository/);
    // agent-v4: /scratch is the one place outside the repo
    expect(confinePath("/scratch/check.ts")).toBe("/scratch/check.ts");
    expect(confinePath("../scratch/check.ts")).toBe("/scratch/check.ts");
  });
  it("checks arguments against the tool schema", () => {
    const read = REPO_TOOLS.find((t) => t.function.name === "read_file")!;
    expect(checkArgs(read, { path: "a" })).toBeUndefined();
    expect(checkArgs(read, {})).toBe('read_file: missing required argument "path"');
    expect(checkArgs(read, { path: "a", startLine: 1.5 })).toBe('read_file: "startLine" must be an integer');
    expect(checkArgs(read, { path: "a", bogus: 1 })).toBe('read_file: unknown argument "bogus" (valid arguments: path, startLine, endLine)');
  });
});

describe("loop protocol and limits (fake provider, fake model)", () => {
  it("malformed arguments, unknown tools, a path escape and a text-only turn each cost a step and get an error result", async () => {
    const provider = new FakeProvider();
    const { client, requests } = fakeModel((turn) =>
      turn === 1
        ? [call("read_file", null, "{not json"), call("delete_everything", {}), call("read_file", { path: "../../etc/passwd" })]
        : turn === 2
          ? "I think the bug is in cart.ts"
          : [call("finish", { summary: "gave up" })],
    );
    const r = await runRepair({ task: fakeTask(), agent: new RepairLoopAgent({ reasoning: "off" }), provider, image: "img", llm: client });
    const t = trace(r);
    expect(r.agentRun!.steps).toBe(6); // 3 bad calls + 1 text-only turn + finish (unchanged repo: asked to confirm) + finish
    const results = t.turns[0]!.toolResults.map((x) => x.result);
    expect(results[0]).toMatch(/^error: arguments are not valid JSON \(/);
    expect(results[1]).toMatch(/^error: unknown tool "delete_everything"\. Available: list_dir, read_file/);
    expect(results[2]).toBe("error: path escapes the repository: ../../etc/passwd");
    expect(t.turns[1]!.toolResults[0]!.result).toBe("no tool call: nudged to use tools");
    expect(requests[2]!.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringMatching(/must act through tool calls/) });
    expect(provider.execs.filter((c) => c.includes("TH_ARGS"))).toEqual([]); // nothing reached the sandbox
    expect(t.finishSummary).toBe("gave up");
    expect(r.finalState).toBe("UNRESOLVED"); // judged by the repro, not the summary
  });

  it("a model that loops until the step limit ends UNRESOLVED (budget)", async () => {
    const { client } = fakeModel(() => [call("list_dir", { path: "." })]);
    const r = await runRepair({ task: fakeTask({ steps: 4 }), agent: new RepairLoopAgent(), provider: new FakeProvider(), image: "img", llm: client });
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: steps 4" });
    expect(trace(r).turns).toHaveLength(5);
    expect(r.usage).toMatchObject({ llmCalls: 5, inputTokens: 500, outputTokens: 50 }); // counted by the harness
  });

  it("the per-run $ cap ends UNRESOLVED (budget)", async () => {
    const { client } = fakeModel(() => [call("list_dir", { path: "." })]);
    const r = await runRepair({ task: fakeTask({ costUSD: 0.00025 }), agent: new RepairLoopAgent(), provider: new FakeProvider(), image: "img", llm: client });
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: cost $0.00025" });
    expect(r.usage.calls).toHaveLength(3);
  });

  it("the token limit ends UNRESOLVED (budget); reasoning mode and model are recorded", async () => {
    const { client, requests } = fakeModel(() => [call("list_dir", { path: "." })]);
    const r = await runRepair({ task: fakeTask({ tokens: 250 }), agent: new RepairLoopAgent({ reasoning: "on" }), provider: new FakeProvider(), image: "img", llm: client });
    expect(r.reason).toBe("budget exhausted: tokens 250");
    expect(trace(r)).toMatchObject({ reasoning: "on", model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" });
    expect(requests[0]).toMatchObject({ chat_template_kwargs: { enable_thinking: true } }); // reasoning on = thinking explicitly enabled
    expect(requests[0]).toMatchObject({ temperature: 0, tool_choice: "auto" });
  });
});

describe("agent-v2 competence guards (fake provider, fake model; identical with graph on and off)", () => {
  const conditions = [
    ["graph off", () => new RepairLoopAgent()],
    ["graph on", () => new RepairLoopAgent({ graph: { snapshot: RECALL_SNAPSHOT, decider: "lexical" } })],
  ] as const;

  for (const [label, make] of conditions) {
    it(`repeat guard (${label}): the 3rd identical call on an unchanged repo is refused but counts; re-running after an edit is not a repeat`, async () => {
      const provider = new FakeProvider();
      const { client } = fakeModel((turn) => {
        if (turn <= 3) return [call("run", { cmd: "bun test ./tests" })];
        if (turn === 4) return [call("read_file", { path: "src/cart.ts", startLine: 1 }), call("read_file", { startLine: 1, path: "src/cart.ts" })]; // key order doesn't matter
        if (turn === 5) return [call("read_file", { path: "src/cart.ts", startLine: 1 })];
        if (turn === 6) return [call("edit_file", { path: "src/cart.ts", oldText: "a", newText: "b" })];
        if (turn <= 9) return [call("run", { cmd: "bun test ./tests" })];
        return [call("finish", { summary: "done" })];
      });
      const r = await runRepair({ task: fakeTask({ steps: 20 }), agent: make(), provider, image: "img", llm: client });
      const t = trace(r);
      const results = t.turns.flatMap((x) => x.toolResults.map((y) => y.result));
      const refused = /^error: not run - this exact call \((run|read_file) with the same arguments\) was already made 2 times and the repository has not changed since, so the result won't change\. Do something different\.$/;
      expect(results.map((x) => refused.test(x))).toEqual([false, false, true, false, false, true, false, false, false, true, false]);
      expect(r.commands.filter((c) => c.actor === "agent" && c.cmd === "bun test ./tests")).toHaveLength(4); // 2 before the edit, 2 after
      expect(t.guards).toEqual({ repeatsBlocked: 3, emptyFinishRejected: 0, editWhitespaceFallbacks: 0 });
      expect(r.agentRun!.steps).toBe(11); // refused calls still cost a step
      expect(t.finishSummary).toBe("done"); // the repo changed, so the first finish is accepted
    });

    it(`finish on an unchanged repo (${label}): the first is answered with a request to confirm, the second is accepted`, async () => {
      const { client, requests } = fakeModel(() => [call("finish", { summary: "nothing to do" })]);
      const r = await runRepair({ task: fakeTask(), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      const t = trace(r);
      expect(t.turns.map((x) => x.toolResults[0]!.result)).toEqual([EMPTY_FINISH_MESSAGE, "finished"]);
      expect(requests[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: EMPTY_FINISH_MESSAGE });
      expect(t.guards.emptyFinishRejected).toBe(1);
      expect(r.agentRun!.steps).toBe(2);
      expect(r.finalState).toBe("UNRESOLVED");
    });

    it(`unknown tools and unknown arguments (${label}): the error lists the valid names`, async () => {
      const { client } = fakeModel((turn) =>
        turn === 1 ? [call("str_replace_editor", { command: "view", path: "src/cart.ts" }), call("edit_file", { path: "src/cart.ts", command: "edit", oldText: "a", newText: "b" })] : [call("finish", { summary: "x" })],
      );
      const agent = make();
      const r = await runRepair({ task: fakeTask(), agent, provider: new FakeProvider(), image: "img", llm: client });
      const [unknownTool, unknownArg] = trace(r).turns[0]!.toolResults.map((x) => x.result);
      expect(unknownTool).toBe(`error: unknown tool "str_replace_editor". Available: ${agent.trace.tools.join(", ")}`);
      expect(unknownArg).toBe('error: edit_file: unknown argument "command" (valid arguments: path, oldText, newText)');
    });
  }
});

describe("agent-v3: output cap, stuck stop, no-edit nudge (fake provider, fake model; identical with graph on and off)", () => {
  it("capOutput keeps the first 2,000 and last 1,500 characters of anything over 4,000", () => {
    expect(capOutput("x".repeat(4000))).toEqual({ text: "x".repeat(4000), omitted: 0 });
    const long = `${"h".repeat(2000)}${"m".repeat(1001)}${"t".repeat(1500)}`;
    expect(capOutput(long)).toEqual({ text: `${"h".repeat(2000)}\n[harness: 1001 characters omitted]\n${"t".repeat(1500)}`, omitted: 1001 });
  });

  const conditions = [
    ["graph off", () => new RepairLoopAgent()],
    ["graph on", () => new RepairLoopAgent({ graph: { snapshot: RECALL_SNAPSHOT, decider: "lexical" } })],
  ] as const;
  for (const [label, make] of conditions) {
    it(`output cap (${label}): the model sees head + "[harness: N characters omitted]" + tail; truncations are counted`, async () => {
      const { client, requests } = fakeModel((turn) => (turn === 1 ? [call("run", { cmd: "print-long" })] : turn === 2 ? [call("run", { cmd: "touch x" })] : [call("finish", { summary: "x" })]));
      const r = await runRepair({ task: fakeTask(), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      const full = `exit code 0\n${Array.from({ length: 10_000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("")}`;
      const seen = requests[1]!.messages.at(-1)!;
      expect(seen).toMatchObject({ role: "tool" });
      expect(seen.content).toBe(`${full.slice(0, 2000)}\n[harness: ${full.length - 3500} characters omitted]\n${full.slice(-1500)}`);
      expect(trace(r).outputTruncations).toEqual({ count: 1, charsOmitted: full.length - 3500 });
    });

    it(`stuck stop (${label}): 3 refused calls in a row end the run UNRESOLVED "stuck"`, async () => {
      const { client } = fakeModel(() => [call("run", { cmd: "bun run -e 'x'" })]);
      const r = await runRepair({ task: fakeTask({ steps: 40 }), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "stuck" });
      const t = trace(r);
      expect(t.stuckStop).toBe(true);
      expect(t.guards.repeatsBlocked).toBe(3);
      expect(r.agentRun!.steps).toBe(5); // 2 executed + 3 refused
      expect(r.states.map((s) => s.state)).toEqual(["PREPARING_SANDBOX", "REPRODUCING", "PATCHING", "VERIFYING", "UNRESOLVED"]); // verification still ran
    });

    it(`stuck stop (${label}): any call that isn't refused resets the count`, async () => {
      const script = [["run", { cmd: "x" }], ["run", { cmd: "x" }], ["run", { cmd: "x" }], ["run", { cmd: "x" }], ["list_dir", { path: "." }], ["run", { cmd: "x" }], ["run", { cmd: "x" }], ["finish", { summary: "a" }], ["finish", { summary: "b" }]] as const;
      const { client } = fakeModel((turn) => [call(script[turn - 1]![0], script[turn - 1]![1])]);
      const r = await runRepair({ task: fakeTask({ steps: 40 }), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      const t = trace(r);
      expect(t.guards.repeatsBlocked).toBe(4); // refused, refused, (list_dir), refused, refused
      expect(t.stuckStop).toBe(false);
      expect(t.finishSummary).toBe("b");
      expect(r.reason).not.toBe("stuck");
    });

    it(`no-edit nudge (${label}): one message after step 15 while the diff is empty, never again`, async () => {
      const { client, requests } = fakeModel((turn) => (turn <= 20 ? [call("list_dir", { path: `d${turn}` })] : [call("finish", { summary: "x" })]));
      const r = await runRepair({ task: fakeTask({ steps: 40 }), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      const nudge = noEditNudge(40);
      expect(nudge).toBe("Step 15 of 40 and no file has been changed. If you have found the bug, fix it now with edit_file.");
      expect(requests[14]!.messages.filter((m) => m.content === nudge)).toHaveLength(0); // before step 15
      expect(requests[15]!.messages.at(-1)).toEqual({ role: "user", content: nudge }); // right after the 15th step's result
      expect(requests.at(-1)!.messages.filter((m) => m.content === nudge)).toHaveLength(1); // once per run
      expect(trace(r).noEditNudge).toEqual({ fired: true, atStep: 15 });
    });

    it(`no-edit nudge (${label}): not sent when a file has already changed`, async () => {
      const { client, requests } = fakeModel((turn) =>
        turn === 1 ? [call("edit_file", { path: "src/cart.ts", oldText: "a", newText: "b" })] : turn <= 20 ? [call("list_dir", { path: `d${turn}` })] : [call("finish", { summary: "x" })],
      );
      const r = await runRepair({ task: fakeTask({ steps: 40 }), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      expect(requests.at(-1)!.messages.some((m) => m.role === "user" && String(m.content).startsWith("Step 15"))).toBe(false);
      expect(trace(r).noEditNudge).toEqual({ fired: false });
    });
  }
});

describe("agent-v4: edit accounting and reads (fake provider, fake model; identical with graph on and off)", () => {
  const conditions = [
    ["graph off", () => new RepairLoopAgent()],
    ["graph on", () => new RepairLoopAgent({ graph: { snapshot: RECALL_SNAPSHOT, decider: "lexical" } })],
  ] as const;
  for (const [label, make] of conditions) {
    it(`only modifying or deleting a base file counts as a change (${label}): new files alone still get the nudge and the finish check`, async () => {
      const { client, requests } = fakeModel((turn) =>
        turn === 1 ? [call("write_file", { path: "notes.ts", content: "x" }), call("write_file", { path: "/scratch/check.ts", content: "x" })] : turn <= 16 ? [call("list_dir", { path: `d${turn}` })] : [call("finish", { summary: "x" })],
      );
      const r = await runRepair({ task: fakeTask({ steps: 40 }), agent: make(), provider: new FakeProvider(), image: "img", llm: client });
      const t = trace(r);
      expect(requests.some((q) => q.messages.some((m) => m.content === noEditNudge(40)))).toBe(true);
      expect(t.noEditNudge.fired).toBe(true);
      expect(t.guards.emptyFinishRejected).toBe(1);
      expect(t.turns.at(-2)!.toolResults[0]!.result).toBe(EMPTY_FINISH_MESSAGE);
      expect(EMPTY_FINISH_MESSAGE).toMatch(/^not finished: no file that existed at the start has been modified or deleted\./);
    });

    it(`deleting a base file counts as a change (${label})`, async () => {
      const { client } = fakeModel((turn) => (turn === 1 ? [call("run", { cmd: "delete-base-file" })] : [call("finish", { summary: "x" })]));
      const t = trace(await runRepair({ task: fakeTask(), agent: make(), provider: new FakeProvider(), image: "img", llm: client }));
      expect(t.guards.emptyFinishRejected).toBe(0);
      expect(t.finishSummary).toBe("x");
    });

    it(`files read are split into base files and agent-created ones (${label})`, async () => {
      const { client } = fakeModel((turn) =>
        turn === 1 ? [call("read_file", { path: "src/cart.ts" }), call("read_file", { path: "/scratch/check.ts" }), call("read_file", { path: "notes.ts" }), call("read_file", { path: "./src/cart.ts" })] : [call("finish", { summary: "x" }), call("finish", { summary: "x" })],
      );
      const t = trace(await runRepair({ task: fakeTask(), agent: make(), provider: new FakeProvider(), image: "img", llm: client }));
      expect(t.filesRead).toEqual(["src/cart.ts", "/scratch/check.ts", "notes.ts"]);
      expect(t.baseFilesRead).toEqual(["src/cart.ts"]);
      expect(t.agentFilesRead).toEqual(["/scratch/check.ts", "notes.ts"]);
    });
  }
});

describe("edit_file whitespace fallback (the sandbox helper's JS, evaluated on the host)", () => {
  const { wsNormalizedEdit, closestRegion } = new Function(`${EDIT_FALLBACK_JS}\nreturn { wsNormalizedEdit, closestRegion };`)() as {
    wsNormalizedEdit: (t: string, o: string, n: string) => { ok: true; text: string; startLine: number; endLine: number; reindent: string } | { ok: false; lines: number[] };
    closestRegion: (t: string, o: string) => { startLine: number; endLine: number; score: number; snippet: string } | undefined;
  };
  const file = ["export function f(a: number) {", "  if (a > 1) {", "    return a - 1;  ", "  }", "  return a;", "}", ""].join("\n");

  it("indentation and trailing spaces are ignored; a uniform indentation shift is applied to newText", () => {
    const r = wsNormalizedEdit(file, "if (a > 1) {\n  return a - 1;\n}", "if (a > 1) {\n  return a * 2;\n}");
    expect(r).toMatchObject({ ok: true, startLine: 2, endLine: 4, reindent: "shifted" });
    expect((r as { text: string }).text).toBe(file.replace("    return a - 1;  ", "    return a * 2;"));
  });

  it("inconsistent indentation: the match is applied, newText inserted as given (and the result says so)", () => {
    const r = wsNormalizedEdit(file, "export function f(a: number) {\n    if (a > 1) {", "export function f(a: number) {\n    if (a > 2) {");
    expect(r).toMatchObject({ ok: true, startLine: 1, endLine: 2, reindent: "as given" });
    expect((r as { text: string }).text.split("\n").slice(0, 3)).toEqual(["export function f(a: number) {", "    if (a > 2) {", "    return a - 1;  "]);
  });

  it("applied only when the normalized match is unique", () => {
    expect(wsNormalizedEdit("  x;\ny;\n    x;\n", "x;", "z;")).toEqual({ ok: false, lines: [1, 3] });
    expect(wsNormalizedEdit(file, "return a + 1;", "x")).toEqual({ ok: false, lines: [] });
  });

  it("on failure, the closest region comes back with line numbers", () => {
    expect(closestRegion(file, "  if (a >= 1) {\n    return a - 2;")).toEqual({ startLine: 2, endLine: 3, score: expect.any(Number), snippet: "2|   if (a > 1) {\n3|     return a - 1;  " });
  });
});

const docker = dockerAvailable();
if (!docker.ok) {
  console.warn(`\n⚠ SKIPPED harness-loop Docker tests: ${docker.detail}\n`);
  describe.skip(`loop on Docker (skipped: ${docker.detail})`, () => it("needs Docker", () => {}));
} else
  describe("loop on Docker (toy-cart, fake model)", () => {
    const TASK = path.resolve(import.meta.dirname, "../../../eval/tasks/toy-discount/task.json");
    beforeAll(async () => {
      expect(buildToyRepo()).toBe(TOY_BASE_SHA);
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    it("a scripted sequence that fixes the toy bug ends RESOLVED; files read and tokens are recorded", async () => {
      const { client } = fakeModel((turn) => {
        if (turn === 1) return [call("list_dir", { path: "." }), call("search", { pattern: "applyDiscount", path: "src" })];
        if (turn === 2) return [call("read_file", { path: "src/cart.ts", startLine: 10, endLine: 14 })];
        if (turn === 3) return [call("edit_file", { path: "src/cart.ts", oldText: "  return total - percent;", newText: "  return total * (1 - percent / 100);" })];
        if (turn === 4) return [call("run", { cmd: "bun test ./tests && tsc --noEmit" })];
        return [call("finish", { summary: "applyDiscount subtracted the percent as an amount" })];
      });
      const r = await runRepair({ task: loadTask(TASK), agent: new RepairLoopAgent(), provider: new LocalDockerProvider(), image: SANDBOX_IMAGE, llm: client });
      expect(r).toMatchObject({ finalState: "RESOLVED" });
      const t = trace(r);
      expect(t.filesRead).toEqual(["src/cart.ts"]);
      // no trace of the repro test (file or its directory) is visible to the agent
      expect(t.turns[0]!.toolResults[0]!.result.split("\n").filter(Boolean)).toEqual([".git/", "package.json", "src/", "tests/", "tsconfig.json"]);
      expect(t.turns[0]!.toolResults[1]!.result).toContain("src/cart.ts:11:export function applyDiscount");
      expect(t.turns[1]!.toolResults[0]!.result).toContain("12|   return total - percent;");
      expect(t.turns[2]!.toolResults[0]!.result).toBe("edited src/cart.ts: replaced 1 occurrence starting at line 12\n");
      expect(t.turns[3]!.toolResults[0]!.result).toMatch(/^exit code 0\n/);
      expect(r.agentRun!.steps).toBe(6);
      expect(r.usage).toMatchObject({ llmCalls: 5, tokens: 550 });
      expect(r.diff).toContain("+  return total * (1 - percent / 100);");
    }, 180_000);

    it("agent-v2 on a real sandbox: the transcript's mis-indented edit is applied via the whitespace fallback; repo state sees the change, so finish is accepted", async () => {
      const { client } = fakeModel((turn) => {
        if (turn === 1) return [call("finish", { summary: "too early" })]; // unchanged repo: asked to confirm
        if (turn === 2)
          // the oldText a model sent in an earlier run: "export function" indented by 2, which the file doesn't have
          return [
            call("edit_file", {
              path: "src/cart.ts",
              oldText: "/** Apply a percentage discount (0-100) to a total. */\n  export function applyDiscount(total: number, percent: number): number {\n    return total - percent;\n  }",
              newText: "/** Apply a percentage discount (0-100) to a total. */\n  export function applyDiscount(total: number, percent: number): number {\n    return total * (1 - percent / 100);\n  }",
            }),
          ];
        if (turn === 3) return [call("write_file", { path: "notes/scratch.txt", content: "x" }), call("run", { cmd: "rm -r notes" })];
        return [call("finish", { summary: "fixed" })];
      });
      const r = await runRepair({ task: loadTask(TASK), agent: new RepairLoopAgent(), provider: new LocalDockerProvider(), image: SANDBOX_IMAGE, llm: client });
      const t = trace(r);
      expect(t.turns[0]!.toolResults[0]!.result).toBe(EMPTY_FINISH_MESSAGE);
      expect(t.turns[1]!.toolResults[0]!.result).toBe(
        "edited src/cart.ts: oldText did not match exactly, so a whitespace-normalized match (indentation and trailing spaces ignored) was applied to lines 10-13; newText was inserted as given (its indentation was not adjusted). Read those lines back to check.\n",
      );
      expect(t.guards).toEqual({ repeatsBlocked: 0, emptyFinishRejected: 1, editWhitespaceFallbacks: 1 });
      expect(t.finishSummary).toBe("fixed");
      expect(r.finalState).toBe("RESOLVED");
      // the state probes ran as harness commands (not agent steps), once at the start and after each mutating call
      expect(r.commands.filter((c) => c.phase === "PATCHING" && c.actor === "harness" && c.cmd.startsWith("d=$(git diff"))).toHaveLength(4);
      expect(r.agentRun!.steps).toBe(5);
    }, 180_000);

    it("agent-v4 on a real sandbox: /scratch imports repo code and stays out of the diff; an agent-added failing test is removed before the verdict", async () => {
      const { client } = fakeModel((turn) => {
        if (turn === 1)
          return [call("write_file", { path: "/scratch/check.ts", content: 'import { applyDiscount } from "/work/src/cart.ts";\nconsole.log("got", applyDiscount(200, 10));\n' })];
        if (turn === 2) return [call("run", { cmd: "bun run /scratch/check.ts" }), call("list_dir", { path: "/scratch" })];
        if (turn === 3) return [call("write_file", { path: "tests/agent.test.ts", content: 'import { expect, test } from "bun:test";\ntest("agent-written, fails", () => expect(1).toBe(2));\n' })];
        if (turn === 4) return [call("read_file", { path: "/scratch/check.ts" }), call("read_file", { path: "src/cart.ts" }), call("run", { cmd: "ln -s /etc /scratch/etc-link" })];
        if (turn === 5) return [call("read_file", { path: "/scratch/etc-link/passwd" }), call("edit_file", { path: "src/cart.ts", oldText: "  return total - percent;", newText: "  return total * (1 - percent / 100);" })];
        return [call("finish", { summary: "fixed" })];
      });
      const r = await runRepair({ task: loadTask(TASK), agent: new RepairLoopAgent(), provider: new LocalDockerProvider(), image: SANDBOX_IMAGE, llm: client });
      const t = trace(r);
      expect(t.turns[1]!.toolResults.map((x) => x.result)).toEqual(["exit code 0\ngot 190\n", "check.ts\n"]);
      expect(t.turns[4]!.toolResults[0]!.result).toBe("error: path escapes the repository: /scratch/etc-link/passwd"); // realpath check in the sandbox
      expect(r).toMatchObject({
        finalState: "RESOLVED", // the agent's failing test was removed, so it can't decide the verdict
        changes: { modifiedBase: ["src/cart.ts"], deletedBase: [], addedInRepo: ["tests/agent.test.ts"] },
        removedBeforeVerify: ["tests/agent.test.ts"],
      });
      expect(r.diff).toContain("tests/agent.test.ts"); // recorded as the agent wrote it
      expect(r.diff).not.toContain("scratch");
      expect(t.baseFilesRead).toEqual(["src/cart.ts"]);
      expect(t.agentFilesRead).toEqual(["/scratch/check.ts"]);
      expect(t.guards.emptyFinishRejected).toBe(0);
      expect(r.commands.find((c) => c.cmd === "bun test ./tests" && c.phase === "VERIFYING")!.exitCode).toBe(0);
    }, 180_000);

    it("edit_file fails clearly on 0 and >1 matches; write_file refuses existing files; a symlink out of /work is rejected", async () => {
      const { client } = fakeModel((turn) => {
        if (turn === 1)
          return [
            call("edit_file", { path: "src/cart.ts", oldText: "not in the file", newText: "x" }),
            call("edit_file", { path: "src/cart.ts", oldText: "return", newText: "x" }),
            call("write_file", { path: "src/cart.ts", content: "x" }),
            call("run", { cmd: "ln -s /etc etc-link" }),
          ];
        if (turn === 2) return [call("read_file", { path: "etc-link/passwd" }), call("list_dir", { path: "etc-link" })];
        return [call("finish", { summary: "probing" })];
      });
      const r = await runRepair({ task: loadTask(TASK), agent: new RepairLoopAgent(), provider: new LocalDockerProvider(), image: SANDBOX_IMAGE, llm: client });
      const [t1, t2] = trace(r).turns;
      expect(t1!.toolResults.map((x) => x.result)).toEqual([
        expect.stringMatching(/^error: oldText not found in src\/cart\.ts, even ignoring indentation and trailing spaces\. Copy it exactly from read_file output, without the '<n>\| ' prefixes\.\nClosest region \(lines \d+-\d+, similarity [\d.]+\):\n\d+\| /),
        "error: oldText occurs 3 times in src/cart.ts; include more surrounding lines so it matches exactly once.",
        "error: src/cart.ts already exists; use edit_file to change it",
        "exit code 0\n(no output)",
      ]);
      expect(t2!.toolResults.map((x) => x.result)).toEqual(["error: path escapes the repository: etc-link/passwd", "error: path escapes the repository: etc-link"]);
      expect(trace(r).filesRead).toEqual([]);
      // this run's container is gone (other test files may have live ones in parallel)
      expect(spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${r.sandbox.id}$`], { encoding: "utf8" }).stdout.trim()).toBe("");
    }, 180_000);
  });
