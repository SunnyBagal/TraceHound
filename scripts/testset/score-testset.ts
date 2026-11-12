#!/usr/bin/env node
/**
 * score-testset.ts (B2): the Track B tables from goldens, each tool's neutral reviews and its judge detail.
 *
 *   node scripts/testset/score-testset.ts --side dev --goldens <goldens.json> --policy <policy.json>
 *     --tool <name>=<reviews dir> … [--judge <name>=<bench score --detail file> …] [--judge-x1 <name>=<detail> …]
 *     [--status <name>=<json> …] [--records <name>=<run-tracehound out dir> …] [--handcheck <handcheck.json>]
 *     --out <summary.json> [--heldout-ok]
 *
 * Per tool (docs/eval/ts-protocol.md §4):
 * - bugs caught K of the N bug cases (Wilson 95%, no continuity correction), completed bug and clean reviews n and m,
 *   and K of n; a catch is the judge matching any comment to the case's one golden (G1: any primary/alternate target),
 *   counted once per case; with --handcheck, the hand-check's decisions replace the judge's for every (tool, case);
 * - comments per attempted and per completed PR (mean, median), clean-case comments, location hits (±10 lines);
 * - cost per attempted PR from --records (every attempt's ledger delta).
 * Judge evidence is bound, never assumed: without --handcheck, every completed bug case needs its entry in the tool's
 * judge detail, and the judged comments must be that tool's review comments, in order (the same check as
 * handcheck-sheet.ts). A missing entry or a mismatch refuses the run (exit 2) instead of becoming a scored miss.
 * JUDGE_FAILED is counted and is never a catch. --judge-x1, when given, is bound the same way. Every completed case
 * needs its review file in every mode. With --handcheck (resolve's output), every completed bug case's current review
 * must be in its `reviewed` list with the same sha256, and every decision must be bound to a completed case's current
 * review; otherwise refuse: no catch stands without the review that was scored.
 * The protocol's pending choices (§13) apply only through --policy (kit.ts POLICY_CHOICES, with who approved them):
 * official_attempt (first | last record of a rerun case), failed_case and unstarted_case (miss | no-review), and
 * no_review_in_pairs (exclude | not-caught). Status: --status (completed | no-review | miss) > --records > a review
 * file exists → completed, else no-review. A case with more than two runner records (one rerun, 076a §13.3) refuses. Pairs: every pair of tools, exact two-sided sign test p (no α, no verdict).
 * stdout: counts only. --out: the same counts as JSON, with the policy. Never overwrites.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, locationHit, mean, median, pairs, readGoldens, readJson, readPolicy, readReviews, RefusalError, sha256, signTest, wilson, writeNew,
  type GoldenCase, type Policy, type Review } from "./kit.ts";

export type Status = "completed" | "no-review" | "miss";
export interface HandCheck { decisions: { tool: string; case: string; caught: boolean; review_sha256?: string }[]; reviewed: { tool: string; case: string; review_sha256: string }[];
  /** resolve's guess counts (decision 076c item 7) */
  guess?: { items: number; guessed: number; unsure: number; right: number; tools: number; commonestToolItems: number } }
type JudgeEntry = { verdict: boolean | "judge-failed"; comments: { path: string; line: number | null; body: string }[] };
interface Detail { detail?: { prTitle: string; status: string; comments: { path: string; line: number | null; body: string; matched: string | null }[] }[] }

/** Judge results by case id: the catch (matched G1), or "judge-failed", with the comments the judge saw. */
export function judgeEntries(detailFile: string, cases: GoldenCase[]): Map<string, JudgeEntry> {
  const d = readJson(detailFile) as Detail;
  if (!Array.isArray(d.detail)) throw new RefusalError(`${detailFile} is not a bench score --detail file`);
  const byTitle = new Map(cases.map((c) => [c.pr_title, c.case]));
  const out = new Map<string, JudgeEntry>();
  for (const p of d.detail) {
    const id = byTitle.get(p.prTitle);
    if (!id) continue;
    if (out.has(id)) throw new RefusalError(`${detailFile}: two judged entries for one PR title`);
    out.set(id, { verdict: p.status !== "SCORED" ? "judge-failed" : p.comments.some((c) => c.matched === "G1"),
      comments: p.comments.map((c) => ({ path: c.path, line: c.line, body: c.body })) });
  }
  return out;
}

interface RecordInfo { status: Status; costUSD: number | null }
export function readRecords(dir: string, cases: string[], policy: Policy): Map<string, RecordInfo> {
  const out = new Map<string, RecordInfo>();
  const names = fs.readdirSync(dir);
  for (const id of cases) {
    // <case>.json, then reruns <case>.r2.json …; which one is official is a policy choice; cost counts every attempt
    const rank = (f: string) => { const m = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.r(\\d+))?\\.json$`).exec(f); return m ? Number(m[1] ?? 1) : null; };
    const files = names.filter((f) => rank(f) !== null).sort((a, b) => rank(a)! - rank(b)!).map((f) => path.join(dir, f));
    if (!files.length) continue;
    // 076a §13.3 allows one rerun: <case>.json and <case>.r2.json at most
    if (files.length > 2 || files.some((f) => (rank(path.basename(f)) ?? 0) > 2)) {
      throw new RefusalError(`${id}: ${files.length} runner records (decision 076a allows one rerun: <case>.json and <case>.r2.json)`);
    }
    const official = readJson(policy.official_attempt === "first" ? files[0]! : files.at(-1)!) as { status?: string };
    const cost = files.reduce((s, f) => s + ((readJson(f) as { usage?: { ledger?: { costUSD?: number } | null } }).usage?.ledger?.costUSD ?? 0), 0);
    out.set(id, { status: official.status === "ok" ? "completed" : policy.failed_case as Status, costUSD: cost });
  }
  return out;
}

export interface ToolScore {
  attempted: number; bugCases: number; cleanCases: number;
  caught: number; caughtWilson: [number, number] | null;
  completedBug: number; completedClean: number; noReview: number; misses: number; judgeFailed: number;
  caughtOfCompleted: string; caughtOfCompletedWilson: [number, number] | null;
  caughtX1: number | null; handchecked: boolean;
  comments: { total: number; perAttempted: { mean: number | null; median: number | null }; perCompleted: { mean: number | null; median: number | null }; clean: number };
  locationHits: number;
  costUSD: { total: number; perAttemptedMean: number | null; median: number | null; max: number | null } | null;
}

const sameComments = (a: { path: string; line: number | null; body: string }[], b: { path: string; line: number | null; body: string }[]) =>
  a.length === b.length && a.every((c, i) => c.path === b[i]!.path && c.line === b[i]!.line && c.body === b[i]!.body);

export function score(o: {
  cases: GoldenCase[]; reviews: Map<string, Map<string, Review>>; judge: Map<string, Map<string, JudgeEntry>>;
  judgeX1: Map<string, Map<string, JudgeEntry>>; status: Map<string, Map<string, Status>>;
  records: Map<string, Map<string, RecordInfo>>; policy: Policy;
  /** resolve's output (handcheck-sheet.ts): decisions and the reviews the sheet considered, bound by sha256 */
  handcheck: HandCheck | null;
  /** sha256 of each tool's review file, by case */
  reviewSha: Map<string, Map<string, string>>;
}): { tools: Record<string, ToolScore>; pairs: { a: string; b: string; n: number; onlyA: number; onlyB: number; p: number }[]; incomplete: string[] } {
  const tools: Record<string, ToolScore> = {};
  const caughtBy = new Map<string, Map<string, boolean>>();
  const statuses = new Map<string, Map<string, Status>>();
  const incomplete: string[] = [];
  const bug = o.cases.filter((c) => c.label === "bug");
  for (const [tool, reviews] of o.reviews) {
    const st = new Map<string, Status>();
    const rec = o.records.get(tool);
    for (const c of o.cases) {
      st.set(c.case, o.status.get(tool)?.get(c.case) ?? (rec ? rec.get(c.case)?.status ?? o.policy.unstarted_case as Status
        : reviews.has(c.case) ? "completed" : "no-review"));
    }
    statuses.set(tool, st);
    const completedBug = bug.filter((c) => st.get(c.case) === "completed");
    // a completed case is scored from its review file, whichever way catches are decided
    const missingReview = o.cases.filter((c) => st.get(c.case) === "completed" && !reviews.has(c.case)).length;
    if (missingReview) incomplete.push(`${tool}: ${missingReview} completed case(s) have no review file`);
    if (o.handcheck) {
      // the hand-check must have considered exactly the reviews scored now, and no catch stands without one
      const sha = o.reviewSha.get(tool) ?? new Map<string, string>();
      const seen = (id: string) => o.handcheck!.reviewed.find((r) => r.tool === tool && r.case === id);
      const uncovered = completedBug.filter((c) => reviews.has(c.case) && seen(c.case)?.review_sha256 !== sha.get(c.case)).length;
      if (uncovered) incomplete.push(`${tool}: the hand-check did not consider the current review of ${uncovered} completed bug case(s)`);
      const unbound = o.handcheck.decisions.filter((d) => d.tool === tool && (st.get(d.case) !== "completed" || !reviews.has(d.case)
        || d.review_sha256 !== sha.get(d.case))).length;
      if (unbound) incomplete.push(`${tool}: ${unbound} hand-check decision(s) are not bound to a completed case's current review`);
    }
    // bind judge evidence to the reviews actually scored
    for (const [label, m] of [["judge", o.handcheck ? undefined : o.judge.get(tool)], ["judge-x1", o.judgeX1.get(tool)]] as const) {
      if (!m) continue;
      const missing = completedBug.filter((c) => reviews.has(c.case) && !m.has(c.case)).length;
      const mismatch = completedBug.filter((c) => m.has(c.case) && reviews.has(c.case) && m.get(c.case)!.verdict !== "judge-failed"
        && !sameComments(m.get(c.case)!.comments, reviews.get(c.case)!.comments)).length;
      if (missing) incomplete.push(`${tool}: ${label} detail lacks ${missing} completed bug case(s)`);
      if (mismatch) incomplete.push(`${tool}: ${label} judged other comments than the review for ${mismatch} case(s)`);
    }
    const judged = o.judge.get(tool);
    const caught = new Map<string, boolean>();
    let judgeFailed = 0;
    for (const c of bug) {
      let k = false;
      if (st.get(c.case) === "completed") {
        if (o.handcheck) k = o.handcheck.decisions.some((h) => h.tool === tool && h.case === c.case && h.caught);
        else {
          const j = judged?.get(c.case)?.verdict;
          if (j === "judge-failed") judgeFailed++;
          k = j === true;
        }
      }
      caught.set(c.case, k);
    }
    caughtBy.set(tool, caught);
    const comments = (id: string) => (st.get(id) === "completed" ? reviews.get(id)?.comments ?? [] : []);
    const per = o.cases.map((c) => comments(c.case).length);
    const completed = o.cases.filter((c) => st.get(c.case) === "completed");
    const K = [...caught.values()].filter(Boolean).length;
    const n = completedBug.length;
    const x1 = o.judgeX1.get(tool);
    const costs = rec ? o.cases.map((c) => rec.get(c.case)?.costUSD ?? 0) : null;
    tools[tool] = {
      attempted: o.cases.length, bugCases: bug.length, cleanCases: o.cases.length - bug.length,
      caught: K, caughtWilson: wilson(K, bug.length),
      completedBug: n, completedClean: completed.length - n,
      noReview: [...st.values()].filter((s) => s === "no-review").length, misses: [...st.values()].filter((s) => s === "miss").length,
      judgeFailed, caughtOfCompleted: `${K}/${n}`, caughtOfCompletedWilson: wilson(K, n),
      caughtX1: x1 ? completedBug.filter((c) => x1.get(c.case)?.verdict === true).length : null,
      handchecked: !!o.handcheck,
      comments: { total: per.reduce((a, b) => a + b, 0), perAttempted: { mean: mean(per), median: median(per) },
        perCompleted: { mean: mean(completed.map((c) => comments(c.case).length)), median: median(completed.map((c) => comments(c.case).length)) },
        clean: o.cases.filter((c) => c.label === "clean").reduce((s, c) => s + comments(c.case).length, 0) },
      locationHits: bug.filter((c) => locationHit(comments(c.case), c.targets)).length,
      costUSD: costs ? { total: costs.reduce((a, b) => a + b, 0), perAttemptedMean: mean(costs), median: median(costs), max: Math.max(...costs) } : null,
    };
  }
  const names = [...o.reviews.keys()];
  const out: { a: string; b: string; n: number; onlyA: number; onlyB: number; p: number }[] = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [A, B] = [names[i]!, names[j]!];
    const paired = o.policy.no_review_in_pairs === "not-caught" ? bug
      : bug.filter((c) => statuses.get(A)!.get(c.case) !== "no-review" && statuses.get(B)!.get(c.case) !== "no-review");
    const onlyA = paired.filter((c) => caughtBy.get(A)!.get(c.case) && !caughtBy.get(B)!.get(c.case)).length;
    const onlyB = paired.filter((c) => caughtBy.get(B)!.get(c.case) && !caughtBy.get(A)!.get(c.case)).length;
    out.push({ a: A, b: B, n: paired.length, onlyA, onlyB, p: signTest(onlyA, onlyB) });
  }
  return { tools, pairs: out, incomplete };
}

const pct = (x: [number, number] | null) => (x ? `${(x[0] * 100).toFixed(1)}–${(x[1] * 100).toFixed(1)}%` : "n/a");
const num = (x: number | null, d = 2) => (x === null ? "n/a" : x.toFixed(d));

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, goldens: { type: "string" }, policy: { type: "string" },
      tool: { type: "string", multiple: true }, judge: { type: "string", multiple: true }, "judge-x1": { type: "string", multiple: true },
      status: { type: "string", multiple: true }, records: { type: "string", multiple: true }, handcheck: { type: "string" }, out: { type: "string" },
    } });
    const tools = pairs(values.tool, "--tool"), judge = pairs(values.judge, "--judge"), x1 = pairs(values["judge-x1"], "--judge-x1");
    const status = pairs(values.status, "--status"), records = pairs(values.records, "--records");
    const side = checkSide(values.side, values["heldout-ok"]!, [values.goldens, values.policy, values.handcheck, values.out,
      ...tools.values(), ...judge.values(), ...x1.values(), ...status.values(), ...records.values()]);
    if (!values.goldens || !tools.size || !values.out) throw new RefusalError("usage: score-testset.ts --side dev --goldens <file> --policy <file> --tool name=dir … --out <file>");
    const policy = readPolicy(values.policy, ["no_review_in_pairs", ...(records.size ? ["official_attempt", "failed_case", "unstarted_case"] as const : [])]);
    if (fs.existsSync(values.out)) throw new RefusalError(`${values.out} exists; never overwritten`);
    for (const m of [judge, x1, status, records]) for (const k of m.keys()) if (!tools.has(k)) throw new RefusalError(`${k} is not a --tool`);
    if (!values.handcheck && judge.size !== tools.size) throw new RefusalError("every --tool needs a --judge detail file (or pass --handcheck)");
    const g = readGoldens(values.goldens);
    if (g.side !== side) throw new RefusalError(`goldens are for side ${g.side}, not ${side}`);
    const ids = g.cases.map((c) => c.case);
    const toStatus = (file: string) => {
      const v = readJson(file) as Record<string, string>;
      return new Map(Object.entries(v).map(([k, s]) => {
        if (!["completed", "no-review", "miss"].includes(s)) throw new RefusalError(`${file}: ${k} has status ${s}`);
        return [k, s as Status];
      }));
    };
    const hc = values.handcheck ? readJson(values.handcheck) as HandCheck : null;
    if (hc && (!Array.isArray(hc.decisions) || !Array.isArray(hc.reviewed))) {
      throw new RefusalError("--handcheck must be handcheck-sheet.ts resolve output ({decisions, reviewed}, bound to review sha256)");
    }
    const r = score({
      cases: g.cases, policy,
      reviews: new Map([...tools].map(([t, d]) => [t, readReviews(d, ids)])),
      reviewSha: new Map([...tools].map(([t, d]) => [t, new Map(ids.filter((id) => fs.existsSync(path.join(d, `${id}.json`)))
        .map((id) => [id, sha256(fs.readFileSync(path.join(d, `${id}.json`)))]))])),
      judge: new Map([...judge].map(([t, f]) => [t, judgeEntries(f, g.cases)])),
      judgeX1: new Map([...x1].map(([t, f]) => [t, judgeEntries(f, g.cases)])),
      status: new Map([...status].map(([t, f]) => [t, toStatus(f)])),
      records: new Map([...records].map(([t, d]) => [t, readRecords(d, ids, policy)])),
      handcheck: hc,
    });
    if (r.incomplete.length) {
      for (const m of r.incomplete) log(`incomplete: ${m}`);
      log("refused: judge evidence is incomplete; nothing written (an absent judgement is never a scored miss)");
      return 2;
    }
    writeNew(values.out, JSON.stringify({ v: 1, side, policy, policySha256: sha256(fs.readFileSync(values.policy!)), tools: r.tools, pairs: r.pairs,
      ...(hc?.guess ? { handcheckGuess: hc.guess } : {}) }, null, 1) + "\n");
    for (const [t, s] of Object.entries(r.tools)) {
      log(`${t}: caught ${s.caught}/${s.bugCases} (Wilson ${pct(s.caughtWilson)})${s.handchecked ? " [hand-checked]" : ""} · completed bug ${s.completedBug}/${s.bugCases}, clean ${s.completedClean}/${s.cleanCases}`
        + ` · caught of completed ${s.caughtOfCompleted} · no-review ${s.noReview} · miss ${s.misses} · judge-failed ${s.judgeFailed}${s.caughtX1 === null ? "" : ` · x1 caught ${s.caughtX1}`}`);
      log(`${t}: comments ${s.comments.total} · per attempted PR mean ${num(s.comments.perAttempted.mean)} median ${num(s.comments.perAttempted.median)}`
        + ` · per completed PR mean ${num(s.comments.perCompleted.mean)} median ${num(s.comments.perCompleted.median)} · on clean cases ${s.comments.clean}`
        + ` · location hits ${s.locationHits}/${s.bugCases}${s.costUSD ? ` · cost $${s.costUSD.total.toFixed(4)} (mean $${num(s.costUSD.perAttemptedMean, 4)}, median $${num(s.costUSD.median, 4)}, max $${num(s.costUSD.max, 4)})` : ""}`);
    }
    for (const p of r.pairs) log(`pair ${p.a} vs ${p.b}: paired n ${p.n} · ${p.a} only ${p.onlyA} · ${p.b} only ${p.onlyB} · exact two-sided p ${p.p.toFixed(4)}`);
    if (hc?.guess) {
      const g = hc.guess;
      log(`hand-check guess: right ${g.right} of ${g.guessed} guessed (${g.unsure} unsure, ${g.items} items, ${g.tools} tools; uniform chance 1/${g.tools}; always naming the commonest tool: ${g.commonestToolItems} of ${g.items})`);
    }
    log(`policy: approved by ${policy.approved.by} on ${policy.approved.on} (${policy.approved.ref})`);
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
