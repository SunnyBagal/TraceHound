import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import type { Dependencies } from "../src/action.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
const deps = (): Dependencies => ({ fetch: vi.fn(() => { throw new Error("Unexpected API call"); }), runReviewer: vi.fn(), log: vi.fn() });

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

it("passes CLI defaults and an event file through to the orchestration", async () => {
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
  expect(await main({
    NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-github",
    GITHUB_EVENT_PATH: eventPath, TRACEHOUND_DRY_RUN: "true",
  }, d)).toBe(0);
  expect(d.runReviewer).toHaveBeenCalledWith({ title: "Title", body: "", number: 1, diff: "" }, "");
  expect(JSON.parse(vi.mocked(d.log).mock.calls[0]![0])).toMatchObject({ comments: [], event: "COMMENT" });
});

it("rejects malformed boolean input", async () => {
  const d = deps();
  expect(await main({
    NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-github",
    GITHUB_EVENT_PATH: "/unused", TRACEHOUND_DRY_RUN: "yes",
  }, d)).toBe(1);
  expect(d.fetch).not.toHaveBeenCalled();
});
