// Reproduce stage (decision 048): given a claim that a repo misbehaves, an agent writes ONE new test;
// a deterministic check, independent of the agent, decides whether that test reproduces the claim at
// the base commit. The agent runs in one sandbox; the check runs in a fresh one with only the new file
// added. Nothing the agent says is trusted.
//
//   node packages/analyzer/src/harness/reproduce.ts run --claim <claim.json> [--model <id>] [--cost-limit-usd <usd>] [--runs-dir runs]
//   node packages/analyzer/src/harness/reproduce.ts batch --claims <dir> [--model <id>] [--cost-limit-usd <usd>] [--max-ledger-usd <usd>] [--out <dir>]
//   node packages/analyzer/src/harness/reproduce.ts oracle-check --record <run.json> --patch <fix.patch> [--out <file>]
//   node packages/analyzer/src/harness/reproduce.ts to-task --record <run.json> [--out <dir>] [--kind dev]
//
// States: REPRODUCED · NOT_REPRODUCED (no qualifying file, or the test passes) · REJECTED (names the
// failed check: a, b, c or d) · FAILED (infrastructure, including model request errors).
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { cleanGitEnv } from "../git-env.ts";
import { BudgetExceededError } from "../llm/budget.ts";
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import { SpendLedger } from "../llm/ledger.ts";
import { AgentStopped, type Agent, type AgentContext } from "./agents.ts";
import { DockerUnavailableError, LocalDockerProvider, SANDBOX_IMAGE } from "./docker.ts";
import { parseJunit, testKey, type TestResult } from "./junit.ts";
import { RepairLoopAgent, type LoopTrace } from "./loop.ts";
import { checkPlan, inDir, loadProfile, REPORT_PLACEHOLDER, type RepoProfile } from "./profile.ts";
import { SandboxGoneError, type SandboxDescription, type SandboxHandle, type SandboxProvider, type SandboxSource } from "./provider.ts";
import {
  BudgetExhausted,
  collectChecks,
  compareRegression,
  makeSh,
  newTscErrors,
  prepareSandbox,
  repoStateCommand,
  resolvePlan,
  RunCancelled,
  RunFailed,
  sandboxGoneReason,
  splitChanges,
  taskTestCommands,
  type CheckResults,
  type CommandRecord,
  type RegressionResult,
  type ResolvedPlan,
  type Sh,
  type TscError,
} from "./run.ts";
import { runMetrics } from "./run-metrics.ts";
import { BUN_TEST_FILE_PATTERN, TaskSpec } from "./task.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const LEDGER = path.join(WORKSPACE_ROOT, ".tracehound", "spend.jsonl");
export const REPRO_PROMPT_FILE = path.resolve(import.meta.dirname, "../../../../harness/prompts/repro-v1.md");
export const REPRO_STAGE_VERSION = "repro-v1";

// ── Claim ────────────────────────────────────────────────────────────────────────────────────
const Sha = z.string().regex(/^[0-9a-f]{40}$/, "full 40-char commit SHA");
const ClaimExcerpt = z
  .object({ file: z.string().min(1), startLine: z.number().int().positive(), endLine: z.number().int().positive(), lines: z.array(z.string()).min(1) })
  .strict()
  .refine((e) => e.lines.length === e.endLine - e.startLine + 1, { message: "lines must cover startLine..endLine exactly" });
export type ClaimExcerpt = z.infer<typeof ClaimExcerpt>;
export const ClaimSpec = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    /** Repo profile, relative to the claim file. It must have a test command with a JUnit report. */
    profile: z.string().min(1),
    /** Where the repo comes from and the commit the claim is about (a profile names neither). */
    source: z.union([z.object({ gitUrl: z.string().min(1) }).strict(), z.object({ localPath: z.string().min(1) }).strict()]),
    baseSha: Sha,
    title: z.string().min(1),
    /** Observed and expected behaviour, as a user would report it. */
    claim: z.string().min(1),
    /** Optional pointers ("file:line"), shown to the agent. */
    evidence: z.array(z.string().min(1)).optional(),
    /** Optional code excerpts (decision 052), shown to the agent after the evidence; absent → the issue text is unchanged. */
    excerpts: z.array(ClaimExcerpt).min(1).optional(),
    /** For testing the stage only: a patch applied before the base commit is made, as a task's seed. */
    seed: z.object({ patch: z.string() }).strict().optional(),
    /** Regex over repo-relative paths; default bun's discovery. The file must also be inside the profile's workdir. */
    testFilePattern: z.string().optional(),
  })
  .strict();
export type ClaimSpec = z.infer<typeof ClaimSpec>;

export interface LoadedClaim {
  spec: ClaimSpec;
  file: string;
  dir: string;
  profile: RepoProfile;
  profilePath: string;
  localPath?: string;
  seedPatch?: string;
  seedPatchPath?: string;
}

export function loadClaim(file: string): LoadedClaim {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`claim file ${abs} does not exist`);
  const dir = path.dirname(abs);
  const spec = ClaimSpec.parse(JSON.parse(readFileSync(abs, "utf8")));
  const profilePath = path.resolve(dir, spec.profile);
  const profile = loadProfile(profilePath);
  if (!profile.test || !profile.testReport) throw new Error(`profile ${profilePath} needs "test" and a JUnit "testReport": the check reads per-test results`);
  let seedPatch: string | undefined;
  let seedPatchPath: string | undefined;
  if (spec.seed) {
    seedPatchPath = path.resolve(dir, spec.seed.patch);
    if (!existsSync(seedPatchPath)) throw new Error(`seed patch ${seedPatchPath} does not exist`);
    seedPatch = readFileSync(seedPatchPath, "utf8");
  }
  const localPath = "localPath" in spec.source ? path.resolve(dir, spec.source.localPath) : undefined;
  return { spec, file: abs, dir, profile, profilePath, ...(localPath && { localPath }), ...(seedPatch !== undefined && { seedPatch, seedPatchPath }) };
}

/** What the agent is given as its "issue": the claim's title, text and evidence, then any excerpts. */
export const claimText = (c: ClaimSpec) =>
  [c.title, "", c.claim, ...(c.evidence?.length ? ["", `Evidence: ${c.evidence.join(", ")}`] : []), ...(c.excerpts ? excerptLines(c.excerpts) : [])].join("\n");

const excerptLines = (excerpts: ClaimExcerpt[]) => ["", "Code excerpts:", ...excerpts.flatMap((e) => ["", `${e.file}:${e.startLine}-${e.endLine}`, "```ts", ...e.lines, "```"])];

/** The dev tasks' limits (decision 044); cost per run as in docs/freeze.md (Nano $0.10, Super $0.60 via --cost-limit-usd). */
export const REPRO_LIMITS: TaskSpec["limits"] = { steps: 40, wallClockMs: 900_000, tokens: 300_000, commandTimeoutMs: 300_000, costUSD: 0.1 };

// ── The report, per test case, with the failure type ────────────────────────────────────────
export interface CaseResult extends TestResult {
  /** the <failure>/<error> element's type attribute ("AssertionError", "TypeError", "TimeoutError", …) */
  failureType?: string;
  message?: string;
}

const CASE = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const FAILURE = /<(failure|error)\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/;
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e]!,
  );
const attr = (s: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(s);
  return m ? decode(m[1] ?? m[2] ?? "") : undefined;
};

/** parseJunit's tests (file, full name, status; same order) plus each failure's type and message. */
export function parseJunitCases(xml: string): CaseResult[] {
  const tests = parseJunit(xml);
  const details: { failureType?: string; message?: string }[] = [];
  for (const m of xml.matchAll(CASE)) {
    if (m[2]) {
      details.push({});
      continue;
    }
    const start = m.index! + m[0].length;
    const end = xml.indexOf("</testcase>", start);
    const f = FAILURE.exec(xml.slice(start, end === -1 ? undefined : end));
    if (!f) {
      details.push({});
      continue;
    }
    const message = attr(f[2]!, "message");
    details.push({ failureType: attr(f[2]!, "type") ?? f[1]!, ...(message !== undefined && { message: message.slice(0, 500) }) });
  }
  if (details.length !== tests.length) throw new Error(`report has ${tests.length} test cases but ${details.length} <testcase> elements`);
  return tests.map((t, i) => ({ ...t, ...details[i] }));
}

/** Only a failed assertion counts as the claim failing; anything else is the test's own fault. */
export const ASSERTION_FAILURE = "AssertionError";

// ── Check a: the diff ───────────────────────────────────────────────────────────────────────
export interface CheckResult {
  ok: boolean;
  detail: string;
}

export type DiffVerdict = { kind: "none" } | { kind: "rejected"; detail: string } | { kind: "file"; file: string };

/** Exactly one added file, matching the test-file pattern and inside the profile's workdir; nothing else changed. */
export function checkDiff(changes: { modifiedBase: string[]; deletedBase: string[]; addedInRepo: string[] }, opts: { pattern: string; workdir: string }): DiffVerdict {
  const { modifiedBase, deletedBase, addedInRepo } = changes;
  if (!modifiedBase.length && !deletedBase.length && !addedInRepo.length) return { kind: "none" };
  const problems: string[] = [];
  if (modifiedBase.length) problems.push(`modified existing file(s): ${modifiedBase.join(", ")}`);
  if (deletedBase.length) problems.push(`deleted existing file(s): ${deletedBase.join(", ")}`);
  if (addedInRepo.length !== 1) problems.push(`added ${addedInRepo.length} files, not exactly one${addedInRepo.length ? `: ${addedInRepo.join(", ")}` : ""}`);
  if (problems.length) return { kind: "rejected", detail: problems.join("; ") };
  const file = addedInRepo[0]!;
  if (!new RegExp(opts.pattern).test(file)) return { kind: "rejected", detail: `${file} does not match the test-file pattern ${opts.pattern}` };
  if (opts.workdir !== "." && !file.startsWith(`${opts.workdir}/`)) return { kind: "rejected", detail: `${file} is outside the test directory ${opts.workdir}/` };
  return { kind: "file", file };
}

// ── Check b and c: running the file ──────────────────────────────────────────────────────────
export interface FileRun {
  cmd: string;
  exitCode: number;
  timedOut: boolean;
  /** absent when the runner wrote no report (the file did not load, or it has no tests) */
  cases?: CaseResult[];
  reportError?: string;
}

/** The test runner's path for the file, relative to the workdir (as the report prints it). */
export const runnerPath = (file: string, workdir: string) => (workdir === "." ? file : path.posix.relative(workdir, file));

export type FileVerdict =
  | { kind: "rejected"; detail: string }
  | { kind: "passes"; detail: string }
  | { kind: "fails"; failing: string[]; detail: string };

/**
 * Check b on one run of the file alone: it loaded, collected at least one test, didn't time out, and
 * every failing case failed on an assertion. No failing case → the test passes.
 */
export function judgeFileRun(run: FileRun): FileVerdict {
  if (run.timedOut) return { kind: "rejected", detail: `the file timed out: ${run.cmd}` };
  if (!run.cases) return { kind: "rejected", detail: run.exitCode === 0 ? `zero tests collected (no report written; exit 0)` : `the file did not load: no report written (exit ${run.exitCode}; an import, syntax or top-level error)` };
  if (!run.cases.length) return { kind: "rejected", detail: "zero tests collected" };
  const other = run.cases.filter((c) => c.status === "failed" && c.failureType !== ASSERTION_FAILURE);
  if (other.length) return { kind: "rejected", detail: `failed on something other than an assertion: ${other.map((c) => `${c.name} (${c.failureType ?? "unknown"}${c.message ? `: ${c.message.split("\n")[0]!.slice(0, 120)}` : ""})`).join("; ")}` };
  const executed = run.cases.filter((c) => c.status !== "skipped");
  if (!executed.length) return { kind: "rejected", detail: "every test case was skipped" };
  const failing = executed.filter((c) => c.status === "failed").map((c) => c.name);
  if (!failing.length) return { kind: "passes", detail: `${executed.length} test case(s) ran and passed` };
  if (run.exitCode === 0) return { kind: "rejected", detail: `the report shows ${failing.length} failing case(s) but the runner exited 0` };
  return { kind: "fails", failing, detail: `${failing.length} of ${executed.length} case(s) failed on an assertion: ${failing.join("; ")}` };
}

/** Check c: the second run fails on an assertion in exactly the same cases. */
export function judgeSecondRun(first: string[], second: FileVerdict): CheckResult {
  if (second.kind !== "fails") return { ok: false, detail: `second run: ${second.kind === "passes" ? "the test passed" : second.detail}` };
  const same = first.length === second.failing.length && first.every((n) => second.failing.includes(n));
  return same ? { ok: true, detail: `the same ${first.length} case(s) failed on an assertion again` } : { ok: false, detail: `second run failed in different cases: first [${first.join("; ")}], second [${second.failing.join("; ")}]` };
}

/**
 * Check d: decision 043's per-test rule, unchanged: every test that passed at baseline still passes
 * with the file added. Its other half (a suite that exited 0 must still exit 0) cannot hold when the
 * new file fails on purpose (build log, step 0, item 2): a non-zero exit is accepted only when every
 * failing test is in the new file or already failed at baseline.
 */
export function judgeRegression(baseline: RegressionResult, withFile: RegressionResult, newFile: string): CheckResult {
  if (!baseline.tests?.length) return { ok: false, detail: `no per-test baseline (${baseline.reportError ?? "no tests reported"})` };
  const c = compareRegression(baseline, withFile);
  if (c.regressed.length) return { ok: false, detail: c.newFailure! };
  if (withFile.timedOut) return { ok: false, detail: `the suite timed out with the file added: ${withFile.cmd}` };
  const failedAtBase = new Set(baseline.tests.filter((t) => t.status === "failed").map(testKey));
  const outside = (withFile.tests ?? []).filter((t) => t.status === "failed" && t.file !== newFile && !failedAtBase.has(testKey(t)));
  if (outside.length) return { ok: false, detail: `tests outside the new file fail with it added: ${outside.map((t) => `${t.file} > ${t.name}`).join("; ")}` };
  const ownFailing = (withFile.tests ?? []).filter((t) => t.status === "failed" && t.file === newFile).length;
  const brokeExit = withFile.exitCode !== 0 && baseline.exitCode === 0;
  if (brokeExit && !ownFailing) return { ok: false, detail: `${c.newFailure ?? `the suite now exits ${withFile.exitCode}`}, and no test of the new file fails to explain it` };
  return { ok: true, detail: `all ${baseline.tests.filter((t) => t.status === "passed").length} tests that passed at baseline still pass with the file added${brokeExit ? ` (the suite's exit ${withFile.exitCode} comes from the new file's ${ownFailing} failing case(s))` : ""}` };
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────
export type ReproState = "REPRODUCED" | "NOT_REPRODUCED" | "REJECTED" | "FAILED";
export type CheckName = "a" | "b" | "c" | "d";

export interface ReproRecord {
  stage: typeof REPRO_STAGE_VERSION;
  runId: string;
  claimId: string;
  claim: ClaimSpec;
  claimFile: string;
  agent: string;
  provider: string;
  image: string;
  sandboxEnv?: SandboxDescription;
  profile: { id: string; workdir: string; path: string };
  plan?: Pick<ResolvedPlan, "setup" | "regression" | "typecheck" | "reports">;
  limits: TaskSpec["limits"];
  seed?: { patchSha256: string };
  baseSha: string;
  baseCommit?: string;
  startedAt: string;
  endedAt?: string;
  states: { state: string; at: string; note?: string }[];
  state?: ReproState;
  failedCheck?: CheckName;
  reason?: string;
  /** the one new file, as the agent left it (stays under runs/, never in docs) */
  testFile?: { path: string; runnerPath: string; content: string; sha256: string };
  changes?: { modifiedBase: string[]; deletedBase: string[]; addedInRepo: string[] };
  checks: Partial<Record<CheckName, CheckResult>>;
  fileRuns: { first?: FileRun; second?: FileRun };
  typecheck?: { baseline: TscError[]; withFile: TscError[]; added: TscError[] };
  baseline?: CheckResults;
  withFile?: CheckResults;
  agentRun?: { steps: number; budgetExhausted?: string; stopped?: string; error?: string; trace?: unknown };
  endReason?: string;
  usage: { llmCalls: number; inputTokens: number; outputTokens: number; tokens: number; costUSD: number };
  sandboxes: { agent?: SandboxNote; check?: SandboxNote };
  commands: { agent: CommandRecord[]; check: CommandRecord[] };
}
interface SandboxNote {
  id?: string;
  destroyed: boolean;
  createToDestroyMs?: number;
}

export interface ReproOptions {
  claim: LoadedClaim;
  agent: Agent;
  provider: SandboxProvider;
  image: string;
  llm?: { chat(request: ChatRequest, meta: { purpose: string }): Promise<ChatResult> };
  limits?: TaskSpec["limits"];
  signal?: AbortSignal;
  onState?: (state: string, note?: string) => void;
}

const now = () => new Date().toISOString();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const reportFile = () => `/tmp/.th-repro-report-${randomUUID()}.xml`;

/** Which sandbox source a claim uses (same rule as tasks). */
const sourceOf = (claim: LoadedClaim): SandboxSource => ("gitUrl" in claim.spec.source ? { gitUrl: claim.spec.source.gitUrl, sha: claim.spec.baseSha } : { localPath: claim.localPath! });

/** One sandbox, prepared exactly as a repair run's (seed → setup → squash → network off and proven off). */
async function withSandbox<T>(
  opts: { provider: SandboxProvider; image: string; claim: LoadedClaim; setup: string[]; log: CommandRecord[]; commandTimeoutMs: number; lifetimeMs: number; signal?: AbortSignal; note: (n: SandboxNote) => void },
  body: (sh: Sh, handle: SandboxHandle, baseCommit: string) => Promise<T>,
): Promise<T> {
  let handle: SandboxHandle | undefined;
  const started = Date.now();
  const note: SandboxNote = { destroyed: false };
  try {
    const prepared = await prepareSandbox({
      provider: opts.provider,
      image: opts.image,
      source: sourceOf(opts.claim),
      baseSha: opts.claim.spec.baseSha,
      setup: opts.setup,
      ...(opts.claim.seedPatch !== undefined && { seedPatch: opts.claim.seedPatch }),
      commandTimeoutMs: opts.commandTimeoutMs,
      log: opts.log,
      signal: opts.signal,
      maxLifetimeMs: opts.lifetimeMs,
      onHandle: (h) => {
        handle = h;
        note.id = h.id;
      },
    });
    const sh = makeSh(opts.provider, () => handle!, opts.log, opts.commandTimeoutMs, opts.signal);
    return await body(sh, handle!, prepared.baseCommit);
  } catch (error) {
    if (error instanceof SandboxGoneError) throw new RunFailed(sandboxGoneReason(handle));
    throw error;
  } finally {
    if (handle) {
      await opts.provider.destroy(handle).catch(() => undefined);
      const status = await opts.provider.status?.(handle);
      note.destroyed = status === undefined || status === "gone";
      note.createToDestroyMs = Date.now() - started;
    }
    opts.note(note);
  }
}

async function must(sh: Sh, phase: Parameters<Sh>[0], cmd: string, what: string) {
  const r = await sh(phase, cmd);
  if (r.timedOut || r.exitCode !== 0) throw new RunFailed(`${what} failed (exit ${r.exitCode}${r.timedOut ? ", timed out" : ""}): ${cmd}`);
  return r;
}

export async function runReproduce(opts: ReproOptions): Promise<ReproRecord> {
  const { claim, agent, provider, image } = opts;
  const limits = opts.limits ?? REPRO_LIMITS;
  const started = Date.now();
  const deadline = started + limits.wallClockMs;
  const workdir = claim.profile.workdir;
  const pattern = claim.spec.testFilePattern ?? BUN_TEST_FILE_PATTERN;
  const rawPlan = checkPlan({ setup: [], regression: [] }, claim.profile);
  const lifetimeMs = limits.wallClockMs + 10 * limits.commandTimeoutMs + 10 * 60_000;
  const record: ReproRecord = {
    stage: REPRO_STAGE_VERSION,
    runId: `repro__${claim.spec.id}__${agent.name}__${new Date(started).toISOString().replace(/[:.]/g, "-")}__${randomUUID().slice(0, 6)}`,
    claimId: claim.spec.id,
    claim: claim.spec,
    claimFile: path.relative(WORKSPACE_ROOT, claim.file),
    agent: agent.name,
    provider: provider.name,
    image,
    profile: { id: claim.profile.id, workdir, path: path.relative(WORKSPACE_ROOT, claim.profilePath) },
    limits,
    ...(claim.seedPatch !== undefined && { seed: { patchSha256: sha256(claim.seedPatch) } }),
    baseSha: claim.spec.baseSha,
    startedAt: new Date(started).toISOString(),
    states: [],
    checks: {},
    fileRuns: {},
    usage: { llmCalls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, costUSD: 0 },
    sandboxes: {},
    commands: { agent: [], check: [] },
  };
  const enter = (state: string, note?: string) => {
    record.states.push({ state, at: now(), ...(note && { note }) });
    opts.onState?.(state, note);
  };
  const finish = (state: ReproState, reason: string, failedCheck?: CheckName) => {
    record.state = state;
    record.reason = reason;
    if (failedCheck) record.failedCheck = failedCheck;
    enter(state, reason);
  };
  const box = (which: "agent" | "check") => ({ provider, image, claim, setup: rawPlan.setup, log: record.commands[which], commandTimeoutMs: limits.commandTimeoutMs, lifetimeMs, signal: opts.signal, note: (n: SandboxNote) => (record.sandboxes[which] = n) });

  try {
    record.sandboxEnv = await provider.describe?.(image).catch(() => undefined);
    // ── the agent's sandbox ────────────────────────────────────────────────────────────────
    enter("PREPARING_AGENT_SANDBOX");
    const agentDone = await withSandbox(box("agent"), async (sh, handle, baseCommit) => {
      record.baseCommit = baseCommit;
      const baseFiles = (await must(sh, "PATCHING", "git ls-tree -r -z --name-only HEAD", "listing the base files")).stdout.split("\0").filter(Boolean);
      const plan = await resolvePlan(sh, "BASELINE", rawPlan);
      record.plan = { setup: plan.setup, regression: plan.regression, typecheck: plan.typecheck, ...(plan.reports && { reports: plan.reports }) };
      enter("WRITING_TEST");
      await runAgent({ record, agent, ctxBase: { sh, handle, baseCommit, baseFiles, plan }, provider, limits, deadline, llm: opts.llm, signal: opts.signal, claim });
      const status = await must(sh, "VERIFYING", `git add -A && git diff --cached --no-renames --name-status -z ${baseCommit}`, "listing the changed files");
      record.changes = splitChanges(status.stdout);
      const verdict = checkDiff(record.changes, { pattern, workdir });
      if (verdict.kind === "file") {
        let content: string;
        try {
          content = await provider.readFile(handle, verdict.file);
        } catch (error) {
          if (error instanceof SandboxGoneError) throw error;
          throw new RunFailed(`reading the new file ${verdict.file}: ${(error as Error).message}`);
        }
        record.testFile = { path: verdict.file, runnerPath: runnerPath(verdict.file, workdir), content, sha256: sha256(content) };
      }
      return verdict;
    });
    // a model request error (HTTP, network, timeout) is infrastructure, not the agent's result
    if (record.agentRun?.error) return (finish("FAILED", `agent error: ${record.agentRun.error}`), record);

    // ── check a ────────────────────────────────────────────────────────────────────────────
    if (agentDone.kind === "none") {
      record.checks.a = { ok: false, detail: "no file added and nothing changed" };
      return (finish("NOT_REPRODUCED", "no qualifying file: the agent added no file"), record);
    }
    if (agentDone.kind === "rejected") {
      record.checks.a = { ok: false, detail: agentDone.detail };
      return (finish("REJECTED", `check a: ${agentDone.detail}`, "a"), record);
    }
    record.checks.a = { ok: true, detail: `one new file, ${agentDone.file}; nothing else changed` };
    const file = record.testFile!;

    // ── checks b–d in a fresh sandbox at the base with only the new file added ────────────────
    enter("CHECKING");
    await withSandbox(box("check"), async (sh, handle, baseCommit) => {
      if (baseCommit !== record.baseCommit) throw new RunFailed(`the check sandbox's base commit ${baseCommit} differs from the agent's ${record.baseCommit}`);
      const plan = await resolvePlan(sh, "BASELINE", rawPlan);
      const readReport = async (f: string) => {
        try {
          return await provider.readFile(handle, f);
        } catch (error) {
          if (error instanceof SandboxGoneError) throw error;
          throw new Error("no report written");
        }
      };
      record.baseline = await collectChecks(sh, "BASELINE", plan, readReport);
      if (!record.baseline.regression.every((r) => r.tests?.length)) throw new RunFailed(`no per-test baseline: ${record.baseline.regression.map((r) => r.reportError ?? `${r.tests?.length ?? 0} tests`).join("; ")}`);
      await provider.writeFile(handle, file.path, file.content);
      const runFile = async (): Promise<FileRun> => {
        const report = reportFile();
        const cmd = `${inDir(workdir, claim.profile.testReport!.command.replaceAll(REPORT_PLACEHOLDER, report))} ${shq(`./${file.runnerPath}`)}`;
        const r = await sh("VERIFYING", `rm -f ${report} && ${cmd}`);
        const run: FileRun = { cmd, exitCode: r.exitCode, timedOut: r.timedOut };
        let xml: string | undefined;
        try {
          xml = await readReport(report);
        } catch (error) {
          if (error instanceof SandboxGoneError) throw error;
        }
        if (xml !== undefined) {
          try {
            run.cases = parseJunitCases(xml); // the file ran alone: every case is its own
          } catch (error) {
            run.reportError = `report not readable: ${(error as Error).message}`;
          }
        }
        await must(sh, "VERIFYING", `rm -f ${report}`, "removing the report");
        return run;
      };
      const reject = (check: CheckName, detail: string) => {
        record.checks[check] = { ok: false, detail };
        finish("REJECTED", `check ${check}: ${detail}`, check);
      };
      // b: loads, collects, no timeout, failures are assertions; then no type error the base doesn't have
      record.fileRuns.first = await runFile();
      if (record.fileRuns.first.reportError) throw new RunFailed(record.fileRuns.first.reportError);
      const first = judgeFileRun(record.fileRuns.first);
      if (first.kind === "rejected") return reject("b", first.detail);
      if (first.kind === "passes") {
        record.checks.b = { ok: false, detail: first.detail };
        return finish("NOT_REPRODUCED", `the test passes: ${first.detail}`);
      }
      const tsc = await collectChecks(sh, "VERIFYING", { regression: [], typecheck: plan.typecheck, tsc: plan.tsc });
      const base = record.baseline.typecheck.flatMap((t) => t.diagnostics);
      const withFile = tsc.typecheck.flatMap((t) => t.diagnostics);
      const added = newTscErrors(base, withFile);
      record.typecheck = { baseline: base, withFile, added };
      if (added.length) return reject("b", `type error(s) the base doesn't have: ${added.map((d) => `${d.file} ${d.code}: ${d.message.slice(0, 160)}`).join("; ")}`);
      record.checks.b = { ok: true, detail: first.detail };
      // c: the same cases fail on a second run
      record.fileRuns.second = await runFile();
      if (record.fileRuns.second.reportError) throw new RunFailed(record.fileRuns.second.reportError);
      const second = judgeSecondRun(first.failing, judgeFileRun(record.fileRuns.second));
      if (!second.ok) return reject("c", second.detail);
      record.checks.c = second;
      // d: every test that passed at baseline still passes with the file in the suite. The file's
      // name is taken from the runner's own report of it, so it matches the suite's report.
      const reported = record.fileRuns.first.cases![0]!.file;
      record.withFile = await collectChecks(sh, "VERIFYING", { regression: plan.regression, typecheck: [], ...(plan.reports && { reports: plan.reports }) }, readReport);
      const verdicts = record.withFile.regression.map((f, i) => judgeRegression(record.baseline!.regression[i]!, f, reported));
      const d = verdicts.find((v) => !v.ok) ?? verdicts[0] ?? { ok: true, detail: "no regression command" };
      if (!d.ok) return reject("d", d.detail);
      record.checks.d = d;
      finish("REPRODUCED", `the new test fails on an assertion at the base, the same way twice, and breaks nothing: ${first.detail}`);
    });
  } catch (error) {
    if (error instanceof RunCancelled) finish("FAILED", `cancelled: ${error.message}`);
    else if (error instanceof RunFailed) finish("FAILED", error.message);
    else if (error instanceof SandboxGoneError) finish("FAILED", error.message);
    else finish("FAILED", `harness error: ${(error as Error).message}`);
  } finally {
    record.endedAt = now();
    record.endReason = runMetrics({ agentRun: record.agentRun }).endReason;
  }
  return record;
}

/** The agent in its sandbox: the same budgets and step accounting as a repair run (run.ts). */
async function runAgent(args: {
  record: ReproRecord;
  agent: Agent;
  ctxBase: { sh: Sh; handle: SandboxHandle; baseCommit: string; baseFiles: string[]; plan: ResolvedPlan };
  provider: SandboxProvider;
  limits: TaskSpec["limits"];
  deadline: number;
  llm?: ReproOptions["llm"];
  signal?: AbortSignal;
  claim: LoadedClaim;
}): Promise<void> {
  const { record, agent, provider, limits, deadline, signal } = args;
  const { sh, handle, baseCommit, baseFiles, plan } = args.ctxBase;
  let steps = 0;
  const budget = () => {
    if (signal?.aborted) throw new RunCancelled("cancelled by signal");
    if (Date.now() >= deadline) throw new BudgetExhausted(`wall-clock ${limits.wallClockMs}ms`);
  };
  const step = () => {
    budget();
    if (++steps > limits.steps) throw new BudgetExhausted(`steps ${limits.steps}`);
  };
  const io = async <T>(fn: () => Promise<T>): Promise<T> => {
    step();
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SandboxGoneError) steps--; // the harness's failure, not an agent step
      throw error;
    }
  };
  const ctx: AgentContext = {
    issue: claimText(args.claim.spec),
    limits,
    testCommands: taskTestCommands(plan),
    baseFiles,
    repoState: async () => {
      budget();
      const r = await must(sh, "PATCHING", repoStateCommand(baseCommit), "computing the repo state");
      const [hash = "", size = "", base = ""] = r.stdout.trim().split("\n").map((x) => x.trim());
      if (!/^[0-9a-f]{64}$/.test(hash) || !/^\d+$/.test(size) || !/^\d+$/.test(base)) throw new RunFailed(`repo state probe printed ${JSON.stringify(r.stdout.slice(0, 120))}`);
      return { hash, empty: size === "0", baseChanged: base !== "0" };
    },
    exec: (cmd, o) =>
      io(async () => {
        const r = await sh("PATCHING", cmd, { actor: "agent", timeoutMs: Math.max(1000, Math.min(o?.timeoutMs ?? limits.commandTimeoutMs, deadline - Date.now())) });
        if (r.timedOut && Date.now() >= deadline - 500) throw new BudgetExhausted(`wall-clock ${limits.wallClockMs}ms`);
        return r;
      }),
    writeFile: (p, content) => io(() => provider.writeFile(handle, p, content)),
    readFile: (p) => io(() => provider.readFile(handle, p)),
    step: () => step(),
    stepsUsed: () => steps,
    ...(args.llm && {
      llm: {
        chat: async (request: ChatRequest, meta?: { purpose: string }) => {
          budget();
          if (record.usage.tokens >= limits.tokens) throw new BudgetExhausted(`tokens ${limits.tokens}`);
          if (record.usage.costUSD >= limits.costUSD) throw new BudgetExhausted(`cost $${limits.costUSD}`);
          let result: ChatResult;
          try {
            result = await args.llm!.chat(request, { purpose: meta?.purpose ?? `repro-agent:${agent.name}` });
          } catch (error) {
            if (error instanceof BudgetExceededError) throw new BudgetExhausted(`cost cap (${error.message})`);
            throw error;
          }
          record.usage.llmCalls++;
          record.usage.inputTokens += result.inputTokens ?? 0;
          record.usage.outputTokens += result.outputTokens ?? 0;
          record.usage.tokens = record.usage.inputTokens + record.usage.outputTokens;
          record.usage.costUSD += result.costUSD;
          if (record.usage.tokens > limits.tokens) throw new BudgetExhausted(`tokens ${limits.tokens}`);
          if (record.usage.costUSD > limits.costUSD) throw new BudgetExhausted(`cost $${limits.costUSD}`);
          return result;
        },
      },
    }),
  };
  record.agentRun = { steps: 0 };
  try {
    await agent.run(ctx);
  } catch (error) {
    if (error instanceof RunCancelled || error instanceof RunFailed || error instanceof SandboxGoneError) throw error;
    if (error instanceof BudgetExhausted) record.agentRun.budgetExhausted = error.message;
    else if (error instanceof AgentStopped) record.agentRun.stopped = error.message;
    else record.agentRun.error = (error as Error).message;
  } finally {
    record.agentRun.steps = Math.min(steps, limits.steps);
    if (agent.trace !== undefined) record.agentRun.trace = agent.trace;
  }
}

// ── Oracle check (Phase 3 measurement) and the task a reproduction becomes (Phase 4) ─────────
export interface OracleCheck {
  runId: string;
  record: string;
  patch: string;
  patchSha256: string;
  testFileSha256: string;
  exitCode: number;
  timedOut: boolean;
  cases?: CaseResult[];
  /** "true": the test passes with the fix; "false": it still fails; "error": it couldn't be judged */
  reproduction: "true" | "false" | "error";
  detail: string;
}

/** A fresh sandbox at the claim's base (seed included), the fix applied, the test added and run alone. */
export async function oracleCheck(opts: { record: ReproRecord; recordFile: string; claim: LoadedClaim; patch: string; patchFile: string; provider: SandboxProvider; image: string }): Promise<OracleCheck> {
  const { record, claim, patch } = opts;
  if (record.state !== "REPRODUCED" || !record.testFile) throw new Error(`${opts.recordFile} is ${record.state}, not REPRODUCED`);
  const file = record.testFile;
  const log: CommandRecord[] = [];
  const out: OracleCheck = { runId: record.runId, record: opts.recordFile, patch: opts.patchFile, patchSha256: sha256(patch), testFileSha256: file.sha256, exitCode: -1, timedOut: false, reproduction: "error", detail: "" };
  try {
    await withSandbox(
      { provider: opts.provider, image: opts.image, claim, setup: checkPlan({ setup: [], regression: [] }, claim.profile).setup, log, commandTimeoutMs: record.limits.commandTimeoutMs, lifetimeMs: 30 * 60_000, note: () => undefined },
      async (sh, handle) => {
        await opts.provider.writeFile(handle, "/tmp/.th-oracle.patch", patch);
        await must(sh, "VERIFYING", "git apply --whitespace=nowarn /tmp/.th-oracle.patch && rm -f /tmp/.th-oracle.patch", "applying the oracle patch");
        await opts.provider.writeFile(handle, file.path, file.content);
        const report = reportFile();
        const cmd = `${inDir(claim.profile.workdir, claim.profile.testReport!.command.replaceAll(REPORT_PLACEHOLDER, report))} ${shq(`./${file.runnerPath}`)}`;
        const r = await sh("VERIFYING", `rm -f ${report} && ${cmd}`);
        out.exitCode = r.exitCode;
        out.timedOut = r.timedOut;
        try {
          out.cases = parseJunitCases(await opts.provider.readFile(handle, report)); // the file ran alone
        } catch (error) {
          if (error instanceof SandboxGoneError) throw error;
        }
        const failing = out.cases?.filter((c) => c.status === "failed") ?? [];
        if (r.timedOut || !out.cases?.length) out.detail = r.timedOut ? "timed out" : `no test cases reported (exit ${r.exitCode})`;
        else if (r.exitCode === 0 && !failing.length) ((out.reproduction = "true"), (out.detail = `${out.cases.length} case(s) pass with the fix`));
        else ((out.reproduction = "false"), (out.detail = `still fails with the fix: ${failing.map((c) => `${c.name} (${c.failureType})`).join("; ") || `exit ${r.exitCode}`}`));
      },
    );
  } catch (error) {
    out.detail = `error: ${(error as Error).message}`;
  }
  return out;
}

/**
 * A REPRODUCED record → a task folder the repair harness accepts: issue = the claim text, repro =
 * the agent's test (copied in only while reproducing and verifying, as for every task). The seed, if
 * any, is copied next to it. Written under runs/, never eval/tasks/.
 */
export function reproductionToTask(record: ReproRecord, claim: LoadedClaim, outDir: string, kind: "dev" | "smoke" = "dev"): string {
  if (record.state !== "REPRODUCED" || !record.testFile) throw new Error(`run ${record.runId} is ${record.state}, not REPRODUCED`);
  mkdirSync(outDir, { recursive: true });
  const file = record.testFile;
  writeFileSync(path.join(outDir, "repro.test.ts"), file.content);
  if (claim.seedPatch !== undefined) writeFileSync(path.join(outDir, "seed.patch"), claim.seedPatch);
  const source = "gitUrl" in claim.spec.source ? claim.spec.source : { localPath: path.relative(outDir, claim.localPath!) };
  const task = {
    id: `${claim.spec.id}-from-repro`,
    kind,
    source,
    baseSha: claim.spec.baseSha,
    profile: path.relative(outDir, claim.profilePath),
    ...(claim.seedPatch !== undefined && { seed: { patch: "seed.patch" } }),
    setup: [],
    issue: claim.spec.claim,
    repro: { testFile: "repro.test.ts", dest: file.path, command: inDir(claim.profile.workdir, `bun test ${shq(`./${file.runnerPath}`)}`) },
    regression: [],
    ...(claim.spec.testFilePattern && { testFilePattern: claim.spec.testFilePattern }),
    limits: REPRO_LIMITS,
  };
  TaskSpec.parse(task); // the repair harness's own schema
  const taskFile = path.join(outDir, "task.json");
  writeFileSync(taskFile, JSON.stringify(task, null, 2) + "\n");
  writeFileSync(path.join(outDir, "FROM.json"), JSON.stringify({ reproduceRun: record.runId, claimId: record.claimId, testFileSha256: file.sha256 }, null, 2) + "\n");
  return taskFile;
}

// ── Batch ────────────────────────────────────────────────────────────────────────────────────
export function discoverClaims(dir: string): string[] {
  const abs = path.resolve(dir);
  if (!existsSync(abs)) throw new Error(`claims ${abs} do not exist`);
  if (statSync(abs).isFile()) return [abs];
  const files = readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(abs, f))
    .sort();
  for (const f of files) loadClaim(f); // validate all before anything runs
  if (!files.length) throw new Error(`no claim *.json in ${abs}`);
  return files;
}

export interface BatchRow {
  claimId: string;
  seeded: boolean;
  state: string; // a ReproState, or NOT_RUN
  failedCheck?: CheckName;
  reason?: string;
  steps?: number;
  tokens?: number;
  costUSD?: number;
  endReason?: string;
  runFile?: string;
}

export function batchRow(claimFile: string, record: ReproRecord | undefined, runFile?: string, error?: string): BatchRow {
  const claim = loadClaim(claimFile).spec;
  if (!record) return { claimId: claim.id, seeded: Boolean(claim.seed), state: "FAILED", reason: error ?? "no record" };
  return {
    claimId: claim.id,
    seeded: Boolean(claim.seed),
    state: record.state ?? "FAILED",
    ...(record.failedCheck && { failedCheck: record.failedCheck }),
    ...(record.reason && { reason: record.reason }),
    steps: record.agentRun?.steps ?? 0,
    tokens: record.usage.tokens,
    costUSD: record.usage.costUSD,
    ...(record.endReason && { endReason: record.endReason }),
    ...(runFile && { runFile }),
  };
}

/** States and counts only: the test text stays in the run records. */
export function batchMarkdown(rows: BatchRow[], meta: { model: string; generatedAt: string }): string {
  const out = [`# Reproduce batch`, "", `Model: ${meta.model} · ${meta.generatedAt}`, "", "| Claim | Case | State | Failed check | End | Steps | Tokens | Cost |", "|---|---|---|---|---|---|---|---|"];
  for (const r of rows) out.push(`| ${r.claimId} | ${r.seeded ? "seeded" : "control"} | ${r.state} | ${r.failedCheck ?? "—"} | ${r.endReason ?? "—"} | ${r.steps ?? "—"} | ${r.tokens ?? "—"} | ${r.costUSD === undefined ? "—" : `$${r.costUSD.toFixed(5)}`} |`);
  const count = (seeded: boolean, state: string) => rows.filter((r) => r.seeded === seeded && r.state === state).length;
  const states = ["REPRODUCED", "NOT_REPRODUCED", "REJECTED", "FAILED", "NOT_RUN"];
  out.push("", "| Case | n | " + states.join(" | ") + " |", "|---|---|" + states.map(() => "---").join("|") + "|");
  for (const seeded of [true, false]) out.push(`| ${seeded ? "seeded" : "control"} | ${rows.filter((r) => r.seeded === seeded).length} | ${states.map((s) => count(seeded, s)).join(" | ")} |`);
  const cost = rows.reduce((n, r) => n + (r.costUSD ?? 0), 0);
  out.push("", `Total cost $${cost.toFixed(5)} (n = ${rows.filter((r) => r.state !== "NOT_RUN").length} runs). Counts only; no significance test.`);
  return out.join("\n") + "\n";
}

function spawnRun(claimFile: string, opts: { runsDir: string; model?: string; costLimitUSD?: number }): Promise<{ record?: ReproRecord; runFile?: string; error?: string }> {
  return new Promise((resolve) => {
    const args = [import.meta.filename, "run", "--claim", claimFile, "--runs-dir", opts.runsDir, ...(opts.model ? ["--model", opts.model] : []), ...(opts.costLimitUSD !== undefined ? ["--cost-limit-usd", String(opts.costLimitUSD)] : [])];
    const child = spawn(process.execPath, args, { cwd: WORKSPACE_ROOT, stdio: ["ignore", "pipe", "pipe"], env: cleanGitEnv() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on("close", (code) => {
      const m = /^→ (.+\.json)$/m.exec(stdout);
      if (!m) return resolve({ error: `run exited ${code} without a record: ${(stderr.trim().split("\n").at(-1) ?? "").slice(0, 300)}` });
      const runFile = path.resolve(WORKSPACE_ROOT, m[1]!);
      try {
        resolve({ record: JSON.parse(readFileSync(runFile, "utf8")) as ReproRecord, runFile });
      } catch (error) {
        resolve({ error: `could not read ${runFile}: ${(error as Error).message}` });
      }
    });
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
export const USAGE = `usage:
  reproduce.ts run --claim <claim.json> [--model <id>] [--cost-limit-usd <usd>] [--runs-dir runs]
  reproduce.ts batch --claims <dir> [--model <id>] [--cost-limit-usd <usd>] [--max-ledger-usd <usd>] [--out <dir>]
  reproduce.ts oracle-check --record <run.json> --patch <fix.patch> [--out <file>]
  reproduce.ts to-task --record <run.json> [--out <dir>] [--kind dev|smoke]`;

function loadEnv() {
  const envFile = path.join(WORKSPACE_ROOT, ".env");
  if (existsSync(envFile) && !process.env.NEBIUS_API_KEY) process.loadEnvFile(envFile);
}

async function dockerProvider(image: string): Promise<LocalDockerProvider> {
  console.error(`[reproduce] docker ${LocalDockerProvider.assertAvailable()}`);
  await LocalDockerProvider.ensureImage(image);
  return new LocalDockerProvider();
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      claim: { type: "string" },
      claims: { type: "string" },
      record: { type: "string" },
      patch: { type: "string" },
      model: { type: "string" },
      "cost-limit-usd": { type: "string" },
      "max-ledger-usd": { type: "string" },
      "runs-dir": { type: "string", default: path.join(WORKSPACE_ROOT, "runs") },
      out: { type: "string" },
      kind: { type: "string", default: "dev" },
    },
  });
  const fail = (msg: string) => (console.error(`✖ ${msg}\n${USAGE}`), 3);
  const costLimitUSD = values["cost-limit-usd"] === undefined ? undefined : Number(values["cost-limit-usd"]);
  if (costLimitUSD !== undefined && !(costLimitUSD > 0)) return fail("--cost-limit-usd must be a positive number");
  try {
    if (command === "run") {
      if (!values.claim) return fail("--claim is required");
      loadEnv();
      const claim = loadClaim(values.claim);
      const limits = { ...REPRO_LIMITS, ...(costLimitUSD !== undefined && { costUSD: costLimitUSD }) };
      const { createTokenFactoryClient } = await import("../llm/setup.ts");
      const llm = createTokenFactoryClient({ readCache: false }).client;
      const agent = new RepairLoopAgent({ promptFile: REPRO_PROMPT_FILE, ...(values.model && { model: values.model }) });
      const provider = await dockerProvider(SANDBOX_IMAGE);
      const abort = new AbortController();
      const onSignal = () => {
        abort.abort();
        for (const h of provider.live()) void provider.destroy(h);
      };
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
      const record = await runReproduce({ claim, agent, provider, image: SANDBOX_IMAGE, llm, limits, signal: abort.signal, onState: (s, n) => console.error(`[reproduce] ${s}${n ? `: ${n}` : ""}`) });
      mkdirSync(values["runs-dir"]!, { recursive: true });
      const file = path.join(path.resolve(values["runs-dir"]!), `${record.runId}.json`);
      writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
      const trace = record.agentRun?.trace as Partial<LoopTrace> | undefined;
      console.log(`${record.state}${record.failedCheck ? ` (check ${record.failedCheck})` : ""} · ${record.claimId} · ${trace?.model ?? record.agent} · ${record.agentRun?.steps ?? 0} steps · ${record.usage.tokens} tokens · $${record.usage.costUSD.toFixed(5)} · ${record.endReason} · ${record.reason}`);
      console.log(`→ ${path.relative(process.cwd(), file)}`);
      return record.state === "FAILED" ? 2 : 0;
    }
    if (command === "batch") {
      if (!values.claims) return fail("--claims is required");
      const maxLedger = values["max-ledger-usd"] === undefined ? undefined : Number(values["max-ledger-usd"]);
      if (maxLedger !== undefined && !(maxLedger > 0)) return fail("--max-ledger-usd must be a positive number");
      const claims = discoverClaims(values.claims);
      const out = path.resolve(values.out ?? path.join(WORKSPACE_ROOT, "runs", `repro-${new Date().toISOString().replace(/[:.]/g, "-")}`));
      const runsDir = path.join(out, "runs");
      mkdirSync(runsDir, { recursive: true });
      const ledger = new SpendLedger(LEDGER);
      const before = ledger.totalUSD();
      const reserve = costLimitUSD ?? REPRO_LIMITS.costUSD;
      const rows: BatchRow[] = [];
      let stopped: string | undefined;
      for (const [i, claimFile] of claims.entries()) {
        const spent = ledger.totalUSD(); // read before each model run
        if (!stopped && maxLedger !== undefined && spent + reserve > maxLedger + 1e-9) stopped = `spend cap: ledger $${spent.toFixed(5)} + $${reserve.toFixed(2)} reserved > $${maxLedger}`;
        if (stopped) {
          const c = loadClaim(claimFile).spec;
          rows.push({ claimId: c.id, seeded: Boolean(c.seed), state: "NOT_RUN", reason: stopped });
        } else {
          console.error(`[batch] ${i + 1}/${claims.length} ${path.basename(claimFile)} · ledger $${spent.toFixed(5)}`);
          const r = await spawnRun(claimFile, { runsDir, ...(values.model && { model: values.model }), ...(costLimitUSD !== undefined && { costLimitUSD }) });
          rows.push(batchRow(claimFile, r.record, r.runFile && path.relative(out, r.runFile), r.error));
        }
        const row = rows.at(-1)!;
        console.error(`[batch] ${row.claimId}: ${row.state}${row.failedCheck ? ` (check ${row.failedCheck})` : ""}${row.reason ? ` · ${row.reason.slice(0, 200)}` : ""}`);
      }
      const after = ledger.totalUSD();
      const generatedAt = new Date().toISOString();
      const model = values.model ?? "default (Nano)";
      writeFileSync(path.join(out, "results.json"), JSON.stringify({ generatedAt, claims: path.resolve(values.claims), model, costLimitUSD: reserve, maxLedgerUSD: maxLedger ?? null, ledger: { beforeUSD: before, afterUSD: after, spentUSD: after - before }, rows }, null, 2) + "\n");
      const md = batchMarkdown(rows, { model, generatedAt });
      writeFileSync(path.join(out, "results.md"), md);
      console.log(md);
      console.log(`ledger: $${before.toFixed(5)} → $${after.toFixed(5)} (+$${(after - before).toFixed(5)})`);
      console.log(`→ ${path.relative(process.cwd(), path.join(out, "results.json"))}`);
      return rows.some((r) => r.state === "FAILED" || r.state === "NOT_RUN") ? 2 : 0;
    }
    if (command === "oracle-check") {
      if (!values.record || !values.patch) return fail("--record and --patch are required");
      const record = JSON.parse(readFileSync(values.record, "utf8")) as ReproRecord;
      const claim = loadClaim(path.resolve(WORKSPACE_ROOT, record.claimFile));
      const provider = await dockerProvider(record.image);
      const result = await oracleCheck({ record, recordFile: path.relative(WORKSPACE_ROOT, path.resolve(values.record)), claim, patch: readFileSync(values.patch, "utf8"), patchFile: path.relative(WORKSPACE_ROOT, path.resolve(values.patch)), provider, image: record.image });
      const out = path.resolve(values.out ?? values.record.replace(/\.json$/, ".oracle.json"));
      writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
      console.log(`${result.reproduction === "true" ? "TRUE reproduction" : result.reproduction === "false" ? "FALSE reproduction" : "ERROR"} · ${record.claimId} · ${result.detail}`);
      console.log(`→ ${path.relative(process.cwd(), out)}`);
      return result.reproduction === "error" ? 2 : 0;
    }
    if (command === "to-task") {
      if (!values.record) return fail("--record is required");
      if (values.kind !== "dev" && values.kind !== "smoke") return fail("--kind must be dev or smoke");
      const record = JSON.parse(readFileSync(values.record, "utf8")) as ReproRecord;
      const claim = loadClaim(path.resolve(WORKSPACE_ROOT, record.claimFile));
      const outDir = path.resolve(values.out ?? path.join(WORKSPACE_ROOT, "runs", "tasks-from-repro", `${claim.spec.id}-from-repro`));
      const rel = path.relative(WORKSPACE_ROOT, outDir);
      if (rel.startsWith("eval/tasks") || rel.startsWith(`eval${path.sep}tasks`)) return fail("emitted tasks go under runs/, never eval/tasks/");
      const taskFile = reproductionToTask(record, claim, outDir, values.kind);
      console.log(`→ ${path.relative(process.cwd(), taskFile)}`);
      return 0;
    }
  } catch (error) {
    if (error instanceof DockerUnavailableError) return fail(error.message);
    console.error(`✖ ${(error as Error).message}`);
    return 2;
  }
  return fail(`unknown command "${command ?? ""}"`);
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
