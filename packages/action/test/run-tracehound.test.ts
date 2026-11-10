// scripts/run-tracehound.ts (bunny-runner brief, fix round 1): dry run makes no model and no gh call; the Action's
// pipeline is called with the case's base/head; per-case, global and per-run caps; no overwrite; --post guards (owner,
// fork, parent, PR refs and both PR shas, re-checked right before the comment), scoped gh argv, allowlisted gh env, no
// duplicate comment; a fake key never leaks, also when gh fails and dumps its env. One local git fixture repo per file
// (copied per test) behind a /bin/sh recording shim, a fake pipeline, a fake gh. No network, no model.
import { copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import { Budget, BudgetExceededError, capsFromEnv } from "../../analyzer/src/llm/budget.ts";
import { ACTION_DEFAULTS, assertGh, caseCaps, main, MARKER, MIN_CASE_USD, stageEnv, type RunnerDeps } from "../../../scripts/run-tracehound.ts";
import type { Execute, PipelineOutput } from "../src/pipeline.ts";
import { parseYaml } from "./yaml-lite.ts";

const FIX = path.join(import.meta.dirname, "fixtures");
const KEY = "sk-fake-SECRET-4242-do-not-leak";
const OTHER = "other-service-token-7777";
const FORK = "SunnyBagal/twenty";
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
// the shared repo is built once, in a hook, so no single test carries its git calls
beforeAll(() => { repo(); });

type Case = { id: string; base: string; head: string; upstream: string };
type Fixture = { dir: string; clone: string; manifest: string; ledger: string; out: string; gh: string; git: string;
  gitLog: string; ghLog: string; ghState: string; cases: Case[] };

/** One repo for the whole file: base, then case-901..903 each one commit on it, plus same-tree "upstream" commits. */
let template: { clone: string; cases: Case[] } | undefined;
function repo(): { clone: string; cases: Case[] } {
  if (template) return template;
  const dir = mkdtempSync(path.join(tmpdir(), "th-runner-template-"));
  dirs.push(dir);
  const clone = path.join(dir, "clone");
  const env = { ...cleanGitEnv(), GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  const git = (...a: string[]) => execFileSync("git", ["-C", clone, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8", env }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", clone], { env });
  writeFileSync(path.join(clone, "a.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");
  const cases: Case[] = [];
  for (let i = 1; i <= 3; i++) {
    const id = `case-90${i}`;
    const blob = execFileSync("git", ["-C", clone, "hash-object", "-w", "--stdin"], { input: `export const a = ${i + 1};\nexport const b${i} = a;\n`, encoding: "utf8", env }).trim();
    const tree = execFileSync("git", ["-C", clone, "mktree"], { input: `100644 blob ${blob}\ta.ts\n`, encoding: "utf8", env }).trim();
    const head = git("commit-tree", tree, "-p", base, "-m", `case ${i}`);
    const upstream = git("commit-tree", tree, "-p", base, "-m", "upstream squash");
    git("branch", `cases/${id}-base`, base);
    git("branch", `cases/${id}`, head);
    cases.push({ id, base, head, upstream });
  }
  return (template = { clone, cases });
}

function fixture(n = 3): Fixture {
  const t = repo();
  const dir = mkdtempSync(path.join(tmpdir(), "th-runner-"));
  dirs.push(dir);
  const clone = path.join(dir, "clone");
  cpSync(t.clone, clone, { recursive: true });
  const cases = t.cases.slice(0, n);
  const f: Fixture = { dir, clone, manifest: path.join(dir, "manifest.json"), ledger: path.join(dir, "spend.jsonl"),
    out: path.join(dir, "out"), gh: path.join(dir, "gh"), git: path.join(dir, "git"), gitLog: path.join(dir, "git.log"),
    ghLog: path.join(dir, "gh.log"), ghState: path.join(dir, "gh.json"), cases };
  // the fakes find their state and logs next to themselves: the runner gives gh and git an allowlisted env only
  copyFileSync(path.join(FIX, "runner-fake-gh.mjs"), f.gh + ".mjs");
  writeFileSync(f.gh, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/gh.mjs" "$@"\n`, { mode: 0o755 });
  copyFileSync(path.join(FIX, "runner-git-shim.sh"), f.git);
  execFileSync("chmod", ["+x", f.git]);
  writeFileSync(f.manifest, JSON.stringify(cases.map((c, i) => ({ id: c.id, repo: "twenty", pr: 101 + i, base_sha: c.base,
    head_sha: c.upstream, case_head_sha: c.head, title: `Case ${i + 1} title`, description: `Case ${i + 1} body` }))));
  writeFileSync(f.ledger, entry(0.01));
  writeFileSync(f.gitLog, "");
  writeFileSync(f.ghLog, "");
  ghState(f, {});
  return f;
}

const entry = (usd: number) => JSON.stringify({ timestamp: "2026-11-10T00:00:00Z", model: "fake", inputTokens: 1, outputTokens: 1, estCostUSD: usd, purpose: "review" }) + "\n";

const prView = (c: Case, n: number, over: Record<string, unknown> = {}) => ({ number: n, url: `https://github.com/${FORK}/pull/${n}`, state: "OPEN",
  headRefName: `cases/${c.id}`, baseRefName: `cases/${c.id}-base`, baseRefOid: c.base, headRefOid: c.head, isCrossRepository: false, ...over });

function ghState(f: Fixture, over: { repo?: unknown; prs?: Record<string, unknown>; comments?: Record<string, unknown[]>; failComment?: boolean;
  changeOnView?: Record<string, { after: number; pr: Record<string, unknown> }>; changeOnCommentsLookup?: Record<string, Record<string, unknown>> }) {
  const prs = Object.fromEntries(f.cases.map((c, i) => [String(11 + i), prView(c, 11 + i)]));
  writeFileSync(f.ghState, JSON.stringify({
    repo: over.repo ?? { full_name: FORK, fork: true, owner: { login: "SunnyBagal" }, parent: { full_name: "twentyhq/twenty" } },
    prs: { ...prs, ...over.prs }, comments: over.comments ?? {}, failComment: over.failComment ?? false, changeOnView: over.changeOnView ?? {},
    changeOnCommentsLookup: over.changeOnCommentsLookup ?? {},
  }));
  writeFileSync(path.join(f.dir, "prmap.json"), JSON.stringify(Object.fromEntries(f.cases.map((c, i) => [c.id, 11 + i]))));
}

type Calls = { pipeline: { input: unknown; model: string; repo: string; head: string }[]; stages: { cmd: string; env: NodeJS.ProcessEnv }[];
  model: number; contracts: { base: string; head: string }[]; checkHead: string[]; logs: string[] };

/** spend: $ appended to the ledger per case (by the fake verifier); budget: the stage whose child dies on the budget */
function deps(f: Fixture, o: { spend?: number; budget?: string; findings?: number; totalCap?: string } = {}): { d: RunnerDeps; calls: Calls } {
  const calls: Calls = { pipeline: [], stages: [], model: 0, contracts: [], checkHead: [], logs: [] };
  const exec: Execute = async (_file, args, options) => {
    calls.stages.push({ cmd: args[1]!, env: options.env });
    if (args[1] === o.budget) throw Object.assign(new Error("Command failed"), { stderr: "BudgetExceededError: refusing review on fake: over TRACEHOUND_BUDGET_RUN_USD=0.125" });
    calls.model++;
    if (args[1] === "verify-ctx" && o.spend) writeFileSync(f.ledger, readFileSync(f.ledger, "utf8") + entry(o.spend));
    return {};
  };
  const d: RunnerDeps = {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NEBIUS_API_KEY: KEY, OTHER_SERVICE_TOKEN: OTHER,
      TRACEHOUND_BUDGET_TOTAL_USD: o.totalCap ?? "50" },
    log: (l) => calls.logs.push(l), ledgerFile: f.ledger, envFile: path.join(f.dir, "no.env"),
    runPipeline: async (input, model, repoDir, head, _log, ex): Promise<PipelineOutput | null> => {
      calls.pipeline.push({ input, model, repo: repoDir, head });
      const child = { cwd: f.dir, env: { ...process.env, NEBIUS_API_KEY: KEY }, maxBuffer: 1 };
      try {
        await Promise.all([ex(process.execPath, ["bin.ts", "review"], child), ex(process.execPath, ["bin.ts", "review-ctx"], child)]);
        await ex(process.execPath, ["bin.ts", "verify-ctx"], child);
      } catch {
        return null;
      }
      const comments = Array.from({ length: o.findings ?? 2 }, (_, i) => ({ path: "a.ts", line: 1, body: `Synthetic finding ${i}` }));
      return { comments, sources: comments.map(() => "diff" as const), review: { model: "fake-model", chunkFailed: 0 },
        pipeline: { pool: comments.length + 1, kept: comments.length }, stages: { chunksOk: 2, chunksFailed: 0 } };
    },
    checkRepoHead: async (_repo, head) => { calls.checkHead.push(head); },
    runFixes: async (findings, _d, _r, _h, client) => {
      await client.chat({ model: "fake", messages: [] } as never, { purpose: "fix" });
      return { suggestions: findings.map(() => null), counts: { attempted: findings.length, valid: 0, rejected: findings.length } };
    },
    createFixClient: () => ({ chat: async () => { calls.model++; return { content: "{}" }; } }),
    runContracts: async (_repo, base, head) => { calls.contracts.push({ base, head }); return { status: "ok", findings: [], ms: 1 }; },
    exec,
  };
  return { d, calls };
}

const args = (f: Fixture, ...extra: string[]) => ["--manifest", f.manifest, "--clone", f.clone, "--out-dir", f.out, "--git-bin", f.git, "--gh-bin", f.gh, ...extra];
type GhLine = { argv: string[]; GH_REPO: string; env: string; envKeys: string[]; stdin: string; cwd: string };
const ghLines = (f: Fixture) => readFileSync(f.ghLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as GhLine);
const gitLines = (f: Fixture) => readFileSync(f.gitLog, "utf8").split("\n").filter(Boolean).map((l) => {
  const bar = l.lastIndexOf("|");
  return { argv: l.slice(0, bar).split("\t").slice(0, -1), noLazy: l.slice(bar + 1) };
});
const outFiles = (f: Fixture) => existsSync(f.out) ? readdirSync(f.out).sort() : [];
const post = (f: Fixture) => ["--post", "--repo", FORK, "--pr-map", path.join(f.dir, "prmap.json")];

describe("dry run", () => {
  it("makes zero model calls and zero gh calls, writes nothing, and prints the plan", async () => {
    const f = fixture(2);
    const { d, calls } = deps(f);
    expect(await main(args(f), d)).toBe(0);
    expect(calls.model + calls.pipeline.length + calls.stages.length + calls.checkHead.length).toBe(0);
    expect(ghLines(f)).toEqual([]);
    expect(outFiles(f)).toEqual([]);
    const text = calls.logs.join("\n");
    expect(text).toContain("DRY RUN");
    expect(text).toContain("per case $0.25 (each reviewer $0.125");
    expect(text).toContain("per run $2 (at most 8 case(s)");
    for (const c of f.cases) expect(text).toContain(`${c.id}: twenty base ${c.base} head ${c.head} (tree = upstream head) · diff 1 files`);
    expect(text).toContain(`allowance min(per-case cap, global total cap − ledger) is computed per case on --execute; minimum $${MIN_CASE_USD}`);
    // git: read-only commands only, never a lazy fetch
    const g = gitLines(f);
    expect(g.length).toBeGreaterThan(0);
    for (const l of g) {
      expect(l.argv.slice(0, 2)).toEqual(["-C", f.clone]);
      expect(["rev-parse", "diff", "ls-tree", "cat-file"]).toContain(l.argv[2]);
      expect(l.noLazy).toBe("1");
    }
  });

  it("refuses a local branch that is not at the manifest sha, and --post without --execute", async () => {
    const f = fixture(1);
    const m = JSON.parse(readFileSync(f.manifest, "utf8"));
    m[0].case_head_sha = f.cases[0]!.base;
    writeFileSync(f.manifest, JSON.stringify(m));
    const { d, calls } = deps(f);
    expect(await main(args(f), d)).toBe(2);
    expect(calls.logs.join("\n")).toContain("local cases/case-901 is not case_head_sha");
    const g = fixture(1);
    const r = deps(g);
    expect(await main(args(g, ...post(g)), r.d)).toBe(2);
    expect(r.calls.logs.join("\n")).toContain("--post needs --execute");
    expect(ghLines(g)).toEqual([]);
  });

  it("reports blobs missing from the clone, and --execute refuses before any model call", async () => {
    const f = fixture(1);
    const blob = execFileSync("git", ["-C", f.clone, "rev-parse", `${f.cases[0]!.head}:a.ts`], { encoding: "utf8", env: cleanGitEnv() }).trim();
    expect(existsSync(path.join(f.clone, ".git/objects", blob.slice(0, 2), blob.slice(2)))).toBe(true);
    unlinkSync(path.join(f.clone, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    const { d, calls } = deps(f);
    expect(await main(args(f), d)).toBe(0);
    expect(calls.logs.join("\n")).toContain("missing blobs base 0 / head 1");
    expect(await main(args(f, "--execute"), d)).toBe(2);
    expect(calls.logs.join("\n")).toContain("REFUSED: blobs missing in the clone for case-901");
    expect(calls.model + calls.pipeline.length).toBe(0);
  });
});

describe("execute", () => {
  it("runs the Action's pipeline on the case's base and head and writes one record per case", async () => {
    const f = fixture(2);
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute"), d)).toBe(0);
    expect(calls.pipeline.map((p) => p.head)).toEqual(f.cases.map((c) => c.head));
    expect(calls.checkHead).toEqual(f.cases.map((c) => c.head));
    expect(calls.contracts).toEqual(f.cases.map((c) => ({ base: c.base, head: c.head })));
    for (const p of calls.pipeline) {
      expect(p.model).toBe(ACTION_DEFAULTS.model);
      expect(p.repo).toBe(f.clone);
      const input = p.input as { title: string; body: string; diff: string };
      expect(input.diff).toBe(execFileSync("git", ["-C", f.clone, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames",
        "--src-prefix=a/", "--dst-prefix=b/", f.cases[calls.pipeline.indexOf(p)]!.base, p.head], { encoding: "utf8", env: cleanGitEnv() }));
      expect(input.title).toMatch(/^Case \d title$/);
    }
    expect(outFiles(f)).toEqual(["case-901.json", "case-902.json"]);
    const rec = JSON.parse(readFileSync(path.join(f.out, "case-901.json"), "utf8"));
    expect(rec).toMatchObject({ case: "case-901", repo: "twenty", base: f.cases[0]!.base, head: f.cases[0]!.head, status: "ok",
      reviewer: "pool-verify-v1", pr_title: "Case 1 title", tree_equal_upstream: true,
      comments: [{ path: "a.ts", line: 1, body: "Synthetic finding 0" }, { path: "a.ts", line: 1, body: "Synthetic finding 1" }],
      review: { findings: 2, posted: 2, pool: 3, kept: 2, fixes: { attempted: 2, valid: 0, rejected: 2 } },
      settings: { cache: "off", maxUsdPerCase: 0.25, fixes: "on", contracts: "on", learn: "off" } });
    expect(Object.keys(rec.prompts)).toEqual(["review-diff-v1", "review-ctx-v1", "verify-ctx-v1", "fix"]);
    expect(rec.versions.analyzer).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rec.tracehound.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(rec.usage.ledger).toEqual({ calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 });
    expect(ghLines(f)).toEqual([]); // no --post: no gh
  });

  it("gives every stage the case caps, cache reads off, and no lazy fetch", async () => {
    const f = fixture(1);
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", "--max-usd-per-case", "0.2"), d)).toBe(0);
    const env = (cmd: string) => calls.stages.find((s) => s.cmd === cmd)!.env;
    const total = String(Math.min(50, 0.01 + 0.2));
    expect(env("review")).toMatchObject({ TRACEHOUND_BUDGET_RUN_USD: "0.1", TRACEHOUND_BUDGET_TOTAL_USD: total, TRACEHOUND_CACHE_READ: "off", GIT_NO_LAZY_FETCH: "1" });
    expect(env("review-ctx")).toMatchObject({ TRACEHOUND_BUDGET_RUN_USD: "0.1", TRACEHOUND_BUDGET_TOTAL_USD: total });
    expect(env("verify-ctx")).toMatchObject({ TRACEHOUND_BUDGET_RUN_USD: "0.2", TRACEHOUND_BUDGET_TOTAL_USD: total });
    expect(stageEnv({}, "verify-ctx", caseCaps(9, 1, 0.25), "read").TRACEHOUND_CACHE_READ).toBe("on");
  });

  it("splits the global remainder, not the per-case cap, when the remainder is smaller (codex's $10 / $10.10 / $0.25 probe)", async () => {
    const caps = caseCaps(10.1, 10, 0.25);
    expect(caps.allowanceUSD).toBeCloseTo(0.1, 10);
    expect(caps.reviewerRunUSD).toBeCloseTo(0.05, 10);
    expect(caseCaps(9, 10, 0.25).allowanceUSD).toBe(0); // ledger already over the global cap
    // two real Budgets, one per parallel reviewer process, built from the env each child gets
    const reviewers = ["review", "review-ctx"].map((cmd) => new Budget(capsFromEnv(stageEnv({}, cmd, caps, "off")), 10));
    let accepted = 0;
    for (const b of reviewers) {
      for (;;) {
        try { b.reserve(0.01, "probe"); accepted += 0.01; } catch (e) { expect(e).toBeInstanceOf(BudgetExceededError); break; }
      }
    }
    expect(accepted).toBeLessThanOrEqual(0.1 + 1e-9);
    for (const b of reviewers) expect(() => b.reserve(0.08, "probe")).toThrow(BudgetExceededError); // codex's $0.08 each
    // a later stage starts from the ledger after the reviewers: the total cap leaves it only what is left of the allowance
    const verifier = new Budget(capsFromEnv(stageEnv({}, "verify-ctx", caps, "off")), 10 + accepted);
    expect(() => verifier.reserve(0.1 - accepted + 0.001, "probe")).toThrow(BudgetExceededError);
    expect(() => new Budget(capsFromEnv(stageEnv({}, "verify-ctx", caps, "off")), 10.1).reserve(0.001, "probe")).toThrow(BudgetExceededError);
    // through the runner: ledger $10, global cap $10.10, per case $0.25 -> reviewers $0.05 each, every total $10.10
    const f = fixture(1);
    writeFileSync(f.ledger, entry(10));
    const { d, calls } = deps(f, { totalCap: "10.1" });
    expect(await main(args(f, "--execute", "--max-usd-per-case", "0.25"), d)).toBe(0);
    for (const s of calls.stages) {
      expect(Number(s.env.TRACEHOUND_BUDGET_TOTAL_USD)).toBeCloseTo(10.1, 10);
      expect(Number(s.env.TRACEHOUND_BUDGET_RUN_USD)).toBeCloseTo(s.cmd === "verify-ctx" ? 0.1 : 0.05, 10);
    }
  });

  it("does not start a case when the global remainder is below the minimum", async () => {
    const f = fixture(2);
    writeFileSync(f.ledger, entry(10.05));
    const { d, calls } = deps(f, { totalCap: "10.1" });
    expect(await main(args(f, "--execute"), d)).toBe(3);
    expect(calls.pipeline).toEqual([]);
    expect(outFiles(f)).toEqual([]);
    expect(calls.logs.join("\n")).toContain(`STOPPED before case-901: the global total cap leaves $0.0500`);
    expect(await main(args(f, "--max-usd-per-case", "0.05"), d)).toBe(2); // a per-case cap below the minimum is refused
  });

  it("marks a case cap when a stage dies on the budget, and goes on", async () => {
    const f = fixture(2);
    const { d } = deps(f, { budget: "review-ctx" });
    expect(await main(args(f, "--execute"), d)).toBe(1);
    for (const id of ["case-901", "case-902"]) {
      const rec = JSON.parse(readFileSync(path.join(f.out, `${id}.json`), "utf8"));
      expect(rec.status).toBe("cap");
      expect(rec.comments).toEqual([]);
    }
  });

  it("stops before a case that could take the run over --max-usd-run", async () => {
    // two cases are enough: the first fits (0 + 0.25 <= 0.4), the second would not (0.2 spent + 0.25 > 0.4)
    const f = fixture(2);
    const { d, calls } = deps(f, { spend: 0.2 });
    expect(await main(args(f, "--execute", "--max-usd-per-case", "0.25", "--max-usd-run", "0.4"), d)).toBe(3);
    expect(outFiles(f)).toEqual(["case-901.json"]);
    expect(calls.pipeline).toHaveLength(1);
    expect(calls.logs.join("\n")).toContain("STOPPED before case-902: run spent $0.2000 + per-case cap $0.25 > --max-usd-run $0.4; not run: case-902");
  });

  it("never overwrites a record; --rerun writes <id>.r2.json", async () => {
    const f = fixture(1);
    const { d } = deps(f);
    expect(await main(args(f, "--execute"), d)).toBe(0);
    const before = readFileSync(path.join(f.out, "case-901.json"), "utf8");
    const again = deps(f);
    expect(await main(args(f, "--execute"), again.d)).toBe(2);
    expect(again.calls.pipeline).toEqual([]);
    expect(again.calls.logs.join("\n")).toContain("exists; never overwritten");
    expect(readFileSync(path.join(f.out, "case-901.json"), "utf8")).toBe(before);
    expect(await main(args(f, "--execute", "--rerun"), deps(f).d)).toBe(0);
    expect(outFiles(f)).toEqual(["case-901.json", "case-901.r2.json"]);
    expect(readFileSync(path.join(f.out, "case-901.json"), "utf8")).toBe(before);
  });
});

describe("--post", () => {
  it.each([
    ["octocat/twenty", "must match ^SunnyBagal"],
    ["SunnyBagal/twenty/../x", "must match ^SunnyBagal"],
    ["SunnyBagal/..", "bad fork name"],
  ])("refuses --repo %s before any call", async (repo, why) => {
    const f = fixture(1);
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", "--post", "--repo", repo, "--pr-map", path.join(f.dir, "prmap.json")), d)).toBe(2);
    expect(calls.logs.join("\n")).toContain(why);
    expect(ghLines(f)).toEqual([]);
    expect(calls.model + calls.pipeline.length).toBe(0);
  });

  it.each([
    ["a repo that is not a fork", { repo: { full_name: FORK, fork: false, owner: { login: "SunnyBagal" }, parent: { full_name: "twentyhq/twenty" } } }, "is not a fork"],
    ["a wrong parent", { repo: { full_name: FORK, fork: true, owner: { login: "SunnyBagal" }, parent: { full_name: "evil/twenty" } } }, "parent is \"evil/twenty\""],
    ["a PR whose refs are not the case's", (c: Case) => ({ prs: { "11": prView(c, 11, { headRefName: "main" }) } }), "expected cases/case-901-base <- cases/case-901"],
    ["a PR whose head is another commit", (c: Case) => ({ prs: { "11": prView(c, 11, { headRefOid: "0".repeat(40) }) } }), "head is not case_head_sha"],
    ["a PR with the right ref names and head but another base sha", (c: Case) => ({ prs: { "11": prView(c, 11, { baseRefOid: "e".repeat(40) }) } }), "base is not base_sha"],
  ] as [string, (c: Case) => unknown, string][])("refuses %s before any model call", async (_name, over, why) => {
    const f = fixture(1);
    ghState(f, (typeof over === "function" ? over(f.cases[0]!) : over) as never);
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(2);
    expect(calls.logs.join("\n")).toContain(why);
    expect(calls.model + calls.pipeline.length).toBe(0);
    expect(ghLines(f).some((l) => l.argv[1] === "comment")).toBe(false);
  });

  it("never posts twice on a rerun: the case's marker is already on the PR", async () => {
    const f = fixture(1);
    ghState(f, { comments: { "11": [{ body: `${MARKER("case-901")}\nan earlier run` }] } });
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
    expect(ghLines(f).some((l) => l.argv[1] === "comment")).toBe(false);
    expect(calls.logs.join("\n")).toContain("already has a TraceHound runner comment for this case; not posted again");
  });

  it("posts one comment per case, every gh call scoped to the fork, the PR re-read last before each write", async () => {
    const f = fixture(2);
    const { d } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
    const first = ghLines(f);
    for (const l of first) {
      expect(l.GH_REPO).toBe(FORK);
      expect(realpathSync(l.cwd)).toBe(realpathSync(tmpdir()));
      if (l.argv[0] === "api") expect(l.argv[3] === `repos/${FORK}` || l.argv[3]!.startsWith(`repos/${FORK}/issues/`)).toBe(true);
      else expect(l.argv.slice(3, 5)).toEqual(["--repo", FORK]);
    }
    const comments = first.filter((l) => l.argv[1] === "comment");
    expect(comments.map((l) => l.argv[2])).toEqual(["11", "12"]);
    expect(comments[0]!.stdin.startsWith(MARKER("case-901"))).toBe(true);
    expect(comments[0]!.stdin).toContain("Synthetic finding 0");
    // per case: marker lookup, then the PR view, then the comment; nothing between the view and the write
    const kinds = first.map((l) => l.argv[0] === "api" ? (l.argv[3]!.includes("/comments") ? "comments" : "repo") : l.argv[1]);
    expect(kinds).toEqual(["repo", "view", "view", "comments", "view", "comment", "comments", "view", "comment"]);
    expect(outFiles(f)).toEqual(["case-901.json", "case-901.post.json", "case-902.json", "case-902.post.json"]);
  });

  it("a rerun after a post posts nothing new", async () => {
    const f = fixture(1);
    expect(await main(args(f, "--execute", ...post(f)), deps(f).d)).toBe(0);
    const r = deps(f);
    expect(await main(args(f, "--execute", "--rerun", ...post(f)), r.d)).toBe(0);
    expect(ghLines(f).filter((l) => l.argv[1] === "comment")).toHaveLength(1);
    expect(r.calls.logs.join("\n")).toContain("case-901: PR #11 already has a TraceHound runner comment for this case; not posted again");
  });

  it("a ref that moves during the comment lookup is caught by the final PR view, before the write", async () => {
    const f = fixture(1);
    ghState(f, { changeOnCommentsLookup: { "11": { baseRefOid: "e".repeat(40) } } });
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
    const kinds = ghLines(f).map((l) => l.argv[0] === "api" ? (l.argv[3]!.includes("/comments") ? "comments" : "repo") : l.argv[1]);
    expect(kinds).toEqual(["repo", "view", "comments", "view"]); // no comment
    expect(calls.logs.join("\n")).toContain("case-901: not posted, PR re-check failed right before the comment: case-901: PR #11 base is not base_sha");
    expect(outFiles(f)).toEqual(["case-901.json"]); // the review record is kept
  });

  it("re-checks the PR right before the comment: a base moved after planning means no comment", async () => {
    const f = fixture(1);
    // view 1 is the check before any model call; view 2 is the re-check right before the comment
    ghState(f, { changeOnView: { "11": { after: 1, pr: { baseRefOid: "e".repeat(40) } } } });
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
    expect(ghLines(f).filter((l) => l.argv[1] === "view")).toHaveLength(2);
    expect(ghLines(f).some((l) => l.argv[1] === "comment")).toBe(false);
    expect(calls.logs.join("\n")).toContain("case-901: not posted, PR re-check failed right before the comment: case-901: PR #11 base is not base_sha");
    expect(outFiles(f)).toEqual(["case-901.json"]); // the review record is kept; nothing marks it posted
  });

  it("gives gh an allowlisted env only, and a failing gh's stderr (its env dump) is never echoed", async () => {
    const f = fixture(1);
    ghState(f, { failComment: true });
    const { d, calls } = deps(f);
    expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
    const lines = ghLines(f);
    expect(lines.some((l) => l.argv[1] === "comment")).toBe(true);
    for (const l of lines) {
      for (const k of l.envKeys) expect(["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "GH_TOKEN",
        "GITHUB_TOKEN", "GH_CONFIG_DIR", "XDG_CONFIG_HOME", "GH_REPO", "GH_HOST", "GH_PROMPT_DISABLED", "LC_ALL",
        // set by the OS or node itself when the fake starts, never by the runner
        "__CF_USER_TEXT_ENCODING", "PWD", "SHLVL", "_", "OLDPWD"]).toContain(k);
      expect(l.env).not.toContain(KEY);
      expect(l.env).not.toContain(OTHER);
    }
    const text = calls.logs.join("\n");
    expect(text).toContain("case-901: gh pr comment failed (status 1); not retried");
    expect(text).not.toContain("HTTP 502");
    expect(text).not.toContain(KEY);
    for (const n of outFiles(f)) expect(readFileSync(path.join(f.out, n), "utf8")).not.toContain(KEY);
  });

  it("assertGh allows only the exact read and write shapes", () => {
    const ok: [string[], boolean][] = [
      [["api", "--method", "GET", `repos/${FORK}`], false],
      [["api", "--method", "GET", `repos/${FORK}/issues/3/comments?per_page=100&page=1`], false],
      [["pr", "view", "3", "--repo", FORK, "--json", "number,url,state,headRefName,baseRefName,baseRefOid,headRefOid,isCrossRepository"], false],
      [["pr", "comment", "3", "--repo", FORK, "--body-file", "-"], true],
    ];
    for (const [a, w] of ok) expect(() => assertGh(a, FORK, w)).not.toThrow();
    const bad: [string[], boolean][] = [
      [["api", "--method", "POST", `repos/${FORK}/issues/3/comments`], false],
      [["api", "--method", "GET", "repos/twentyhq/twenty"], false],
      [["api", "--method", "GET", `repos/${FORK}-evil`], false],
      [["api", "--method", "GET", `repos/${FORK}/issues/3/comments?per_page=100&page=1`], true],
      [["pr", "comment", "3", "--repo", "twentyhq/twenty", "--body-file", "-"], true],
      [["pr", "comment", "3", "--repo", FORK, "--body-file", "-"], false],
      [["pr", "comment", "3", "--body-file", "-"], true],
      [["pr", "comment", "3", "-R", FORK, "--body", "x"], true],
      [["pr", "merge", "3", "--repo", FORK], true],
      [["issue", "comment", "3", "--repo", FORK, "--body-file", "-"], true],
    ];
    for (const [a, w] of bad) expect(() => assertGh(a, FORK, w)).toThrow(/refusing gh call/);
    expect(() => assertGh(["api", "--method", "GET", "repos/octocat/x"], "octocat/x", false)).toThrow(/SunnyBagal/);
  });
});

it("a fake key never appears in an output file, a gh or git argv, or a log line", async () => {
  const f = fixture(1);
  const { d, calls } = deps(f);
  expect(await main(args(f, "--execute", ...post(f)), d)).toBe(0);
  const blobs = [
    ...outFiles(f).map((n) => readFileSync(path.join(f.out, n), "utf8")),
    ...ghLines(f).map((l) => JSON.stringify(l.argv) + l.env + l.stdin),
    readFileSync(f.gitLog, "utf8"), readFileSync(f.ghState, "utf8"), calls.logs.join("\n"),
  ];
  expect(blobs.length).toBeGreaterThan(4);
  for (const b of blobs) {
    expect(b).not.toContain(KEY);
    expect(b).not.toContain(OTHER);
  }
  // the analyzer stages do get it (they need it), through env only
  expect(calls.stages.every((s) => s.env.NEBIUS_API_KEY === KEY)).toBe(true);
});

it("ACTION_DEFAULTS equal action.yml's input defaults", () => {
  const yml = parseYaml(readFileSync(new URL("../../../.github/actions/tracehound-review/action.yml", import.meta.url), "utf8")) as
    { inputs: Record<string, { default?: string }> };
  const def = (k: string) => yml.inputs[k]!.default;
  expect(ACTION_DEFAULTS).toEqual({ model: def("model"), reviewer: def("reviewer"), maxComments: Number(def("max-comments")),
    fixes: def("fixes"), contracts: def("contracts"), learn: def("learn") });
});

it("prepareReview's payload is the review runAction prints on dry run (same inputs)", async () => {
  const { prepareReview, runAction } = await import("../src/action.ts");
  const diff = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n-export const a = 1;\n+export const a = 2;\n+export const b = a;\n";
  const event = { repository: { full_name: FORK }, pull_request: { title: "T", body: "B", number: 5, base: { sha: "b".repeat(40) },
    head: { sha: "c".repeat(40), repo: { full_name: FORK } } } };
  const options = { token: "t", apiUrl: "https://api.example.invalid", model: "m", maxComments: 15, dryRun: true, repoDir: "/r" };
  const logs: string[] = [];
  const contracts: string[] = [];
  const base = {
    fetch: (async (_u: string, init: { headers: Record<string, string> }) => init.headers.Accept === "application/vnd.github.diff"
      ? new Response(diff) : new Response(JSON.stringify({ head: { sha: "c".repeat(40) }, base: { sha: "b".repeat(40) } }))) as unknown as typeof fetch,
    runReviewer: async () => ({}), checkRepoHead: async () => {},
    runPipeline: async () => ({ comments: [{ path: "a.ts", line: 2, body: "Synthetic" }], sources: ["both" as const],
      review: { model: "m", chunkFailed: 0 }, pipeline: { pool: 2, kept: 1 }, stages: { chunksOk: 2, chunksFailed: 0 } }),
    runFixes: async () => ({ suggestions: [null], counts: { attempted: 1, valid: 0, rejected: 1 } }),
    runContracts: async (_r: string, b: string) => { contracts.push(b); return { status: "ok" as const, findings: [], ms: 1 }; },
    log: (m: string) => logs.push(m),
  };
  await runAction(event, options, base);
  const printed = JSON.parse(logs.find((l) => l.startsWith("{"))!);
  const prepared = await prepareReview(event, diff, "b".repeat(40), options, base);
  expect(prepared!.payload).toEqual(printed);
  expect(contracts).toEqual(["b".repeat(40), "b".repeat(40)]);
  expect(prepared!.bodyOnly().comments).toEqual([]);
});
