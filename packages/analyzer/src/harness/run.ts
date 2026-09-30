// Repair run: PREPARING_SANDBOX → REPRODUCING → PATCHING → VERIFYING → RESOLVED | UNRESOLVED | FAILED | CANCELLED
// (decision 026). The harness decides the outcome from what it runs itself; it never reads or
// trusts anything the agent says, including how many tokens it used.
import { randomUUID } from "node:crypto";
import { BudgetExceededError } from "../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import type { Agent, AgentContext } from "./agents.ts";
import type { ExecResult, SandboxHandle, SandboxProvider, SandboxSource } from "./provider.ts";
import type { LoadedTask, TaskSpec } from "./task.ts";

export type RunState = "PREPARING_SANDBOX" | "REPRODUCING" | "PATCHING" | "VERIFYING" | "RESOLVED" | "UNRESOLVED" | "FAILED" | "CANCELLED";
export type Phase = "PREPARING_SANDBOX" | "NETWORK_OFF" | "REPRODUCING" | "BASELINE" | "PATCHING" | "VERIFYING";

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
  sandbox: { id?: string; createStartedAt?: string; createdAt?: string; networkOffAt?: string; destroyedAt?: string; createToDestroyMs?: number; destroyed: boolean };
  commands: CommandRecord[];
  repro: { atBase?: { exitCode: number; timedOut: boolean }; afterPatch?: { exitCode: number; timedOut: boolean } };
  baseline?: CheckResults;
  final?: CheckResults;
  comparison?: { newFailures: string[]; preExistingFailures: string[] };
  diff?: string;
  agentRun?: { steps: number; budgetExhausted?: string; error?: string; trace?: unknown };
  /** Counted by the harness from API usage fields (via the shared client), never from the agent. */
  usage: {
    llmCalls: number;
    inputTokens: number;
    outputTokens: number;
    tokens: number;
    costUSD: number;
    calls?: { purpose: string; inputTokens: number; outputTokens: number; costUSD: number; latencyMs: number; cached: boolean }[];
  };
}

/** External stop only: Ctrl-C, SIGTERM, an explicit abort. */
export class RunCancelled extends Error {
  override name = "RunCancelled";
}
/** The task or the infrastructure is at fault. */
export class RunFailed extends Error {
  override name = "RunFailed";
}
/** The agent used up a limit (wall-clock, steps, tokens): the run ends UNRESOLVED. */
export class BudgetExhausted extends Error {
  override name = "BudgetExhausted";
}

const tail = (s: string, n = 2000) => (s.length > n ? `…${s.slice(-n)}` : s);
const now = () => new Date().toISOString();
const TS_ERROR = /error TS\d+:/g;

/** Outbound requests that must FAIL once the network is off: a DNS name and a raw IP. */
export const NETWORK_PROBES = ["curl -sS -o /dev/null --max-time 5 https://registry.npmjs.org/", "curl -sS -o /dev/null --max-time 5 http://1.1.1.1/"];

/** Runs a harness command in the sandbox and logs it; the harness's only way to execute. */
export type Sh = (phase: Phase, cmd: string, opts?: { actor?: CommandRecord["actor"]; timeoutMs?: number }) => Promise<ExecResult>;

export function makeSh(provider: SandboxProvider, getHandle: () => SandboxHandle, log: CommandRecord[], defaultTimeoutMs: number, signal?: AbortSignal): Sh {
  return async (phase, cmd, opts = {}) => {
    if (signal?.aborted) throw new RunCancelled("cancelled by signal");
    const r = await provider.exec(getHandle(), cmd, { timeoutMs: opts.timeoutMs ?? defaultTimeoutMs });
    log.push({ phase, actor: opts.actor ?? "harness", cmd, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) });
    if (signal?.aborted) throw new RunCancelled("cancelled by signal");
    return r;
  };
}

async function mustPass(sh: Sh, phase: Phase, cmd: string, what: string, timeoutMs?: number): Promise<ExecResult> {
  const r = await sh(phase, cmd, { timeoutMs });
  if (r.timedOut) throw new RunFailed(`${what} timed out after ${timeoutMs ?? "the command timeout"}ms: ${cmd}`);
  if (r.exitCode !== 0) throw new RunFailed(`${what} failed (exit ${r.exitCode}): ${cmd}`);
  return r;
}

/**
 * PREPARING_SANDBOX: create (network on), check out baseSha, run setup (network on), then cut the
 * network and prove it's off. Shared by repair runs and the infrastructure test.
 */
export async function prepareSandbox(args: {
  provider: SandboxProvider;
  image: string;
  source: SandboxSource;
  baseSha: string;
  setup: string[];
  commandTimeoutMs: number;
  log: CommandRecord[];
  signal?: AbortSignal;
  onHandle: (h: SandboxHandle) => void;
  timings?: Record<string, number>;
}): Promise<SandboxHandle> {
  const t = (label: string, start: number) => args.timings && (args.timings[label] = Math.round(performance.now() - start));
  let handle: SandboxHandle | undefined;
  const sh = makeSh(args.provider, () => handle!, args.log, args.commandTimeoutMs, args.signal);
  let start = performance.now();
  handle = await args.provider.create({ image: args.image, source: args.source });
  args.onHandle(handle);
  t("create (clone + container)", start);
  start = performance.now();
  await mustPass(sh, "PREPARING_SANDBOX", `git checkout -q --detach ${args.baseSha} && test "$(git rev-parse HEAD)" = ${args.baseSha}`, "checking out baseSha");
  t("checkout", start);
  for (const cmd of args.setup) {
    start = performance.now();
    await mustPass(sh, "PREPARING_SANDBOX", cmd, "setup command", args.commandTimeoutMs);
    t(`setup: ${cmd}`, start);
  }
  start = performance.now();
  await args.provider.disableNetwork(handle);
  for (const probe of NETWORK_PROBES) {
    const r = await sh("NETWORK_OFF", probe, { timeoutMs: 20_000 });
    if (r.exitCode === 0) throw new RunFailed(`network is still reachable after disconnecting: ${probe}`);
  }
  t("network off + proof", start);
  return handle;
}

/** Regression exit codes and `tsc` error counts per package (baseline and final). */
export async function collectChecks(sh: Sh, phase: Phase, spec: Pick<TaskSpec, "regression" | "typecheck">): Promise<CheckResults> {
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
}

/** A new failure = failed now but passed at baseline, or more TS errors than at baseline. */
export function compareChecks(baseline: CheckResults, final: CheckResults): { newFailures: string[]; preExistingFailures: string[] } {
  const newFailures: string[] = [];
  const preExistingFailures: string[] = [];
  final.regression.forEach((f, i) => {
    const b = baseline.regression[i]!;
    const failed = f.exitCode !== 0 || f.timedOut;
    if (failed && b.exitCode === 0 && !b.timedOut) newFailures.push(`regression "${f.cmd}" now fails (exit ${f.exitCode}${f.timedOut ? ", timed out" : ""}; passed at baseline)`);
    else if (failed) preExistingFailures.push(`regression "${f.cmd}" also failed at baseline (exit ${b.exitCode})`);
  });
  final.typecheck.forEach((f, i) => {
    const b = baseline.typecheck[i]!;
    if (f.errors > b.errors) newFailures.push(`typecheck ${f.package}: ${f.errors} errors (baseline ${b.errors})`);
    else if (f.exitCode !== 0 && f.errors === 0 && b.exitCode === 0) newFailures.push(`typecheck ${f.package} failed (exit ${f.exitCode}) without TS errors; passed at baseline`);
    else if (b.errors > 0) preExistingFailures.push(`typecheck ${f.package}: ${b.errors} error(s) at baseline, ${f.errors} now`);
  });
  return { newFailures, preExistingFailures };
}

export interface RunOptions {
  task: LoadedTask;
  agent: Agent;
  provider: SandboxProvider;
  image: string;
  /** Shared LLM client (TokenFactoryClient: cache → budget → request → ledger); usage is counted from its results. */
  llm?: { chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> };
  graph?: AgentContext["graph"];
  /** Abort the run (Ctrl-C, SIGTERM, explicit cancel): it ends CANCELLED after cleanup. */
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
    usage: { llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUSD: 0 },
  };
  const enter = (state: RunState, note?: string) => {
    record.states.push({ state, at: now(), ...(note && { note }) });
    opts.onState?.(state, note);
  };
  let handle: SandboxHandle | undefined;
  const sh = makeSh(provider, () => handle!, record.commands, spec.limits.commandTimeoutMs, opts.signal);
  const runRepro = async (phase: Phase) => {
    await provider.writeFile(handle!, spec.repro.dest, task.reproContent);
    const r = await sh(phase, spec.repro.command);
    await mustPass(sh, phase, `rm -f ${JSON.stringify(spec.repro.dest)}`, "removing the repro test");
    return { exitCode: r.exitCode, timedOut: r.timedOut };
  };

  try {
    // ── PREPARING_SANDBOX: network on for clone + setup, then off and proven off ─────────────
    enter("PREPARING_SANDBOX");
    const source: SandboxSource = "gitUrl" in spec.source ? { gitUrl: spec.source.gitUrl, sha: spec.baseSha } : { localPath: task.localPath! };
    record.sandbox.createStartedAt = now();
    await prepareSandbox({
      provider,
      image,
      source,
      baseSha: spec.baseSha,
      setup: spec.setup,
      commandTimeoutMs: spec.limits.commandTimeoutMs,
      log: record.commands,
      signal: opts.signal,
      onHandle: (h) => {
        handle = h;
        record.sandbox = { ...record.sandbox, id: h.id, createdAt: now() };
      },
    });
    record.sandbox.networkOffAt = now();

    // ── REPRODUCING (+ baseline), network off ─────────────────────────────────────────────
    enter("REPRODUCING");
    record.repro.atBase = await runRepro("REPRODUCING");
    if (record.repro.atBase.timedOut) throw new RunFailed(`repro command timed out: ${spec.repro.command}`);
    if (record.repro.atBase.exitCode === 0) throw new RunFailed("repro does not reproduce: the repro test passes at baseSha");
    await mustPass(sh, "REPRODUCING", `test -z "$(git status --porcelain)"`, "checking the tree is clean before the agent starts");
    record.baseline = await collectChecks(sh, "BASELINE", spec);
    if (Date.now() >= deadline) throw new RunFailed(`wall-clock limit ${spec.limits.wallClockMs}ms reached before the agent started`);

    // ── PATCHING: the agent's budget is wall-clock, steps and harness-counted tokens ────────
    enter("PATCHING");
    let steps = 0;
    const budget = () => {
      if (opts.signal?.aborted) throw new RunCancelled("cancelled by signal");
      if (Date.now() >= deadline) throw new BudgetExhausted(`wall-clock ${spec.limits.wallClockMs}ms`);
    };
    const step = () => {
      budget();
      if (++steps > spec.limits.steps) throw new BudgetExhausted(`steps ${spec.limits.steps}`);
    };
    const ctx: AgentContext = {
      issue: spec.issue,
      limits: spec.limits,
      exec: async (cmd, o) => {
        step();
        const r = await sh("PATCHING", cmd, { actor: "agent", timeoutMs: Math.max(1000, Math.min(o?.timeoutMs ?? spec.limits.commandTimeoutMs, deadline - Date.now())) });
        if (r.timedOut && Date.now() >= deadline - 500) throw new BudgetExhausted(`wall-clock ${spec.limits.wallClockMs}ms`);
        return r;
      },
      writeFile: async (p, content) => (step(), provider.writeFile(handle!, p, content)),
      readFile: async (p) => (step(), provider.readFile(handle!, p)),
      step: () => step(),
      ...(opts.llm && {
        llm: {
          chat: async (request: ChatRequest, meta?: { purpose: string }) => {
            budget();
            if (record.usage.tokens >= spec.limits.tokens) throw new BudgetExhausted(`tokens ${spec.limits.tokens}`);
            if (record.usage.costUSD >= spec.limits.costUSD) throw new BudgetExhausted(`cost $${spec.limits.costUSD}`);
            let result: ChatResult;
            try {
              result = await opts.llm!.chat(request, { purpose: meta?.purpose ?? `repair-agent:${agent.name}` });
            } catch (error) {
              // the shared client's own caps (per-process run cap, total cap) also end the agent's budget
              if (error instanceof BudgetExceededError) throw new BudgetExhausted(`cost cap (${error.message})`);
              throw error;
            }
            // the harness's own count, from the API response's usage fields as returned by the shared client
            record.usage.llmCalls++;
            record.usage.inputTokens += result.inputTokens ?? 0;
            record.usage.outputTokens += result.outputTokens ?? 0;
            record.usage.tokens = record.usage.inputTokens + record.usage.outputTokens;
            record.usage.costUSD += result.costUSD;
            (record.usage.calls ??= []).push({
              purpose: meta?.purpose ?? `repair-agent:${agent.name}`,
              inputTokens: result.inputTokens ?? 0,
              outputTokens: result.outputTokens ?? 0,
              costUSD: result.costUSD,
              latencyMs: result.latencyMs,
              cached: result.cached,
            });
            if (record.usage.tokens > spec.limits.tokens) throw new BudgetExhausted(`tokens ${spec.limits.tokens}`);
            if (record.usage.costUSD > spec.limits.costUSD) throw new BudgetExhausted(`cost $${spec.limits.costUSD}`);
            return result;
          },
        },
      }),
      ...(opts.graph && { graph: opts.graph }),
    };
    record.agentRun = { steps: 0 };
    try {
      await agent.run(ctx);
    } catch (error) {
      if (error instanceof RunCancelled) throw error;
      if (error instanceof BudgetExhausted) record.agentRun.budgetExhausted = error.message;
      else record.agentRun.error = (error as Error).message;
    }
    record.agentRun.steps = Math.min(steps, spec.limits.steps);
    if (agent.trace !== undefined) record.agentRun.trace = agent.trace;

    // ── VERIFYING: the harness's own checks only (not bounded by the agent's wall-clock) ────
    enter("VERIFYING");
    const diff = await sh("VERIFYING", `git add -A && git diff --cached ${spec.baseSha}`);
    if (diff.exitCode !== 0) throw new RunFailed(`could not extract the diff (exit ${diff.exitCode})`);
    record.diff = diff.stdout;
    record.repro.afterPatch = await runRepro("VERIFYING");
    record.final = await collectChecks(sh, "VERIFYING", spec);
    record.comparison = compareChecks(record.baseline, record.final);

    const reproPasses = record.repro.afterPatch.exitCode === 0 && !record.repro.afterPatch.timedOut;
    if (record.agentRun.budgetExhausted) finish("UNRESOLVED", `budget exhausted: ${record.agentRun.budgetExhausted}`);
    else if (reproPasses && record.comparison.newFailures.length === 0) finish("RESOLVED", "repro passes and nothing fails that passed at baseline");
    else
      finish(
        "UNRESOLVED",
        [!reproPasses && `repro still fails (exit ${record.repro.afterPatch.exitCode}${record.repro.afterPatch.timedOut ? ", timed out" : ""})`, ...record.comparison.newFailures].filter(Boolean).join("; "),
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
