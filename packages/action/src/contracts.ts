import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import type { Finding } from "./action.ts";
import { newSideLines, parseDiff } from "../../analyzer/src/review/diff.ts";

export const CONTRACTS_BUDGET_MS = 90_000;
export const CONTRACTS_KILL_GRACE_MS = 5_000;
export const CONTRACT_LIMIT = 10;
const root = path.resolve(import.meta.dirname, "../../..");
const SHA = /^[a-f0-9]{40}$/;
const execute: ContractsExecute = (file, args, options) => promisify(execFile)(file, args, { ...options, timeout: 0 });
export type ContractsFailure = "timeout" | "error" | "invalid-output" | "merge-base" | "checkout" | "unavailable";
export type ContractsTyped = "complete" | "skipped-no-tsconfig" | "skipped-budget" | "skipped-error";
export interface ContractsResult {
  status: "ok" | "failed" | "off";
  findings: Finding[];
  ms: number;
  reason?: ContractsFailure;
  messages?: string[];
  typed?: ContractsTyped;
}
export interface ContractsSummary { status: ContractsResult["status"]; inline: number; body: number; ms: number; typed?: ContractsTyped }
export type ContractsExecute = (file: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv; encoding: "utf8"; maxBuffer: number;
  timeout: number; killSignal: "SIGTERM";
}) => Promise<{ stdout: string }> & { child?: { kill(signal: NodeJS.Signals): boolean } };

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
  if (!(typed.complete === true || ["no-tsconfig", "budget", "error"].includes(String(typed.skipped)))) throw new Error("Incomplete contracts report");
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
  const started = performance.now(), messages: string[] = [];
  let timedOut = false, forceKilled = false;
  let directory: string | undefined, reason: ContractsFailure = "checkout";
  const ms = () => Math.max(0, Math.round(performance.now() - started));
  try {
    if (!repo || !SHA.test(base) || !SHA.test(head)) throw new Error("Invalid checkout");
    const childEnv = contractsEnv(env);
    const run = async (file: string, args: string[]) => {
      const timeout = Math.max(1, CONTRACTS_BUDGET_MS - ms());
      const task = exec(file, args, { cwd: root, env: childEnv, encoding: "utf8", timeout,
        killSignal: "SIGTERM", maxBuffer: 4 * 1024 * 1024 });
      let grace: ReturnType<typeof setTimeout> | undefined;
      let expire!: (error: Error) => void;
      const deadline = new Promise<never>((_, reject) => { expire = reject; });
      const timer = setTimeout(() => {
        timedOut = true;
        task.child?.kill("SIGTERM");
        grace = setTimeout(() => {
          forceKilled = true;
          if (task.child) task.child.kill("SIGKILL");
          else expire(new Error("Contracts timeout"));
        }, CONTRACTS_KILL_GRACE_MS);
      }, timeout);
      try {
        const result = await Promise.race([task, deadline]);
        if (timedOut) throw new Error("Contracts timeout");
        return result;
      } finally { clearTimeout(timer); if (grace) clearTimeout(grace); }
    };
    const git = async (args: string[]) => (await run("git", ["-C", repo, ...args])).stdout.trim();
    reason = "merge-base";
    let mergeBase: string;
    try { mergeBase = await git(["merge-base", base, head]); }
    catch {
      if (timedOut || CONTRACTS_BUDGET_MS - ms() < 30_000) throw new Error("Insufficient fetch budget");
      const shallow = await git(["rev-parse", "--is-shallow-repository"]) === "true";
      const lock = path.resolve(repo, await git(["rev-parse", "--git-path", "shallow.lock"]));
      const lockExisted = await stat(lock).then(() => true, () => false);
      if (CONTRACTS_BUDGET_MS - ms() < 30_000) throw new Error("Insufficient fetch budget");
      // Preserve runner config such as safe.directory, but never let this fetch use auth.
      const server = env.GITHUB_SERVER_URL || "https://github.com";
      try {
        await git(["-c", "credential.helper=", "-c", "core.askPass=", "-c", "http.extraHeader=",
          "-c", `http.${server}/.extraheader=`, "fetch", "--no-tags", ...(shallow ? ["--unshallow"] : []), "origin", base]);
      } finally {
        if (forceKilled && !lockExisted && await stat(lock).then(() => true, () => false)) {
          await rm(lock);
          messages.push("contracts: removed shallow.lock after killed fetch");
        }
      }
      mergeBase = await git(["merge-base", base, head]);
    }
    if (!SHA.test(mergeBase)) throw new Error("Invalid merge base");
    const budgetSeconds = Math.floor((CONTRACTS_BUDGET_MS - (performance.now() - started) - 10_000) / 1_000);
    if (budgetSeconds < 5) { timedOut = true; throw new Error("Insufficient analyzer budget"); }
    directory = await mkdtemp(path.join(tmpdir(), "tracehound-contracts-"));
    const out = path.join(directory, "contracts.json");
    reason = "error";
    await run(process.execPath, [path.join(root, "packages/analyzer/src/bin.ts"), "contracts", "--repo", repo,
      "--base", mergeBase, "--head", head, "--out", out, "--budget-s", String(budgetSeconds)]);
    reason = "invalid-output";
    if ((await stat(out)).size > 4 * 1024 * 1024) throw new Error("Oversized contracts report");
    const value: unknown = JSON.parse(await readFile(out, "utf8"));
    const typed = object(object(value).typed);
    const findings = readContractsReport(value, mergeBase, head);
    return { status: "ok", findings, ms: ms(), typed: typed.complete === true ? "complete" : `skipped-${typed.skipped}` as ContractsTyped };
  } catch (error) {
    const killed = error && typeof error === "object" && "killed" in error && error.killed;
    return { status: "failed", findings: [], ms: ms(), reason: timedOut || killed ? "timeout" : reason,
      ...(messages.length && { messages }) };
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
      new Promise<ContractsResult>(resolve => { timer = setTimeout(() => resolve(failed("timeout")), CONTRACTS_BUDGET_MS + CONTRACTS_KILL_GRACE_MS + 100); })]);
  } catch { result = failed("error"); }
  finally { if (timer) clearTimeout(timer); }
  for (const message of result.messages ?? []) log(message);
  if (result.typed?.startsWith("skipped-")) log(`contracts: typed check skipped (${result.typed.slice("skipped-".length)}); key checks only.`);
  if (result.status === "failed") log(`contracts: failed (${result.reason ?? "error"})`);
  return result;
}

export interface ContractDelivery { result: ContractsResult; repo: string; serverUrl: string }
function escapeContractText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\[\]`]/g, "\\$&").replace(/@/g, "@\u200b");
}
export function placeContracts(findings: Finding[], diff: string, bodyOnly = false) {
  const lines = new Map(parseDiff(diff).filter(file => file.newPath !== null).map(file => [file.newPath!, newSideLines(file)]));
  const inline: (Finding & { line: number; side: "RIGHT" })[] = [], body: Finding[] = [];
  for (const finding of findings) {
    if (!bodyOnly && inline.length < CONTRACT_LIMIT && finding.line !== null && lines.get(finding.path)?.has(finding.line)) {
      inline.push({ ...finding, line: finding.line, side: "RIGHT", body: `Contract: ${escapeContractText(finding.body)}` });
    } else body.push(finding);
  }
  return { inline, body: body.slice(0, CONTRACT_LIMIT), more: Math.max(0, body.length - CONTRACT_LIMIT) };
}

const encodeSegment = (part: string) => encodeURIComponent(part).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function contractsSection(findings: Finding[], more: number, delivery: ContractDelivery, head: string): string | undefined {
  if (!findings.length && !more) return undefined;
  const repoUrl = `${delivery.serverUrl.replace(/\/$/, "")}/${delivery.repo.split("/").map(encodeSegment).join("/")}`;
  const entries = findings.map(finding => {
    const url = `${repoUrl}/blob/${encodeSegment(head)}/${finding.path.split("/").map(encodeSegment).join("/")}${finding.line ? `#L${finding.line}` : ""}`;
    const reason = finding.body.split(/\s+Where:/)[0]!.replace(/\s+/g, " ").trim();
    return `- [${escapeContractText(`${finding.path}:${finding.line}`)}](${url}): ${escapeContractText(reason)}`;
  });
  return ["## Files you didn't edit that depend on this change", ...entries, ...(more ? [`and ${more} more`] : [])].join("\n");
}
