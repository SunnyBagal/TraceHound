// Run-flow logic against an in-memory fake provider: runs everywhere, no Docker. The real-container
// scenarios are in harness-docker.test.ts.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NoopAgent, OracleAgent, type Agent } from "../src/harness/agents.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { runRepair } from "../src/harness/run.ts";
import { loadTask, type LoadedTask, type TaskSpec } from "../src/harness/task.ts";

const SHA = "a".repeat(40);
const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "", durationMs: 1, timedOut: false });
const fail = (code = 1): ExecResult => ({ exitCode: code, stdout: "", stderr: "failed", durationMs: 1, timedOut: false });

/** Simulates a repo where the repro passes once "fixed" is written, and a regression breaks on "broken". */
class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  files = new Map<string, string>();
  created = 0;
  destroyed: string[] = [];
  onExec?: (cmd: string) => ExecResult | undefined | Promise<ExecResult | undefined>;
  async create(): Promise<SandboxHandle> {
    this.created++;
    return { id: `fake-${this.created}`, provider: this.name };
  }
  async exec(_h: SandboxHandle, cmd: string, opts: { timeoutMs: number }): Promise<ExecResult> {
    const custom = await this.onExec?.(cmd);
    if (custom) return custom;
    if (cmd.startsWith("run-repro")) return this.files.get("state") === "fixed" || this.files.get("state") === "broken" ? ok() : fail();
    if (cmd.startsWith("run-regression")) return this.files.get("state") === "broken" ? fail() : ok();
    if (cmd.startsWith("git add -A")) return ok(`diff for ${this.files.get("state") ?? "nothing"}`);
    if (cmd.startsWith("hang")) return { exitCode: 124, stdout: "", stderr: "", durationMs: opts.timeoutMs, timedOut: true };
    if (cmd.includes("tsc")) return ok();
    return ok();
  }
  async writeFile(_h: SandboxHandle, p: string, content: string) {
    this.files.set(p, content);
  }
  async readFile(_h: SandboxHandle, p: string) {
    return this.files.get(p) ?? "";
  }
  async destroy(h: SandboxHandle) {
    this.destroyed.push(h.id);
  }
}

function task(overrides: Partial<TaskSpec> = {}): LoadedTask {
  const spec: TaskSpec = {
    id: "fake",
    source: { localPath: "/nowhere" },
    baseSha: SHA,
    network: false,
    setup: [],
    issue: "it is broken",
    repro: { testFile: "repro.test.ts", dest: "repro/x.test.ts", command: "run-repro" },
    regression: ["run-regression"],
    typecheck: { packages: ["."], command: "tsc --noEmit" },
    limits: { steps: 10, wallClockMs: 60_000, tokens: 0, commandTimeoutMs: 5_000 },
    ...overrides,
  };
  return { spec, dir: "/tasks/fake", reproContent: "test()", localPath: "/nowhere" };
}
const writer = (state: string): Agent => ({ name: `writes-${state}`, run: async (ctx) => void (await ctx.writeFile("state", state)) });

describe("runRepair state machine (fake provider)", () => {
  it("RESOLVED: repro fails at base, passes after the patch, no new failures; sandbox destroyed", async () => {
    const provider = new FakeProvider();
    const r = await runRepair({ task: task(), agent: writer("fixed"), provider, image: "img" });
    expect(r.finalState).toBe("RESOLVED");
    expect(r.states.map((s) => s.state)).toEqual(["PREPARING_SANDBOX", "REPRODUCING", "PATCHING", "VERIFYING", "RESOLVED"]);
    expect(r.repro).toEqual({ atBase: { exitCode: 1, timedOut: false }, afterPatch: { exitCode: 0, timedOut: false } });
    expect(r.diff).toBe("diff for fixed");
    expect(provider.destroyed).toEqual(["fake-1"]);
    expect(r.usage).toEqual({ tokens: 0, costUSD: 0 });
  });

  it("UNRESOLVED names the regression that newly fails", async () => {
    const r = await runRepair({ task: task(), agent: writer("broken"), provider: new FakeProvider(), image: "img" });
    expect(r.finalState).toBe("UNRESOLVED");
    expect(r.reason).toBe('regression "run-regression" now fails (exit 1; passed at baseline)');
  });

  it("failures that already failed at baseline are not regressions", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.includes("tsc") ? { ...fail(2), stdout: "src/db.ts(2,30): error TS2307: Cannot find module" } : cmd === "flaky-old" ? fail() : undefined);
    const r = await runRepair({ task: task({ regression: ["run-regression", "flaky-old"] }), agent: writer("fixed"), provider, image: "img" });
    expect(r.finalState).toBe("RESOLVED");
    expect(r.comparison!.preExistingFailures).toEqual(['regression "flaky-old" also failed at baseline (exit 1)', "typecheck .: 1 error(s) at baseline, 1 now"]);
  });

  it("a new typecheck error is a regression", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.includes("tsc") && provider.files.get("state") === "fixed" ? { ...fail(2), stdout: "a.ts(1,1): error TS1: x" } : undefined);
    const r = await runRepair({ task: task(), agent: writer("fixed"), provider, image: "img" });
    expect(r.finalState).toBe("UNRESOLVED");
    expect(r.reason).toBe("typecheck .: 1 errors (baseline 0)");
  });

  it('FAILED "repro does not reproduce" when the repro passes at baseSha', async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd === "run-repro" ? ok() : undefined);
    const r = await runRepair({ task: task(), agent: new NoopAgent(), provider, image: "img" });
    expect(r).toMatchObject({ finalState: "FAILED", reason: "repro does not reproduce: the repro test passes at baseSha" });
    expect(r.states.map((s) => s.state)).not.toContain("PATCHING");
    expect(provider.destroyed).toHaveLength(1);
  });

  it("the repro test is removed before the agent runs and the tree must be clean", async () => {
    const seen: string[] = [];
    const provider = new FakeProvider();
    provider.onExec = (cmd) => void seen.push(cmd) as undefined;
    await runRepair({ task: task(), agent: new NoopAgent(), provider, image: "img" });
    const patchingAt = seen.findIndex((c) => c.startsWith("git add -A"));
    expect(seen.slice(0, patchingAt)).toEqual(expect.arrayContaining(['rm -f "repro/x.test.ts"', 'test -z "$(git status --porcelain)"']));
    expect(seen.indexOf('rm -f "repro/x.test.ts"')).toBeLessThan(seen.indexOf('test -z "$(git status --porcelain)"'));
  });

  it("a harness command that times out ends FAILED and still destroys the sandbox", async () => {
    const provider = new FakeProvider();
    const r = await runRepair({ task: task({ setup: ["hang"] }), agent: new NoopAgent(), provider, image: "img" });
    expect(r).toMatchObject({ finalState: "FAILED", reason: "setup command timed out after 5000ms: hang" });
    expect(provider.destroyed).toEqual(["fake-1"]);
  });

  it("a provider error ends FAILED with the error, and destroy still runs", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => {
      if (cmd === "run-regression") throw new Error("container vanished");
      return undefined;
    };
    const r = await runRepair({ task: task(), agent: new NoopAgent(), provider, image: "img" });
    expect(r).toMatchObject({ finalState: "FAILED", reason: "harness error: container vanished" });
    expect(provider.destroyed).toEqual(["fake-1"]);
  });

  it("CANCELLED on abort and on the wall-clock limit; destroy runs both times", async () => {
    const aborted = new FakeProvider();
    const ac = new AbortController();
    const r1 = await runRepair({ task: task(), agent: { name: "aborter", run: async (ctx) => (ac.abort(), void (await ctx.exec("echo"))) }, provider: aborted, image: "img", signal: ac.signal });
    expect(r1).toMatchObject({ finalState: "CANCELLED", reason: "cancelled by signal" });
    expect(aborted.destroyed).toHaveLength(1);

    const slow = new FakeProvider();
    slow.onExec = async (cmd) => (cmd === "run-regression" ? (await new Promise((r) => setTimeout(r, 60)), undefined) : undefined);
    const r2 = await runRepair({ task: task({ limits: { steps: 10, wallClockMs: 50, tokens: 0, commandTimeoutMs: 5_000 } }), agent: new NoopAgent(), provider: slow, image: "img" });
    expect(r2.finalState).toBe("CANCELLED");
    expect(r2.reason).toMatch(/^wall-clock limit 50ms reached/);
    expect(slow.destroyed).toHaveLength(1);
  });

  it("the step limit stops the agent; verification still decides the outcome", async () => {
    const looper: Agent = { name: "looper", run: async (ctx) => { for (;;) await ctx.exec("echo busy"); } };
    const r = await runRepair({ task: task({ limits: { steps: 3, wallClockMs: 60_000, tokens: 0, commandTimeoutMs: 5_000 } }), agent: looper, provider: new FakeProvider(), image: "img" });
    expect(r.agentRun).toEqual({ steps: 4, stoppedBy: "step limit 3 reached" });
    expect(r.finalState).toBe("UNRESOLVED");
  });

  it("an agent error (e.g. a patch that doesn't apply) is recorded, not trusted, and verification still runs", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.startsWith("git apply") ? fail(128) : undefined);
    const r = await runRepair({ task: task(), agent: new OracleAgent("not a patch"), provider, image: "img" });
    expect(r.agentRun!.error).toMatch(/^git apply failed \(exit 128\)/);
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "repro still fails (exit 1)" });
  });
});

describe("task.json", () => {
  it("resolves paths against the task dir and rejects a repro dest outside the repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-task-"));
    writeFileSync(path.join(dir, "repro.test.ts"), "test()");
    const spec = { id: "t", source: { localPath: "../repo" }, baseSha: SHA, issue: "x", repro: { testFile: "repro.test.ts", dest: "r/x.test.ts", command: "bun test" }, limits: { steps: 1, wallClockMs: 1, tokens: 0 } };
    writeFileSync(path.join(dir, "task.json"), JSON.stringify(spec));
    const t = loadTask(path.join(dir, "task.json"));
    expect(t.localPath).toBe(path.resolve(dir, "../repo"));
    expect(t.spec).toMatchObject({ network: false, setup: [], regression: [], limits: { commandTimeoutMs: 120_000 } });
    writeFileSync(path.join(dir, "task.json"), JSON.stringify({ ...spec, repro: { ...spec.repro, dest: "../escape.test.ts" } }));
    expect(() => loadTask(path.join(dir, "task.json"))).toThrow(/repro.dest must be a path inside the repo/);
  });
});
