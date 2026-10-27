// The test-set runner of decision 061: one run of pool-verify-v1 (decision 059) on Cal.com or on
// the dev repos, then both judges. Job 062 runs it; nothing in 061 does.
//   per pull request, in order: review-diff-v1 (055), review-ctx-v1 (057), the pool (059's rule,
//   functions imported from pool-verify.ts), verify-ctx-v1 (058) on the review-diff-v1 findings and
//   then on the ctx-only findings; kept = review-diff-v1 kept, then ctx-only kept (059's merge order).
//   Then bench-judge-v1 (scorer of record) and bench-judge-x1 (060, report only) on the run's rows.
// Reviewer and verifier calls go through a client with response-cache reads off, so a repeat is a
// real call; judge calls may come from the cache. The analyzer's exported functions are called
// directly (the CLIs always read the cache). Rules (decision 061): a pull request with a failed
// reviewer or verifier request is rerun once, with the first attempt kept; the run stops before its
// allowance under the $15 cap (test-set.ts); it writes only into a run directory that did not exist,
// never over a file. stdout and stderr get counts only, never titles, comment or golden text; full
// records go to the run directory in the bench folder, outside this repo. A crashed run (run.json
// still "running", nothing under its scores/) may be restarted once with --restart (061a): the
// restart writes run-<n>r/, leaves run-<n>/ untouched, reports it, and stands for run n.
// Decision 064 adds dev runs 4–6: the same pipeline, records layout and rules, with their own order
// and cap (test-set.ts, EXTRA_ITEMS) and a freeze check that allows only 064's runner changes.
// Decision 067 adds dev runs 7–9 and --model, for those runs only: the reviewer and verifier stages
// use that model (prompts, temperature, reasoning, max_tokens unchanged; judges unchanged), and a
// non-default model's records go to run-<n>-<model slug>/ with the model in run.json.
// Decision 069 adds Cal.com run 4 (v2, the second look): every stage on Nemotron 3.5 Super VL, gate
// TRACEHOUND_TEST_RUN=069, records in test/run-4-<model slug>/, its own $3 cap, the three TraceHound
// rows only, and a freeze check against review-freeze-2. Runs 1–3 are unchanged.
//   TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 1|2|3 [--restart] [--bench <dir>]
//   node scripts/bench/run-test-set.ts --set dev --run 2|3 [--restart] [--bench <dir>]
//   node scripts/bench/run-test-set.ts --set dev --run 4|5|6 [--restart] [--bench <dir>]
//   node scripts/bench/run-test-set.ts --set dev --run 7|8|9 [--model <id>] [--restart] [--bench <dir>]
//   TRACEHOUND_TEST_RUN=069 node scripts/bench/run-test-set.ts --set cal_dot_com --run 4 --model nvidia/Nemotron-3.5-Super-VL [--restart] [--bench <dir>]
// Decision 071 adds dev runs 10–11 on Nemotron 3 Ultra via the free NVIDIA API: the reviewer and
// verifier stages get TRACEHOUND_NVIDIA_API=1 (judges unchanged), records in run-<n>-<model slug>/,
// a $3 Nebius cap for the judges, and a freeze check against review-freeze-2.
//   node scripts/bench/run-test-set.ts --set dev --run 10|11 --model nvidia/nemotron-3-ultra-550b-a55b [--restart] [--bench <dir>]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { JUDGE_SYSTEM_PROMPT, JUDGE_VERSION, LlmJudge, SUPER_MODEL } from "../../packages/analyzer/src/bench/judge.ts";
import { addCounts, loadReviews, metrics, scoreRepo, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { GoldenFile, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { Budget, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { BudgetExceededError, nvidiaApiFromEnv, TokenFactoryClient, type NvidiaApiOptions } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import { gitSource, type GitSource } from "../../packages/analyzer/src/review/context.ts";
import { reviewPullWithContext, type ReviewCtxOutput } from "../../packages/analyzer/src/review/review-ctx.ts";
import { reviewPull, type PullInput, type ReviewOutput } from "../../packages/analyzer/src/review/review.ts";
import { isKept, verifyReviewWithContext, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";
import { checkReuse, ctxOnlyFindings } from "./pool-verify.ts";
import {
  cal069RunDir,
  checkCal069,
  checkDev071,
  checkRun,
  dev071RunDir,
  EXTRA_ITEMS,
  inputPaths,
  isCal069Run,
  isDev067Run,
  isDev071Run,
  isDevExtraRun,
  isRequestFailure,
  ITEMS,
  ITEMS_067,
  ITEMS_069,
  ITEMS_071,
  modelRunDir,
  modelSlug,
  planCal069Item,
  planDev067Item,
  planDev071Item,
  planExtraItem,
  planItem,
  readItemStates,
  readStates067,
  readStates069,
  readStates071,
  readStatesOf,
  reposOf,
  rowReviews,
  readRunJson,
  rowsFor,
  runDir,
  type Dev067Run,
  type Dev071Run,
  type DevExtraRun,
  type Row,
  type RunNumber,
  type SetName,
  TEST_RUN_ID_069,
} from "./test-set.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
/** pool-verify-v1's stages: Super, reasoning on, temperature 0 (the functions' own default). */
export const REVIEW_MODEL = SUPER_MODEL;
export const REVIEW_REASONING = "on" as const;
/** verify-ctx's CLI default: findings of one pull request verified at once. */
const VERIFY_CONCURRENCY = 4;
/** bench score's CLI default. */
const JUDGE_CONCURRENCY = 4;
export const QWEN_MODEL = "Qwen/Qwen3-235B-A22B-Instruct-2507";
/** bench-judge-v1 first (scorer of record), then bench-judge-x1 (060, report only). */
export const JUDGES = Object.freeze([
  { id: "judge-v1", model: SUPER_MODEL, reasoning: "on" as const },
  { id: "judge-x1", model: QWEN_MODEL, reasoning: "off" as const },
]);
export const FREEZE_TAG = "review-freeze-1";
export const FROZEN_PATHS = ["packages/analyzer/src", "scripts/bench", "config"];
/**
 * Decision 064's dev runs 4–6: the frozen paths minus the files 064 changes or adds (the runner and
 * its gates, which gain runs 4–6, and the vote script). The pipeline function is pinned to the tag's
 * text by a test.
 */
export const EXTRA_FROZEN_PATHS = [...FROZEN_PATHS, ":(exclude)scripts/bench/run-test-set.ts", ":(exclude)scripts/bench/test-set.ts", ":(exclude)scripts/bench/vote.ts"];

// ---- clients ----

/**
 * The run's two clients over one budget, ledger and cache. `reviewer` (reviewer and verifier calls)
 * has cache reads off: every request is sent, and the cache is still refreshed. `judge` may read
 * the cache. The per-process cap is the smaller of TRACEHOUND_BUDGET_RUN_USD and the item's allowance.
 */
export function buildClients(opts: { apiKey: string; stateDir: string; pricesFile: string; allowanceUSD: number; env: NodeJS.ProcessEnv; fetch?: typeof fetch; nvidiaApi?: NvidiaApiOptions }) {
  const ledger = new SpendLedger(join(opts.stateDir, "spend.jsonl"));
  const caps = capsFromEnv(opts.env);
  const budget = new Budget({ totalUSD: caps.totalUSD, runUSD: Math.min(caps.runUSD, opts.allowanceUSD) }, ledger.totalUSD());
  const common = {
    apiKey: opts.apiKey,
    baseUrl: opts.env.NEBIUS_BASE_URL,
    prices: loadPriceTable(opts.pricesFile),
    budget,
    ledger,
    cache: new ResponseCache(join(opts.stateDir, "cache")),
    ...(opts.fetch && { fetch: opts.fetch }),
  };
  const reviewer = new TokenFactoryClient({ ...common, readCache: false, timeoutMs: 600_000, ...(opts.nvidiaApi && { nvidiaApi: opts.nvidiaApi }) });
  const judge = new TokenFactoryClient({ ...common, readCache: true, timeoutMs: 300_000 });
  return { reviewer, judge, budget, ledger };
}

// ---- one pull request ----

export interface Attempt {
  diff: ReviewOutput;
  ctx: ReviewCtxOutput;
  ctxOnly: ReviewComment[];
  diffVerdicts: CtxVerifiedReview;
  ctxOnlyVerdicts: CtxVerifiedReview;
  kept: ReviewComment[];
  /** failed requests (not invalid replies) in any stage: the rerun rule's trigger */
  requestFailures: number;
  costUSD: number;
  wallMs: number;
}

const strip = (c: ReviewComment): ReviewComment => ({ path: c.path, line: c.line, body: c.body });

/** pool-verify-v1 on one pull request. A BudgetExceededError propagates (the run stops). */
export async function pipeline(client: ChatClient, input: PullInput, repo: { source: GitSource; head: string }, model = REVIEW_MODEL): Promise<Attempt> {
  const started = performance.now();
  const opts = { model, reasoning: REVIEW_REASONING };
  const diff = await reviewPull(client, input, opts);
  const ctx = await reviewPullWithContext(client, input, repo, opts);
  const ctxOnly = ctxOnlyFindings(diff.comments, ctx.comments);
  const header = { pr_title: input.title, ...(input.number !== undefined && { pr_number: input.number }) };
  const vopts = { model, reasoning: REVIEW_REASONING, concurrency: VERIFY_CONCURRENCY };
  const diffVerdicts = await verifyReviewWithContext(client, input, { ...header, comments: diff.comments.map(strip) }, repo, vopts);
  const ctxOnlyVerdicts = await verifyReviewWithContext(client, input, { ...header, comments: ctxOnly }, repo, vopts);
  checkReuse("review-diff-v1", diff.comments, diffVerdicts.comments);
  checkReuse("ctx-only", ctxOnly, ctxOnlyVerdicts.comments);
  const kept = [...diffVerdicts.comments.filter(isKept).map(strip), ...ctxOnlyVerdicts.comments.filter(isKept).map(strip)];
  const requestFailures =
    [...diff.review.chunks, ...ctx.review.chunks].filter((c) => isRequestFailure(c.failure)).length +
    [...diffVerdicts.comments, ...ctxOnlyVerdicts.comments].filter((c) => isRequestFailure(c.failure)).length;
  const costUSD = diff.review.usage.costUSD + ctx.review.usage.costUSD + diffVerdicts.verify.usage.costUSD + ctxOnlyVerdicts.verify.usage.costUSD;
  return { diff, ctx, ctxOnly, diffVerdicts, ctxOnlyVerdicts, kept, requestFailures, costUSD, wallMs: Math.round(performance.now() - started) };
}

// ---- files ----

/** Writes a new file; throws if it exists (flag "wx"). */
export function writeNew(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n", { flag: "wx" });
}

function readInput(file: string): PullInput {
  const j = JSON.parse(readFileSync(file, "utf8")) as { title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown };
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

// ---- tables (counts only) ----

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
export const TABLE_HEAD = "| row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |\n|---|---|---|---|---|---|---|---|---|---|---|";
export function tableRow(name: string, c: Counts, judgeFailed: number) {
  const m = metrics(c);
  return `| ${name} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.duplicates} | ${c.lowMatched} | ${c.fn} | ${judgeFailed} | ${pct(m.precision)} (${c.tp}/${c.tp + c.fp}) | ${pct(m.recall)} (${c.tp}/${c.tp + c.fn}) | ${pct(m.f)} |`;
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};

// ---- the freeze ----

/** Decision 061: the run is void unless the frozen paths equal the tag `review-freeze-1`, committed and in the working tree. */
export function freezeCheck(paths: string[] = FROZEN_PATHS): { ok: boolean; why?: string; head: string } {
  const git = (args: string[]) => spawnSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  if (git(["rev-parse", "--verify", "--quiet", `${FREEZE_TAG}^{commit}`]).status !== 0) return { ok: false, why: `no tag ${FREEZE_TAG}`, head };
  if (git(["diff", "--quiet", FREEZE_TAG, "HEAD", "--", ...paths]).status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG} HEAD -- ${paths.join(" ")} is not empty`, head };
  if (git(["diff", "--quiet", "HEAD", "--", ...paths]).status !== 0) return { ok: false, why: `uncommitted changes under ${paths.join(" ")}`, head };
  return { ok: true, head };
}

/**
 * Decision 067's freeze check: nothing under FROZEN_PATHS that the tag has may differ from it,
 * except these files (the runner and its gates, the Nemotron 3.5 price, two analyzer files no
 * pipeline stage imports: the CLI dispatcher and the config schema, and the LLM client, whose only
 * change since the tag is #55's region routing: the 3.5 Super VL id goes to us-north1, every other
 * model, the judges included, to the configured URL); files added since the tag are allowed (no tag
 * file imports them). No uncommitted changes under FROZEN_PATHS.
 */
export const ALLOWED_MODIFIED_067 = Object.freeze(["config/prices.json", "packages/analyzer/src/bin.ts", "packages/analyzer/src/config.ts", "packages/analyzer/src/llm/client.ts", "scripts/bench/run-test-set.ts", "scripts/bench/test-set.ts"]);
export function freezeCheck067(): { ok: boolean; why?: string; head: string } {
  const git = (args: string[]) => spawnSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  if (git(["rev-parse", "--verify", "--quiet", `${FREEZE_TAG}^{commit}`]).status !== 0) return { ok: false, why: `no tag ${FREEZE_TAG}`, head };
  const d = git(["diff", "--name-only", "--no-renames", "--diff-filter=DMTUXB", FREEZE_TAG, "HEAD", "--", ...FROZEN_PATHS]);
  if (d.status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG} HEAD failed`, head };
  const changed = d.stdout.split("\n").filter((f) => f && !ALLOWED_MODIFIED_067.includes(f));
  if (changed.length) return { ok: false, why: `changed since ${FREEZE_TAG} outside 067's allowed list: ${changed.join(", ")}`, head };
  if (git(["diff", "--quiet", "HEAD", "--", ...FROZEN_PATHS]).status !== 0) return { ok: false, why: `uncommitted changes under ${FROZEN_PATHS.join(" ")}`, head };
  return { ok: true, head };
}

/**
 * Decision 069's freeze check for Cal.com run 4: packages/analyzer/src and config equal the tag
 * `review-freeze-2`, and scripts/bench equals it except the runner and its gates; all committed, with
 * nothing uncommitted or untracked under those paths.
 */
export const FREEZE_TAG_069 = "review-freeze-2";
export const FROZEN_PATHS_069 = Object.freeze(["packages/analyzer/src", "config", "scripts/bench", ":(exclude)scripts/bench/run-test-set.ts", ":(exclude)scripts/bench/test-set.ts"]);
export function freezeCheck069(root = REPO_ROOT): { ok: boolean; why?: string; head: string } {
  const git = (args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  if (git(["rev-parse", "--verify", "--quiet", `${FREEZE_TAG_069}^{commit}`]).status !== 0) return { ok: false, why: `no tag ${FREEZE_TAG_069}`, head };
  if (git(["diff", "--quiet", FREEZE_TAG_069, "HEAD", "--", ...FROZEN_PATHS_069]).status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG_069} HEAD -- ${FROZEN_PATHS_069.join(" ")} is not empty`, head };
  const st = git(["status", "--porcelain", "--untracked-files=all", "--", ...FROZEN_PATHS_069]);
  if (st.status !== 0 || st.stdout.trim()) return { ok: false, why: `uncommitted changes under ${FROZEN_PATHS_069.join(" ")}`, head };
  return { ok: true, head };
}

/**
 * Decision 071's freeze check for dev runs 10–11: nothing under FROZEN_PATHS that review-freeze-2 has
 * may differ from it, except these files (the runner and its gates, the free Ultra price, the CLI
 * dispatcher no pipeline stage imports, and the LLM client, whose change is the opt-in NVIDIA API
 * route); files added since the tag are allowed. Nothing uncommitted or untracked under FROZEN_PATHS.
 */
export const ALLOWED_MODIFIED_071 = Object.freeze(["config/prices.json", "packages/analyzer/src/bin.ts", "packages/analyzer/src/llm/client.ts", "scripts/bench/run-test-set.ts", "scripts/bench/test-set.ts"]);
export function freezeCheck071(root = REPO_ROOT): { ok: boolean; why?: string; head: string } {
  const git = (args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  if (git(["rev-parse", "--verify", "--quiet", `${FREEZE_TAG_069}^{commit}`]).status !== 0) return { ok: false, why: `no tag ${FREEZE_TAG_069}`, head };
  const d = git(["diff", "--name-only", "--no-renames", "--diff-filter=DMTUXB", FREEZE_TAG_069, "HEAD", "--", ...FROZEN_PATHS]);
  if (d.status !== 0) return { ok: false, why: `git diff ${FREEZE_TAG_069} HEAD failed`, head };
  const changed = d.stdout.split("\n").filter((f) => f && !ALLOWED_MODIFIED_071.includes(f));
  if (changed.length) return { ok: false, why: `changed since ${FREEZE_TAG_069} outside 071's allowed list: ${changed.join(", ")}`, head };
  const st = git(["status", "--porcelain", "--untracked-files=all", "--", ...FROZEN_PATHS]);
  if (st.status !== 0 || st.stdout.trim()) return { ok: false, why: `uncommitted changes under ${FROZEN_PATHS.join(" ")}`, head };
  return { ok: true, head };
}

// ---- the run ----

export interface Deps {
  bench: string;
  /** .tracehound/ (ledger and response cache) */
  stateDir: string;
  pricesFile: string;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  err: (line: string) => void;
  fetch?: typeof fetch;
  freezeCheck?: () => { ok: boolean; why?: string; head: string };
}

interface PullRecord {
  repo: string;
  file: string;
  attempts: number;
  requestFailuresFirst: number;
  requestFailuresUsed: number;
  costUSD: number;
  wallMs: number;
}

/** What a restart (061a) reports about the void run it replaces. Spend is the larger of run.json's and the ledger's since the void run started. */
export function voidRunReport(dir: string, stateDir: string) {
  const j = readRunJson(dir) as { status: string; costUSD: number; startedAt?: string; pulls?: unknown[]; scored?: unknown[]; error?: string | null };
  const since = j.startedAt;
  const ledgerUSD = since ? new SpendLedger(join(stateDir, "spend.jsonl")).entries().filter((e) => e.timestamp >= since).reduce((sum, e) => sum + e.estCostUSD, 0) : 0;
  return { dir, status: j.status, recordedCostUSD: j.costUSD, ledgerSinceStartUSD: ledgerUSD, costUSD: Math.max(j.costUSD, ledgerUSD), pullsDone: j.pulls?.length ?? 0, error: j.error ?? null };
}

/** Exit codes: 0 complete, 1 refused (nothing written), 2 stopped at the cap, 3 failed (the run is void). */
export async function runTestSet(argv: string[], deps: Deps): Promise<number> {
  let set: SetName;
  let run: RunNumber;
  let restart: boolean;
  let extra: boolean;
  let dev067: boolean;
  let model: string;
  let cal069: boolean;
  let dev071: boolean;
  try {
    const { values } = parseArgs({ args: argv, options: { set: { type: "string" }, run: { type: "string" }, restart: { type: "boolean", default: false }, bench: { type: "string" }, model: { type: "string" } }, strict: true });
    extra = isDevExtraRun(values.set, values.run);
    dev067 = isDev067Run(values.set, values.run);
    cal069 = isCal069Run(values.set, values.run);
    if (cal069) checkCal069(values.model, deps.env);
    dev071 = isDev071Run(values.set, values.run);
    if (dev071) checkDev071(values.model);
    if (values.model !== undefined && !dev067 && !cal069 && !dev071) throw new Error("refusing --model: it applies to --set dev --run 7|8|9 only (decision 067) and to --set cal_dot_com --run 4 (decision 069)");
    if (values.model === "") throw new Error("refusing --model: empty");
    model = values.model ?? REVIEW_MODEL;
    ({ set, run } = cal069 ? { set: "cal_dot_com", run: 4 } : extra || dev067 || dev071 ? { set: "dev", run: Number(values.run) as DevExtraRun | Dev067Run | Dev071Run } : checkRun(values.set, values.run, deps.env));
    restart = values.restart!;
  } catch (e) {
    deps.err(`[run-test-set] ${(e as Error).message}`);
    return 1;
  }
  const bench = deps.bench;
  const label = `${set} run ${run}${restart ? " (restarted)" : ""}`;
  const slug = model === REVIEW_MODEL ? null : modelSlug(model);
  const items = dev071 ? ITEMS_071 : cal069 ? ITEMS_069 : dev067 ? ITEMS_067 : extra ? EXTRA_ITEMS : ITEMS;
  const states = dev071 ? readStates071(bench) : cal069 ? readStates069(bench) : dev067 ? readStates067(bench, slug) : extra ? readStatesOf(bench, EXTRA_ITEMS) : readItemStates(bench);
  const idx = states.findIndex((_, i) => items[i]!.set === set && items[i]!.run === run);
  // 061a: the void run's spend, ledger included, counts toward the item before the restart's allowance
  const voidRun = restart && states[idx] && !states[idx].restarted ? voidRunReport(dev071 ? dev071RunDir(bench, run as Dev071Run) : cal069 ? cal069RunDir(bench) : dev067 ? modelRunDir(bench, run as Dev067Run, slug) : runDir(bench, set, run), deps.stateDir) : null;
  if (voidRun) states[idx] = { ...states[idx]!, costUSD: voidRun.costUSD };
  const plan = dev071 ? planDev071Item(run as Dev071Run, states, restart) : cal069 ? planCal069Item(states, restart) : dev067 ? planDev067Item(run as Dev067Run, states, restart) : extra ? planExtraItem(run as DevExtraRun, states, restart) : planItem(set, run, states, restart);
  if (!plan.ok) {
    deps.err(`[run-test-set] refusing ${label}: ${plan.why}`);
    return 1;
  }
  const freeze = deps.freezeCheck ? deps.freezeCheck() : dev071 ? freezeCheck071() : cal069 ? freezeCheck069() : dev067 ? freezeCheck067() : freezeCheck(extra ? EXTRA_FROZEN_PATHS : FROZEN_PATHS);
  if (!freeze.ok) {
    deps.err(`[run-test-set] refusing ${label}: ${freeze.why}`);
    return 1;
  }
  const apiKey = deps.env.NEBIUS_API_KEY;
  if (!apiKey) {
    deps.err("[run-test-set] NEBIUS_API_KEY is not set (put it in .env)");
    return 1;
  }
  let nvidiaApi: NvidiaApiOptions | undefined;
  try {
    // 071: the reviewer and verifier stages only; the judges never route there
    if (dev071) nvidiaApi = nvidiaApiFromEnv({ ...deps.env, TRACEHOUND_NVIDIA_API: "1" });
  } catch (e) {
    deps.err(`[run-test-set] ${(e as Error).message}`);
    return 1;
  }
  const repos = reposOf(set);
  let jobs: { repo: string; file: string; input: PullInput; head: string; gitDir: string }[];
  try {
    jobs = repos.flatMap((repo) => {
      const p = inputPaths(bench, set, repo);
      const heads = JSON.parse(readFileSync(p.heads, "utf8")) as Record<string, { head: string }>;
      return readdirSync(p.prs)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((file) => {
          const head = heads[file.replace(/\.json$/, "")]?.head;
          if (!head) throw new Error(`no head for ${repo}/${file}`);
          return { repo, file, input: readInput(join(p.prs, file)), head, gitDir: p.gitDir };
        });
    });
  } catch (e) {
    deps.err(`[run-test-set] refusing ${label}: inputs not ready (${(e as Error).name})`);
    return 1;
  }

  const dir = dev071 ? dev071RunDir(bench, run as Dev071Run, restart) : cal069 ? cal069RunDir(bench, restart) : dev067 ? modelRunDir(bench, run as Dev067Run, slug, restart) : runDir(bench, set, run, restart);
  mkdirSync(dirname(dir), { recursive: true });
  try {
    mkdirSync(dir); // not recursive: fails if the run directory exists
  } catch {
    deps.err(`[run-test-set] refusing ${label}: the run directory exists`);
    return 1;
  }
  const restartOf = voidRun && { ...voidRun, stoppedAt: voidRun.pullsDone < jobs.length ? `pull request ${voidRun.pullsDone + 1} of ${jobs.length}` : "judging" };
  if (restartOf) {
    // counts only: the error's name; its message stays in both run.json files
    deps.log(`${label}: void run-${run}/ left untouched, never scored · spend $${restartOf.costUSD.toFixed(4)} (run.json $${restartOf.recordedCostUSD.toFixed(4)}, ledger since its start $${restartOf.ledgerSinceStartUSD.toFixed(4)}) · stopped at ${restartOf.stoppedAt} · error ${restartOf.error ? restartOf.error.split(":")[0] : "none recorded (the process died)"}`);
  }
  const { reviewer, judge, budget } = buildClients({ apiKey, stateDir: deps.stateDir, pricesFile: deps.pricesFile, allowanceUSD: plan.allowanceUSD, env: deps.env, fetch: deps.fetch, ...(nvidiaApi && { nvidiaApi }) });
  const decision = dev071 ? "071" : cal069 ? "069" : dev067 ? "067" : extra ? "064" : "061";
  const state = {
    decision,
    set,
    run,
    restart,
    /** 061a: the void run this restart replaces, and its spend counted toward the item */
    restartOf,
    voidCostUSD: restartOf ? restartOf.costUSD : undefined,
    status: "running" as "running" | "complete" | "stopped-at-cap",
    allowanceUSD: plan.allowanceUSD,
    costUSD: 0,
    ledgerBeforeUSD: budget.spentBeforeRun,
    trace: { head: freeze.head, freezeTag: cal069 || dev071 ? FREEZE_TAG_069 : FREEZE_TAG, ...(dev071 && { frozenPaths: FROZEN_PATHS, allowedModified: ALLOWED_MODIFIED_071 }), ...(cal069 && { frozenPaths: FROZEN_PATHS_069, testRunGate: TEST_RUN_ID_069 }), ...(extra && { frozenPaths: EXTRA_FROZEN_PATHS }), ...(dev067 && { frozenPaths: FROZEN_PATHS, allowedModified: ALLOWED_MODIFIED_067 }) },
    config: {
      reviewModel: model,
      reasoning: REVIEW_REASONING,
      reviewerCacheReads: false,
      judges: JUDGES,
      judgePromptSha256: createHash("sha256").update(JUDGE_SYSTEM_PROMPT).digest("hex"),
    },
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    pulls: [] as PullRecord[],
    scored: [] as { row: Row; judge: string; repo: string; judgeFailed: number; calls: number; cached: number; costUSD: number }[],
    stoppedAt: null as string | null,
    error: null as string | null,
    ...(dev071 && { nvidiaApi: reviewer.nvidiaApiStats }),
  };
  const runJson = join(dir, "run.json");
  writeNew(runJson, state);
  const save = () => {
    state.costUSD = budget.runSpent;
    if (dev071) state.nvidiaApi = reviewer.nvidiaApiStats;
    writeFileSync(runJson, JSON.stringify(state, null, 1) + "\n"); // this run's own file
  };

  // judge requests that hit the cap are recorded here: LlmJudge turns every error into JUDGE_FAILED
  let capHit: BudgetExceededError | null = null;
  const judgeClient: ChatClient = {
    chat: async (request, meta) => {
      try {
        return await judge.chat(request, meta);
      } catch (e) {
        if (e instanceof BudgetExceededError) capHit ??= e;
        throw e;
      }
    },
  };

  try {
    // 1. the pipeline, one pull request after another
    for (const [k, job] of jobs.entries()) {
      const repoSrc = { source: gitSource(job.gitDir, job.head), head: job.head };
      const name = job.file.replace(/\.json$/, "");
      const a1 = await pipeline(reviewer, job.input, repoSrc, model);
      writeNew(join(dir, "attempts", job.repo, `${name}.attempt-1.json`), a1);
      let used = a1;
      if (a1.requestFailures > 0) {
        // the rerun rule: once, within this run; attempt 1 stays on disk and in run.json
        used = await pipeline(reviewer, job.input, repoSrc, model);
        writeNew(join(dir, "attempts", job.repo, `${name}.attempt-2.json`), used);
      }
      const header = { pr_title: job.input.title, ...(job.input.number !== undefined && { pr_number: job.input.number }) };
      writeNew(join(dir, "review-diff-v1", job.repo, job.file), { ...header, comments: used.diff.comments.map(strip) });
      writeNew(join(dir, "pool-raw", job.repo, job.file), { ...header, comments: [...used.diff.comments.map(strip), ...used.ctxOnly] });
      writeNew(join(dir, "pool-verify-v1", job.repo, job.file), { ...header, comments: used.kept });
      const attempts = used === a1 ? 1 : 2;
      state.pulls.push({
        repo: job.repo,
        file: job.file,
        attempts,
        requestFailuresFirst: a1.requestFailures,
        requestFailuresUsed: used.requestFailures,
        costUSD: a1.costUSD + (attempts === 2 ? used.costUSD : 0),
        wallMs: a1.wallMs + (attempts === 2 ? used.wallMs : 0),
      });
      save();
      deps.err(`[run-test-set] ${label}: pull request ${k + 1}/${jobs.length} done · attempts ${attempts} · run spend $${budget.runSpent.toFixed(4)}`);
    }

    // 2. both judges on the run's rows, scorer of record first
    for (const j of JUDGES) {
      for (const row of rowsFor(set, run)) {
        for (const repo of repos) {
          const golden = GoldenFile.parse(JSON.parse(readFileSync(inputPaths(bench, set, repo).golden, "utf8")));
          const reviews = loadReviews(rowReviews(bench, dir, row, repo));
          const lj = new LlmJudge(judgeClient, { model: j.model, reasoning: j.reasoning });
          const result = await scoreRepo({ golden, reviews, judges: [lj], concurrency: JUDGE_CONCURRENCY });
          if (capHit) throw capHit;
          const meta = { label: `${row}/${repo}`, judgeVersion: JUDGE_VERSION, judges: [lj.name], reasoning: j.reasoning, promptSha256: state.config.judgePromptSha256 };
          const base = join(dir, "scores", j.id, `${row}-${repo}`);
          writeNew(`${base}.detail.json`, { ...meta, ...result });
          const { detail: _d, ...countsOnly } = result;
          writeNew(`${base}.summary.json`, { ...meta, ...countsOnly, metrics: metrics(result.counts) });
          state.scored.push({ row, judge: j.id, repo, judgeFailed: result.pulls.judgeFailed, calls: result.usage.calls, cached: result.usage.cached, costUSD: result.usage.costUSD });
          save();
        }
      }
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      state.status = "stopped-at-cap";
      state.stoppedAt = state.pulls.length < jobs.length ? `pull request ${state.pulls.length + 1} of ${jobs.length}` : "judging";
      state.error = e.message;
      state.finishedAt = new Date().toISOString();
      save();
      deps.log(`${label}: STOPPED AT THE CAP (allowance $${plan.allowanceUSD.toFixed(4)}) at ${state.stoppedAt}; spent $${budget.runSpent.toFixed(4)}; later items are not done`);
      return 2;
    }
    state.error = `${(e as Error).name}: ${(e as Error).message}`;
    state.finishedAt = new Date().toISOString();
    save();
    const next = restart ? "a restart crashed: the run is void, with no further restart" : `it may be restarted once if ${dir}/scores/ is empty (--restart)`;
    deps.err(`[run-test-set] ${label} FAILED (${(e as Error).name}); the run is void; message in ${runJson}; ${next}`);
    return 3;
  }
  state.status = "complete";
  state.finishedAt = new Date().toISOString();
  save();
  printSummary(`${label} (decision ${decision})`, state, deps.log, dir, repos, rowsFor(set, run));
  return 0;
}

/** Counts-only report of a completed run: pipeline counts, cost and time per pull request, the table under each judge. */
function printSummary(
  label: string,
  state: { pulls: PullRecord[]; scored: { row: Row; judge: string; repo: string; judgeFailed: number }[]; costUSD: number; allowanceUSD: number },
  log: (line: string) => void,
  dir: string,
  repos: readonly string[],
  rows: readonly Row[],
) {
  const p = state.pulls;
  const costs = p.map((x) => x.costUSD);
  const walls = p.map((x) => x.wallMs / 1000);
  log(`## ${label}`);
  log("");
  log(`pull requests ${p.length} · reruns ${p.filter((x) => x.attempts === 2).length} · still with failed requests after the rerun ${p.filter((x) => x.attempts === 2 && x.requestFailuresUsed > 0).length}`);
  log(`cost per pull request: median $${median(costs).toFixed(4)} · max $${Math.max(0, ...costs).toFixed(4)} · wall time median ${median(walls).toFixed(0)} s · max ${Math.max(0, ...walls).toFixed(0)} s`);
  log(`run spend $${state.costUSD.toFixed(4)} of allowance $${state.allowanceUSD.toFixed(4)}`);
  for (const j of JUDGES) {
    log("");
    log(`### ${j.id === "judge-v1" ? "bench-judge-v1 (scorer of record)" : "bench-judge-x1 (report only)"}`);
    log("");
    log(TABLE_HEAD);
    for (const row of rows) {
      let c = zeroCounts();
      let jf = 0;
      for (const repo of repos) {
        const s = JSON.parse(readFileSync(join(dir, "scores", j.id, `${row}-${repo}.summary.json`), "utf8")) as { counts: Counts; pulls: { judgeFailed: number } };
        c = addCounts(c, s.counts);
        jf += s.pulls.judgeFailed;
      }
      log(tableRow(row, c, jf));
    }
  }
}

if (import.meta.main) {
  const envFile = join(REPO_ROOT, ".env");
  try {
    if (!process.env.NEBIUS_API_KEY) process.loadEnvFile(envFile);
  } catch {
    // no .env: runTestSet reports the missing key
  }
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  process.exitCode = await runTestSet(process.argv.slice(2), {
    bench,
    stateDir: join(REPO_ROOT, ".tracehound"),
    pricesFile: join(REPO_ROOT, "config/prices.json"),
    env: process.env,
    log: (l) => console.log(l),
    err: (l) => console.error(l),
  });
}
