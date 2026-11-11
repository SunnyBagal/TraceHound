#!/usr/bin/env node
/**
 * score-testset.ts (B2): the Track B tables from goldens, each tool's neutral reviews and its judge detail.
 *
 *   node scripts/testset/score-testset.ts --side dev --goldens <goldens.json> --tool <name>=<reviews dir> …
 *     [--judge <name>=<bench score --detail file> …] [--judge-x1 <name>=<detail> …] [--status <name>=<json> …]
 *     [--records <name>=<run-tracehound out dir> …] [--handcheck <handcheck.json>] --out <summary.json> [--heldout-ok]
 *
 * Per tool (docs/eval/ts-protocol.md §4):
 * - bugs caught K of the N bug cases (every attempted case is in N; Wilson 95%, no continuity correction), the
 *   completed bug and clean reviews n and m, and K of n;
 * - a catch is the judge matching any comment to the case's one golden (G1: any primary/alternate target), counted once
 *   per case; with --handcheck, the hand-check's decisions replace the judge's for every (tool, case) (held-out);
 * - comments per attempted and per completed PR (mean, median), clean-case comments, location hits (±10 lines);
 * - status per case: --status (completed | no-review | miss) > --records (run-tracehound: ok → completed,
 *   failed/cap → miss) > a review file exists → completed, else no-review. A miss is a scored case with no catch;
 *   a no-review case is left out of that tool's pairs, and n says so;
 * - cost per attempted PR from --records (ledger delta per case).
 * Pairs: every pair of tools over bug cases where neither is no-review: a = caught by A only, b = by B only, the exact
 * two-sided sign test p. Unadjusted, exploratory (§4).
 * stdout: counts only. --out: the same counts as JSON. Never overwrites.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, locationHit, mean, median, pairs, readGoldens, readJson, readReviews, RefusalError, signTest, wilson, writeNew,
  type GoldenCase, type Review } from "./kit.ts";

export type Status = "completed" | "no-review" | "miss";
interface Detail { detail?: { prTitle: string; status: string; comments: { matched: string | null }[] }[] }

/** Judge catches by case id: true (matched G1), false (scored, no match) or "judge-failed". */
export function judgeCatches(detailFile: string, cases: GoldenCase[]): Map<string, boolean | "judge-failed"> {
  const d = readJson(detailFile) as Detail;
  if (!Array.isArray(d.detail)) throw new RefusalError(`${detailFile} is not a bench score --detail file`);
  const byTitle = new Map(cases.map((c) => [c.pr_title, c.case]));
  const out = new Map<string, boolean | "judge-failed">();
  for (const p of d.detail) {
    const id = byTitle.get(p.prTitle);
    if (!id) continue;
    out.set(id, p.status !== "SCORED" ? "judge-failed" : p.comments.some((c) => c.matched === "G1"));
  }
  return out;
}

interface RecordInfo { status: Status; costUSD: number | null }
export function readRecords(dir: string, cases: string[]): Map<string, RecordInfo> {
  const out = new Map<string, RecordInfo>();
  const names = fs.readdirSync(dir);
  for (const id of cases) {
    // the official result is the case's last record: <case>.json, then a permitted rerun <case>.r2.json (protocol §9);
    // cost counts every attempt
    const rank = (f: string) => { const m = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.r(\\d+))?\\.json$`).exec(f); return m ? Number(m[1] ?? 1) : null; };
    const files = names.filter((f) => rank(f) !== null).sort((a, b) => rank(a)! - rank(b)!).map((f) => path.join(dir, f));
    if (!files.length) continue;
    const r = readJson(files.at(-1)!) as { status?: string; usage?: { ledger?: { costUSD?: number } | null } };
    const cost = files.reduce((s, f) => s + ((readJson(f) as { usage?: { ledger?: { costUSD?: number } | null } }).usage?.ledger?.costUSD ?? 0), 0);
    out.set(id, { status: r.status === "ok" ? "completed" : "miss", costUSD: cost });
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

export function score(o: {
  cases: GoldenCase[]; reviews: Map<string, Map<string, Review>>; judge: Map<string, Map<string, boolean | "judge-failed">>;
  judgeX1: Map<string, Map<string, boolean | "judge-failed">>; status: Map<string, Map<string, Status>>;
  records: Map<string, Map<string, RecordInfo>>; handcheck: { tool: string; case: string; caught: boolean }[] | null;
}): { tools: Record<string, ToolScore>; pairs: { a: string; b: string; n: number; onlyA: number; onlyB: number; p: number }[]; caught: Map<string, Map<string, boolean>>; statuses: Map<string, Map<string, Status>> } {
  const tools: Record<string, ToolScore> = {};
  const caughtBy = new Map<string, Map<string, boolean>>();
  const statuses = new Map<string, Map<string, Status>>();
  const bug = o.cases.filter((c) => c.label === "bug");
  for (const [tool, reviews] of o.reviews) {
    const st = new Map<string, Status>();
    for (const c of o.cases) st.set(c.case, o.status.get(tool)?.get(c.case) ?? o.records.get(tool)?.get(c.case)?.status ?? (reviews.has(c.case) ? "completed" : "no-review"));
    statuses.set(tool, st);
    const judged = o.judge.get(tool);
    const caught = new Map<string, boolean>();
    let judgeFailed = 0;
    for (const c of bug) {
      let k = false;
      if (st.get(c.case) === "completed") {
        if (o.handcheck) k = o.handcheck.some((h) => h.tool === tool && h.case === c.case && h.caught);
        else {
          const j = judged?.get(c.case);
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
    const perCompleted = completed.map((c) => comments(c.case).length);
    const K = [...caught.values()].filter(Boolean).length;
    const n = bug.filter((c) => st.get(c.case) === "completed").length;
    const x1 = o.judgeX1.get(tool);
    const rec = o.records.get(tool);
    const costs = rec ? o.cases.map((c) => rec.get(c.case)?.costUSD ?? 0) : null;
    tools[tool] = {
      attempted: o.cases.length, bugCases: bug.length, cleanCases: o.cases.length - bug.length,
      caught: K, caughtWilson: wilson(K, bug.length),
      completedBug: n, completedClean: completed.length - n,
      noReview: [...st.values()].filter((s) => s === "no-review").length, misses: [...st.values()].filter((s) => s === "miss").length,
      judgeFailed, caughtOfCompleted: `${K}/${n}`, caughtOfCompletedWilson: wilson(K, n),
      caughtX1: x1 ? bug.filter((c) => st.get(c.case) === "completed" && x1.get(c.case) === true).length : null,
      handchecked: !!o.handcheck,
      comments: { total: per.reduce((a, b) => a + b, 0), perAttempted: { mean: mean(per), median: median(per) },
        perCompleted: { mean: mean(perCompleted), median: median(perCompleted) },
        clean: o.cases.filter((c) => c.label === "clean").reduce((s, c) => s + comments(c.case).length, 0) },
      locationHits: bug.filter((c) => locationHit(comments(c.case), c.targets)).length,
      costUSD: costs ? { total: costs.reduce((a, b) => a + b, 0), perAttemptedMean: mean(costs), median: median(costs), max: Math.max(...costs) } : null,
    };
  }
  const names = [...o.reviews.keys()];
  const out: { a: string; b: string; n: number; onlyA: number; onlyB: number; p: number }[] = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [A, B] = [names[i]!, names[j]!];
    const paired = bug.filter((c) => statuses.get(A)!.get(c.case) !== "no-review" && statuses.get(B)!.get(c.case) !== "no-review");
    const onlyA = paired.filter((c) => caughtBy.get(A)!.get(c.case) && !caughtBy.get(B)!.get(c.case)).length;
    const onlyB = paired.filter((c) => caughtBy.get(B)!.get(c.case) && !caughtBy.get(A)!.get(c.case)).length;
    out.push({ a: A, b: B, n: paired.length, onlyA, onlyB, p: signTest(onlyA, onlyB) });
  }
  return { tools, pairs: out, caught: caughtBy, statuses };
}

const pct = (x: [number, number] | null) => (x ? `${(x[0] * 100).toFixed(1)}–${(x[1] * 100).toFixed(1)}%` : "n/a");
const num = (x: number | null, d = 2) => (x === null ? "n/a" : x.toFixed(d));

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, goldens: { type: "string" },
      tool: { type: "string", multiple: true }, judge: { type: "string", multiple: true }, "judge-x1": { type: "string", multiple: true },
      status: { type: "string", multiple: true }, records: { type: "string", multiple: true }, handcheck: { type: "string" }, out: { type: "string" },
    } });
    const tools = pairs(values.tool, "--tool"), judge = pairs(values.judge, "--judge"), x1 = pairs(values["judge-x1"], "--judge-x1");
    const status = pairs(values.status, "--status"), records = pairs(values.records, "--records");
    const side = checkSide(values.side, values["heldout-ok"]!, [values.goldens, values.handcheck, values.out,
      ...tools.values(), ...judge.values(), ...x1.values(), ...status.values(), ...records.values()]);
    if (!values.goldens || !tools.size || !values.out) throw new RefusalError("usage: score-testset.ts --side dev --goldens <file> --tool name=dir … --out <file>");
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
    const hc = values.handcheck ? (readJson(values.handcheck) as { decisions?: { tool: string; case: string; caught: boolean }[] }).decisions ?? null : null;
    if (values.handcheck && !Array.isArray(hc)) throw new RefusalError("--handcheck must be {decisions: [{tool, case, caught}]}");
    const r = score({
      cases: g.cases,
      reviews: new Map([...tools].map(([t, d]) => [t, readReviews(d, ids)])),
      judge: new Map([...judge].map(([t, f]) => [t, judgeCatches(f, g.cases)])),
      judgeX1: new Map([...x1].map(([t, f]) => [t, judgeCatches(f, g.cases)])),
      status: new Map([...status].map(([t, f]) => [t, toStatus(f)])),
      records: new Map([...records].map(([t, d]) => [t, readRecords(d, ids)])),
      handcheck: hc,
    });
    writeNew(values.out, JSON.stringify({ v: 1, side, tools: r.tools, pairs: r.pairs }, null, 1) + "\n");
    for (const [t, s] of Object.entries(r.tools)) {
      log(`${t}: caught ${s.caught}/${s.bugCases} (Wilson ${pct(s.caughtWilson)})${s.handchecked ? " [hand-checked]" : ""} · completed bug ${s.completedBug}/${s.bugCases}, clean ${s.completedClean}/${s.cleanCases}`
        + ` · caught of completed ${s.caughtOfCompleted} · no-review ${s.noReview} · miss ${s.misses} · judge-failed ${s.judgeFailed}${s.caughtX1 === null ? "" : ` · x1 caught ${s.caughtX1}`}`);
      log(`${t}: comments ${s.comments.total} · per attempted PR mean ${num(s.comments.perAttempted.mean)} median ${num(s.comments.perAttempted.median)}`
        + ` · per completed PR mean ${num(s.comments.perCompleted.mean)} median ${num(s.comments.perCompleted.median)} · on clean cases ${s.comments.clean}`
        + ` · location hits ${s.locationHits}/${s.bugCases}${s.costUSD ? ` · cost $${s.costUSD.total.toFixed(4)} (mean $${num(s.costUSD.perAttemptedMean, 4)}, median $${num(s.costUSD.median, 4)}, max $${num(s.costUSD.max, 4)})` : ""}`);
    }
    for (const p of r.pairs) log(`pair ${p.a} vs ${p.b}: paired n ${p.n} · ${p.a} only ${p.onlyA} · ${p.b} only ${p.onlyB} · exact two-sided p ${p.p.toFixed(4)}`);
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
