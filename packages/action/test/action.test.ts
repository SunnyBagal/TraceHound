import { describe, expect, it, vi } from "vitest";
import { buildInput, buildReview, runAction, type Dependencies, type Options, type PullEvent, type ReviewPayload } from "../src/action.ts";
import type { FixOutput } from "../src/fix.ts";

const event: PullEvent = {
  repository: { full_name: "example/widget" },
  pull_request: {
    title: "Handle missing widgets",
    body: "Return a useful error.",
    number: 42,
    head: { sha: "abc123", repo: { full_name: "example/widget" } },
  },
};
const diff = [
  "diff --git a/src/widget.ts b/src/widget.ts",
  "--- a/src/widget.ts", "+++ b/src/widget.ts", "@@ -8,3 +8,4 @@",
  " context", "-old", "+new", "+added", " end", "",
].join("\n");
const finding = { path: "src/widget.ts", line: 9, body: "This still dereferences a missing widget." };
const options: Options = {
  token: "fake-github-token", apiUrl: "https://api.example.invalid",
  model: "", maxComments: 15, dryRun: false,
  reviewer: "review-diff-v1",
};
const output = (comments = [finding]) => ({
  pr_title: event.pull_request.title, pr_number: 42, comments,
  review: { model: "fake-nemotron", chunkFailed: 0, findings: comments.length },
});

function fake(outputValue: unknown = output(), statuses = [201]) {
  const posts: unknown[] = [];
  const head = { sha: "abc123" };
  const api = vi.fn<typeof fetch>(async (url, init) => {
    const endpoint = String(url);
    expect(endpoint).toMatch(/^https:\/\/api\.example\.invalid\/repos\/example\/widget\/pulls\/42(?:\/reviews)?$/);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fake-github-token");
    expect(init?.redirect).toBe("error");
    if (init?.method === "POST") {
      expect(endpoint).toContain("/reviews");
      expect(new Headers(init.headers).get("Accept")).toBe("application/vnd.github+json");
      posts.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: statuses.shift() ?? 201 });
    }
    const accept = new Headers(init?.headers).get("Accept");
    if (accept === "application/vnd.github.diff") return new Response(diff);
    expect(accept).toBe("application/vnd.github+json");
    return Response.json({ head });
  });
  const reviewer = vi.fn<Dependencies["runReviewer"]>().mockResolvedValue(outputValue);
  const log = vi.fn();
  return { deps: { fetch: api, runReviewer: reviewer, runPipeline: vi.fn(), runFixes: vi.fn<Dependencies["runFixes"]>(), checkRepoHead: vi.fn(), log }, posts, api, reviewer, log, head };
}

const requests = (api: ReturnType<typeof fake>["api"]) => api.mock.calls.map(([, init]) =>
  `${init?.method} ${new Headers(init?.headers).get("Accept")}`);

describe("review input and mapping", () => {
  it("builds neutral input from the event and the exact diff", () => {
    expect(buildInput(event, diff)).toEqual({ title: event.pull_request.title, body: event.pull_request.body, number: 42, diff });
    expect(buildInput({ ...event, pull_request: { ...event.pull_request, body: null } }, diff).body).toBe("");
  });

  it("posts one COMMENT review against the event head with RIGHT-side comments", async () => {
    const f = fake();
    await runAction(event, options, f.deps);
    expect(f.reviewer).toHaveBeenCalledWith(buildInput(event, diff), "");
    expect(f.posts).toEqual([{
      commit_id: "abc123", event: "COMMENT",
      body: "TraceHound · review-diff-v1 · fake-nemotron · 1 findings\n\nThese comments are model-generated and unverified.",
      comments: [{ ...finding, side: "RIGHT" }],
    }]);
    expect(requests(f.api)).toEqual([
      "GET application/vnd.github.diff", "GET application/vnd.github+json",
      "GET application/vnd.github+json", "POST application/vnd.github+json",
    ]);
  });

  it("moves an off-diff line into the body with its location and text", async () => {
    const outside = { ...finding, line: 500 };
    const f = fake(output([finding, outside]));
    await runAction(event, options, f.deps);
    expect(f.posts[0]).toMatchObject({ comments: [{ ...finding, side: "RIGHT" }] });
    expect((f.posts[0] as { body: string }).body).toContain(`src/widget.ts:500\n${outside.body}`);
  });

  it("accepts added and context lines and sends missing paths to the body", () => {
    const r = buildReview([
      { ...finding, line: 8 }, { ...finding, line: 10 }, { ...finding, line: 11 },
      { ...finding, path: "missing.ts" }, { ...finding, line: -1 },
    ], diff, "abc123", "model\nname", 15);
    expect(r.comments.map(c => c.line)).toEqual([8, 10, 11]);
    expect(r.body).toContain("missing.ts:9");
    expect(r.body).toContain("src/widget.ts:-1");
    expect(r.body.split("\n")[0]).toBe("TraceHound · review-diff-v1 · model name · 5 findings");
  });

  it("handles multiple hunks, renamed paths, deletions and binary files", () => {
    const special = [
      "diff --git a/old.ts b/new.ts", "rename from old.ts", "rename to new.ts",
      "--- a/old.ts", "+++ b/new.ts", "@@ -1 +1 @@", "-old", "+new",
      "@@ -20 +20,2 @@", " context", "+added",
      "diff --git a/gone.ts b/gone.ts", "--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-gone",
      "diff --git a/image.png b/image.png", "Binary files a/image.png and b/image.png differ", "",
    ].join("\n");
    const r = buildReview([
      { ...finding, path: "new.ts", line: 21 }, { ...finding, path: "new.ts", line: 10 },
      { ...finding, path: "old.ts", line: 1 }, { ...finding, path: "gone.ts", line: 1 },
      { ...finding, path: "image.png", line: 1 },
    ], special, "abc123", "model", 15);
    expect(r.comments).toEqual([{ ...finding, path: "new.ts", line: 21, side: "RIGHT" }]);
    expect(r.body).toContain("gone.ts:1");
    expect(r.body).toContain("image.png:1");
  });

  it("caps all included findings, including body fallbacks, in reviewer order", async () => {
    const f = fake(output([finding, { ...finding, line: 500 }, { ...finding, body: "Omitted detail" }]));
    await runAction(event, { ...options, maxComments: 2 }, f.deps);
    const posted = f.posts[0] as { body: string; comments: unknown[] };
    expect(posted.comments).toHaveLength(1);
    expect(posted.body).toContain("src/widget.ts:500");
    expect(posted.body).toContain("3 findings");
    expect(posted.body).toContain("1 findings omitted by max-comments");
    expect(posted.body).not.toContain("Omitted detail");
  });

  it("uses the configured model and defaults to a cap of 15", async () => {
    const f = fake(output(Array.from({ length: 20 }, () => finding)));
    await runAction(event, { ...options, model: "explicit-nemotron" }, f.deps);
    expect(f.reviewer).toHaveBeenCalledWith(buildInput(event, diff), "explicit-nemotron");
    expect((f.posts[0] as { comments: unknown[] }).comments).toHaveLength(15);
  });
});

describe("no-post paths and failures", () => {
  it("refuses the benchmark test-set repository before all effects", async () => {
    const f = fake();
    await runAction({ ...event, repository: { full_name: "CALCOM/CAL.COM" } }, options, f.deps);
    expect(f.api).not.toHaveBeenCalled();
    expect(f.reviewer).not.toHaveBeenCalled();
    expect(f.deps.runFixes).not.toHaveBeenCalled();
  });
  it("dry-run prints the exact proposed JSON and posts nothing", async () => {
    const f = fake();
    f.reviewer.mockImplementation(async () => {
      f.head.sha = "new-head";
      return output();
    });
    await runAction(event, { ...options, dryRun: true }, f.deps);
    expect(f.posts).toEqual([]);
    expect(JSON.parse(f.log.mock.calls[0]![0])).toEqual(buildReview([finding], diff, "abc123", "fake-nemotron", 15));
    expect(f.reviewer).toHaveBeenCalledOnce();
    expect(requests(f.api)).toEqual(["GET application/vnd.github.diff", "GET application/vnd.github+json"]);
  });

  it("posts nothing when the head changes while the reviewer runs", async () => {
    const f = fake();
    f.reviewer.mockImplementation(async () => {
      f.head.sha = "new-head";
      return output();
    });
    await runAction(event, options, f.deps);
    expect(f.reviewer).toHaveBeenCalledOnce();
    expect(f.posts).toEqual([]);
    expect(requests(f.api)).toEqual([
      "GET application/vnd.github.diff", "GET application/vnd.github+json", "GET application/vnd.github+json",
    ]);
    expect(f.log).toHaveBeenLastCalledWith("TraceHound: pull request head changed during review; nothing posted.");
  });

  it("reviewer rejection is non-fatal, posts nothing, and does not echo its error", async () => {
    const f = fake();
    f.reviewer.mockRejectedValue(new Error("private reviewer error"));
    await expect(runAction(event, options, f.deps)).resolves.toBeUndefined();
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining("reviewer failed"));
    expect(JSON.stringify(f.log.mock.calls)).not.toContain("private reviewer error");
  });

  it.each([null, {}, { comments: "invalid" }])("invalid reviewer output %j posts nothing", async value => {
    const f = fake(value);
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining("invalid output"));
  });

  it("empty findings post nothing", async () => {
    const f = fake(output([]));
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining("no findings"));
  });

  it("a failed reviewer chunk posts nothing, even with partial findings", async () => {
    const f = fake({ ...output(), review: { model: "fake-nemotron", chunkFailed: 1 } });
    await runAction(event, options, f.deps);
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining("failed chunks"));
  });

  it("isolates malformed findings without losing valid findings", async () => {
    const f = fake({ ...output(), comments: [null, { ...finding, body: " " }, { path: 3 }, finding] });
    await runAction(event, options, f.deps);
    expect(f.posts[0]).toMatchObject({ comments: [{ ...finding, side: "RIGHT" }] });
  });

  it.each([null, { full_name: "someone/widget" }])("skips forks or deleted head repos before any effects", async repo => {
    const f = fake();
    await runAction({ ...event, pull_request: { ...event.pull_request, head: { ...event.pull_request.head, repo } } }, options, f.deps);
    expect(f.api).not.toHaveBeenCalled();
    expect(f.reviewer).not.toHaveBeenCalled();
  });

  it("skips a stale event before invoking the reviewer", async () => {
    const f = fake();
    await runAction({ ...event, pull_request: { ...event.pull_request, head: { ...event.pull_request.head, sha: "old" } } }, options, f.deps);
    expect(f.reviewer).not.toHaveBeenCalled();
    expect(f.posts).toEqual([]);
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining("stale event"));
  });

  it("max-comments 0 skips both reviewer and API", async () => {
    const f = fake();
    await runAction(event, { ...options, maxComments: 0 }, f.deps);
    expect(f.api).not.toHaveBeenCalled();
    expect(f.reviewer).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN])("rejects invalid max-comments %s", async maxComments => {
    const f = fake();
    await expect(runAction(event, { ...options, maxComments }, f.deps)).rejects.toThrow("max-comments");
    expect(f.api).not.toHaveBeenCalled();
  });

  it("retries a rejected inline batch as one body-only review", async () => {
    const f = fake(output(), [422, 201]);
    await expect(runAction(event, options, f.deps)).resolves.toBeUndefined();
    expect(f.posts).toHaveLength(2);
    expect(f.posts[1]).toMatchObject({ event: "COMMENT", comments: [] });
    expect((f.posts[1] as { body: string }).body).toContain(`src/widget.ts:9\n${finding.body}`);
    expect(f.reviewer).toHaveBeenCalledOnce();
    expect(requests(f.api)).toEqual([
      "GET application/vnd.github.diff", "GET application/vnd.github+json",
      "GET application/vnd.github+json", "POST application/vnd.github+json",
      "GET application/vnd.github+json", "POST application/vnd.github+json",
    ]);
  });

  it("does not retry POST when the head changes after a 422", async () => {
    const f = fake(output(), [422, 201]);
    f.deps.fetch = vi.fn<typeof fetch>(async (url, init) => {
      const response = await f.api(url, init);
      if (init?.method === "POST" && response.status === 422) f.head.sha = "new-head";
      return response;
    });
    await runAction(event, options, f.deps);
    expect(f.posts).toHaveLength(1);
    expect(requests(f.api)).toEqual([
      "GET application/vnd.github.diff", "GET application/vnd.github+json",
      "GET application/vnd.github+json", "POST application/vnd.github+json", "GET application/vnd.github+json",
    ]);
    expect(f.log).toHaveBeenLastCalledWith("TraceHound: pull request head changed during review; nothing posted.");
  });

  it("reports authorization failures without retrying or exposing response text", async () => {
    const f = fake(output(), [403]);
    await expect(runAction(event, options, f.deps)).rejects.toThrow("HTTP 403");
    expect(f.posts).toHaveLength(1);
  });
});

const fix = { startLine: 8, endLine: 10, replacement: " context\nfixed\nadded", original: "context\nnew\nadded" };
const fixes: FixOutput = { suggestions: [fix], counts: { attempted: 1, valid: 1, rejected: 0 } };
function footerData(body: string) {
  const line = body.split("\n").at(-1)!;
  expect(line.length).toBeLessThan(8_000);
  const match = /^<!-- tracehound:v1 (\{.*\}) -->$/.exec(line);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]!);
}

describe("fix suggestions and review data", () => {
  function pooled(statuses = [201], comments = [finding]) {
    const f = fake(output(comments), statuses);
    f.deps.runPipeline.mockResolvedValue({ comments, sources: comments.map(() => "both"),
      review: { model: "fake-nemotron", chunkFailed: 0 }, pipeline: { pool: 4, kept: comments.length } });
    f.deps.runFixes.mockResolvedValue(fixes);
    return f;
  }
  const pooledOptions: Options = { ...options, reviewer: "pool-verify-v1", repoDir: "/fake/repo" };

  it("runs fixes after verification and the cap, then posts a native multi-line RIGHT suggestion and a parseable footer", async () => {
    const f = pooled([201], [finding, { ...finding, body: "Omitted" }]);
    f.deps.runFixes.mockImplementation(async posted => {
      expect(f.deps.runPipeline).toHaveBeenCalledOnce();
      expect(posted).toEqual([finding]);
      return fixes;
    });
    await runAction(event, { ...pooledOptions, maxComments: 1 }, f.deps);
    expect(f.deps.runFixes).toHaveBeenCalledWith([finding], diff, "/fake/repo", "abc123");
    const payload = f.posts[0] as ReviewPayload;
    expect(payload.comments).toEqual([{ path: finding.path, line: 10, start_line: 8, start_side: "RIGHT", side: "RIGHT",
      body: `${finding.body}\n\nSuggested fix (model-generated, not tested):\n\`\`\`suggestion\n${fix.replacement}\n\`\`\`` }]);
    expect(footerData(payload.body)).toEqual({ version: 1, pipeline: "pool-verify-v1", headSha: "abc123", pool: 4, kept: 2, posted: 1,
      fixes: fixes.counts, findings: [{ path: finding.path, line: 9, startLine: 8, source: "both", hasSuggestion: true }] });
    expect(payload.body.split("<!-- tracehound:v1")[1]).not.toContain(finding.body);
  });

  it("omits start_line and start_side for a one-line fix", async () => {
    const f = pooled();
    f.deps.runFixes.mockResolvedValue({ ...fixes, suggestions: [{ ...fix, startLine: 9, endLine: 9 }] });
    await runAction(event, pooledOptions, f.deps);
    const comment = (f.posts[0] as ReviewPayload).comments[0]!;
    expect(comment.line).toBe(9);
    expect(comment).not.toHaveProperty("start_line");
    expect(comment).not.toHaveProperty("start_side");
  });

  it("posts the original finding when a fix is rejected, without a suggestion", async () => {
    const f = pooled();
    f.deps.runFixes.mockResolvedValue({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } });
    await runAction(event, pooledOptions, f.deps);
    const payload = f.posts[0] as ReviewPayload;
    expect(payload.comments).toEqual([{ ...finding, side: "RIGHT" }]);
    expect(footerData(payload.body).findings[0]).toEqual({ path: finding.path, line: 9, source: "both", hasSuggestion: false });
  });

  it("fixes off is byte-identical to the legacy pool payload and never calls the fix stage", async () => {
    const f = pooled();
    await runAction(event, { ...pooledOptions, fixes: "off" }, f.deps);
    expect(f.deps.runFixes).not.toHaveBeenCalled();
    expect(JSON.stringify(f.posts[0])).toBe(JSON.stringify({ commit_id: "abc123", event: "COMMENT",
      body: "TraceHound · pool-verify-v1 · fake-nemotron · 1 findings (pool 4, kept 1)\n\nThese comments are model-generated and unverified.",
      comments: [{ ...finding, side: "RIGHT" }] }));
  });

  it("retains the fix as a plain diff on the body-only 422 retry, with no extra model calls", async () => {
    const f = pooled([422, 201]);
    await runAction(event, pooledOptions, f.deps);
    const payload = f.posts[1] as ReviewPayload;
    expect(payload.comments).toEqual([]);
    expect(payload.body).toContain("```diff\n@@ -8,3 +8,3 @@\n-context\n-new\n-added\n+ context\n+fixed\n+added\n```");
    expect(payload.body).not.toContain("```suggestion");
    expect(footerData(payload.body).fixes).toEqual(fixes.counts);
    expect(f.deps.runFixes).toHaveBeenCalledOnce();
  });

  it("isolates fix-stage initialization failure and posts kept findings", async () => {
    const f = pooled();
    f.deps.runFixes.mockRejectedValue(new Error("private error"));
    await runAction(event, pooledOptions, f.deps);
    const payload = f.posts[0] as ReviewPayload;
    expect(payload.comments).toEqual([{ ...finding, side: "RIGHT" }]);
    expect(footerData(payload.body).fixes).toEqual({ attempted: 1, valid: 0, rejected: 1 });
    expect(JSON.stringify(f.log.mock.calls)).not.toContain("private error");
  });

  it("truncates oversized metadata by dropping the whole findings array", () => {
    const comments = Array.from({ length: 100 }, (_, i) => ({ ...finding, path: `${i}/${"x".repeat(100)}.ts` }));
    const payload = buildReview(comments, diff, "abc123", "fake", 100, false, "pool-verify-v1", { pool: 100, kept: 100 }, {
      sources: comments.map(() => "ctx"), fixes: { suggestions: comments.map(() => null), counts: { attempted: 100, valid: 0, rejected: 100 } },
    });
    const data = footerData(payload.body);
    expect(data.findingsTruncated).toBe(true);
    expect(data).not.toHaveProperty("findings");
    expect(data.posted).toBe(100);
  });

  it("escapes HTML delimiters in paths while retaining valid one-line JSON", () => {
    const path = "src/-->\n<widget>.ts";
    const payload = buildReview([{ ...finding, path }], diff, "abc123", "fake", 15, false, "pool-verify-v1", { pool: 1, kept: 1 }, {
      sources: ["diff"], fixes: { suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } },
    });
    expect(footerData(payload.body).findings[0].path).toBe(path);
    expect(payload.body.split("\n").at(-1)!.match(/-->/g)).toHaveLength(1);
  });
});
