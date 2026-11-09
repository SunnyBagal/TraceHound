import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendLedger } from "../../analyzer/src/llm/ledger.ts";
import { costUSD, loadPriceTable, priceFor } from "../../analyzer/src/llm/prices.ts";
import type { Dependencies } from "../src/action.ts";
import { main } from "../src/cli.ts";
import { runPipeline, type Execute } from "../src/pipeline.ts";
import { formatUsageSummary, ledgerSince, recordingClient, UsageRecorder, type Stage } from "../src/usage.ts";

// Synthetic stage records only: no network, no model, no real ledger.
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const temp = async () => { const d = await mkdtemp(path.join(tmpdir(), "tracehound-usage-test-")); directories.push(d); return d; };

const MODEL = "nvidia/Nemotron-3.5-Super-VL";
const price = priceFor(loadPriceTable(path.resolve(import.meta.dirname, "../../../config/prices.json")), MODEL);
const usd = (inputTokens: number, outputTokens: number) => costUSD(price, inputTokens, outputTokens);
const usage = (calls: number, cached: number, inputTokens: number, outputTokens: number, costUSD: number) =>
  ({ calls, cached, inputTokens, outputTokens, costUSD });
/** One ledger line per real call, as TokenFactoryClient#record writes it. */
const charge = (ledger: SpendLedger, purpose: string, inputTokens: number, outputTokens: number, ok = true) =>
  ledger.append({ timestamp: "2026-11-09T00:00:00.000Z", model: MODEL, inputTokens, outputTokens,
    estCostUSD: usd(inputTokens, outputTokens), purpose, ok, usageReported: ok, priceEstimated: false });

const finding = { path: "a.ts", line: 1, body: "Finding text" };
async function setup() {
  const dir = await temp();
  const eventPath = path.join(dir, "event.json"), summary = path.join(dir, "summary.md"), ledgerFile = path.join(dir, "spend.jsonl");
  await writeFile(eventPath, JSON.stringify({ repository: { full_name: "example/widget" },
    pull_request: { title: "A change", body: "", number: 1, head: { sha: "abc", repo: { full_name: "example/widget" } } } }));
  const ledger = new SpendLedger(ledgerFile);
  // Earlier jobs' entries in the same ledger never count toward this run.
  charge(ledger, "review-diff-v1", 1_000_000, 1_000_000);
  charge(ledger, "verify-ctx-v1", 1_000_000, 1_000_000);
  const recorder = new UsageRecorder();
  const posts: unknown[] = [];
  const log = vi.fn();
  const deps: Dependencies = {
    fetch: vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Response.json({}); }
      return new Headers(init?.headers).get("Accept") === "application/vnd.github.diff"
        ? new Response("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n") : Response.json({ head: { sha: "abc" } });
    }),
    runReviewer: vi.fn(), checkRepoHead: vi.fn(), log,
    runPipeline: vi.fn(), runFixes: vi.fn(),
  };
  const env = { NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "pull_request", GITHUB_TOKEN: "fake-unused",
    GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: summary, TRACEHOUND_CONTRACTS: "off", TRACEHOUND_REPO_DIR: "/fake/repo" };
  return { env, deps, recorder, ledger, ledgerFile, summary, posts, log, run: () => main(env, deps, { recorder, ledgerFile }) };
}

describe("job summary", () => {
  it("writes per-stage calls, tokens and estimated $ with the right totals, and the ledger's failed charge as unattributed", async () => {
    const t = await setup();
    t.deps.runPipeline = vi.fn<Dependencies["runPipeline"]>(async () => {
      // What runPipeline's onUsage hands over from review.usage, review-ctx's review.usage and verify.usage.
      t.recorder.add("diff reviewer", usage(2, 0, 10_000, 2_000, usd(10_000, 2_000)));
      charge(t.ledger, "review-diff-v1", 5_000, 1_000); charge(t.ledger, "review-diff-v1", 5_000, 1_000);
      // ctx: 3 calls, 1 a cache hit (its tokens are counted, its cost is $0, it is not in the ledger).
      t.recorder.add("ctx reviewer", usage(3, 1, 20_000, 4_000, usd(15_000, 3_000)));
      charge(t.ledger, "review-ctx-v1", 7_500, 1_500); charge(t.ledger, "review-ctx-v1", 7_500, 1_500);
      t.recorder.add("verifier", usage(4, 0, 8_000, 6_000, usd(8_000, 6_000)));
      for (let i = 0; i < 4; i++) charge(t.ledger, "verify-ctx-v1", 2_000, 1_500);
      // A verifier call that timed out: ledgered at the upper bound, in no stage record.
      charge(t.ledger, "verify-ctx-v1", 3_000, 16_000, false);
      return { comments: [finding], sources: ["diff"], review: { model: MODEL, chunkFailed: 0 }, pipeline: { pool: 1, kept: 1 } };
    });
    const fixClient = recordingClient({ chat: async () => {
      charge(t.ledger, "action-fix", 2_000, 1_000);
      return { content: "{}", cached: false, inputTokens: 2_000, outputTokens: 1_000, costUSD: usd(2_000, 1_000) };
    } }, t.recorder, "fixes");
    t.deps.runFixes = vi.fn(async (findings) => {
      await fixClient.chat();
      return { suggestions: findings.map(() => null), counts: { attempted: findings.length, valid: 0, rejected: findings.length } };
    });
    expect(await t.run()).toBe(0);
    expect(t.posts).toHaveLength(1);
    const md = await readFile(t.summary, "utf8");
    expect(md).toContain("Outcome: TraceHound: posted review with 1 findings.");
    expect(md).toContain("| diff reviewer | 2 | 0 | 10,000 | 2,000 | $0.0048 |");
    expect(md).toContain("| ctx reviewer | 3 | 1 | 20,000 | 4,000 | $0.0072 |");
    expect(md).toContain("| verifier | 4 | 0 | 8,000 | 6,000 | $0.0078 |");
    expect(md).toContain("| fixes | 1 | 0 | 2,000 | 1,000 | $0.0015 |");
    expect(md).toContain("| **total** | **10** | **1** | **40,000** | **13,000** | **$0.0213** |");
    // 9 answered calls + 1 timed-out call; the two older entries ($2.40 each) are excluded.
    expect(md).toContain("Spend ledger, this run (every real call, failed ones included): 10 calls, 38,000 input / 28,000 output tokens, $0.0366.");
    expect(md).toContain("Unattributed: $0.0153 charged in the ledger but in no stage record");
    expect(md).not.toContain("fake-unused");
  });

  it("is written when the pipeline fails partway and nothing is posted, with whatever stages recorded", async () => {
    const t = await setup();
    t.deps.runPipeline = vi.fn<Dependencies["runPipeline"]>(async () => {
      t.recorder.add("diff reviewer", usage(1, 0, 4_000, 1_000, usd(4_000, 1_000)));
      charge(t.ledger, "review-diff-v1", 4_000, 1_000);
      t.recorder.add("ctx reviewer", usage(1, 0, 6_000, 2_000, usd(6_000, 2_000)));
      charge(t.ledger, "review-ctx-v1", 6_000, 2_000);
      charge(t.ledger, "verify-ctx-v1", 1_000, 16_000, false); // the verifier process died: no verdicts file
      // cli.ts hands runPipeline recorder.logger(console.log); its stage-failure line is the outcome.
      t.recorder.logger(t.log)("TraceHound: verify-ctx-v1 failed or returned invalid output; nothing posted (chunks ok 2, failed 0; pool 3; kept -; posted 0).");
      return null;
    });
    expect(await t.run()).toBe(0);
    expect(t.posts).toHaveLength(0);
    const md = await readFile(t.summary, "utf8");
    expect(md).toContain("Outcome: TraceHound: verify-ctx-v1 failed or returned invalid output; nothing posted");
    expect(md).toContain("| verifier | - | - | - | - | - |");
    expect(md).toContain("| fixes | - | - | - | - | - |");
    expect(md).toContain("| **total** | **2** | **0** | **10,000** | **3,000** | **$0.0057** |");
    expect(md).toContain("3 calls, 11,000 input / 19,000 output tokens, $0.0204.");
    expect(md).toContain("Unattributed: $0.0147");
  });

  it("is written when the action fails after model calls (GitHub rejects the review)", async () => {
    const t = await setup();
    t.deps.runPipeline = vi.fn<Dependencies["runPipeline"]>(async () => {
      t.recorder.add("diff reviewer", usage(1, 0, 1_000, 1_000, usd(1_000, 1_000)));
      charge(t.ledger, "review-diff-v1", 1_000, 1_000);
      return { comments: [finding], sources: ["diff"], review: { model: MODEL, chunkFailed: 0 }, pipeline: { pool: 1, kept: 1 } };
    });
    t.deps.runFixes = vi.fn(async () => { throw new Error("fix stage down"); });
    t.deps.fetch = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST" ? new Response("", { status: 500 })
      : new Headers(init?.headers).get("Accept") === "application/vnd.github.diff" ? new Response("") : Response.json({ head: { sha: "abc" } }));
    expect(await t.run()).toBe(1);
    const md = await readFile(t.summary, "utf8");
    expect(md).toContain("Outcome: TraceHound: action failed.");
    expect(md).toContain("| **total** | **1** | **0** | **1,000** | **1,000** | **$0.0012** |");
    expect(md).toContain("1 calls, 1,000 input / 1,000 output tokens, $0.0012.");
    expect(md).not.toContain("Unattributed");
  });

  it("writes no summary without GITHUB_STEP_SUMMARY, and a failed summary write never fails the action", async () => {
    const t = await setup();
    t.deps.runPipeline = vi.fn(async () => null);
    expect(await main({ ...t.env, GITHUB_STEP_SUMMARY: "" }, t.deps, { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(0);
    await expect(readFile(t.summary, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await main({ ...t.env, GITHUB_STEP_SUMMARY: path.join(t.summary, "missing-dir", "x.md") }, t.deps,
      { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(0);
    expect(t.log).toHaveBeenCalledWith("TraceHound: job summary could not be written.");
  });

  it("formats stages that never ran, a stage-record surplus, an unreadable ledger and malformed records", () => {
    const r = new UsageRecorder();
    r.add("verifier", usage(1, 0, 100, 100, 0.5));
    r.add("fixes", { calls: 1 });
    const surplus = formatUsageSummary(r, usage(1, 0, 100, 100, 0.25), "x");
    expect(surplus).toContain("| diff reviewer | - | - | - | - | - |");
    expect(surplus).toContain("Mismatch: the stage records sum to $0.2500 more than the ledger.");
    expect(surplus).toContain("1 stage usage record(s) were malformed and are not summed.");
    expect(formatUsageSummary(r, null, "x")).toContain("Spend ledger: unreadable");
  });

  it("reads only ledger lines after the mark, and treats a missing ledger as no calls", async () => {
    const dir = await temp();
    const file = path.join(dir, "spend.jsonl");
    expect(await ledgerSince(file, 0)).toEqual(usage(0, 0, 0, 0, 0));
    const ledger = new SpendLedger(file);
    charge(ledger, "old", 1, 1);
    charge(ledger, "new", 1_000_000, 0);
    expect(await ledgerSince(file, 1)).toEqual(usage(1, 0, 1_000_000, 0, 0.3));
    await writeFile(file, "not json\n", { flag: "a" });
    expect(await ledgerSince(file, 1)).toBeNull();
  });
});

describe("recording fix client", () => {
  it("records each answered call under fixes, cache hits included at $0; a thrown call is not recorded", async () => {
    const r = new UsageRecorder();
    const replies = [{ content: "a", cached: false, inputTokens: 10, outputTokens: 5, costUSD: 0.01 }, { content: "b", cached: true, inputTokens: 10, outputTokens: 5, costUSD: 0 }];
    let n = 0;
    const client = recordingClient({ chat: async () => { if (n === 2) throw new Error("down"); return replies[n++]!; } }, r, "fixes");
    await client.chat(); await client.chat();
    await expect(client.chat()).rejects.toThrow("down");
    expect(r.stages.get("fixes")).toEqual(usage(2, 1, 20, 10, 0.01));
  });
});

describe("runPipeline usage hook", () => {
  // A fake analyzer CLI: each stage writes the output file runPipeline reads, with its usage record.
  const exec = (failVerify: boolean, slow?: "review" | "review-ctx"): Execute => async (_file, args) => {
    const command = args[1]!;
    const value = (flag: string) => args[args.indexOf(flag) + 1]!;
    if (command === "review" || command === "review-ctx") {
      if (command === slow) await new Promise(done => setTimeout(done, 30));
      const u = command === "review" ? usage(2, 0, 100, 50, 0.001) : usage(3, 1, 300, 60, 0.002);
      await writeFile(value("--out"), JSON.stringify({ comments: [{ ...finding, line: command === "review" ? 1 : 40 }],
        review: { model: MODEL, chunkFailed: 0, chunks: [{ status: "OK" }], usage: u } }));
      return {};
    }
    if (failVerify) throw new Error("verifier crashed");
    const pool = JSON.parse(await readFile(value("--review"), "utf8")).comments as unknown[];
    const verify = { model: MODEL, findings: pool.length, kept: pool.length, dropped: 0, verifyFailed: 0, usage: usage(2, 0, 400, 80, 0.003) };
    await writeFile(value("--out"), JSON.stringify({ comments: pool.map(f => ({ ...f as object, status: "VERIFIED", verdict: "keep" })), verify }));
    await writeFile(value("--kept"), JSON.stringify({ comments: pool, verify: { model: MODEL, kept: pool.length } }));
    return {};
  };
  const input = { title: "T", body: "", number: 1, diff: "" };

  it("hands over each stage's usage record", async () => {
    const seen: [Stage, unknown][] = [];
    const out = await runPipeline(input, MODEL, "/fake/repo", "abc", () => {}, exec(false), { onUsage: (s, u) => seen.push([s, u]) });
    expect(out?.pipeline).toEqual({ pool: 2, kept: 2 });
    expect(Object.fromEntries(seen)).toEqual({ "diff reviewer": usage(2, 0, 100, 50, 0.001), "ctx reviewer": usage(3, 1, 300, 60, 0.002),
      verifier: usage(2, 0, 400, 80, 0.003) });
  });

  it.each([["diff first", "review-ctx"], ["ctx first", "review"]] as const)("keeps the reviewers' usage when the verifier fails and nothing is posted (%s)", async (_order, slow) => {
    const r = new UsageRecorder();
    const log = vi.fn();
    expect(await runPipeline(input, MODEL, "/fake/repo", "abc", log, exec(true, slow), { onUsage: r.add })).toBeNull();
    expect([...r.stages.keys()][0]).toBe(slow === "review" ? "ctx reviewer" : "diff reviewer");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("verify-ctx-v1 failed"));
    // The reviewers run concurrently and report as each finishes: compare membership and values, not order.
    expect(Object.fromEntries(r.stages)).toEqual({ "diff reviewer": usage(2, 0, 100, 50, 0.001), "ctx reviewer": usage(3, 1, 300, 60, 0.002) });
  });
});

describe("workflow_dispatch with a pr-number", () => {
  const pull = { title: "A change", body: null, number: 7, base: { sha: "base1" }, head: { sha: "abc", repo: { full_name: "example/widget" } } };
  const dispatchEnv = { NEBIUS_API_KEY: "fake-unused", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_TOKEN: "fake-unused",
    GITHUB_REPOSITORY: "example/widget", TRACEHOUND_PR_NUMBER: "7", TRACEHOUND_CONTRACTS: "off", TRACEHOUND_DRY_RUN: "true", TRACEHOUND_REPO_DIR: "/fake/repo" };

  it("reads the pull request from the API and reviews its head", async () => {
    const t = await setup();
    const urls: string[] = [];
    t.deps.fetch = vi.fn<typeof fetch>(async (url, init) => {
      urls.push(String(url));
      if (init?.method === "POST") throw new Error("dry run must not post");
      return new Headers(init?.headers).get("Accept") === "application/vnd.github.diff" ? new Response("") : Response.json(pull);
    });
    t.deps.runPipeline = vi.fn(async () => null);
    expect(await main(dispatchEnv, t.deps, { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(0);
    expect(urls[0]).toBe("https://api.github.com/repos/example/widget/pulls/7");
    expect(t.deps.checkRepoHead).toHaveBeenCalledWith("/fake/repo", "abc");
    expect(t.deps.runPipeline).toHaveBeenCalledWith({ title: "A change", body: "", number: 7, diff: "" }, "", "/fake/repo", "abc");
  });

  it("skips a fork pull request named by number", async () => {
    const t = await setup();
    t.deps.fetch = vi.fn<typeof fetch>(async () => Response.json({ ...pull, head: { sha: "abc", repo: { full_name: "someone/fork" } } }));
    expect(await main(dispatchEnv, t.deps, { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(0);
    expect(t.log).toHaveBeenCalledWith("TraceHound: fork pull request skipped.");
    expect(t.deps.runPipeline).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "7a", "1e3"])("rejects pr-number %j before any API call", async n => {
    const t = await setup();
    expect(await main({ ...dispatchEnv, TRACEHOUND_PR_NUMBER: n }, t.deps, { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(1);
    expect(t.deps.fetch).not.toHaveBeenCalled();
  });

  it("skips workflow_dispatch without a pr-number (the install matrix) with no API call", async () => {
    const t = await setup();
    expect(await main({ ...dispatchEnv, TRACEHOUND_PR_NUMBER: "" }, t.deps, { recorder: t.recorder, ledgerFile: t.ledgerFile })).toBe(0);
    expect(t.deps.fetch).not.toHaveBeenCalled();
  });
});
