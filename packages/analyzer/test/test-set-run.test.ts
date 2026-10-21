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
import { createHash } from "node:crypto";
import { ALLOWED_MODIFIED_067, buildClients, EXTRA_FROZEN_PATHS, FROZEN_PATHS, JUDGES, REVIEW_MODEL, runTestSet, writeNew, type Deps } from "../../../scripts/bench/run-test-set.ts";
import { minMedMax, rowSpread, spreadReport } from "../../../scripts/bench/spread.ts";
import {
  CAP_067_USD,
  checkRun,
  DEV_REPOS,
  EXTRA_CAP_USD,
  EXTRA_ITEMS,
  fetchTarget,
  isRequestFailure,
  ITEMS,
  ITEMS_067,
  modelRunDir,
  modelSlug,
  planDev067Item,
  planExtraItem,
  planItem,
  readItemStates,
  readStates067,
  readStatesOf,
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
import { baseUrlFor, DEFAULT_BASE_URL, type ChatRequest } from "../src/llm/client.ts";
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
  /** request model by stage, e.g. "review nvidia/…" */
  const models = new Set<string>();
  const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const req = JSON.parse(String(init?.body)) as ChatRequest;
    const sys = req.messages[0]!.content as string;
    const stage = sys === REVIEW_SYSTEM_PROMPT ? "review" : sys === REVIEW_CTX_SYSTEM_PROMPT ? "review-ctx" : sys === VERIFY_CTX_SYSTEM_PROMPT ? "verify-ctx" : "judge";
    models.add(`${stage} ${req.model}${stage === "judge" ? "" : ` max_tokens=${req.max_tokens} temperature=${req.temperature} thinking=${JSON.stringify(req.chat_template_kwargs)}`}`);
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
  return { fetch, calls, models };
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

// ---- decision 064: dev runs 4–6; Cal.com's path left as the tag review-freeze-1 has it ----

describe("dev runs 4–6 (decision 064)", () => {
  const done = (costUSD: number): ItemState => ({ status: "complete", costUSD });
  const crashed = (costUSD: number): ItemState => ({ status: "running", costUSD, firstScoreFiles: 0 });

  it("accepted for --set dev only; Cal.com and dev runs 1–3 refused as before", async () => {
    expect(() => checkRun("dev", "4", {})).toThrow(/refusing --run 4/); // checkRun is unchanged
    const bench = tmp("tracehound-064-refuse-");
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_TEST_RUN: "061" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "cal_dot_com", "--run", "4"], deps)).toBe(1);
    expect(await runTestSet(["--set", "dev", "--run", "10"], deps)).toBe(1); // 7–9 are 067's
    expect(await runTestSet(["--set", "dev", "--run", "5"], deps)).toBe(1); // order: run 4 first
    expect(out.join("\n")).toMatch(/refusing --run 4: 1, 2 or 3/);
    expect(out.join("\n")).toMatch(/refusing --run 10: 1, 2 or 3/);
    expect(out.join("\n")).toMatch(/dev run 4 has not run; the order is dev run 4, dev run 5, dev run 6/);
    expect(readdirSync(bench)).toEqual([]);
  });

  it("order and cap: 4, 5, 6 under one cap; a cap stop leaves later runs not done; 061's items play no part", () => {
    expect(EXTRA_ITEMS.map((i) => `${i.set}:${i.run}`)).toEqual(["dev:4", "dev:5", "dev:6"]);
    expect(planExtraItem(4, [null, null, null])).toEqual({ ok: true, allowanceUSD: EXTRA_CAP_USD });
    expect(planExtraItem(6, [done(2), done(2.5), null])).toEqual({ ok: true, allowanceUSD: EXTRA_CAP_USD - 4.5 });
    expect(planExtraItem(5, [{ status: "stopped-at-cap", costUSD: 8.5 }, null, null])).toEqual({ ok: false, why: "not done: the cap stopped dev run 4" });
    expect(planExtraItem(5, [done(8.5), null, null])).toEqual({ ok: false, why: expect.stringMatching(/not done: the cap is reached/) });
    expect(planExtraItem(4, [done(2), null, null])).toEqual({ ok: false, why: "dev run 4 already has a run directory" });
    // the one restart (061a), with the void run's spend carried
    expect(planExtraItem(5, [crashed(1), null, null])).toMatchObject({ ok: false, why: expect.stringMatching(/dev run 4 crashed and may be restarted once/) });
    expect(planExtraItem(4, [crashed(1), null, null], true)).toEqual({ ok: true, allowanceUSD: EXTRA_CAP_USD - 1 });
    // dev run 3 stopped at 061's cap: 061's order still refuses nothing new there, and 064's list ignores it
    const bench = tmp("tracehound-064-states-");
    put(path.join(runDir(bench, "dev", 3), "run.json"), { status: "stopped-at-cap", costUSD: 0.76 });
    put(path.join(runDir(bench, "dev", 4), "run.json"), { status: "complete", costUSD: 1.8 });
    expect(readStatesOf(bench, EXTRA_ITEMS)).toEqual([{ status: "complete", costUSD: 1.8, firstScoreFiles: 0 }, null, null]);
    expect(planExtraItem(5, readStatesOf(bench, EXTRA_ITEMS))).toEqual({ ok: true, allowanceUSD: EXTRA_CAP_USD - 1.8 });
  });

  it("the freeze check for runs 4–6 excludes only 064's runner files and vote script", () => {
    expect(EXTRA_FROZEN_PATHS.slice(0, FROZEN_PATHS.length)).toEqual(FROZEN_PATHS);
    expect(EXTRA_FROZEN_PATHS.slice(FROZEN_PATHS.length)).toEqual([":(exclude)scripts/bench/run-test-set.ts", ":(exclude)scripts/bench/test-set.ts", ":(exclude)scripts/bench/vote.ts"]);
  });

  it("runs the same pipeline into run-4/ and records decision 064", async () => {
    const bench = inventedBench();
    const { fetch } = fakeFetch(() => false);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "15" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "4"], deps)).toBe(0);
    const dir = runDir(bench, "dev", 4);
    expect(dir).toBe(path.join(bench, "reviews/dev-repeat/run-4"));
    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
    expect(run).toMatchObject({ decision: "064", set: "dev", run: 4, status: "complete", allowanceUSD: EXTRA_CAP_USD, trace: { frozenPaths: EXTRA_FROZEN_PATHS } });
    const rows = (row: string) => JSON.parse(readFileSync(path.join(dir, row, "sentry", "0.json"), "utf8")).comments.map((c: { line: number }) => c.line);
    expect([rows("review-diff-v1"), rows("pool-raw"), rows("pool-verify-v1")]).toEqual([[2], [2, 8], [2]]);
    for (const j of ["judge-v1", "judge-x1"]) expect(readdirSync(path.join(dir, "scores", j)).filter((f) => f.endsWith(".summary.json"))).toHaveLength(12);
    expect(out.join("\n")).toContain("## dev run 4 (decision 064)");
    expect(out.join("\n")).toContain("| pool-verify-v1 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 100.0% (4/4) | 100.0% (4/4) | 100.0% |");
    for (const s of SECRETS) expect(out.join("\n")).not.toContain(s);
    expect(await runTestSet(["--set", "dev", "--run", "4"], deps)).toBe(1); // never twice
  });
});

describe("Cal.com's path is the tag's (decision 064)", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const src = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../../../scripts/bench", f), "utf8");
  /** Undo each 064 edit (current text → the tag's), each exactly once. */
  const undo = (text: string, edits: [string, string][]) =>
    edits.reduce((t, [now, tag]) => {
      expect(t.split(now).length - 1, now).toBe(1);
      return t.replace(now, () => tag);
    }, text);

  /** Undo each 067 edit (current text → 064's), each exactly once; every one is a no-op unless the run is dev 7–9. */
  const undo067 = (text: string) =>
    undo(text, [
      ["// Decision 067 adds dev runs 7–9 and --model, for those runs only: the reviewer and verifier stages\n// use that model (prompts, temperature, reasoning, max_tokens unchanged; judges unchanged), and a\n// non-default model's records go to run-<n>-<model slug>/ with the model in run.json.\n", ""],
      ["//   node scripts/bench/run-test-set.ts --set dev --run 7|8|9 [--model <id>] [--restart] [--bench <dir>]\n", ""],
      ["  isDev067Run,\n", ""],
      ["  ITEMS_067,\n  modelRunDir,\n  modelSlug,\n", ""],
      ["  planDev067Item,\n", ""],
      ["  readStates067,\n", ""],
      ["  type Dev067Run,\n", ""],
      [", model = REVIEW_MODEL): Promise<Attempt> {", "): Promise<Attempt> {"],
      ["  const opts = { model, reasoning: REVIEW_REASONING };", "  const opts = { model: REVIEW_MODEL, reasoning: REVIEW_REASONING };"],
      ["  const vopts = { model, reasoning: REVIEW_REASONING,", "  const vopts = { model: REVIEW_MODEL, reasoning: REVIEW_REASONING,"],
      [text.match(/\n\/\*\*\n \* Decision 067's freeze check[\s\S]*?\n}\n/)![0], ""],
      ["  let dev067: boolean;\n  let model: string;\n", ""],
      [", model: { type: \"string\" } }, strict: true });", " }, strict: true });"],
      ["    dev067 = isDev067Run(values.set, values.run);\n    if (values.model !== undefined && !dev067) throw new Error(\"refusing --model: it applies to --set dev --run 7|8|9 only (decision 067)\");\n    if (values.model === \"\") throw new Error(\"refusing --model: empty\");\n    model = values.model ?? REVIEW_MODEL;\n", ""],
      ["extra || dev067 ? { set: \"dev\", run: Number(values.run) as DevExtraRun | Dev067Run }", "extra ? { set: \"dev\", run: Number(values.run) as DevExtraRun }"],
      ["  const slug = model === REVIEW_MODEL ? null : modelSlug(model);\n", ""],
      ["  const items = dev067 ? ITEMS_067 : extra ?", "  const items = extra ?"],
      ["  const states = dev067 ? readStates067(bench, slug) : extra ?", "  const states = extra ?"],
      ["voidRunReport(dev067 ? modelRunDir(bench, run as Dev067Run, slug) : runDir(bench, set, run), deps.stateDir)", "voidRunReport(runDir(bench, set, run), deps.stateDir)"],
      ["  const plan = dev067 ? planDev067Item(run as Dev067Run, states, restart) : extra ?", "  const plan = extra ?"],
      [": dev067 ? freezeCheck067() : freezeCheck(", ": freezeCheck("],
      ["  const dir = dev067 ? modelRunDir(bench, run as Dev067Run, slug, restart) : runDir(", "  const dir = runDir("],
      ['  const decision = dev067 ? "067" : extra ?', '  const decision = extra ?'],
      [", ...(dev067 && { frozenPaths: FROZEN_PATHS, allowedModified: ALLOWED_MODIFIED_067 }) },", " },"],
      ["      reviewModel: model,", "      reviewModel: REVIEW_MODEL,"],
      ["      const a1 = await pipeline(reviewer, job.input, repoSrc, model);", "      const a1 = await pipeline(reviewer, job.input, repoSrc);"],
      ["        used = await pipeline(reviewer, job.input, repoSrc, model);", "        used = await pipeline(reviewer, job.input, repoSrc);"],
    ]);

  // sha256 of `git show review-freeze-1:scripts/bench/<file>` (CI checks out without tags)
  const TAG_TEST_SET = "0d9a75b58410f839628f49c80ad914d4877c980e94ee4687c4f7c8b318693fa8";
  const TAG_RUNNER = "863dc39c4893a27cade371845b0871dcb2b60ffaeea8246c7acba7ffdd2b382e";

  it("test-set.ts: the tag's text plus an appended section; the one other change widens a type", () => {
    const now = src("test-set.ts");
    const marker = "\n// ---- dev runs 4–6 (decision 064) ----";
    expect(now.split(marker)).toHaveLength(2);
    const before = undo(now.split(marker)[0]!, [["export type RunNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;", "export type RunNumber = 1 | 2 | 3;"]]);
    expect(sha(before)).toBe(TAG_TEST_SET);
  });

  it("run-test-set.ts: the tag's text up to these edits, each a no-op unless the run is dev 4–6", () => {
    const edits: [string, string][] = [
      ["// Decision 064 adds dev runs 4–6: the same pipeline, records layout and rules, with their own order\n// and cap (test-set.ts, EXTRA_ITEMS) and a freeze check that allows only 064's runner changes.\n", ""],
      ["//   node scripts/bench/run-test-set.ts --set dev --run 4|5|6 [--restart] [--bench <dir>]\n", ""],
      ["  EXTRA_ITEMS,\n", ""],
      ["  isDevExtraRun,\n", ""],
      ["  planExtraItem,\n", ""],
      ["  readStatesOf,\n", ""],
      ["  type DevExtraRun,\n", ""],
      [src("run-test-set.ts").match(/\/\*\*\n \* Decision 064's dev runs 4–6[\s\S]*?\nexport const EXTRA_FROZEN_PATHS = [^\n]*\n/)![0], ""],
      ["export function freezeCheck(paths: string[] = FROZEN_PATHS)", "export function freezeCheck()"],
      ['git(["diff", "--quiet", FREEZE_TAG, "HEAD", "--", ...paths]).status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG} HEAD -- ${paths.join(" ")} is not empty`, head };', 'git(["diff", "--quiet", FREEZE_TAG, "HEAD", "--", ...FROZEN_PATHS]).status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG} HEAD -- ${FROZEN_PATHS.join(" ")} is not empty`, head };'],
      ['git(["diff", "--quiet", "HEAD", "--", ...paths]).status !== 0) return { ok: false, why: `uncommitted changes under ${paths.join(" ")}`, head };', 'git(["diff", "--quiet", "HEAD", "--", ...FROZEN_PATHS]).status !== 0) return { ok: false, why: `uncommitted changes under ${FROZEN_PATHS.join(" ")}`, head };'],
      ["  let extra: boolean;\n", ""],
      ["    extra = isDevExtraRun(values.set, values.run);\n    ({ set, run } = extra ? { set: \"dev\", run: Number(values.run) as DevExtraRun } : checkRun(values.set, values.run, deps.env));", "    ({ set, run } = checkRun(values.set, values.run, deps.env));"],
      ["  const items = extra ? EXTRA_ITEMS : ITEMS;\n  const states = extra ? readStatesOf(bench, EXTRA_ITEMS) : readItemStates(bench);\n  const idx = states.findIndex((_, i) => items[i]!.set === set && items[i]!.run === run);", "  const states = readItemStates(bench);\n  const idx = states.findIndex((_, i) => ITEMS[i]!.set === set && ITEMS[i]!.run === run);"],
      ["  const plan = extra ? planExtraItem(run as DevExtraRun, states, restart) : planItem(set, run, states, restart);", "  const plan = planItem(set, run, states, restart);"],
      ["  const freeze = deps.freezeCheck ? deps.freezeCheck() : freezeCheck(extra ? EXTRA_FROZEN_PATHS : FROZEN_PATHS);", "  const freeze = (deps.freezeCheck ?? freezeCheck)();"],
      ['  const decision = extra ? "064" : "061";\n', ""],
      ["    decision,\n", '    decision: "061",\n'],
      ["    trace: { head: freeze.head, freezeTag: FREEZE_TAG, ...(extra && { frozenPaths: EXTRA_FROZEN_PATHS }) },", "    trace: { head: freeze.head, freezeTag: FREEZE_TAG },"],
      ["  printSummary(`${label} (decision ${decision})`, state,", "  printSummary(label, state,"],
      ["  log(`## ${label}`);", "  log(`## ${label} (decision 061)`);"],
    ];
    expect(sha(undo(undo067(src("run-test-set.ts")), edits))).toBe(TAG_RUNNER);
  });

  it("a Cal.com run 1 on invented data: 061's decision, allowance, rows and heading", async () => {
    const bench = tmp("tracehound-064-cal-");
    const src = path.join(bench, "src-repo");
    mkdirSync(src);
    const git = (...args: string[]) => execFileSync("git", ["-C", src, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() });
    const lines = Array.from({ length: 10 }, (_, i) => `export const v${i + 1} = ${i + 1};`);
    git("init", "-q", "-b", "main");
    put(path.join(src, "src/a.ts"), lines.join("\n") + "\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD").trim();
    lines[1] = "export const v2 = 20;";
    lines[7] = "export const v8 = 80;";
    put(path.join(src, "src/a.ts"), lines.join("\n") + "\n");
    git("commit", "-q", "-am", "head");
    const head = git("rev-parse", "HEAD").trim();
    execFileSync("git", ["clone", "-q", "--bare", src, path.join(bench, "test/repos/cal_dot_com")], { env: cleanGitEnv() });
    put(path.join(bench, "test/repos/cal_dot_com.heads.json"), { 0: { head } });
    put(path.join(bench, "test/prs/cal_dot_com/0.json"), { number: 1, title: "SECRET-TITLE-cal_dot_com", body: "d", diff: git("diff", base, head) });
    put(path.join(bench, "golden/code_review_benchmarks/cal_dot_com.json"), [{ pr_title: "SECRET-TITLE-cal_dot_com", comments: [{ comment: "g", severity: "High" }] }]);
    for (const tool of TOOL_ROWS) put(path.join(bench, "reviews", tool, "cal_dot_com", "0.json"), { pr_title: "SECRET-TITLE-cal_dot_com", pr_number: 1, comments: [{ path: "src/a.ts", line: 2, body: "SECRET-BODY-diff" }] });
    const { fetch, models } = fakeFetch(() => false);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_TEST_RUN: "061", TRACEHOUND_BUDGET_RUN_USD: "15" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    // 067: --model is refused on Cal.com, with nothing written
    expect(await runTestSet(["--set", "cal_dot_com", "--run", "1", "--model", "nvidia/Nemotron-3.5-Super-VL"], deps)).toBe(1);
    expect(existsSync(runDir(bench, "cal_dot_com", 1))).toBe(false);
    expect(await runTestSet(["--set", "cal_dot_com", "--run", "1"], deps)).toBe(0);
    expect([...models].sort()).toEqual(PIPELINE_MODELS(REVIEW_MODEL));
    const run = JSON.parse(readFileSync(path.join(runDir(bench, "cal_dot_com", 1), "run.json"), "utf8"));
    expect(run).toMatchObject({ decision: "061", set: "cal_dot_com", run: 1, status: "complete", allowanceUSD: 15, trace: { head: "x", freezeTag: "review-freeze-1" } });
    expect(Object.keys(run.trace)).toEqual(["head", "freezeTag"]);
    expect(run.config.reviewModel).toBe(REVIEW_MODEL);
    expect(readdirSync(path.join(runDir(bench, "cal_dot_com", 1), "scores", "judge-v1")).filter((f) => f.endsWith(".summary.json"))).toHaveLength(8);
    expect(out.join("\n")).toContain("## cal_dot_com run 1 (decision 061)");
  });
});

// ---- decision 067: dev runs 7–9 with --model ----

/** What the pipeline and both judges send, by stage, for a reviewer model: prompts' settings unchanged. */
const PIPELINE_MODELS = (model: string) =>
  [
    ...([["review", 32000], ["review-ctx", 32000], ["verify-ctx", 16000]] as const).map(([stage, max]) => `${stage} ${model} max_tokens=${max} temperature=0 thinking={"enable_thinking":true}`),
    ...JUDGES.map((j) => `judge ${j.model}`),
  ].sort();

describe("dev runs 7–9 with --model (decision 067)", () => {
  const M = "nvidia/Nemotron-3.5-Super-VL";
  const done = (costUSD: number): ItemState => ({ status: "complete", costUSD });

  it("--model only with --set dev --run 7|8|9; refusals write nothing", async () => {
    const bench = tmp("tracehound-067-refuse-");
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_TEST_RUN: "061" }, log: (l) => out.push(l), err: (l) => out.push(l), freezeCheck: () => ({ ok: true, head: "x" }) };
    for (const args of [["--set", "dev", "--run", "2"], ["--set", "dev", "--run", "4"], ["--set", "cal_dot_com", "--run", "2"]]) expect(await runTestSet([...args, "--model", M], deps)).toBe(1);
    expect(await runTestSet(["--set", "dev", "--run", "7", "--model", ""], deps)).toBe(1);
    expect(await runTestSet(["--set", "dev", "--run", "8", "--model", M], deps)).toBe(1); // order: run 7 first
    expect(await runTestSet(["--set", "dev", "--run", "10", "--model", M], deps)).toBe(1);
    expect(out.join("\n")).toMatch(/refusing --model: it applies to --set dev --run 7\|8\|9 only/);
    expect(out.join("\n")).toMatch(/dev run 7 has not run; the order is dev run 7, dev run 8, dev run 9/);
    expect(readdirSync(bench)).toEqual([]);
  });

  it("slug, directories, order and cap per model", () => {
    expect(modelSlug(M)).toBe("nvidia-nemotron-3-5-super-vl");
    expect(modelRunDir("/b", 7, modelSlug(M))).toBe(path.join("/b", "reviews/dev-repeat/run-7-nvidia-nemotron-3-5-super-vl"));
    expect(modelRunDir("/b", 7, modelSlug(M), true)).toBe(path.join("/b", "reviews/dev-repeat/run-7-nvidia-nemotron-3-5-super-vlr"));
    expect(modelRunDir("/b", 8, null)).toBe(runDir("/b", "dev", 8));
    expect(ITEMS_067.map((i) => `${i.set}:${i.run}`)).toEqual(["dev:7", "dev:8", "dev:9"]);
    expect(CAP_067_USD).toBe(8);
    expect(planDev067Item(7, [null, null, null])).toEqual({ ok: true, allowanceUSD: 8 });
    expect(planDev067Item(9, [done(2), done(2.5), null])).toEqual({ ok: true, allowanceUSD: 3.5 });
    expect(planDev067Item(8, [{ status: "stopped-at-cap", costUSD: 8 }, null, null])).toEqual({ ok: false, why: "not done: the cap stopped dev run 7" });
    const bench = tmp("tracehound-067-states-");
    put(path.join(modelRunDir(bench, 7, modelSlug(M)), "run.json"), { status: "complete", costUSD: 2 });
    expect(readStates067(bench, modelSlug(M))).toEqual([{ status: "complete", costUSD: 2, firstScoreFiles: 0 }, null, null]);
    expect(readStates067(bench, null)).toEqual([null, null, null]); // another model's runs are counted apart
  });

  it("the freeze check allows exactly these modified files", () => {
    expect(ALLOWED_MODIFIED_067).toEqual(["config/prices.json", "packages/analyzer/src/bin.ts", "packages/analyzer/src/config.ts", "packages/analyzer/src/llm/client.ts", "scripts/bench/run-test-set.ts", "scripts/bench/test-set.ts"]);
  });

  it("client.ts routes only the 3.5 id to us-north1: the reviewer and both judges keep the configured URL", () => {
    expect(DEFAULT_BASE_URL).toBe("https://api.tokenfactory.us-central1.nebius.com/v1");
    for (const model of [REVIEW_MODEL, ...JUDGES.map((j) => j.model)]) expect(baseUrlFor(model, DEFAULT_BASE_URL), model).toBe(DEFAULT_BASE_URL);
    expect(baseUrlFor("nvidia/Nemotron-3.5-Super-VL", DEFAULT_BASE_URL)).toBe("https://api.tokenfactory.us-north1.nebius.com/v1");
  });

  it("runs the pipeline with the model into run-7-<slug>/, judges unchanged, model and decision 067 in run.json", async () => {
    const bench = inventedBench();
    const { fetch, models } = fakeFetch(() => false);
    const out: string[] = [];
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "15" }, log: (l) => out.push(l), err: (l) => out.push(l), fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "7", "--model", M], deps)).toBe(0);
    expect([...models].sort()).toEqual(PIPELINE_MODELS(M));
    const dir = path.join(bench, "reviews/dev-repeat/run-7-nvidia-nemotron-3-5-super-vl");
    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
    expect(run).toMatchObject({ decision: "067", set: "dev", run: 7, status: "complete", allowanceUSD: 8, config: { reviewModel: M, reasoning: "on", judges: JUDGES }, trace: { frozenPaths: FROZEN_PATHS, allowedModified: ALLOWED_MODIFIED_067 } });
    expect(existsSync(runDir(bench, "dev", 7))).toBe(false);
    for (const j of ["judge-v1", "judge-x1"]) expect(readdirSync(path.join(dir, "scores", j)).filter((f) => f.endsWith(".summary.json"))).toHaveLength(12);
    expect(out.join("\n")).toContain("## dev run 7 (decision 067)");
    for (const sec of SECRETS) expect(out.join("\n")).not.toContain(sec);
    expect(await runTestSet(["--set", "dev", "--run", "7", "--model", M], deps)).toBe(1); // never twice
  });

  it("dev run 4 still sends the default model everywhere", async () => {
    const bench = inventedBench();
    const { fetch, models } = fakeFetch(() => false);
    const deps: Deps = { bench, stateDir: path.join(bench, ".state"), pricesFile: PRICES, env: { NEBIUS_API_KEY: "k", TRACEHOUND_BUDGET_RUN_USD: "15" }, log: () => {}, err: () => {}, fetch, freezeCheck: () => ({ ok: true, head: "x" }) };
    expect(await runTestSet(["--set", "dev", "--run", "4"], deps)).toBe(0);
    expect([...models].sort()).toEqual(PIPELINE_MODELS(REVIEW_MODEL));
  });
});
