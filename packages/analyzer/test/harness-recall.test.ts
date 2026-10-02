// Decision 041: the harness on a second repo, through a repo profile with a subdirectory
// (Recall's backend lives in recall-backend/). A SMOKE task with a seeded one-line bug and
// scripted patches only: no model, and never an evaluation result.
// Needs Docker and outbound network (GitHub, npm): runs only with TRACEHOUND_NETWORK_TESTS=1 (CI sets it).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NoopAgent, OracleAgent, type Agent } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import type { ExecResult, SandboxHandle } from "../src/harness/provider.ts";
import { NETWORK_PROBES, REPO_TSC, runRepair, type RunRecord } from "../src/harness/run.ts";
import { loadTask } from "../src/harness/task.ts";

const DIR = path.resolve(import.meta.dirname, "../../../eval/tasks/recall-smoke-trending");
const INSTALL = 'cd "recall-backend" && bun install --frozen-lockfile';
const TEST = 'cd "recall-backend" && bun test';
const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";
const oracle = (patch: string) => new OracleAgent(readFileSync(path.join(DIR, patch), "utf8"));
const smoke = (agent: Agent, provider = new LocalDockerProvider()): Promise<RunRecord> => runRepair({ task: loadTask(path.join(DIR, "task.json")), agent, provider, image: SANDBOX_IMAGE });

const docker = dockerAvailable();
const enabled = docker.ok && process.env.TRACEHOUND_NETWORK_TESTS === "1";
const why = !docker.ok ? `Docker is not available (${docker.detail})` : "set TRACEHOUND_NETWORK_TESTS=1 (needs GitHub + npm access)";

if (!enabled) {
  console.warn(`\n⚠ SKIPPED harness-recall (smoke task on Recall in a sandbox): ${why}.\n`);
  describe.skip(`harness on Recall, smoke task (skipped: ${why})`, () => it("needs Docker + network", () => {}));
} else
  describe("repair harness on Recall: smoke task, scripted patches, no model", () => {
    beforeAll(async () => {
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    it("1. correct patch → RESOLVED; seeded, installed in the subdirectory with the network on, then off and proven off before any check", async () => {
      const r = await smoke(oracle("fix.patch"));
      expect(r).toMatchObject({ finalState: "RESOLVED", taskKind: "smoke", snapshot: "none", profile: { id: "recall", workdir: "recall-backend" }, repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
      const cmds = r.commands.map((c) => c.cmd);
      const at = (cmd: string) => cmds.indexOf(cmd);
      // seed → install (network on) → network off, proven → repro → baseline
      const seed = cmds.findIndex((c) => c.startsWith("git apply --whitespace=nowarn /tmp/.th-seed.patch"));
      expect(seed).toBe(1);
      expect(r.commands[at(INSTALL)]).toMatchObject({ phase: "PREPARING_SANDBOX", exitCode: 0 });
      expect(r.commands[at(INSTALL)]!.stdoutTail).toMatch(/\d+ packages installed/);
      expect(seed).toBeLessThan(at(INSTALL));
      const off = r.commands.filter((c) => c.phase === "NETWORK_OFF");
      expect(off.map((c) => [c.cmd, c.exitCode !== 0])).toEqual(NETWORK_PROBES.map((p) => [p, true]));
      expect(at(INSTALL)).toBeLessThan(at(NETWORK_PROBES[0]!));
      expect(at(NETWORK_PROBES[1]!)).toBeLessThan(r.commands.findIndex((c) => c.phase === "REPRODUCING"));
      // the suite passes at the seeded base with the network off; the repo's own tsc ran, and its errors are the baseline
      expect(r.baseline!.regression).toEqual([{ cmd: TEST, exitCode: 0, timedOut: false }]);
      const base = r.baseline!.typecheck[0]!;
      expect(base).toMatchObject({ package: "recall-backend", command: `bun ${REPO_TSC} --noEmit`, tsc: { source: "repo" } });
      expect(base.errors).toBeGreaterThan(0); // pre-existing errors don't fail a run
      expect(r.final!.typecheck[0]!.diagnostics).toEqual(base.diagnostics);
      expect(r.comparison!.newFailures).toEqual([]);
      // the seed is in the base commit, not in the agent's diff; the diff is the fix alone
      expect(r.diff).toContain('+  const nonRepoPaths = ["settings", "notifications", "explore", "topics", "trending", "marketplace"];');
      expect(r.diff).not.toContain("repro");
      expect(r.usage).toMatchObject({ llmCalls: 0, tokens: 0, costUSD: 0 });
      expect(r.sandbox.destroyed).toBe(true);
      expect(containerExists(r.sandbox.id!)).toBe(false);
    }, 300_000);

    it("2. empty patch (noop) → UNRESOLVED, repro still fails", async () => {
      const r = await smoke(new NoopAgent());
      expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "repro still fails (exit 1)", diff: "" });
    }, 300_000);

    it("3. fixes the reproduction but breaks another test → UNRESOLVED, naming the regression", async () => {
      const r = await smoke(oracle("fix-breaks-test.patch"));
      expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: `regression "${TEST}" now fails (exit 1; passed at baseline)`, repro: { afterPatch: { exitCode: 0 } } });
    }, 300_000);

    it("4. fixes the reproduction but adds a tsc error → UNRESOLVED, naming the new error; the baseline's errors are not counted against it", async () => {
      const r = await smoke(oracle("fix-adds-tsc-error.patch"));
      expect(r).toMatchObject({ finalState: "UNRESOLVED", repro: { afterPatch: { exitCode: 0 } } });
      expect(r.reason).toBe("typecheck recall-backend: 1 error(s) not in the baseline: services/linkDetector.ts TS2322: Type 'string' is not assignable to type 'number'.");
      expect(r.final!.regression[0]!.exitCode).toBe(0); // the tests still pass: only the typecheck gate fails
      expect(r.final!.typecheck[0]!.errors).toBe(r.baseline!.typecheck[0]!.errors + 1);
    }, 300_000);

    it("5. sandbox killed mid-run → FAILED, never UNRESOLVED", async () => {
      const provider = new LocalDockerProvider();
      const exec = provider.exec.bind(provider);
      // kill the container as the agent's patch is about to be applied
      provider.exec = async (h: SandboxHandle, cmd: string, o: { timeoutMs: number }): Promise<ExecResult> => {
        if (cmd.startsWith("git apply --whitespace=nowarn /tmp/oracle.patch")) spawnSync("docker", ["kill", h.id]);
        return exec(h, cmd, o);
      };
      const r = await smoke(oracle("fix.patch"), provider);
      expect(r).toMatchObject({ finalState: "FAILED", reason: "sandbox container disappeared" });
      expect(r.states.map((s) => s.state)).toEqual(["PREPARING_SANDBOX", "REPRODUCING", "PATCHING", "FAILED"]);
      expect(r.final).toBeUndefined();
      // Docker removes a killed --rm container asynchronously
      for (let i = 0; i < 60 && containerExists(r.sandbox.id!); i++) await new Promise((res) => setTimeout(res, 500));
      expect(containerExists(r.sandbox.id!)).toBe(false);
    }, 300_000);
  });
