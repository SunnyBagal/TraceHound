// The ReviewBench container entrypoint (AGENT_CONTRACT.md in review-bench/ReviewBench @ 12e9d1a). One
// container per pull request: read /work/pr/pr.json and the diff, run one of three pipelines on
// /work/repo at RB_HEAD, write RB_OUT. Settings (RB_CONFIG_*):
//   RB_CONFIG_PIPELINE  pool-verify-v1 (default; the Action's pipeline) | pool-raw | pool-raw-x2
//   RB_CONFIG_MODEL     model id for every stage (default: Super, as benchmarked)
//   RB_MODEL_BASE_URL   the registered model API URL; becomes NEBIUS_BASE_URL for the stages
// A pull request never fails because of the reviewer: any error, invalid output or the 25-minute
// limit writes a valid file with no findings and exits 0. Only a configuration error (unknown
// pipeline, missing key or contract variable) exits non-zero, before any model call, so a
// misconfigured run stops on its first pull request instead of scoring 657 empty reviews.
// Nothing here calls GitHub: posting, fix suggestions and graph history are the Action's
// (packages/action/src/action.ts, fix.ts, data.ts) and are not imported.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Finding, ReviewerInput } from "../../packages/action/src/action.ts";
import { checkRepoHead, poolFindings, runPipeline, type Execute } from "../../packages/action/src/pipeline.ts";
import { DEFAULT_BASE_URL } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { MAX_FINDINGS, toFindings, toInput, unionFindings } from "./adapter.ts";
import { outputProblem, type RbOutput, type RbPrJson } from "./format.ts";

export const PIPELINES = ["pool-verify-v1", "pool-raw", "pool-raw-x2"] as const;
export type PipelineName = (typeof PIPELINES)[number];
/** pool-verify-v1's benchmarked model for every stage (scripts/bench/run-test-set.ts REVIEW_MODEL). */
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
/** Under ReviewBench's default 30 minutes per pull request. */
export const WALL_LIMIT_MS = 25 * 60_000;
/** pool-raw-x2 stops a pass this long before the limit, so a finished first pass is still written. */
export const X2_MARGIN_MS = 60_000;

const ROOT = path.resolve(import.meta.dirname, "../..");
const BIN = path.join(ROOT, "packages/analyzer/src/bin.ts");
// The stages' response cache and spend ledger (packages/analyzer/src/review/cli.ts STATE_DIR).
const STATE_DIR = path.join(ROOT, ".tracehound");
const execFileAsync = promisify(execFile);

export class ConfigError extends Error {}

export interface Settings {
  pipeline: PipelineName;
  model: string;
  repo: string;
  diffPath: string;
  prJsonPath: string;
  out: string;
  nwo: string;
  prNumber: number;
  base: string;
  head: string;
  agent: string;
}

/** The contract's inputs and our RB_CONFIG_* labels; a ConfigError names what is wrong. */
export function readSettings(env: NodeJS.ProcessEnv): Settings {
  const value = (name: string) => env[name]?.trim() ?? "";
  const need = (name: string) => {
    if (!value(name)) throw new ConfigError(`${name} is not set`);
    return value(name);
  };
  const out = need("RB_OUT");
  const head = need("RB_HEAD");
  const prNumber = Number(need("RB_PR_NUMBER"));
  if (!/^\d+$/.test(value("RB_PR_NUMBER")) || !Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new ConfigError(`RB_PR_NUMBER must be a positive integer, got "${value("RB_PR_NUMBER")}"`);
  }
  if (!value("NEBIUS_API_KEY")) throw new ConfigError("NEBIUS_API_KEY is not set; declare it as a secret in the portal");
  const pipeline = value("RB_CONFIG_PIPELINE") || "pool-verify-v1";
  if (!(PIPELINES as readonly string[]).includes(pipeline)) {
    throw new ConfigError(`RB_CONFIG_PIPELINE must be one of ${PIPELINES.join(", ")}, got "${pipeline}"`);
  }
  if (pipeline === "pool-raw-x2" && value("TRACEHOUND_RB_IMAGE") !== "1") {
    throw new ConfigError("pool-raw-x2 clears the response cache between its passes, so it runs only in the image (TRACEHOUND_RB_IMAGE=1)");
  }
  return {
    pipeline: pipeline as PipelineName,
    model: value("RB_CONFIG_MODEL") || DEFAULT_MODEL,
    repo: value("RB_REPO") || "/work/repo",
    diffPath: value("RB_DIFF") || "/work/pr/diff.patch",
    prJsonPath: value("RB_PR_JSON") || "/work/pr/pr.json",
    out,
    nwo: value("RB_NWO"),
    prNumber,
    base: value("RB_BASE"),
    head,
    agent: value("RB_AGENT") || "tracehound",
  };
}

export interface RunContext {
  model: string;
  repo: string;
  head: string;
  env: NodeJS.ProcessEnv;
  /** Aborted at the wall-clock limit; every child process spawned through makeExec dies with it. */
  signal: AbortSignal;
  /** Epoch ms of the wall-clock limit. */
  deadline: number;
  now: () => number;
  log: (line: string) => void;
  makeExec: (signal: AbortSignal) => Execute;
  clearCache: () => void;
}

/** What the Action runs (packages/action/src/cli.ts → runAction): the head check, then runPipeline. */
async function poolVerify(input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  const exec = c.makeExec(c.signal);
  await checkRepoHead(c.repo, c.head, exec);
  const result = await runPipeline(input, c.model, c.repo, c.head, c.log, exec);
  if (!result) throw new Error("pool-verify-v1 failed (stage named above)");
  c.log(`pool ${result.pipeline.pool}, kept ${result.pipeline.kept}`);
  return result.comments;
}

/** A reviewer stage's output file, checked as runPipeline checks it: valid findings, no failed chunk. */
export function readReview(command: string, value: unknown): Finding[] {
  const output = value as { comments?: unknown; review?: { chunkFailed?: unknown; model?: unknown; chunks?: unknown } } | null;
  const comments = output?.comments;
  if (!Array.isArray(comments) || typeof output?.review?.model !== "string") throw new Error(`${command}: invalid output`);
  if (output.review.chunkFailed !== 0) {
    // The chunk's recorded failure (an HTTP status, an invalid reply), never finding text.
    const chunks = Array.isArray(output.review.chunks) ? output.review.chunks as { failure?: unknown }[] : [];
    const failure = chunks.find(chunk => typeof chunk?.failure === "string")?.failure;
    throw new Error(`${command}: failed chunks${failure ? ` (first: ${failure})` : ""}`);
  }
  return comments.map(item => {
    const f = item as Partial<Finding> | null;
    if (!f || typeof f.path !== "string" || !f.path.trim() || typeof f.body !== "string" || !f.body.trim()
      || !(f.line === null || (typeof f.line === "number" && Number.isSafeInteger(f.line) && f.line > 0))) {
      throw new Error(`${command}: invalid finding`);
    }
    return { path: f.path, line: f.line, body: f.body };
  });
}

/**
 * pool-verify-v1 without its last stage: the same two reviewer commands with the same arguments as
 * runPipeline, both awaited even on failure, then poolFindings. No verify-ctx call.
 */
export async function poolRaw(input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  const exec = c.makeExec(c.signal);
  await checkRepoHead(c.repo, c.head, exec);
  const directory = await mkdtemp(path.join(tmpdir(), "tracehound-rb-"));
  try {
    const inputPath = path.join(directory, "input.json");
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    const reviewer = async (command: string, args: string[]) => {
      const file = path.join(directory, `${command}.json`);
      await exec(process.execPath, [BIN, command, "--pr", inputPath, "--out", file, ...args, "--model", c.model],
        { cwd: ROOT, env: c.env, maxBuffer: 4 * 1024 * 1024 });
      return readReview(command, JSON.parse(await readFile(file, "utf8")));
    };
    const [diff, ctx] = await Promise.allSettled([
      reviewer("review", []),
      reviewer("review-ctx", ["--repo", c.repo, "--head", c.head]),
    ]);
    if (diff!.status === "rejected") throw diff!.reason;
    if (ctx!.status === "rejected") throw ctx!.reason;
    const pool = poolFindings(diff!.value, ctx!.value);
    c.log(`pool ${pool.length} (review-diff-v1 ${diff!.value.length}, review-ctx-v1 ${ctx!.value.length})`);
    return pool;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * pool-raw twice with the same prompts, then the union (unionFindings). The response cache is
 * cleared before the second pass, or it would replay the first. Each pass is all or nothing like
 * pool-raw; the union is over the passes that finished, and a pass still running X2_MARGIN_MS
 * before the limit is stopped.
 */
export async function poolRawX2(input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  const passes: Finding[][] = [];
  for (const pass of [1, 2]) {
    if (pass === 2) c.clearCache();
    const left = c.deadline - X2_MARGIN_MS - c.now();
    if (left <= 0) {
      c.log(`pass ${pass}: skipped, no time left`);
      continue;
    }
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), left);
    const signal = AbortSignal.any([c.signal, stop.signal]);
    try {
      passes.push(await poolRaw(input, { ...c, signal }));
      c.log(`pass ${pass}: ${passes.at(-1)!.length} findings`);
    } catch (error) {
      c.log(`pass ${pass}: failed (${reason(error, c.env)})`);
    } finally {
      clearTimeout(timer);
    }
  }
  if (!passes.length) throw new Error("pool-raw-x2: no pass finished");
  return unionFindings(passes);
}

export function runSelected(pipeline: PipelineName, input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  if (pipeline === "pool-verify-v1") return poolVerify(input, c);
  if (pipeline === "pool-raw") return poolRaw(input, c);
  return poolRawX2(input, c);
}

/** The first line of an error, cut short, with the API key masked: logs never carry the key. */
export function reason(error: unknown, env: NodeJS.ProcessEnv): string {
  const text = (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 300);
  return mask(text, env);
}
function mask(text: string, env: NodeJS.ProcessEnv): string {
  const key = env.NEBIUS_API_KEY?.trim();
  return key ? text.replaceAll(key, "***") : text;
}

/**
 * execFile that dies with `signal`, then echoes the last lines of the child's stderr (the stages
 * print counts there, never finding text) so a run's log shows what each stage did.
 */
export function abortableExec(signal: AbortSignal, log: (line: string) => void, env: NodeJS.ProcessEnv): Execute {
  const echo = (stderr: unknown) => {
    const lines = String(stderr ?? "").split("\n").filter(line => line.trim());
    for (const line of lines.slice(-20)) log(`  | ${mask(line.slice(0, 500), env)}`);
  };
  return async (file, args, options) => {
    try {
      const result = await execFileAsync(file, args, { ...options, signal, killSignal: "SIGKILL" });
      echo(result.stderr);
      return result;
    } catch (error) {
      echo((error as { stderr?: unknown }).stderr);
      throw error;
    }
  };
}

export interface MainDeps {
  run?: typeof runSelected;
  limitMs?: number;
  now?: () => number;
  /** Diagnostics, to stderr. */
  log?: (line: string) => void;
  /** The settings line, to stdout: the contract asks for the applied labels in the output. */
  print?: (line: string) => void;
  makeExec?: (signal: AbortSignal) => Execute;
  clearCache?: () => void;
  /** Ledger total in USD, read before and after for this pull request's estimated cost. */
  spentUSD?: () => number;
}

export async function main(env: NodeJS.ProcessEnv = process.env, deps: MainDeps = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  const started = now();
  const log = deps.log ?? ((line: string) => console.error(`tracehound-reviewbench: ${line}`));
  const print = deps.print ?? ((line: string) => console.log(`tracehound-reviewbench: ${line}`));
  const limitMs = deps.limitMs ?? WALL_LIMIT_MS;
  const spentUSD = deps.spentUSD ?? (() => new SpendLedger(path.join(STATE_DIR, "spend.jsonl")).totalUSD());
  const spent = () => { try { return spentUSD(); } catch { return Number.NaN; } };

  let s: Settings;
  try {
    s = readSettings(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    log(`configuration error: ${mask(error.message, env)}`);
    return 2;
  }
  // The stages read NEBIUS_BASE_URL (packages/analyzer/src/llm/client.ts) from the env they inherit.
  if (env.RB_MODEL_BASE_URL?.trim()) env.NEBIUS_BASE_URL = env.RB_MODEL_BASE_URL.trim();
  print(`pipeline=${s.pipeline} model=${s.model} base_url=${env.NEBIUS_BASE_URL || DEFAULT_BASE_URL} `
    + `limit_min=${limitMs / 60_000} max_findings=${MAX_FINDINGS} attempt=${env.RB_ATTEMPT ?? "1"}`);

  const before = spent();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let findings: Finding[] = [];
  let status = "ok";
  try {
    const pr = JSON.parse(readFileSync(s.prJsonPath, "utf8")) as RbPrJson;
    const input = toInput(pr ?? {}, readFileSync(s.diffPath, "utf8"), s.prNumber, s.nwo);
    if (!input.diff.trim()) {
      status = "empty diff";
    } else {
      const deadline = started + limitMs;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`wall-clock limit of ${limitMs / 60_000} min reached`)), Math.max(0, deadline - now()));
      });
      findings = await Promise.race([(deps.run ?? runSelected)(s.pipeline, input, {
        model: s.model, repo: s.repo, head: s.head, env, signal: controller.signal, deadline, now, log,
        makeExec: deps.makeExec ?? (signal => abortableExec(signal, log, env)),
        clearCache: deps.clearCache ?? (() => rmSync(path.join(STATE_DIR, "cache"), { recursive: true, force: true })),
      }), timeout]);
    }
  } catch (error) {
    status = `failed: ${reason(error, env)}`;
    findings = [];
  } finally {
    clearTimeout(timer);
    controller.abort(); // stops any stage still running after a failure or the limit
  }

  const converted = toFindings(findings, s.agent);
  const expect = { head: s.head, prNumber: s.prNumber, agent: s.agent };
  let output: RbOutput = {
    pr: { repo: s.nwo ? `https://github.com/${s.nwo}` : "", pr_number: s.prNumber, base: s.base, head: s.head },
    agent: s.agent,
    findings: converted.findings,
  };
  const problem = outputProblem(output, expect);
  if (problem) {
    status = `output invalid (${problem}), written with no findings`;
    output = { ...output, findings: [] };
  }
  try {
    mkdirSync(path.dirname(s.out), { recursive: true });
    writeFileSync(s.out, `${JSON.stringify(output, null, 2)}\n`);
    const written = outputProblem(JSON.parse(readFileSync(s.out, "utf8")), expect);
    if (written) throw new Error(written);
  } catch (error) {
    log(`could not write a valid ${s.out}: ${reason(error, env)}`);
    return 1;
  }
  const cost = spent() - before;
  log(`status=${status} findings=${output.findings.length} dropped_no_line=${converted.dropped.noLine} `
    + `dropped_empty=${converted.dropped.empty} capped=${converted.capped} `
    + `cost_usd=${Number.isFinite(cost) ? cost.toFixed(4) : "unknown"} wall_s=${Math.round((now() - started) / 1000)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exit at once: a killed stage must not keep the container alive past the findings file.
  process.exit(await main());
}
