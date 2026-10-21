import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRepoHead, MissingHeadError, poolFindings, poolSources, runPipeline, type Execute } from "../src/pipeline.ts";
import { runAction, type Finding, type Options, type PullEvent, type ReviewPayload } from "../src/action.ts";

afterEach(() => vi.unstubAllEnvs());
const finding: Finding = { path: "src/widget.ts", line: 10, body: "Synthetic defect" };
const diff = "diff --git a/src/widget.ts b/src/widget.ts\n--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -10 +10 @@\n-old\n+new\n";
const input = { title: "Synthetic PR", body: "Synthetic description", number: 7, diff };
const event: PullEvent = { repository: { full_name: "example/widget" }, pull_request: {
  ...input, head: { sha: "abc123", repo: { full_name: "example/widget" } },
} };
const options: Options = { token: "fake-unused", apiUrl: "https://api.example.invalid", model: "fake-model",
  contracts: "off",
  repoDir: "/fake/repo", maxComments: 15, dryRun: false };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fake() {
  const commands: string[] = [];
  const directories = new Set<string>();
  const inputs = new Set<string>();
  const posts: ReviewPayload[] = [];
  const overrides: Record<string, unknown> = {};
  const errors = new Set<string>();
  const models: string[] = [];
  let pool: Finding[] = [];
  const exec = vi.fn<Execute>(async (file, args, config) => {
    if (file === "git") {
      commands.push("git");
      expect(args).toEqual(["-C", "/fake/repo", "cat-file", "-e", "abc123^{commit}"]);
      expect(config.env.GIT_DIR).toBeUndefined();
      expect(config.env.GIT_CONFIG_COUNT).toBeUndefined();
      if (errors.has("git")) throw new Error("private subprocess error");
      return {};
    }
    const command = args[1]!;
    const value = (flag: string) => args[args.indexOf(flag) + 1]!;
    commands.push(command);
    expect(file).toBe(process.execPath);
    expect(args[0]).toBe(path.join(config.cwd, "packages/analyzer/src/bin.ts"));
    if (args.includes("--model")) models.push(value("--model"));
    const inputPath = value("--pr");
    const outputPath = value("--out");
    inputs.add(inputPath);
    directories.add(path.dirname(inputPath));
    expect(JSON.parse(await readFile(inputPath, "utf8"))).toEqual(input);
    expect((await stat(inputPath)).mode & 0o777).toBe(0o600);
    if (command !== "review") {
      expect(value("--repo")).toBe("/fake/repo");
      expect(value("--head")).toBe("abc123");
    }
    if (errors.has(command)) throw new Error("private subprocess error");
    let output: unknown = { pr_title: input.title, pr_number: input.number, comments: [finding],
      review: { model: "fake-model", chunkFailed: 0 } };
    if (command === "review-ctx") output = { ...output as object, comments: [{ ...finding, line: null }] };
    if (command === "verify-ctx") {
      expect(commands.filter(c => c === "review" || c === "review-ctx")).toHaveLength(2);
      pool = JSON.parse(await readFile(value("--review"), "utf8")).comments;
      const verify = { model: "fake-model", findings: pool.length, kept: pool.length, dropped: 0, verifyFailed: pool.length };
      output = { comments: pool.map(f => ({ ...f, status: "VERIFY_FAILED", verdict: null })), verify };
      const kept = { comments: pool, verify };
      const keptValue = Object.hasOwn(overrides, "kept") ? overrides.kept : kept;
      await writeFile(value("--kept"), typeof keptValue === "string" ? keptValue : JSON.stringify(keptValue));
    }
    if (Object.hasOwn(overrides, command)) output = overrides[command];
    await writeFile(outputPath, typeof output === "string" ? output : JSON.stringify(output));
    return {};
  });
  const log = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return Response.json({});
    }
    return new Headers(init?.headers).get("Accept") === "application/vnd.github.diff"
      ? new Response(diff) : Response.json({ head: { sha: "abc123" } });
  });
  const deps = { fetch, log, runReviewer: vi.fn(),
    runFixes: vi.fn(async (findings: Finding[]) => ({ suggestions: findings.map(() => null),
      counts: { attempted: findings.length, valid: 0, rejected: findings.length } })),
    checkRepoHead: (repo: string, head: string) => checkRepoHead(repo, head, exec),
    runPipeline: (pr: typeof input, model: string, repo: string, head: string) => runPipeline(pr, model, repo, head, log, exec),
  };
  const cleaned = async () => {
    expect(directories.size).toBe(1);
    for (const dir of directories) await expect(access(dir)).rejects.toMatchObject({ code: "ENOENT" });
  };
  return { exec, log, commands, directories, inputs, posts, overrides, errors, models, deps, cleaned, pool: () => pool };
}

describe("pool using the shared agrees rule", () => {
  it("tags sources without changing the pool's bytes, objects, duplicates, or order", () => {
    const diff = [finding, finding, { ...finding, path: "other.ts" }];
    const ctx = [{ ...finding, line: 13 }, { ...finding, line: null }, { ...finding, line: 20 }];
    const before = JSON.stringify([...diff, ctx[1], ctx[2]]);
    expect(poolSources(diff, ctx)).toEqual(["both", "both", "diff", "ctx", "ctx"]);
    const pool = poolFindings(diff, ctx);
    expect(JSON.stringify(pool)).toBe(before);
    expect(pool[0]).toBe(finding);
    expect(pool[3]).toBe(ctx[1]);
  });
  it.each([
    ["normalised path, 3 lines away", { ...finding, path: " ./a/src/widget.ts ", line: 13 }, false],
    ["4 lines away", { ...finding, line: 14 }, true],
    ["null line", { ...finding, line: null }, true],
    ["different path", { ...finding, path: "src/other.ts" }, true],
  ] as const)("%s", (_name, ctx, added) => {
    expect(poolFindings([finding], [ctx])).toEqual(added ? [finding, ctx] : [finding]);
  });

  it("compares ctx findings only against diff findings, preserving order and all diff findings", () => {
    const ctx = [{ ...finding, line: 14 }, { ...finding, line: 15 }];
    expect(poolFindings([finding, finding], ctx)).toEqual([finding, finding, ...ctx]);
  });
});

it("runs both reviewers before either finishes, then verifies the pool, using one private input file", async () => {
  const f = fake();
  const started = deferred();
  const release = deferred();
  const reviewers: string[] = [];
  const exec: Execute = async (file, args, config) => {
    if (args[1] === "review" || args[1] === "review-ctx") {
      reviewers.push(args[1]);
      if (reviewers.length === 2) started.resolve();
      await release.promise;
    }
    return f.exec(file, args, config);
  };
  const pending = runPipeline(input, "explicit-model", "/fake/repo", "abc123", f.log, exec);
  await started.promise;
  expect(reviewers).toEqual(["review", "review-ctx"]);
  expect(f.commands).toEqual([]);
  release.resolve();
  const result = await pending;
  expect(result).toMatchObject({ pipeline: { pool: 2, kept: 2 }, comments: [finding, { ...finding, line: null }] });
  expect(result?.sources).toEqual(["diff", "ctx"]);
  expect(f.commands).toEqual(["review", "review-ctx", "verify-ctx"]);
  expect(f.models).toEqual(["explicit-model", "explicit-model", "explicit-model"]);
  expect(f.inputs.size).toBe(1);
  expect(f.pool()).toEqual([finding, { ...finding, line: null }]);
  await f.cleaned();
});

it("posts kept findings including VERIFY_FAILED, with pipeline counts and the max-comments cap", async () => {
  const f = fake();
  await runAction(event, { ...options, maxComments: 1 }, f.deps);
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0]!.body.split("\n")[0]).toBe("TraceHound · pool-verify-v1 · fake-model · 2 findings (pool 2, kept 2)");
  expect(f.posts[0]!.body).toContain("1 findings omitted by max-comments");
  expect(f.posts[0]!.comments).toEqual([{ ...finding, side: "RIGHT" }]);
  expect(f.deps.runReviewer).not.toHaveBeenCalled();
  expect(f.commands[0]).toBe("git");
  await f.cleaned();
});

it("dry-run runs the pipeline and keeps null-line findings in the body without posting or extra head fetch", async () => {
  const f = fake();
  await runAction(event, { ...options, dryRun: true }, f.deps);
  expect(f.posts).toEqual([]);
  expect(f.deps.fetch).toHaveBeenCalledTimes(2);
  const payload = JSON.parse(f.log.mock.calls[0]![0]) as ReviewPayload;
  expect(payload.body).toContain("src/widget.ts:null\nSynthetic defect");
  expect(payload.comments).toHaveLength(1);
  expect(f.commands).toContain("verify-ctx");
  await f.cleaned();
});

it("posts only the CLI's kept subset and reports the original pool size", async () => {
  const f = fake();
  const ctx = { ...finding, line: null };
  const verify = { model: "fake-model", findings: 2, kept: 1, dropped: 1, verifyFailed: 0 };
  f.overrides["verify-ctx"] = { comments: [
    { ...finding, status: "VERIFIED", verdict: "drop" }, { ...ctx, status: "VERIFIED", verdict: "keep" },
  ], verify };
  f.overrides.kept = { comments: [ctx], verify };
  await runAction(event, options, f.deps);
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0]!.comments).toEqual([]);
  expect(f.posts[0]!.body.split("\n")[0]).toBe("TraceHound · pool-verify-v1 · fake-model · 1 findings (pool 2, kept 1)");
  expect(f.posts[0]!.body).toContain("src/widget.ts:null\nSynthetic defect");
  const footer = JSON.parse(/<!-- tracehound:v1 (.*) -->/.exec(f.posts[0]!.body)![1]!);
  expect(footer.findings).toEqual([{ path: ctx.path, line: null, source: "ctx", hasSuggestion: false }]);
  await f.cleaned();
});

describe("pipeline failure paths", () => {
  it.each(["review", "review-ctx"])("%s failed chunks posts nothing", async command => {
    const f = fake();
    f.overrides[command] = { comments: [finding], review: { model: "fake-model", chunkFailed: 1 } };
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.commands).not.toContain("verify-ctx");
    expect(f.log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(command === "review" ? "review-diff-v1" : "review-ctx-v1"));
    await f.cleaned();
  });

  it.each(["review", "review-ctx", "verify-ctx"])("%s non-zero subprocess posts nothing without leaking error text", async command => {
    const f = fake();
    f.errors.add(command);
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledTimes(1);
    expect(f.log.mock.calls[0]![0]).toContain(command === "review" ? "review-diff-v1" : `${command}-v1`);
    expect(f.log.mock.calls[0]![0]).not.toContain("private subprocess error");
    await f.cleaned();
  });

  it.each([
    ["review", "invalid json"], ["review-ctx", { comments: [{ ...finding, body: 3 }], review: { model: "fake", chunkFailed: 0 } }],
    ["review", { comments: [], review: { model: "fake" } }], ["verify-ctx", "invalid json"],
    ["verify-ctx", { comments: [], verify: { model: "fake" } }], ["kept", "invalid json"],
    ["kept", { comments: [{ ...finding, path: "invented.ts" }], verify: { model: "fake-model", kept: 1 } }],
  ])("malformed %s output posts nothing", async (command, value) => {
    const f = fake();
    f.overrides[command as string] = value;
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledTimes(1);
    expect(f.log.mock.calls[0]![0]).toContain(command === "kept" ? "verify-ctx-v1" : command === "review" ? "review-diff-v1" : `${command}-v1`);
    await f.cleaned();
  });

  it("missing head fails before model and GitHub calls, with a cleaned git environment", async () => {
    const f = fake();
    vi.stubEnv("GIT_DIR", "/fake/unrelated");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    f.errors.add("git");
    await expect(runAction(event, options, f.deps)).rejects.toBeInstanceOf(MissingHeadError);
    expect(f.commands).toEqual(["git"]);
    expect(f.deps.fetch).not.toHaveBeenCalled();
    expect(f.posts).toEqual([]);
  });

  it("missing repository directory fails before spawning git", async () => {
    const exec = vi.fn<Execute>();
    await expect(checkRepoHead("", "abc123", exec)).rejects.toThrow(new MissingHeadError().message);
    expect(exec).not.toHaveBeenCalled();
  });

  it("waits for the other reviewer before cleanup when one fails", async () => {
    const f = fake();
    const started = deferred();
    const release = deferred();
    f.errors.add("review");
    const exec: Execute = async (file, args, config) => {
      if (args[1] === "review-ctx") { started.resolve(); await release.promise; }
      return f.exec(file, args, config);
    };
    let settled = false;
    const pending = runPipeline(input, "", "/fake/repo", "abc123", f.log, exec).then(value => { settled = true; return value; });
    await started.promise;
    await vi.waitFor(() => expect(f.directories.size).toBe(1));
    expect(settled).toBe(false);
    for (const dir of f.directories) await expect(access(dir)).resolves.toBeUndefined();
    release.resolve();
    expect(await pending).toBeNull();
    expect(f.log).toHaveBeenCalledTimes(1);
    await f.cleaned();
  });
});
