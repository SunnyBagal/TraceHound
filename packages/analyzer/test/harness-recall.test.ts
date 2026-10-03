// Decision 041: the harness on a second repo, through a repo profile with a subdirectory
// (Recall's backend lives in recall-backend/). SMOKE tasks with seeded bugs and scripted patches
// only: no model, and never an evaluation result. Decision 043: the per-test regression gate, on a
// second task whose seed also makes one existing test fail at baseline. Decision 044: the four dev tasks.
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
const DIR2 = path.resolve(import.meta.dirname, "../../../eval/tasks/recall-smoke-baseline-failing");
const INSTALL = 'cd "recall-backend" && bun install --frozen-lockfile';
const TEST = 'cd "recall-backend" && bun test';
const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";
const oracle = (patch: string, dir = DIR) => new OracleAgent(readFileSync(path.join(dir, patch), "utf8"));
const smoke = (agent: Agent, provider = new LocalDockerProvider(), task = loadTask(path.join(DIR, "task.json"))): Promise<RunRecord> => runRepair({ task, agent, provider, image: SANDBOX_IMAGE });
const LINK = "test/linkDetector.test.ts > detectLinkType >";
const TSC_BASELINE = "typecheck recall-backend: 5 error(s) at baseline, 5 now"; // Recall's own tsc errors (decision 041)

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
      expect(r.baseline!.regression).toMatchObject([{ cmd: TEST, exitCode: 0, timedOut: false }]);
      // per test (decision 043): bun's JUnit report, 62 tests, all passing
      expect(r.baseline!.regression[0]!.tests).toHaveLength(62);
      expect(r.baseline!.regression[0]!.tests!.every((t) => t.status === "passed")).toBe(true);
      expect(r.comparison).toMatchObject({ granularity: "test", regressedTests: [] });
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
      // decision 043: the reason now names the tests instead of the command
      expect(r).toMatchObject({ finalState: "UNRESOLVED", repro: { afterPatch: { exitCode: 0 } }, comparison: { granularity: "test" } });
      expect(r.reason).toBe(
        `regression "${TEST}": 2 test(s) that passed at baseline now fail or are missing: ${LINK} github repos, including deeper paths; reserved first segments are not repos (failed); ${LINK} input without a scheme gets https://; unparseable input is a link (failed)`,
      );
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

    describe("decision 043: one existing test already fails at the seeded base", () => {
      const task2 = () => loadTask(path.join(DIR2, "task.json"));
      const INSTAGRAM = { file: "test/linkDetector.test.ts", name: "detectLinkType > instagram posts and reels", status: "failed" };

      it("6. fixes the reproduction and breaks two other tests → UNRESOLVED naming them; the already-failing test is not counted", async () => {
        const r = await smoke(oracle("fix-breaks-test.patch", DIR2), undefined, task2());
        expect(r).toMatchObject({ finalState: "UNRESOLVED", taskKind: "smoke", repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
        // the suite already fails at baseline: exit codes alone are 1 and 1
        expect(r.baseline!.regression[0]).toMatchObject({ cmd: TEST, exitCode: 1 });
        expect(r.final!.regression[0]).toMatchObject({ cmd: TEST, exitCode: 1 });
        expect(r.baseline!.regression[0]!.tests!.filter((t) => t.status !== "passed")).toEqual([INSTAGRAM]);
        expect(r.comparison).toMatchObject({ granularity: "test", preExistingFailures: [`regression "${TEST}": 1 test(s) failed at baseline, 1 of them still fail`, TSC_BASELINE] });
        expect(r.comparison!.regressedTests).toEqual([
          { cmd: TEST, file: "test/linkDetector.test.ts", name: "detectLinkType > github repos, including deeper paths; reserved first segments are not repos", now: "failed" },
          { cmd: TEST, file: "test/linkDetector.test.ts", name: "detectLinkType > input without a scheme gets https://; unparseable input is a link", now: "failed" },
        ]);
        expect(r.reason).toBe(
          `regression "${TEST}": 2 test(s) that passed at baseline now fail or are missing: ${LINK} github repos, including deeper paths; reserved first segments are not repos (failed); ${LINK} input without a scheme gets https://; unparseable input is a link (failed)`,
        );
      }, 300_000);

      it("7. the correct patch → RESOLVED, the already-failing test still failing", async () => {
        const r = await smoke(oracle("fix.patch", DIR2), undefined, task2());
        expect(r).toMatchObject({ finalState: "RESOLVED", reason: "repro passes and nothing fails that passed at baseline", comparison: { granularity: "test", newFailures: [], regressedTests: [] } });
        expect(r.final!.regression[0]!.tests!.filter((t) => t.status !== "passed")).toEqual([INSTAGRAM]);
        expect(r.final!.regression[0]!.tests).toHaveLength(62);
      }, 300_000);

      it("8. the same breaking patch without a test report: exit-code fallback, granularity \"command\", and it passes (the blind spot)", async () => {
        const t = task2();
        const { testReport: _dropped, ...profile } = t.profile!;
        const r = await smoke(oracle("fix-breaks-test.patch", DIR2), undefined, { ...t, profile });
        expect(r).toMatchObject({ finalState: "RESOLVED", comparison: { granularity: "command", regressedTests: [], preExistingFailures: [`regression "${TEST}" also failed at baseline (exit 1)`, TSC_BASELINE] } });
        expect(r.baseline!.regression[0]!.tests).toBeUndefined();
      }, 300_000);
    });

    // Decision 044: the four seeded dev tasks, in this file so that no two Recall sandboxes run at
    // the same time (two files in parallel made Recall's own PGlite tests time out; build log, Phase 3).
    describe("decision 044: dev tasks, oracle fix → RESOLVED and empty patch → UNRESOLVED", () => {
      const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
      const dev = (id: string, agent: Agent) => smoke(agent, new LocalDockerProvider(), loadTask(path.join(TASKS, id, "task.json")));
      for (const id of ["recall-dev-short-summary", "recall-dev-search-description", "recall-dev-session-expiry", "recall-dev-chat-recent"]) {
        it(`${id}: oracle fix → RESOLVED, per test, nothing regressed`, async () => {
          const r = await dev(id, new OracleAgent(readFileSync(path.join(TASKS, id, "fix.patch"), "utf8")));
          expect(r).toMatchObject({ finalState: "RESOLVED", taskKind: "dev", repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
          // the seed leaves Recall's own suite green: 62 tests, all passing at the seeded base and after the fix
          expect(r.baseline!.regression[0]!.tests).toHaveLength(62);
          expect(r.baseline!.regression[0]!.tests!.every((t) => t.status === "passed")).toBe(true);
          expect(r.comparison).toMatchObject({ granularity: "test", regressedTests: [], newFailures: [] });
          expect(r.changes!.modifiedBase).toHaveLength(1);
        }, 300_000);

        it(`${id}: empty patch → UNRESOLVED, repro still fails`, async () => {
          const r = await dev(id, new NoopAgent());
          expect(r).toMatchObject({ finalState: "UNRESOLVED", taskKind: "dev", reason: "repro still fails (exit 1)" });
        }, 300_000);
      }
    });
  });
