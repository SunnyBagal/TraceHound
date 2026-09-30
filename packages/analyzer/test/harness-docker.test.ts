// Real containers (decision 026). Runs wherever `docker version` works (CI: GitHub runners);
// elsewhere the whole suite is skipped with a visible message.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import { NoopAgent, OracleAgent } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { runRepair, type RunRecord } from "../src/harness/run.ts";
import { loadTask } from "../src/harness/task.ts";

const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
const docker = dockerAvailable();
const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";

async function run(taskId: string, agent: "oracle" | "noop", patch?: string): Promise<RunRecord> {
  const task = loadTask(path.join(TASKS, taskId, "task.json"));
  const a = agent === "noop" ? new NoopAgent() : new OracleAgent(readFileSync(path.join(TASKS, taskId, patch!), "utf8"));
  const record = await runRepair({ task, agent: a, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
  expect(record.sandbox.destroyed).toBe(true);
  expect(containerExists(record.sandbox.id!)).toBe(false); // gone, not just stopped
  return record;
}

if (!docker.ok) {
  console.warn(`\n⚠ SKIPPED harness-docker tests: Docker is not available here (${docker.detail}). CI runs them.\n`);
  describe.skip(`harness on Docker (skipped: ${docker.detail})`, () => it("needs Docker", () => {}));
} else
  describe("repair harness on Docker (toy-cart fixture)", () => {
    beforeAll(async () => {
      expect(buildToyRepo()).toBe(TOY_BASE_SHA);
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    it("the sandbox has no host mounts, no network and no host environment", async () => {
      const provider = new LocalDockerProvider();
      const h = await provider.create({ image: SANDBOX_IMAGE, source: { localPath: path.resolve(TASKS, "../fixtures/.build/toy-cart") } });
      try {
        const inspect = JSON.parse(spawnSync("docker", ["inspect", h.id], { encoding: "utf8" }).stdout)[0];
        expect(inspect.Mounts).toEqual([]);
        expect(inspect.HostConfig.NetworkMode).toBe("none");
        expect(inspect.HostConfig.CapDrop).toEqual(["ALL"]);
        const env = await provider.exec(h, "env | cut -d= -f1 | sort", { timeoutMs: 10_000 });
        expect(env.stdout.trim().split("\n")).toEqual(["BUN_INSTALL", "HOME", "HOSTNAME", "PATH", "PWD"]);
        const head = await provider.exec(h, "git rev-parse HEAD && git status --porcelain", { timeoutMs: 10_000 });
        expect(head.stdout.trim()).toBe(TOY_BASE_SHA);
      } finally {
        await provider.destroy(h);
      }
      expect(containerExists(h.id)).toBe(false);
    }, 120_000);

    it("1. oracle + correct patch → RESOLVED", async () => {
      const r = await run("toy-discount", "oracle", "fix.patch");
      expect(r).toMatchObject({ finalState: "RESOLVED", repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
      expect(r.diff).toContain("+  return total * (1 - percent / 100);");
      expect(r.diff).not.toContain("repro"); // the repro test is never part of the agent's diff
    }, 120_000);

    it("2. noop → UNRESOLVED (repro still fails)", async () => {
      const r = await run("toy-discount", "noop");
      expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "repro still fails (exit 1)", diff: "" });
    }, 120_000);

    it("3. oracle + bad patch → UNRESOLVED, naming the regression", async () => {
      const r = await run("toy-discount", "oracle", "bad-fix.patch");
      expect(r.finalState).toBe("UNRESOLVED");
      expect(r.reason).toBe('regression "bun test ./tests" now fails (exit 1; passed at baseline)');
      expect(r.repro.afterPatch!.exitCode).toBe(0); // the bug itself is fixed; the regression is what fails
    }, 120_000);

    it('4. repro already passes at baseSha → FAILED "repro does not reproduce"', async () => {
      const r = await run("toy-already-passes", "noop");
      expect(r).toMatchObject({ finalState: "FAILED", reason: "repro does not reproduce: the repro test passes at baseSha" });
    }, 120_000);

    it("5. a command past its timeout → FAILED, container removed", async () => {
      const r = await run("toy-timeout", "noop");
      expect(r).toMatchObject({ finalState: "FAILED", reason: "setup command timed out after 2000ms: sleep 30" });
      const sleep = r.commands.find((c) => c.cmd === "sleep 30")!;
      expect(sleep.timedOut).toBe(true);
      expect(sleep.durationMs).toBeLessThan(10_000);
    }, 120_000);
  });
