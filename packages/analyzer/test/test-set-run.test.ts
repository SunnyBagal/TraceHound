// The test-set runner of decision 061 (scripts/bench/test-set.ts, run-test-set.ts, spread.ts):
// refusals, cache reads off for reviewer and verifier calls, the rerun rule, the cap and its order
// of cuts, no overwrite, fixed rows, spread arithmetic, counts-only output, the one restart of a
// crashed run (061a). Invented data in temp
// dirs and a fake fetch; no network, no dataset text. The open test-set gate is not exercised here.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildClients, runTestSet, writeNew, type Deps } from "../../../scripts/bench/run-test-set.ts";
import { minMedMax, rowSpread, spreadReport } from "../../../scripts/bench/spread.ts";
import {
  checkRun,
  DEV_REPOS,
  fetchTarget,
  isRequestFailure,
  ITEMS,
  planItem,
  readItemStates,
  requireTestRun,
  restartRefusal,
  rowsFor,
  runDir,
  TOOL_ROWS,
  TRACEHOUND_ROWS,
  type ItemState,
} from "../../../scripts/bench/test-set.ts";
import { JUDGE_SYSTEM_PROMPT } from "../src/bench/judge.ts";
import { zeroCounts, type Counts } from "../src/bench/score.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import type { ChatRequest } from "../src/llm/client.ts";
import { REVIEW_CTX_SYSTEM_PROMPT } from "../src/review/prompt-ctx.ts";
import { REVIEW_SYSTEM_PROMPT } from "../src/review/prompt.ts";
import { VERIFY_CTX_SYSTEM_PROMPT } from "../src/review/verify-ctx-prompt.ts";

const PRICES = path.resolve(import.meta.dirname, "../../../config/prices.json");
const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (prefix: string) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
};
const put = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 1) + "\n");
};

describe("gates and refusals", () => {
  it("refuses the test set without TRACEHOUND_TEST_RUN=061", () => {
    expect(() => requireTestRun({})).toThrow(/TRACEHOUND_TEST_RUN=061/);
    expect(() => requireTestRun({ TRACEHOUND_TEST_RUN: "060" })).toThrow(/TRACEHOUND_TEST_RUN=061/);
    expect(() => requireTestRun({ TRACEHOUND_TEST_RUN: "" })).toThrow(/TRACEHOUND_TEST_RUN=061/);
    expect(() => fetchTarget(["--test-set", "cal_dot_com"], {}, "/b")).toThrow(/TRACEHOUND_TEST_RUN=061/);
    expect(() => checkRun("cal_dot_com", "1", {})).toThrow(/TRACEHOUND_TEST_RUN=061/);
  });

  it("fetch scripts: dev repos as before, any other repo or test set refused", () => {
    expect(fetchTarget([], {}, "/b")).toEqual({ repos: [...DEV_REPOS], root: "/b", testSet: false });
    expect(fetchTarget(["--repos", "grafana,keycloak"], {}, "/b").repos).toEqual(["grafana", "keycloak"]);
    expect(() => fetchTarget(["--repos", "cal_dot_com"], {}, "/b")).toThrow(/refusing repo cal_dot_com: dev repos only/);
    expect(() => fetchTarget(["--repos", "sentry,other"], {}, "/b")).toThrow(/refusing repo other/);
    expect(() => fetchTarget(["--test-set", "sentry"], {}, "/b")).toThrow(/refusing --test-set sentry/);
    expect(() => fetchTarget(["--test-set", "calcom"], {}, "/b")).toThrow(/refusing --test-set calcom/);
    expect(() => fetchTarget(["--test-set", "cal_dot_com", "--repos", "cal_dot_com"], {}, "/b")).toThrow(/refusing/);
  });

  it("runner: refuses another set name, dev run 1 and runs outside 1–3", () => {
    expect(() => checkRun("sentry", "2", {})).toThrow(/refusing --set sentry/);
    expect(() => checkRun("calcom", "2", {})).toThrow(/refusing --set calcom/);
    expect(() => checkRun("dev", "1", {})).toThrow(/dev run 1 is decision 059's run/);
    expect(() => checkRun("dev", "4", {})).toThrow(/refusing --run 4/);
    expect(checkRun("dev", "2", {})).toEqual({ set: "dev", run: 2 });
  });

  it("runner refusals write nothing", async () => {
    const bench = tmp("tracehound-061-refuse-");
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "cal_dot_com", "--run", "1"], deps)).toBe(1);
    expect(await runTestSet(["--set", "dev", "--run", "1"], deps)).toBe(1);
    expect(await runTestSet(["--set", "other", "--run", "2"], deps)).toBe(1);
    expect(await runTestSet(["--set", "dev", "--run", "2", "--row", "extra"], deps)).toBe(1); // no option adds a row
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(1); // Cal.com runs 1–3 have not run: order
    expect(out.join("\n")).toMatch(/TRACEHOUND_TEST_RUN=061/);
    expect(out.join("\n")).toMatch(/has not run; the order is/);
    expect(readdirSync(bench)).toEqual([]);
  });

  it("the freeze check failing refuses the run", async () => {
    const bench = tmp("tracehound-061-freeze-");
    priorCalRuns(bench);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: false, why: "no tag review-freeze-1", head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(1);
    expect(out.join("\n")).toMatch(/no tag review-freeze-1/);
    expect(existsSync(runDir(bench, "dev", 2))).toBe(false);
  });
});

describe("rows", () => {
  it("are fixed, in order, and cannot be added to", () => {
    expect([...rowsFor("dev", 2)]).toEqual(["pool-verify-v1", "review-diff-v1", "pool-raw"]);
    expect([...rowsFor("dev", 3)]).toEqual([...TRACEHOUND_ROWS]);
    expect([...rowsFor("cal_dot_com", 2)]).toEqual([...TRACEHOUND_ROWS]);
    expect([...rowsFor("cal_dot_com", 1)]).toEqual(["pool-verify-v1", "review-diff-v1", "pool-raw", "greptile", "coderabbit", "augment", "cursor", "copilot"]);
    for (const rows of [rowsFor("cal_dot_com", 1), rowsFor("dev", 2), TOOL_ROWS]) {
      expect(Object.isFrozen(rows)).toBe(true);
      expect(() => (rows as string[]).push("extra")).toThrow(TypeError);
    }
    expect(rowsFor("cal_dot_com", 1)).toHaveLength(8);
  });
});

describe("the cap and its order of cuts", () => {
  const done = (costUSD: number): ItemState => ({ status: "complete", costUSD });
  const states = (...xs: (ItemState | null)[]) => [...xs, ...Array(ITEMS.length - xs.length).fill(null)];

  it("order: Cal.com run 1, 2, 3, then dev run 2, 3", () => {
    expect(ITEMS.map((i) => `${i.set}:${i.run}`)).toEqual(["cal_dot_com:1", "cal_dot_com:2", "cal_dot_com:3", "dev:2", "dev:3"]);
    expect(planItem("cal_dot_com", 2, states())).toEqual({ ok: false, why: expect.stringMatching(/cal_dot_com run 1 has not run/) });
    expect(planItem("dev", 2, states(done(1), done(1)))).toEqual({ ok: false, why: expect.stringMatching(/cal_dot_com run 3 has not run/) });
  });

  it("allowances: run 1 gets the whole $15, repeats their group's cap and what is left", () => {
    expect(planItem("cal_dot_com", 1, states())).toEqual({ ok: true, allowanceUSD: 15 });
    expect(planItem("cal_dot_com", 2, states(done(7)))).toEqual({ ok: true, allowanceUSD: 5 });
    expect(planItem("cal_dot_com", 3, states(done(7), done(4.5)))).toEqual({ ok: true, allowanceUSD: 0.5 });
    expect(planItem("dev", 2, states(done(7), done(4), done(1)))).toEqual({ ok: true, allowanceUSD: 3 });
    expect(planItem("dev", 2, states(done(5), done(2), done(2)))).toEqual({ ok: true, allowanceUSD: 4 });
    expect(planItem("dev", 3, states(done(5), done(2), done(2), done(3)))).toEqual({ ok: true, allowanceUSD: 1 });
    expect(planItem("cal_dot_com", 2, states(done(13)))).toEqual({ ok: true, allowanceUSD: 2 });
  });

  it("cuts: the latest items go first, and a cap stop leaves every later item not done", () => {
    expect(planItem("dev", 3, states(done(7), done(4), done(1), done(3)))).toEqual({ ok: false, why: expect.stringMatching(/not done: the cap is reached/) });
    expect(planItem("cal_dot_com", 2, states(done(15)))).toEqual({ ok: false, why: expect.stringMatching(/not done/) });
    const stopped: ItemState = { status: "stopped-at-cap", costUSD: 5 };
    for (const [set, run] of [["cal_dot_com", 3], ["dev", 2], ["dev", 3]] as const) {
      expect(planItem(set, run, states(done(6), stopped, null, null, null))).toEqual({ ok: false, why: "not done: the cap stopped cal_dot_com run 2" });
    }
    // a void run that may not be restarted (a score file exists) does not block the order; its recorded spend counts
    expect(planItem("cal_dot_com", 2, states({ status: "running", costUSD: 3, firstScoreFiles: 1 }))).toEqual({ ok: true, allowanceUSD: 5 });
  });

  it("an item with a run directory never runs again", () => {
    expect(planItem("cal_dot_com", 1, states(done(1)))).toEqual({ ok: false, why: "cal_dot_com run 1 already has a run directory" });
  });
});

describe("files", () => {
  it("writeNew never overwrites", () => {
    const d = tmp("tracehound-061-files-");
    const f = path.join(d, "a", "b.json");
    writeNew(f, { x: 1 });
    expect(() => writeNew(f, { x: 2 })).toThrow(/EEXIST/);
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual({ x: 1 });
  });

  it("an existing run directory is refused and left untouched", async () => {
    const bench = tmp("tracehound-061-exists-");
    priorCalRuns(bench);
    const dir = runDir(bench, "dev", 2);
    put(path.join(dir, "keep.json"), { mine: true });
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(1);
    expect(out.join("\n")).toMatch(/already has a run directory/);
    expect(readdirSync(dir)).toEqual(["keep.json"]);
  });

  it("isRequestFailure: failed requests only, not invalid replies", () => {
    expect(isRequestFailure("request failed: HTTP 503: overloaded")).toBe(true);
    expect(isRequestFailure("the reply is not valid JSON; retry request failed: fetch failed")).toBe(true);
    expect(isRequestFailure("the reply is not valid JSON; after one retry: the reply is not valid JSON")).toBe(false);
    expect(isRequestFailure(undefined)).toBe(false);
  });
});

describe("clients", () => {
  it("reviewer and verifier calls never read the cache; judge calls may", async () => {
    const state = tmp("tracehound-061-cache-");
    const request: ChatRequest = { model: "nvidia/nemotron-3-super-120b-a12b", temperature: 0, max_tokens: 100, messages: [{ role: "user", content: "x" }] };
    new ResponseCache(path.join(state, "cache")).put(ResponseCache.key(request.model, request), { choices: [{ message: { content: "from cache" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    let fetched = 0;
    const fetch = (async () => {
      fetched++;
      return new Response(JSON.stringify({ choices: [{ message: { content: "from network" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    }) as typeof globalThis.fetch;
    const { reviewer, judge } = buildClients({ apiKey: "k", stateDir: state, pricesFile: PRICES, allowanceUSD: 1, env: {}, fetch });
    const r = await reviewer.chat(request, { purpose: "review" });
    expect(r).toMatchObject({ cached: false, content: "from network" });
    expect(fetched).toBe(1);
    const j = await judge.chat(request, { purpose: "bench-judge" });
    expect(j.cached).toBe(true);
    expect(fetched).toBe(1);
  });

  it("the per-process cap is the smaller of TRACEHOUND_BUDGET_RUN_USD and the allowance", () => {
    const state = tmp("tracehound-061-budget-");
    expect(buildClients({ apiKey: "k", stateDir: state, pricesFile: PRICES, allowanceUSD: 4, env: { TRACEHOUND_BUDGET_RUN_USD: "15" } }).budget.caps.runUSD).toBe(4);
    expect(buildClients({ apiKey: "k", stateDir: state, pricesFile: PRICES, allowanceUSD: 15, env: { TRACEHOUND_BUDGET_RUN_USD: "15" } }).budget.caps.runUSD).toBe(15);
    expect(buildClients({ apiKey: "k", stateDir: state, pricesFile: PRICES, allowanceUSD: 4, env: {} }).budget.caps.runUSD).toBe(1);
  });
});

// ---- an invented bench: the four dev repo names, one pull request each, one tiny git repo ----

const SECRETS = ["SECRET-TITLE", "SECRET-DESCRIPTION", "SECRET-BODY", "SECRET-GOLDEN", "SECRET-REASON", "SECRET-CODE"];

/** Cal.com runs 1–3 as already done (invented run.json files), so dev run 2 is next in the order. */
function priorCalRuns(bench: string) {
  for (const run of [1, 2, 3] as const) put(path.join(runDir(bench, "cal_dot_com", run), "run.json"), { status: "complete", costUSD: 1 });
}

function inventedBench(): string {
  const bench = tmp("tracehound-061-bench-");
  const src = path.join(bench, "src-repo");
  mkdirSync(src);
  const git = (...args: string[]) => execFileSync("git", ["-C", src, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() });
  const lines = Array.from({ length: 10 }, (_, i) => `export const v${i + 1} = ${i + 1}; // SECRET-CODE`);
  git("init", "-q", "-b", "main");
  put(path.join(src, "src/a.ts"), lines.join("\n") + "\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").trim();
  lines[1] = "export const v2 = 20; // SECRET-CODE";
  lines[7] = "export const v8 = 80; // SECRET-CODE";
  put(path.join(src, "src/a.ts"), lines.join("\n") + "\n");
  git("commit", "-q", "-am", "head");
  const head = git("rev-parse", "HEAD").trim();
  const diff = git("diff", base, head);
  for (const repo of DEV_REPOS) {
    execFileSync("git", ["clone", "-q", "--bare", src, path.join(bench, "repos", repo)], { env: cleanGitEnv() });
    put(path.join(bench, "repos", `${repo}.heads.json`), { 0: { head } });
    put(path.join(bench, "prs", repo, "0.json"), { golden_index: 0, number: 1, title: `SECRET-TITLE-${repo}`, body: "SECRET-DESCRIPTION", diff });
    put(path.join(bench, "golden/code_review_benchmarks", `${repo}.json`), [{ pr_title: `SECRET-TITLE-${repo}`, comments: [{ comment: "SECRET-GOLDEN", severity: "High" }] }]);
  }
  priorCalRuns(bench);
  return bench;
}

/** Answers by system prompt: review-diff-v1 finds line 2, review-ctx-v1 line 8 (ctx-only), the verifier keeps line 2's finding, the judge matches it to G1. */
function fakeFetch(failReview: (repo: string, n: number) => boolean) {
  const calls: Record<string, Record<string, number>> = { review: {}, ctx: {}, verify: {}, judge: {} };
  const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const req = JSON.parse(String(init?.body)) as ChatRequest;
    const sys = req.messages[0]!.content as string;
    const user = req.messages[1]!.content as string;
    const repo = /SECRET-TITLE-(\w+)/.exec(user)?.[1] ?? "?";
    const count = (k: string) => (calls[k]![repo] = (calls[k]![repo] ?? 0) + 1);
    let content: string;
    if (sys === REVIEW_SYSTEM_PROMPT) {
      if (failReview(repo, count("review"))) return new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 });
      content = JSON.stringify({ findings: [{ path: "src/a.ts", line: 2, body: "SECRET-BODY-diff" }] });
    } else if (sys === REVIEW_CTX_SYSTEM_PROMPT) {
      count("ctx");
      content = JSON.stringify({ findings: [{ path: "src/a.ts", line: 8, body: "SECRET-BODY-ctx" }] });
    } else if (sys === VERIFY_CTX_SYSTEM_PROMPT) {
      count("verify");
      content = JSON.stringify({ verdict: user.includes("SECRET-BODY-diff") ? "keep" : "drop", reason: "SECRET-REASON" });
    } else if (sys === JUDGE_SYSTEM_PROMPT) {
      count("judge");
      const blocks = user.split("Review comments:\n\n")[1]!.split("\n\n---\n\n");
      content = JSON.stringify({ matches: blocks.map((b) => ({ tool: /^(T\d+)/.exec(b)![1], golden: b.includes("SECRET-BODY-diff") ? "G1" : null })) });
    } else throw new Error("unexpected request");
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("a dev repeat run on invented data", () => {
  it("runs the pipeline, reruns a failed pull request once keeping attempt 1, judges three rows, prints counts only", async () => {
    const bench = inventedBench();
    // grafana: the first review request fails, the rerun succeeds; keycloak: every review request fails
    const { fetch, calls } = fakeFetch((repo, n) => (repo === "grafana" && n === 1) || repo === "keycloak");
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(0);
    const dir = runDir(bench, "dev", 2);

    // the rerun rule: one rerun, the first attempt kept
    expect(calls.review).toEqual({ sentry: 1, grafana: 2, keycloak: 2, discourse: 1 });
    expect(calls.ctx).toEqual({ sentry: 1, grafana: 2, keycloak: 2, discourse: 1 }); // identical requests, sent again: no cache reads
    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
    expect(run.status).toBe("complete");
    expect(run.config.reviewerCacheReads).toBe(false);
    expect(run.pulls.map((p: { repo: string; attempts: number; requestFailuresFirst: number; requestFailuresUsed: number }) => [p.repo, p.attempts, p.requestFailuresFirst, p.requestFailuresUsed])).toEqual([
      ["sentry", 1, 0, 0],
      ["grafana", 2, 1, 0],
      ["keycloak", 2, 1, 1],
      ["discourse", 1, 0, 0],
    ]);
    const a1 = JSON.parse(readFileSync(path.join(dir, "attempts/grafana/0.attempt-1.json"), "utf8"));
    expect(a1.diff.review.chunks[0].failure).toMatch(/request failed: HTTP 503/);
    expect(existsSync(path.join(dir, "attempts/grafana/0.attempt-2.json"))).toBe(true);
    expect(existsSync(path.join(dir, "attempts/sentry/0.attempt-2.json"))).toBe(false);

    // the pool and the verifier: review-diff-v1 kept, then ctx-only kept
    const rows = (row: string, repo: string) => JSON.parse(readFileSync(path.join(dir, row, repo, "0.json"), "utf8")).comments.map((c: { line: number }) => c.line);
    expect(rows("review-diff-v1", "sentry")).toEqual([2]);
    expect(rows("pool-raw", "sentry")).toEqual([2, 8]);
    expect(rows("pool-verify-v1", "sentry")).toEqual([2]);
    expect(rows("pool-raw", "keycloak")).toEqual([8]);

    // both judges, three rows, in order
    for (const j of ["judge-v1", "judge-x1"]) expect(readdirSync(path.join(dir, "scores", j)).filter((f) => f.endsWith(".summary.json"))).toHaveLength(12);
    const text = out.join("\n");
    const tableLines = text.split("\n").filter((l) => /^\| (pool|review|greptile|coderabbit|augment|cursor|copilot)/.test(l));
    expect(tableLines.map((l) => l.split(" | ")[0])).toEqual(["| pool-verify-v1", "| review-diff-v1", "| pool-raw", "| pool-verify-v1", "| review-diff-v1", "| pool-raw"]);
    expect(text).toContain("| pool-verify-v1 | 3 | 3 | 0 | 0 | 0 | 1 | 0 | 100.0% (3/3) | 75.0% (3/4) | 85.7% |");
    expect(text).toContain("| pool-raw | 7 | 3 | 4 | 0 | 0 | 1 | 0 | 42.9% (3/7) | 75.0% (3/4) | 54.5% |");
    expect(text).toMatch(/reruns 2 · still with failed requests after the rerun 1/);

    // counts only: no title, description, comment, golden, reason or code text reaches stdout or stderr
    for (const s of SECRETS) expect(text).not.toContain(s);
    // ...while the files in the bench folder do hold them
    expect(readFileSync(path.join(dir, "pool-verify-v1/sentry/0.json"), "utf8")).toContain("SECRET-BODY-diff");
  });

  it("stops at the cap, and every later item is then not done", async () => {
    const bench = inventedBench();
    const { fetch, calls } = fakeFetch(() => false);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "0.001" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(2);
    expect(calls.review).toEqual({}); // refused before any request
    const run = JSON.parse(readFileSync(path.join(runDir(bench, "dev", 2), "run.json"), "utf8"));
    expect(run).toMatchObject({ status: "stopped-at-cap", stoppedAt: "pull request 1 of 4" });
    expect(existsSync(path.join(runDir(bench, "dev", 2), "scores"))).toBe(false);
    expect(readItemStates(bench).map((s) => s?.status ?? null)).toEqual(["complete", "complete", "complete", "stopped-at-cap", null]);
    expect(await runTestSet(["--set", "dev", "--run", "3"], { ...deps, env: { NEBIUS_API_KEY: "k" } })).toBe(1);
    expect(out.join("\n")).toMatch(/STOPPED AT THE CAP/);
    expect(out.join("\n")).toMatch(/refusing dev run 3: not done: the cap stopped dev run 2/);
    for (const s of SECRETS) expect(out.join("\n")).not.toContain(s);
  });
});

describe("the one restart of a crashed run (061a)", () => {
  const done = (costUSD: number): ItemState => ({ status: "complete", costUSD });
  const crashed = (costUSD: number, firstScoreFiles = 0): ItemState => ({ status: "running", costUSD, firstScoreFiles });
  const states = (...xs: (ItemState | null)[]) => [...xs, ...Array(ITEMS.length - xs.length).fill(null)];

  it("refused without run-<n>/, after a complete or cap-stopped run, with a score file, and a second time", () => {
    expect(restartRefusal(null, "run-1")).toBe("run-1/ does not exist");
    expect(restartRefusal(done(1), "run-1")).toMatch(/run-1\/ is complete; only a crashed run/);
    expect(restartRefusal({ status: "stopped-at-cap", costUSD: 1 }, "run-1")).toMatch(/run-1\/ is stopped-at-cap/);
    expect(restartRefusal(crashed(1, 2), "run-1")).toMatch(/scores\/ holds 2 file\(s\): a result exists, so the run is void with no restart/);
    expect(restartRefusal({ status: "running", costUSD: 1, restarted: true, firstStatus: "running" }, "run-1")).toMatch(/run-1r\/ already exists/);
    expect(restartRefusal(crashed(1), "run-1")).toBeNull();
    expect(planItem("cal_dot_com", 1, states(), true)).toEqual({ ok: false, why: "run-1/ does not exist" });
    expect(planItem("cal_dot_com", 1, states(done(3)), true)).toMatchObject({ ok: false });
    expect(planItem("cal_dot_com", 1, states(crashed(3, 1)), true)).toMatchObject({ ok: false });
  });

  it("spend carry-over: the restart gets what is left of its item's allowance after the void run", () => {
    expect(planItem("cal_dot_com", 1, states(crashed(2.5)), true)).toEqual({ ok: true, allowanceUSD: 12.5 });
    expect(planItem("cal_dot_com", 2, states(done(6), crashed(1.5)), true)).toEqual({ ok: true, allowanceUSD: 3.5 });
    expect(planItem("dev", 2, states(done(5), done(2), done(2), crashed(1)), true)).toEqual({ ok: true, allowanceUSD: 3 });
    expect(planItem("dev", 2, states(done(7), done(4), done(1), crashed(2.5)), true)).toEqual({ ok: true, allowanceUSD: 0.5 });
    expect(planItem("dev", 3, states(done(5), done(2), done(2), crashed(4)), false)).toMatchObject({ ok: false }); // dev run 2 must be restarted first
    expect(planItem("dev", 2, states(done(5), done(2), done(2), crashed(4)), true)).toEqual({ ok: false, why: expect.stringMatching(/not done: the cap is reached/) });
    // the restarted item's spend (both directories) counts for later items
    expect(planItem("cal_dot_com", 3, states({ status: "complete", costUSD: 7, restarted: true, firstStatus: "running" }, { status: "complete", costUSD: 3, restarted: true, firstStatus: "running" }))).toEqual({ ok: true, allowanceUSD: 2 });
  });

  it("order: a restartable crash blocks later items; 1r stands for 1; a crashed restart is void and blocks nothing", () => {
    expect(planItem("cal_dot_com", 2, states(crashed(1)))).toEqual({ ok: false, why: "cal_dot_com run 1 crashed and may be restarted once: restart it first (--set cal_dot_com --run 1 --restart)" });
    expect(planItem("cal_dot_com", 2, states({ status: "complete", costUSD: 7, restarted: true, firstStatus: "running" }))).toEqual({ ok: true, allowanceUSD: 5 });
    expect(planItem("cal_dot_com", 2, states({ status: "running", costUSD: 7, restarted: true, firstStatus: "running" }))).toEqual({ ok: true, allowanceUSD: 5 });
    expect(planItem("cal_dot_com", 2, states({ status: "stopped-at-cap", costUSD: 15, restarted: true, firstStatus: "running" }))).toEqual({ ok: false, why: "not done: the cap stopped cal_dot_com run 1" });
    expect(planItem("cal_dot_com", 1, states({ status: "complete", costUSD: 7, restarted: true, firstStatus: "running" }))).toEqual({ ok: false, why: "cal_dot_com run 1 already has a run directory" });
  });

  it("readItemStates reads run-<n>r/ as run n, with both directories' spend", () => {
    const bench = tmp("tracehound-061a-states-");
    put(path.join(runDir(bench, "cal_dot_com", 1), "run.json"), { status: "running", costUSD: 2 });
    put(path.join(runDir(bench, "cal_dot_com", 1, true), "run.json"), { status: "complete", costUSD: 3, voidCostUSD: 2.5 });
    put(path.join(runDir(bench, "cal_dot_com", 2), "run.json"), { status: "running", costUSD: 1 });
    put(path.join(runDir(bench, "cal_dot_com", 2), "scores/judge-v1/pool-verify-v1-cal_dot_com.summary.json"), {});
    expect(runDir(bench, "cal_dot_com", 1, true)).toBe(path.join(bench, "test", "run-1r"));
    const s = readItemStates(bench);
    expect(s[0]).toEqual({ status: "complete", costUSD: 5.5, restarted: true, firstStatus: "running", firstScoreFiles: 0 });
    expect(s[1]).toEqual({ status: "running", costUSD: 1, firstScoreFiles: 1 });
    expect(planItem("cal_dot_com", 3, s)).toEqual({ ok: true, allowanceUSD: 5 - 1 });
  });

  /** dev run 2 left crashed: status running, one pull request done, and ledger spend run.json missed. */
  function crashedDevRun2(bench: string, extra: Record<string, unknown> = {}) {
    const startedAt = "2026-10-17T10:00:00.000Z";
    put(path.join(runDir(bench, "dev", 2), "run.json"), { status: "running", costUSD: 0.5, startedAt, pulls: [{ repo: "sentry" }], error: "TypeError: SECRET-CODE broke", ...extra });
    const entry = (timestamp: string, estCostUSD: number) => JSON.stringify({ timestamp, model: "m", inputTokens: 1, outputTokens: 1, estCostUSD, purpose: "review" });
    put(path.join(bench, ".state", "spend.jsonl"), [entry("2026-10-16T09:00:00.000Z", 9), entry("2026-10-17T10:01:00.000Z", 0.4), entry("2026-10-17T10:02:00.000Z", 0.3)].join("\n") + "\n");
  }
  const listAll = (d: string) => readdirSync(d, { recursive: true }).map(String).sort();

  it("runs once into run-2r/, leaves run-2/ untouched and reported, carries its spend, and is refused a second time", async () => {
    const bench = inventedBench();
    crashedDevRun2(bench);
    const voidDir = runDir(bench, "dev", 2);
    const before = listAll(voidDir);
    const voidJson = readFileSync(path.join(voidDir, "run.json"), "utf8");
    const { fetch } = fakeFetch(() => false);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "15" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "3"], deps)).toBe(1); // not before the restart
    expect(await runTestSet(["--set", "dev", "--run", "2"], deps)).toBe(1); // no plain rerun
    expect(await runTestSet(["--set", "dev", "--run", "2", "--restart"], deps)).toBe(0);

    expect(listAll(voidDir)).toEqual(before);
    expect(readFileSync(path.join(voidDir, "run.json"), "utf8")).toBe(voidJson);
    const r = JSON.parse(readFileSync(path.join(runDir(bench, "dev", 2, true), "run.json"), "utf8"));
    expect(r).toMatchObject({ status: "complete", restart: true, restartOf: { status: "running", recordedCostUSD: 0.5, pullsDone: 1, stoppedAt: "pull request 2 of 4", error: "TypeError: SECRET-CODE broke" } });
    expect(r.voidCostUSD).toBeCloseTo(0.7, 9); // the ledger since the void run started, above run.json's $0.5
    expect(r.allowanceUSD).toBeCloseTo(4 - 0.7, 9); // dev-repeats' $4 minus the void run
    const text = out.join("\n");
    expect(text).toMatch(/refusing dev run 3: dev run 2 crashed and may be restarted once/);
    expect(text).toMatch(/refusing dev run 2: dev run 2 already has a run directory/);
    expect(text).toMatch(/dev run 2 \(restarted\): void run-2\/ left untouched, never scored · spend \$0\.7000 .* stopped at pull request 2 of 4 · error TypeError/);
    expect(text).toContain("## dev run 2 (restarted) (decision 061)");
    expect(text).toMatch(/\[run-test-set\] dev run 2 \(restarted\): pull request 4\/4 done/);
    for (const s of SECRETS) expect(text).not.toContain(s);

    const states = readItemStates(bench);
    expect(states[3]).toMatchObject({ status: "complete", restarted: true });
    expect(states[3]!.costUSD).toBeCloseTo(0.7 + r.costUSD, 9);
    expect(await runTestSet(["--set", "dev", "--run", "2", "--restart"], deps)).toBe(1);
    expect(out.join("\n")).toMatch(/refusing dev run 2 \(restarted\): run-2r\/ already exists/);
    expect(planItem("dev", 3, states)).toEqual({ ok: true, allowanceUSD: expect.closeTo(4 - 0.7 - r.costUSD, 9) });
  });

  it("refused, with nothing written, when a score file exists or the run completed or stopped at the cap", async () => {
    for (const [extra, scores, why] of [
      [{}, true, /scores\/ holds 1 file\(s\)/],
      [{ status: "complete" }, false, /run-2\/ is complete/],
      [{ status: "stopped-at-cap" }, false, /run-2\/ is stopped-at-cap/],
    ] as const) {
      const bench = inventedBench();
      crashedDevRun2(bench, extra);
      if (scores) put(path.join(runDir(bench, "dev", 2), "scores/judge-v1/pool-raw-sentry.summary.json"), {});
      const { fetch, calls } = fakeFetch(() => false);
      const out: string[] = [];
      const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
      expect(await runTestSet(["--set", "dev", "--run", "2", "--restart"], deps)).toBe(1);
      expect(out.join("\n")).toMatch(why);
      expect(existsSync(runDir(bench, "dev", 2, true))).toBe(false);
      expect(calls.review).toEqual({});
    }
  });

  it("refused when run-<n>/ does not exist", async () => {
    const bench = inventedBench();
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "2", "--restart"], deps)).toBe(1);
    expect(out.join("\n")).toMatch(/run-2\/ does not exist/);
    expect(existsSync(runDir(bench, "dev", 2, true))).toBe(false);
  });
});

describe("spread", () => {
  const counts = (tp: number, fp: number, fn: number): Counts => ({ ...zeroCounts(), comments: tp + fp, tp, fp, fn, goldenCounted: tp + fn });

  it("min / median / max on a hand-worked example", () => {
    // run 1: P 26/72 = 0.361111, R 26/74 = 0.351351, F 52/146 = 0.356164
    // run 2: P 20/50 = 0.4,      R 20/74 = 0.270270, F 40/124 = 0.322581
    // run 3: P 30/90 = 0.333333, R 30/74 = 0.405405, F 60/164 = 0.365854
    const s = rowSpread("pool-verify-v1", [counts(26, 46, 48), counts(20, 30, 54), counts(30, 60, 44)]);
    expect(s.runs).toBe(3);
    expect(s.p!.min).toBeCloseTo(0.333333, 5);
    expect(s.p!.median).toBeCloseTo(0.361111, 5);
    expect(s.p!.max).toBeCloseTo(0.4, 5);
    expect(s.r!.min).toBeCloseTo(0.27027, 5);
    expect(s.r!.median).toBeCloseTo(0.351351, 5);
    expect(s.r!.max).toBeCloseTo(0.405405, 5);
    expect(s.fSpread!.min).toBeCloseTo(0.322581, 5);
    expect(s.fSpread!.median).toBeCloseTo(0.356164, 5);
    expect(s.fSpread!.max).toBeCloseTo(0.365854, 5);
  });

  it("reads a restarted run from run-<n>r/ and labels it", () => {
    const bench = tmp("tracehound-061a-spread-");
    const summary = (dir: string, c: Counts) => {
      for (const j of ["judge-v1", "judge-x1"]) for (const row of TRACEHOUND_ROWS) put(path.join(dir, "scores", j, `${row}-cal_dot_com.summary.json`), { counts: c });
    };
    put(path.join(runDir(bench, "cal_dot_com", 1), "run.json"), { status: "running", costUSD: 1 }); // void, no scores
    summary(runDir(bench, "cal_dot_com", 1, true), counts(1, 1, 1)); // F 50.0%
    summary(runDir(bench, "cal_dot_com", 2), counts(1, 3, 1)); // F 33.3%
    const lines = spreadReport(bench, "cal_dot_com").filter((l) => l.startsWith("| pool-verify-v1 "));
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toContain("| pool-verify-v1 | 2 | 50.0% (restarted) / 33.3% / not done |");
    expect(rowSpread("x", [counts(1, 1, 1)], [true]).restarted).toEqual([true]);
  });

  it("a run not done is shown and left out; an even count takes the mean of the middle two", () => {
    const s = rowSpread("pool-raw", [counts(26, 46, 48), null, counts(30, 60, 44)]);
    expect(s.runs).toBe(2);
    expect(s.f[1]).toBeNull();
    expect(s.fSpread!.median).toBeCloseTo((52 / 146 + 60 / 164) / 2, 9);
    expect(minMedMax([3, 1])).toEqual({ min: 1, median: 2, max: 3 });
    expect(minMedMax([])).toBeNull();
  });
});
