// Evidence verifier + deterministic gate (decision 065; plan `docs/bench/evidence-plan.md`, pushed
// before any model call). Dev only: Cal.com is never read. Subcommands, in order:
//   verify     B's model calls: verify-evidence-v1 on each dev run's pool-raw (cache reads off),
//              run 1, 2r, 4, 5, 6; resumes; sub-cap $4.0 from the records already written
//   gate       no model: A (pool-verify-v1 → gate), B and B-all (verified → gate), per pull request
//              in a temporary worktree of the bare repo at the head, --base the merge base
//   contracts  no model: C, `tracehound contracts` on run 1's pull requests
//   score      the two judges on every variant (cache reads allowed; sub-cap $1.0 from the score
//              files already written), then the counts-only report
// Outputs go to <bench>/reviews/evidence/ (outside this repo), never overwritten. stdout gets counts
// only, except the report's three example findings (the reviewer's own output, dev only).
//   node scripts/bench/evidence.ts <verify|gate|contracts|score> [--bench <dir>]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { JUDGE_VERSION, LlmJudge } from "../../packages/analyzer/src/bench/judge.ts";
import { addCounts, loadReviews, metrics, scoreRepo, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";
import { GoldenFile, PullReview, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { runContracts } from "../../packages/analyzer/src/contracts/cli.ts";
import { main as gateMain } from "../../packages/analyzer/src/gate/cli.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { BudgetExceededError } from "../../packages/analyzer/src/llm/client.ts";
import { gitSource } from "../../packages/analyzer/src/review/context.ts";
import { readInput } from "../../packages/analyzer/src/review/verify-evidence-cli.ts";
import { gateReview, verifyReviewWithEvidence, type EvidenceVerifiedReview } from "../../packages/analyzer/src/review/verify-evidence.ts";
import { dirs } from "./pool-verify.ts";
import { buildClients, JUDGES, REVIEW_MODEL, REVIEW_REASONING, TABLE_HEAD, tableRow, writeNew } from "./run-test-set.ts";
import { DEV_REPOS, inputPaths, isRequestFailure, readRunJson, standingRunDir } from "./test-set.ts";

export const VERIFIER_CAP_USD = 4.0;
export const JUDGE_CAP_USD = 1.0;
const PULLS_AT_ONCE = 3;
const VERIFY_CONCURRENCY = 4;
const JUDGE_CONCURRENCY = 4;
const PULLS_PER_RUN = 40;

// ---- runs ----

export type JudgeId = "judge-v1" | "judge-x1";
type SourceRow = "pool-verify-v1" | "pool-raw";
interface RunRef {
  label: string;
  reviews: (repo: string, row: SourceRow) => string;
  /** the run's own scoring of a source row */
  scoreFile: (judge: JudgeId, row: SourceRow, repo: string, kind: "summary" | "detail") => string;
  /** review-diff-v1 + review-ctx-v1 cost of a pull request */
  reviewerCost: (repo: string, file: string) => number;
}
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
type UsageRecord = { review: { usage: { costUSD: number } } };

function run1(bench: string): RunRef {
  return {
    label: "1",
    reviews: (repo, row) => (row === "pool-verify-v1" ? dirs(bench, repo).kept : dirs(bench, repo).raw),
    scoreFile: (judge, row, repo, kind) => join(bench, judge === "judge-v1" ? "scores" : "scores/judge-x1", `${row}-super-${repo}.${kind}.json`),
    reviewerCost: (repo, file) => readJson<UsageRecord>(join(dirs(bench, repo).diff, file)).review.usage.costUSD + readJson<UsageRecord>(join(dirs(bench, repo).ctx, file)).review.usage.costUSD,
  };
}

function repeatRun(bench: string, run: 2 | 4 | 5 | 6): RunRef {
  const { dir, restarted } = standingRunDir(bench, "dev", run);
  if (readRunJson(dir).status !== "complete") throw new Error(`dev run ${run} is not complete`);
  const pulls = readJson<{ pulls: { repo: string; file: string; attempts: number }[] }>(join(dir, "run.json")).pulls;
  return {
    label: `${run}${restarted ? "r" : ""}`,
    reviews: (repo, row) => join(dir, row, repo),
    scoreFile: (judge, row, repo, kind) => join(dir, "scores", judge, `${row}-${repo}.${kind}.json`),
    reviewerCost: (repo, file) => {
      const p = pulls.find((x) => x.repo === repo && x.file === file)!;
      const a = readJson<{ diff: UsageRecord; ctx: UsageRecord }>(join(dir, "attempts", repo, file.replace(/\.json$/, `.attempt-${p.attempts}.json`)));
      return a.diff.review.usage.costUSD + a.ctx.review.usage.costUSD;
    },
  };
}

export const allRuns = (bench: string): RunRef[] => [run1(bench), ...([2, 4, 5, 6] as const).map((n) => repeatRun(bench, n))];

const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort(byName) : []);
const outDir = (bench: string) => join(bench, "reviews/evidence");
const verdictFile = (bench: string, run: string, repo: string, file: string) => join(outDir(bench), "verdicts", `run-${run}`, repo, file);
const gateInputFile = (bench: string, run: string, repo: string, file: string) => join(outDir(bench), "gate-input", `run-${run}`, repo, file);
const variantDir = (bench: string, variant: string, run: string, repo: string) => join(outDir(bench), "variants", variant, `run-${run}`, repo);
const gateOutFile = (bench: string, variant: string, run: string, repo: string, file: string) => join(outDir(bench), "gate", variant, `run-${run}`, repo, file);
const scoreBase = (bench: string, judge: JudgeId, variant: string, run: string, repo: string) => join(outDir(bench), "scores", judge, `${variant}-run-${run}-${repo}`);

/** Pull request files of a repo: run 1's pool-verify-v1 list (the same 40 in every run). */
const pullFiles = (bench: string, repo: string) => jsonFiles(dirs(bench, repo).kept);
const heads = (bench: string, repo: string) => readJson<Record<string, { head: string; mergeBase: string }>>(inputPaths(bench, "dev", repo).heads);

/** A run counts for B when all its pull requests have verifier records. */
export function verifiedRuns(bench: string): RunRef[] {
  return allRuns(bench).filter((r) => DEV_REPOS.reduce((s, repo) => s + jsonFiles(join(outDir(bench), "verdicts", `run-${r.label}`, repo)).length, 0) === PULLS_PER_RUN);
}

// ---- pure: means, adoption, drop log ----

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export interface PerRun {
  label: string;
  v1: Counts;
  x1: Counts;
}
export function means(runs: PerRun[]) {
  const m = (j: "v1" | "x1", k: "precision" | "recall" | "f") => mean(runs.map((r) => metrics(r[j])[k] ?? 0));
  return { v1: { p: m("v1", "precision"), r: m("v1", "recall"), f: m("v1", "f") }, x1: { p: m("x1", "precision"), r: m("x1", "recall"), f: m("x1", "f") } };
}
export type Means = ReturnType<typeof means>;

const EPS = 1e-12;
export const B_F_MARGIN = 0.03;
export const B_P_MARGIN = 0.08;

/** evidence-plan.md's rules, on 5-run means (or the fallback's runs, the same for variant and baseline). */
export function adoptA(a: Means, base: Means) {
  const checks = {
    precisionV1: { value: a.v1.p, base: base.v1.p, pass: a.v1.p > base.v1.p },
    fV1: { value: a.v1.f, base: base.v1.f, pass: a.v1.f >= base.v1.f - EPS },
    fX1: { value: a.x1.f, base: base.x1.f, pass: a.x1.f >= base.x1.f - EPS },
  };
  return { checks, adopted: checks.precisionV1.pass && checks.fV1.pass && checks.fX1.pass };
}
export function adoptB(b: Means, base: Means) {
  const checks = {
    fMarginV1: { value: b.v1.f - base.v1.f, pass: b.v1.f - base.v1.f >= B_F_MARGIN - EPS },
    pMarginV1: { value: b.v1.p - base.v1.p, pass: b.v1.p - base.v1.p >= B_P_MARGIN - EPS },
    fX1: { value: b.x1.f, base: base.x1.f, pass: b.x1.f >= base.x1.f - EPS },
  };
  return { checks, adopted: checks.fMarginV1.pass && checks.pMarginV1.pass && checks.fX1.pass };
}
export function pipelineVerdict(a: boolean, b: boolean): string {
  if (a && b) return "B, with A's rules applied inside the gate";
  if (b) return "B (verify-evidence-v1 + gate --require-evidence --min-severity medium) replaces verify-ctx-v1";
  if (a) return "A: pool-verify-v1 followed by the gate with default options";
  return "LOSS: neither A nor B passes; pool-verify-v1 stays";
}

type DetailComment = { path: string; line: number | null; body: string; outcome?: string };
type Detail = { detail: { reviewFile: string; status: string; comments: DetailComment[] }[] };

/**
 * The judge's outcome for each dropped finding, matched in the source row's detail by review file,
 * path, line and body; each detail comment is used once.
 */
export function outcomesOf(detail: Detail, file: string, dropped: ReviewComment[]): (string | null)[] {
  const pull = detail.detail.find((d) => d.reviewFile === file);
  const used = new Set<number>();
  return dropped.map((f) => {
    if (!pull || pull.status !== "SCORED") return null;
    const i = pull.comments.findIndex((c, k) => !used.has(k) && c.path === f.path && c.line === f.line && c.body === f.body);
    if (i < 0) return null;
    used.add(i);
    return pull.comments[i]!.outcome ?? null;
  });
}

// ---- verify (model calls) ----

async function verify(bench: string, env: NodeJS.ProcessEnv, log: (l: string) => void): Promise<number> {
  const spent = allRuns(bench).reduce(
    (s, r) => s + DEV_REPOS.reduce((t, repo) => t + jsonFiles(join(outDir(bench), "verdicts", `run-${r.label}`, repo)).reduce((u, f) => u + readJson<VerifiedRecord>(verdictFile(bench, r.label, repo, f)).costUSD, 0), 0),
    0,
  );
  const allowanceUSD = VERIFIER_CAP_USD - spent;
  if (allowanceUSD <= 0) {
    log(`[evidence] verifier sub-cap reached ($${spent.toFixed(4)} of $${VERIFIER_CAP_USD})`);
    return 2;
  }
  const { reviewer, budget } = buildClients({ apiKey: env.NEBIUS_API_KEY!, ...statePaths, allowanceUSD, env });
  log(`[evidence] verify: earlier verifier spend $${spent.toFixed(4)}, allowance $${allowanceUSD.toFixed(4)}, ledger before $${budget.spentBeforeRun.toFixed(4)}`);
  for (const run of allRuns(bench)) {
    const todo = DEV_REPOS.flatMap((repo) => pullFiles(bench, repo).filter((f) => !existsSync(verdictFile(bench, run.label, repo, f))).map((file) => ({ repo, file })));
    if (!todo.length) continue;
    log(`[evidence] run ${run.label}: ${todo.length} pull requests to verify`);
    let next = 0;
    let stop: Error | null = null;
    const worker = async () => {
      while (!stop && next < todo.length) {
        const { repo, file } = todo[next++]!;
        try {
          const review = PullReview.parse(readJson(join(run.reviews(repo, "pool-raw"), file)));
          const input = readInput(join(inputPaths(bench, "dev", repo).prs, file));
          if (review.pr_title !== input.title) throw new Error(`${repo}/${file}: title mismatch`);
          const head = heads(bench, repo)[file.replace(/\.json$/, "")]!.head;
          const once = () => verifyReviewWithEvidence(reviewer, input, review, { source: gitSource(inputPaths(bench, "dev", repo).gitDir, head), head }, { model: REVIEW_MODEL, reasoning: REVIEW_REASONING, concurrency: VERIFY_CONCURRENCY });
          const failures = (v: EvidenceVerifiedReview) => v.comments.filter((c) => isRequestFailure(c.failure)).length;
          const first = await once();
          let v = first;
          let attempts = 1;
          if (failures(first) > 0) {
            v = await once(); // 061's rerun rule: the second result stands
            attempts = 2;
          }
          const record: VerifiedRecord = { ...v, attempts, requestFailuresFirst: failures(first), costUSD: first.verify.usage.costUSD + (attempts === 2 ? v.verify.usage.costUSD : 0) };
          writeNew(verdictFile(bench, run.label, repo, file), record);
          writeNew(gateInputFile(bench, run.label, repo, file), gateReview(v));
          const r = v.verify;
          log(`[evidence] run ${run.label} ${repo}/${file}: findings ${r.findings} · kept ${r.kept} · VERIFY_FAILED ${r.verifyFailed} · retried ${r.retried} · attempts ${attempts} · $${record.costUSD.toFixed(4)} · ${(r.wallMs / 1000).toFixed(0)} s`);
        } catch (e) {
          stop ??= e as Error;
        }
      }
    };
    await Promise.all(Array.from({ length: PULLS_AT_ONCE }, worker));
    const stopped = stop as Error | null; // assigned inside the workers
    if (stopped) {
      const capped = stopped instanceof BudgetExceededError;
      log(`[evidence] ${capped ? "STOPPED AT THE CAP" : "STOPPED ON AN ERROR"} in run ${run.label}: ${stopped.message}; spent this process $${budget.runSpent.toFixed(4)}`);
      return capped ? 2 : 1;
    }
    log(`[evidence] run ${run.label} done; spent this process $${budget.runSpent.toFixed(4)}`);
  }
  log(`[evidence] verify done; spent this process $${budget.runSpent.toFixed(4)}`);
  return 0;
}
type VerifiedRecord = EvidenceVerifiedReview & { attempts: number; requestFailuresFirst: number; costUSD: number };

// ---- gate (no model) ----

export const VARIANTS = Object.freeze([
  { name: "A", args: [] as string[] },
  { name: "B", args: ["--require-evidence", "--min-severity", "medium"] },
  { name: "B-all", args: ["--require-evidence"] },
]);
type GateOut = { kept: ReviewComment[]; dropped: { finding: ReviewComment; rule: string }[]; counts: Record<string, number> };

function gate(bench: string, log: (l: string) => void): number {
  const bRuns = new Set(verifiedRuns(bench).map((r) => r.label));
  const runs = allRuns(bench);
  log(`[evidence] gate: A on runs ${runs.map((r) => r.label).join(", ")}; B and B-all on runs ${[...bRuns].join(", ") || "none"}`);
  const git = (gitDir: string, args: string[]) => execFileSync("git", ["-C", gitDir, ...args], { env: cleanGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const totals: Record<string, { in: number; kept: number }> = {};
  for (const repo of DEV_REPOS) {
    const { gitDir, prs } = inputPaths(bench, "dev", repo);
    const hs = heads(bench, repo);
    for (const file of pullFiles(bench, repo)) {
      const h = hs[file.replace(/\.json$/, "")]!;
      const todo = runs.some((run) => VARIANTS.some((v) => (v.name === "A" || bRuns.has(run.label)) && !existsSync(gateOutFile(bench, v.name, run.label, repo, file))));
      if (!todo) continue;
      const tree = join(tmpdir(), `tracehound-065-${repo}-${file.replace(/\.json$/, "")}`);
      if (existsSync(tree)) throw new Error(`${tree} exists`);
      git(gitDir, ["worktree", "add", "--detach", "--quiet", tree, h.head]);
      try {
        for (const run of runs) {
          for (const v of VARIANTS) {
            if (v.name !== "A" && !bRuns.has(run.label)) continue;
            const findings = v.name === "A" ? join(run.reviews(repo, "pool-verify-v1"), file) : gateInputFile(bench, run.label, repo, file);
            const out = gateOutFile(bench, v.name, run.label, repo, file);
            if (existsSync(out)) continue; // done by an earlier call (A before B); never overwritten
            mkdirSync(dirname(out), { recursive: true });
            const code = gateMain(["--pr", join(prs, file), "--findings", findings, "--repo", tree, "--base", h.mergeBase, "--out", out, ...v.args]);
            if (code !== 0) throw new Error(`gate failed on ${v.name} run ${run.label} ${repo}/${file}`);
            const g = readJson<GateOut>(out);
            const src = readJson<{ pr_title: string; pr_number?: number; comments: unknown[] }>(findings);
            writeNew(join(variantDir(bench, v.name, run.label, repo), file), {
              pr_title: src.pr_title,
              ...(src.pr_number !== undefined && { pr_number: src.pr_number }),
              comments: g.kept.map((c) => ({ path: c.path, line: c.line, body: c.body })),
            });
            const t = (totals[`${v.name} run ${run.label}`] ??= { in: 0, kept: 0 });
            t.in += src.comments.length;
            t.kept += g.kept.length;
          }
        }
      } finally {
        git(gitDir, ["worktree", "remove", tree]);
      }
    }
    log(`[evidence] gate: ${repo} done`);
  }
  for (const [k, t] of Object.entries(totals)) log(`[evidence] gate ${k}: in ${t.in} · kept ${t.kept}`);
  return 0;
}

// ---- contracts (no model) ----

type ContractsFinding = { path: string; line: number; body: string; source: string };
function contracts(bench: string, log: (l: string) => void): number {
  for (const repo of DEV_REPOS) {
    const { gitDir } = inputPaths(bench, "dev", repo);
    const hs = heads(bench, repo);
    let n = 0;
    for (const file of pullFiles(bench, repo)) {
      const h = hs[file.replace(/\.json$/, "")]!;
      const report = join(outDir(bench), "contracts", repo, file);
      if (existsSync(report)) throw new Error(`${report} exists (never overwritten)`);
      const { report: r } = runContracts(["--repo", gitDir, "--base", h.mergeBase, "--head", h.head, "--out", report]);
      const src = PullReview.parse(readJson(join(dirs(bench, repo).kept, file)));
      const findings = (r as unknown as { findings: ContractsFinding[] }).findings;
      writeNew(join(variantDir(bench, "C", "1", repo), file), {
        pr_title: src.pr_title,
        ...(src.pr_number !== undefined && { pr_number: src.pr_number }),
        comments: findings.map((f) => ({ path: f.path, line: f.line, body: f.body })),
      });
      n += findings.length;
      log(`[evidence] contracts ${repo}/${file}: findings ${findings.length}`);
    }
    log(`[evidence] contracts ${repo}: findings ${n}`);
  }
  return 0;
}

// ---- score (judges) and report ----

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};
export const EV_HEAD = TABLE_HEAD.replace("| F |\n", "| F | comments per PR |\n") + "---|";

type Summary = { counts: Counts; pulls: { judgeFailed: number }; usage: { costUSD: number } };

async function score(bench: string, env: NodeJS.ProcessEnv, log: (l: string) => void, err: (l: string) => void): Promise<number> {
  const runs = allRuns(bench);
  const bRuns = verifiedRuns(bench);
  const plan: { variant: string; runs: RunRef[] }[] = [
    { variant: "A", runs },
    { variant: "B", runs: bRuns },
    { variant: "B-all", runs: bRuns },
    { variant: "C", runs: runs.slice(0, 1) },
  ];
  const scoresDir = join(outDir(bench), "scores");
  const judgedBefore = JUDGES.reduce(
    (s, j) => s + jsonFiles(join(scoresDir, j.id)).filter((f) => f.endsWith(".summary.json")).reduce((t, f) => t + readJson<Summary>(join(scoresDir, j.id, f)).usage.costUSD, 0),
    0,
  );
  const allowanceUSD = JUDGE_CAP_USD - judgedBefore;
  const { judge, budget } = buildClients({ apiKey: env.NEBIUS_API_KEY!, ...statePaths, allowanceUSD: Math.max(0, allowanceUSD), env });
  err(`[evidence] score: earlier judging spend $${judgedBefore.toFixed(4)}, allowance $${allowanceUSD.toFixed(4)}`);
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
  const notScored = new Set<string>();
  for (const { variant, runs: vr } of plan) {
    for (const j of JUDGES) {
      for (const run of vr) {
        for (const repo of DEV_REPOS) {
          const base = scoreBase(bench, j.id as JudgeId, variant, run.label, repo);
          if (existsSync(`${base}.summary.json`)) continue;
          if (capHit || allowanceUSD <= 0) {
            notScored.add(variant);
            continue;
          }
          const dir = variantDir(bench, variant, run.label, repo);
          if (!existsSync(dir)) {
            notScored.add(variant);
            continue;
          }
          const golden = GoldenFile.parse(readJson(inputPaths(bench, "dev", repo).golden));
          const lj = new LlmJudge(judgeClient, { model: j.model, reasoning: j.reasoning });
          const result = await scoreRepo({ golden, reviews: loadReviews(dir), judges: [lj], concurrency: JUDGE_CONCURRENCY });
          if (capHit) {
            err(`[evidence] STOPPED AT THE JUDGING CAP at ${variant} run ${run.label} ${repo} under ${j.id}; spent $${budget.runSpent.toFixed(4)}`);
            notScored.add(variant);
            continue;
          }
          const meta = { label: `${variant}/run-${run.label}/${repo}`, judgeVersion: JUDGE_VERSION, judges: [lj.name], reasoning: j.reasoning };
          writeNew(`${base}.detail.json`, { ...meta, ...result });
          const { detail: _d, ...countsOnly } = result;
          writeNew(`${base}.summary.json`, { ...meta, ...countsOnly, metrics: metrics(result.counts) });
        }
      }
    }
  }
  err(`[evidence] judging spend this process $${budget.runSpent.toFixed(4)}`);
  report(bench, plan, notScored, log);
  return 0;
}

function report(bench: string, plan: { variant: string; runs: RunRef[] }[], notScored: Set<string>, log: (l: string) => void) {
  const nPulls = DEV_REPOS.reduce((s, repo) => s + pullFiles(bench, repo).length, 0);
  const sumOf = (files: string[]) => {
    let c = zeroCounts();
    let jf = 0;
    for (const f of files) {
      const s = readJson<Summary>(f);
      c = addCounts(c, s.counts);
      jf += s.pulls.judgeFailed;
    }
    return { c, jf };
  };
  const variantRun = (variant: string, run: RunRef, j: JudgeId) => sumOf(DEV_REPOS.map((repo) => `${scoreBase(bench, j, variant, run.label, repo)}.summary.json`));
  const baselineRun = (run: RunRef, j: JudgeId) => sumOf(DEV_REPOS.map((repo) => run.scoreFile(j, "pool-verify-v1", repo, "summary")));
  const perRun = (f: (run: RunRef, j: JudgeId) => { c: Counts; jf: number }, runs: RunRef[]) =>
    runs.map((r) => ({ label: r.label, v1: f(r, "judge-v1"), x1: f(r, "judge-x1") }));
  const toCounts = (rs: { label: string; v1: { c: Counts }; x1: { c: Counts } }[]): PerRun[] => rs.map((r) => ({ label: r.label, v1: r.v1.c, x1: r.x1.c }));

  const runsAll = plan[0]!.runs;
  const runsB = plan[1]!.runs;
  const base5 = perRun(baselineRun, runsAll);
  const baseB = perRun(baselineRun, runsB);
  const L: string[] = [];
  const table = (title: string, rows: { label: string; v1: { c: Counts; jf: number }; x1: { c: Counts; jf: number } }[], name: (l: string) => string) => {
    for (const j of ["v1", "x1"] as const) {
      L.push("", `#### ${title}, ${j === "v1" ? "bench-judge-v1 (scorer of record)" : "bench-judge-x1"}`, "", EV_HEAD);
      for (const r of rows) L.push(`${tableRow(name(r.label), r[j].c, r[j].jf)} ${(r[j].c.comments / nPulls).toFixed(2)} |`);
      const m = means(toCounts(rows))[j];
      const cpp = mean(rows.map((r) => r[j].c.comments / nPulls));
      L.push(`| **mean of ${rows.length} runs** | | | | | | | | ${pct(m.p)} | ${pct(m.r)} | ${pct(m.f)} | ${cpp.toFixed(2)} |`);
    }
  };

  L.push(`### Baseline: pool-verify-v1, runs ${runsAll.map((r) => r.label).join(", ")} (${nPulls} dev pull requests per run)`);
  table("Baseline", base5, (l) => `pool-verify-v1 run ${l}`);
  const scored: Record<string, PerRun[]> = {};
  for (const { variant, runs } of plan) {
    if (variant === "C") continue;
    L.push("", `### Variant ${variant}, runs ${runs.map((r) => r.label).join(", ") || "none"}`);
    if (notScored.has(variant) || !runs.length) {
      L.push("", "Not scored (cap or no finished run).");
      continue;
    }
    const rows = perRun((r, j) => variantRun(variant, r, j), runs);
    table(variant, rows, (l) => `${variant} run ${l}`);
    scored[variant] = toCounts(rows);
  }

  // adoption
  L.push("", "### Adoption (pre-registered rules, 5-run means)", "");
  const mBase5 = means(toCounts(base5));
  let aPass = false;
  let bPass = false;
  if (scored.A) {
    const a = adoptA(means(scored.A), mBase5);
    aPass = a.adopted;
    L.push(
      `- A: mean P (v1) ${pct(a.checks.precisionV1.value)} vs baseline ${pct(a.checks.precisionV1.base)}, needs above → ${a.checks.precisionV1.pass ? "pass" : "fail"}; ` +
        `mean F (v1) ${pct(a.checks.fV1.value)} vs ${pct(a.checks.fV1.base)}, needs at least → ${a.checks.fV1.pass ? "pass" : "fail"}; ` +
        `mean F (x1) ${pct(a.checks.fX1.value)} vs ${pct(a.checks.fX1.base)}, needs at least → ${a.checks.fX1.pass ? "pass" : "fail"}. **A ${a.adopted ? "passes" : "fails"}.**`,
    );
  }
  if (scored.B) {
    const mBaseB = means(toCounts(baseB));
    const b = adoptB(means(scored.B), mBaseB);
    bPass = b.adopted;
    if (runsB.length !== runsAll.length) L.push(`- B is compared over runs ${runsB.map((r) => r.label).join(", ")} only (the plan's fallback); baseline over the same runs: v1 F ${pct(mBaseB.v1.f)}, P ${pct(mBaseB.v1.p)}; x1 F ${pct(mBaseB.x1.f)}.`);
    L.push(
      `- B: mean F (v1) − baseline ${(100 * b.checks.fMarginV1.value).toFixed(1)} points, needs ≥ 3.0 → ${b.checks.fMarginV1.pass ? "pass" : "fail"}; ` +
        `mean P (v1) − baseline ${(100 * b.checks.pMarginV1.value).toFixed(1)} points, needs ≥ 8.0 → ${b.checks.pMarginV1.pass ? "pass" : "fail"}; ` +
        `mean F (x1) ${pct(b.checks.fX1.value)} vs ${pct(b.checks.fX1.base)}, needs at least → ${b.checks.fX1.pass ? "pass" : "fail"}. **B ${b.adopted ? "passes" : "fails"}.**`,
    );
  }
  L.push(`- **Verdict: ${pipelineVerdict(aPass, bPass)}.**`);

  // drop log
  L.push("", "### Drop log", "", "Per rule: findings dropped, and how many of them the judge had scored TP in the source row's own scoring of that run (A: pool-verify-v1; B, B-all: pool-raw). All runs pooled.", "");
  L.push("| variant | rule | dropped | TP under v1 | TP under x1 |", "|---|---|---|---|---|");
  for (const { variant, runs } of plan) {
    if (variant === "C") continue;
    const row: SourceRow = variant === "A" ? "pool-verify-v1" : "pool-raw";
    const log: Record<string, { n: number; v1: number; x1: number }> = {};
    const add = (rule: string, o1: (string | null)[], ox: (string | null)[]) => {
      const e = (log[rule] ??= { n: 0, v1: 0, x1: 0 });
      e.n += o1.length;
      e.v1 += o1.filter((o) => o === "tp").length;
      e.x1 += ox.filter((o) => o === "tp").length;
    };
    for (const run of runs) {
      for (const repo of DEV_REPOS) {
        const d1 = readJson<Detail>(run.scoreFile("judge-v1", row, repo, "detail"));
        const dx = readJson<Detail>(run.scoreFile("judge-x1", row, repo, "detail"));
        for (const file of pullFiles(bench, repo)) {
          if (variant !== "A") {
            const v = readJson<VerifiedRecord>(verdictFile(bench, run.label, repo, file));
            const drops = v.comments.filter((c) => c.status === "VERIFIED" && c.verdict === "drop");
            add("verifier-drop", outcomesOf(d1, file, drops), outcomesOf(dx, file, drops));
          }
          const g = readJson<GateOut>(gateOutFile(bench, variant, run.label, repo, file));
          const byRule: Record<string, ReviewComment[]> = {};
          for (const d of g.dropped) (byRule[d.rule] ??= []).push(d.finding);
          for (const [rule, fs] of Object.entries(byRule)) add(rule, outcomesOf(d1, file, fs), outcomesOf(dx, file, fs));
        }
      }
    }
    for (const [rule, e] of Object.entries(log)) L.push(`| ${variant} | ${rule} | ${e.n} | ${e.v1} | ${e.x1} |`);
  }

  // VERIFY_FAILED and B's cost
  const recs = runsB.flatMap((run) => DEV_REPOS.flatMap((repo) => pullFiles(bench, repo).map((file) => ({ run, repo, file, v: readJson<VerifiedRecord>(verdictFile(bench, run.label, repo, file)) }))));
  if (recs.length) {
    L.push("", "### Verifier counts (B, B-all)", "", "| run | findings | keep | drop | VERIFY_FAILED | retried | pulls rerun | cost |", "|---|---|---|---|---|---|---|---|");
    for (const run of runsB) {
      const rs = recs.filter((r) => r.run === run);
      const cs = rs.flatMap((r) => r.v.comments);
      L.push(
        `| ${run.label} | ${cs.length} | ${cs.filter((c) => c.verdict === "keep").length} | ${cs.filter((c) => c.verdict === "drop").length} | ${cs.filter((c) => c.status === "VERIFY_FAILED").length} | ` +
          `${cs.filter((c) => c.attempts > 1).length} | ${rs.filter((r) => r.v.attempts > 1).length} | $${rs.reduce((s, r) => s + r.v.costUSD, 0).toFixed(4)} |`,
      );
    }
    const ver = recs.map((r) => r.v.costUSD);
    const pipe = recs.map((r) => r.v.costUSD + r.run.reviewerCost(r.repo, r.file));
    L.push(
      "",
      `Cost per pull request of B (${recs.length} run × pull request pairs): verifier median $${median(ver).toFixed(4)}, max $${Math.max(...ver).toFixed(4)}; ` +
        `pipeline (two reviewers + verifier) median $${median(pipe).toFixed(4)}, max $${Math.max(...pipe).toFixed(4)}. Verifier total $${ver.reduce((s, x) => s + x, 0).toFixed(4)}.`,
    );
    const sev: Record<string, number> = {};
    const cat: Record<string, number> = {};
    for (const c of recs.flatMap((r) => r.v.comments).filter((c) => c.verdict === "keep")) {
      sev[c.severity!] = (sev[c.severity!] ?? 0) + 1;
      cat[c.category!] = (cat[c.category!] ?? 0) + 1;
    }
    L.push("", `Kept by the verifier, by severity: ${JSON.stringify(sev)}; by category: ${JSON.stringify(cat)}.`);
  }

  // C
  if (!notScored.has("C")) {
    L.push("", "### C, contracts (report only), run 1's pull requests", "", "| repo | pull requests | with findings | findings | TP under v1 | TP under x1 |", "|---|---|---|---|---|---|");
    const run = runsAll[0]!;
    for (const repo of DEV_REPOS) {
      const reviews = loadReviews(variantDir(bench, "C", run.label, repo));
      const s1 = readJson<Summary>(`${scoreBase(bench, "judge-v1", "C", run.label, repo)}.summary.json`);
      const sx = readJson<Summary>(`${scoreBase(bench, "judge-x1", "C", run.label, repo)}.summary.json`);
      L.push(`| ${repo} | ${reviews.length} | ${reviews.filter((r) => r.review.comments.length).length} | ${s1.counts.comments} | ${s1.counts.tp} | ${sx.counts.tp} |`);
    }
  }

  // three examples: run 1, the first finding B kept in sentry, grafana and keycloak
  if (runsB[0]?.label === "1") {
    L.push("", "### Three kept findings from B (run 1; the reviewer's own output)");
    for (const repo of DEV_REPOS.slice(0, 3)) {
      for (const file of pullFiles(bench, repo)) {
        const g = readJson<GateOut>(gateOutFile(bench, "B", "1", repo, file));
        const k = g.kept[0] as (ReviewComment & { evidence?: { path: string; line: number; quote: string }[]; scenario?: string; severity?: string; category?: string }) | undefined;
        if (!k) continue;
        const o = outcomesOf(readJson<Detail>(`${scoreBase(bench, "judge-v1", "B", "1", repo)}.detail.json`), file, [k])[0];
        L.push("", `**${repo} ${file}, \`${k.path}:${k.line}\`** (${k.severity}, ${k.category}; bench-judge-v1: ${o ?? "n/a"})`, "", `> ${k.body.replace(/\n+/g, " ")}`, "");
        for (const e of k.evidence ?? []) L.push(`- \`${e.path}:${e.line}\`: \`${e.quote.trim().replace(/`/g, "'")}\``);
        L.push(`- Scenario: ${k.scenario}`);
        break;
      }
    }
  }
  L.forEach((l) => log(l));
}

// ---- main ----

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const statePaths = { stateDir: join(REPO_ROOT, ".tracehound"), pricesFile: join(REPO_ROOT, "config/prices.json") };

if (import.meta.main) {
  try {
    if (!process.env.NEBIUS_API_KEY) process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // no .env: the model commands report the missing key
  }
  const [cmd] = process.argv.slice(2);
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  if (bench.split("/").includes("test")) throw new Error("Cal.com is blind: never under <bench>/test");
  const log = (l: string) => console.log(l);
  const err = (l: string) => console.error(l);
  const needsKey = cmd === "verify" || cmd === "score";
  if (needsKey && !process.env.NEBIUS_API_KEY) {
    err("NEBIUS_API_KEY is not set (put it in .env)");
    process.exitCode = 1;
  } else if (cmd === "verify") process.exitCode = await verify(bench, process.env, log);
  else if (cmd === "gate") process.exitCode = gate(bench, log);
  else if (cmd === "contracts") process.exitCode = contracts(bench, log);
  else if (cmd === "score") process.exitCode = await score(bench, process.env, log, err);
  else {
    err("usage: node scripts/bench/evidence.ts <verify|gate|contracts|score> [--bench <dir>]");
    process.exitCode = 1;
  }
}

