import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import type { Finding } from "./action.ts";

export const CONTRACTS_BUDGET_MS = 90_000;
export const CONTRACT_LIMIT = 10;
const root = path.resolve(import.meta.dirname, "../../..");
const SHA = /^[a-f0-9]{40}$/;
const execute = promisify(execFile);
export type ContractsFailure = "timeout" | "error" | "invalid-output" | "merge-base" | "checkout" | "unavailable";
export interface ContractsResult {
  status: "ok" | "failed" | "off";
  findings: Finding[];
  ms: number;
  reason?: ContractsFailure;
}
export interface ContractsSummary { status: ContractsResult["status"]; inline: number; body: number; ms: number }
export type ContractsExecute = (file: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv; encoding: "utf8"; maxBuffer: number;
  signal: AbortSignal; timeout: number; killSignal: "SIGKILL";
}) => Promise<{ stdout: string }>;

export function contractsEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = cleanGitEnv(env);
  for (const key of ["GITHUB_TOKEN", "GH_TOKEN", "NEBIUS_API_KEY", "GIT_ASKPASS", "SSH_ASKPASS"]) delete clean[key];
  return { ...clean, GIT_TERMINAL_PROMPT: "0" };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid contracts object");
  return value as Record<string, unknown>;
}

export function readContractsReport(value: unknown, base: string, head: string): Finding[] {
  const report = object(value), refs = object(report.refs), typed = object(report.typed);
  if (refs.base !== base || refs.mergeBase !== base || refs.head !== head || !Array.isArray(report.findings)
    || typeof object(report.timings).totalMs !== "number" || !Number.isFinite(object(report.timings).totalMs)
    || (object(report.timings).totalMs as number) < 0) throw new Error("Invalid contracts report");
  object(report.keyed); object(report.dependents);
  if (!(typed.complete === true || typed.skipped === "no-tsconfig")) throw new Error("Incomplete contracts report");
  return report.findings.map(value => {
    const finding = object(value);
    if (typeof finding.path !== "string" || !finding.path.trim() || /[\0\r\n\\]/.test(finding.path)
      || path.posix.isAbsolute(finding.path) || finding.path.split("/").includes("..")
      || !Number.isSafeInteger(finding.line) || (finding.line as number) < 1
      || typeof finding.body !== "string" || !finding.body.trim()
      || !["tsc", "contract"].includes(String(finding.source)) || finding.category !== "contract" || finding.severity !== "high"
      || !Array.isArray(finding.evidence) || finding.evidence.length !== 2) throw new Error("Invalid contract finding");
    return { path: finding.path, line: finding.line as number, body: finding.body };
  });
}

/** A trusted CLI, bundled TypeScript, and credential-free workspace git; no target scripts. */
export async function runContracts(
  repo: string, base: string, head: string, env: NodeJS.ProcessEnv = process.env, exec: ContractsExecute = execute,
): Promise<ContractsResult> {
  const started = performance.now(), signal = AbortSignal.timeout(CONTRACTS_BUDGET_MS);
  let directory: string | undefined, reason: ContractsFailure = "checkout";
  const ms = () => Math.max(0, Math.round(performance.now() - started));
  try {
    if (!repo || !SHA.test(base) || !SHA.test(head)) throw new Error("Invalid checkout");
    const childEnv = contractsEnv(env);
    const run = (file: string, args: string[]) => exec(file, args, { cwd: root, env: childEnv, encoding: "utf8",
      signal, timeout: Math.max(1, CONTRACTS_BUDGET_MS - ms()), killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 });
    const git = async (args: string[]) => (await run("git", ["-C", repo, ...args])).stdout.trim();
    reason = "merge-base";
    let mergeBase: string;
    try { mergeBase = await git(["merge-base", base, head]); }
    catch {
      const shallow = await git(["rev-parse", "--is-shallow-repository"]) === "true";
      // Preserve runner config such as safe.directory, but never let this fetch use auth.
      const server = env.GITHUB_SERVER_URL || "https://github.com";
      await git(["-c", "credential.helper=", "-c", "core.askPass=", "-c", "http.extraHeader=",
        "-c", `http.${server}/.extraheader=`, "fetch", "--no-tags", ...(shallow ? ["--unshallow"] : []), "origin", base]);
      mergeBase = await git(["merge-base", base, head]);
    }
    if (!SHA.test(mergeBase)) throw new Error("Invalid merge base");
    directory = await mkdtemp(path.join(tmpdir(), "tracehound-contracts-"));
    const out = path.join(directory, "contracts.json");
    reason = "error";
    await run(process.execPath, [path.join(root, "packages/analyzer/src/bin.ts"), "contracts", "--repo", repo,
      "--base", mergeBase, "--head", head, "--out", out, "--budget-s", "90"]);
    reason = "invalid-output";
    if ((await stat(out)).size > 4 * 1024 * 1024) throw new Error("Oversized contracts report");
    const value: unknown = JSON.parse(await readFile(out, "utf8"));
    const typed = object(object(value).typed);
    if (typed.skipped === "budget" || typed.skipped === "error") {
      return { status: "failed", findings: [], ms: ms(), reason: typed.skipped === "budget" ? "timeout" : "error" };
    }
    const findings = readContractsReport(value, mergeBase, head);
    return { status: "ok", findings, ms: ms() };
  } catch (error) {
    const killed = error && typeof error === "object" && "killed" in error && error.killed;
    return { status: "failed", findings: [], ms: ms(), reason: signal.aborted || killed ? "timeout" : reason };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

/** Also bound an injected runner and contain exceptions at the review boundary. */
export async function settleContracts(run: (() => Promise<ContractsResult>) | undefined, log: (text: string) => void): Promise<ContractsResult> {
  const started = performance.now(); let timer: ReturnType<typeof setTimeout> | undefined;
  const failed = (reason: ContractsFailure): ContractsResult => ({ status: "failed", findings: [],
    ms: Math.round(performance.now() - started), reason });
  let result: ContractsResult;
  try {
    result = await Promise.race([Promise.resolve().then(() => run ? run() : failed("unavailable")),
      new Promise<ContractsResult>(resolve => { timer = setTimeout(() => resolve(failed("timeout")), CONTRACTS_BUDGET_MS); })]);
  } catch { result = failed("error"); }
  finally { if (timer) clearTimeout(timer); }
  if (result.status === "failed") log(`contracts: failed (${result.reason ?? "error"})`);
  return result;
}
