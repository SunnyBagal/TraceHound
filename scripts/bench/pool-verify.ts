// The pool builder of pool-verify-v1 (decision 059). No model call; deterministic; stdout gets counts
// only, never finding text or titles. Cal.com is not in DEV_REPOS and is never read.
//   build: per dev pull request, the pool is every review-diff-v1 Super finding plus every
//     review-ctx-v1 Super finding that agrees (058's rule, agree-rule.ts) with none of them; a
//     review-ctx-v1 finding with a null line is added. Before writing anything, each 058 verdict
//     must match its review-diff-v1 finding by path, line and body (the reuse rule); any mismatch
//     stops the run. Writes the ctx-only findings to reviews/pool-ctx-only/super/<repo>/ and the
//     full pool to reviews/pool-raw/super/<repo>/.
//   merge: after `tracehound verify-ctx` has written the ctx-only verdicts to
//     reviews/pool-verify-v1/super/<repo>/ctx-only-verdicts/, writes the kept pool to
//     reviews/pool-verify-v1/super/<repo>/: review-diff-v1 findings kept by their 058 verdict, then
//     ctx-only findings kept by theirs, each in original order.
//   node scripts/bench/pool-verify.ts build|merge [--bench ~/Projects/tracehound-bench]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PullReview, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { isKept, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";
import { AGREE_LINES, agrees } from "./agree-rule.ts";

export const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const MODEL = "nemotron-3-super-120b-a12b";

export const dirs = (bench: string, repo: string) => ({
  diff: join(bench, "reviews/review-diff-v1", MODEL, repo),
  ctx: join(bench, "reviews/review-ctx-v1", MODEL, repo),
  diffVerdicts: join(bench, "reviews/verify-ctx-v1/super", repo, "verdicts"),
  ctxOnly: join(bench, "reviews/pool-ctx-only/super", repo),
  raw: join(bench, "reviews/pool-raw/super", repo),
  kept: join(bench, "reviews/pool-verify-v1/super", repo),
  ctxOnlyVerdicts: join(bench, "reviews/pool-verify-v1/super", repo, "ctx-only-verdicts"),
});

const strip = (c: ReviewComment): ReviewComment => ({ path: c.path, line: c.line, body: c.body });
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
const readReview = (f: string) => PullReview.parse(readJson(f));
const jsonFiles = (dir: string) => readdirSync(dir).filter((x) => x.endsWith(".json")).sort();
const write = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
const header = (r: PullReview) => ({ pr_title: r.pr_title, ...(r.pr_number !== undefined && { pr_number: r.pr_number }) });

/** The pool rule: review-ctx-v1 findings that agree with no review-diff-v1 finding of the same pull request. */
export function ctxOnlyFindings(diff: readonly ReviewComment[], ctx: readonly ReviewComment[]): ReviewComment[] {
  return ctx.filter((c) => !diff.some((d) => agrees(d, c))).map(strip);
}

/** The reuse rule: verdicts line up with findings one to one by path, line and body. Throws on any mismatch. */
export function checkReuse(where: string, findings: readonly ReviewComment[], verdicts: readonly { path: string; line: number | null; body: string }[]) {
  if (findings.length !== verdicts.length) throw new Error(`reuse check: ${where}: ${verdicts.length} verdicts for ${findings.length} findings`);
  findings.forEach((f, i) => {
    const v = verdicts[i]!;
    if (v.path !== f.path || v.line !== f.line || v.body !== f.body) throw new Error(`reuse check: ${where}: finding ${i + 1} does not match its verdict`);
  });
}

export interface BuildCounts {
  pulls: number;
  diffFindings: number;
  ctxFindings: number;
  agreed: number;
  ctxOnly: number;
  ctxOnlyNullLine: number;
  pool: number;
  reuseChecked: number;
}

export function build(bench: string, repos = DEV_REPOS): Record<string, BuildCounts> {
  // every check runs before anything is written
  const plans: { repo: string; file: string; diff: PullReview; ctxOnly: ReviewComment[]; ctxCount: number }[] = [];
  for (const repo of repos) {
    const d = dirs(bench, repo);
    for (const f of jsonFiles(d.diff)) {
      const diff = readReview(join(d.diff, f));
      if (!existsSync(join(d.ctx, f))) throw new Error(`${repo}/${f}: no review-ctx-v1 review`);
      const ctx = readReview(join(d.ctx, f));
      if (ctx.pr_title !== diff.pr_title) throw new Error(`${repo}/${f}: titles differ`);
      if (!existsSync(join(d.diffVerdicts, f))) throw new Error(`reuse check: ${repo}/${f}: no 058 verdict file`);
      checkReuse(`${repo}/${f}`, diff.comments, readJson<CtxVerifiedReview>(join(d.diffVerdicts, f)).comments);
      plans.push({ repo, file: f, diff, ctxOnly: ctxOnlyFindings(diff.comments, ctx.comments), ctxCount: ctx.comments.length });
    }
  }
  const totals: Record<string, BuildCounts> = {};
  for (const p of plans) {
    const d = dirs(bench, p.repo);
    mkdirSync(d.ctxOnly, { recursive: true });
    mkdirSync(d.raw, { recursive: true });
    const pool = { rule: `review-diff-v1 plus review-ctx-v1 findings agreeing with none (same path, line within ${AGREE_LINES})`, diffFindings: p.diff.comments.length, ctxFindings: p.ctxCount, ctxOnly: p.ctxOnly.length };
    write(join(d.ctxOnly, p.file), { ...header(p.diff), comments: p.ctxOnly, pool });
    write(join(d.raw, p.file), { ...header(p.diff), comments: [...p.diff.comments.map(strip), ...p.ctxOnly], pool });
    const t = (totals[p.repo] ??= { pulls: 0, diffFindings: 0, ctxFindings: 0, agreed: 0, ctxOnly: 0, ctxOnlyNullLine: 0, pool: 0, reuseChecked: 0 });
    t.pulls++;
    t.diffFindings += p.diff.comments.length;
    t.ctxFindings += p.ctxCount;
    t.agreed += p.ctxCount - p.ctxOnly.length;
    t.ctxOnly += p.ctxOnly.length;
    t.ctxOnlyNullLine += p.ctxOnly.filter((c) => c.line === null).length;
    t.pool += p.diff.comments.length + p.ctxOnly.length;
    t.reuseChecked += p.diff.comments.length;
  }
  return totals;
}

export interface MergeCounts {
  pulls: number;
  diffIn: number;
  diffKept: number;
  ctxOnlyIn: number;
  ctxOnlyKept: number;
  ctxOnlyVerifyFailed: number;
  ctxOnlyRetried: number;
  kept: number;
}

export function merge(bench: string, repos = DEV_REPOS): Record<string, MergeCounts> {
  const plans: { repo: string; file: string; diff: PullReview; kept: ReviewComment[]; counts: Omit<MergeCounts, "pulls"> }[] = [];
  for (const repo of repos) {
    const d = dirs(bench, repo);
    for (const f of jsonFiles(d.ctxOnly)) {
      const diff = readReview(join(d.diff, f));
      const ctxOnly = readReview(join(d.ctxOnly, f));
      const dv = readJson<CtxVerifiedReview>(join(d.diffVerdicts, f)).comments;
      if (!existsSync(join(d.ctxOnlyVerdicts, f))) throw new Error(`${repo}/${f}: no ctx-only verdict file`);
      const cv = readJson<CtxVerifiedReview>(join(d.ctxOnlyVerdicts, f)).comments;
      checkReuse(`${repo}/${f}`, diff.comments, dv);
      checkReuse(`${repo}/${f} ctx-only`, ctxOnly.comments, cv);
      const kept = [...dv.filter(isKept).map(strip), ...cv.filter(isKept).map(strip)];
      plans.push({
        repo,
        file: f,
        diff,
        kept,
        counts: {
          diffIn: dv.length,
          diffKept: dv.filter(isKept).length,
          ctxOnlyIn: cv.length,
          ctxOnlyKept: cv.filter(isKept).length,
          ctxOnlyVerifyFailed: cv.filter((c) => c.status === "VERIFY_FAILED").length,
          ctxOnlyRetried: cv.filter((c) => c.attempts > 1).length,
          kept: kept.length,
        },
      });
    }
  }
  const totals: Record<string, MergeCounts> = {};
  for (const p of plans) {
    const d = dirs(bench, p.repo);
    mkdirSync(d.kept, { recursive: true });
    write(join(d.kept, p.file), { ...header(p.diff), comments: p.kept, pool: { rule: "review-diff-v1 kept by 058 verdicts, then ctx-only kept by verify-ctx-v1", ...p.counts } });
    const t = (totals[p.repo] ??= { pulls: 0, diffIn: 0, diffKept: 0, ctxOnlyIn: 0, ctxOnlyKept: 0, ctxOnlyVerifyFailed: 0, ctxOnlyRetried: 0, kept: 0 });
    t.pulls++;
    for (const k of Object.keys(p.counts) as (keyof typeof p.counts)[]) t[k] += p.counts[k];
  }
  return totals;
}

if (import.meta.main) {
  const mode = process.argv[2];
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  if (mode === "build") console.log(JSON.stringify(build(bench)));
  else if (mode === "merge") console.log(JSON.stringify(merge(bench)));
  else {
    console.error("usage: node scripts/bench/pool-verify.ts build|merge [--bench <dir>]");
    process.exitCode = 1;
  }
}
