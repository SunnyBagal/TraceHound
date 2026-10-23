import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding, ReviewerInput } from "../../packages/action/src/action.ts";
import type { Execute } from "../../packages/action/src/pipeline.ts";
import { REVIEW_MODEL } from "../bench/run-test-set.ts";
import { MAX_FINDINGS, repoPath, toFindings, toInput, unionFindings } from "./adapter.ts";
import {
  abortableExec, DEFAULT_MODEL, main, poolRaw, poolRawMissed, poolRawX2, readReview, readSettings, runSelected,
  X2_MARGIN_MS, type MainDeps, type RunContext,
} from "./entry.ts";
import { outputProblem } from "./format.ts";

afterEach(() => vi.unstubAllEnvs());
const fixtures = path.join(import.meta.dirname, "fixtures");
const HEAD = "2222222222222222222222222222222222222222";
const BASE = "1111111111111111111111111111111111111111";
const KEY = "fake-key-not-a-secret";
const finding = (line: number | null, body = `finding at ${line}`, file = "src/page.ts"): Finding => ({ path: file, line, body });

function contract(overrides: Record<string, string | undefined> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "rb-entry-"));
  const env: NodeJS.ProcessEnv = {
    RB_NWO: "example-org/widgets", RB_PR_NUMBER: "101", RB_BASE: BASE, RB_HEAD: HEAD, RB_AGENT: "tracehound-test",
    RB_REPO: "/fake/repo", RB_DIFF: path.join(fixtures, "diff.patch"), RB_PR_JSON: path.join(fixtures, "pr.json"),
    RB_OUT: path.join(dir, "out", "findings.json"), NEBIUS_API_KEY: KEY, ...overrides,
  };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return { env, dir, out: env.RB_OUT!, read: () => JSON.parse(readFileSync(env.RB_OUT!, "utf8")) };
}

function deps(run: MainDeps["run"]): MainDeps & { lines: string[]; printed: string[] } {
  const lines: string[] = [];
  const printed: string[] = [];
  return { run, lines, printed, log: l => lines.push(l), print: l => printed.push(l), spentUSD: () => 0, clearCache: vi.fn() };
}

/** The checks scripts/try-agent.sh runs on a findings file, as jq does them. */
function tryAgentProblem(file: unknown, head: string, pr: number): string {
  const f = file as { pr: { head: string; pr_number: unknown }; findings: unknown };
  if (f.pr.head !== head) return "pr.head";
  if (Number(f.pr.pr_number) !== pr) return "pr_number";
  if (!Array.isArray(f.findings)) return "findings";
  const bad = f.findings.filter((x: Record<string, unknown>) => typeof x.file !== "string" || typeof x.start_line !== "number"
    || typeof x.end_line !== "number" || typeof x.message !== "string" || x.file.startsWith("./") || x.file.startsWith("/"));
  return bad.length ? "bad findings" : "";
}

describe("settings", () => {
  it("maps the contract's variables and defaults to pool-verify-v1 on the benchmarked model", () => {
    const { env } = contract({ RB_REPO: undefined, RB_DIFF: undefined, RB_PR_JSON: undefined });
    expect(readSettings(env)).toEqual({
      pipeline: "pool-verify-v1", model: REVIEW_MODEL, repo: "/work/repo", diffPath: "/work/pr/diff.patch",
      prJsonPath: "/work/pr/pr.json", out: env.RB_OUT, nwo: "example-org/widgets", prNumber: 101, base: BASE, head: HEAD,
      agent: "tracehound-test",
    });
    expect(DEFAULT_MODEL).toBe(REVIEW_MODEL);
  });

  it.each(["pool-verify-v1", "pool-raw", "pool-raw-missed"])("accepts %s and a model label", pipeline => {
    const { env } = contract({ RB_CONFIG_PIPELINE: pipeline, RB_CONFIG_MODEL: "some/model" });
    expect(readSettings(env)).toMatchObject({ pipeline, model: "some/model" });
  });

  it("accepts pool-raw-x2 only in the image, where clearing the cache is safe", () => {
    expect(() => readSettings(contract({ RB_CONFIG_PIPELINE: "pool-raw-x2" }).env)).toThrow(/only in the image/);
    expect(readSettings(contract({ RB_CONFIG_PIPELINE: "pool-raw-x2", TRACEHOUND_RB_IMAGE: "1" }).env).pipeline).toBe("pool-raw-x2");
  });

  it.each([
    ["unknown pipeline", { RB_CONFIG_PIPELINE: "pool-verify-v2" }, /RB_CONFIG_PIPELINE must be one of pool-verify-v1, pool-raw, pool-raw-x2, pool-raw-missed, got "pool-verify-v2"/],
    ["review-diff-v1 is not offered", { RB_CONFIG_PIPELINE: "review-diff-v1" }, /RB_CONFIG_PIPELINE/],
    ["missing key", { NEBIUS_API_KEY: undefined }, /NEBIUS_API_KEY is not set/],
    ["missing RB_OUT", { RB_OUT: undefined }, /RB_OUT is not set/],
    ["missing RB_HEAD", { RB_HEAD: undefined }, /RB_HEAD is not set/],
    ["bad PR number", { RB_PR_NUMBER: "12a" }, /RB_PR_NUMBER must be a positive integer/],
  ])("exits non-zero before any work on a configuration error: %s", async (_name, overrides, message) => {
    const c = contract(overrides);
    const run = vi.fn();
    const d = deps(run);
    expect(await main(c.env, d)).toBe(2);
    expect(run).not.toHaveBeenCalled();
    expect(d.lines.join("\n")).toMatch(message);
    expect(d.printed).toEqual([]);
    expect(() => readFileSync(path.join(c.dir, "out", "findings.json"))).toThrow();
  });
});

describe("input and output", () => {
  it("builds ReviewerInput from pr.json, the diff and RB_PR_NUMBER, and writes the contract's file", async () => {
    const c = contract({ RB_CONFIG_PIPELINE: "pool-raw", RB_MODEL_BASE_URL: "https://models.example.invalid/v1" });
    let seen: ReviewerInput | undefined;
    let context: RunContext | undefined;
    const d = deps(async (pipeline, input, ctx) => {
      expect(pipeline).toBe("pool-raw");
      seen = input;
      context = ctx;
      return [finding(5, "  Negative sizes become 0 but the caller expects a 400.  "), finding(6, "Second", "./src/page.ts")];
    });
    expect(await main(c.env, d)).toBe(0);
    expect(seen).toEqual({
      title: "Clamp the page size", body: "Hand-made fixture, not ReviewBench data.", number: 101,
      diff: readFileSync(path.join(fixtures, "diff.patch"), "utf8"),
    });
    expect(context).toMatchObject({ model: DEFAULT_MODEL, repo: "/fake/repo", head: HEAD });
    expect(c.env.NEBIUS_BASE_URL).toBe("https://models.example.invalid/v1");
    expect(d.printed).toEqual([expect.stringMatching(
      /^pipeline=pool-raw model=nvidia\/nemotron-3-super-120b-a12b base_url=https:\/\/models\.example\.invalid\/v1 limit_min=25 max_findings=40/)]);
    const file = c.read();
    expect(file).toEqual({
      pr: { repo: "https://github.com/example-org/widgets", pr_number: 101, base: BASE, head: HEAD },
      agent: "tracehound-test",
      findings: [
        { file: "src/page.ts", start_line: 5, end_line: 5, message: "Negative sizes become 0 but the caller expects a 400.", producer: "tracehound-test" },
        { file: "src/page.ts", start_line: 6, end_line: 6, message: "Second", producer: "tracehound-test" },
      ],
    });
    expect(outputProblem(file, { head: HEAD, prNumber: 101, agent: "tracehound-test" })).toBeNull();
    expect(tryAgentProblem(file, HEAD, 101)).toBe("");
    expect(d.lines.at(-1)).toMatch(/^status=ok findings=2 dropped_no_line=0 dropped_empty=0 capped=0 cost_usd=0\.0000 wall_s=\d+$/);
  });

  it("prints the base URL the client resolves for the configured model", async () => {
    const central = "https://api.tokenfactory.us-central1.nebius.com/v1";
    const north = "https://api.tokenfactory.us-north1.nebius.com/v1";
    const cases: [string | undefined, string | undefined, string][] = [
      ["nvidia/Nemotron-3.5-Super-VL", central, north],
      ["nvidia/Nemotron-3.5-Super-VL", undefined, north],
      ["nvidia/nemotron-3-super-120b-a12b", central, central],
      [undefined, undefined, central],
      ["nvidia/Nemotron-3.5-Super-VL", "https://models.example.invalid/v1", "https://models.example.invalid/v1"],
    ];
    for (const [model, baseUrl, printed] of cases) {
      const c = contract({ RB_CONFIG_PIPELINE: "pool-raw", RB_CONFIG_MODEL: model, RB_MODEL_BASE_URL: baseUrl });
      const d = deps(async () => []);
      expect(await main(c.env, d)).toBe(0);
      expect(d.printed).toEqual([expect.stringContaining(` base_url=${printed} limit_min=`)]);
      // The stages still get the registered URL; routing happens in the client.
      expect(c.env.NEBIUS_BASE_URL).toBe(baseUrl);
    }
  });

  it("stands in the PR's address for an empty title and an empty string for a null body", () => {
    expect(toInput({ title: " ", body: null }, "d", 7, "o/r")).toEqual({ title: "o/r#7", body: "", number: 7, diff: "d" });
  });

  it("drops and counts findings without a line, and caps at 40 in pipeline order", async () => {
    const c = contract();
    const many = Array.from({ length: 45 }, (_, i) => finding(i + 1));
    const d = deps(async () => [finding(null), ...many.slice(0, 20), finding(null), ...many.slice(20)]);
    expect(await main(c.env, d)).toBe(0);
    const file = c.read();
    expect(file.findings).toHaveLength(MAX_FINDINGS);
    expect(file.findings.map((f: { start_line: number }) => f.start_line)).toEqual(many.slice(0, 40).map(f => f.line));
    expect(d.lines.at(-1)).toMatch(/findings=40 dropped_no_line=2 dropped_empty=0 capped=5 /);
  });

  it("converts findings: one line is start and end, paths lose ./ and /, empty ones are counted", () => {
    expect(toFindings([finding(3, "x", "/a.ts"), finding(4, " ", "a.ts"), finding(0), finding(9, "y", "./b/c.ts")], "p")).toEqual({
      findings: [
        { file: "a.ts", start_line: 3, end_line: 3, message: "x", producer: "p" },
        { file: "b/c.ts", start_line: 9, end_line: 9, message: "y", producer: "p" },
      ],
      dropped: { noLine: 1, empty: 1 }, capped: 0,
    });
    expect(repoPath(" .//x.ts")).toBe("x.ts");
  });

  it("rejects what the contract or try-agent.sh would fail", () => {
    const ok = { pr: { head: HEAD, pr_number: 1 }, agent: "a", findings: [{ file: "x", start_line: 2, end_line: 3, message: "m", producer: "a" }] };
    const expect_ = { head: HEAD, prNumber: 1, agent: "a" };
    expect(outputProblem(ok, expect_)).toBeNull();
    expect(outputProblem({ ...ok, pr: { head: "abc", pr_number: 1 } }, expect_)).toMatch(/pr.head/);
    expect(outputProblem({ ...ok, pr: { head: HEAD, pr_number: "1" } }, expect_)).toMatch(/pr_number/);
    expect(outputProblem({ ...ok, findings: [{ ...ok.findings[0], file: "./x" }] }, expect_)).toMatch(/bad file/);
    expect(outputProblem({ ...ok, findings: [{ ...ok.findings[0], end_line: 1 }] }, expect_)).toMatch(/line range/);
    expect(outputProblem({ ...ok, findings: [{ ...ok.findings[0], producer: "b" }] }, expect_)).toMatch(/producer/);
  });
});

describe("never fails a pull request", () => {
  it("writes no findings and exits 0 when the pipeline throws, with the key masked in the log", async () => {
    const c = contract();
    const d = deps(async () => { throw new Error(`HTTP 401 for key ${KEY}\nsecond line`); });
    expect(await main(c.env, d)).toBe(0);
    expect(c.read()).toEqual({
      pr: { repo: "https://github.com/example-org/widgets", pr_number: 101, base: BASE, head: HEAD },
      agent: "tracehound-test", findings: [],
    });
    expect(d.lines.at(-1)).toMatch(/^status=failed: HTTP 401 for key \*\*\* findings=0 /);
    expect(d.lines.join("\n")).not.toContain(KEY);
  });

  it("stops at the wall-clock limit, aborts the stages and writes no findings", async () => {
    const c = contract();
    let signal: AbortSignal | undefined;
    const d = deps((_p, _i, ctx) => {
      signal = ctx.signal;
      return new Promise(() => {});
    });
    expect(await main(c.env, { ...d, limitMs: 30 })).toBe(0);
    expect(signal?.aborted).toBe(true);
    expect(c.read().findings).toEqual([]);
    expect(d.lines.at(-1)).toMatch(/status=failed: wall-clock limit of 0\.0005 min reached/);
  });

  it("writes no findings when pr.json is unreadable, and calls nothing on an empty diff", async () => {
    const missing = contract({ RB_PR_JSON: "/nonexistent/pr.json" });
    const run = vi.fn(async () => [finding(1)]);
    expect(await main(missing.env, deps(run))).toBe(0);
    expect(missing.read().findings).toEqual([]);
    expect(run).not.toHaveBeenCalled();

    const empty = contract();
    writeFileSync(path.join(empty.dir, "empty.patch"), "\n");
    const d = deps(run);
    expect(await main({ ...empty.env, RB_DIFF: path.join(empty.dir, "empty.patch") }, d)).toBe(0);
    expect(empty.read().findings).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    expect(d.lines.at(-1)).toMatch(/status=empty diff/);
  });
});

/** Fake stages: git, review, review-ctx, review-missed and verify-ctx write files the way the CLIs do. */
function fakeStages(outputs: {
  review: Finding[]; "review-ctx": Finding[]; keep?: (f: Finding) => boolean;
  /** review-missed's own findings; the pool file it was given is kept in `missedPool`. */
  "review-missed"?: Finding[];
  /** One CHUNK_FAILED chunk, plus an OK chunk unless all is set. */
  chunkFailure?: { command: "review" | "review-ctx" | "review-missed"; failure: string; all?: boolean };
}) {
  const commands: string[] = [];
  const models: string[] = [];
  const failures = new Set<string>();
  const missedPool: Finding[][] = [];
  let reviewerInput = "";
  const chunksFor = (command: string) => outputs.chunkFailure?.command === command
    ? { chunkFailed: 1, chunks: [{ status: "CHUNK_FAILED", failure: outputs.chunkFailure.failure },
      ...(outputs.chunkFailure.all ? [] : [{ status: "OK" }])] }
    : { chunkFailed: 0, chunks: [{ status: "OK" }] };
  const exec = vi.fn<Execute>(async (file, args, options) => {
    if (file === "git") {
      commands.push("git");
      expect(args).toEqual(["-C", "/fake/repo", "cat-file", "-e", `${HEAD}^{commit}`]);
      return {};
    }
    const command = args[1]!;
    const value = (flag: string) => args[args.indexOf(flag) + 1]!;
    commands.push(command);
    models.push(value("--model"));
    expect(options.env.NEBIUS_API_KEY).toBe(KEY);
    if (failures.has(command)) throw new Error("private subprocess error");
    if (command !== "review") expect([value("--repo"), value("--head")]).toEqual(["/fake/repo", HEAD]);
    if (command === "verify-ctx") {
      const pool: Finding[] = JSON.parse(await readFile(value("--review"), "utf8")).comments;
      const kept = pool.filter(outputs.keep ?? (() => true));
      const verify = { model: "m", findings: pool.length, kept: kept.length, dropped: pool.length - kept.length, verifyFailed: 0 };
      await writeFile(value("--out"), JSON.stringify({ verify, comments: pool.map(f => ({
        ...f, status: "VERIFIED", verdict: kept.includes(f) ? "keep" : "drop" })) }));
      await writeFile(value("--kept"), JSON.stringify({ verify, comments: kept }));
      return {};
    }
    if (command === "review-missed") {
      expect(await readFile(value("--pr"), "utf8")).toBe(reviewerInput);
      missedPool.push(JSON.parse(await readFile(value("--findings"), "utf8")).comments);
      await writeFile(value("--out"), JSON.stringify({ comments: outputs["review-missed"] ?? [], review: { model: "m", ...chunksFor(command) } }));
      return {};
    }
    reviewerInput = await readFile(value("--pr"), "utf8");
    const comments = outputs[command as "review" | "review-ctx"];
    await writeFile(value("--out"), JSON.stringify({ comments, review: { model: "m", ...chunksFor(command) } }));
    return {};
  });
  return { exec, commands, models, failures, missedPool };
}

function context(exec: Execute, overrides: Partial<RunContext> = {}): RunContext {
  return {
    model: "chosen/model", repo: "/fake/repo", head: HEAD, env: { NEBIUS_API_KEY: KEY }, signal: new AbortController().signal,
    deadline: Date.now() + 60 * 60_000, now: Date.now, log: () => {}, makeExec: () => exec, clearCache: vi.fn(), ...overrides,
  };
}
const input: ReviewerInput = { title: "t", body: "b", number: 101, diff: "diff" };

describe("pipelines", () => {
  const diffFindings = [finding(10, "diff a"), finding(30, "diff b")];
  const ctxFindings = [finding(12, "ctx agrees with diff a"), finding(50, "ctx only")];

  it.each([
    { chunkFailed: -1, chunks: [{ status: "OK" }] },
    { chunkFailed: 0, chunks: [{ status: "CHUNK_FAILED" }] },
    { chunkFailed: 2, chunks: [{ status: "CHUNK_FAILED" }] },
    { chunkFailed: 1, chunks: [null] },
  ])("rejects malformed chunk metadata %j", review => {
    expect(() => readReview("review", { comments: [], review: { model: "m", ...review } })).toThrow(/invalid/);
  });

  it("pool-raw runs both reviewers on the chosen model and pools them, with no verifier", async () => {
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    expect(await poolRaw(input, context(s.exec))).toEqual([...diffFindings, ctxFindings[1]]);
    expect(s.commands.sort()).toEqual(["git", "review", "review-ctx"]);
    expect(s.models).toEqual(["chosen/model", "chosen/model"]);
  });

  it("pool-raw rejects invalid output or a failed process, while readReview retains successful chunks", async () => {
    expect(() => readReview("review", { comments: [], review: { model: "m", chunkFailed: 1 } })).toThrow(/^review: invalid output$/);
    expect(readReview("review", { comments: diffFindings, review: { model: "m", chunkFailed: 1, chunks: [{ status: "OK" },
      { status: "CHUNK_FAILED", failure: "invalid reply" }] } })).toEqual({ comments: diffFindings, failed: 1, chunks: 2, failure: "invalid reply" });
    expect(() => readReview("review", { comments: [{ path: "a", line: 0, body: "x" }], review: { model: "m", chunkFailed: 0, chunks: [{ status: "OK" }] } })).toThrow(/invalid finding/);
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    s.failures.add("review-ctx");
    await expect(poolRaw(input, context(s.exec))).rejects.toThrow(/private subprocess error/);
  });

  it.each(["pool-raw", "pool-raw-x2", "pool-raw-missed", "pool-verify-v1"])("%s keeps partial findings and reports failed/total chunks", async pipeline => {
    vi.stubEnv("NEBIUS_API_KEY", KEY);
    const c = contract({ RB_CONFIG_PIPELINE: pipeline, TRACEHOUND_RB_IMAGE: "1" });
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, chunkFailure: { command: "review", failure: "invalid reply" } });
    const d = deps(undefined);
    expect(await main(c.env, { ...d, makeExec: () => s.exec })).toBe(0);
    expect(c.read().findings.map((f: { message: string }) => f.message)).toEqual(["diff a", "diff b", "ctx only"]);
    const partial = pipeline === "pool-raw-x2" ? "2/6" : pipeline === "pool-raw-missed" ? "1/4" : "1/3";
    expect(d.lines.at(-1)).toContain(`status=ok partial=${partial} findings=3 `);
  });

  it("keeps the other reviewer when one fails every chunk", async () => {
    const s = fakeStages({ review: [], "review-ctx": ctxFindings, chunkFailure: { command: "review", failure: "invalid reply", all: true } });
    expect(await poolRaw(input, context(s.exec))).toEqual(ctxFindings);
  });

  it.each(["pool-raw", "pool-raw-x2", "pool-raw-missed", "pool-verify-v1"])("%s writes no findings with status=failed when every reviewer chunk failed", async pipeline => {
    vi.stubEnv("NEBIUS_API_KEY", KEY);
    const c = contract({ RB_CONFIG_PIPELINE: pipeline, TRACEHOUND_RB_IMAGE: "1" });
    const s = fakeStages({ review: [], "review-ctx": [] });
    const exec: Execute = async (file, args, options) => {
      if (!["review", "review-ctx"].includes(args[1]!)) return s.exec(file, args, options);
      await writeFile(args[args.indexOf("--out") + 1]!, JSON.stringify({ comments: [],
        review: { model: "m", chunkFailed: 1, chunks: [{ status: "CHUNK_FAILED", failure: "invalid reply" }] } }));
      return {};
    };
    const d = deps(undefined);
    expect(await main(c.env, { ...d, makeExec: () => exec })).toBe(0);
    expect(c.read().findings).toEqual([]);
    expect(d.lines.at(-1)).toMatch(/^status=failed: .* findings=0 /);
    expect(s.commands).not.toContain("verify-ctx");
    expect(s.commands).not.toContain("review-missed");
  });

  it("pool-raw-x2 retains a partial pass when the next pass fails every chunk", async () => {
    const first = fakeStages({ review: diffFindings, "review-ctx": [], chunkFailure: { command: "review", failure: "invalid reply" } });
    let pass = 1;
    const exec: Execute = async (file, args, options) => {
      if (pass === 1 || file === "git") return first.exec(file, args, options);
      await writeFile(args[args.indexOf("--out") + 1]!, JSON.stringify({ comments: [],
        review: { model: "m", chunkFailed: 1, chunks: [{ status: "CHUNK_FAILED" }] } }));
      return {};
    };
    expect(await poolRawX2(input, context(exec, { clearCache: () => { pass = 2; } }))).toEqual(diffFindings);
  });

  it("pool-raw-missed keeps successful missed chunks and reports partial counts", async () => {
    const c = contract({ RB_CONFIG_PIPELINE: "pool-raw-missed" });
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, "review-missed": [finding(80, "new")],
      chunkFailure: { command: "review-missed", failure: "invalid reply" } });
    const d = deps(undefined);
    expect(await main(c.env, { ...d, makeExec: () => s.exec })).toBe(0);
    expect(c.read().findings.map((f: { message: string }) => f.message)).toEqual(["diff a", "diff b", "ctx only", "new"]);
    expect(d.lines.at(-1)).toContain("status=ok partial=1/4 findings=4 ");
  });

  it("pool-verify-v1 is the Action's runPipeline: both reviewers, then verify-ctx keeps or drops", async () => {
    // runPipeline hands its stages process.env, which main's env is in the image.
    vi.stubEnv("NEBIUS_API_KEY", KEY);
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, keep: f => f.line !== 30 });
    expect(await runSelected("pool-verify-v1", input, context(s.exec))).toEqual([diffFindings[0], ctxFindings[1]]);
    expect(s.commands.sort()).toEqual(["git", "review", "review-ctx", "verify-ctx"]);
    expect(s.models).toEqual(["chosen/model", "chosen/model", "chosen/model"]);
  });

  it("pool-raw-x2 clears the cache before pass 2 and keeps the first of agreeing findings", async () => {
    const pass1 = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    const pass2Findings = [finding(11, "pass 2, agrees with diff a"), finding(70, "pass 2 only")];
    const pass2 = fakeStages({ review: pass2Findings, "review-ctx": [] });
    let pass = 1;
    const clearCache = vi.fn(() => { pass = 2; });
    const exec: Execute = (file, args, options) => (pass === 1 ? pass1 : pass2).exec(file, args, options);
    expect(await poolRawX2(input, context(exec, { clearCache }))).toEqual([...diffFindings, ctxFindings[1], pass2Findings[1]]);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(pass1.commands.sort()).toEqual(["git", "review", "review-ctx"]);
    expect(pass2.commands.sort()).toEqual(["git", "review", "review-ctx"]);
  });

  it("pool-raw-x2 keeps a finished pass when the other fails, and fails only when neither finishes", async () => {
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    let calls = 0;
    const flaky: Execute = async (file, args, options) => {
      if (args[1] === "review" && ++calls === 2) throw new Error("pass 2 broke");
      return s.exec(file, args, options);
    };
    const lines: string[] = [];
    expect(await poolRawX2(input, context(flaky, { log: l => lines.push(l) }))).toEqual([...diffFindings, ctxFindings[1]]);
    expect(lines).toContain("pass 2: failed (pass 2 broke)");

    s.failures.add("review");
    await expect(poolRawX2(input, context(s.exec))).rejects.toThrow(/no pass finished/);
  });

  it("pool-raw-x2 skips a pass with less than the margin left before the limit", async () => {
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    const lines: string[] = [];
    const now = Date.now();
    const c = context(s.exec, { deadline: now + X2_MARGIN_MS - 1, now: () => now, log: l => lines.push(l) });
    await expect(poolRawX2(input, c)).rejects.toThrow(/no pass finished/);
    expect(lines).toEqual(["pass 1: skipped, no time left", "pass 2: skipped, no time left"]);
    expect(s.exec).not.toHaveBeenCalled();
  });

  it("pool-raw-missed runs review-missed on the pool with the same model and adds only findings that agree with none", async () => {
    const pool = [...diffFindings, ctxFindings[1]!];
    const missed = [finding(32, "missed, agrees with diff b"), finding(80, "missed and new"), finding(10, "other file", "src/other.ts")];
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, "review-missed": missed });
    const lines: string[] = [];
    expect(await poolRawMissed(input, context(s.exec, { log: l => lines.push(l) }))).toEqual([...pool, missed[1], missed[2]]);
    expect(s.missedPool).toEqual([pool]);
    expect(s.commands.sort()).toEqual(["git", "review", "review-ctx", "review-missed"]);
    expect(s.models).toEqual(["chosen/model", "chosen/model", "chosen/model"]);
    expect(lines).toContain("pool 3, missed 3, new 2");
    expect(await runSelected("pool-raw-missed", input, context(s.exec))).toEqual([...pool, missed[1], missed[2]]);
  });

  it("pool-raw-missed returns exactly the pool when the missed stage fails or reports a failed chunk", async () => {
    const pool = [...diffFindings, ctxFindings[1]!];
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, "review-missed": [finding(80, "new")] });
    s.failures.add("review-missed");
    const lines: string[] = [];
    expect(await poolRawMissed(input, context(s.exec, { log: l => lines.push(l) }))).toEqual(pool);
    expect(lines).toContain("missed: failed (private subprocess error)");

    const chunkFailed: Execute = async (file, args, options) => {
      if (args[1] !== "review-missed") return s.exec(file, args, options);
      const out = args[args.indexOf("--out") + 1]!;
      await writeFile(out, JSON.stringify({ comments: [], review: { model: "m", chunkFailed: 1, chunks: [{ status: "CHUNK_FAILED", failure: "invalid reply" }] } }));
      return {};
    };
    lines.length = 0;
    expect(await poolRawMissed(input, context(chunkFailed, { log: l => lines.push(l) }))).toEqual(pool);
    expect(lines).toContain("missed: failed (review-missed: failed chunks (first: invalid reply))");
  });

  it("pool-raw-missed stops the missed stage at the margin before the limit and returns exactly the pool", async () => {
    const pool = [...diffFindings, ctxFindings[1]!];
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings, "review-missed": [finding(80, "new")] });
    let missedSignal: AbortSignal | undefined;
    const makeExec = (signal: AbortSignal): Execute => async (file, args, options) => {
      if (args[1] !== "review-missed") return s.exec(file, args, options);
      missedSignal = signal;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("killed"))));
    };
    const lines: string[] = [];
    const c = context(s.exec, { deadline: Date.now() + X2_MARGIN_MS + 100, makeExec, log: l => lines.push(l) });
    expect(await poolRawMissed(input, c)).toEqual(pool);
    expect(missedSignal?.aborted).toBe(true);
    expect(c.signal.aborted).toBe(false);
    expect(lines.at(-1)).toMatch(/^missed: failed \(timed out after \d+ s\)$/);

    // No time left at all: the stage is not started.
    const now = Date.now();
    const late = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    lines.length = 0;
    expect(await poolRawMissed(input, context(late.exec, { deadline: now + X2_MARGIN_MS, now: () => now, log: l => lines.push(l) }))).toEqual(pool);
    expect(late.commands).not.toContain("review-missed");
    expect(lines).toContain("missed: failed (no time left)");
  });

  it("pool-raw-missed fails a pull request only where pool-raw does", async () => {
    const s = fakeStages({ review: diffFindings, "review-ctx": ctxFindings });
    s.failures.add("review");
    await expect(poolRawMissed(input, context(s.exec))).rejects.toThrow(/private subprocess error/);
    expect(s.commands).not.toContain("review-missed");
  });

  it("pool-raw-missed puts pool findings first, so the 40-finding cap cuts missed findings", async () => {
    const c = contract({ RB_CONFIG_PIPELINE: "pool-raw-missed" });
    const reviewed = Array.from({ length: MAX_FINDINGS }, (_, i) => finding(10 * (i + 1), `pool ${i}`));
    const s = fakeStages({ review: reviewed, "review-ctx": [], "review-missed": [finding(5000, "missed new"), finding(6000, "missed new 2")] });
    const d = deps(undefined);
    expect(await main(c.env, { ...d, makeExec: () => s.exec })).toBe(0);
    const file = c.read();
    expect(file.findings.map((f: { message: string }) => f.message)).toEqual(reviewed.map(f => f.body));
    expect(d.lines).toContain(`pool ${MAX_FINDINGS}, missed 2, new 2`);
    expect(d.lines.at(-1)).toMatch(/^status=ok findings=40 dropped_no_line=0 dropped_empty=0 capped=2 /);
  });

  it("unions passes with decision 058's agreement rule", () => {
    const a = [finding(10), finding(10, "same line, same pass"), finding(null)];
    const b = [finding(13), finding(14), finding(null)];
    expect(unionFindings([a, b])).toEqual([a[0], a[2], b[1], b[2]]);
  });
});

it.each([
  ["ok", 0], ["ok partial=1/3", 0], ["ok partial=2/6", 0],
  ["failed: pool-raw: failed chunks", 1], ["", 1], ["empty diff", 1],
  ["okay", 1], ["ok partial=oops", 1], ["ok partial=1/3 failed", 1],
])("the smoke workflow status check handles %j", (status, exit) => {
  const workflow = readFileSync(path.join(import.meta.dirname, "../../.github/workflows/reviewbench-smoke.yml"), "utf8");
  const condition = /if (\[\[.*\]\]); then echo "::error::index \$pr: adapter status/.exec(workflow)?.[1];
  expect(condition).toBeDefined();
  const result = spawnSync("bash", ["-c", `status=$1\nif ${condition}; then exit 1; fi`, "smoke-status", status], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(exit);
});

describe("child processes", () => {
  it("kills a running stage when the signal aborts, and echoes its stderr with the key masked", async () => {
    const controller = new AbortController();
    const lines: string[] = [];
    const exec = abortableExec(controller.signal, l => lines.push(l), { NEBIUS_API_KEY: KEY });
    const started = Date.now();
    const pending = exec(process.execPath, ["-e", `console.error("[review] counts ${KEY}"); setTimeout(() => {}, 60000)`],
      { cwd: tmpdir(), env: {}, maxBuffer: 1024 * 1024 });
    setTimeout(() => controller.abort(), 300);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(10_000);
    await expect(exec(process.execPath, ["-e", `console.error("[review] counts ${KEY}")`], { cwd: tmpdir(), env: {}, maxBuffer: 1024 }))
      .rejects.toMatchObject({ name: "AbortError" });
    const ok = abortableExec(new AbortController().signal, l => lines.push(l), { NEBIUS_API_KEY: KEY });
    await ok(process.execPath, ["-e", `console.error("[review] counts ${KEY}")`], { cwd: tmpdir(), env: {}, maxBuffer: 1024 });
    expect(lines).toContain("  | [review] counts ***");
    expect(lines.join("\n")).not.toContain(KEY);
  });

  it("imports nothing that talks to GitHub: no posting, fixes or graph history", () => {
    const source = readFileSync(path.join(import.meta.dirname, "entry.ts"), "utf8")
      + readFileSync(path.join(import.meta.dirname, "adapter.ts"), "utf8");
    const imports = source.split("\n").filter(line => /^import /.test(line));
    const runtime = imports.filter(line => !/^import type /.test(line));
    expect(runtime.filter(line => /action\/src\/(action|cli|fix|data|reviewer)\.ts/.test(line))).toEqual([]);
    expect(source).not.toMatch(/api\.github\.com|GITHUB_TOKEN/);
  });
});
