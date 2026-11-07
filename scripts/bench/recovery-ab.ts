// Decision 073: the pre-registered dev A/B of the two generation-recovery switches built in #67
// (docs/post-freeze-fixes.md), on the 40 dev pull requests, Nemotron 3.5 Super VL, pool-verify-v1.
//   A  = both switches off (the product today; post-freeze-fixes.md: byte-identical to review-freeze-2)
//   B1 = parser "lenient" on both reviewers (one-switch attribution)
//   B2 = parser "lenient" + retryOnLength "fresh" on both reviewers
// The verifier, the prompts, the model, temperature, reasoning and max_tokens are the same in every arm;
// the arms differ only in the two ReviewOptions fields in ARMS, passed to reviewPull and
// reviewPullWithContext. Judges: bench-judge-v1 (scorer of record) and bench-judge-x1, as in the runner.
//
// Pairing: every request of every arm goes through one CorpusClient over a private corpus
// (<bench>/recovery-073/corpus; the bench folder must be outside this repo). A request already in the
// corpus is served from it. Otherwise its exact key (ResponseCache.key, sha256(model + request)) is
// looked up in the shared response cache with ResponseCache.get, never by listing that directory (it
// also holds Cal.com replies); a hit is copied into the corpus. Otherwise, in `run` only, the request
// goes out (budget, ledger) and its 200 body is stored in the corpus, empty content included. Identical
// requests in flight at the same time share one call (single flight). So a request is sent at most once
// across arms, an unchanged request gets the same bytes in every arm, and arm A replays the latest
// cached replies (a "latest-response replay corpus": runs 7r/8/9 overwrote each other).
//
//   node scripts/bench/recovery-ab.ts dry    [--bench <dir>]   arm A from the cache only: hit/miss counts, $0, no key needed
//   TRACEHOUND_BUDGET_RUN_USD=4 node scripts/bench/recovery-ab.ts run [--bench <dir>]   the A/B; job cap $4 (see budgetFor)
//   node scripts/bench/recovery-ab.ts report [--bench <dir>]  counts and the verdict from a finished run, no model
// stdout gets counts only, never titles, comment text or golden text; records stay in the bench folder.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { JUDGE_SYSTEM_PROMPT, LlmJudge } from "../../packages/analyzer/src/bench/judge.ts";
import { addCounts, loadReviews, metrics, scoreRepo, zeroCounts, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import { GoldenFile, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { Budget, BudgetExceededError, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { CacheMissError, TokenFactoryClient, type ChatRequest, type ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger, type SpendEntry } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import { gitSource, type GitSource } from "../../packages/analyzer/src/review/context.ts";
import { REVIEW_CTX_SYSTEM_PROMPT } from "../../packages/analyzer/src/review/prompt-ctx.ts";
import { REVIEW_SYSTEM_PROMPT } from "../../packages/analyzer/src/review/prompt.ts";
import { reviewPullWithContext, type ReviewCtxOutput } from "../../packages/analyzer/src/review/review-ctx.ts";
import { parseReviewReply, reviewPull, type ChunkRecord, type PullInput, type ReviewOptions, type ReviewOutput } from "../../packages/analyzer/src/review/review.ts";
import { VERIFY_CTX_SYSTEM_PROMPT } from "../../packages/analyzer/src/review/verify-ctx-prompt.ts";
import { isKept, verifyReviewWithContext, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";
import { checkReuse, ctxOnlyFindings } from "./pool-verify.ts";
import { JUDGES, REVIEW_REASONING } from "./run-test-set.ts";
import { DEV_REPOS, inputPaths, isRequestFailure } from "./test-set.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const DECISION = "073";
/** The commit the plan starts from: main with docs/research/2026-11-07 committed (research run of 2026-11-07). */
export const RECOVERY_BASE = "53b604546d96bc05be6cac5ab328a457a2590c97";
/** Hard cap for the whole job: generation, verification and judging, all arms. */
export const JOB_CAP_USD = 4;
/** Decision 067/068: every pool-verify-v1 stage on 3.5 Super VL. */
export const MODEL = "nvidia/Nemotron-3.5-Super-VL";
/** Dev only. Cal.com is not a member and no code path here takes a set name. */
export const REPOS: readonly string[] = DEV_REPOS;
/** The fixed population: 10 pull requests per dev repo, files 0.json … 9.json. Any other set refuses. */
export const EXPECTED_PULLS: readonly string[] = Object.freeze(REPOS.flatMap((r) => Array.from({ length: 10 }, (_, i) => `${r}/${i}`)));
/** The two switches; nothing else differs between arms. */
export const ARMS = Object.freeze({
  A: Object.freeze({}),
  B1: Object.freeze({ parser: "lenient" }),
  B2: Object.freeze({ parser: "lenient", retryOnLength: "fresh" }),
} as const satisfies Record<string, Pick<ReviewOptions, "parser" | "retryOnLength">>);
export type ArmId = keyof typeof ARMS;
export const ARM_IDS = Object.keys(ARMS) as ArmId[];
/** verify-ctx's CLI default and bench score's, as in run-test-set.ts. */
const VERIFY_CONCURRENCY = 4;
const JUDGE_CONCURRENCY = 4;
export const outDir = (bench: string, dry = false) => join(bench, dry ? "recovery-073-dry" : "recovery-073");

/** The bench folder (and so the corpus and every record) must resolve outside this repository; symlinks are resolved. */
export function checkBench(bench: string, repoRoot = REPO_ROOT): { ok: true; bench: string } | { ok: false; why: string } {
  let real: string;
  try {
    real = realpathSync(bench);
  } catch {
    return { ok: false, why: `the bench folder ${bench} does not exist` };
  }
  const root = realpathSync(repoRoot);
  if (real === root || real.startsWith(root + sep)) return { ok: false, why: "the bench folder resolves inside the repository; records and the corpus must stay outside it" };
  return { ok: true, bench: real };
}

// ---- the corpus client ----

export type Stage = "diff" | "ctx" | "verify" | "judge" | "other";
export function stageOf(r: ChatRequest): Stage {
  const sys = r.messages[0]?.content;
  return sys === REVIEW_SYSTEM_PROMPT ? "diff" : sys === REVIEW_CTX_SYSTEM_PROMPT ? "ctx" : sys === VERIFY_CTX_SYSTEM_PROMPT ? "verify" : sys === JUDGE_SYSTEM_PROMPT ? "judge" : "other";
}
/** Reviewer requests: the first attempt has two messages and reasoning on; "fresh" resends them with reasoning off; "append" adds the reply and a correction. */
export function attemptKind(r: ChatRequest): "first" | "fresh-retry" | "append-retry" {
  if (r.messages.length > 2) return "append-retry";
  return r.chat_template_kwargs?.enable_thinking === false ? "fresh-retry" : "first";
}

export interface Provenance {
  callId: number;
  arm: string;
  pull: string;
  /** pull attempt (the rerun rule's attempt 1 or 2); 0 for judge calls */
  attempt: number;
  key: string;
  stage: Stage;
  kind: string;
  /** reviewer stages: the chunk index (reviewers send their chunks one after another) */
  chunk?: number;
  /** corpus/shared: served from bytes on disk; fresh: sent; joined: shared an identical in-flight call; miss: dry run, not in any cache */
  source: "corpus" | "shared" | "fresh" | "joined" | "miss";
  /** a reply was received (false: the request failed or was refused) */
  ok: boolean;
  finishReason?: string;
  contentEmpty?: boolean;
  /** what the ledger charged for this call (failed calls included); 0 for served, joined and refused calls */
  costUSD: number;
  error?: string;
}

/** Only `get` is ever called on the shared cache. */
export interface ReadOnlyCache {
  get<T>(key: string): T | undefined;
}

/** A fetch that stores every 200 body in the corpus under the request's cache key (empty content included). */
export function storingFetch(corpus: ResponseCache, inner: typeof fetch = globalThis.fetch): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const res = await inner(url, init);
    if (res.ok && typeof init?.body === "string") {
      const body = await res.clone().json().catch(() => undefined);
      const request = JSON.parse(init.body) as ChatRequest;
      if (body !== undefined) corpus.put(ResponseCache.key(request.model, request), body);
    }
    return res;
  }) as typeof fetch;
}

/** The ledger, plus the charge of each call by its componentId (the CorpusClient's call id). */
export class TapLedger extends SpendLedger {
  readonly charged = new Map<string, number>();
  override append(entry: SpendEntry): void {
    super.append(entry);
    if (entry.componentId) this.charged.set(entry.componentId, (this.charged.get(entry.componentId) ?? 0) + entry.estCostUSD);
  }
}

/** Thrown to calls that arrive after the job has stopped: nothing new is dispatched. */
export class JobStoppedError extends BudgetExceededError {
  override name = "JobStoppedError";
}

export class CorpusClient implements ChatClient {
  arm = "";
  pull = "";
  attempt = 0;
  readonly log: Provenance[] = [];
  readonly #corpus: ResponseCache;
  readonly #shared: ReadOnlyCache;
  readonly #client: TokenFactoryClient;
  readonly #tap: TapLedger | null;
  readonly #inflight = new Map<string, Promise<ChatResult>>();
  readonly #all = new Set<Promise<unknown>>();
  readonly #chunkSeq = new Map<string, number>();
  #nextId = 1;
  #closed = false;

  /** `client` must have cache = corpus and readCache on (offline for `dry`); `tap` is its ledger. */
  constructor(o: { corpus: ResponseCache; shared: ReadOnlyCache; client: TokenFactoryClient; tap?: TapLedger }) {
    this.#corpus = o.corpus;
    this.#shared = o.shared;
    this.#client = o.client;
    this.#tap = o.tap ?? null;
  }

  /** After close(), every new call throws JobStoppedError; drain() waits for the calls already sent. */
  close() {
    this.#closed = true;
  }
  async drain() {
    while (this.#all.size) await Promise.allSettled([...this.#all]);
  }

  #chunkOf(stage: Stage, kind: string): number | undefined {
    if (stage !== "diff" && stage !== "ctx") return undefined;
    const k = `${this.arm}|${this.pull}|${this.attempt}|${stage}`;
    if (kind === "first") this.#chunkSeq.set(k, (this.#chunkSeq.get(k) ?? -1) + 1);
    return this.#chunkSeq.get(k);
  }

  async chat(request: ChatRequest, meta: { purpose: string; componentId?: string }): Promise<ChatResult> {
    const key = ResponseCache.key(request.model, request);
    const stage = stageOf(request);
    const kind = attemptKind(request);
    const callId = this.#nextId++;
    const chunk = this.#chunkOf(stage, kind);
    const base = { callId, arm: this.arm, pull: this.pull, attempt: this.attempt, key, stage, kind, ...(chunk !== undefined && { chunk }) };
    if (this.#closed) {
      this.log.push({ ...base, source: "fresh", ok: false, costUSD: 0, error: "JobStoppedError" });
      throw new JobStoppedError("the job has stopped; no new request is sent");
    }
    const pending = this.#inflight.get(key);
    if (pending) {
      try {
        const r = await pending;
        this.log.push({ ...base, source: "joined", ok: true, ...(r.finishReason !== undefined && { finishReason: r.finishReason }), contentEmpty: !r.content?.trim(), costUSD: 0 });
        return { ...r, cached: true, costUSD: 0 };
      } catch (e) {
        this.log.push({ ...base, source: "joined", ok: false, costUSD: 0, error: (e as Error).name });
        throw e;
      }
    }
    let source: Provenance["source"] = "corpus";
    if (this.#corpus.get(key) === undefined) {
      const hit = this.#shared.get<unknown>(key);
      if (hit !== undefined) {
        this.#corpus.put(key, hit);
        source = "shared";
      } else source = "fresh";
    }
    const id = `${DECISION}:${callId}`;
    const p = this.#client.chat(request, { purpose: meta.purpose, componentId: id });
    this.#inflight.set(key, p);
    this.#all.add(p);
    try {
      const r = await p;
      this.log.push({ ...base, source: r.cached ? source : "fresh", ok: true, ...(r.finishReason !== undefined && { finishReason: r.finishReason }), contentEmpty: !r.content?.trim(), costUSD: r.cached ? 0 : (this.#tap?.charged.get(id) ?? r.costUSD) });
      return r;
    } catch (e) {
      const miss = e instanceof CacheMissError;
      this.log.push({ ...base, source: miss ? "miss" : "fresh", ok: false, costUSD: this.#tap?.charged.get(id) ?? 0, error: (e as Error).name });
      throw e;
    } finally {
      this.#inflight.delete(key);
      this.#all.delete(p);
    }
  }
}

// ---- one pull request: run-test-set.ts's pipeline, with the arm's reviewer switches ----

export interface Attempt {
  diff: ReviewOutput;
  ctx: ReviewCtxOutput;
  ctxOnly: ReviewComment[];
  diffVerdicts: CtxVerifiedReview;
  ctxOnlyVerdicts: CtxVerifiedReview;
  kept: ReviewComment[];
  requestFailures: number;
  costUSD: number;
  wallMs: number;
}
const strip = (c: ReviewComment): ReviewComment => ({ path: c.path, line: c.line, body: c.body });

/** pool-verify-v1 on one pull request; `arm` reaches the two reviewers only. Equal to run-test-set's pipeline for arm A (test). */
export async function pipeline(client: ChatClient, input: PullInput, repo: { source: GitSource; head: string }, arm: Pick<ReviewOptions, "parser" | "retryOnLength">, model = MODEL): Promise<Attempt> {
  const started = performance.now();
  const opts = { model, reasoning: REVIEW_REASONING, ...arm };
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

function writeNew(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n", { flag: "wx" });
}
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

function readInput(file: string): PullInput {
  const j = readJson<{ title?: unknown; body?: unknown; description?: unknown; diff?: unknown; number?: unknown }>(file);
  if (typeof j.title !== "string" || typeof j.diff !== "string") throw new Error(`${file}: needs string "title" and "diff"`);
  const description = typeof j.description === "string" ? j.description : typeof j.body === "string" ? j.body : "";
  return { title: j.title, description, diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
}

export interface Manifest {
  pulls: { id: string; head: string; inputSha256: string }[];
  goldenSha256: Record<string, string>;
  digest: string;
}

/** The 40 dev jobs and their manifest (ids, heads, input and golden hashes). Throws unless the set is exactly EXPECTED_PULLS. */
export function devJobs(bench: string) {
  const jobs = REPOS.flatMap((repo) => {
    const p = inputPaths(bench, "dev", repo);
    const heads = readJson<Record<string, { head: string }>>(p.heads);
    return readdirSync(p.prs)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
      .map((file) => {
        const name = file.replace(/\.json$/, "");
        const head = heads[name]?.head;
        if (!head) throw new Error(`no head for ${repo}/${file}`);
        const raw = readFileSync(join(p.prs, file));
        return { repo, file, name, id: `${repo}/${name}`, input: readInput(join(p.prs, file)), inputSha256: sha256(raw), head, gitDir: p.gitDir };
      });
  });
  const ids = jobs.map((j) => j.id);
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_PULLS)) throw new Error(`the dev pull requests are not the expected 40 (${ids.length} found)`);
  const goldenSha256 = Object.fromEntries(REPOS.map((r) => [r, sha256(readFileSync(inputPaths(bench, "dev", r).golden))]));
  const pulls = jobs.map((j) => ({ id: j.id, head: j.head, inputSha256: j.inputSha256 }));
  const digest = sha256(JSON.stringify({ pulls, goldenSha256 }));
  return { jobs, manifest: { pulls, goldenSha256, digest } satisfies Manifest };
}

// ---- the freeze and the budget ----

/** Nothing under the pipeline's paths may differ from RECOVERY_BASE except files added since; nothing uncommitted or untracked there. */
export const FROZEN_PATHS_073 = Object.freeze(["packages/analyzer/src", "config", "scripts/bench"]);
export function freezeCheck073(root = REPO_ROOT): { ok: boolean; why?: string; head: string } {
  const git = (args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  if (git(["merge-base", "--is-ancestor", RECOVERY_BASE, "HEAD"]).status !== 0) return { ok: false, why: `${RECOVERY_BASE} is not an ancestor of HEAD`, head };
  const d = git(["diff", "--name-only", "--no-renames", "--diff-filter=DMTUXB", RECOVERY_BASE, "HEAD", "--", ...FROZEN_PATHS_073]);
  if (d.status !== 0) return { ok: false, why: "git diff failed", head };
  if (d.stdout.trim()) return { ok: false, why: `changed since ${RECOVERY_BASE.slice(0, 7)}: ${d.stdout.trim().split("\n").join(", ")}`, head };
  const st = git(["status", "--porcelain", "--untracked-files=all", "--", ...FROZEN_PATHS_073]);
  if (st.status !== 0 || st.stdout.trim()) return { ok: false, why: `uncommitted or untracked files under ${FROZEN_PATHS_073.join(" ")}`, head };
  return { ok: true, head };
}

/** One Budget for the whole job: run cap JOB_CAP_USD, total cap = ledger total at start + JOB_CAP_USD (both no higher than the env caps). */
export function budgetFor(env: NodeJS.ProcessEnv, ledgerStartUSD: number): { ok: true; budget: Budget } | { ok: false; why: string } {
  const caps = capsFromEnv(env);
  if (caps.runUSD < JOB_CAP_USD) return { ok: false, why: `TRACEHOUND_BUDGET_RUN_USD=${caps.runUSD} is below the job cap $${JOB_CAP_USD}: set it to ${JOB_CAP_USD} so the job is not cut short` };
  return { ok: true, budget: new Budget({ runUSD: JOB_CAP_USD, totalUSD: Math.min(caps.totalUSD, ledgerStartUSD + JOB_CAP_USD) }, ledgerStartUSD) };
}

// ---- the job ----

export interface Deps {
  bench: string;
  stateDir: string;
  pricesFile: string;
  env: NodeJS.ProcessEnv;
  log: (l: string) => void;
  err: (l: string) => void;
  fetch?: typeof fetch;
  freezeCheck?: () => { ok: boolean; why?: string; head: string };
  /** the shared cache; default <stateDir>/cache, read with get() only */
  shared?: ReadOnlyCache;
  /** default gitSource; tests pass a synthetic one */
  source?: (gitDir: string, head: string) => GitSource;
  repoRoot?: string;
}

/** Exit codes: 0 complete, 1 refused (nothing written), 2 stopped at the cap, 3 failed. */
export async function runJob(mode: "dry" | "run", deps: Deps): Promise<number> {
  const dry = mode === "dry";
  const where = checkBench(deps.bench, deps.repoRoot);
  if (!where.ok) return (deps.err(`[recovery-ab] refusing: ${where.why}`), 1);
  const bench = where.bench;
  const freeze = (deps.freezeCheck ?? freezeCheck073)();
  if (!dry && !freeze.ok) return (deps.err(`[recovery-ab] refusing: ${freeze.why}`), 1);
  const ledger = new TapLedger(join(deps.stateDir, "spend.jsonl"));
  const ledgerStartUSD = ledger.totalUSD();
  const b = dry ? { ok: true as const, budget: new Budget({ runUSD: 0, totalUSD: 0 }, ledgerStartUSD) } : budgetFor(deps.env, ledgerStartUSD);
  if (!b.ok) return (deps.err(`[recovery-ab] refusing: ${b.why}`), 1);
  const apiKey = dry ? "dry-run" : deps.env.NEBIUS_API_KEY;
  if (!apiKey) return (deps.err("[recovery-ab] NEBIUS_API_KEY is not set"), 1);
  let jobs: ReturnType<typeof devJobs>["jobs"];
  let manifest: Manifest;
  try {
    ({ jobs, manifest } = devJobs(bench));
  } catch (e) {
    return (deps.err(`[recovery-ab] refusing: dev inputs not ready (${(e as Error).message.replace(bench, "<bench>")})`), 1);
  }
  const dryRun = join(outDir(bench, true), "run.json");
  if (!dry && existsSync(dryRun) && readJson<{ manifest?: Manifest }>(dryRun).manifest?.digest !== manifest.digest) return (deps.err("[recovery-ab] refusing: the inputs differ from the dry run's manifest"), 1);
  const dir = outDir(bench, dry);
  try {
    mkdirSync(dir); // fails if it exists: never over an earlier run
  } catch {
    return (deps.err(`[recovery-ab] refusing: ${dir} exists`), 1);
  }
  const corpus = new ResponseCache(join(dir, "corpus"));
  const client = new TokenFactoryClient({
    apiKey,
    baseUrl: deps.env.NEBIUS_BASE_URL,
    prices: loadPriceTable(deps.pricesFile),
    budget: b.budget,
    ledger,
    cache: corpus,
    readCache: true,
    offline: dry,
    timeoutMs: 600_000,
    fetch: storingFetch(corpus, deps.fetch ?? globalThis.fetch),
  });
  const cc = new CorpusClient({ corpus, shared: deps.shared ?? new ResponseCache(join(deps.stateDir, "cache")), client, tap: ledger });
  const source = deps.source ?? gitSource;
  const arms: ArmId[] = dry ? ["A"] : ARM_IDS;
  const state = {
    decision: DECISION,
    mode,
    status: "running" as "running" | "complete" | "stopped-at-cap" | "failed",
    head: freeze.head,
    freeze,
    recoveryBase: RECOVERY_BASE,
    model: MODEL,
    arms: Object.fromEntries(arms.map((a) => [a, ARMS[a]])),
    judges: JUDGES,
    manifest,
    jobCapUSD: JOB_CAP_USD,
    ledgerStartUSD,
    caps: b.budget.caps,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    costUSD: 0,
    pulls: [] as { arm: ArmId; id: string; attempts: number; requestFailuresFirst: number; costUSD: number; wallMs: number }[],
    scored: [] as { arm: ArmId; judge: string; repo: string; judgeFailed: number; calls: number; cached: number; costUSD: number }[],
    stoppedAt: null as string | null,
    error: null as string | null,
  };
  const save = () => {
    state.costUSD = b.budget.runSpent;
    writeFileSync(join(dir, "run.json"), JSON.stringify(state, null, 1) + "\n");
    writeFileSync(join(dir, "provenance.json"), JSON.stringify(cc.log) + "\n");
  };
  save();
  let capHit: BudgetExceededError | null = null;
  const judgeClient: ChatClient = {
    chat: async (request, meta) => {
      try {
        return await cc.chat(request, meta);
      } catch (e) {
        if (e instanceof BudgetExceededError) capHit ??= e;
        throw e;
      }
    },
  };
  try {
    for (const arm of arms) {
      cc.arm = arm;
      for (const [k, job] of jobs.entries()) {
        cc.pull = job.id;
        const repoSrc = { source: source(job.gitDir, job.head), head: job.head };
        cc.attempt = 1;
        const a1 = await pipeline(cc, job.input, repoSrc, ARMS[arm]);
        writeNew(join(dir, arm, "attempts", job.repo, `${job.name}.attempt-1.json`), a1);
        let used = a1;
        if (a1.requestFailures > 0 && !dry) {
          cc.attempt = 2;
          used = await pipeline(cc, job.input, repoSrc, ARMS[arm]); // the runner's rerun rule: once
          writeNew(join(dir, arm, "attempts", job.repo, `${job.name}.attempt-2.json`), used);
        }
        const header = { pr_title: job.input.title, ...(job.input.number !== undefined && { pr_number: job.input.number }) };
        writeNew(join(dir, arm, "pool-raw", job.repo, job.file), { ...header, comments: [...used.diff.comments.map(strip), ...used.ctxOnly] });
        writeNew(join(dir, arm, "pool-verify-v1", job.repo, job.file), { ...header, comments: used.kept });
        state.pulls.push({ arm, id: job.id, attempts: used === a1 ? 1 : 2, requestFailuresFirst: a1.requestFailures, costUSD: a1.costUSD + (used === a1 ? 0 : used.costUSD), wallMs: a1.wallMs + (used === a1 ? 0 : used.wallMs) });
        save();
        deps.err(`[recovery-ab] ${mode} arm ${arm}: pull request ${k + 1}/${jobs.length} · spend $${b.budget.runSpent.toFixed(4)}`);
      }
    }
    cc.attempt = 0;
    for (const j of JUDGES) {
      for (const arm of arms) {
        cc.arm = arm;
        for (const repo of REPOS) {
          cc.pull = `${repo}/*`;
          const golden = GoldenFile.parse(readJson(inputPaths(bench, "dev", repo).golden));
          const lj = new LlmJudge(judgeClient, { model: j.model, reasoning: j.reasoning });
          const result = await scoreRepo({ golden, reviews: loadReviews(join(dir, arm, "pool-verify-v1", repo)), judges: [lj], concurrency: JUDGE_CONCURRENCY });
          if (capHit) throw capHit;
          const base = join(dir, "scores", j.id, `${arm}-${repo}`);
          writeNew(`${base}.detail.json`, result);
          const { detail: _d, ...countsOnly } = result;
          writeNew(`${base}.summary.json`, { ...countsOnly, metrics: metrics(result.counts) });
          state.scored.push({ arm, judge: j.id, repo, judgeFailed: result.pulls.judgeFailed, calls: result.usage.calls, cached: result.usage.cached, costUSD: result.usage.costUSD });
          save();
        }
      }
    }
  } catch (e) {
    cc.close(); // nothing new goes out; then wait for the calls already sent before the final snapshot
    await cc.drain();
    state.status = e instanceof BudgetExceededError ? "stopped-at-cap" : "failed";
    state.error = `${(e as Error).name}: ${(e as Error).message}`;
    state.stoppedAt = `${state.pulls.length} arm-pulls done, ${state.scored.length} score files`;
    state.finishedAt = new Date().toISOString();
    save();
    deps.err(`[recovery-ab] ${state.status.toUpperCase()} (${(e as Error).name}) at ${state.stoppedAt}; spent $${b.budget.runSpent.toFixed(4)}; the result is inconclusive`);
    return state.status === "stopped-at-cap" ? 2 : 3;
  }
  await cc.drain();
  state.status = "complete";
  state.finishedAt = new Date().toISOString();
  save();
  for (const l of dry ? dryReport(dir) : markdown(analyze(dir, ledger.totalUSD() - ledgerStartUSD))) deps.log(l);
  return 0;
}

// ---- analysis (counts only) ----

type Pull = { repo: string; name: string; id: string };
const pullsOf = (dir: string, arm: ArmId): Pull[] =>
  REPOS.flatMap((repo) => {
    const d = join(dir, arm, "pool-verify-v1", repo);
    return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((f) => ({ repo, name: f.replace(/\.json$/, ""), id: `${repo}/${f.replace(/\.json$/, "")}` })) : [];
  });
/** The attempt the run used (attempt 2 when the rerun rule fired) and its number. */
function usedAttempt(dir: string, arm: ArmId, p: Pull): { a: Attempt; n: number } {
  const two = join(dir, arm, "attempts", p.repo, `${p.name}.attempt-2.json`);
  return existsSync(two) ? { a: readJson<Attempt>(two), n: 2 } : { a: readJson<Attempt>(join(dir, arm, "attempts", p.repo, `${p.name}.attempt-1.json`)), n: 1 };
}
const commentKey = (c: { path: string; line: number | null; body: string }) => `${c.path}\0${c.line}\0${c.body}`;
const sameList = (a: ReviewComment[], b: ReviewComment[]) => JSON.stringify(a.map(commentKey)) === JSON.stringify(b.map(commentKey));

export interface ArmCounts {
  pulls: number;
  chunks: number;
  chunkFailed: { diff: number; ctx: number; total: number };
  pullsWithFailedChunk: number;
  /** pool-raw empty and at least one terminal CHUNK_FAILED */
  emptyByFailure: number;
  verifyFailed: number;
  kept: number;
}
export interface JudgeCompare {
  scoredBoth: number;
  a: { tp: number; fp: number; precision: number | null; recall: number | null; f: number | null };
  x: { tp: number; fp: number; precision: number | null; recall: number | null; f: number | null };
  changedJudgeFailed: number;
  unchangedDiffer: number;
  /** comments in the arm's kept list and not in A's, on changed pulls, by outcome */
  recovered: Record<"tp" | "fp" | "duplicate" | "low", number>;
  tpOk: boolean;
  precisionOk: boolean;
}
export interface Analysis {
  status: string;
  spendUSD: number;
  provenanceUSD: number;
  costByArm: Record<string, { generation: number; verify: number; judge: number; failedCalls: number }>;
  arms: Partial<Record<ArmId, ArmCounts>>;
  changedPulls: Partial<Record<ArmId, number>>;
  unpairedPulls: string[];
  pairedFailedChunks: Partial<Record<ArmId, number>>;
  firstAttempts: { total: number; shared: number; fresh: number; failedChunks: number; failedChunksShared: number; failedChunksFresh: number };
  finishReasonsA: Record<string, number>;
  e4: { replies: number; strictOk: number; lenientDiffers: number; missingBodies: number };
  requestErrors: number;
  coverage: { ok: boolean; problems: string[] };
  judges: Record<string, Partial<Record<"B1" | "B2", JudgeCompare>>>;
  misses: number;
  verdict: Partial<Record<"B1" | "B2", { e2: boolean; e3: boolean; e4: boolean; complete: boolean; pass: boolean }>> & { overall: "PASS" | "FAIL" | "INCONCLUSIVE"; adopted: "B2" | "B1" | null; why: string[] };
}

const chunkId = (p: Pull, stage: "diff" | "ctx", c: ChunkRecord) => `${p.id}#${stage}${c.index}`;

export function armCounts(dir: string, arm: ArmId): ArmCounts {
  const out: ArmCounts = { pulls: 0, chunks: 0, chunkFailed: { diff: 0, ctx: 0, total: 0 }, pullsWithFailedChunk: 0, emptyByFailure: 0, verifyFailed: 0, kept: 0 };
  for (const p of pullsOf(dir, arm)) {
    const { a } = usedAttempt(dir, arm, p);
    const fd = a.diff.review.chunks.filter((c) => c.status === "CHUNK_FAILED").length;
    const fc = a.ctx.review.chunks.filter((c) => c.status === "CHUNK_FAILED").length;
    out.pulls++;
    out.chunks += a.diff.review.chunks.length + a.ctx.review.chunks.length;
    out.chunkFailed.diff += fd;
    out.chunkFailed.ctx += fc;
    if (fd + fc) out.pullsWithFailedChunk++;
    const raw = readJson<{ comments: unknown[] }>(join(dir, arm, "pool-raw", p.repo, `${p.name}.json`)).comments.length;
    if (fd + fc && raw === 0) out.emptyByFailure++;
    out.verifyFailed += [...a.diffVerdicts.comments, ...a.ctxOnlyVerdicts.comments].filter((c) => c.status === "VERIFY_FAILED").length;
    out.kept += a.kept.length;
  }
  out.chunkFailed.total = out.chunkFailed.diff + out.chunkFailed.ctx;
  return out;
}

/** Failed chunks of the used attempts, as [chunk id, used attempt number]. */
function failedChunks(dir: string, arm: ArmId, exclude: Set<string>): { id: string; pull: string; stage: "diff" | "ctx"; index: number; attempt: number }[] {
  return pullsOf(dir, arm)
    .filter((p) => !exclude.has(p.id))
    .flatMap((p) => {
      const { a, n } = usedAttempt(dir, arm, p);
      return (["diff", "ctx"] as const).flatMap((stage) =>
        a[stage].review.chunks.filter((c) => c.status === "CHUNK_FAILED").map((c) => ({ id: chunkId(p, stage, c), pull: p.id, stage, index: c.index, attempt: n })),
      );
    });
}

type ScoreDetail = { detail: PullDetail[] };
function scoresOf(dir: string, judge: string, arm: ArmId): Map<string, PullDetail> | null {
  const m = new Map<string, PullDetail>();
  for (const repo of REPOS) {
    const f = join(dir, "scores", judge, `${arm}-${repo}.detail.json`);
    if (!existsSync(f)) return null;
    for (const d of readJson<ScoreDetail>(f).detail) m.set(`${repo}/${d.reviewFile.replace(/\.json$/, "")}`, d);
  }
  return m;
}

export function compareJudge(a: Map<string, PullDetail>, x: Map<string, PullDetail>, changed: Set<string>, exclude: Set<string>): JudgeCompare {
  let ca = zeroCounts();
  let cx = zeroCounts();
  let scoredBoth = 0;
  let changedJudgeFailed = 0;
  let unchangedDiffer = 0;
  const recovered = { tp: 0, fp: 0, duplicate: 0, low: 0 };
  for (const [k, da] of a) {
    const dx = x.get(k);
    if (exclude.has(k)) continue;
    const isChanged = changed.has(k);
    if (!dx || da.status !== "SCORED" || dx.status !== "SCORED") {
      if (isChanged) changedJudgeFailed++;
      continue; // coverage (analyze) makes any such pull inconclusive; it is never silently dropped
    }
    if (!isChanged && JSON.stringify(da.counts) !== JSON.stringify(dx.counts)) unchangedDiffer++;
    scoredBoth++;
    ca = addCounts(ca, da.counts!);
    cx = addCounts(cx, dx.counts!);
    if (isChanged) {
      const inA = new Map<string, number>();
      for (const c of da.comments) inA.set(commentKey(c), (inA.get(commentKey(c)) ?? 0) + 1);
      for (const c of dx.comments) {
        const n = inA.get(commentKey(c)) ?? 0;
        if (n > 0) inA.set(commentKey(c), n - 1);
        else if (c.outcome) recovered[c.outcome]++;
      }
    }
  }
  const m = (c: Counts) => ({ tp: c.tp, fp: c.fp, ...metrics(c) });
  const ma = m(ca);
  const mx = m(cx);
  return {
    scoredBoth,
    a: ma,
    x: mx,
    changedJudgeFailed,
    unchangedDiffer,
    recovered,
    tpOk: mx.tp >= ma.tp,
    // P_B ≥ P_A; with no TP+FP in A, any B precision passes; with none in B and some in A, it fails
    precisionOk: ma.precision === null ? true : mx.precision !== null && mx.precision >= ma.precision - 1e-12,
  };
}

export function analyze(dir: string, spendUSD: number): Analysis {
  const run = readJson<{ status: string; arms: Record<string, unknown> }>(join(dir, "run.json"));
  const prov = readJson<Provenance[]>(join(dir, "provenance.json"));
  const present = ARM_IDS.filter((a) => a in run.arms);
  const problems: string[] = [];
  const arms: Analysis["arms"] = {};
  for (const a of present) {
    const ids = pullsOf(dir, a).map((p) => p.id);
    if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_PULLS)) problems.push(`arm ${a}: ${ids.length} of ${EXPECTED_PULLS.length} pull requests`);
    else arms[a] = armCounts(dir, a);
  }
  if (present.length !== ARM_IDS.length) problems.push(`arms run: ${present.join(", ") || "none"}`);

  // unpaired: a pull with a request that went out live in more than one arm
  const liveArms = new Map<string, Set<string>>();
  for (const p of prov) if (p.source === "fresh" && p.error !== "JobStoppedError") (liveArms.get(p.key) ?? liveArms.set(p.key, new Set()).get(p.key)!).add(p.arm);
  const unpaired = new Set(prov.filter((p) => (liveArms.get(p.key)?.size ?? 0) > 1).map((p) => p.pull));
  const unpairedPulls = [...unpaired].sort();

  const changedPulls: Analysis["changedPulls"] = {};
  const changedSets: Partial<Record<ArmId, Set<string>>> = {};
  for (const x of present.filter((a) => a !== "A" && arms[a] && arms.A)) {
    const s = new Set<string>();
    for (const p of pullsOf(dir, "A")) {
      const ka = readJson<{ comments: ReviewComment[] }>(join(dir, "A", "pool-verify-v1", p.repo, `${p.name}.json`)).comments;
      const kx = readJson<{ comments: ReviewComment[] }>(join(dir, x, "pool-verify-v1", p.repo, `${p.name}.json`)).comments;
      if (!sameList(ka, kx)) s.add(p.id);
    }
    changedSets[x] = s;
    changedPulls[x] = s.size;
  }
  const pairedFailedChunks: Analysis["pairedFailedChunks"] = {};
  for (const a of present) if (arms[a]) pairedFailedChunks[a] = failedChunks(dir, a, unpaired).length;

  // first attempts of the reviewers in arm A's used attempts, and of exactly the chunks that failed in A
  const usedN = new Map(arms.A ? pullsOf(dir, "A").map((p) => [p.id, usedAttempt(dir, "A", p).n]) : []);
  const firstA = prov.filter((p) => p.arm === "A" && (p.stage === "diff" || p.stage === "ctx") && p.kind === "first" && usedN.get(p.pull) === p.attempt);
  const failedA = arms.A ? failedChunks(dir, "A", new Set()) : [];
  const firstOfFailed = failedA.map((c) => firstA.find((p) => p.pull === c.pull && p.stage === c.stage && p.chunk === c.index));
  const firstAttempts = {
    total: firstA.length,
    shared: firstA.filter((p) => p.source === "shared").length,
    fresh: firstA.filter((p) => p.source === "fresh").length,
    failedChunks: failedA.length,
    failedChunksShared: firstOfFailed.filter((p) => p?.source === "shared").length,
    failedChunksFresh: firstOfFailed.filter((p) => p?.source === "fresh").length,
  };

  const finishReasonsA: Record<string, number> = {};
  for (const p of prov.filter((q) => q.arm === "A" && (q.stage === "diff" || q.stage === "ctx") && q.ok)) {
    const k = p.contentEmpty ? "empty" : p.finishReason === "length" ? "length" : p.finishReason === "stop" ? "stop" : "other";
    finishReasonsA[k] = (finishReasonsA[k] ?? 0) + 1;
  }
  const requestErrors = prov.filter((p) => !p.ok && p.source !== "miss" && p.error !== "JobStoppedError").length;

  // E4: every reviewer reply received in any arm that strict accepts must parse to the same findings under lenient
  const e4 = { replies: 0, strictOk: 0, lenientDiffers: 0, missingBodies: 0 };
  const corpus = new ResponseCache(join(dir, "corpus"));
  for (const key of new Set(prov.filter((p) => (p.stage === "diff" || p.stage === "ctx") && p.ok).map((p) => p.key))) {
    const body = corpus.get<{ choices?: { message?: { content?: string | null } }[] }>(key);
    if (!body) {
      e4.missingBodies++; // a reply was received but its bytes are not in the corpus
      continue;
    }
    const content = body.choices?.[0]?.message?.content ?? "";
    e4.replies++;
    const s = parseReviewReply(content, "strict");
    if (!s.ok) continue;
    e4.strictOk++;
    const l = parseReviewReply(content, "lenient");
    if (!l.ok || JSON.stringify(l.findings) !== JSON.stringify(s.findings)) e4.lenientDiffers++;
  }
  if (e4.missingBodies) problems.push(`${e4.missingBodies} received reviewer replies missing from the corpus`);

  // judging coverage: every arm, both judges, all 40 pull requests SCORED
  const judges: Analysis["judges"] = {};
  for (const j of JUDGES) {
    judges[j.id] = {};
    const byArm = new Map(present.map((a) => [a, scoresOf(dir, j.id, a)] as const));
    for (const [a, s] of byArm) {
      if (!s) problems.push(`${j.id} arm ${a}: score files missing`);
      else {
        const notScored = EXPECTED_PULLS.filter((id) => s.get(id)?.status !== "SCORED").length;
        if (notScored) problems.push(`${j.id} arm ${a}: ${notScored} pull requests not SCORED`);
        if (s.size !== EXPECTED_PULLS.length) problems.push(`${j.id} arm ${a}: ${s.size} scored entries`);
      }
    }
    const sa = byArm.get("A");
    for (const x of ["B1", "B2"] as const) {
      const sx = byArm.get(x);
      if (sa && sx && changedSets[x]) judges[j.id]![x] = compareJudge(sa, sx, changedSets[x]!, new Set()); // the mandatory E3 guard: all 40, nothing excluded
    }
  }

  // cost: what the ledger charged each call, by arm and stage; reconciled against the ledger's job total
  const costByArm: Analysis["costByArm"] = {};
  for (const p of prov) {
    const c = (costByArm[p.arm] ??= { generation: 0, verify: 0, judge: 0, failedCalls: 0 });
    if (!p.ok) c.failedCalls += p.costUSD;
    else if (p.stage === "diff" || p.stage === "ctx") c.generation += p.costUSD;
    else if (p.stage === "verify") c.verify += p.costUSD;
    else c.judge += p.costUSD;
  }
  const provenanceUSD = prov.reduce((s, p) => s + p.costUSD, 0);
  if (Math.abs(provenanceUSD - spendUSD) > 1e-6) problems.push(`per-call charges $${provenanceUSD.toFixed(6)} differ from the ledger's job total $${spendUSD.toFixed(6)}`);

  const misses = prov.filter((p) => p.source === "miss").length;
  if (misses) problems.push(`${misses} cache misses`);
  if (unpairedPulls.length) problems.push(`${unpairedPulls.length} unpaired pull requests (a request went out live in more than one arm)`);
  if (run.status !== "complete") problems.push(`run status ${run.status}`);
  const coverage = { ok: problems.length === 0, problems };

  const why = [...problems];
  const verdict: Analysis["verdict"] = { overall: "INCONCLUSIVE", adopted: null, why };
  const e4ok = e4.lenientDiffers === 0;
  for (const x of ["B1", "B2"] as const) {
    const ax = arms[x];
    const aa = arms.A;
    const jc = JUDGES.map((j) => judges[j.id]?.[x]);
    const cx = coverage.ok && !!ax && !!aa && jc.every((c) => c && c.scoredBoth === EXPECTED_PULLS.length && c.changedJudgeFailed === 0 && c.unchangedDiffer === 0);
    if (coverage.ok && !cx) why.push(`${x}: a changed pull request failed judging or an unchanged one scored differently`);
    const e2 = !!ax && !!aa && ax.chunkFailed.total <= 2 && ax.chunkFailed.total < aa.chunkFailed.total && ax.emptyByFailure === 0 && (pairedFailedChunks[x] ?? Infinity) < (pairedFailedChunks.A ?? 0);
    const e3 = jc.every((c) => !!c && c.tpOk && c.precisionOk);
    verdict[x] = { e2, e3, e4: e4ok, complete: cx, pass: cx && e2 && e3 && e4ok };
  }
  if (verdict.B2?.complete && verdict.B1?.complete) {
    verdict.adopted = verdict.B2.pass ? "B2" : verdict.B1.pass ? "B1" : null;
    verdict.overall = verdict.adopted ? "PASS" : "FAIL";
  }
  return { status: run.status, spendUSD, provenanceUSD, costByArm, arms, changedPulls, unpairedPulls, pairedFailedChunks, firstAttempts, finishReasonsA, e4, requestErrors, coverage, judges, misses, verdict };
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `${(100 * x).toFixed(1)}%`);
export function markdown(r: Analysis): string[] {
  const L: string[] = [];
  L.push(`status ${r.status} · spend (ledger) $${r.spendUSD.toFixed(4)} · per-call charges $${r.provenanceUSD.toFixed(4)} · cache misses ${r.misses} · request errors ${r.requestErrors} · unpaired pulls ${r.unpairedPulls.length}`);
  L.push(`coverage: ${r.coverage.ok ? "complete" : r.coverage.problems.join("; ")}`);
  const fa = r.firstAttempts;
  L.push(`arm A first reviewer attempts ${fa.total}: from the shared cache ${fa.shared}, sent fresh ${fa.fresh}; of the ${fa.failedChunks} chunks that failed in A, first attempt from the shared cache ${fa.failedChunksShared}, fresh ${fa.failedChunksFresh}`);
  L.push(`arm A reviewer replies by finish: ${Object.entries(r.finishReasonsA).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  L.push(`E4: reviewer replies ${r.e4.replies}, strict-valid ${r.e4.strictOk}, lenient differs ${r.e4.lenientDiffers}, missing bodies ${r.e4.missingBodies}`);
  L.push(`cost by arm (generation / verify / judge / failed calls): ${Object.entries(r.costByArm).map(([a, c]) => `${a} $${c.generation.toFixed(4)} / $${c.verify.toFixed(4)} / $${c.judge.toFixed(4)} / $${c.failedCalls.toFixed(4)}`).join(" · ")}`);
  L.push("");
  L.push("| arm | pulls | chunks | CHUNK_FAILED (diff/ctx) | paired failed | pulls with a failed chunk | empty by failure | VERIFY_FAILED | kept | changed pulls vs A |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const a of ARM_IDS) {
    const c = r.arms[a];
    if (!c) continue;
    L.push(`| ${a} | ${c.pulls} | ${c.chunks} | ${c.chunkFailed.total} (${c.chunkFailed.diff}/${c.chunkFailed.ctx}) | ${r.pairedFailedChunks[a]} | ${c.pullsWithFailedChunk} | ${c.emptyByFailure} | ${c.verifyFailed} | ${c.kept} | ${a === "A" ? "—" : r.changedPulls[a]} |`);
  }
  for (const [j, byArm] of Object.entries(r.judges)) {
    L.push("");
    L.push(`${j}:`);
    L.push("| arm | scored in both | TP A → arm | FP A → arm | P A → arm | R A → arm | F A → arm | recovered tp/fp/dup/low | changed JUDGE_FAILED | unchanged differ |");
    L.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const [x, c] of Object.entries(byArm)) {
      L.push(`| ${x} | ${c.scoredBoth} | ${c.a.tp} → ${c.x.tp} | ${c.a.fp} → ${c.x.fp} | ${pct(c.a.precision)} → ${pct(c.x.precision)} | ${pct(c.a.recall)} → ${pct(c.x.recall)} | ${pct(c.a.f)} → ${pct(c.x.f)} | ${c.recovered.tp}/${c.recovered.fp}/${c.recovered.duplicate}/${c.recovered.low} | ${c.changedJudgeFailed} | ${c.unchangedDiffer} |`);
    }
  }
  L.push("");
  for (const x of ["B1", "B2"] as const) {
    const v = r.verdict[x];
    if (v) L.push(`${x}: E2 ${v.e2 ? "pass" : "fail"} · E3 ${v.e3 ? "pass" : "fail"} · E4 ${v.e4 ? "pass" : "fail"} · complete ${v.complete ? "yes" : "no"} → ${v.pass ? "PASS" : "not met"}`);
  }
  L.push(`verdict: ${r.verdict.overall}${r.verdict.adopted ? ` (${r.verdict.adopted})` : ""}${r.verdict.why.length ? ` · ${r.verdict.why.join("; ")}` : ""}`);
  return L;
}

export function dryReport(dir: string): string[] {
  const prov = readJson<Provenance[]>(join(dir, "provenance.json"));
  const run = readJson<{ manifest: Manifest }>(join(dir, "run.json"));
  const by = new Map<string, number>();
  for (const p of prov) by.set(`${p.stage}/${p.kind}/${p.source}`, (by.get(`${p.stage}/${p.kind}/${p.source}`) ?? 0) + 1);
  return [`dry run (arm A from the cache, $0) · manifest ${run.manifest.digest} · ${run.manifest.pulls.length} pull requests · requests by stage/kind/source:`, ...[...by].sort().map(([k, v]) => `${k} ${v}`)];
}

if (import.meta.main) {
  const mode = process.argv[2];
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  const stateDir = join(REPO_ROOT, ".tracehound");
  const where = checkBench(bench);
  if (!where.ok) {
    console.error(`[recovery-ab] refusing: ${where.why}`);
    process.exitCode = 1;
  } else if (mode === "report") {
    const dir = outDir(where.bench);
    const run = readJson<{ ledgerStartUSD: number }>(join(dir, "run.json"));
    for (const l of markdown(analyze(dir, new SpendLedger(join(stateDir, "spend.jsonl")).totalUSD() - run.ledgerStartUSD))) console.log(l);
  } else if (mode === "dry" || mode === "run") {
    try {
      if (mode === "run" && !process.env.NEBIUS_API_KEY) process.loadEnvFile(join(REPO_ROOT, ".env"));
    } catch {
      // runJob reports the missing key
    }
    process.exitCode = await runJob(mode, { bench: where.bench, stateDir, pricesFile: join(REPO_ROOT, "config/prices.json"), env: process.env, log: (l) => console.log(l), err: (l) => console.error(l) });
  } else {
    console.error("usage: recovery-ab.ts dry|run|report [--bench <dir>]");
    process.exitCode = 1;
  }
}
