// Decision 075: the verified quality of 074's A and E findings. No reviewer calls of any kind: the findings are the
// replies 074 already recorded (<bench>/hard-chunks-074/units.json and bodies/).
// Findings per arm and unit, from the arm's SUCCESSFUL units only (074 metric: valid reply, >= 1 diff-checked finding):
//   path valid   (first reply valid):            the first reply's findings, the same for A and E;
//   path invalid (non-empty invalid first reply): the shared append retry's findings, the same for A and E;
//   path empty:                                   A = the append retry's findings, E = the schema retry's findings.
// Findings = parseReviewReply(content, "lenient") items that pass DiffIndex.check for the PR's diff (074's "kept").
// Verifier: verify-ctx-v1 unchanged (verifyReviewWithContext; model 3.5 Super VL, reasoning on, concurrency 4, strict
// parser), each distinct finding once per PR, response cache read and written. Kept = isKept (keep or VERIFY_FAILED).
// Judge (Amendment 1): ONE judge, bench-judge-v1 (JUDGES[0]), on the dev golden file of the PR's repo. One review per
// (arm, draw, hard chunk) of its verifier-kept findings, scored by its own scoreRepo call: a shared-path unit gives A
// and E byte-identical reviews, so identical judge requests (cache on) and identical scores. Scorer rules (duplicates,
// Low) apply within a review only; across draws and chunks, separate reviews each count.
// Gate: P(E kept) >= P(A kept) and TP(E) - TP(A) >= 3, computed twice: with isKept, and with only verdict "keep"
// (the judge's matches re-scored on that subset, no new call). PASS needs both; holding only with VERIFY_FAILED kept
// is INCONCLUSIVE; so is a JUDGE_FAILED review, a verifier request failure, or a stop.
//   node scripts/bench/verify-074.ts check [--bench <dir>]    $0: rebuild every arm's findings, print counts and pricing
//   TRACEHOUND_BUDGET_RUN_USD=1.5 node scripts/bench/verify-074.ts run [--bench <dir>]
//   node scripts/bench/verify-074.ts report [--bench <dir>]
// stdout gets counts only; finding text, verdicts and judge details stay in <bench>/verify-074/.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { LlmJudge } from "../../packages/analyzer/src/bench/judge.ts";
import { scorePull, scoreRepo, type CommentOutcome } from "../../packages/analyzer/src/bench/score.ts";
import { mapByTitle } from "../../packages/analyzer/src/bench/titles.ts";
import { GoldenFile, type GoldenEntry, type PullReview, type Severity } from "../../packages/analyzer/src/bench/types.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { Budget, BudgetExceededError, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { TokenFactoryClient, type ChatRequest, type ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { costUSD, estimateInputTokens, loadPriceTable, priceFor, type PriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import { gitSource, type GitSource } from "../../packages/analyzer/src/review/context.ts";
import { parseDiff } from "../../packages/analyzer/src/review/diff.ts";
import { DiffIndex, parseReviewReply, type PullInput } from "../../packages/analyzer/src/review/review.ts";
import { isKept, verifyReviewWithContext, type CtxVerifiedComment, type CtxVerifiedReview } from "../../packages/analyzer/src/review/verify-ctx.ts";
import { DRAWS, MODEL, outDir as outDir074, type Unit } from "./hard-chunks.ts";
import { checkBench, stageOf } from "./recovery-ab.ts";
import { JUDGES } from "./run-test-set.ts";
import { DEV_REPOS, inputPaths, isRequestFailure } from "./test-set.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const DECISION = "075";
/** 074's runner commit: the analyzer code and config must still equal it. */
export const BASE_075 = "0063b0c";
export const JOB_CAP_USD = 1.5;
/** Amendment 1.5: the run refuses if the expected cost exceeds this (means from run/out/codex.budget.md). */
export const EXPECTED_CAP_USD = 1.2;
export const MEAN_VERIFY_USD = 0.0032;
export const MEAN_JUDGE_USD = 0.0009;
/** The product's verifier settings (as run-test-set.ts's pipeline passes them), with 074's reviewer model. */
export const VERIFY_MODEL = MODEL;
export const VERIFY_OPTS = Object.freeze({ model: VERIFY_MODEL, reasoning: "on" as const, concurrency: 4 });
/** bench-judge-v1, the scorer of record. */
export const JUDGE = JUDGES[0]!;
export const ARMS = ["A", "E"] as const;
export type Arm = (typeof ARMS)[number];
export const outDir = (bench: string) => join(bench, "verify-074");

const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;

// ---- 074's findings per arm ----

export interface Finding { path: string; line: number; body: string }
export type UnitPath = "valid" | "invalid" | "empty";
/** One finding of one arm in one successful unit. */
export interface Occ { arm: Arm; draw: number; chunk: string; pull: string; unitPath: UnitPath; finding: Finding; key: string }

export const findingKey = (f: { path: string; line: number | null; body: string }) => JSON.stringify([f.path, f.line, f.body]);
export const bodyFile = (chunk: string, draw: number, name: string) => `${chunk.replace(/[/#]/g, "_")}-d${draw}-${name}.json`;

/** A chunk id `<repo>/<n>#<diff|ctx><k>` of a dev repo; checked before any path is built from it. */
export function parseChunkId(id: string): { repo: string; name: string; pull: string } {
  const m = /^([a-z]+)\/(\d+)#(?:diff|ctx)\d+$/.exec(id);
  if (!m) throw new Error(`unexpected chunk id ${JSON.stringify(id)}`);
  const [, repo, name] = m as unknown as [string, string, string];
  if (!(DEV_REPOS as readonly string[]).includes(repo)) throw new Error(`not a dev repo: ${repo}`);
  return { repo, name, pull: `${repo}/${name}` };
}

/** 074's "kept" findings of one reply: lenient parse, then the diff check. */
export function keptFindings(content: string, index: DiffIndex): { valid: boolean; findings: Finding[] } {
  const p = parseReviewReply(content, "lenient");
  if (!p.ok) return { valid: false, findings: [] };
  const out: Finding[] = [];
  for (const f of p.findings) {
    const c = index.check(f);
    if (c.ok) out.push({ path: c.path, line: c.line, body: c.body });
  }
  return { valid: true, findings: out };
}

/** The body each arm's outcome came from, by the unit's path. */
export const armBody = (path: UnitPath, arm: Arm) => (path === "valid" ? "first" : path === "invalid" ? "append" : arm === "A" ? "append" : "schema");

export interface Sources {
  /** a body's `content`, or null when there is no such file */
  body: (chunk: string, draw: number, name: string) => string | null;
  diff: (pull: string) => string;
}
export interface Extracted {
  occ: Occ[];
  units: number;
  /** complete units with arms (074's gate units); the others are left out */
  complete: number;
  paths: Record<UnitPath, number>;
  successes: Record<Arm, number>;
  successesEmpty: Record<Arm, number>;
}

/** Every arm's findings, with every check against units.json; throws on any inconsistency. */
export function extractFindings(units: Unit[], src: Sources): Extracted {
  const seen = new Set<string>();
  const indexes = new Map<string, DiffIndex>();
  const indexOf = (pull: string) => {
    let i = indexes.get(pull);
    if (!i) indexes.set(pull, (i = new DiffIndex(parseDiff(src.diff(pull)))));
    return i;
  };
  const occ: Occ[] = [];
  const paths: Record<UnitPath, number> = { valid: 0, invalid: 0, empty: 0 };
  const successes: Record<Arm, number> = { A: 0, E: 0 };
  const successesEmpty: Record<Arm, number> = { A: 0, E: 0 };
  let complete = 0;
  const sorted = [...units].sort((a, b) => a.chunk.localeCompare(b.chunk) || a.draw - b.draw);
  for (const u of sorted) {
    const { pull } = parseChunkId(u.chunk);
    const where = `${u.chunk} draw ${u.draw}`;
    if (!Number.isInteger(u.draw) || u.draw < 1 || u.draw > DRAWS) throw new Error(`${where}: draw out of range`);
    if (seen.has(`${u.chunk}@${u.draw}`)) throw new Error(`${where}: duplicate unit`);
    seen.add(`${u.chunk}@${u.draw}`);
    if (!u.complete || !u.arms) continue;
    complete++;
    const path = u.path;
    if (path !== "valid" && path !== "invalid" && path !== "empty") throw new Error(`${where}: complete unit with path ${JSON.stringify(path)}`);
    paths[path]++;
    if (path !== "empty" && JSON.stringify(u.arms.A) !== JSON.stringify(u.arms.E)) throw new Error(`${where}: A and E differ on the shared ${path} path`);
    for (const arm of ARMS) {
      const o = u.arms[arm];
      const name = armBody(path, arm);
      const content = src.body(u.chunk, u.draw, name);
      const r = content === null ? null : keptFindings(content, indexOf(pull));
      if (!o.success) {
        if (r && r.valid && r.findings.length > 0) throw new Error(`${where}: ${arm} is recorded as no success, but its ${name} body has ${r.findings.length} kept findings`);
        continue;
      }
      if (!r) throw new Error(`${where}: ${arm} is a success, but there is no ${name} body`);
      if (!r.valid) throw new Error(`${where}: ${arm} is a success, but its ${name} body does not parse`);
      if (r.findings.length === 0) throw new Error(`${where}: ${arm} is a success, but its ${name} body has no kept finding`);
      if (r.findings.length !== o.kept) throw new Error(`${where}: ${arm}'s ${name} body has ${r.findings.length} kept findings, units.json says ${o.kept}`);
      successes[arm]++;
      if (path === "empty") successesEmpty[arm]++;
      for (const f of r.findings) occ.push({ arm, draw: u.draw, chunk: u.chunk, pull, unitPath: path, finding: f, key: findingKey(f) });
    }
  }
  return { occ, units: units.length, complete, paths, successes, successesEmpty };
}

/** The verifier's work: each distinct finding once per PR, in first-occurrence order. */
export function distinctFindings(occ: Occ[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  const seen = new Set<string>();
  for (const o of occ) {
    if (seen.has(`${o.pull}\n${o.key}`)) continue;
    seen.add(`${o.pull}\n${o.key}`);
    out.set(o.pull, [...(out.get(o.pull) ?? []), o.finding]);
  }
  return out;
}

/** One review per (arm, draw, hard chunk) with a successful unit: its verifier-kept findings (Amendment 1.1). */
export interface ReviewRec { arm: Arm; draw: number; chunk: string; pull: string; repo: string; unitPath: UnitPath; file: string; comments: Finding[]; sources: number[] }
export function chunkReviews(occ: Occ[], kept: (o: Occ) => boolean): ReviewRec[] {
  const by = new Map<string, ReviewRec>();
  occ.forEach((o, i) => {
    const k = `${o.arm}|${o.draw}|${o.chunk}`;
    let r = by.get(k);
    if (!r) {
      const { repo, name } = parseChunkId(o.chunk);
      by.set(k, (r = { arm: o.arm, draw: o.draw, chunk: o.chunk, pull: o.pull, repo, unitPath: o.unitPath, file: `${name}.json`, comments: [], sources: [] }));
    }
    if (kept(o)) {
      r.comments.push(o.finding);
      r.sources.push(i);
    }
  });
  return [...by.values()].sort((a, b) => a.arm.localeCompare(b.arm) || a.draw - b.draw || a.chunk.localeCompare(b.chunk));
}
export const reviewId = (r: { arm: string; draw: number; chunk: string }) => `${r.arm}|${r.draw}|${r.chunk}`;

// ---- analysis and gate ----

/** What the scorer recorded for one review: its status, the golden severities, and each comment's matched golden id. */
export interface ScoreRec { arm: Arm; draw: number; chunk: string; costUSD: number; status: "SCORED" | "JUDGE_FAILED"; severities: Severity[]; matched: (string | null)[] }
export interface Row { arm: Arm; found: number; kept: number; verifyFailed: number; tp: number; fp: number; duplicates: number; low: number; precision: number | null; distinctGoldens: number }
export type GateVerdict = "PASS (adopt E)" | "FAIL" | "INCONCLUSIVE";

export interface Flags { status: string; judgeFailed: number; verifyRequestFailures: number; unverified: number; unjudged: number }
/** One reading of the gate: P(E kept) >= P(A kept) and TP(E) - TP(A) >= 3; INCONCLUSIVE on a judge failure, a verifier request failure, a stop. */
export function gate075(A: Row, E: Row, f: Flags): { verdict: GateVerdict; why: string } {
  const why: string[] = [];
  if (f.status !== "complete") why.push(`the job did not complete (${f.status})`);
  if (f.judgeFailed) why.push(`${f.judgeFailed} judged reviews JUDGE_FAILED`);
  if (f.verifyRequestFailures) why.push(`${f.verifyRequestFailures} verifier request failures`);
  if (f.unverified) why.push(`${f.unverified} findings without a verdict`);
  if (f.unjudged) why.push(`${f.unjudged} reviews not judged`);
  if (why.length) return { verdict: "INCONCLUSIVE", why: why.join("; ") };
  if (A.precision === null || E.precision === null) return { verdict: "INCONCLUSIVE", why: `precision undefined (no TP or FP) for ${A.precision === null ? "A" : "E"}` };
  // exact: TP_E / (TP_E + FP_E) >= TP_A / (TP_A + FP_A)
  const pOk = E.tp * (A.tp + A.fp) >= A.tp * (E.tp + E.fp);
  const dTp = E.tp - A.tp;
  if (pOk && dTp >= 3) return { verdict: "PASS (adopt E)", why: `P(E) ${E.precision.toFixed(3)} >= P(A) ${A.precision.toFixed(3)}, TP(E) - TP(A) = ${dTp}` };
  return { verdict: "FAIL", why: [!pOk && `P(E) ${E.precision.toFixed(3)} < P(A) ${A.precision.toFixed(3)}`, dTp < 3 && `TP(E) - TP(A) = ${dTp} < 3`].filter(Boolean).join("; ") };
}
/** Amendment 1.3: PASS needs the gate with isKept and with verdict "keep" only; PASS only with VERIFY_FAILED kept is INCONCLUSIVE. */
export function gateBoth(withFailed: { verdict: GateVerdict; why: string }, keepOnly: { verdict: GateVerdict; why: string }): { verdict: GateVerdict; why: string } {
  const why = `isKept: ${withFailed.verdict} (${withFailed.why}); keep only: ${keepOnly.verdict} (${keepOnly.why})`;
  if (withFailed.verdict === "INCONCLUSIVE" || keepOnly.verdict === "INCONCLUSIVE") return { verdict: "INCONCLUSIVE", why };
  if (withFailed.verdict === "PASS (adopt E)" && keepOnly.verdict === "PASS (adopt E)") return { verdict: "PASS (adopt E)", why };
  if (withFailed.verdict === "PASS (adopt E)") return { verdict: "INCONCLUSIVE", why: `holds only with VERIFY_FAILED kept; ${why}` };
  return { verdict: "FAIL", why };
}

export function analyze075(occ: Occ[], reviews: ReviewRec[], verdicts: Map<string, CtxVerifiedComment[]>, scores: ScoreRec[], status: string) {
  const byPull = new Map<string, Map<string, CtxVerifiedComment>>();
  for (const [pull, cs] of verdicts) byPull.set(pull, new Map(cs.map((c) => [findingKey(c), c])));
  const verdictOf = (o: Occ) => byPull.get(o.pull)?.get(o.key);
  const scoreOf = new Map(scores.map((s) => [reviewId(s), s]));
  for (const s of scores) if (!reviews.some((r) => reviewId(r) === reviewId(s))) throw new Error(`score ${reviewId(s)}: no such review`);
  /** outcome and matched golden id per occurrence, re-scored per review on the chosen subset (scorer rules within a review) */
  const outcomes = (keepOnly: boolean) => {
    const out: ({ outcome: CommentOutcome; matched: string | null } | undefined)[] = new Array(occ.length);
    for (const r of reviews) {
      const s = scoreOf.get(reviewId(r));
      if (!s || s.status !== "SCORED") continue;
      if (s.matched.length !== r.comments.length) throw new Error(`score ${reviewId(r)}: ${s.matched.length} matches for ${r.comments.length} comments`);
      const ks = r.sources.map((_, k) => k).filter((k) => !keepOnly || verdictOf(occ[r.sources[k]!]!)?.verdict === "keep");
      const m = ks.map((k) => s.matched[k]!);
      const scored = scorePull(s.severities, m.map((id) => (id === null ? null : Number(id.slice(1)) - 1)));
      ks.forEach((k, j) => (out[r.sources[k]!] = { outcome: scored.outcomes[j]!, matched: m[j]! }));
    }
    return out;
  };
  const all = outcomes(false);
  const strict = outcomes(true);
  const row = (arm: Arm, keepOnly: boolean, only?: UnitPath): Row => {
    const oc = keepOnly ? strict : all;
    const idx = occ.flatMap((o, i) => (o.arm === arm && (!only || o.unitPath === only) ? [i] : []));
    const count = (k: CommentOutcome) => idx.filter((i) => oc[i]?.outcome === k).length;
    const tp = count("tp");
    const fp = count("fp");
    return {
      arm,
      found: idx.length,
      kept: idx.filter((i) => {
        const v = verdictOf(occ[i]!);
        return !!v && (keepOnly ? v.verdict === "keep" : isKept(v));
      }).length,
      verifyFailed: idx.filter((i) => verdictOf(occ[i]!)?.status === "VERIFY_FAILED").length,
      tp,
      fp,
      duplicates: count("duplicate"),
      low: count("low"),
      precision: tp + fp ? tp / (tp + fp) : null,
      distinctGoldens: new Set(idx.filter((i) => oc[i]?.outcome === "tp").map((i) => `${occ[i]!.pull}|${oc[i]!.matched}`)).size,
    };
  };
  const rows = { A: row("A", false), E: row("E", false) };
  const rowsKeepOnly = { A: row("A", true), E: row("E", true) };
  const rowsEmpty = { A: row("A", false, "empty"), E: row("E", false, "empty") };
  const allVerdicts = [...verdicts.values()].flat();
  const flags: Flags = {
    status,
    judgeFailed: reviews.filter((r) => r.comments.length > 0 && scoreOf.get(reviewId(r))?.status === "JUDGE_FAILED").length,
    verifyRequestFailures: allVerdicts.filter((c) => isRequestFailure(c.failure)).length,
    unverified: occ.filter((o) => !verdictOf(o)).length,
    unjudged: reviews.filter((r) => r.comments.length > 0 && !scoreOf.has(reviewId(r))).length,
  };
  // verifier cost per arm: each distinct finding the arm used, at its one verification's cost (shared findings count for both arms)
  const verifyCost = (arm: Arm) => {
    let t = 0;
    for (const k of new Set(occ.filter((o) => o.arm === arm).map((o) => `${o.pull}\n${o.key}`))) {
      const [pull, key] = k.split("\n") as [string, string];
      t += byPull.get(pull)?.get(key)?.usage.costUSD ?? 0;
    }
    return t;
  };
  const judgeCost = (arm: Arm) => scores.filter((s) => s.arm === arm).reduce((t, s) => t + s.costUSD, 0);
  const g1 = gate075(rows.A, rows.E, flags);
  const g2 = gate075(rowsKeepOnly.A, rowsKeepOnly.E, flags);
  return {
    rows,
    rowsKeepOnly,
    rowsEmpty,
    reviews: { A: reviews.filter((r) => r.arm === "A").length, E: reviews.filter((r) => r.arm === "E").length, withKept: reviews.filter((r) => r.comments.length > 0).length },
    distinct: allVerdicts.length,
    flags,
    cost: { verify: { A: verifyCost("A"), E: verifyCost("E"), total: allVerdicts.reduce((t, c) => t + c.usage.costUSD, 0) }, judge: { A: judgeCost("A"), E: judgeCost("E") } },
    gates: { isKept: g1, keepOnly: g2 },
    gate: gateBoth(g1, g2),
  };
}

export function formatReport(r: ReturnType<typeof analyze075>, spendUSD: number, emptyFirstUnits: number): string[] {
  const p = (x: number | null) => (x === null ? "n/a" : x.toFixed(3));
  const table = (rows: Record<Arm, Row>, keptLabel = "kept by the verifier") => [
    `| arm | found | ${keptLabel} | VERIFY_FAILED | TP | distinct goldens (TP) | FP | duplicates | low | precision TP/(TP+FP) |`,
    "|---|---|---|---|---|---|---|---|---|---|",
    ...ARMS.map((a) => {
      const x = rows[a];
      return `| ${a} | ${x.found} | ${x.kept} | ${x.verifyFailed} | ${x.tp} | ${x.distinctGoldens} | ${x.fp} | ${x.duplicates} | ${x.low} | ${p(x.precision)} |`;
    }),
  ];
  return [
    `status ${r.flags.status} · spend $${spendUSD.toFixed(4)} · reviews (arm, draw, chunk): A ${r.reviews.A}, E ${r.reviews.E}, with kept findings ${r.reviews.withKept} · JUDGE_FAILED ${r.flags.judgeFailed} · distinct verifier findings ${r.distinct} (request failures ${r.flags.verifyRequestFailures}) · unverified ${r.flags.unverified} · unjudged ${r.flags.unjudged}`,
    "Duplicates: scorer rules apply within one review (one arm, draw and chunk); across draws and chunks, separate reviews each count.",
    "",
    "All successful units (sums over 3 draws), kept = isKept (keep or VERIFY_FAILED):",
    ...table(r.rows),
    "",
    'The same, verdict "keep" only (the judge\'s matches re-scored without VERIFY_FAILED findings):',
    ...table(r.rowsKeepOnly, 'kept ("keep")'),
    "",
    `The ${emptyFirstUnits} empty-first units (where A and E differ; reported, not gated):`,
    ...table(r.rowsEmpty),
    "",
    `cost: verifier A $${r.cost.verify.A.toFixed(4)}, E $${r.cost.verify.E.toFixed(4)} (shared findings count for both; distinct total $${r.cost.verify.total.toFixed(4)}) · judge A $${r.cost.judge.A.toFixed(4)}, E $${r.cost.judge.E.toFixed(4)}`,
    `gate with isKept: ${r.gates.isKept.verdict} (${r.gates.isKept.why})`,
    `gate with "keep" only: ${r.gates.keepOnly.verdict} (${r.gates.keepOnly.why})`,
    `gate (P(E kept) >= P(A kept) and TP(E) - TP(A) >= 3, both readings): ${r.gate.verdict}`,
  ];
}

// ---- inputs ----

export interface PullInfo { pull: string; repo: string; name: string; input: PullInput; head: string; gitDir: string }
export function pullInfo(bench: string, pull: string): PullInfo {
  const { repo, name } = parseChunkId(`${pull}#diff0`);
  const p = inputPaths(bench, "dev", repo);
  const raw = readJson<PullInput & { body?: string }>(join(p.prs, `${name}.json`));
  const input: PullInput = { title: raw.title, description: raw.description ?? raw.body ?? "", diff: raw.diff, ...(typeof raw.number === "number" && { number: raw.number }) };
  const head = readJson<Record<string, { head: string }>>(p.heads)[name]?.head;
  if (!head) throw new Error(`${pull}: no head`);
  return { pull, repo, name, input, head, gitDir: p.gitDir };
}

/** 074's units and bodies, read and checked; every PR with findings maps to exactly one dev golden entry by title. */
export function load074(bench: string) {
  const d = outDir074(bench);
  const run = readJson<{ status?: string }>(join(d, "run.json"));
  if (run.status !== "complete") throw new Error(`074's run.json status is ${JSON.stringify(run.status)}, not "complete"`);
  const units = readJson<Unit[]>(join(d, "units.json"));
  if (!Array.isArray(units)) throw new Error("074's units.json is not a list");
  const pulls = new Map<string, PullInfo>();
  for (const u of units) {
    const { pull } = parseChunkId(u.chunk); // before any path is built
    if (!pulls.has(pull)) pulls.set(pull, pullInfo(bench, pull));
  }
  const ex = extractFindings(units, {
    body: (chunk, draw, name) => {
      const f = join(d, "bodies", bodyFile(chunk, draw, name));
      return existsSync(f) ? readJson<{ content: string }>(f).content : null;
    },
    diff: (pull) => pulls.get(pull)!.input.diff,
  });
  const goldenOf = new Map<string, GoldenEntry>();
  const withFindings = [...new Set(ex.occ.map((o) => o.pull))];
  for (const repo of DEV_REPOS) {
    const mine = withFindings.filter((p) => pulls.get(p)!.repo === repo);
    if (!mine.length) continue;
    const golden = GoldenFile.parse(readJson(inputPaths(bench, "dev", repo).golden));
    const m = mapByTitle(golden.map((g) => g.pr_title), mine, (p) => pulls.get(p)!.input.title);
    if (m.unmatchedPrs.length || m.duplicatePrs.length) throw new Error(`${repo}: ${m.unmatchedPrs.length} PRs without a golden entry, ${m.duplicatePrs.length} duplicate titles`);
    for (const x of m.matched) goldenOf.set(x.pr, golden[x.golden]!);
  }
  return { pulls, goldenOf, ...ex };
}

// ---- pricing (Amendment 1.5) ----

/** Expected cost from the ledger means (codex.budget.md): verifier calls × $0.0032 + judge calls × $0.0009. */
export const expectedUSD = (verifierCalls: number, judgeCalls: number) => verifierCalls * MEAN_VERIFY_USD + judgeCalls * MEAN_JUDGE_USD;

/**
 * The client's own worst-case reservation (estimated input tokens + every allowed completion token) for the exact first
 * requests, built with a capturing client ($0, no network): every distinct verifier request, and every judge review as
 * if the verifier kept all its findings. Retries are not counted.
 */
export async function worstCase(L: ReturnType<typeof load074>, prices: PriceTable, sourceFor: (gitDir: string, head: string) => GitSource) {
  const reserve = (r: ChatRequest) => costUSD(priceFor(prices, r.model), estimateInputTokens(r.messages, r.tools), r.max_tokens ?? 0);
  let verify = 0;
  let verifyCalls = 0;
  const capture: ChatClient = {
    chat: async (r: ChatRequest): Promise<ChatResult> => {
      verify += reserve(r);
      verifyCalls++;
      return { content: '{"verdict":"keep","reason":"pricing only"}', cached: false, latencyMs: 0, costUSD: 0 };
    },
  };
  for (const [pull, findings] of distinctFindings(L.occ)) {
    const p = L.pulls.get(pull)!;
    await verifyReviewWithContext(capture, p.input, { pr_title: p.input.title, comments: findings }, { source: sourceFor(p.gitDir, p.head), head: p.head }, VERIFY_OPTS);
  }
  let judge = 0;
  const lj = new LlmJudge(capture, { model: JUDGE.model, reasoning: JUDGE.reasoning });
  const reviews = chunkReviews(L.occ, () => true);
  for (const r of reviews) {
    const g = L.goldenOf.get(r.pull)!;
    if (!g.comments.length) continue;
    judge += reserve(lj.buildRequest({ prTitle: g.pr_title, golden: g.comments.map((c, i) => ({ id: `G${i + 1}`, text: c.comment })), tool: r.comments.map((c, i) => ({ id: `T${i + 1}`, ...c })) }));
  }
  return { verifyCalls, verifyUSD: verify, judgeReviews: reviews.length, judgeUSD: judge };
}

// ---- the job ----

/** packages/analyzer/src and config equal BASE_075; nothing uncommitted there or in scripts/bench. */
export function freezeCheck075(root = REPO_ROOT) {
  const git = (args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const d = git(["diff", "--name-only", BASE_075, "HEAD", "--", "packages/analyzer/src", "config"]);
  if (d.status !== 0) return { ok: false, why: "git diff failed", head };
  if (d.stdout.trim()) return { ok: false, why: `changed since ${BASE_075}: ${d.stdout.trim().split("\n").join(", ")}`, head };
  const st = git(["status", "--porcelain", "--untracked-files=all", "--", "packages/analyzer/src", "config", "scripts/bench"]);
  if (st.status !== 0 || st.stdout.trim()) return { ok: false, why: "uncommitted files", head };
  return { ok: true, head };
}

/** Only verifier and judge requests pass; anything else (a reviewer request) is refused and recorded. */
export function guardClient(inner: ChatClient, onRefused: (e: Error) => void): ChatClient {
  return {
    chat: async (request: ChatRequest, meta) => {
      const s = stageOf(request);
      if (s !== "verify" && s !== "judge") {
        const e = new Error(`refused a ${s} request: 075 sends verifier and judge requests only`);
        onRefused(e);
        throw e;
      }
      return inner.chat(request, meta);
    },
  };
}

export interface Deps { bench: string; stateDir: string; pricesFile: string; env: NodeJS.ProcessEnv; log: (l: string) => void; err: (l: string) => void; fetch?: typeof fetch; client?: ChatClient; freezeCheck?: () => { ok: boolean; why?: string; head: string }; source?: (gitDir: string, head: string) => GitSource; repoRoot?: string }

export async function runJob(mode: "check" | "run", deps: Deps): Promise<number> {
  const where = checkBench(deps.bench, deps.repoRoot ?? REPO_ROOT);
  if (!where.ok) return (deps.err(`[verify-074] refusing: ${where.why}`), 1);
  const bench = where.bench;
  const sourceFor = deps.source ?? gitSource;
  let L: ReturnType<typeof load074>;
  let wc: Awaited<ReturnType<typeof worstCase>>;
  try {
    L = load074(bench);
    wc = await worstCase(L, loadPriceTable(deps.pricesFile), sourceFor);
  } catch (e) {
    return (deps.err(`[verify-074] refusing: ${(e as Error).message}`), 1);
  }
  const per = (arm: Arm, only?: UnitPath) => L.occ.filter((o) => o.arm === arm && (!only || o.unitPath === only)).length;
  const reviewsAll = chunkReviews(L.occ, () => true);
  const expected = expectedUSD(wc.verifyCalls, wc.judgeReviews);
  deps.log(`074 units ${L.units} (complete ${L.complete}; paths valid ${L.paths.valid}, invalid ${L.paths.invalid}, empty ${L.paths.empty}) · successful units A ${L.successes.A}, E ${L.successes.E} (empty-first A ${L.successesEmpty.A}, E ${L.successesEmpty.E})`);
  deps.log(`findings: A ${per("A")}, E ${per("E")} (empty-first A ${per("A", "empty")}, E ${per("E", "empty")}) · PRs with findings ${new Set(L.occ.map((o) => o.pull)).size} · distinct verifier requests ${wc.verifyCalls} · judge reviews (arm, draw, chunk): A ${reviewsAll.filter((r) => r.arm === "A").length}, E ${reviewsAll.filter((r) => r.arm === "E").length}`);
  deps.log(`pricing: worst-case reservation (first requests, max_tokens in full) verifier $${wc.verifyUSD.toFixed(4)} + judge $${wc.judgeUSD.toFixed(4)} (if every finding is kept) · expected $${expected.toFixed(4)} (${wc.verifyCalls} × $${MEAN_VERIFY_USD} + ${wc.judgeReviews} × $${MEAN_JUDGE_USD}; limit $${EXPECTED_CAP_USD.toFixed(2)})`);
  if (mode === "check") return 0;

  if (expected > EXPECTED_CAP_USD) return (deps.err(`[verify-074] refusing: expected cost $${expected.toFixed(4)} exceeds $${EXPECTED_CAP_USD.toFixed(2)}`), 1);
  const freeze = (deps.freezeCheck ?? freezeCheck075)();
  if (!freeze.ok) return (deps.err(`[verify-074] refusing: ${freeze.why}`), 1);
  const caps = capsFromEnv(deps.env);
  if (caps.runUSD < JOB_CAP_USD) return (deps.err(`[verify-074] refusing: set TRACEHOUND_BUDGET_RUN_USD=${JOB_CAP_USD}`), 1);
  if (!deps.client && !deps.env.NEBIUS_API_KEY) return (deps.err("[verify-074] NEBIUS_API_KEY is not set"), 1);
  const dir = outDir(bench);
  try {
    mkdirSync(dir);
  } catch {
    return (deps.err(`[verify-074] refusing: ${dir} exists`), 1);
  }
  const ledger = new SpendLedger(join(deps.stateDir, "spend.jsonl"));
  const ledgerStartUSD = ledger.totalUSD();
  const budget = new Budget({ runUSD: JOB_CAP_USD, totalUSD: Math.min(caps.totalUSD, ledgerStartUSD + JOB_CAP_USD) }, ledgerStartUSD);
  const inner =
    deps.client ??
    new TokenFactoryClient({ apiKey: deps.env.NEBIUS_API_KEY!, baseUrl: deps.env.NEBIUS_BASE_URL, prices: loadPriceTable(deps.pricesFile), budget, ledger, cache: new ResponseCache(join(deps.stateDir, "cache")), readCache: true, timeoutMs: 600_000, ...(deps.fetch && { fetch: deps.fetch }) });
  // LlmJudge turns every error into JUDGE_FAILED: a cap refusal or a refused request is recorded here and stops the job
  const halt: { err: Error | null } = { err: null };
  const guarded = guardClient(inner, (e) => (halt.err ??= e));
  const client: ChatClient = {
    chat: async (request, meta) => {
      try {
        return await guarded.chat(request, meta);
      } catch (e) {
        if (e instanceof BudgetExceededError) halt.err ??= e;
        throw e;
      }
    },
  };
  const run = { decision: DECISION, head: freeze.head, source074: outDir074(bench), verifier: { ...VERIFY_OPTS, version: "verify-ctx-v1" }, judge: JUDGE, ledgerStartUSD, caps: budget.caps, pricing: { ...wc, expectedUSD: expected }, startedAt: new Date().toISOString(), finishedAt: null as string | null, status: "running", stage: "verify", error: null as string | null, spendUSD: 0, emptyFirstUnits: L.paths.empty };
  const save = () => {
    run.spendUSD = budget.runSpent;
    writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 1) + "\n");
  };
  save();
  writeFileSync(join(dir, "occurrences.json"), JSON.stringify(L.occ, null, 1) + "\n");
  mkdirSync(join(dir, "verdicts"));
  mkdirSync(join(dir, "scores"));
  const verdicts = new Map<string, CtxVerifiedComment[]>();
  const scores: ScoreRec[] = [];
  let reviews: ReviewRec[] = [];
  try {
    // 1. the verifier: each distinct finding once per PR
    const distinct = [...distinctFindings(L.occ).entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));
    for (const [k, [pull, findings]] of distinct.entries()) {
      const p = L.pulls.get(pull)!;
      const header = { pr_title: p.input.title, ...(p.input.number !== undefined && { pr_number: p.input.number }) };
      const v: CtxVerifiedReview = await verifyReviewWithContext(client, p.input, { ...header, comments: findings }, { source: sourceFor(p.gitDir, p.head), head: p.head }, VERIFY_OPTS);
      if (halt.err) throw halt.err;
      verdicts.set(pull, v.comments);
      writeFileSync(join(dir, "verdicts", `${p.repo}_${p.name}.json`), JSON.stringify({ pull, ...v }, null, 1) + "\n");
      save();
      deps.err(`[verify-074] verified PR ${k + 1}/${distinct.length} · spend $${budget.runSpent.toFixed(4)}`);
    }
    // 2. one judge per (arm, draw, chunk) review of the verifier-kept findings, one scoreRepo call each
    const keptOf = (o: Occ) => {
      const c = verdicts.get(o.pull)?.find((x) => findingKey(x) === o.key);
      return !!c && isKept(c);
    };
    reviews = chunkReviews(L.occ, keptOf);
    writeFileSync(join(dir, "reviews.json"), JSON.stringify(reviews, null, 1) + "\n");
    run.stage = "judge";
    save();
    for (const [k, r] of reviews.entries()) {
      const p = L.pulls.get(r.pull)!;
      const golden = GoldenFile.parse(readJson(inputPaths(bench, "dev", r.repo).golden));
      const lj = new LlmJudge(client, { model: JUDGE.model, reasoning: JUDGE.reasoning });
      const review: PullReview = { pr_title: p.input.title, comments: r.comments, ...(p.input.number !== undefined && { pr_number: p.input.number }) };
      const result = await scoreRepo({ golden, reviews: [{ file: r.file, review }], judges: [lj], concurrency: 1 });
      if (halt.err) throw halt.err;
      const d = result.detail[0];
      if (result.detail.length !== 1 || !d) throw new Error(`${reviewId(r)}: the review maps to no golden entry`);
      const rec: ScoreRec = { arm: r.arm, draw: r.draw, chunk: r.chunk, costUSD: result.usage.costUSD, status: d.status, severities: d.golden.map((g) => g.severity), matched: d.comments.map((c) => c.matched) };
      scores.push(rec);
      writeFileSync(join(dir, "scores", `${r.arm}-d${r.draw}-${r.chunk.replace(/[/#]/g, "_")}.json`), JSON.stringify({ ...rec, judge: lj.name, counts: result.counts, usage: result.usage, detail: d }, null, 1) + "\n");
      save();
      deps.err(`[verify-074] judged review ${k + 1}/${reviews.length} · spend $${budget.runSpent.toFixed(4)}`);
    }
    run.status = "complete";
  } catch (e) {
    run.status = e instanceof BudgetExceededError ? "stopped-at-cap" : "failed";
    run.error = `${(e as Error).name}: ${(e as Error).message}`;
  }
  run.finishedAt = new Date().toISOString();
  save();
  const r = analyze075(L.occ, reviews, verdicts, scores, run.status);
  for (const l of formatReport(r, budget.runSpent, L.paths.empty)) deps.log(l);
  return run.status === "complete" ? 0 : run.status === "stopped-at-cap" ? 2 : 3;
}

/** The tables and the gate from the records alone. */
export function reportFromRecords(dir: string): string[] {
  const run = readJson<{ status: string; spendUSD: number; emptyFirstUnits: number }>(join(dir, "run.json"));
  const occ = readJson<Occ[]>(join(dir, "occurrences.json"));
  const reviews = existsSync(join(dir, "reviews.json")) ? readJson<ReviewRec[]>(join(dir, "reviews.json")) : [];
  const verdicts = new Map<string, CtxVerifiedComment[]>();
  for (const f of readdirSync(join(dir, "verdicts")).filter((x) => x.endsWith(".json")).sort()) {
    const v = readJson<{ pull: string; comments: CtxVerifiedComment[] }>(join(dir, "verdicts", f));
    verdicts.set(v.pull, v.comments);
  }
  const scores = readdirSync(join(dir, "scores"))
    .filter((x) => x.endsWith(".json"))
    .sort()
    .map((f) => {
      const s = readJson<ScoreRec>(join(dir, "scores", f));
      return { arm: s.arm, draw: s.draw, chunk: s.chunk, costUSD: s.costUSD, status: s.status, severities: s.severities, matched: s.matched };
    });
  return formatReport(analyze075(occ, reviews, verdicts, scores, run.status), run.spendUSD, run.emptyFirstUnits);
}

if (import.meta.main) {
  const mode = process.argv[2];
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  const deps: Deps = { bench, stateDir: join(REPO_ROOT, ".tracehound"), pricesFile: join(REPO_ROOT, "config/prices.json"), env: process.env, log: (l) => console.log(l), err: (l) => console.error(l) };
  if (mode === "report") {
    for (const l of reportFromRecords(outDir(bench))) console.log(l);
  } else if (mode === "check" || mode === "run") {
    try {
      if (mode === "run" && !process.env.NEBIUS_API_KEY) process.loadEnvFile(join(REPO_ROOT, ".env"));
    } catch {
      // runJob reports the missing key
    }
    process.exitCode = await runJob(mode, deps);
  } else {
    console.error("usage: verify-074.ts check|run|report [--bench <dir>]");
    process.exitCode = 1;
  }
}
