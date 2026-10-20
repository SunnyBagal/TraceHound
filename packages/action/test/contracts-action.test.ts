import { afterEach, describe, expect, it, vi } from "vitest";
import { runAction, type Dependencies, type Finding, type Options, type PullEvent, type ReviewPayload } from "../src/action.ts";
import { CONTRACTS_BUDGET_MS, type ContractsResult } from "../src/contracts.ts";
import { main } from "../src/cli.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const head = "b".repeat(40), base = "a".repeat(40);
const event: PullEvent = { repository: { full_name: "example/widget" }, pull_request: { title: "Change exports", body: "", number: 4,
  base: { sha: base }, head: { sha: head, repo: { full_name: "example/widget" } } } };
const diff = "diff --git a/src/api.ts b/src/api.ts\n--- a/src/api.ts\n+++ b/src/api.ts\n@@ -1,20 +1,20 @@\n"
  + Array.from({ length: 20 }, (_, i) => ` line ${i + 1}`).join("\n") + "\n";
const model: Finding = { path: "src/model.ts", line: 1, body: "Model finding" };
const contract: Finding = { path: "src/consumer.ts", line: 3, body: "What breaks: missing export. Where: src/consumer.ts:3. Evidence: source and use." };
const options: Options = { token: "fake-unused", apiUrl: "https://api.example.invalid", model: "fake", repoDir: "/checkout",
  maxComments: 15, dryRun: false, fixes: "off" };
const ok = (findings = [contract]): ContractsResult => ({ status: "ok", findings, ms: 12, typed: "complete" });
const record = (body: string) => JSON.parse(/^<!-- tracehound:v1 (.*) -->$/.exec(body.split("\n").at(-1)!)![1]!);
afterEach(() => vi.useRealTimers());

function fake(models = [model], contracts = ok(), statuses = [201]) {
  const posts: ReviewPayload[] = [], current = { sha: head };
  const api = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("/contents/")) return Response.json({ encoding: "base64", content: Buffer.from(JSON.stringify([{
      repo: "example/widget", pr: 2, commentId: 10, reason: "reaction", url: "https://github.com/example/widget/pull/2#discussion_r10",
      path: contract.path, ext: ".ts", tokens: ["missing", "export"], ids: [],
    }])).toString("base64") });
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return new Response("{}", { status: statuses.shift() ?? 201 }); }
    if (new Headers(init?.headers).get("Accept") === "application/vnd.github.diff") return new Response(diff);
    return Response.json({ head: current, base: { sha: "d".repeat(40) } });
  });
  const deps: Dependencies = { fetch: api, log: vi.fn(), checkRepoHead: vi.fn(), runReviewer: vi.fn(),
    runPipeline: vi.fn(async () => ({ comments: models, sources: models.map(() => "ctx" as const),
      pipeline: { pool: models.length, kept: models.length }, review: { model: "fake", chunkFailed: 0 } })),
    runContracts: vi.fn(async () => contracts), runFixes: vi.fn(async findings => ({ suggestions: findings.map(() => null),
      counts: { attempted: findings.length, valid: 0, rejected: findings.length } })) };
  return { deps, api, posts, current };
}

describe("contracts alongside the reviewer", () => {
  it("records whether typed checking completed in the contracts footer", async () => {
    const f = fake();
    await runAction(event, options, f.deps);
    expect(record(f.posts[0]!.body).contracts.typed).toBe("complete");
  });
  it("runs concurrently and passes the event base even if the API's base tip advanced", async () => {
    const f = fake(); let release!: (value: ContractsResult) => void;
    f.deps.runContracts = vi.fn(() => new Promise<ContractsResult>(resolve => { release = resolve; }));
    const running = runAction(event, options, f.deps);
    await vi.waitFor(() => expect(f.deps.runContracts).toHaveBeenCalledWith("/checkout", base, head));
    expect(f.deps.runPipeline).toHaveBeenCalledOnce(); expect(f.posts).toEqual([]);
    release(ok()); await running;
    expect(f.posts).toHaveLength(1);
  });
  it("places a commentable contract inline and links an unedited dependent at the exact head", async () => {
    const f = fake([], ok([{ ...contract, path: "src/api.ts", line: 7 }, contract]));
    await runAction(event, options, f.deps);
    expect(f.posts[0]!.comments).toEqual([{ ...contract, path: "src/api.ts", line: 7, body: `Contract: ${contract.body}`, side: "RIGHT" }]);
    expect(f.posts[0]!.body).toContain("## Files you didn't edit that depend on this change");
    expect(f.posts[0]!.body).toContain(`[src/consumer.ts:3](https://github.com/example/widget/blob/${head}/src/consumer.ts#L3): What breaks: missing export.`);
    expect(record(f.posts[0]!.body).contracts).toEqual({ status: "ok", inline: 1, body: 1, ms: 12, typed: "complete" });
  });
  it("limits contracts independently of the model cap and includes the body overflow count", async () => {
    const findings = [...Array.from({ length: 12 }, (_, i) => ({ ...contract, path: "src/api.ts", line: i + 1 })),
      ...Array.from({ length: 12 }, (_, i) => ({ ...contract, path: `src/consumer${i}.ts` }))];
    const inlineModel = { ...model, path: "src/api.ts", line: 20 };
    const f = fake([inlineModel, { ...model, path: "another.ts" }], ok(findings));
    await runAction(event, { ...options, maxComments: 1 }, f.deps);
    expect(f.posts[0]!.comments).toHaveLength(11);
    expect(f.posts[0]!.comments[0]).toEqual({ ...inlineModel, side: "RIGHT" });
    expect(f.posts[0]!.body).not.toContain("another.ts");
    expect(f.posts[0]!.body).toContain("and 4 more");
    expect(record(f.posts[0]!.body).contracts).toMatchObject({ inline: 10, body: 10 });
  });
  it("keeps the contract within ±3 lines, preserving farther models and their fix/source alignment", async () => {
    const f = fake([{ ...model, path: contract.path, line: 6 }, { ...model, path: contract.path, line: 7 }]);
    await runAction(event, { ...options, fixes: "on" }, f.deps);
    expect(f.deps.runFixes).toHaveBeenCalledWith([{ ...model, path: contract.path, line: 7 }], diff, "/checkout", head);
    expect(record(f.posts[0]!.body).findings).toEqual([{ path: contract.path, line: 7, source: "ctx", hasSuggestion: false }]);
  });
  it("never passes contracts to maintainer suppression or model fix generation", async () => {
    const f = fake([], ok([{ ...contract, body: "missing export" }]));
    await runAction(event, { ...options, learn: "on", fixes: "on" }, f.deps);
    expect(f.posts[0]!.body).toContain("missing export");
    expect(record(f.posts[0]!.body).contracts.body).toBe(1);
    expect(f.deps.runFixes).toHaveBeenCalledWith([], diff, "/checkout", head);
  });
  it.each(["on", "off"] as const)("contracts off preserves the frozen legacy payload byte for byte with fixes %s", async fixes => {
    const f = fake([{ ...model, path: "src/api.ts", line: 7 }]);
    await runAction(event, { ...options, contracts: "off", fixes }, f.deps);
    const legacyFooter = `\n\n<!-- tracehound:v1 {"version":1,"pipeline":"pool-verify-v1","headSha":"${head}","pool":1,"kept":1,"posted":1,"fixes":{"attempted":1,"valid":0,"rejected":1},"findings":[{"path":"src/api.ts","line":7,"source":"ctx","hasSuggestion":false}]} -->`;
    const expected = { commit_id: head, event: "COMMENT", body: "TraceHound · pool-verify-v1 · fake · 1 findings (pool 1, kept 1)\n\nThese comments are model-generated and unverified."
      + (fixes === "on" ? legacyFooter : ""), comments: [{ ...model, path: "src/api.ts", line: 7, side: "RIGHT" }] };
    expect(JSON.stringify(f.posts[0])).toBe(JSON.stringify(expected));
    expect(f.deps.runContracts).not.toHaveBeenCalled();
  });
  it.each(["timeout", "error", "invalid-output"] as const)("a contracts %s leaves the model review intact and logs one line", async reason => {
    const f = fake([model], { status: "failed", reason, findings: [], ms: 90 });
    await runAction(event, options, f.deps);
    expect(f.posts[0]!.body).toContain("src/model.ts:1\nModel finding");
    expect(f.posts[0]!.body).not.toContain("Files you didn't edit");
    expect(record(f.posts[0]!.body).contracts).toEqual({ status: "failed", inline: 0, body: 0, ms: 90 });
    expect(f.deps.log).toHaveBeenCalledWith(`contracts: failed (${reason})`);
    expect(vi.mocked(f.deps.log).mock.calls.filter(([text]) => text.startsWith("contracts: failed"))).toHaveLength(1);
  });
  it("a throwing runner cannot fail review", async () => {
    const f = fake(); f.deps.runContracts = async () => { throw new Error("fake-secret"); };
    await runAction(event, options, f.deps);
    expect(f.posts).toHaveLength(1); expect(JSON.stringify(vi.mocked(f.deps.log).mock.calls)).not.toContain("fake-secret");
  });
  it("a hung runner times out while the normal review still posts", async () => {
    vi.useFakeTimers(); const f = fake(); f.deps.runContracts = () => new Promise(() => {});
    const running = runAction(event, options, f.deps);
    await vi.advanceTimersByTimeAsync(CONTRACTS_BUDGET_MS + 5_100);
    await running;
    expect(f.posts).toHaveLength(1); expect(record(f.posts[0]!.body).contracts.status).toBe("failed");
  });
  it("keeps the stale-head guard after the checker finishes", async () => {
    const f = fake(); f.deps.runContracts = async () => { f.current.sha = "c".repeat(40); return ok(); };
    await runAction(event, options, f.deps); expect(f.posts).toEqual([]);
  });
  it("moves inline contracts into the bounded body section on a 422 and saves the actual footer", async () => {
    const f = fake([], ok([{ ...contract, path: "src/api.ts", line: 7 }]), [422, 201]);
    const onReview = vi.fn();
    await runAction(event, options, { ...f.deps, onReview });
    expect(f.posts).toHaveLength(2); expect(f.posts[1]!.comments).toEqual([]);
    expect(record(f.posts[1]!.body).contracts).toMatchObject({ inline: 0, body: 1 });
    expect(onReview).toHaveBeenCalledWith(f.posts[1]!.body);
  });
  it("leaves fork, benchmark and max-comments-zero skips ahead of the checker", async () => {
    const f = fake();
    await runAction({ ...event, repository: { full_name: "CALCOM/CAL.COM" } }, options, f.deps);
    await runAction({ ...event, pull_request: { ...event.pull_request, head: { ...event.pull_request.head, repo: null } } }, options, f.deps);
    await runAction(event, { ...options, maxComments: 0 }, f.deps);
    expect(f.deps.runContracts).not.toHaveBeenCalled(); expect(f.api).not.toHaveBeenCalled();
  });
  it("the CLI defaults contracts on and passes the selected checkout and refs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tracehound-contracts-cli-"));
    try {
      const file = path.join(dir, "event.json"); await writeFile(file, JSON.stringify(event));
      const f = fake();
      expect(await main({ NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-unused",
        GITHUB_EVENT_PATH: file, TRACEHOUND_REPO_DIR: "/checkout", TRACEHOUND_FIXES: "off" }, f.deps)).toBe(0);
      expect(f.deps.runContracts).toHaveBeenCalledWith("/checkout", base, head);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("supports the legacy diff reviewer with contracts and accurate source metadata", async () => {
    const f = fake(); vi.mocked(f.deps.runReviewer).mockResolvedValue({ comments: [model] });
    await runAction(event, { ...options, reviewer: "review-diff-v1" }, f.deps);
    const footer = record(f.posts[0]!.body);
    expect(footer.pipeline).toBe("review-diff-v1");
    expect(footer.findings[0].source).toBe("diff");
    expect(footer).not.toHaveProperty("pool"); expect(footer.contracts.body).toBe(1);
  });
  it("contracts off preserves the legacy diff reviewer payload byte for byte", async () => {
    const f = fake(); vi.mocked(f.deps.runReviewer).mockResolvedValue({ comments: [{ ...model, path: "src/api.ts", line: 7 }] });
    await runAction(event, { ...options, reviewer: "review-diff-v1", contracts: "off" }, f.deps);
    expect(JSON.stringify(f.posts[0])).toBe(JSON.stringify({ commit_id: head, event: "COMMENT",
      body: "TraceHound · review-diff-v1 · fake · 1 findings\n\nThese comments are model-generated and unverified.",
      comments: [{ ...model, path: "src/api.ts", line: 7, side: "RIGHT" }] }));
  });
});
