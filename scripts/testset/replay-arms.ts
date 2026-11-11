#!/usr/bin/env node
/**
 * replay-arms.ts (B1): rebuild three reviewer arms from one run-tracehound.ts record's lineage, with no model call.
 *
 *   node scripts/testset/replay-arms.ts --records <record.json|dir>[,<more>] --out <dir> [--max-comments 15]
 *
 * Arms, each from the record's own stage outputs, then the Action's post-pipeline steps (prepareReview with learn off
 * and pool cap order): the contract dedupe (dropContractDuplicates, the same function), then the first --max-comments
 * in pool order.
 *   A0 pool-verify-v1  the verifier's kept file (what the Action posts; checked against the record's `comments`)
 *   A1 pool-raw        the pool (review-diff-v1 findings, then ctx-only findings), no verifier
 *   A2 review-diff-v1  the diff reviewer's findings alone (partial when chunks failed, as decision 068 counts them)
 * Contract units: when the record says contracts emitted findings (`review.contracts.emitted`: inline, then body; the
 * overflow is only a count in the product), every available arm ends with them, as the product's review would; they are
 * outside the 15-comment model cap. A0's identity check covers the model part.
 * No arm is assumed to contain another: the 15-comment cap is applied to each arm's own order, so A0 can hold findings
 * that A1's first 15 do not (the count is reported as `a0NotInA1`).
 *
 * Output: <out>/<arm name>/<case>.json in the neutral review format (decision 054; `tracehound bench score` reads it) and
 * <out>/replay.json with counts only. Never overwrites a file. stdout: counts only, no finding text.
 * Exit codes: 0 ok, 1 an A0 replay differs from the posted comments (files are still written), 2 refused.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { dropContractDuplicates, type Finding } from "../../packages/action/src/action.ts";

export const ARMS = { A0: "pool-verify-v1", A1: "pool-raw", A2: "review-diff-v1" } as const;
export type Arm = keyof typeof ARMS;
export const MAX_COMMENTS = 15;

export interface ArmResult {
  status: "ok" | "unavailable";
  reason?: string;
  /** findings before the contract dedupe and the cap */
  candidates: number;
  /** model comments after the dedupe and the cap, then every emitted contract unit (record.review.contracts.emitted) */
  comments: Finding[];
  /** how many of `comments` are model comments (the rest are contract units) */
  model: number;
}
export interface Replay {
  case: string;
  pr_title: string;
  pr_number?: number;
  arms: Record<Arm, ArmResult>;
  /** which contract findings the dedupe used: the ones prepareReview used, the raw contracts result, or none */
  contractsSource: "prepared" | "lineage" | "none";
  /** A0 equals the record's posted `comments`; null when the record has no prepared review to compare with */
  a0MatchesPosted: boolean | null;
  /** A0 model comments that are not among A1's model comments (A1 ⊇ A0 does not hold in general) */
  a0NotInA1: number | null;
  /** contract units appended to every available arm */
  contractUnits: number;
}

export class RefusalError extends Error {}

/** A case id becomes a file name under --out: letters, digits, dot, dash, underscore, and never "." or "..". */
export const CASE_ID = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

const key = (f: Finding) => JSON.stringify([f.path, f.line, f.body]);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** The pipeline's own finding check (pipeline.ts `findings`): null when the list is missing or any item is invalid. */
function findingList(v: unknown): Finding[] | null {
  if (!Array.isArray(v)) return null;
  const out: Finding[] = [];
  for (const item of v) {
    const f = obj(item);
    if (!f || typeof f.path !== "string" || !f.path.trim() || typeof f.body !== "string" || !f.body.trim()
      || !(f.line === null || (typeof f.line === "number" && Number.isSafeInteger(f.line) && f.line > 0))) return null;
    out.push({ path: f.path, line: f.line, body: f.body });
  }
  return out;
}

export function replayArms(record: unknown, maxComments = MAX_COMMENTS): Replay {
  const r = obj(record);
  if (!r || typeof r.case !== "string") throw new RefusalError("not a run-tracehound.ts record");
  if (!CASE_ID.test(r.case)) throw new RefusalError("a record's case id is not a plain file name");
  const lineage = obj(r.lineage);
  if (!lineage || lineage.v !== 1) throw new RefusalError(`${r.case}: record has no lineage (written by runner < 2)`);
  const review = obj(r.review);
  const preparedContracts = obj(review?.contracts)?.findings;
  const rawContracts = obj(lineage.contracts)?.findings;
  const contractsSource: Replay["contractsSource"] = Array.isArray(preparedContracts) ? "prepared" : Array.isArray(rawContracts) ? "lineage" : "none";
  const contracts = (contractsSource === "prepared" ? preparedContracts : contractsSource === "lineage" ? rawContracts : []) as
    { path: string; line: number | null }[];
  const emitted = obj(review?.contracts)?.emitted;
  const units = emitted === null || emitted === undefined ? [] : (() => {
    const e = obj(emitted);
    const inline = findingList(e?.inline), body = findingList(e?.body);
    if (!inline || !body) throw new RefusalError(`${r.case}: review.contracts.emitted is not {inline, body} findings`);
    return [...inline, ...body];
  })();
  const finish = (list: Finding[] | null, missing: string): ArmResult => {
    if (!list) return { status: "unavailable", reason: missing, candidates: 0, comments: [], model: 0 };
    const capped = dropContractDuplicates(list, list.map(() => null), contracts).comments.slice(0, maxComments);
    return { status: "ok", candidates: list.length, comments: [...capped, ...units], model: capped.length };
  };
  const kept = findingList(obj(obj(lineage["verify-ctx-v1"])?.kept)?.comments);
  // A0 is what the Action would post, so only an official `ok` case has one: the runner posts nothing for a failed or
  // cap case even when a review was prepared. A completed run with no prepared review had nothing to post (A0 empty).
  const a0Available = r.status === "ok";
  const arms: Record<Arm, ArmResult> = {
    A0: a0Available ? finish(kept ?? (review === null ? [] : null), "no valid verifier kept file in the lineage")
      : { status: "unavailable", reason: `run status ${String(r.status)}: the Action posts nothing`, candidates: 0, comments: [], model: 0 },
    A1: finish(findingList(obj(lineage.pool)?.findings), "no pool in the lineage (a reviewer failed)"),
    A2: finish(findingList(obj(lineage["review-diff-v1"])?.comments), "no valid review-diff-v1 output in the lineage"),
  };
  const posted = findingList(r.comments);
  const a0MatchesPosted = review === null || arms.A0.status !== "ok" || !posted ? null
    : posted.length === arms.A0.model && posted.every((f, i) => key(f) === key(arms.A0.comments[i]!));
  const a1Keys = new Set(arms.A1.comments.slice(0, arms.A1.model).map(key));
  const a0NotInA1 = arms.A0.status === "ok" && arms.A1.status === "ok" ? arms.A0.comments.slice(0, arms.A0.model).filter((f) => !a1Keys.has(key(f))).length : null;
  return {
    case: r.case, pr_title: typeof r.pr_title === "string" ? r.pr_title : "",
    ...(typeof r.pr_number === "number" && { pr_number: r.pr_number }),
    arms, contractsSource, a0MatchesPosted, a0NotInA1, contractUnits: units.length,
  };
}

function recordFiles(spec: string): string[] {
  return spec.split(",").filter(Boolean).flatMap((p) => {
    if (!fs.existsSync(p)) throw new RefusalError(`no such file or directory: ${p}`);
    if (!fs.statSync(p).isDirectory()) return [p];
    // the runner writes <case>.json and, with --rerun, <case>.r2.json …; replay every record file it finds
    return fs.readdirSync(p).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(p, f));
  });
}

export function main(argv: string[], log: (line: string) => void = console.log): number {
  let values: { records?: string; out?: string; "max-comments": string };
  try {
    ({ values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      records: { type: "string" }, out: { type: "string" }, "max-comments": { type: "string", default: String(MAX_COMMENTS) },
    } }) as { values: typeof values });
  } catch (e) {
    log(`refused: ${(e as Error).message}`);
    return 2;
  }
  const max = Number(values["max-comments"]);
  if (!values.records || !values.out || !Number.isSafeInteger(max) || max < 1) {
    log("refused: usage: replay-arms.ts --records <file|dir>[,...] --out <dir> [--max-comments 15]");
    return 2;
  }
  let replays: Replay[];
  try {
    replays = recordFiles(values.records).map((f) => replayArms(JSON.parse(fs.readFileSync(f, "utf8")), max));
  } catch (e) {
    log(`refused: ${e instanceof RefusalError ? e.message : "a record could not be read as JSON"}`);
    return 2;
  }
  const names = new Set<string>();
  for (const r of replays) {
    if (names.has(r.case)) { log(`refused: two records for ${r.case}; pass one record per case`); return 2; }
    names.add(r.case);
  }
  const targets = [path.join(values.out, "replay.json"), ...replays.flatMap((r) => Object.values(ARMS).map((name) => path.join(values.out!, name, `${r.case}.json`)))];
  const root = path.resolve(values.out) + path.sep;
  if (targets.some((t) => !path.resolve(t).startsWith(root))) { log("refused: an output path would leave --out"); return 2; }
  const existing = targets.find((t) => fs.existsSync(t));
  if (existing) { log(`refused: ${existing} exists; never overwritten (use a new --out)`); return 2; }
  const summary = [];
  let mismatch = false;
  for (const r of replays) {
    for (const [arm, name] of Object.entries(ARMS) as [Arm, string][]) {
      const a = r.arms[arm];
      if (a.status !== "ok") continue;
      const file = path.join(values.out, name, `${r.case}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ pr_title: r.pr_title, ...(r.pr_number !== undefined && { pr_number: r.pr_number }),
        comments: a.comments }, null, 1) + "\n", { flag: "wx" });
    }
    const counts = Object.fromEntries((Object.keys(ARMS) as Arm[]).map((arm) => [arm, r.arms[arm].status === "ok"
      ? { candidates: r.arms[arm].candidates, model: r.arms[arm].model, comments: r.arms[arm].comments.length } : { unavailable: r.arms[arm].reason }]));
    summary.push({ case: r.case, ...counts, contractsSource: r.contractsSource, contractUnits: r.contractUnits, a0MatchesPosted: r.a0MatchesPosted, a0NotInA1: r.a0NotInA1 });
    const show = (arm: Arm) => r.arms[arm].status === "ok" ? `${r.arms[arm].model}/${r.arms[arm].candidates}` : "n/a";
    log(`${r.case}: A0 ${show("A0")} · A1 ${show("A1")} · A2 ${show("A2")} (posted/candidates) · A0 not in A1 ${r.a0NotInA1 ?? "n/a"}`
      + ` · A0 = posted ${r.a0MatchesPosted ?? "n/a"}${r.contractUnits ? ` · + ${r.contractUnits} contract unit(s) per arm` : ""}`);
    if (r.a0MatchesPosted === false) { mismatch = true; log(`MISMATCH: ${r.case}: the A0 replay differs from the record's posted comments`); }
  }
  fs.mkdirSync(values.out, { recursive: true });
  fs.writeFileSync(path.join(values.out, "replay.json"), JSON.stringify({ v: 1, maxComments: max, arms: ARMS, cases: summary }, null, 1) + "\n", { flag: "wx" });
  log(`${replays.length} record(s) replayed -> ${values.out}`);
  return mismatch ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
