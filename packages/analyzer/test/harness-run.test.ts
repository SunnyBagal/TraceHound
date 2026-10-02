// Run-flow logic against an in-memory fake provider: runs everywhere, no Docker. The real-container
// scenarios are in harness-docker.test.ts.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NoopAgent, OracleAgent, type Agent } from "../src/harness/agents.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { fakeClient } from "./helpers.ts";
import { checkPlan, RepoProfile } from "../src/harness/profile.ts";
import { compareChecks, newTscErrors, parseTscErrors, PREPARE_SCRATCH, REPO_TSC, runRepair, splitChanges, SQUASH_HISTORY, type CheckResults } from "../src/harness/run.ts";
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
  network = false;
  disconnectWorks = true;
  onExec?: (cmd: string) => ExecResult | undefined | Promise<ExecResult | undefined>;
  async create(): Promise<SandboxHandle> {
    this.created++;
    this.network = true; // like Docker: on while preparing
    return { id: `fake-${this.created}`, provider: this.name };
  }
  async disableNetwork() {
    if (this.disconnectWorks) this.network = false;
  }
  async exec(_h: SandboxHandle, cmd: string, opts: { timeoutMs: number }): Promise<ExecResult> {
    const custom = await this.onExec?.(cmd);
    if (custom) return custom;
    if (cmd === SQUASH_HISTORY) return ok(`${"b".repeat(40)}\n`);
    if (cmd.startsWith("curl")) return this.network ? ok() : fail(6);
    if (cmd.startsWith("needs-network")) return this.network ? ok() : fail(6);
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
    setup: [],
    issue: "it is broken",
    repro: { testFile: "repro.test.ts", dest: "repro/x.test.ts", command: "run-repro" },
    regression: ["run-regression"],
    typecheck: { packages: ["."], command: "tsc --noEmit" },
    limits: { steps: 10, wallClockMs: 60_000, tokens: 0, commandTimeoutMs: 5_000, costUSD: 0.1 },
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
    expect(r.usage).toEqual({ llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUSD: 0 });
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
    expect(r.reason).toBe("typecheck .: 1 error(s) not in the baseline: a.ts TS1: x");
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
    const rm = 'rm -f "repro/x.test.ts" && (rmdir -p "repro" 2>/dev/null || true)';
    expect(seen.slice(0, patchingAt)).toEqual(expect.arrayContaining([rm, 'test -z "$(git status --porcelain)"']));
    expect(seen.indexOf(rm)).toBeLessThan(seen.indexOf('test -z "$(git status --porcelain)"'));
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

  it("network: on for setup, history squashed after setup, then disconnected and proven off before REPRODUCING", async () => {
    const provider = new FakeProvider();
    const r = await runRepair({ task: task({ setup: ["needs-network"] }), agent: new NoopAgent(), provider, image: "img" });
    expect(r.finalState).toBe("UNRESOLVED"); // noop: repro still fails
    const phases = r.commands.map((c) => `${c.phase}:${c.cmd.split(" ")[0]}:${c.exitCode}`);
    expect(phases.slice(0, 6)).toEqual(["PREPARING_SANDBOX:git:0", "PREPARING_SANDBOX:needs-network:0", "PREPARING_SANDBOX:set:0", "PREPARING_SANDBOX:mkdir:0", "NETWORK_OFF:curl:6", "NETWORK_OFF:curl:6"]);
    expect(r.commands[2]!.cmd).toBe(SQUASH_HISTORY);
    expect(r.commands[3]!.cmd).toBe(PREPARE_SCRATCH);
    expect(r.baseCommit).toBe("b".repeat(40));
    expect(r.commands.find((c) => c.phase === "VERIFYING" && c.cmd.startsWith("git add -A"))!.cmd).toBe(`git add -A && git diff --cached ${"b".repeat(40)}`); // diffed against the squashed commit
    expect(r.commands.find((c) => c.phase === "REPRODUCING")).toBeDefined();
  });

  it("FAILED if the network is still reachable after disconnecting", async () => {
    const provider = new FakeProvider();
    provider.disconnectWorks = false;
    const r = await runRepair({ task: task(), agent: new NoopAgent(), provider, image: "img" });
    expect(r).toMatchObject({ finalState: "FAILED", reason: "network is still reachable after disconnecting: curl -sS -o /dev/null --max-time 5 https://registry.npmjs.org/" });
    expect(r.states.map((x) => x.state)).not.toContain("REPRODUCING");
    expect(provider.destroyed).toHaveLength(1);
  });

  it("CANCELLED only for an external signal; destroy still runs", async () => {
    const provider = new FakeProvider();
    const ac = new AbortController();
    const r = await runRepair({ task: task(), agent: { name: "aborter", run: async (ctx) => (ac.abort(), void (await ctx.exec("echo"))) }, provider, image: "img", signal: ac.signal });
    expect(r).toMatchObject({ finalState: "CANCELLED", reason: "cancelled by signal" });
    expect(provider.destroyed).toHaveLength(1);
  });

  it('an agent past its wall-clock limit is UNRESOLVED "budget exhausted", not CANCELLED', async () => {
    const provider = new FakeProvider();
    const sleeper: Agent = { name: "sleeper", run: async (ctx) => { await new Promise((r) => setTimeout(r, 80)); await ctx.exec("echo late"); } };
    const r = await runRepair({ task: task({ limits: { steps: 10, wallClockMs: 60, tokens: 0, commandTimeoutMs: 5_000, costUSD: 0.1 } }), agent: sleeper, provider, image: "img" });
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: wall-clock 60ms" });
    expect(r.states.map((x) => x.state)).toContain("VERIFYING"); // the harness still records what the repo looks like
    expect(provider.destroyed).toHaveLength(1);
  });

  it('the step limit ends the run UNRESOLVED "budget exhausted: steps N"', async () => {
    const looper: Agent = { name: "looper", run: async (ctx) => { for (;;) await ctx.exec("echo busy"); } };
    const r = await runRepair({ task: task({ limits: { steps: 3, wallClockMs: 60_000, tokens: 0, commandTimeoutMs: 5_000, costUSD: 0.1 } }), agent: looper, provider: new FakeProvider(), image: "img" });
    expect(r.agentRun).toEqual({ steps: 3, budgetExhausted: "steps 3" });
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: steps 3" });
  });

  it("even a fixed repo is UNRESOLVED when the agent ran out of budget", async () => {
    const fixThenLoop: Agent = { name: "fix-then-loop", run: async (ctx) => { await ctx.writeFile("state", "fixed"); for (;;) await ctx.exec("echo"); } };
    const r = await runRepair({ task: task({ limits: { steps: 2, wallClockMs: 60_000, tokens: 0, commandTimeoutMs: 5_000, costUSD: 0.1 } }), agent: fixThenLoop, provider: new FakeProvider(), image: "img" });
    expect(r.repro.afterPatch!.exitCode).toBe(0);
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: steps 2" });
  });

  it("an agent error (e.g. a patch that doesn't apply) is recorded, not trusted, and verification still runs", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.startsWith("git apply") ? fail(128) : undefined);
    const r = await runRepair({ task: task(), agent: new OracleAgent("not a patch"), provider, image: "img" });
    expect(r.agentRun!.error).toMatch(/^git apply failed \(exit 128\)/);
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "repro still fails (exit 1)" });
  });
});

describe("token accounting (0g): the harness counts, from API usage, through the shared client", () => {
  const completion = (prompt: number, completion: number) =>
    new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion } }));
  const request = (content: string) => ({ model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", temperature: 0, max_tokens: 100, messages: [{ role: "user" as const, content }] });

  it("sums usage fields from the responses, ledgers each call, and ignores anything the agent claims", async () => {
    const responses = [completion(120, 30), completion(200, 50)];
    const { client, ledger } = fakeClient((async () => responses.shift()!) as unknown as typeof fetch);
    const claimer: Agent = {
      name: "claimer",
      run: async (ctx) => {
        await ctx.llm!.chat(request("one"));
        await ctx.llm!.chat(request("two"));
        // there is no API to self-report usage; a claim like this is never read
        (ctx as unknown as { usage: unknown }).usage = { tokens: 1, costUSD: 0 };
      },
    };
    const r = await runRepair({ task: task({ limits: { steps: 10, wallClockMs: 60_000, tokens: 10_000, commandTimeoutMs: 5_000, costUSD: 0.1 } }), agent: claimer, provider: new FakeProvider(), image: "img", llm: client });
    expect(r.usage).toMatchObject({ llmCalls: 2, inputTokens: 320, outputTokens: 80, tokens: 400 });
    expect(r.usage.costUSD).toBeCloseTo(ledger.entries().reduce((n, e) => n + e.estCostUSD, 0), 10);
    expect(ledger.entries().map((e) => [e.inputTokens, e.outputTokens, e.purpose])).toEqual([[120, 30, "repair-agent:claimer"], [200, 50, "repair-agent:claimer"]]);
  });

  it('crossing the token limit ends UNRESOLVED "budget exhausted: tokens N"', async () => {
    const { client } = fakeClient((async () => completion(900, 200)) as unknown as typeof fetch);
    const chatty: Agent = { name: "chatty", run: async (ctx) => { for (let i = 0; ; i++) await ctx.llm!.chat(request(`msg ${i}`)); } };
    const r = await runRepair({ task: task({ limits: { steps: 10, wallClockMs: 60_000, tokens: 2_000, commandTimeoutMs: 5_000, costUSD: 0.1 } }), agent: chatty, provider: new FakeProvider(), image: "img", llm: client });
    expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "budget exhausted: tokens 2000" });
    expect(r.usage).toMatchObject({ llmCalls: 2, tokens: 2200 });
  });

  it("scripted agents have no model client and use 0 tokens", async () => {
    const r = await runRepair({ task: task(), agent: new NoopAgent(), provider: new FakeProvider(), image: "img" });
    expect(r.usage).toEqual({ llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUSD: 0 });
  });
});

describe("run record: sandbox description and graph snapshot (decision 036)", () => {
  it("records the provider's description, and the graph snapshot (or \"none\")", async () => {
    const provider = new FakeProvider();
    Object.assign(provider, { describe: async (image: string) => ({ provider: "fake", providerVersion: "fake@1", engineVersion: "fake 1.0", image, imageId: "sha256:" + "c".repeat(64) }) });
    const off = await runRepair({ task: task(), agent: writer("fixed"), provider, image: "img" });
    expect(off).toMatchObject({ snapshot: "none", sandboxEnv: { provider: "fake", providerVersion: "fake@1", engineVersion: "fake 1.0", image: "img", imageId: "sha256:" + "c".repeat(64) } });
    const ref = { path: "snapshots/x/0.7.0.json", analyzerVersion: "0.7.0", commitSha: "a".repeat(40), sha256: "d".repeat(64) };
    const on = await runRepair({ task: task(), agent: writer("fixed"), provider, image: "img", snapshot: ref });
    expect(on.snapshot).toEqual(ref);
    // a provider without describe() still runs; the record just lacks sandboxEnv
    expect((await runRepair({ task: task(), agent: writer("fixed"), provider: new FakeProvider(), image: "img" })).sandboxEnv).toBeUndefined();
  });
});

describe("agent-v4 verification: the diff by kind, and agent-added tests removed before the verdict", () => {
  const nameStatus = ["M", "src/cart.ts", "D", "src/old.ts", "A", "tests/agent.test.ts", "A", "src/helper.ts", "A", "notes_spec.js", "A", "it's.test.ts", "T", "bin/run"].join("\0") + "\0";

  it("splitChanges reads `git diff --name-status -z`", () => {
    expect(splitChanges(nameStatus)).toEqual({ modifiedBase: ["src/cart.ts", "bin/run"], deletedBase: ["src/old.ts"], addedInRepo: ["tests/agent.test.ts", "src/helper.ts", "notes_spec.js", "it's.test.ts"] });
    expect(splitChanges("")).toEqual({ modifiedBase: [], deletedBase: [], addedInRepo: [] });
  });

  it("files matching the task's test discovery pattern (default: bun's) are removed before the repro and checks run, and recorded", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.startsWith("git diff --cached --no-renames --name-status -z") ? ok(nameStatus) : undefined);
    const r = await runRepair({ task: task(), agent: writer("fixed"), provider, image: "img" });
    expect(r.changes).toEqual(splitChanges(nameStatus));
    expect(r.removedBeforeVerify).toEqual(["tests/agent.test.ts", "notes_spec.js", "it's.test.ts"]);
    const verifying = r.commands.filter((c) => c.phase === "VERIFYING").map((c) => c.cmd);
    const rm = verifying.findIndex((c) => c.startsWith("git rm -q -f -- "));
    expect(verifying[rm]).toBe(`git rm -q -f -- 'tests/agent.test.ts' 'notes_spec.js' 'it'\\''s.test.ts'`);
    expect(rm).toBeGreaterThan(verifying.findIndex((c) => c.startsWith("git add -A && git diff --cached"))); // the recorded diff is the agent's full diff
    expect(rm).toBeLessThan(verifying.indexOf("run-repro")); // removed before the repro,
    expect(rm).toBeLessThan(verifying.indexOf("run-regression")); // the regressions
    expect(rm).toBeLessThan(verifying.findIndex((c) => c.includes("tsc --noEmit"))); // and the typecheck
    expect(r.finalState).toBe("RESOLVED");
  });

  it("a task's own testFilePattern replaces the default; nothing matching means nothing is removed", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.startsWith("git diff --cached --no-renames --name-status -z") ? ok(nameStatus) : undefined);
    const r = await runRepair({ task: task({ testFilePattern: String.raw`^src/helper\.ts$` }), agent: writer("fixed"), provider, image: "img" });
    expect(r.removedBeforeVerify).toEqual(["src/helper.ts"]);
    const none = new FakeProvider();
    const r2 = await runRepair({ task: task(), agent: writer("fixed"), provider: none, image: "img" });
    expect(r2.removedBeforeVerify).toEqual([]);
    expect(r2.commands.some((c) => c.cmd.startsWith("git rm"))).toBe(false);
  });
});

describe("typecheck gate: errors are compared with the baseline, not counted (decision 041)", () => {
  const BASE = [
    "index.ts(69,17): error TS18048: 'user' is possibly 'undefined'.",
    "index.ts(164,22): error TS18048: 'content' is possibly 'undefined'.",
    "index.ts(174,20): error TS18048: 'content' is possibly 'undefined'.",
    "worker.ts(145,7): error TS2322: Type 'Redis' is not assignable to type 'ConnectionOptions'.",
    "  Type 'Redis' is not assignable to type 'ClusterOptions | Redis'.",
    "    Type 'import(\"/work/a\").default' is not assignable to type 'import(\"/work/b\").default'.",
  ].join("\n");
  const checks = (output: string, exitCode = output ? 2 : 0): CheckResults => {
    const diagnostics = parseTscErrors(output);
    return { regression: [], typecheck: [{ package: "pkg", command: "tsc --noEmit", exitCode, errors: diagnostics.length, diagnostics }] };
  };
  const shift = (output: string, by: number) => output.replace(/\((\d+),(\d+)\)/g, (_m, l: string, c: string) => `(${Number(l) + by},${Number(c) + 3})`);

  it("parses file, code and the first line of the message; continuation lines and errors without a location", () => {
    expect(parseTscErrors(BASE)).toEqual([
      { file: "index.ts", code: "TS18048", message: "'user' is possibly 'undefined'." },
      { file: "index.ts", code: "TS18048", message: "'content' is possibly 'undefined'." },
      { file: "index.ts", code: "TS18048", message: "'content' is possibly 'undefined'." },
      { file: "worker.ts", code: "TS2322", message: "Type 'Redis' is not assignable to type 'ConnectionOptions'." },
    ]);
    expect(parseTscErrors("error TS5083: Cannot read file '/work/tsconfig.json'.")).toEqual([{ file: "", code: "TS5083", message: "Cannot read file '/work/tsconfig.json'." }]);
    expect(parseTscErrors("")).toEqual([]);
  });

  it("shifted lines pass: the same errors at other lines and columns are the baseline's", () => {
    expect(compareChecks(checks(BASE), checks(shift(BASE, 12)))).toEqual({ newFailures: [], preExistingFailures: ["typecheck pkg: 4 error(s) at baseline, 4 now"] });
  });

  it("a new error fails, and is named; an equal count doesn't hide it", () => {
    const added = `${shift(BASE, 1)}\nservices/linkDetector.ts(93,9): error TS2322: Type 'string' is not assignable to type 'number'.`;
    expect(compareChecks(checks(BASE), checks(added)).newFailures).toEqual(["typecheck pkg: 1 error(s) not in the baseline: services/linkDetector.ts TS2322: Type 'string' is not assignable to type 'number'."]);
    // one baseline error fixed and a different one introduced: the count is unchanged (4), the gate still fails
    const swapped = BASE.replace("index.ts(69,17): error TS18048: 'user' is possibly 'undefined'.", "index.ts(69,17): error TS2304: Cannot find name 'usr'.");
    expect(parseTscErrors(swapped)).toHaveLength(4);
    expect(compareChecks(checks(BASE), checks(swapped)).newFailures).toEqual(["typecheck pkg: 1 error(s) not in the baseline: index.ts TS2304: Cannot find name 'usr'."]);
    // a third copy of an error the baseline has twice is new
    const third = `${BASE}\nindex.ts(300,1): error TS18048: 'content' is possibly 'undefined'.`;
    expect(newTscErrors(parseTscErrors(BASE), parseTscErrors(third))).toEqual([{ file: "index.ts", code: "TS18048", message: "'content' is possibly 'undefined'." }]);
  });

  it("a removed baseline error passes", () => {
    const fewer = BASE.split("\n").slice(1).join("\n");
    expect(compareChecks(checks(BASE), checks(fewer))).toEqual({ newFailures: [], preExistingFailures: ["typecheck pkg: 4 error(s) at baseline, 3 now"] });
    expect(compareChecks(checks(BASE), checks("", 0)).newFailures).toEqual([]); // all fixed, tsc exits 0
  });

  it("a tsc that fails without reporting anything is a failure, not a clean result", () => {
    expect(compareChecks(checks(BASE), checks("", 127)).newFailures).toEqual(["typecheck pkg failed (exit 127) without TS errors; the baseline reported 4"]);
    expect(compareChecks(checks("", 0), checks("", 1)).newFailures).toEqual(["typecheck pkg failed (exit 1) without TS errors; passed at baseline"]);
  });
});

describe("repo profile and seed patch (decision 041; fake provider)", () => {
  const profile = RepoProfile.parse({ id: "sub", workdir: "pkg-a", install: "needs-network install", test: "run-regression", typecheck: "$TSC --noEmit" });
  const profiled = (extra: Partial<LoadedTask> = {}, spec: Partial<TaskSpec> = {}): LoadedTask => ({ ...task({ regression: [], typecheck: undefined, kind: "smoke", ...spec }), profile, ...extra });

  it("checkPlan: the profile's commands run in its workdir, before the task's own; no profile leaves the task as it was", () => {
    expect(checkPlan({ setup: ["extra"], regression: ["more"], typecheck: { packages: ["."], command: "tsc --noEmit" } }, profile)).toEqual({
      setup: ['cd "pkg-a" && needs-network install', "extra"],
      regression: ['cd "pkg-a" && run-regression', "more"],
      typecheck: [{ package: "pkg-a", command: "$TSC --noEmit" }, { package: ".", command: "tsc --noEmit" }],
    });
    expect(checkPlan({ setup: ["s"], regression: ["r"] })).toEqual({ setup: ["s"], regression: ["r"], typecheck: [] });
    expect(checkPlan({ setup: [], regression: [] }, RepoProfile.parse({ id: "root", test: "bun test" })).regression).toEqual(["bun test"]);
    expect(() => RepoProfile.parse({ id: "x", workdir: "../out" })).toThrow(/inside the repo/);
    expect(() => RepoProfile.parse({ id: "x", workdir: "/abs" })).toThrow(/inside the repo/);
  });

  it("install runs in the workdir with the network on; the network is off and proven off before the first check", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.includes(`[ -f ${REPO_TSC} ]`) ? ok("repo\nVersion 5.9.3\n") : cmd === 'cd "pkg-a" && needs-network install' ? (provider.network ? ok() : fail(6)) : undefined);
    const r = await runRepair({ task: profiled(), agent: writer("fixed"), provider, image: "img" });
    expect(r.finalState).toBe("RESOLVED");
    const cmds = r.commands.map((c) => `${c.phase}:${c.cmd}`);
    const install = cmds.indexOf('PREPARING_SANDBOX:cd "pkg-a" && needs-network install');
    const off = cmds.findIndex((c) => c.startsWith("NETWORK_OFF:"));
    expect(install).toBeGreaterThan(0);
    expect(install).toBeLessThan(off);
    expect(r.commands.filter((c) => c.phase === "NETWORK_OFF").map((c) => c.exitCode)).toEqual([6, 6]);
    expect(off).toBeLessThan(cmds.findIndex((c) => c.startsWith("REPRODUCING:")));
    // the repo's own tsc was found, so that is what ran, at baseline and after the patch
    expect(cmds.filter((c) => c.endsWith(`cd "pkg-a" && bun ${REPO_TSC} --noEmit`)).map((c) => c.split(":")[0])).toEqual(["BASELINE", "VERIFYING"]);
    expect(cmds.filter((c) => c.endsWith('cd "pkg-a" && run-regression')).map((c) => c.split(":")[0])).toEqual(["BASELINE", "VERIFYING"]);
    expect(r.baseline!.typecheck[0]).toMatchObject({ package: "pkg-a", command: `bun ${REPO_TSC} --noEmit`, tsc: { source: "repo", version: "5.9.3" } });
    expect(r).toMatchObject({ taskKind: "smoke", profile: { id: "sub", workdir: "pkg-a" }, plan: { regression: ['cd "pkg-a" && run-regression'] } });
  });

  it("without a tsc in the repo's node_modules the image's global one runs, and the record says so; the agent is told the real commands", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.includes(`[ -f ${REPO_TSC} ]`) ? ok("image\nVersion 5.9.3\n") : undefined);
    let told: string[] = [];
    const r = await runRepair({ task: profiled(), agent: { name: "listens", run: async (ctx) => void ((told = ctx.testCommands), await ctx.writeFile("state", "fixed")) }, provider, image: "img" });
    expect(r.final!.typecheck[0]).toMatchObject({ command: "tsc --noEmit", tsc: { source: "image", version: "5.9.3" } });
    expect(told).toEqual(['cd "pkg-a" && run-regression', 'cd "pkg-a" && tsc --noEmit']);
  });

  it("a seed patch is applied after checkout and before install and the squash, and is in the record by hash", async () => {
    const provider = new FakeProvider();
    provider.onExec = (cmd) => (cmd.includes(`[ -f ${REPO_TSC} ]`) ? ok("repo\nVersion 5.9.3\n") : cmd === "git status --porcelain" ? ok(" M pkg-a/src/x.ts\n") : undefined);
    const r = await runRepair({ task: profiled({ seedPatch: "diff --git a/x b/x\n" }), agent: writer("fixed"), provider, image: "img" });
    expect(r.finalState).toBe("RESOLVED");
    const cmds = r.commands.map((c) => c.cmd);
    const apply = cmds.findIndex((c) => c.startsWith("git apply --whitespace=nowarn /tmp/.th-seed.patch"));
    expect(apply).toBe(1); // right after the checkout
    expect(cmds[apply]).toMatch(/&& rm -f \/tmp\/\.th-seed\.patch$/); // the patch file doesn't stay in the sandbox
    expect(apply).toBeLessThan(cmds.indexOf('cd "pkg-a" && needs-network install'));
    expect(apply).toBeLessThan(cmds.indexOf(SQUASH_HISTORY));
    expect(provider.files.get("/tmp/.th-seed.patch")).toBe("diff --git a/x b/x\n");
    expect(r.seed!.patchSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a seed patch that changes nothing, or doesn't apply, ends the run FAILED before anything else runs", async () => {
    const nothing = new FakeProvider(); // `git status --porcelain` prints nothing
    const r = await runRepair({ task: profiled({ seedPatch: "" }), agent: writer("fixed"), provider: nothing, image: "img" });
    expect(r).toMatchObject({ finalState: "FAILED", reason: "the seed patch changed nothing" });
    expect(r.commands.some((c) => c.cmd.includes("needs-network install"))).toBe(false);
    expect(nothing.destroyed).toEqual(["fake-1"]);
    const rejects = new FakeProvider();
    rejects.onExec = (cmd) => (cmd.startsWith("git apply") ? fail(1) : undefined);
    const r2 = await runRepair({ task: profiled({ seedPatch: "garbage" }), agent: writer("fixed"), provider: rejects, image: "img" });
    expect(r2.finalState).toBe("FAILED");
    expect(r2.reason).toMatch(/^applying the seed patch failed \(exit 1\)/);
    expect(r2.states.map((s) => s.state)).not.toContain("REPRODUCING");
  });
});

describe("task.json", () => {
  it("loads the profile and the seed patch named in task.json, relative to the task dir", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-task-"));
    writeFileSync(path.join(dir, "repro.test.ts"), "test()");
    writeFileSync(path.join(dir, "seed.patch"), "PATCH");
    writeFileSync(path.join(dir, "p.json"), JSON.stringify({ id: "p", workdir: "backend", test: "bun test" }));
    const spec = { id: "t", kind: "smoke", profile: "p.json", seed: { patch: "seed.patch" }, source: { gitUrl: "https://example.invalid/r.git" }, baseSha: SHA, issue: "x", repro: { testFile: "repro.test.ts", dest: "r/x.test.ts", command: "bun test" }, limits: { steps: 1, wallClockMs: 1, tokens: 0 } };
    writeFileSync(path.join(dir, "task.json"), JSON.stringify(spec));
    const t = loadTask(path.join(dir, "task.json"));
    expect(t.profile).toEqual({ id: "p", workdir: "backend", test: "bun test" });
    expect(t.seedPatch).toBe("PATCH");
    expect(t.spec.kind).toBe("smoke");
    writeFileSync(path.join(dir, "task.json"), JSON.stringify({ ...spec, seed: { patch: "missing.patch" } }));
    expect(() => loadTask(path.join(dir, "task.json"))).toThrow(/seed patch .* does not exist/);
    writeFileSync(path.join(dir, "task.json"), JSON.stringify({ ...spec, profile: "missing.json" }));
    expect(() => loadTask(path.join(dir, "task.json"))).toThrow(/repo profile .* does not exist/);
  });


  it("resolves paths against the task dir and rejects a repro dest outside the repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-task-"));
    writeFileSync(path.join(dir, "repro.test.ts"), "test()");
    const spec = { id: "t", source: { localPath: "../repo" }, baseSha: SHA, issue: "x", repro: { testFile: "repro.test.ts", dest: "r/x.test.ts", command: "bun test" }, limits: { steps: 1, wallClockMs: 1, tokens: 0 } };
    writeFileSync(path.join(dir, "task.json"), JSON.stringify(spec));
    const t = loadTask(path.join(dir, "task.json"));
    expect(t.localPath).toBe(path.resolve(dir, "../repo"));
    expect(t.spec).toMatchObject({ setup: [], regression: [], limits: { commandTimeoutMs: 120_000 } });
    writeFileSync(path.join(dir, "task.json"), JSON.stringify({ ...spec, repro: { ...spec.repro, dest: "../escape.test.ts" } }));
    expect(() => loadTask(path.join(dir, "task.json"))).toThrow(/repro.dest must be a path inside the repo/);
  });
});
