import { afterEach, describe, expect, it, vi } from "vitest";
import { runAction, type Dependencies, type Options, type PullEvent, type ReviewPayload } from "../src/action.ts";
import { readFeedback, serializeFeedback } from "../src/learn.ts";
import { fingerprint } from "../../analyzer/src/learn/fingerprint.ts";
import { feedbackFixture } from "../../analyzer/test/fixtures/learn/api.ts";
import { collectFeedback } from "../src/learn.ts";
import { applyUpdate } from "../src/data.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";

const finding = { path: "src/profile.ts", line: 20, body: "null dereference of user in getProfile" };
const sql = { ...finding, body: "SQL injection: name is concatenated into the query in getProfile" };
const rejection = { ...fingerprint(finding), repo: "example/widget", pr: 3, commentId: 10, reason: "reaction",
  url: "https://github.com/example/widget/pull/3#discussion_r10" };
const options: Options = { apiUrl: "https://api.example.invalid", token: "fake-unused", model: "fake-nemotron",
  maxComments: 15, dryRun: false, fixes: "off" };
const event: PullEvent = { repository: { full_name: "example/widget" }, pull_request: { title: "A change", body: "", number: 4,
  head: { sha: "abc123", repo: { full_name: "example/widget" } } } };
const diff = "diff --git a/src/profile.ts b/src/profile.ts\n--- a/src/profile.ts\n+++ b/src/profile.ts\n@@ -20 +20 @@\n-old\n+new\n";
afterEach(() => vi.unstubAllEnvs());

function fake(comments = [finding, sql], status = 200) {
  const posts: ReviewPayload[] = [];
  const head = { sha: "abc123" };
  const api = vi.fn<typeof fetch>(async (url, init) => {
    const endpoint = String(url);
    if (endpoint.includes("/contents/feedback/rejected.json?ref=tracehound-data")) {
      expect(init?.method).toBe("GET");
      return status === 200 ? Response.json({ encoding: "base64", content: Buffer.from(serializeFeedback([rejection])).toString("base64") })
        : new Response("", { status });
    }
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return new Response("{}", { status: 201 }); }
    if (new Headers(init?.headers).get("Accept") === "application/vnd.github.diff") return new Response(diff);
    return Response.json({ head });
  });
  const deps: Dependencies = { fetch: api, runReviewer: vi.fn(), checkRepoHead: vi.fn(), log: vi.fn(),
    runPipeline: vi.fn(async () => ({ comments, sources: comments.map((_, i) => i === 0 ? "diff" as const : "ctx" as const),
      review: { model: "fake-nemotron", chunkFailed: 0 }, pipeline: { pool: 3, kept: comments.length } })),
    runFixes: vi.fn(async findings => ({ suggestions: findings.map(() => null), counts: { attempted: findings.length, valid: 0, rejected: findings.length } })) };
  return { deps, api, posts, head };
}
const record = (body: string) => JSON.parse(/^<!-- tracehound:v1 (.*) -->$/.exec(body.split("\n").at(-1)!)![1]!);

describe("learning post-filter", () => {
  it("replays the demo: post, maintainer thumbs down, collect/store, push, suppress the repeated defect", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tracehound-demo-replay-"));
    try {
      const fixture = feedbackFixture(), candidates = [{ ...finding }], f = fake(candidates);
      const reactions = "/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1";
      fixture.entries[reactions] = [];
      const store = async () => applyUpdate(dir, { feedback: await collectFeedback("example/widget", fixture.options, fixture.deps) });
      await store();
      const fetch = f.deps.fetch;
      f.deps.fetch = async (url, init) => String(url).includes("/contents/")
        ? Response.json({ encoding: "base64", content: Buffer.from(await readFile(path.join(dir, "feedback/rejected.json"))).toString("base64") })
        : fetch(url, init);
      await runAction(event, { ...options, learn: "on" }, f.deps);
      expect(f.posts[0]!.comments).toHaveLength(1);
      fixture.entries[reactions] = [fixture.reaction];
      await store();
      f.head.sha = "next456";
      candidates[0]!.body = "Possible null dereference: user may be undefined in getProfile";
      await runAction({ ...event, pull_request: { ...event.pull_request, head: { ...event.pull_request.head, sha: f.head.sha } } },
        { ...options, learn: "on" }, f.deps);
      expect(f.posts[1]!.comments).toEqual([]);
      expect(f.posts[1]!.body).toContain("1 findings suppressed by maintainer feedback (details in footer).");
      expect(record(f.posts[1]!.body).suppressed[0].matchedComment).toBe(fixture.root.html_url);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("documents a syntactically valid demo script and the required data-before-review ordering", async () => {
    const doc = await readFile(new URL("../../../docs/learn.md", import.meta.url), "utf8");
    const script = /```bash\n([\s\S]*?)\n```/.exec(doc)?.[1];
    expect(script).toBeDefined();
    const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8", env: cleanGitEnv() });
    expect(syntax.status, syntax.stderr).toBe(0);
    expect(doc).toContain("needs: data");
    expect(doc).toContain("This changes what is posted; it is not measured by the benchmark.");
  });
  it("filters after verification, before fixes and cap, preserving source alignment", async () => {
    const f = fake();
    await runAction(event, { ...options, learn: "on", fixes: "on", maxComments: 1 }, f.deps);
    expect(f.deps.runPipeline).toHaveBeenCalledOnce();
    expect(f.deps.runFixes).toHaveBeenCalledWith([sql], diff, "", "abc123");
    expect(f.posts[0]!.comments).toEqual([{ ...sql, side: "RIGHT" }]);
    expect(f.posts[0]!.body).toContain("1 findings suppressed by maintainer feedback (details in footer).");
    expect(record(f.posts[0]!.body)).toMatchObject({ pool: 3, kept: 2, posted: 1,
      suppressed: [{ path: finding.path, line: 20, matchedComment: rejection.url, reason: "reaction" }],
      findings: [{ source: "ctx" }] });
  });
  it("posts an explanatory zero-findings review when all findings are suppressed, even with fixes off", async () => {
    const f = fake([finding]);
    await runAction(event, { ...options, learn: "on" }, f.deps);
    expect(f.posts[0]!.comments).toEqual([]);
    expect(f.posts[0]!.body).toContain("0 findings");
    expect(f.posts[0]!.body).toContain("1 findings suppressed");
    expect(record(f.posts[0]!.body).suppressed).toHaveLength(1);
    expect(f.deps.runFixes).not.toHaveBeenCalled();
  });
  it("wires the composite environment input without changing the pipeline entry point", async () => {
    vi.stubEnv("TRACEHOUND_LEARN", "on");
    const f = fake([finding]);
    await runAction(event, options, f.deps);
    expect(f.posts[0]!.comments).toEqual([]);
  });
  it.each([undefined, "off"] as const)("learn %s is byte-identical to the frozen pre-learning payload, and never loads feedback", async learn => {
    const f = fake([finding]);
    await runAction(event, { ...options, learn }, f.deps);
    const legacy = { commit_id: "abc123", event: "COMMENT", body: "TraceHound · pool-verify-v1 · fake-nemotron · 1 findings (pool 3, kept 1)\n\nThese comments are model-generated and unverified.",
      comments: [{ ...finding, side: "RIGHT" }] };
    expect(JSON.stringify(f.posts[0])).toBe(JSON.stringify(legacy));
    expect(f.api.mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false);
  });
  it("learn off with default fixes is byte-identical to the frozen pre-learning footer and output", async () => {
    const f = fake([finding]);
    await runAction(event, { ...options, learn: "off", fixes: "on" }, f.deps);
    const legacy = { commit_id: "abc123", event: "COMMENT", body: 'TraceHound · pool-verify-v1 · fake-nemotron · 1 findings (pool 3, kept 1)\n\nThese comments are model-generated and unverified.\n\n<!-- tracehound:v1 {"version":1,"pipeline":"pool-verify-v1","headSha":"abc123","pool":3,"kept":1,"posted":1,"fixes":{"attempted":1,"valid":0,"rejected":1},"findings":[{"path":"src/profile.ts","line":20,"source":"diff","hasSuggestion":false}]} -->',
      comments: [{ ...finding, side: "RIGHT" }] };
    expect(JSON.stringify(f.posts[0])).toBe(JSON.stringify(legacy));
  });
  it("missing feedback branch or file is an empty list", async () => {
    const f = fake([finding], 404);
    await runAction(event, { ...options, learn: "on" }, f.deps);
    expect(f.posts[0]!.comments).toHaveLength(1);
    expect(record(f.posts[0]!.body).suppressed).toEqual([]);
  });
  it("does not treat permission/network errors as an empty feedback file", async () => {
    const f = fake([finding], 403);
    await expect(runAction(event, { ...options, learn: "on" }, f.deps)).rejects.toThrow("Feedback read failed");
    expect(f.posts).toEqual([]);
  });
  it("ignores other repos' stored feedback", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ encoding: "base64",
      content: Buffer.from(JSON.stringify([{ ...rejection, repo: "other/repo" }])).toString("base64") }));
    expect(await readFeedback("example/widget", options, { fetch })).toEqual([]);
  });
  it("legacy review-diff-v1 does not read feedback", async () => {
    const f = fake([finding]); vi.mocked(f.deps.runReviewer).mockResolvedValue({ comments: [finding] });
    await runAction(event, { ...options, reviewer: "review-diff-v1", learn: "on" }, f.deps);
    expect(f.api.mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false);
  });
  it("dry-run includes suppression details without a POST", async () => {
    const f = fake([finding]);
    await runAction(event, { ...options, learn: "on", dryRun: true }, f.deps);
    expect(f.posts).toEqual([]);
    const payload = JSON.parse(vi.mocked(f.deps.log).mock.calls[0]![0]);
    expect(record(payload.body).suppressed).toHaveLength(1);
  });
});
