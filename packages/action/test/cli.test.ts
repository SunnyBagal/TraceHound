import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import type { Dependencies } from "../src/action.ts";
import { MissingHeadError } from "../src/pipeline.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
const deps = (): Dependencies => ({ fetch: vi.fn(() => { throw new Error("Unexpected API call"); }),
  runReviewer: vi.fn(), runPipeline: vi.fn(), runFixes: vi.fn(async () => ({ suggestions: [null],
    counts: { attempted: 1, valid: 0, rejected: 1 } })), checkRepoHead: vi.fn(), log: vi.fn() });

it("saves only parsed footer metadata after a successful review", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tracehound-action-test-")); directories.push(dir);
  const eventPath = path.join(dir, "event.json"), footerPath = path.join(dir, "footer");
  await writeFile(eventPath, JSON.stringify({ repository: { full_name: "example/widget" },
    pull_request: { title: "A change", body: "", number: 1, head: { sha: "abc", repo: { full_name: "example/widget" } } } }));
  const d = deps();
  d.fetch = vi.fn(async (_url, init) => init?.method === "POST" ? Response.json({})
    : new Headers(init?.headers).get("Accept") === "application/vnd.github.diff" ? new Response("") : Response.json({ head: { sha: "abc" } }));
  d.runPipeline = vi.fn<Dependencies["runPipeline"]>(async () => ({ comments: [{ path: "a.ts", line: 1, body: "Finding text" }],
    pipeline: { pool: 1, kept: 1 }, sources: ["ctx"], review: { model: "fake", chunkFailed: 0 } }));
  expect(await main({ NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-unused",
    GITHUB_EVENT_PATH: eventPath, TRACEHOUND_REVIEW_FILE: footerPath }, d)).toBe(0);
  const saved = await readFile(footerPath, "utf8");
  // Plain JSON, not the review body's HTML comment.
  expect(JSON.parse(saved)).toMatchObject({ version: 1, headSha: "abc" });
  expect(saved).not.toContain("Finding text");
  expect(saved).not.toContain("fake-unused");
});

it("missing Nebius input exits 1 with a clear message and no effects", async () => {
  const d = deps();
  expect(await main({}, d)).toBe(1);
  expect(d.log).toHaveBeenCalledWith(expect.stringContaining("NEBIUS_API_KEY is missing"));
  expect(d.fetch).not.toHaveBeenCalled();
  expect(d.runReviewer).not.toHaveBeenCalled();
});

it("skips unsupported events without using the fake key", async () => {
  const d = deps();
  expect(await main({ NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "push" }, d)).toBe(0);
  expect(d.fetch).not.toHaveBeenCalled();
});

it.each([
  ["review-diff-v1", undefined], [undefined, undefined],
  ["pool-verify-v1", "off"], ["pool-verify-v1", "on"],
])("passes reviewer %s and fixes %s through to the orchestration", async (reviewer, fixes) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tracehound-action-test-"));
  directories.push(dir);
  const eventPath = path.join(dir, "event.json");
  await writeFile(eventPath, JSON.stringify({
    repository: { full_name: "example/widget" },
    pull_request: { title: "Title", body: null, number: 1, head: { sha: "abc", repo: { full_name: "example/widget" } } },
  }));
  const d = deps();
  d.fetch = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") throw new Error("Dry run must not post");
    return new Headers(init?.headers).get("Accept") === "application/vnd.github.diff"
      ? new Response("") : Response.json({ head: { sha: "abc" } });
  });
  d.runReviewer = vi.fn().mockResolvedValue({ comments: [{ path: "missing.ts", line: 1, body: "A finding" }], review: { model: "fake" } });
  d.runPipeline = vi.fn().mockResolvedValue({
    comments: [{ path: "missing.ts", line: 1, body: "A finding" }], review: { model: "fake", chunkFailed: 0 },
    pipeline: { pool: 2, kept: 1 },
    sources: ["ctx"],
  });
  expect(await main({
    NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-github",
    GITHUB_EVENT_PATH: eventPath, TRACEHOUND_DRY_RUN: "true",
    TRACEHOUND_REVIEWER: reviewer, TRACEHOUND_REPO_DIR: "/fake/repo",
    TRACEHOUND_FIXES: fixes,
  }, d)).toBe(0);
  const input = { title: "Title", body: "", number: 1, diff: "" };
  if (reviewer === "review-diff-v1") {
    expect(d.runReviewer).toHaveBeenCalledWith(input, "");
    expect(d.runPipeline).not.toHaveBeenCalled();
    expect(d.checkRepoHead).not.toHaveBeenCalled();
  } else {
    expect(d.runPipeline).toHaveBeenCalledWith(input, "", "/fake/repo", "abc");
    expect(d.checkRepoHead).toHaveBeenCalledWith("/fake/repo", "abc");
    expect(d.runReviewer).not.toHaveBeenCalled();
  }
  expect(JSON.parse(vi.mocked(d.log).mock.calls[0]![0])).toMatchObject({ comments: [], event: "COMMENT" });
  if (reviewer === "review-diff-v1" || fixes === "off") {
    expect(d.runFixes).not.toHaveBeenCalled();
    expect(vi.mocked(d.log).mock.calls[0]![0]).not.toContain("tracehound:v1");
  } else {
    expect(d.runFixes).toHaveBeenCalledWith([{ path: "missing.ts", line: 1, body: "A finding" }], "", "/fake/repo", "abc");
    expect(vi.mocked(d.log).mock.calls[0]![0]).toContain("tracehound:v1");
  }
});

it.each(["unknown", "", "review-ctx-v1"])("invalid reviewer %j fails before any effects", async reviewer => {
  const d = deps();
  expect(await main({ TRACEHOUND_REVIEWER: reviewer }, d)).toBe(1);
  expect(d.log).toHaveBeenCalledWith("TraceHound: reviewer must be pool-verify-v1 or review-diff-v1.");
  expect(d.fetch).not.toHaveBeenCalled();
  expect(d.runReviewer).not.toHaveBeenCalled();
  expect(d.runPipeline).not.toHaveBeenCalled();
  expect(d.checkRepoHead).not.toHaveBeenCalled();
});

it("missing head commit exits 1 with the checkout message before model or API calls", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tracehound-action-test-"));
  directories.push(dir);
  const eventPath = path.join(dir, "event.json");
  await writeFile(eventPath, JSON.stringify({
    repository: { full_name: "example/widget" },
    pull_request: { title: "Title", body: null, number: 1, head: { sha: "abc", repo: { full_name: "example/widget" } } },
  }));
  const d = deps();
  d.checkRepoHead = vi.fn().mockRejectedValue(new MissingHeadError());
  expect(await main({ NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-unused",
    GITHUB_EVENT_PATH: eventPath, TRACEHOUND_REPO_DIR: "/fake/repo" }, d)).toBe(1);
  expect(d.log).toHaveBeenCalledExactlyOnceWith(new MissingHeadError().message);
  expect(d.fetch).not.toHaveBeenCalled();
  expect(d.runReviewer).not.toHaveBeenCalled();
  expect(d.runPipeline).not.toHaveBeenCalled();
});

it("rejects malformed boolean input", async () => {
  const d = deps();
  expect(await main({
    NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-github",
    GITHUB_EVENT_PATH: "/unused", TRACEHOUND_DRY_RUN: "yes",
  }, d)).toBe(1);
  expect(d.fetch).not.toHaveBeenCalled();
});

it.each(["yes", "", "ON"])("rejects invalid fixes input %j before effects", async fixes => {
  const d = deps();
  expect(await main({ NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-unused",
    GITHUB_EVENT_PATH: "/unused", TRACEHOUND_FIXES: fixes }, d)).toBe(1);
  expect(d.runFixes).not.toHaveBeenCalled();
  expect(d.fetch).not.toHaveBeenCalled();
});
