// Repair run: PREPARING_SANDBOX → REPRODUCING → PATCHING → VERIFYING → RESOLVED | UNRESOLVED | FAILED | CANCELLED
// (decision 026). The harness decides the outcome from what it runs itself; it never reads or
// trusts anything the agent says.
import { randomUUID } from "node:crypto";
import type { Agent, AgentContext } from "./agents.ts";
import type { ExecResult, SandboxHandle, SandboxProvider, SandboxSource } from "./provider.ts";
import type { LoadedTask } from "./task.ts";

export type RunState = "PREPARING_SANDBOX" | "REPRODUCING" | "PATCHING" | "VERIFYING" | "RESOLVED" | "UNRESOLVED" | "FAILED" | "CANCELLED";
type Phase = "PREPARING_SANDBOX" | "REPRODUCING" | "BASELINE" | "PATCHING" | "VERIFYING";

export interface CommandRecord {
  phase: Phase;
  actor: "harness" | "agent";
  cmd: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  stdoutTail: string;
  stderrTail: string;
}

export interface CheckResults {
  regression: { cmd: string; exitCode: number; timedOut: boolean }[];
  typecheck: { package: string; exitCode: number; errors: number }[];
}

export interface RunRecord {
  runId: string;
  taskId: string;
  provider: string;
  agent: string;
  image: string;
  baseSha: string;
  startedAt: string;
  endedAt?: string;
  states: { state: RunState; at: string; note?: string }[];
  finalState?: RunState;
  reason?: string;
  sandbox: { id?: string; createStartedAt?: string; createdAt?: string; destroyedAt?: string; createToDestroyMs?: number; destroyed: boolean };
  commands: CommandRecord[];
  repro: { atBase?: { exitCode: number; timedOut: boolean }; afterPatch?: { exitCode: number; timedOut: boolean } };
  baseline?: CheckResults;
  final?: CheckResults;
  comparison?: { newFailures: string[]; preExistingFailures: string[] };
  diff?: string;
  agentRun?: { steps: number; stoppedBy?: string; error?: string };
  usage: { tokens: number; costUSD: number };
}

export class RunCancelled extends Error {
  override name = "RunCancelled";
}
class RunFailed extends Error {
  override name = "RunFailed";
}
class StepLimit extends Error {
  override name = "StepLimit";
}

const tail = (s: string, n = 2000) => (s.length > n ? `…${s.slice(-n)}` : s);
const now = () => new Date().toISOString();
const TS_ERROR = /error TS\d+:/g;

export interface RunOptions {
  task: LoadedTask;
  agent: Agent;
  provider: SandboxProvider;
  image: string;
  graph?: AgentContext["graph"];
  /** Set to abort the run (e.g. from a SIGINT handler): it ends CANCELLED after cleanup. */
  signal?: AbortSignal;
  onState?: (state: RunState, note?: string) => void;
}

export async function runRepair(opts: RunOptions): Promise<RunRecord> {
  const { task, agent, provider, image } = opts;
  const spec = task.spec;
  const started = Date.now();
  const deadline = started + spec.limits.wallClockMs;
  const record: RunRecord = {
    runId: `${spec.id}__${agent.name}__${new Date(started).toISOString().replace(/[:.]/g, "-")}__${randomUUID().slice(0, 6)}`,
    taskId: spec.id,
    provider: provider.name,
    agent: agent.name,
    image,
    baseSha: spec.baseSha,
    startedAt: new Date(started).toISOString(),
    states: [],
    sandbox: { destroyed: false },
    commands: [],
    repro: {},
    usage: { tokens: 0, costUSD: 0 },
  };
  const enter = (state: RunState, note?: string) => {
    record.states.push({ state, at: now(), ...(note && { note }) });
    opts.onState?.(state, note);
  };
  const checkLive = () => {
    if (opts.signal?.aborted) throw new RunCancelled("cancelled by signal");
    if (Date.now() >= deadline) throw new RunCancelled(`wall-clock limit ${spec.limits.wallClockMs}ms reached`);
  };
  const timeout = (want = spec.limits.commandTimeoutMs) => Math.max(1000, Math.min(want, deadline - Date.now()));

  let handle: SandboxHandle | undefined;
  const sh = async (phase: Phase, cmd: string, actor: CommandRecord["actor"] = "harness", timeoutMs?: number): Promise<ExecResult> => {
    checkLive();
    const r = await provider.exec(handle!, cmd, { timeoutMs: timeout(timeoutMs) });
    record.commands.push({ phase, actor, cmd, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) });
    // a command cut short by the run's own deadline is a wall-clock stop, not a command failure
    if (r.timedOut && Date.now() >= deadline - 500) throw new RunCancelled(`wall-clock limit ${spec.limits.wallClockMs}ms reached during: ${cmd}`);
    if (opts.signal?.aborted) throw new RunCancelled("cancelled by signal");
    return r;
  };
  const mustPass = async (phase: Phase, cmd: string, what: string) => {
    const r = await sh(phase, cmd);
    if (r.timedOut) throw new RunFailed(`${what} timed out after ${timeout()}ms: ${cmd}`);
    if (r.exitCode !== 0) throw new RunFailed(`${what} failed (exit ${r.exitCode}): ${cmd}`);
    return r;
  };
  const checks = async (phase: Phase): Promise<CheckResults> => {
    const regression = [];
    for (const cmd of spec.regression) {
      const r = await sh(phase, cmd);
      regression.push({ cmd, exitCode: r.exitCode, timedOut: r.timedOut });
    }
    const typecheck = [];
    for (const pkg of spec.typecheck?.packages ?? []) {
      const r = await sh(phase, `cd ${JSON.stringify(pkg)} && ${spec.typecheck!.command}`);
      typecheck.push({ package: pkg, exitCode: r.exitCode, errors: (r.stdout + r.stderr).match(TS_ERROR)?.length ?? 0 });
    }
    return { regression, typecheck };
  };
  const runRepro = async (phase: Phase) => {
    await provider.writeFile(handle!, spec.repro.dest, task.reproContent);
    const r = await sh(phase, spec.repro.command);
    await mustPass(phase, `rm -f ${JSON.stringify(spec.repro.dest)}`, "removing the repro test");
    return { exitCode: r.exitCode, timedOut: r.timedOut };
  };

  try {
    // ── PREPARING_SANDBOX ─────────────────────────────────────────────────────────────────
    enter("PREPARING_SANDBOX");
    checkLive();
    const source: SandboxSource = "gitUrl" in spec.source ? { gitUrl: spec.source.gitUrl, sha: spec.baseSha } : { localPath: task.localPath! };
    record.sandbox.createStartedAt = now();
    handle = await provider.create({ image, source, network: spec.network });
    record.sandbox = { ...record.sandbox, id: handle.id, createdAt: now() };
    await mustPass("PREPARING_SANDBOX", `git checkout -q --detach ${spec.baseSha} && test "$(git rev-parse HEAD)" = ${spec.baseSha}`, "checking out baseSha");
    for (const cmd of spec.setup) await mustPass("PREPARING_SANDBOX", cmd, "setup command");

    // ── REPRODUCING (+ baseline) ──────────────────────────────────────────────────────────
    enter("REPRODUCING");
    record.repro.atBase = await runRepro("REPRODUCING");
    if (record.repro.atBase.timedOut) throw new RunFailed(`repro command timed out: ${spec.repro.command}`);
    if (record.repro.atBase.exitCode === 0) throw new RunFailed("repro does not reproduce: the repro test passes at baseSha");
    await mustPass("REPRODUCING", `test -z "$(git status --porcelain)"`, "checking the tree is clean before the agent starts");
    record.baseline = await checks("BASELINE");

    // ── PATCHING ──────────────────────────────────────────────────────────────────────────
    enter("PATCHING");
    let steps = 0;
    const step = () => {
      checkLive();
      if (++steps > spec.limits.steps) throw new StepLimit(`step limit ${spec.limits.steps} reached`);
    };
    const ctx: AgentContext = {
      issue: spec.issue,
      limits: spec.limits,
      exec: async (cmd, o) => (step(), sh("PATCHING", cmd, "agent", o?.timeoutMs)),
      writeFile: async (p, content) => (step(), provider.writeFile(handle!, p, content)),
      readFile: async (p) => (step(), provider.readFile(handle!, p)),
      reportUsage: ({ tokens, costUSD }) => {
        record.usage.tokens += tokens;
        record.usage.costUSD += costUSD;
        if (record.usage.tokens > spec.limits.tokens) throw new StepLimit(`token limit ${spec.limits.tokens} reached`);
      },
      ...(opts.graph && { graph: opts.graph }),
    };
    record.agentRun = { steps: 0 };
    try {
      await agent.run(ctx);
    } catch (error) {
      if (error instanceof RunCancelled) throw error;
      if (error instanceof StepLimit) record.agentRun.stoppedBy = error.message;
      else record.agentRun.error = (error as Error).message;
    }
    record.agentRun.steps = steps;

    // ── VERIFYING: the harness's own checks only ──────────────────────────────────────────
    enter("VERIFYING");
    const diff = await sh("VERIFYING", `git add -A && git diff --cached ${spec.baseSha}`);
    if (diff.exitCode !== 0) throw new RunFailed(`could not extract the diff (exit ${diff.exitCode})`);
    record.diff = diff.stdout;
    record.repro.afterPatch = await runRepro("VERIFYING");
    record.final = await checks("VERIFYING");

    const newFailures: string[] = [];
    const preExisting: string[] = [];
    record.final.regression.forEach((f, i) => {
      const b = record.baseline!.regression[i]!;
      const failed = f.exitCode !== 0 || f.timedOut;
      if (failed && (b.exitCode === 0 && !b.timedOut)) newFailures.push(`regression "${f.cmd}" now fails (exit ${f.exitCode}${f.timedOut ? ", timed out" : ""}; passed at baseline)`);
      else if (failed) preExisting.push(`regression "${f.cmd}" also failed at baseline (exit ${b.exitCode})`);
    });
    record.final.typecheck.forEach((f, i) => {
      const b = record.baseline!.typecheck[i]!;
      if (f.errors > b.errors) newFailures.push(`typecheck ${f.package}: ${f.errors} errors (baseline ${b.errors})`);
      else if (f.exitCode !== 0 && f.errors === 0 && b.exitCode === 0) newFailures.push(`typecheck ${f.package} failed (exit ${f.exitCode}) without TS errors; passed at baseline`);
      else if (b.errors > 0) preExisting.push(`typecheck ${f.package}: ${b.errors} error(s) at baseline, ${f.errors} now`);
    });
    record.comparison = { newFailures, preExistingFailures: preExisting };

    const reproPasses = record.repro.afterPatch.exitCode === 0 && !record.repro.afterPatch.timedOut;
    if (reproPasses && newFailures.length === 0) finish("RESOLVED", "repro passes and nothing fails that passed at baseline");
    else
      finish(
        "UNRESOLVED",
        [!reproPasses && `repro still fails (exit ${record.repro.afterPatch.exitCode}${record.repro.afterPatch.timedOut ? ", timed out" : ""})`, ...newFailures].filter(Boolean).join("; "),
      );
  } catch (error) {
    if (error instanceof RunCancelled) finish("CANCELLED", error.message);
    else if (error instanceof RunFailed) finish("FAILED", error.message);
    else finish("FAILED", `harness error: ${(error as Error).message}`);
  } finally {
    if (handle) {
      await provider.destroy(handle).catch((e: Error) => (record.reason += `; destroy failed: ${e.message}`));
      record.sandbox.destroyed = true;
      record.sandbox.destroyedAt = now();
      record.sandbox.createToDestroyMs = Date.parse(record.sandbox.destroyedAt) - Date.parse(record.sandbox.createStartedAt!);
    }
    record.endedAt = now();
  }
  return record;

  function finish(state: RunState, reason: string) {
    record.finalState = state;
    record.reason = reason;
    enter(state, reason);
  }
}
