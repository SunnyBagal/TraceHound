// The ReviewBench container entrypoint (AGENT_CONTRACT.md in review-bench/ReviewBench @ 12e9d1a). One
// container per pull request: read /work/pr/pr.json and the diff, run one of four pipelines on
// /work/repo at RB_HEAD, write RB_OUT. Settings (RB_CONFIG_*):
//   RB_CONFIG_PIPELINE  pool-verify-v1 (default; the Action's pipeline) | pool-raw | pool-raw-x2 | pool-raw-missed
//                       | recall-v3 (decision 070: ReviewBench only; its own conversion, ranges kept, up to 60)
//   RB_CONFIG_MODEL     model id for every stage (default: Super, as benchmarked)
//   RB_MODEL_BASE_URL   the registered model API URL; becomes NEBIUS_BASE_URL for the stages (the
//                       client sends 3.5 Super VL to us-north1 whatever Token Factory region it names)
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
import { agrees } from "../bench/agree-rule.ts";
import { baseUrlFor, DEFAULT_BASE_URL } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { MAX_FINDINGS, toFindings, toInput, toRecallFindings, unionFindings, type RecallFindingIn } from "./adapter.ts";
import { MAX_RECALL_FINDINGS } from "../../packages/analyzer/src/review/recall/reduce.ts";
import { outputProblem, type RbOutput, type RbPrJson } from "./format.ts";

export const PIPELINES = ["pool-verify-v1", "pool-raw", "pool-raw-x2", "pool-raw-missed", "recall-v3"] as const;
/** The pipelines before decision 070, named in the configuration error as they were; recall-v3 is added after them. */
const LISTED_PIPELINES = PIPELINES.filter(p => p !== "recall-v3");
export type PipelineName = (typeof PIPELINES)[number];
/** pool-verify-v1's benchmarked model for every stage (scripts/bench/run-test-set.ts REVIEW_MODEL). */
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
/** Under ReviewBench's default 30 minutes per pull request. */
export const WALL_LIMIT_MS = 25 * 60_000;
/** pool-raw-x2 stops a pass, and pool-raw-missed its missed-issue pass, this long before the limit, so a finished pool is still written. */
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
    throw new ConfigError(`RB_CONFIG_PIPELINE must be one of ${LISTED_PIPELINES.join(", ")}, got "${pipeline}" (recall-v3 is also accepted)`);
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
  /** Counts all validated reviewer chunks, including a pass whose chunks all failed. */
  reportChunks?: (failed: number, chunks: number) => void;
}

/** What the Action runs (packages/action/src/cli.ts → runAction): the head check, then runPipeline. */
async function poolVerify(input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  const exec = c.makeExec(c.signal);
  await checkRepoHead(c.repo, c.head, exec);
  const result = await runPipeline(input, c.model, c.repo, c.head, c.log, exec);
  if (!result) throw new Error("pool-verify-v1 failed (stage named above)");
  if (result.pipeline.chunkFailed) c.reportChunks?.(result.review.chunkFailed, result.pipeline.reviewerChunks!);
  c.log(`pool ${result.pipeline.pool}, kept ${result.pipeline.kept}`);
  return result.comments;
}

/** A reviewer stage's successful findings and validated chunk counts, as in runPipeline. */
export function readReview(command: string, value: unknown): { comments: Finding[]; failed: number; chunks: number; failure?: string } {
  const output = value as { comments?: unknown; review?: { chunkFailed?: unknown; model?: unknown; chunks?: unknown } } | null;
  const comments = output?.comments;
  const failed = output?.review?.chunkFailed;
  if (!Array.isArray(comments) || typeof output?.review?.model !== "string" || !output.review.model.trim()
    || typeof failed !== "number" || !Number.isSafeInteger(failed) || failed < 0
    || !Array.isArray(output.review.chunks)) throw new Error(`${command}: invalid output`);
  const chunks = output.review.chunks as { status?: unknown; failure?: unknown }[];
  if (chunks.some(chunk => !chunk || !["OK", "CHUNK_FAILED"].includes(String(chunk.status)))
    || chunks.filter(chunk => chunk.status === "CHUNK_FAILED").length !== failed
    || (failed > 0 && failed === chunks.length && comments.length > 0)) throw new Error(`${command}: invalid chunks`);
  // The chunk's recorded failure (an HTTP status, an invalid reply), never finding text.
  const failure = chunks.find(chunk => chunk.status === "CHUNK_FAILED" && typeof chunk.failure === "string")?.failure;
  const findings = comments.map(item => {
    const f = item as Partial<Finding> | null;
    if (!f || typeof f.path !== "string" || !f.path.trim() || typeof f.body !== "string" || !f.body.trim()
      || !(f.line === null || (typeof f.line === "number" && Number.isSafeInteger(f.line) && f.line > 0))) {
      throw new Error(`${command}: invalid finding`);
    }
    return { path: f.path, line: f.line, body: f.body };
  });
  return { comments: findings, failed, chunks: chunks.length, ...(typeof failure === "string" && { failure }) };
}

function reportPass(command: string, reviews: ReturnType<typeof readReview>[], c: RunContext): void {
  const failed = reviews.reduce((sum, review) => sum + review.failed, 0);
  const chunks = reviews.reduce((sum, review) => sum + review.chunks, 0);
  c.reportChunks?.(failed, chunks);
  if (failed > 0 && failed === chunks) {
    const failure = reviews.find(review => review.failure)?.failure;
    throw new Error(`${command}: failed chunks${failure ? ` (first: ${failure})` : ""}`);
  }
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
    reportPass("pool-raw", [diff!.value, ctx!.value], c);
    const pool = poolFindings(diff!.value.comments, ctx!.value.comments);
    c.log(`pool ${pool.length} (review-diff-v1 ${diff!.value.comments.length}, review-ctx-v1 ${ctx!.value.comments.length})`);
    return pool;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * pool-raw twice with the same prompts, then the union (unionFindings). The response cache is
 * cleared before the second pass, or it would replay the first. Each pass keeps successful chunks
 * like pool-raw; the union is over the passes that finished, and a pass still running X2_MARGIN_MS
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

/**
 * pool-raw, then one missed-issue pass (review-missed-v1, P008 amendment 2) on the same model, shown
 * the pool. The result is the pool, then each missed finding that agrees (decision 058's rule) with
 * no pool finding, so MAX_FINDINGS cuts missed findings first. The pass gets the time left minus
 * X2_MARGIN_MS; if it fails or runs out of time the result is the pool alone: it never fails a pull
 * request that pool-raw would have passed.
 */
export async function poolRawMissed(input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  const pool = await poolRaw(input, c);
  const left = c.deadline - X2_MARGIN_MS - c.now();
  if (left <= 0) {
    c.log("missed: failed (no time left)");
    return pool;
  }
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), left);
  const exec = c.makeExec(AbortSignal.any([c.signal, stop.signal]));
  const directory = await mkdtemp(path.join(tmpdir(), "tracehound-rb-missed-"));
  try {
    const inputPath = path.join(directory, "input.json");
    const poolPath = path.join(directory, "pool.json");
    const out = path.join(directory, "review-missed.json");
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    await writeFile(poolPath, JSON.stringify({ comments: pool }), { mode: 0o600 });
    await exec(process.execPath, [BIN, "review-missed", "--pr", inputPath, "--findings", poolPath, "--repo", c.repo, "--head", c.head,
      "--out", out, "--model", c.model], { cwd: ROOT, env: c.env, maxBuffer: 4 * 1024 * 1024 });
    const missed = readReview("review-missed", JSON.parse(await readFile(out, "utf8")));
    reportPass("review-missed", [missed], c);
    const added = missed.comments.filter(finding => !pool.some(p => agrees(p, finding)));
    c.log(`pool ${pool.length}, missed ${missed.comments.length}, new ${added.length}`);
    return [...pool, ...added];
  } catch (error) {
    c.log(`missed: failed (${stop.signal.aborted ? `timed out after ${Math.round(left / 1000)} s` : reason(error, c.env)})`);
    return pool;
  } finally {
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * recall-v3 (decision 070): one `tracehound review-recall` run, which keeps its own wall-clock guard
 * (20 min, under WALL_LIMIT_MS) and per-pull-request budget, and always writes its findings so far.
 * Its findings keep their ranges (start_line, end_line) for toRecallFindings. Lens calls that failed
 * are reported like failed chunks; if every lens call failed and nothing was found, the pull request
 * is reported failed (it is written with no findings either way).
 */
export async function recallV3(input: ReviewerInput, c: RunContext): Promise<RecallFindingIn[]> {
  const exec = c.makeExec(c.signal);
  await checkRepoHead(c.repo, c.head, exec);
  const directory = await mkdtemp(path.join(tmpdir(), "tracehound-rb-recall-"));
  try {
    const inputPath = path.join(directory, "input.json");
    const out = path.join(directory, "review-recall.json");
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    await exec(process.execPath, [BIN, "review-recall", "--pr", inputPath, "--repo", c.repo, "--head", c.head, "--out", out, "--model", c.model],
      { cwd: ROOT, env: c.env, maxBuffer: 4 * 1024 * 1024 });
    return readRecall(JSON.parse(await readFile(out, "utf8")), c);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** review-recall's output → findings with ranges; reports failed lens calls. Malformed items are left to toRecallFindings' drops. */
export function readRecall(value: unknown, c: Pick<RunContext, "log" | "reportChunks">): RecallFindingIn[] {
  const output = value as { comments?: unknown; review?: { calls?: unknown; missed?: { status?: unknown }; errors?: unknown } } | null;
  if (!Array.isArray(output?.comments) || !Array.isArray(output?.review?.calls)) throw new Error("review-recall: invalid output");
  const calls = output.review.calls as { status?: unknown; failure?: unknown }[];
  const failed = calls.filter(call => call?.status !== "OK");
  c.reportChunks?.(failed.length, calls.length);
  const comments = (output.comments as Partial<RecallFindingIn>[]).filter(f => f && typeof f === "object").map(f => ({
    path: typeof f.path === "string" ? f.path : "",
    line: typeof f.line === "number" ? f.line : null,
    start_line: typeof f.start_line === "number" ? f.start_line : null,
    end_line: typeof f.end_line === "number" ? f.end_line : null,
    body: typeof f.body === "string" ? f.body : "",
  }));
  c.log(`recall findings ${comments.length}, lens calls ${calls.length - failed.length}/${calls.length} ok, missed ${String(output.review.missed?.status)}`);
  if (calls.length > 0 && failed.length === calls.length && comments.length === 0) {
    const first = failed.find(call => typeof call.failure === "string")?.failure;
    throw new Error(`recall-v3: every lens call failed${typeof first === "string" ? ` (first: ${first.slice(0, 200)})` : ""}`);
  }
  return comments;
}

export function runSelected(pipeline: PipelineName, input: ReviewerInput, c: RunContext): Promise<Finding[]> {
  if (pipeline === "recall-v3") return recallV3(input, c) as Promise<Finding[]>;
  if (pipeline === "pool-verify-v1") return poolVerify(input, c);
  if (pipeline === "pool-raw") return poolRaw(input, c);
  if (pipeline === "pool-raw-missed") return poolRawMissed(input, c);
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
  // The stages read NEBIUS_BASE_URL (packages/analyzer/src/llm/client.ts) from the env they inherit;
  // the client then routes each model to its region (baseUrlFor), so the line shows that URL.
  if (env.RB_MODEL_BASE_URL?.trim()) env.NEBIUS_BASE_URL = env.RB_MODEL_BASE_URL.trim();
  print(`pipeline=${s.pipeline} model=${s.model} base_url=${baseUrlFor(s.model, env.NEBIUS_BASE_URL || DEFAULT_BASE_URL)} `
    + `limit_min=${limitMs / 60_000} max_findings=${s.pipeline === "recall-v3" ? MAX_RECALL_FINDINGS : MAX_FINDINGS} attempt=${env.RB_ATTEMPT ?? "1"}`);

  const before = spent();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let findings: Finding[] = [];
  let diff = "";
  let status = "ok";
  let failedChunks = 0;
  let reviewerChunks = 0;
  try {
    const pr = JSON.parse(readFileSync(s.prJsonPath, "utf8")) as RbPrJson;
    diff = readFileSync(s.diffPath, "utf8");
    const input = toInput(pr ?? {}, diff, s.prNumber, s.nwo);
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
        reportChunks: (failed, chunks) => { failedChunks += failed; reviewerChunks += chunks; },
      }), timeout]);
    }
  } catch (error) {
    status = `failed: ${reason(error, env)}`;
    findings = [];
  } finally {
    clearTimeout(timer);
    controller.abort(); // stops any stage still running after a failure or the limit
  }

  const converted = s.pipeline === "recall-v3" ? toRecallFindings(findings as RecallFindingIn[], s.agent, diff) : toFindings(findings, s.agent);
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
  if (status === "ok" && failedChunks > 0) status += ` partial=${failedChunks}/${reviewerChunks}`;
  log(`status=${status} findings=${output.findings.length} dropped_no_line=${converted.dropped.noLine} `
    + `dropped_empty=${converted.dropped.empty} capped=${converted.capped} `
    + `cost_usd=${Number.isFinite(cost) ? cost.toFixed(4) : "unknown"} wall_s=${Math.round((now() - started) / 1000)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exit at once: a killed stage must not keep the container alive past the findings file.
  process.exit(await main());
}
