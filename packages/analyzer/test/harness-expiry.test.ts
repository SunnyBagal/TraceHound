// Decision 037: a sandbox that expires or disappears is a harness failure with a named reason -
// never a tool error the agent sees, never a step, never a test result, never UNRESOLVED.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import { NoopAgent, OracleAgent } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { RepairLoopAgent, type LoopTrace } from "../src/harness/loop.ts";
import type { ExecResult, SandboxHandle } from "../src/harness/provider.ts";
import { runRepair } from "../src/harness/run.ts";
import { loadTask } from "../src/harness/task.ts";
import type { ChatRequest, ChatResult, ToolCall } from "../src/llm/client.ts";

const TASK = path.resolve(import.meta.dirname, "../../../eval/tasks/toy-discount/task.json");
const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const call = (name: string, args: unknown): ToolCall => ({ id: `call-${++n}`, type: "function", function: { name, arguments: JSON.stringify(args) } });

const docker = dockerAvailable();
if (!docker.ok) {
  console.warn(`\n⚠ SKIPPED harness-expiry Docker tests: ${docker.detail}\n`);
  describe.skip(`sandbox expiry (skipped: ${docker.detail})`, () => it("needs Docker", () => {}));
} else
  describe("sandbox expiry and disappearance (decision 037)", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "tracehound-expiry-"));
    beforeAll(async () => {
      expect(buildToyRepo()).toBe(TOY_BASE_SHA);
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));

    it("the lifetime expires during PATCHING → FAILED \"sandbox lifetime expired\"; the agent never sees the error and it's not a step", async () => {
      const provider = new LocalDockerProvider();
      const requests: ChatRequest[] = [];
      let turn = 0;
      const client = {
        async chat(req: ChatRequest): Promise<ChatResult> {
          requests.push(structuredClone(req));
          turn++;
          if (turn === 2) {
            // wait until the sandbox has removed itself at its deadline
            const [h] = provider.live();
            while (h && containerExists(h.id)) await sleep(500);
          }
          const toolCalls = turn <= 2 ? [call("list_dir", { path: turn === 1 ? "." : "src" })] : [call("finish", { summary: "x" })];
          return { content: "", cached: false, latencyMs: 1, inputTokens: 10, outputTokens: 1, costUSD: 0, toolCalls, finishReason: "tool_calls" };
        },
      };
      const r = await runRepair({ task: loadTask(TASK), agent: new RepairLoopAgent(), provider, image: SANDBOX_IMAGE, llm: client, sandboxLifetimeMs: 40_000 });
      const t = r.agentRun!.trace as LoopTrace;
      expect(r).toMatchObject({ finalState: "FAILED", reason: "sandbox lifetime expired (40 s)" });
      expect(r.sandbox).toMatchObject({ removedBy: "lifetime", destroyed: true, lifetimeMs: 40_000 });
      expect(t.turns).toHaveLength(2); // no third model call: the run ended at the failed call
      expect(t.turns[0]!.toolResults[0]!.ok).toBe(true);
      expect(t.turns[1]!.toolResults).toEqual([]); // the error never reached the agent...
      expect(JSON.stringify(requests)).not.toMatch(/No such container|is gone/); // ...nor the model
      expect(r.agentRun!.steps).toBe(1); // ...and it isn't a step
      expect(r.states.map((s) => s.state)).toEqual(["PREPARING_SANDBOX", "REPRODUCING", "PATCHING", "FAILED"]);
    }, 180_000);

    it("the container is killed during VERIFYING between two regressions → FAILED, never UNRESOLVED", async () => {
      const task = loadTask(TASK);
      task.spec.regression = ["bun test ./tests", "bun test ./tests --timeout 5000"];
      // kill the container right after the first regression of VERIFYING (the 1st run is the BASELINE one)
      const provider = new LocalDockerProvider();
      const exec = provider.exec.bind(provider);
      let seen = 0;
      provider.exec = async (h: SandboxHandle, cmd: string, o: { timeoutMs: number }): Promise<ExecResult> => {
        const r = await exec(h, cmd, o);
        if (cmd === "bun test ./tests" && ++seen === 2) spawnSync("docker", ["rm", "-f", h.id]);
        return r;
      };
      const patch = readFileSync(path.join(path.dirname(TASK), "fix.patch"), "utf8");
      const r = await runRepair({ task, agent: new OracleAgent(patch), provider, image: SANDBOX_IMAGE });
      expect(r).toMatchObject({ finalState: "FAILED", reason: "sandbox container disappeared" });
      expect(r.sandbox).toMatchObject({ removedBy: "unknown", destroyed: true });
      expect(r.final).toBeUndefined(); // no regression or typecheck result was recorded from a dead sandbox
      expect(r.repro.afterPatch).toEqual({ exitCode: 0, timedOut: false });
    }, 180_000);

    it("a docker cp that hangs times out → FAILED with a named reason, and the half-made container is removed", async () => {
      const log = path.join(tmp, "docker-args.log");
      const wrapper = path.join(tmp, "docker-with-hanging-cp");
      writeFileSync(wrapper, `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\nif [ "$1" = cp ]; then exec sleep 60; fi\nexec docker "$@"\n`);
      chmodSync(wrapper, 0o755);
      const started = Date.now();
      const r = await runRepair({ task: loadTask(TASK), agent: new NoopAgent(), provider: new LocalDockerProvider({ docker: wrapper, timeouts: { cp: 2000 } }), image: SANDBOX_IMAGE });
      expect(r).toMatchObject({ finalState: "FAILED", reason: "harness error: docker cp of the repo bundle timed out after 2 s" });
      expect(Date.now() - started).toBeLessThan(30_000);
      const name = /create --name (th-[0-9a-f-]+)/.exec(readFileSync(log, "utf8"))![1]!;
      expect(containerExists(name)).toBe(false);
    }, 120_000);
  });
