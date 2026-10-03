// Repair run: PREPARING_SANDBOX → REPRODUCING → PATCHING → VERIFYING → RESOLVED | UNRESOLVED | FAILED | CANCELLED
// (decision 026). The harness decides the outcome from what it runs itself; it never reads or
// trusts anything the agent says, including how many tokens it used.
import { createHash, randomUUID } from "node:crypto";
import { BudgetExceededError } from "../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import { AgentStopped, type Agent, type AgentContext, type ArmReport } from "./agents.ts";
import type { LoopTurn } from "./loop.ts";
import { faultFileRead, type FaultFileRead } from "./run-metrics.ts";
import { SCRATCH } from "./tools.ts";
import { SandboxGoneError, type ExecResult, type SandboxDescription, type SandboxHandle, type SandboxProvider, type SandboxSource } from "./provider.ts";
import { parseJunit, testKey, type TestResult } from "./junit.ts";
import { checkPlan, REPORT_PLACEHOLDER, TSC_PLACEHOLDER, type CheckPlan } from "./profile.ts";
import { BUN_TEST_FILE_PATTERN, type LoadedTask } from "./task.ts";

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

/** One tsc error, without its position: what the baseline comparison matches on (decision 041). */
export interface TscError {
  file: string; // as tsc printed it, relative to the package; "" for an error without a location
  code: string; // "TS2322"
  message: string; // the first line
}

/** Which tsc a typecheck ran: the repo's own (node_modules) or the image's global one. */
export interface TscChoice {
  source: "repo" | "image";
  version: string;
}

export interface RegressionResult {
  cmd: string;
  exitCode: number;
  timedOut: boolean;
  /** Per-test results from the command's report (decision 043); absent when it had none. */
  tests?: TestResult[];
  /** Why a configured report gave no per-test results ("no report written", a parse error). */
  reportError?: string;
}

/** A test that passed at baseline and, after the patch, failed, was skipped or is no longer reported. */
export interface RegressedTest {
  cmd: string;
  file: string;
  name: string;
  now: "failed" | "skipped" | "missing";
}

export interface Comparison {
  newFailures: string[];
  preExistingFailures: string[];
  /** "test": every regression command was compared per test; "command": by exit code only; "mixed": some of each. */
  granularity: "test" | "command" | "mixed";
  regressedTests: RegressedTest[];
}

export interface CheckResults {
  regression: RegressionResult[];
  typecheck: { package: string; command: string; exitCode: number; errors: number; diagnostics: TscError[]; tsc?: TscChoice }[];
}

export interface RunRecord {
  runId: string;
  taskId: string;
  provider: string;
  agent: string;
  image: string;
  /** "smoke" runs check the harness, "dev" runs tune the agent; neither is an evaluation result (decisions 041, 044). */
  taskKind?: "smoke" | "dev" | "evaluation";
  /** The repo profile the checks came from, and the commands as run from /work. */
  profile?: { id: string; workdir: string };
  plan?: CheckPlan;
  /** A seeded bug applied before the base commit was made (sha256 of the patch file). */
  seed?: { patchSha256: string };
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
  comparison?: Comparison;
  diff?: string;
  /** agent-v4: the diff by kind (repo-relative paths), taken before anything is removed */
  changes?: { modifiedBase: string[]; deletedBase: string[]; addedInRepo: string[] };
  /** agent-added files matching the task's test discovery pattern, removed before verification */
  removedBeforeVerify?: string[];
  agentRun?: { steps: number; budgetExhausted?: string; stopped?: string; error?: string; trace?: unknown };
  /** Decision 045: the arm (graph-on / graph-off), whether the packet was injected, its size, graph tool calls. */
  arm?: ArmReport;
  /**
   * Decision 047: for a seeded task and a model agent, the step of the first successful read of a
   * file the seed patch changed, and the tokens used up to it. Computed on the host from the trace
   * after the agent stops; observational, never part of the verdict.
   */
  faultFileRead?: FaultFileRead;
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
const TS_ERROR = /^(?:(.+?)\(\d+,\d+\): )?error (TS\d+): (.*)$/;
/** The repo's own TypeScript, run with the image's bun (its .bin/tsc shim needs node, which the image lacks). */
export const REPO_TSC = "node_modules/typescript/bin/tsc";

/** tsc's non-pretty output → one entry per error line; continuation lines (indented) are skipped. */
export function parseTscErrors(output: string): TscError[] {
  const out: TscError[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = TS_ERROR.exec(line);
    if (m) out.push({ file: m[1] ?? "", code: m[2]!, message: m[3]!.trim() });
  }
  return out;
}

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
const SEED_PATCH_FILE = "/tmp/.th-seed.patch";

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
export function taskTestCommands(plan: Pick<CheckPlan, "regression" | "typecheck">): string[] {
  return [...plan.regression, ...plan.typecheck.map((t) => (t.package === "." ? t.command : `cd ${JSON.stringify(t.package)} && ${t.command}`))];
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
  /** A seed patch, applied right after checkout so it becomes part of the base commit. */
  seedPatch?: string;
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
  if (args.seedPatch !== undefined) {
    start = performance.now();
    await args.provider.writeFile(handle, SEED_PATCH_FILE, args.seedPatch); // outside /work
    await mustPass(sh, "PREPARING_SANDBOX", `git apply --whitespace=nowarn ${SEED_PATCH_FILE} && rm -f ${SEED_PATCH_FILE}`, "applying the seed patch");
    const changed = await mustPass(sh, "PREPARING_SANDBOX", "git status --porcelain", "listing what the seed patch changed");
    if (!changed.stdout.trim()) throw new RunFailed("the seed patch changed nothing");
    t("seed patch", start);
  }
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

export type ResolvedPlan = CheckPlan & { tsc: Record<string, TscChoice> };

/**
 * Replace `$TSC` in each typecheck command: the repo's own tsc when that package has one in
 * node_modules, else the image's global `tsc`. Decided once, at the base commit; the same
 * command runs after the patch. Which one ran, and its version, go into the record.
 */
export async function resolvePlan(sh: Sh, phase: Phase, plan: CheckPlan): Promise<ResolvedPlan> {
  const tsc: Record<string, TscChoice> = {};
  const typecheck = [];
  for (const t of plan.typecheck) {
    if (!t.command.includes(TSC_PLACEHOLDER)) {
      typecheck.push(t);
      continue;
    }
    const probe = `cd ${JSON.stringify(t.package)} && if [ -f ${REPO_TSC} ]; then echo repo; bun ${REPO_TSC} --version; else echo image; tsc --version; fi`;
    const r = await mustPass(sh, phase, probe, `choosing a tsc for ${t.package}`);
    const [source, version = ""] = r.stdout.trim().split("\n").map((x) => x.trim());
    if (source !== "repo" && source !== "image") throw new RunFailed(`choosing a tsc for ${t.package} printed ${JSON.stringify(r.stdout.slice(0, 120))}`);
    tsc[t.package] = { source, version: version.replace(/^Version /, "") };
    typecheck.push({ package: t.package, command: t.command.replaceAll(TSC_PLACEHOLDER, source === "repo" ? `bun ${REPO_TSC}` : "tsc") });
  }
  return { ...plan, typecheck, tsc };
}

/** A fresh report file per run of a command, outside /work; the agent can't know its name in advance. */
const reportFile = () => `/tmp/.th-report-${randomUUID()}.xml`;

/**
 * Regression exit codes (with per-test results where the plan has a report command) and the `tsc`
 * errors per package (baseline and final). A command with a report runs as its report command; its
 * exit code counts exactly like the plain command's. `readFile` returns a sandbox file's content or
 * throws; without it no report is read.
 */
export async function collectChecks(
  sh: Sh,
  phase: Phase,
  plan: Pick<CheckPlan, "regression" | "typecheck" | "reports"> & { tsc?: Record<string, TscChoice> },
  readFile?: (file: string) => Promise<string>,
): Promise<CheckResults> {
  const regression: RegressionResult[] = [];
  for (const cmd of plan.regression) {
    const report = readFile && plan.reports?.[cmd];
    if (!report) {
      const r = await sh(phase, cmd);
      regression.push({ cmd, exitCode: r.exitCode, timedOut: r.timedOut });
      continue;
    }
    const file = reportFile();
    const r = await sh(phase, `rm -f ${file} && ${report.command.replaceAll(REPORT_PLACEHOLDER, file)}`);
    const result: RegressionResult = { cmd, exitCode: r.exitCode, timedOut: r.timedOut };
    let xml: string | undefined;
    try {
      xml = await readFile(file);
    } catch (error) {
      if (error instanceof SandboxGoneError) throw error;
      result.reportError = "no report written";
    }
    if (xml !== undefined) {
      try {
        result.tests = parseJunit(xml);
      } catch (error) {
        result.reportError = `report not readable: ${(error as Error).message}`;
      }
    }
    await mustPass(sh, phase, `rm -f ${file}`, "removing the test report");
    regression.push(result);
  }
  const typecheck = [];
  for (const t of plan.typecheck) {
    const r = await sh(phase, `cd ${JSON.stringify(t.package)} && ${t.command}`);
    const diagnostics = parseTscErrors(`${r.stdout}\n${r.stderr}`);
    const tsc = plan.tsc?.[t.package];
    typecheck.push({ package: t.package, command: t.command, exitCode: r.exitCode, errors: diagnostics.length, diagnostics, ...(tsc && { tsc }) });
  }
  return { regression, typecheck };
}

const tscKey = (d: TscError) => `${d.file}\0${d.code}\0${d.message}`;
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * TS errors after the patch that the baseline doesn't have, matched by file + TS code + message
 * and counted (two identical baseline errors cover two, not three). Line and column are ignored,
 * so an error that only moved is still the baseline's.
 */
export function newTscErrors(baseline: TscError[], final: TscError[]): TscError[] {
  const left = new Map<string, number>();
  for (const d of baseline) left.set(tscKey(d), (left.get(tscKey(d)) ?? 0) + 1);
  return final.filter((d) => {
    const n = left.get(tscKey(d)) ?? 0;
    if (n > 0) left.set(tscKey(d), n - 1);
    return n === 0;
  });
}

const LISTED = 10; // regressed tests named in a reason; the record has all of them

/**
 * Per test (decision 043), when the baseline run of a command reported its tests: every test that
 * passed at baseline must pass after the patch. Failed, skipped or no longer reported (deleted,
 * renamed, its file no longer loads, no report at all) → regressed. Tests that failed at baseline,
 * and tests the baseline didn't have, don't count either way. On top of that, a command that passed
 * at baseline must still pass (an unhandled error between tests fails the run without failing a test).
 */
export function compareRegression(b: RegressionResult, f: RegressionResult): { newFailure?: string; preExisting?: string; regressed: RegressedTest[] } {
  const failed = f.exitCode !== 0 || f.timedOut;
  const how = `exit ${f.exitCode}${f.timedOut ? ", timed out" : ""}`;
  const commandBroke = failed && b.exitCode === 0 && !b.timedOut;
  if (!b.tests?.length) {
    if (commandBroke) return { newFailure: `regression "${f.cmd}" now fails (${how}; passed at baseline)`, regressed: [] };
    return { ...(failed && { preExisting: `regression "${f.cmd}" also failed at baseline (exit ${b.exitCode})` }), regressed: [] };
  }
  const now = new Map((f.tests ?? []).map((t) => [testKey(t), t.status]));
  const regressed: RegressedTest[] = [];
  for (const t of b.tests) {
    if (t.status !== "passed") continue;
    const s = now.get(testKey(t));
    if (s !== "passed") regressed.push({ cmd: f.cmd, file: t.file, name: t.name, now: s ?? "missing" });
  }
  const baseFailing = b.tests.filter((t) => t.status === "failed");
  const preExisting = baseFailing.length ? `regression "${f.cmd}": ${baseFailing.length} test(s) failed at baseline, ${baseFailing.filter((t) => now.get(testKey(t)) === "failed").length} of them still fail` : undefined;
  if (regressed.length) {
    const named = regressed.slice(0, LISTED).map((t) => `${t.file} > ${t.name} (${t.now})`);
    const more = regressed.length > LISTED ? `; and ${regressed.length - LISTED} more` : "";
    const noReport = f.reportError ? ` [${f.reportError}]` : "";
    return { newFailure: `regression "${f.cmd}": ${regressed.length} test(s) that passed at baseline now fail or are missing${noReport}: ${named.join("; ")}${more}`, ...(preExisting && { preExisting }), regressed };
  }
  if (commandBroke) return { newFailure: `regression "${f.cmd}" now fails (${how}; passed at baseline) though every baseline test still passes`, ...(preExisting && { preExisting }), regressed };
  return { ...(preExisting && { preExisting }), regressed };
}

/** A new failure = a regression that broke (per test or per command), or a TS error the baseline doesn't have. */
export function compareChecks(baseline: CheckResults, final: CheckResults): Comparison {
  const newFailures: string[] = [];
  const preExistingFailures: string[] = [];
  const regressedTests: RegressedTest[] = [];
  final.regression.forEach((f, i) => {
    const c = compareRegression(baseline.regression[i]!, f);
    if (c.newFailure) newFailures.push(c.newFailure);
    if (c.preExisting) preExistingFailures.push(c.preExisting);
    regressedTests.push(...c.regressed);
  });
  const perTest = baseline.regression.filter((b) => b.tests?.length).length;
  const granularity = perTest > 0 && perTest === baseline.regression.length ? "test" : perTest === 0 ? "command" : "mixed";
  final.typecheck.forEach((f, i) => {
    const b = baseline.typecheck[i]!;
    const added = newTscErrors(b.diagnostics, f.diagnostics);
    if (added.length)
      newFailures.push(`typecheck ${f.package}: ${added.length} error(s) not in the baseline: ${added.map((d) => `${d.file ? `${d.file} ` : ""}${d.code}: ${short(d.message)}`).join("; ")}`);
    else if (f.exitCode !== 0 && f.errors === 0 && b.exitCode === 0) newFailures.push(`typecheck ${f.package} failed (exit ${f.exitCode}) without TS errors; passed at baseline`);
    // tsc stopped reporting at all (e.g. it can no longer start): not "the baseline's errors are gone"
    else if (f.exitCode !== 0 && f.errors === 0 && b.errors > 0) newFailures.push(`typecheck ${f.package} failed (exit ${f.exitCode}) without TS errors; the baseline reported ${b.errors}`);
    else if (b.errors > 0) preExistingFailures.push(`typecheck ${f.package}: ${b.errors} error(s) at baseline, ${f.errors} now`);
  });
  return { newFailures, preExistingFailures, granularity, regressedTests };
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
    ...(spec.kind && { taskKind: spec.kind }),
    ...(task.profile && { profile: { id: task.profile.id, workdir: task.profile.workdir } }),
    ...(task.seedPatch !== undefined && { seed: { patchSha256: createHash("sha256").update(task.seedPatch).digest("hex") } }),
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
  // the profile's commands and the task's own, as run from /work; `$TSC` is resolved at BASELINE
  const rawPlan = checkPlan(spec, task.profile);
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
    const verifyCommands = rawPlan.regression.length + rawPlan.typecheck.length + rawPlan.setup.length + 6;
    const prepared = await prepareSandbox({
      maxLifetimeMs: opts.sandboxLifetimeMs ?? spec.limits.wallClockMs + verifyCommands * spec.limits.commandTimeoutMs + 10 * 60_000,
      provider,
      image,
      source,
      baseSha: spec.baseSha,
      setup: rawPlan.setup,
      ...(task.seedPatch !== undefined && { seedPatch: task.seedPatch }),
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
    const plan = await resolvePlan(sh, "BASELINE", rawPlan);
    record.plan = { setup: plan.setup, regression: plan.regression, typecheck: plan.typecheck, ...(plan.reports && { reports: plan.reports }) };
    const readReport = (file: string) => guarded(`reading ${file}`, () => provider.readFile(handle!, file));
    record.baseline = await collectChecks(sh, "BASELINE", plan, readReport);
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
      testCommands: taskTestCommands(plan),
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
      if (agent.armReport) record.arm = agent.armReport();
      const turns = (agent.trace as { turns?: unknown } | undefined)?.turns;
      if (task.seedPatch !== undefined && Array.isArray(turns)) record.faultFileRead = faultFileRead({ turns: turns as LoopTurn[] }, task.seedPatch);
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
    record.final = await collectChecks(sh, "VERIFYING", plan, readReport);
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
