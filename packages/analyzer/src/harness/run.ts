// Repair run: PREPARING_SANDBOX → REPRODUCING → PATCHING → VERIFYING → RESOLVED | UNRESOLVED | FAILED | CANCELLED
// (decision 026). The harness decides the outcome from what it runs itself; it never reads or
// trusts anything the agent says, including how many tokens it used.
import { randomUUID } from "node:crypto";
import { BudgetExceededError } from "../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import { AgentStopped, type Agent, type AgentContext } from "./agents.ts";
import { SCRATCH } from "./tools.ts";
import { SandboxGoneError, type ExecResult, type SandboxDescription, type SandboxHandle, type SandboxProvider, type SandboxSource } from "./provider.ts";
import { BUN_TEST_FILE_PATTERN, type LoadedTask, type TaskSpec } from "./task.ts";

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
  /** Decision 036: provider version, engine version and the image id actually used. */
  sandboxEnv?: SandboxDescription;
  /** The graph snapshot a graph-on run read (with the file's sha256); "none" for graph off. */
  snapshot: GraphSnapshotRef | "none";
  baseSha: string;
  /** The sandbox's single squashed commit of baseSha's tree (after setup); diffs are taken against it. */
  baseCommit?: string;
  startedAt: string;
  endedAt?: string;
  states: { state: RunState; at: string; note?: string }[];
  finalState?: RunState;
  reason?: string;
  sandbox: {
    id?: string;
    createStartedAt?: string;
    createdAt?: string;
    networkOffAt?: string;
    destroyedAt?: string;
    createToDestroyMs?: number;
    /** true only when the container is verifiably gone after cleanup */
    destroyed: boolean;
    /** decision 037: who removed it - the harness's destroy(), its own lifetime deadline, or unknown */
    removedBy?: "harness" | "lifetime" | "unknown";
    lifetimeMs?: number;
  };
  commands: CommandRecord[];
  repro: { atBase?: { exitCode: number; timedOut: boolean }; afterPatch?: { exitCode: number; timedOut: boolean } };
  baseline?: CheckResults;
  final?: CheckResults;
  comparison?: { newFailures: string[]; preExistingFailures: string[] };
  diff?: string;
  /** agent-v4: the diff by kind (repo-relative paths), taken before anything is removed */
  changes?: { modifiedBase: string[]; deletedBase: string[]; addedInRepo: string[] };
  /** agent-added files matching the task's test discovery pattern, removed before verification */
  removedBeforeVerify?: string[];
  agentRun?: { steps: number; budgetExhausted?: string; stopped?: string; error?: string; trace?: unknown };
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

export interface GraphSnapshotRef {
  path: string; // as given to the run (repo-relative where possible)
  analyzerVersion: string;
  commitSha: string;
  sha256: string; // of the snapshot file's bytes
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

/** The sandbox is still running? Checked after every failed command (decision 037). */
async function assertAlive(provider: SandboxProvider, handle: SandboxHandle, what: string): Promise<void> {
  const status = await provider.status?.(handle);
  if (status === "gone" || status === "stopped") throw new SandboxGoneError(`${what}: sandbox ${handle.id} is ${status}`);
}

export function makeSh(provider: SandboxProvider, getHandle: () => SandboxHandle, log: CommandRecord[], defaultTimeoutMs: number, signal?: AbortSignal): Sh {
  return async (phase, cmd, opts = {}) => {
    if (signal?.aborted) throw new RunCancelled("cancelled by signal");
    const r = await provider.exec(getHandle(), cmd, { timeoutMs: opts.timeoutMs ?? defaultTimeoutMs });
    log.push({ phase, actor: opts.actor ?? "harness", cmd, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) });
    if (signal?.aborted) throw new RunCancelled("cancelled by signal");
    // a failed command in a dead sandbox is not a result: not for the agent, not for verification
    if (r.exitCode !== 0 || r.timedOut) await assertAlive(provider, getHandle(), `${phase} command`);
    return r;
  };
}

/** "sandbox lifetime expired (N s)" when its deadline has passed, else "sandbox container disappeared". */
export function sandboxGoneReason(handle: SandboxHandle | undefined, at = Date.now()): string {
  return lifetimeExpired(handle, at) ? `sandbox lifetime expired (${Math.round(handle!.lifetimeMs! / 1000)} s)` : "sandbox container disappeared";
}
// the provider sets expiresAt just before `docker start`, so the real end is a little later
const lifetimeExpired = (handle: SandboxHandle | undefined, at: number) => handle?.expiresAt !== undefined && handle.lifetimeMs !== undefined && at >= handle.expiresAt - 2000;

async function mustPass(sh: Sh, phase: Phase, cmd: string, what: string, timeoutMs?: number): Promise<ExecResult> {
  const r = await sh(phase, cmd, { timeoutMs });
  if (r.timedOut) throw new RunFailed(`${what} timed out after ${timeoutMs ?? "the command timeout"}ms: ${cmd}`);
  if (r.exitCode !== 0) throw new RunFailed(`${what} failed (exit ${r.exitCode}): ${cmd}`);
  return r;
}

// Fixed identity for the squashed base commit: the same tree always gives the same SHA.
const BASE_COMMIT_ENV = [
  "GIT_AUTHOR_NAME=base",
  "GIT_AUTHOR_EMAIL=base@sandbox.invalid",
  "GIT_AUTHOR_DATE=2000-01-01T00:00:00Z",
  "GIT_COMMITTER_NAME=base",
  "GIT_COMMITTER_EMAIL=base@sandbox.invalid",
  "GIT_COMMITTER_DATE=2000-01-01T00:00:00Z",
].join(" ");
export const BASE_BRANCH = "work";

/**
 * Replace the checkout's history with one commit of the current tree (decision 026, history
 * squash). For a seeded task the bug-introducing commit is HEAD, so `git log -p` would hand the
 * agent the answer. No remotes, no source branches, no reflog, no hook samples; files that were
 * tracked but match .gitignore stay tracked. Prints the new commit's SHA.
 */
export const SQUASH_HISTORY = [
  "set -e",
  "git ls-files -z > /tmp/.th-tracked",
  "rm -rf .git",
  `git init -q --template= -b ${BASE_BRANCH}`,
  "git config core.logAllRefUpdates false",
  "xargs -0 -r git add -f -- < /tmp/.th-tracked",
  "rm -f /tmp/.th-tracked",
  "git add -A",
  `env ${BASE_COMMIT_ENV} git -c commit.gpgsign=false commit -q --allow-empty --no-verify -m base`,
  "rm -rf .git/logs",
  "git rev-parse HEAD",
].join("\n");

/** The task's check commands as the agent should run them from /work (regression + typecheck). */
export function taskTestCommands(spec: Pick<TaskSpec, "regression" | "typecheck">): string[] {
  const tsc = (spec.typecheck?.packages ?? []).map((pkg) => (pkg === "." ? spec.typecheck!.command : `cd ${JSON.stringify(pkg)} && ${spec.typecheck!.command}`));
  return [...spec.regression, ...tsc];
}

/**
 * Prints 3 lines: a hash over everything the agent can change (the diff vs `base`, untracked
 * non-ignored files, and /scratch's files with their content hashes); the byte length of the
 * repo part (0 = no repo changes); and how many base files are modified or deleted.
 */
export const repoStateCommand = (base: string) =>
  [
    `d=$(git diff --binary ${base} --; git ls-files -z -o --exclude-standard | xargs -0 -r sha256sum --)`,
    `s=$(find ${SCRATCH} -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum --)`,
    `printf '%s\\n%s' "$d" "$s" | sha256sum | cut -c1-64`,
    `printf '%s' "$d" | wc -c`,
    `git diff --no-renames --name-only --diff-filter=MDT ${base} -- | wc -l`,
  ].join("; ");

/** agent-v4: an empty, writable /scratch outside the repo (never in the diff, never verified). */
export const PREPARE_SCRATCH = `mkdir -p ${SCRATCH} && find ${SCRATCH} -mindepth 1 -delete`; // non-root: empty it, don't recreate it

/** `git diff --name-status -z` output → paths by kind. */
export function splitChanges(nameStatusZ: string): { modifiedBase: string[]; deletedBase: string[]; addedInRepo: string[] } {
  const parts = nameStatusZ.split("\0").filter(Boolean);
  const out = { modifiedBase: [] as string[], deletedBase: [] as string[], addedInRepo: [] as string[] };
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [status, file] = [parts[i]!, parts[i + 1]!];
    if (status.startsWith("A")) out.addedInRepo.push(file);
    else if (status.startsWith("D")) out.deletedBase.push(file);
    else out.modifiedBase.push(file); // M, T
  }
  return out;
}

/**
 * PREPARING_SANDBOX: create (network on), check out baseSha, run setup (network on), squash the
 * history into one base commit, then cut the network and prove it's off. Shared by repair runs
 * and the infrastructure test. Returns the handle and the squashed base commit (diffs use it).
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
  /** The sandbox removes itself after this long even if nobody destroys it. */
  maxLifetimeMs?: number;
}): Promise<{ handle: SandboxHandle; baseCommit: string }> {
  const t = (label: string, start: number) => args.timings && (args.timings[label] = Math.round(performance.now() - start));
  let handle: SandboxHandle | undefined;
  const sh = makeSh(args.provider, () => handle!, args.log, args.commandTimeoutMs, args.signal);
  let start = performance.now();
  handle = await args.provider.create({ image: args.image, source: args.source, ...(args.maxLifetimeMs && { maxLifetimeMs: args.maxLifetimeMs }) });
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
  const squashed = await mustPass(sh, "PREPARING_SANDBOX", SQUASH_HISTORY, "squashing the history into one base commit");
  const baseCommit = squashed.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) throw new RunFailed(`squashing the history printed no commit SHA: ${JSON.stringify(baseCommit.slice(0, 80))}`);
  t("history squash", start);
  await mustPass(sh, "PREPARING_SANDBOX", PREPARE_SCRATCH, "creating /scratch");
  start = performance.now();
  await args.provider.disableNetwork(handle);
  for (const probe of NETWORK_PROBES) {
    const r = await sh("NETWORK_OFF", probe, { timeoutMs: 20_000 });
    if (r.exitCode === 0) throw new RunFailed(`network is still reachable after disconnecting: ${probe}`);
  }
  t("network off + proof", start);
  return { handle, baseCommit };
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
  /** The snapshot the agent's graph tools read (graph-on runs); recorded, never used to verify. */
  snapshot?: GraphSnapshotRef;
  /** Override the sandbox's self-removal deadline (default: derived from the task's limits). */
  sandboxLifetimeMs?: number;
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
    snapshot: opts.snapshot ?? "none",
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
  /** A provider file operation; a failure in a dead sandbox becomes SandboxGoneError. */
  const guarded = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof SandboxGoneError) && handle) await assertAlive(provider, handle, what);
      throw error;
    }
  };
  const runRepro = async (phase: Phase) => {
    await guarded("copying the repro test", () => provider.writeFile(handle!, spec.repro.dest, task.reproContent));
    const r = await sh(phase, spec.repro.command);
    // remove the file AND any directories created for it: an empty repro/ dir would show up in
    // the agent's list_dir (git status can't see empty directories)
    const dir = spec.repro.dest.includes("/") ? spec.repro.dest.slice(0, spec.repro.dest.lastIndexOf("/")) : "";
    await mustPass(sh, phase, `rm -f ${JSON.stringify(spec.repro.dest)}${dir ? ` && (rmdir -p ${JSON.stringify(dir)} 2>/dev/null || true)` : ""}`, "removing the repro test");
    return { exitCode: r.exitCode, timedOut: r.timedOut };
  };

  try {
    // ── PREPARING_SANDBOX: network on for clone + setup, then off and proven off ─────────────
    enter("PREPARING_SANDBOX");
    const source: SandboxSource = "gitUrl" in spec.source ? { gitUrl: spec.source.gitUrl, sha: spec.baseSha } : { localPath: task.localPath! };
    record.sandbox.createStartedAt = now();
    record.sandboxEnv = await provider.describe?.(image).catch(() => undefined);
    // the run's own budget plus every verification command at its timeout, and margin
    const verifyCommands = spec.regression.length + (spec.typecheck?.packages.length ?? 0) + spec.setup.length + 6;
    const prepared = await prepareSandbox({
      maxLifetimeMs: opts.sandboxLifetimeMs ?? spec.limits.wallClockMs + verifyCommands * spec.limits.commandTimeoutMs + 10 * 60_000,
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
    record.baseCommit = prepared.baseCommit;
    // everything on disk before REPRODUCING, ignored files (node_modules, caches) included: the
    // repro run must leave nothing behind for the agent to find
    const treeState = async (phase: Phase) => (await mustPass(sh, phase, "git status --porcelain --ignored", "listing the tree")).stdout;
    const beforeRepro = await treeState("REPRODUCING");
    const baseFiles = (await mustPass(sh, "REPRODUCING", "git ls-tree -r -z --name-only HEAD", "listing the base files")).stdout.split("\0").filter(Boolean);

    // ── REPRODUCING (+ baseline), network off ─────────────────────────────────────────────
    enter("REPRODUCING");
    record.repro.atBase = await runRepro("REPRODUCING");
    if (record.repro.atBase.timedOut) throw new RunFailed(`repro command timed out: ${spec.repro.command}`);
    if (record.repro.atBase.exitCode === 0) throw new RunFailed("repro does not reproduce: the repro test passes at baseSha");
    await mustPass(sh, "REPRODUCING", `test -z "$(git status --porcelain)"`, "checking the tree is clean before the agent starts");
    if ((await treeState("REPRODUCING")) !== beforeRepro) throw new RunFailed("the repro run left files behind (git status --porcelain --ignored changed)");
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
      testCommands: taskTestCommands(spec),
      baseFiles,
      repoState: async () => {
        budget();
        const r = await mustPass(sh, "PATCHING", repoStateCommand(prepared.baseCommit), "computing the repo state");
        const [hash = "", size = "", base = ""] = r.stdout.trim().split("\n").map((x) => x.trim());
        if (!/^[0-9a-f]{64}$/.test(hash) || !/^\d+$/.test(size) || !/^\d+$/.test(base)) throw new RunFailed(`repo state probe printed ${JSON.stringify(r.stdout.slice(0, 120))}`);
        return { hash, empty: size === "0", baseChanged: base !== "0" };
      },
      exec: async (cmd, o) => {
        step();
        let r: ExecResult;
        try {
          r = await sh("PATCHING", cmd, { actor: "agent", timeoutMs: Math.max(1000, Math.min(o?.timeoutMs ?? spec.limits.commandTimeoutMs, deadline - Date.now())) });
        } catch (error) {
          if (error instanceof SandboxGoneError) steps--; // the harness's failure, not an agent step
          throw error;
        }
        if (r.timedOut && Date.now() >= deadline - 500) throw new BudgetExhausted(`wall-clock ${spec.limits.wallClockMs}ms`);
        return r;
      },
      writeFile: async (p, content) => {
        step();
        try {
          return await guarded(`writeFile ${p}`, () => provider.writeFile(handle!, p, content));
        } catch (error) {
          if (error instanceof SandboxGoneError) steps--;
          throw error;
        }
      },
      readFile: async (p) => {
        step();
        try {
          return await guarded(`readFile ${p}`, () => provider.readFile(handle!, p));
        } catch (error) {
          if (error instanceof SandboxGoneError) steps--;
          throw error;
        }
      },
      step: () => step(),
      stepsUsed: () => steps,
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
      if (error instanceof RunCancelled || error instanceof RunFailed || error instanceof SandboxGoneError) throw error; // an infrastructure fault, not the agent's
      if (error instanceof BudgetExhausted) record.agentRun.budgetExhausted = error.message;
      else if (error instanceof AgentStopped) record.agentRun.stopped = error.message;
      else record.agentRun.error = (error as Error).message;
    } finally {
      record.agentRun.steps = Math.min(steps, spec.limits.steps);
      if (agent.trace !== undefined) record.agentRun.trace = agent.trace;
    }

    // ── VERIFYING: the harness's own checks only (not bounded by the agent's wall-clock) ────
    enter("VERIFYING");
    const diff = await sh("VERIFYING", `git add -A && git diff --cached ${prepared.baseCommit}`);
    if (diff.exitCode !== 0) throw new RunFailed(`could not extract the diff (exit ${diff.exitCode})`);
    record.diff = diff.stdout;
    const status = await mustPass(sh, "VERIFYING", `git diff --cached --no-renames --name-status -z ${prepared.baseCommit}`, "listing the changed files");
    record.changes = splitChanges(status.stdout);
    // agent-added tests must not affect the verdict: remove those the test runner would discover
    const testFile = new RegExp(spec.testFilePattern ?? BUN_TEST_FILE_PATTERN);
    record.removedBeforeVerify = record.changes.addedInRepo.filter((f) => testFile.test(f));
    if (record.removedBeforeVerify.length)
      await mustPass(sh, "VERIFYING", `git rm -q -f -- ${record.removedBeforeVerify.map((f) => `'${f.replace(/'/g, `'\\''`)}'`).join(" ")}`, "removing agent-added test files");
    record.repro.afterPatch = await runRepro("VERIFYING");
    record.final = await collectChecks(sh, "VERIFYING", spec);
    record.comparison = compareChecks(record.baseline, record.final);

    const reproPasses = record.repro.afterPatch.exitCode === 0 && !record.repro.afterPatch.timedOut;
    if (record.agentRun.budgetExhausted) finish("UNRESOLVED", `budget exhausted: ${record.agentRun.budgetExhausted}`);
    else if (record.agentRun.stopped) finish("UNRESOLVED", record.agentRun.stopped);
    else if (reproPasses && record.comparison.newFailures.length === 0) finish("RESOLVED", "repro passes and nothing fails that passed at baseline");
    else
      finish(
        "UNRESOLVED",
        [!reproPasses && `repro still fails (exit ${record.repro.afterPatch.exitCode}${record.repro.afterPatch.timedOut ? ", timed out" : ""})`, ...record.comparison.newFailures].filter(Boolean).join("; "),
      );
  } catch (error) {
    if (error instanceof RunCancelled) finish("CANCELLED", error.message);
    else if (error instanceof SandboxGoneError) finish("FAILED", sandboxGoneReason(handle));
    else if (error instanceof RunFailed) finish("FAILED", error.message);
    else finish("FAILED", `harness error: ${(error as Error).message}`);
  } finally {
    if (handle) {
      const endedAt = Date.now();
      await provider.destroy(handle).catch((e: Error) => (record.reason += `; destroy failed: ${e.message}`));
      const removedByHarness = provider.removedByHarness?.(handle) ?? true;
      record.sandbox.removedBy = removedByHarness ? "harness" : lifetimeExpired(handle, endedAt) ? "lifetime" : "unknown";
      const status = await provider.status?.(handle);
      record.sandbox.destroyed = status === undefined || status === "gone";
      if (handle.lifetimeMs !== undefined) record.sandbox.lifetimeMs = handle.lifetimeMs;
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
