#!/usr/bin/env node
/**
 * run-tracehound.ts: review test-set cases locally with the Action's own pipeline (pool-verify-v1), on the exact
 * commits the fork pull request shows. Brief: tracehound-testset run/briefs/bunny-runner.md.
 *
 *   node scripts/run-tracehound.ts --manifest <case manifest json> --clone <git dir> [--ids a,b] [--execute]
 *     [--out-dir runs/tracehound] [--max-usd-per-case 0.25] [--max-usd-run 2] [--cache off|read] [--fixes on|off]
 *     [--contracts on|off] [--rerun] [--post --repo SunnyBagal/<fork> --pr-map <json|resume jsonl>]
 *     [--gh-bin gh] [--git-bin git] [--provider-config <anthropic row json>]
 *
 * Commits: base = manifest base_sha (branch cases/<id>-base), head = manifest case_head_sha (branch cases/<id>), the
 * pair open-prs.ts pushes and the fork PR shows. upstream head_sha must have the same tree as case_head_sha.
 *
 * Without --execute this is a dry run: it validates the manifest, ids and clone (read-only local git, no lazy
 * fetch), prints the plan per case and makes no model call, no gh call and no network call.
 *
 * Path per case (--execute): checkRepoHead + prepareReview from packages/action (the code runAction runs between
 * reading the diff and posting), runPipeline as cli.ts wires it, with the Action's defaults (action.yml). Only the
 * GitHub reads are replaced: the diff is `git diff base head` from the clone, title/body come from the manifest
 * (open-prs.ts uses the same fields for the PR). learn is off (the Action's default; it would read GitHub).
 *
 * Spend: every model call goes through src/llm/client.ts in the analyzer subprocesses and the fix client. Per case
 * with allowance A (--max-usd-per-case): every stage gets TRACEHOUND_BUDGET_TOTAL_USD = min(env total cap, ledger
 * before the case + A), so a stage that starts later sees what earlier stages spent; the two reviewers run in
 * parallel and cannot see each other, so each also gets TRACEHOUND_BUDGET_RUN_USD = A/2. The case can never spend
 * more than A. --max-usd-run R: a case is not started when (ledger now - ledger at run start) + A > R.
 *
 * Lineage (B1): each record keeps `lineage`, every stage's output as the stage wrote it: both reviewers (findings, chunk
 * statuses and attempts), the pool with sources, the verifier's verdicts (with reasons) and kept file, and the contracts
 * result. scripts/testset/replay-arms.ts rebuilds the arms (A0 pool-verify-v1, A1 pool-raw, A2 review-diff-v1) from it.
 *
 * Report-only Claude rows (decision 076g item 4, AGENTS.md exception (1)): --provider-config <file> names a
 * {provider: anthropic, scope: report-only-dev, model, effort?, thinking?} row (llm/provider.ts). The runner then hands
 * runPipeline that model and appends --provider-config to each of its three analyzer stages (review, review-ctx,
 * verify-ctx; any other stage is refused), so they build the Anthropic client instead of the Nebius one. Caps and usage
 * move to the separate .tracehound/spend.anthropic.jsonl: the global cap is TRACEHOUND_BUDGET_ANTHROPIC_USD, each
 * stage gets TRACEHOUND_BUDGET_ANTHROPIC_USD / _RUN_USD as above, and its Nebius run cap is 0, so no Nebius call can be
 * made. A row with thinking off also gets --reasoning off on each stage (the CLIs default to on, which the request would
 * carry over the row's setting), and the CLIs refuse a row whose thinking conflicts with --reasoning. Dev manifests
 * only; --post, --fixes on and --contracts on are refused. Without the option nothing changes.
 *
 * Exit codes: 0 every case ok, 1 a case failed or hit its cap (each has its file), 2 refused (bad input or a safety
 * check failed; nothing was spent), 3 stopped before a case by --max-usd-run.
 * Node >= 24 type stripping: erasable TypeScript only, no new dependencies.
 */
import { spawnSync, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { prepareReview, type Dependencies, type Finding, type Options, type PullEvent, type ReviewerInput } from "../packages/action/src/action.ts";
import { checkRepoHead as actionCheckRepoHead, runPipeline as actionRunPipeline, type Execute, type LineagePart, type PipelineOptions, type PipelineOutput } from "../packages/action/src/pipeline.ts";
import { createFixClient, FIX_MODEL, runFixes as actionRunFixes, type FixClient, type FixOutput } from "../packages/action/src/fix.ts";
import { FIX_SYSTEM_PROMPT } from "../packages/action/src/fix-prompt.ts";
import { runContracts as actionRunContracts, selectContracts, type ContractsResult } from "../packages/action/src/contracts.ts";
import { ledgerMark, ledgerSince, recordingClient, UsageRecorder, type StageUsage } from "../packages/action/src/usage.ts";
import { BudgetExceededError, capsFromEnv, type BudgetCaps } from "../packages/analyzer/src/llm/budget.ts";
import { SpendLedger } from "../packages/analyzer/src/llm/ledger.ts";
import { ANTHROPIC_CAP_NAMES, anthropicCapsFromEnv } from "../packages/analyzer/src/llm/anthropic.ts";
import { parseAnthropicRowConfig, type AnthropicRowConfig } from "../packages/analyzer/src/llm/provider.ts";
import { REVIEW_PROMPT_SHA256 } from "../packages/analyzer/src/review/review.ts";
import { REVIEW_CTX_PROMPT_SHA256 } from "../packages/analyzer/src/review/review-ctx.ts";
import { VERIFY_CTX_PROMPT_SHA256 } from "../packages/analyzer/src/review/verify-ctx.ts";
import { ANALYZER_VERSION } from "../packages/analyzer/src/version.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OWNER = "SunnyBagal";
const FORK_RE = /^SunnyBagal\/[A-Za-z0-9._-]+$/;
const ID_RE = /^(case|ho)-\d{3}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
/** Same table as tracehound-testset scripts/open-prs.ts: the parent each fork must have. */
export const UPSTREAM: Readonly<Record<string, string>> = {
  twenty: "twentyhq/twenty",
  medusa: "medusajs/medusa",
  payload: "payloadcms/payload",
  bullmq: "taskforcesh/bullmq",
};
/** The Action's defaults (.github/actions/tracehound-review/action.yml; pinned by test/run-tracehound.test.ts). */
export const ACTION_DEFAULTS = {
  model: "nvidia/Nemotron-3.5-Super-VL", reviewer: "pool-verify-v1", maxComments: 15, fixes: "on", contracts: "on", learn: "off",
} as const;
export const MARKER = (id: string) => `<!-- tracehound-runner case=${id} -->`;
/** A model refusal by the budget: the analyzer CLIs rethrow BudgetExceededError, so the child dies with this on stderr. */
const BUDGET_RE = /BudgetExceededError|TRACEHOUND_BUDGET_(RUN|TOTAL|ANTHROPIC|ANTHROPIC_RUN)_USD/;
const GH_COMMENT_MAX = 65_000;

export class Refusal extends Error {}
function refuse(msg: string): never {
  throw new Refusal(msg);
}

export type Case = {
  id: string; repo: string; title: string; description: string; base_sha: string; case_head_sha: string;
  head_sha?: string; pr?: number;
};
export type Opts = {
  manifest: string; clone: string; ids: string[] | null; execute: boolean; outDir: string;
  maxUsdPerCase: number; maxUsdRun: number; cache: "off" | "read"; fixes: "on" | "off"; contracts: "on" | "off";
  rerun: boolean; post: boolean; fork: string | null; prMap: string | null; ghBin: string; gitBin: string;
  /** report-only dev Claude row (--provider-config): the file and its parsed config; null = the Nebius default */
  providerConfig: string | null; provider: AnthropicRowConfig | null;
};
type Proc = { status: number | null; stdout: string; stderr: string };

/** Effects the tests replace. Defaults are the real Action functions. */
export interface RunnerDeps {
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  ledgerFile: string;
  /** the Anthropic row ledger; default: spend.anthropic.jsonl next to ledgerFile */
  anthropicLedgerFile?: string;
  envFile: string;
  runPipeline: (input: ReviewerInput, model: string, repo: string, head: string, log: (m: string) => void,
    exec: Execute, options: PipelineOptions) => Promise<PipelineOutput | null>;
  checkRepoHead: (repo: string, head: string) => Promise<void>;
  runFixes: (findings: Finding[], diff: string, repo: string, head: string, client: FixClient) => Promise<FixOutput>;
  createFixClient: (caps: BudgetCaps) => FixClient;
  runContracts: (repo: string, base: string, head: string, env: NodeJS.ProcessEnv) => Promise<ContractsResult>;
  /** the child-process runner handed to runPipeline (wrapped with the per-stage env) */
  exec: Execute;
}

export function defaultDeps(): RunnerDeps {
  return {
    env: process.env, log: (l) => console.log(l),
    ledgerFile: path.join(ROOT, ".tracehound/spend.jsonl"), envFile: path.join(ROOT, ".env"),
    runPipeline: actionRunPipeline, checkRepoHead: (repo, head) => actionCheckRepoHead(repo, head),
    runFixes: (f, d, r, h, c) => actionRunFixes(f, d, r, h, c), createFixClient,
    runContracts: (repo, base, head, env) => actionRunContracts(repo, base, head, env),
    exec: promisify(execFile) as unknown as Execute,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------------------------------

const usdArg = (name: string, raw: string): number => {
  if (!/^\d+(\.\d+)?$/.test(raw)) refuse(`${name} must be a non-negative decimal, got ${JSON.stringify(raw)}`);
  const v = Number(raw);
  if (!(v > 0)) refuse(`${name} must be above 0`);
  return v;
};

export function parseCli(argv: string[]): Opts {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: {
        manifest: { type: "string" }, clone: { type: "string" }, ids: { type: "string" },
        execute: { type: "boolean", default: false }, "out-dir": { type: "string", default: "runs/tracehound" },
        "max-usd-per-case": { type: "string", default: "0.25" }, "max-usd-run": { type: "string", default: "2" },
        cache: { type: "string", default: "off" }, fixes: { type: "string", default: ACTION_DEFAULTS.fixes },
        contracts: { type: "string", default: ACTION_DEFAULTS.contracts }, rerun: { type: "boolean", default: false },
        post: { type: "boolean", default: false }, repo: { type: "string" }, "pr-map": { type: "string" },
        "gh-bin": { type: "string", default: "gh" }, "git-bin": { type: "string", default: "git" },
        "provider-config": { type: "string" },
      },
    }));
  } catch (e) {
    refuse((e as Error).message);
  }
  if (!values.manifest) refuse("--manifest is required");
  if (!values.clone) refuse("--clone is required");
  if (values.cache !== "off" && values.cache !== "read") refuse("--cache must be off or read");
  if (values.fixes !== "on" && values.fixes !== "off") refuse("--fixes must be on or off");
  if (values.contracts !== "on" && values.contracts !== "off") refuse("--contracts must be on or off");
  const maxUsdPerCase = usdArg("--max-usd-per-case", values["max-usd-per-case"]);
  if (maxUsdPerCase < MIN_CASE_USD) refuse(`--max-usd-per-case must be at least $${MIN_CASE_USD} (one full-size call per reviewer)`);
  const maxUsdRun = usdArg("--max-usd-run", values["max-usd-run"]);
  if (maxUsdPerCase > maxUsdRun) refuse("--max-usd-per-case is above --max-usd-run: no case could start");
  let fork: string | null = null;
  if (values.post) {
    if (!values.execute) refuse("--post needs --execute (a dry run never calls gh)");
    // the owner first: nothing else about posting is read before it is known to be SunnyBagal
    if (!values.repo) refuse("--post needs --repo SunnyBagal/<fork>");
    if (!FORK_RE.test(values.repo)) refuse(`--repo must match ^SunnyBagal/[A-Za-z0-9._-]+$ exactly, got ${JSON.stringify(values.repo)}`);
    const name = values.repo.slice(OWNER.length + 1);
    if (name === "." || name === ".." || name.toLowerCase().endsWith(".git")) refuse(`bad fork name ${JSON.stringify(name)}`);
    if (!values["pr-map"]) refuse("--post needs --pr-map (JSON {id: number} or the open-prs resume .jsonl)");
    fork = values.repo;
  } else if (values.repo !== undefined || values["pr-map"] !== undefined) {
    if (values.repo !== undefined && !FORK_RE.test(values.repo)) refuse(`--repo must match ^SunnyBagal/[A-Za-z0-9._-]+$ exactly, got ${JSON.stringify(values.repo)}`);
    fork = values.repo ?? null; // used for the PR number in the plan and the output only
  }
  const ids = values.ids === undefined ? null : values.ids.split(",").map((s) => s.trim()).filter(Boolean);
  let providerConfig: string | null = null;
  let provider: AnthropicRowConfig | null = null;
  if (values["provider-config"] !== undefined) {
    providerConfig = path.resolve(values["provider-config"]);
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(providerConfig, "utf8")); } catch { refuse("--provider-config is not a readable JSON file"); }
    provider = parseAnthropicRowConfig(raw);
    if (!provider) refuse("--provider-config must be {provider: anthropic, scope: report-only-dev, model, effort?, thinking?} with a ruled model");
    // decision 076g item 4: report-only rows on dev only; never posted, no fix or contract model
    if (values.post) refuse("--provider-config rows are report-only: --post is refused");
    if (values.fixes !== "off" || values.contracts !== "off") refuse("--provider-config needs --fixes off --contracts off");
    const manifest = path.resolve(values.manifest);
    const paths = [manifest, path.resolve(values.clone), path.resolve(ROOT, values["out-dir"]), providerConfig];
    if (paths.some((x) => /held-?out/i.test(x))) refuse("--provider-config rows are dev only: a held-out path was given");
    if (!manifest.includes(`${path.sep}cases${path.sep}dev${path.sep}`)) refuse("--provider-config rows are dev only: the manifest must be under cases/dev/");
  }
  return {
    manifest: path.resolve(values.manifest), clone: path.resolve(values.clone), ids, execute: values.execute,
    outDir: path.resolve(ROOT, values["out-dir"]), maxUsdPerCase, maxUsdRun, cache: values.cache, fixes: values.fixes,
    contracts: values.contracts, rerun: values.rerun, post: values.post, fork,
    prMap: values["pr-map"] ? path.resolve(values["pr-map"]) : null, ghBin: values["gh-bin"], gitBin: values["git-bin"],
    providerConfig, provider,
  };
}

export function loadCases(file: string, ids: string[] | null): { repo: string; cases: Case[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    refuse(`cannot read manifest ${file} as JSON`);
  }
  if (!Array.isArray(raw) || raw.length === 0) refuse("manifest must be a non-empty JSON list");
  const all: Case[] = [];
  const seen = new Set<string>();
  for (const x of raw as Record<string, unknown>[]) {
    const id = x?.id;
    if (typeof id !== "string" || !ID_RE.test(id)) refuse(`bad case id ${JSON.stringify(id)} (must match ^(case|ho)-\\d{3}$)`);
    if (seen.has(id)) refuse(`duplicate case id ${id}`);
    seen.add(id);
    for (const k of ["repo", "title", "description", "base_sha", "case_head_sha"]) {
      if (typeof x[k] !== "string") refuse(`${id}: field ${k} missing or not a string`);
    }
    if (!(x.title as string).trim()) refuse(`${id}: empty title`);
    if (!SHA_RE.test(x.base_sha as string) || !SHA_RE.test(x.case_head_sha as string)) refuse(`${id}: shas must be 40 hex`);
    if (x.head_sha !== undefined && (typeof x.head_sha !== "string" || !SHA_RE.test(x.head_sha))) refuse(`${id}: head_sha must be 40 hex`);
    if (x.pr !== undefined && !(Number.isSafeInteger(x.pr) && (x.pr as number) > 0)) refuse(`${id}: pr must be a positive integer`);
    all.push({ id, repo: x.repo as string, title: x.title as string, description: x.description as string,
      base_sha: x.base_sha as string, case_head_sha: x.case_head_sha as string,
      ...(x.head_sha !== undefined && { head_sha: x.head_sha as string }), ...(x.pr !== undefined && { pr: x.pr as number }) });
  }
  let cases = all;
  if (ids !== null) {
    if (ids.length === 0) refuse("--ids is empty");
    for (const id of ids) {
      if (!ID_RE.test(id)) refuse(`bad id in --ids: ${JSON.stringify(id)}`);
      if (!seen.has(id)) refuse(`--ids names ${id}, which is not in the manifest`);
    }
    if (new Set(ids).size !== ids.length) refuse("--ids has duplicates");
    const want = new Set(ids);
    cases = all.filter((c) => want.has(c.id));
  }
  const repos = [...new Set(cases.map((c) => c.repo))];
  if (repos.length !== 1) refuse(`every case in a run must have the same repo (one clone), got ${JSON.stringify(repos)}`);
  const repo = repos[0]!;
  if (!Object.hasOwn(UPSTREAM, repo)) refuse(`no known upstream for repo ${JSON.stringify(repo)}`);
  return { repo, cases };
}

/** {"case-001": 12, …} or open-prs' resume file (.jsonl, `pr-created` records of this fork). */
export function loadPrMap(file: string, fork: string | null): Map<string, number> {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    refuse(`cannot read --pr-map ${file}`);
  }
  const out = new Map<string, number>();
  const put = (id: unknown, n: unknown) => {
    if (typeof id !== "string" || !ID_RE.test(id)) refuse(`--pr-map: bad case id ${JSON.stringify(id)}`);
    if (!Number.isSafeInteger(n) || (n as number) < 1) refuse(`--pr-map: ${id}: PR number must be a positive integer`);
    if (out.has(id) && out.get(id) !== n) refuse(`--pr-map: ${id} has two PR numbers`);
    out.set(id, n as number);
  };
  if (file.endsWith(".jsonl")) {
    for (const [i, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      let r: { fork?: unknown; id?: unknown; step?: unknown; number?: unknown };
      try {
        r = JSON.parse(line);
      } catch {
        refuse(`--pr-map: line ${i + 1} is not JSON`);
      }
      if (r.fork !== fork) refuse(`--pr-map: line ${i + 1} is for ${JSON.stringify(r.fork)}, not ${fork}`);
      if (r.step === "pr-created") put(r.id, r.number);
    }
  } else {
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      refuse("--pr-map is not JSON");
    }
    if (!j || typeof j !== "object" || Array.isArray(j)) refuse("--pr-map must be an object {case id: PR number}");
    for (const [id, n] of Object.entries(j as Record<string, unknown>)) put(id, n);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Local git: read-only, no lazy fetch (the clones are blob:none partial clones; a missing blob is reported, never fetched)
// ---------------------------------------------------------------------------------------------------------------------

export const GIT_READS = ["rev-parse", "diff", "ls-tree", "cat-file"] as const;

/** Runtime, home, temp, locale and certificate variables: what any gh or git child needs. */
export const BASE_ENV_ALLOW = ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"] as const;
/** gh's own auth/config lookup (cli.github.com/manual/gh_help_environment): a token if one is set, else its config dir. */
export const GH_ENV_ALLOW = ["GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR", "XDG_CONFIG_HOME"] as const;

/** An explicit allowlist: nothing else from the parent env (model keys, other services' secrets) reaches the child. */
export function allowEnv(env: NodeJS.ProcessEnv, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of names) if (env[k] !== undefined) out[k] = env[k]!;
  return out;
}

function gitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...allowEnv(env, BASE_ENV_ALLOW), GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" };
}

function makeGit(gitBin: string, clone: string, env: NodeJS.ProcessEnv) {
  const childEnv = gitEnv(env);
  return (args: string[], input?: string): Proc => {
    if (!(GIT_READS as readonly string[]).includes(args[0]!)) throw new Error(`internal: git ${args[0]} is not a read`);
    const r = spawnSync(gitBin, ["-C", clone, ...args], { env: childEnv, input: input ?? "", encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 300_000 });
    if (r.error) return { status: null, stdout: "", stderr: "spawn failed" };
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}
type Git = ReturnType<typeof makeGit>;

const DIFF_ARGS = (base: string, head: string) => ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--find-renames",
  "--src-prefix=a/", "--dst-prefix=b/", base, head];

/** Missing blobs (not fetched) in the trees of the given commits. */
function missingBlobs(git: Git, sha: string): number {
  const t = git(["ls-tree", "-r", "-z", sha]);
  if (t.status !== 0) refuse(`git ls-tree ${sha} failed`);
  const oids = t.stdout.split("\0").filter(Boolean).map((e) => e.split("\t", 1)[0]!.split(" ")).filter((p) => p[1] === "blob").map((p) => p[2]!);
  if (!oids.length) return 0;
  const c = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], oids.join("\n") + "\n");
  return c.stdout.split("\n").filter((l) => / missing$/.test(l)).length;
}

export type CasePlan = {
  c: Case; prNumber: number | null; diff: string | null; diffFiles: number; diffChars: number;
  missing: { base: number; head: number }; treeEqual: boolean | null; outFile: string;
};

function planCase(git: Git, c: Case, o: Opts, prMap: Map<string, number> | null): CasePlan {
  const sha = (ref: string): string => {
    const r = git(["rev-parse", "--verify", "--quiet", ref]);
    if (r.status !== 0) refuse(`${c.id}: ${ref} not found in the clone`);
    return r.stdout.trim();
  };
  // the refs open-prs.ts pushes, so the PR on the fork shows exactly this base and head
  if (sha(`refs/heads/cases/${c.id}^{commit}`) !== c.case_head_sha) refuse(`${c.id}: local cases/${c.id} is not case_head_sha`);
  if (sha(`refs/heads/cases/${c.id}-base^{commit}`) !== c.base_sha) refuse(`${c.id}: local cases/${c.id}-base is not base_sha`);
  if (sha(`${c.case_head_sha}^1`) !== c.base_sha) refuse(`${c.id}: parent of case_head_sha is not base_sha`);
  let treeEqual: boolean | null = null;
  if (c.head_sha) {
    const up = git(["rev-parse", "--verify", "--quiet", `${c.head_sha}^{tree}`]);
    if (up.status === 0) {
      treeEqual = up.stdout.trim() === sha(`${c.case_head_sha}^{tree}`);
      if (!treeEqual) refuse(`${c.id}: case_head_sha's tree differs from upstream head_sha's tree`);
    }
  }
  const missing = { base: missingBlobs(git, c.base_sha), head: missingBlobs(git, c.case_head_sha) };
  let diff: string | null = null;
  let diffFiles = 0;
  // the diff's own blobs can be present when other blobs are not; a failure here (no lazy fetch) leaves it null
  const d = git(DIFF_ARGS(c.base_sha, c.case_head_sha));
  if (d.status === 0) {
    diff = d.stdout;
    diffFiles = (diff.match(/^diff --git /gm) ?? []).length;
    if (!diff.trim()) refuse(`${c.id}: empty diff`);
  } else if (!missing.base && !missing.head) {
    refuse(`${c.id}: git diff failed`);
  }
  const outFile = outPath(o.outDir, c.id, o.rerun);
  return { c, prNumber: prMap?.get(c.id) ?? null, diff, diffFiles, diffChars: diff?.length ?? 0, missing, treeEqual, outFile };
}

/** <id>.json; with --rerun the first free <id>.rN.json (N ≥ 2). Without --rerun an existing file refuses. */
export function outPath(dir: string, id: string, rerun: boolean): string {
  const first = path.join(dir, `${id}.json`);
  if (!fs.existsSync(first)) return first;
  if (!rerun) refuse(`${first} exists; never overwritten (pass --rerun to write ${id}.r2.json)`);
  for (let n = 2; ; n++) {
    const f = path.join(dir, `${id}.r${n}.json`);
    if (!fs.existsSync(f)) return f;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-stage child env (caps, cache) and the case run
// ---------------------------------------------------------------------------------------------------------------------

export type CaseCaps = { allowanceUSD: number; totalUSD: number; reviewerRunUSD: number; stageRunUSD: number };

/**
 * Below this a case is not started: one full-size reviewer call reserves about $0.034 on Super-VL (estimate:
 * 60,000 diff chars ~ 15,000 + prompt ~ 17,000 input tokens x $0.30/M + max_tokens 32,000 x $0.90/M, config/prices.json),
 * and each of the two parallel reviewers gets half the allowance.
 */
export const MIN_CASE_USD = 0.07;

/**
 * The effective allowance is what the case may spend: max(0, min(per-case cap, global total cap - ledger before the
 * case)). The two reviewers run in parallel as separate processes whose Budgets cannot see each other, so each gets half
 * of it as its run cap; every stage's total cap is ledger before + allowance, so later stages see what earlier ones spent.
 */
export function caseCaps(globalTotal: number, ledgerBefore: number, perCase: number): CaseCaps {
  const allowanceUSD = Math.max(0, Math.min(perCase, globalTotal - ledgerBefore));
  return { allowanceUSD, totalUSD: ledgerBefore + allowanceUSD, reviewerRunUSD: allowanceUSD / 2, stageRunUSD: allowanceUSD };
}

/** The env one analyzer subprocess of runPipeline gets: the case caps, cache reads, and no lazy git fetch. */
export function stageEnv(env: NodeJS.ProcessEnv, command: string, caps: CaseCaps, cache: "off" | "read",
  provider = false): NodeJS.ProcessEnv {
  const parallel = command === "review" || command === "review-ctx";
  const run = String(parallel ? caps.reviewerRunUSD : caps.stageRunUSD);
  // a Claude row: the case caps apply to the Anthropic ledger, and the Nebius run cap is 0 (no Nebius call can pass)
  const budget = provider
    ? { [ANTHROPIC_CAP_NAMES.total]: String(caps.totalUSD), [ANTHROPIC_CAP_NAMES.run]: run, TRACEHOUND_BUDGET_RUN_USD: "0" }
    : { TRACEHOUND_BUDGET_TOTAL_USD: String(caps.totalUSD), TRACEHOUND_BUDGET_RUN_USD: run };
  return {
    ...env,
    ...budget,
    TRACEHOUND_CACHE_READ: cache === "off" ? "off" : "on",
    GIT_NO_LAZY_FETCH: "1",
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function tracehoundHead(env: NodeJS.ProcessEnv): { sha: string | null; dirty: boolean | null } {
  const run = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { env: gitEnv(env), encoding: "utf8" });
  const h = run(["rev-parse", "HEAD"]);
  const s = run(["status", "--porcelain", "--untracked-files=no"]);
  return { sha: h.status === 0 ? h.stdout.trim() : null, dirty: s.status === 0 ? s.stdout.trim() !== "" : null };
}

/** The analyzer stages a provider row may run (runPipeline's pool-verify-v1 path). */
export const PROVIDER_STAGES: readonly string[] = ["review", "review-ctx", "verify-ctx"];

/** The ledger the run's caps and usage read: the Anthropic row ledger for a provider row, else the Nebius one. */
export function runLedgerFile(o: Pick<Opts, "provider">, deps: Pick<RunnerDeps, "ledgerFile" | "anthropicLedgerFile">): string {
  if (!o.provider) return deps.ledgerFile;
  return deps.anthropicLedgerFile ?? path.join(path.dirname(deps.ledgerFile), "spend.anthropic.jsonl");
}

/** What a Claude row records beside the model: every setting that differs from Nemotron's, with its reason. */
export function providerSettings(p: AnthropicRowConfig): Record<string, string> {
  return {
    provider: "anthropic", scope: p.scope, model: p.model, ledger: "spend.anthropic.jsonl",
    sampling: "default: temperature is not sent (Nemotron runs at 0; a non-default value is a 400 on both models)",
    thinking: p.thinking === "off"
      ? `off (stages run with --reasoning off; sent as ${p.model === "claude-haiku-5-5" ? "disabled" : "between_tools"})`
      : "adaptive (stages run with --reasoning on, as for Nemotron)",
    effort: p.effort ?? `provider default (${p.model === "claude-haiku-5-5" ? "medium" : "high"})`,
  };
}

type CaseResult = { status: "ok" | "failed" | "cap"; file: string; bodyOnly: string | null; posted: number };

async function runCase(p: CasePlan, o: Opts, repo: string, deps: RunnerDeps, fork: string | null, caps: CaseCaps,
  th: ReturnType<typeof tracehoundHead>): Promise<CaseResult> {
  const c = p.c;
  const startedAt = new Date().toISOString();
  const ledgerFile = runLedgerFile(o, deps);
  const mark = await ledgerMark(ledgerFile);
  const recorder = new UsageRecorder();
  const logs: string[] = [];
  const log = recorder.logger((m) => { logs.push(m); deps.log(`${c.id}: ${m}`); });
  let capHit = false;
  let pipelineFailed = false;
  const lineage: Record<string, unknown> = { v: 1 };
  const onLineage = (part: LineagePart) => {
    const { stage, ...rest } = part;
    lineage[stage] = "output" in rest ? rest.output : rest;
  };
  const stageExec: Execute = async (file, args, options) => {
    const command = args[1] ?? "";
    // a Claude row: only the three pool-verify-v1 stages run, each told to build the Anthropic client
    if (o.provider && !PROVIDER_STAGES.includes(command)) throw new Error("stage not allowed for a provider row");
    // thinking off reaches the request only as --reasoning off (the CLIs default to on, which would override the row)
    const stageArgs = o.provider
      ? [...args, "--provider-config", o.providerConfig!, ...(o.provider.thinking === "off" ? ["--reasoning", "off"] : [])] : args;
    try {
      return await deps.exec(file, stageArgs, { ...options, env: stageEnv(options.env, command, caps, o.cache, o.provider !== null) });
    } catch (e) {
      // never echoed: a child's stderr can carry request details
      if (BUDGET_RE.test(String((e as { stderr?: unknown })?.stderr ?? ""))) capHit = true;
      throw e;
    }
  };
  const fixCaps: BudgetCaps = { totalUSD: caps.totalUSD, runUSD: caps.stageRunUSD };
  const fullName = fork ?? `${OWNER}/${repo}`;
  const number = p.prNumber ?? c.pr ?? 0;
  const event: PullEvent = { repository: { full_name: fullName }, pull_request: {
    title: c.title, body: c.description, number, base: { sha: c.base_sha },
    head: { sha: c.case_head_sha, repo: { full_name: fullName } } } };
  const options: Options = {
    token: "", apiUrl: "https://api.github.invalid", model: ACTION_DEFAULTS.model, maxComments: ACTION_DEFAULTS.maxComments,
    dryRun: true, reviewer: ACTION_DEFAULTS.reviewer, repoDir: o.clone, fixes: o.fixes, learn: ACTION_DEFAULTS.learn,
    contracts: o.contracts, serverUrl: "https://github.com",
  };
  const actionDeps: Dependencies = {
    fetch: (() => { throw new Error("the local runner makes no GitHub call"); }) as unknown as typeof fetch,
    runReviewer: async () => { throw new Error("pool-verify-v1 only"); },
    checkRepoHead: deps.checkRepoHead,
    runPipeline: async (input, model, repoDir, head) => {
      const r = await deps.runPipeline(input, o.provider?.model ?? model, repoDir, head, log, stageExec, { onUsage: recorder.add, onLineage });
      if (!r) pipelineFailed = true;
      return r;
    },
    runFixes: (findings, diff, repoDir, head) => {
      const inner = recordingClient(deps.createFixClient(fixCaps), recorder, "fixes");
      const client: FixClient = { chat: async (...a) => {
        try { return await inner.chat(...a); } catch (e) { if (e instanceof BudgetExceededError) capHit = true; throw e; }
      } };
      return deps.runFixes(findings, diff, repoDir, head, client);
    },
    runContracts: async (repoDir, base, head) => {
      const r = await deps.runContracts(repoDir, base, head, { ...deps.env, GIT_NO_LAZY_FETCH: "1" });
      lineage.contracts = r;
      return r;
    },
    log,
  };
  let prepared: Awaited<ReturnType<typeof prepareReview>> = null;
  let crashed = false;
  try {
    await deps.checkRepoHead(o.clone, c.case_head_sha);
    prepared = await prepareReview(event, p.diff!, c.base_sha, options, actionDeps);
  } catch {
    crashed = true; // exception text is never echoed (cli.ts rule)
    log("TraceHound: local run failed before a review was prepared.");
  }
  const ledgerDelta: StageUsage | null = await ledgerSince(ledgerFile, mark);
  const status: CaseResult["status"] = capHit ? "cap" : crashed || pipelineFailed ? "failed" : "ok";
  const findings = prepared?.findings ?? [];
  const posted = findings.slice(0, ACTION_DEFAULTS.maxComments);
  const bodyOnly = prepared ? `${MARKER(c.id)}\nTraceHound local run (scripts/run-tracehound.ts) of ${c.id}: base ${c.base_sha.slice(0, 7)}, head ${c.case_head_sha.slice(0, 7)}. Same pipeline as the Action; not posted by the Action.\n\n${prepared.bodyOnly().body}` : null;
  const record = {
    v: 1, case: c.id, repo, fork_repo: fullName, fork_pr: p.prNumber, upstream_pr: c.pr ?? null,
    base: c.base_sha, head: c.case_head_sha, upstream_head: c.head_sha ?? null, tree_equal_upstream: p.treeEqual,
    status, outcome: recorder.outcome || null,
    reviewer: ACTION_DEFAULTS.reviewer,
    prompts: { "review-diff-v1": REVIEW_PROMPT_SHA256, "review-ctx-v1": REVIEW_CTX_PROMPT_SHA256,
      "verify-ctx-v1": VERIFY_CTX_PROMPT_SHA256, fix: sha256(FIX_SYSTEM_PROMPT) },
    versions: { analyzer: ANALYZER_VERSION, action: actionVersion(), runner: 2 },
    tracehound: th,
    settings: { model: o.provider?.model ?? ACTION_DEFAULTS.model, fixModel: FIX_MODEL, maxComments: ACTION_DEFAULTS.maxComments,
      fixes: o.fixes, contracts: o.contracts, learn: ACTION_DEFAULTS.learn, cache: o.cache,
      maxUsdPerCase: o.maxUsdPerCase, maxUsdRun: o.maxUsdRun, caps,
      ...(o.provider && { provider: providerSettings(o.provider) }) },
    diff: { files: p.diffFiles, chars: p.diffChars, sha256: sha256(p.diff!) },
    // neutral review format (decision 054): what the Action would post, in order
    pr_title: c.title, ...(p.prNumber !== null && { pr_number: p.prNumber }),
    comments: posted.map((f) => ({ path: f.path, line: f.line, body: f.body })),
    all_findings: findings.map((f, i) => ({ path: f.path, line: f.line, body: f.body, source: prepared!.sources[i] ?? null })),
    review: prepared ? {
      model: prepared.model, findings: findings.length, posted: posted.length, omitted: findings.length - posted.length,
      pool: prepared.pipeline?.pool ?? null, kept: prepared.pipeline?.kept ?? null,
      chunksOk: prepared.stages?.chunksOk ?? null, chunksFailed: prepared.stages?.chunksFailed ?? null,
      fixes: prepared.data?.fixes.counts ?? null,
      suggestions: prepared.data?.fixes.suggestions ?? null,
      contracts: { status: prepared.contracts.status, findings: prepared.contracts.findings,
        // the contract units the review emits (inline, then body; `more` only as a count): scored with the comments
        emitted: o.contracts === "on" && prepared.contracts.status !== "off" ? selectContracts(prepared.contracts.findings, p.diff!) : null },
    } : null,
    usage: { stages: Object.fromEntries(recorder.stages), unreadable: recorder.unreadable, ledger: ledgerDelta },
    lineage,
    log: logs,
    started_at: startedAt, finished_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(p.outFile), { recursive: true });
  fs.writeFileSync(p.outFile, JSON.stringify(record, null, 1) + "\n", { flag: "wx" }); // wx: never overwrite
  deps.log(`${c.id}: ${status}, ${findings.length} findings (${posted.length} would be posted), ledger +$${(ledgerDelta?.costUSD ?? NaN).toFixed(4)} -> ${p.outFile}`);
  return { status, file: p.outFile, bodyOnly, posted: posted.length };
}

function actionVersion(): string | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(ROOT, "packages/action/package.json"), "utf8")) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// --post: gh, one central wrapper; exact argv shapes only; every call scoped to the SunnyBagal fork
// ---------------------------------------------------------------------------------------------------------------------

export const PR_VIEW_FIELDS = "number,url,state,headRefName,baseRefName,baseRefOid,headRefOid,isCrossRepository";

/** Throws unless argv is one of the allowed gh calls for this fork. `write` is true exactly for `pr comment`. */
export function assertGh(argv: string[], fork: string, write: boolean): void {
  const bad = (why: string): never => {
    throw new Error(`refusing gh call (${why}): ${JSON.stringify(argv)}`);
  };
  if (!FORK_RE.test(fork)) bad("fork is not SunnyBagal/<name>");
  const num = (s: string | undefined) => !!s && /^[1-9]\d{0,9}$/.test(s);
  if (argv[0] === "api") {
    if (write) bad("gh api is read-only here");
    if (argv.length !== 4 || argv[1] !== "--method" || argv[2] !== "GET") bad("gh api must be exactly api --method GET <path>");
    const p = argv[3]!;
    const m = new RegExp(`^repos/${fork.replace(/\./g, "\\.")}/issues/(\\d+)/comments\\?per_page=100&page=(\\d+)$`).exec(p);
    if (p !== `repos/${fork}` && !(m && num(m[1]) && num(m[2]))) bad("api path is not the fork or one PR's comments");
    return;
  }
  if (argv[0] !== "pr") bad("only gh api and gh pr are allowed");
  if (argv[1] === "view") {
    if (write) bad("pr view is read-only");
    const want = ["pr", "view", argv[2]!, "--repo", fork, "--json", PR_VIEW_FIELDS];
    if (!num(argv[2]) || JSON.stringify(argv) !== JSON.stringify(want)) bad("pr view shape");
    return;
  }
  if (argv[1] === "comment") {
    if (!write) bad("pr comment is a write call");
    const want = ["pr", "comment", argv[2]!, "--repo", fork, "--body-file", "-"];
    if (!num(argv[2]) || JSON.stringify(argv) !== JSON.stringify(want)) bad("pr comment shape");
    return;
  }
  bad("only pr view and pr comment are allowed");
}

function ghEnv(env: NodeJS.ProcessEnv, fork: string): Record<string, string> {
  return { ...allowEnv(env, [...BASE_ENV_ALLOW, ...GH_ENV_ALLOW]), GH_REPO: fork, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", LC_ALL: "C" };
}

export function makeGh(o: { fork: string; ghBin: string; env: NodeJS.ProcessEnv; log: (l: string) => void }) {
  const env = ghEnv(o.env, o.fork);
  const cwd = os.tmpdir(); // not a git repo, so gh cannot pick up a local remote
  function spawnGh(argv: string[], write: boolean, input?: string): Proc {
    assertGh(argv, o.fork, write);
    o.log(`${write ? "$" : "[read]"} gh ${argv.join(" ")}`);
    const r = spawnSync(o.ghBin, argv, { cwd, env, input: input ?? "", encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    if (r.error) return { status: null, stdout: "", stderr: "spawn failed" };
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }
  return {
    repo: () => spawnGh(["api", "--method", "GET", `repos/${o.fork}`], false),
    prView: (n: number) => spawnGh(["pr", "view", String(n), "--repo", o.fork, "--json", PR_VIEW_FIELDS], false),
    comments: (n: number, page: number) => spawnGh(["api", "--method", "GET", `repos/${o.fork}/issues/${n}/comments?per_page=100&page=${page}`], false),
    comment: (n: number, body: string) => spawnGh(["pr", "comment", String(n), "--repo", o.fork, "--body-file", "-"], true, body),
  };
}
type Gh = ReturnType<typeof makeGh>;

const json = (r: Proc, what: string): unknown => {
  if (r.status !== 0) refuse(`${what} failed (status ${r.status})`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    refuse(`${what} did not return JSON`);
  }
};

export function checkFork(gh: Gh, fork: string, repo: string): void {
  const j = json(gh.repo(), `gh api repos/${fork}`) as { full_name?: unknown; fork?: unknown; owner?: { login?: unknown }; parent?: { full_name?: unknown } };
  if (j.full_name !== fork) refuse(`fork check: full_name is ${JSON.stringify(j.full_name)}, expected ${fork}`);
  if (j.fork !== true) refuse(`fork check: ${fork} is not a fork`);
  if (j.owner?.login !== OWNER) refuse(`fork check: owner.login is ${JSON.stringify(j.owner?.login)}`);
  if (j.parent?.full_name !== UPSTREAM[repo]) refuse(`fork check: parent is ${JSON.stringify(j.parent?.full_name)}, expected ${UPSTREAM[repo]}`);
}

/** The PR must be cases/<id>-base <- cases/<id> in the fork itself, with head at case_head_sha. */
export function checkPr(gh: Gh, fork: string, c: Case, n: number): void {
  const j = json(gh.prView(n), `gh pr view ${n}`) as Record<string, unknown>;
  if (j.number !== n) refuse(`${c.id}: PR #${n} answered as #${JSON.stringify(j.number)}`);
  if (j.url !== `https://github.com/${fork}/pull/${n}`) refuse(`${c.id}: PR #${n} is not in ${fork}`);
  if (j.headRefName !== `cases/${c.id}` || j.baseRefName !== `cases/${c.id}-base`) {
    refuse(`${c.id}: PR #${n} is ${JSON.stringify(j.baseRefName)} <- ${JSON.stringify(j.headRefName)}, expected cases/${c.id}-base <- cases/${c.id}`);
  }
  if (j.isCrossRepository !== false) refuse(`${c.id}: PR #${n} is cross-repository`);
  if (j.headRefOid !== c.case_head_sha) refuse(`${c.id}: PR #${n} head is not case_head_sha`);
  // the base branch's tip: with the head this binds the PR's diff to the reviewed base..head
  if (j.baseRefOid !== c.base_sha) refuse(`${c.id}: PR #${n} base is not base_sha`);
}

export function hasMarker(gh: Gh, n: number, id: string): boolean {
  for (let page = 1; page <= 50; page++) {
    const list = json(gh.comments(n, page), `gh api comments of #${n}`);
    if (!Array.isArray(list)) refuse(`comments of #${n} are not a list`);
    if (list.some((x) => typeof (x as { body?: unknown })?.body === "string" && (x as { body: string }).body.includes(MARKER(id)))) return true;
    if (list.length < 100) return false;
  }
  refuse(`#${n} has more than 5,000 comments`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------------

export async function main(argv: string[], deps: RunnerDeps = defaultDeps()): Promise<number> {
  const log = deps.log;
  try {
    const o = parseCli(argv);
    const { repo, cases } = loadCases(o.manifest, o.ids);
    if (!fs.statSync(o.clone, { throwIfNoEntry: false })?.isDirectory()) refuse(`--clone ${o.clone} is not a directory`);
    const prMap = o.prMap ? loadPrMap(o.prMap, o.fork) : null;
    if (o.post) for (const c of cases) if (!prMap!.has(c.id)) refuse(`--pr-map has no PR for ${c.id}`);
    const git = makeGit(o.gitBin, o.clone, deps.env);
    const plans = cases.map((c) => planCase(git, c, o, prMap));
    log(`${o.execute ? "EXECUTE" : "DRY RUN (no model call, no gh call; add --execute to run)"}: ${cases.length} ${repo} case(s), clone ${o.clone}`);
    if (o.provider) log(`provider row: anthropic ${o.provider.model} (report-only dev; ${Object.entries(providerSettings(o.provider)).filter(([k]) => ["sampling", "thinking", "effort"].includes(k)).map(([k, v]) => `${k} ${v}`).join("; ")}); caps and usage from spend.anthropic.jsonl and ${ANTHROPIC_CAP_NAMES.total}`);
    log(`reviewer ${ACTION_DEFAULTS.reviewer} · model ${o.provider?.model ?? ACTION_DEFAULTS.model} · fix model ${FIX_MODEL} · fixes ${o.fixes} · contracts ${o.contracts} · learn off · max-comments ${ACTION_DEFAULTS.maxComments} · cache ${o.cache === "off" ? "off (reads off, writes on)" : "read"}`);
    log(`caps: per case $${o.maxUsdPerCase} (each reviewer $${o.maxUsdPerCase / 2}, they run in parallel), per run $${o.maxUsdRun} (at most ${Math.floor(o.maxUsdRun / o.maxUsdPerCase + 1e-9)} case(s) at the full per-case cap)`);
    log(`allowance min(per-case cap, global total cap − ledger) is computed per case on --execute; minimum $${MIN_CASE_USD}; the reviewers split it`);
    log(`output ${o.outDir}${o.post ? ` · post to ${o.fork}` : " · no posting"}`);
    for (const p of plans) {
      const chunks = Math.max(1, Math.ceil(p.diffChars / 60_000));
      log(`${p.c.id}: ${repo} base ${p.c.base_sha} head ${p.c.case_head_sha}${p.treeEqual === null ? " (upstream head not checked)" : " (tree = upstream head)"}` +
        ` · ${p.diff === null ? "diff not computed" : `diff ${p.diffFiles} files, ${p.diffChars} chars (~${chunks} reviewer chunk(s))`}` +
        ` · missing blobs base ${p.missing.base} / head ${p.missing.head}${p.prNumber !== null ? ` · fork PR #${p.prNumber}` : ""} -> ${p.outFile}`);
    }
    const missing = plans.filter((p) => p.missing.base || p.missing.head);
    if (missing.length) {
      log(`${missing.length} case(s) need blobs that are not in the clone; --execute refuses them (the review reads files at head and base, and git never fetches here).`);
      log(`  to fill them (a read-only fetch from the clone's origin; run by a human): git -C ${o.clone} worktree add --detach <scratch dir> <sha>, for each base and head sha, then git worktree remove <scratch dir>`);
    }
    if (!o.execute) {
      log(`dry run done: ${plans.length} case(s) planned; nothing run, nothing written.`);
      return 0;
    }
    if (missing.length) refuse(`blobs missing in the clone for ${missing.map((p) => p.c.id).join(", ")}`);
    // the key from env or the workspace .env (same loader as packages/analyzer/src/bin.ts); never printed
    // loadEnvFile never overrides a variable already set; the analyzer subprocesses get process.env from runPipeline
    const keyName = o.provider ? "ANTHROPIC_API_KEY" : "NEBIUS_API_KEY";
    if (!deps.env[keyName] && deps.env === process.env && fs.existsSync(deps.envFile)) process.loadEnvFile(deps.envFile);
    if (!deps.env[keyName]?.trim()) refuse(`${keyName} is missing (env or .env)`);
    // a fresh worktree has an empty ledger, which would hide all earlier spend from the total cap
    if (!fs.existsSync(deps.ledgerFile) || fs.statSync(deps.ledgerFile).size === 0) refuse(`spend ledger ${deps.ledgerFile} is missing or empty; run from the main checkout`);
    // a malformed cap refuses here, not in a child; a Claude row needs both Anthropic caps set explicitly
    let globalTotal: number;
    if (o.provider) {
      try { globalTotal = anthropicCapsFromEnv(deps.env).totalUSD; } catch { refuse(`${ANTHROPIC_CAP_NAMES.total} and ${ANTHROPIC_CAP_NAMES.run} must be set to non-negative USD amounts`); }
    } else globalTotal = capsFromEnv(deps.env).totalUSD;
    const ledgerFile = runLedgerFile(o, deps);
    const capName = o.provider ? ANTHROPIC_CAP_NAMES.total : "TRACEHOUND_BUDGET_TOTAL_USD";
    let gh: Gh | null = null;
    if (o.post) {
      gh = makeGh({ fork: o.fork!, ghBin: o.ghBin, env: deps.env, log });
      checkFork(gh, o.fork!, repo);
      for (const p of plans) checkPr(gh, o.fork!, p.c, p.prNumber!);
      log(`post checks passed: ${o.fork} is a fork of ${UPSTREAM[repo]}; ${plans.length} PR(s) match their case refs`);
    }
    const th = tracehoundHead(deps.env); // one HEAD per run
    const runStart = new SpendLedger(ledgerFile).totalUSD();
    let code = 0;
    for (const p of plans) {
      const spent = new SpendLedger(ledgerFile).totalUSD() - runStart;
      if (spent + o.maxUsdPerCase > o.maxUsdRun + 1e-12) {
        log(`STOPPED before ${p.c.id}: run spent $${spent.toFixed(4)} + per-case cap $${o.maxUsdPerCase} > --max-usd-run $${o.maxUsdRun}; not run: ${plans.slice(plans.indexOf(p)).map((x) => x.c.id).join(", ")}`);
        return 3;
      }
      const ledgerBefore = new SpendLedger(ledgerFile).totalUSD();
      const caps = caseCaps(globalTotal, ledgerBefore, o.maxUsdPerCase);
      if (caps.allowanceUSD < MIN_CASE_USD) {
        log(`STOPPED before ${p.c.id}: the global total cap leaves $${caps.allowanceUSD.toFixed(4)} (${capName} ${globalTotal} - ledger ${ledgerBefore.toFixed(4)}), below the $${MIN_CASE_USD} minimum; not run: ${plans.slice(plans.indexOf(p)).map((x) => x.c.id).join(", ")}`);
        return 3;
      }
      const r = await runCase(p, o, repo, deps, o.fork, caps, th);
      if (r.status !== "ok") code = 1;
      if (gh && r.status === "ok" && r.bodyOnly) postCase(gh, o, p, r.bodyOnly, log);
      else if (gh) log(`${p.c.id}: nothing to post (${r.status === "ok" ? "no findings" : r.status})`);
    }
    log(`done: ${plans.length} case(s); run ledger +$${(new SpendLedger(ledgerFile).totalUSD() - runStart).toFixed(4)}`);
    return code;
  } catch (e) {
    if (e instanceof Refusal) {
      log(`REFUSED: ${e.message}`);
      return 2;
    }
    log("FAILED: unexpected error (text not shown; it can carry request details).");
    return 1;
  }
}

function postCase(gh: Gh, o: Opts, p: CasePlan, body: string, log: (l: string) => void): void {
  const n = p.prNumber!;
  const record = p.outFile.replace(/\.json$/, ".post.json");
  if (hasMarker(gh, n, p.c.id)) {
    log(`${p.c.id}: PR #${n} already has a TraceHound runner comment for this case; not posted again`);
    return;
  }
  if (body.length > GH_COMMENT_MAX) {
    log(`${p.c.id}: comment is ${body.length} chars, over ${GH_COMMENT_MAX}; not posted`);
    return;
  }
  // the refs can move during a long review or the lookups above: the last gh read before the write binds both shas
  try {
    checkPr(gh, o.fork!, p.c, n);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    log(`${p.c.id}: not posted, PR re-check failed right before the comment: ${e.message}`);
    return;
  }
  const r = gh.comment(n, body);
  if (r.status !== 0) {
    log(`${p.c.id}: gh pr comment failed (status ${r.status}); not retried`);
    return;
  }
  const url = r.stdout.trim().split("\n").pop()?.trim() ?? null;
  fs.writeFileSync(record, JSON.stringify({ case: p.c.id, fork: o.fork, pr: n, url, at: new Date().toISOString() }) + "\n", { flag: "wx" });
  log(`${p.c.id}: commented on PR #${n}${url ? ` ${url}` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
