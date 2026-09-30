// Repair loop (decision 029) with a scripted fake model. Protocol/limit cases use the in-memory
// provider; the end-to-end fix and the symlink escape use a real Docker sandbox (skipped without Docker).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import type { ChatRequest, ChatResult, ToolCall } from "../src/llm/client.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { AGENT_PROMPT_FILE, checkArgs, RepairLoopAgent, renderSystemPrompt, type LoopTrace } from "../src/harness/loop.ts";
import { runRepair } from "../src/harness/run.ts";
import { loadTask, type LoadedTask, type TaskSpec } from "../src/harness/task.ts";
import { confinePath, REPO_TOOLS } from "../src/harness/tools.ts";

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

class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  execs: string[] = [];
  async create(): Promise<SandboxHandle> {
    return { id: "fake-1", provider: this.name };
  }
  async disableNetwork() {}
  async exec(_h: SandboxHandle, cmd: string): Promise<ExecResult> {
    this.execs.push(cmd);
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
    regression: [],
    limits: { steps: 10, wallClockMs: 60_000, tokens: 100_000, commandTimeoutMs: 5_000, costUSD: 0.1, ...limits },
  },
  dir: "/tasks",
  reproContent: "",
  localPath: "/x",
});
const trace = (r: { agentRun?: { trace?: unknown } }) => r.agentRun!.trace as LoopTrace;

describe("prompt", () => {
  it("one frozen file for both conditions; only the GRAPH sentence differs; hashes recorded", () => {
    const off = renderSystemPrompt(AGENT_PROMPT_FILE, false);
    const on = renderSystemPrompt(AGENT_PROMPT_FILE, true);
    expect(off.fileSha256).toBe(on.fileSha256);
    expect(on.text.startsWith(off.text)).toBe(true);
    expect(on.text.slice(off.text.length).trim().split("\n")).toHaveLength(1); // exactly one extra sentence line
    expect(off.text).not.toContain("GRAPH");
    const agent = new RepairLoopAgent({ reasoning: "off" });
    expect(agent.trace).toMatchObject({ promptFile: "agent-v1.md", promptSha256: off.fileSha256, renderedPromptSha256: off.renderedSha256, graph: false });
    expect(agent.trace.tools).toEqual(["list_dir", "read_file", "search", "edit_file", "write_file", "run", "finish"]);
  });
});

describe("path confinement", () => {
  it("rejects paths that leave /work on the host side", () => {
    expect(confinePath("src/cart.ts")).toBe("/work/src/cart.ts");
    expect(confinePath("/work/src")).toBe("/work/src");
    for (const bad of ["../etc/passwd", "/etc/passwd", "src/../../root", "/workshop/x"]) expect(() => confinePath(bad)).toThrow(/escapes the repository/);
  });
  it("checks arguments against the tool schema", () => {
    const read = REPO_TOOLS.find((t) => t.function.name === "read_file")!;
    expect(checkArgs(read, { path: "a" })).toBeUndefined();
    expect(checkArgs(read, {})).toBe('read_file: missing required argument "path"');
    expect(checkArgs(read, { path: "a", startLine: 1.5 })).toBe('read_file: "startLine" must be an integer');
    expect(checkArgs(read, { path: "a", bogus: 1 })).toBe('read_file: unknown argument "bogus"');
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
    expect(r.agentRun!.steps).toBe(5); // 3 bad calls + 1 text-only turn + finish
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
    expect(requests[0]).not.toHaveProperty("chat_template_kwargs"); // reasoning on = model default
    expect(requests[0]).toMatchObject({ temperature: 0, tool_choice: "auto" });
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
      expect(t.turns[0]!.toolResults[1]!.result).toContain("src/cart.ts:11:export function applyDiscount");
      expect(t.turns[1]!.toolResults[0]!.result).toContain("12|   return total - percent;");
      expect(t.turns[2]!.toolResults[0]!.result).toBe("edited src/cart.ts: replaced 1 occurrence starting at line 12\n");
      expect(t.turns[3]!.toolResults[0]!.result).toMatch(/^exit code 0\n/);
      expect(r.agentRun!.steps).toBe(6);
      expect(r.usage).toMatchObject({ llmCalls: 5, tokens: 550 });
      expect(r.diff).toContain("+  return total * (1 - percent / 100);");
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
        "error: oldText not found in src/cart.ts. Copy it exactly from read_file output, without the '<n>| ' prefixes.",
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
