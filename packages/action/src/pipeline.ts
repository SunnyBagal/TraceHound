import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { agrees } from "../../../scripts/bench/agree-rule.ts";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import type { Finding, ReviewerInput } from "./action.ts";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");
export type Execute = (file: string, args: string[], options: {
  cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number;
}) => Promise<unknown>;

export interface PipelineCounts { pool: number; kept: number }
export type FindingSource = "diff" | "ctx" | "both";
export interface PipelineOutput {
  comments: Finding[];
  sources: FindingSource[];
  review: { model: string; chunkFailed: number };
  pipeline: PipelineCounts;
}

export class MissingHeadError extends Error {
  constructor() {
    super("TraceHound: pool-verify-v1 needs the pull request head checked out (actions/checkout with ref: the head sha); nothing posted.");
  }
}

export async function checkRepoHead(repo: string, head: string, exec: Execute = execute): Promise<void> {
  try {
    if (!repo) throw new MissingHeadError();
    await exec("git", ["-C", repo, "cat-file", "-e", `${head}^{commit}`], {
      cwd: root, env: cleanGitEnv(), maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    throw new MissingHeadError();
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
}
function model(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Missing model");
  return value;
}
function findings(value: unknown): Finding[] {
  if (!Array.isArray(value)) throw new Error("Missing findings");
  return value.map(item => {
    const f = object(item);
    if (typeof f.path !== "string" || !f.path.trim() || typeof f.body !== "string" || !f.body.trim()
      || !(f.line === null || (typeof f.line === "number" && Number.isSafeInteger(f.line) && f.line > 0))) {
      throw new Error("Invalid finding");
    }
    return { path: f.path, line: f.line, body: f.body };
  });
}

export function poolFindings(diff: Finding[], ctx: Finding[]): Finding[] {
  return [...diff, ...ctx.filter(finding => !diff.some(candidate => agrees(candidate, finding)))];
}

/** Sidecar metadata: never changes the bytes sent to the frozen verifier. */
export function poolSources(diff: Finding[], ctx: Finding[]): FindingSource[] {
  return [
    ...diff.map((finding): FindingSource => ctx.some(candidate => agrees(finding, candidate)) ? "both" : "diff"),
    ...ctx.filter(finding => !diff.some(candidate => agrees(candidate, finding))).map((): FindingSource => "ctx"),
  ];
}

class StageError extends Error {
  readonly stage: string;
  constructor(stage: string) { super(stage); this.stage = stage; }
}
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch { throw new StageError(name); }
}

/** CLI orchestration only; the analyzer owns candidate generation and verification decisions. */
export async function runPipeline(
  input: ReviewerInput, selectedModel: string, repo: string, head: string,
  log: (message: string) => void, exec: Execute = execute,
): Promise<PipelineOutput | null> {
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(tmpdir(), "tracehound-pool-"));
    const inputPath = path.join(directory, "input.json");
    const poolPath = path.join(directory, "pool.json");
    const verdictsPath = path.join(directory, "verdicts.json");
    const keptPath = path.join(directory, "kept.json");
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    const run = (command: string, args: string[]) => exec(process.execPath, [
      path.join(root, "packages/analyzer/src/bin.ts"), command, ...args,
      ...(selectedModel ? ["--model", selectedModel] : []),
    ], { cwd: root, env: process.env, maxBuffer: 4 * 1024 * 1024 });
    const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));
    const reviewer = (name: string, command: string, args: string[]) => stage(name, async () => {
      const file = path.join(directory!, `${command}.json`);
      await run(command, ["--pr", inputPath, "--out", file, ...args]);
      const output = object(await json(file));
      const review = object(output.review);
      const comments = findings(output.comments);
      if (count(review.chunkFailed) > 0) throw new Error("Failed chunks");
      return { comments, model: model(review.model) };
    });
    // Wait for both processes even on failure, so neither can outlive its temporary files.
    const results = await Promise.allSettled([
      reviewer("review-diff-v1", "review", []),
      reviewer("review-ctx-v1", "review-ctx", ["--repo", repo, "--head", head]),
    ]);
    const [diffResult, ctxResult] = results;
    if (diffResult!.status === "rejected") throw diffResult!.reason;
    if (ctxResult!.status === "rejected") throw ctxResult!.reason;
    const diff = diffResult!.value;
    const ctx = ctxResult!.value;
    const pool = poolFindings(diff.comments, ctx.comments);
    const sources = poolSources(diff.comments, ctx.comments);
    await stage("pool", () => writeFile(poolPath, JSON.stringify({
      pr_title: input.title, pr_number: input.number, comments: pool,
    }), { mode: 0o600 }));
    return await stage("verify-ctx-v1", async () => {
      await run("verify-ctx", ["--review", poolPath, "--pr", inputPath, "--head", head,
        "--repo", repo, "--out", verdictsPath, "--kept", keptPath]);
      const verdicts = object(await json(verdictsPath));
      const kept = object(await json(keptPath));
      const verified = findings(verdicts.comments);
      const comments = findings(kept.comments);
      const verify = object(verdicts.verify);
      const keptVerify = object(kept.verify);
      const verifyModel = model(verify.model);
      if (count(verify.findings) !== pool.length || count(verify.kept) !== comments.length
        || count(verify.dropped) !== pool.length - comments.length
        || count(verify.verifyFailed) > pool.length || verified.length !== pool.length
        || count(keptVerify.kept) !== comments.length || model(keptVerify.model) !== verifyModel) {
        throw new Error("Invalid verifier counts");
      }
      const key = (f: Finding) => JSON.stringify([f.path, f.line, f.body]);
      if (verified.some((f, i) => key(f) !== key(pool[i]!))) throw new Error("Invalid verdict findings");
      for (const item of verdicts.comments as unknown[]) {
        const verdict = object(item);
        if (!['VERIFIED', 'VERIFY_FAILED'].includes(String(verdict.status))
          || !(verdict.verdict === null || verdict.verdict === "keep" || verdict.verdict === "drop")) {
          throw new Error("Invalid verdict");
        }
      }
      const available = pool.map(key);
      const remainingSources = [...sources];
      const keptSources: FindingSource[] = [];
      for (const comment of comments) {
        const index = available.indexOf(key(comment));
        if (index < 0) throw new Error("Kept finding not in pool");
        available.splice(index, 1);
        keptSources.push(remainingSources.splice(index, 1)[0]!);
      }
      // Use the CLI's kept file directly, including its VERIFY_FAILED decisions.
      return { comments, sources: keptSources, review: { model: [...new Set([diff.model, ctx.model, verifyModel])].join(", "), chunkFailed: 0 },
        pipeline: { pool: pool.length, kept: comments.length } };
    });
  } catch (error) {
    const name = error instanceof StageError ? error.stage : "pool-verify-v1";
    log(`TraceHound: ${name} failed or returned invalid output; nothing posted.`);
    return null;
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
