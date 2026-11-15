#!/usr/bin/env node
/**
 * pool-reviews.ts (side track C, A/B 3: sidetrack/ab3-plan.md): merge two reviewers' reviews of the same pull
 * requests into one review per pull request. No model, no network; the rule is fixed here before any run.
 *
 *   node scripts/track-c/pool-reviews.ts --primary <dir> --second <dir> --out <dir>
 *
 * <dir> holds one neutral review file per case (decision 054: {pr_title, comments[path, line, body]}), as
 * review-case.ts writes them under <out>/reviews/. Both directories must hold the same file names.
 *
 * Rule, per case:
 * 1. Two comments are the same finding when decision 058's agreement rule holds (scripts/bench/agree-rule.ts):
 *    the same path after normalising, both lines non-null, lines within 3 of each other.
 * 2. A comment of the second reviewer that is the same finding as any comment of the primary is dropped: the
 *    primary's wording stands. Nothing is rewritten and no comment text is merged.
 * 3. Order: the primary's comments that the second also made, then the primary's other comments, then the
 *    second's remaining comments; each group in its reviewer's own order.
 * 4. At most MAX_COMMENTS comments are kept, the same cap as one reviewer alone (review-case.ts), so a pooled
 *    review cannot post more than a single review may.
 *
 * It writes <out>/<case>.json (the pooled review) and <out>/pool-counts.json (per case and in total: comments of
 * each reviewer, findings both made, comments added by the second, comments cut by the cap). Never overwrites.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { PullReview, type ReviewComment } from "../../packages/analyzer/src/bench/types.ts";
import { agrees } from "../bench/agree-rule.ts";
import { MAX_COMMENTS } from "./review-case.ts";

export const POOL_VERSION = "track-c-pool@0.1";

export interface PoolCounts {
  primary: number;
  second: number;
  /** comments of the primary that the second also made */
  both: number;
  /** comments of the second that match none of the primary's, before the cap */
  added: number;
  /** comments left out by the cap */
  cut: number;
  pooled: number;
}

export function poolReviews(primary: ReviewComment[], second: ReviewComment[], cap = MAX_COMMENTS): { comments: ReviewComment[]; counts: PoolCounts } {
  const shared = primary.filter((p) => second.some((s) => agrees(p, s)));
  const primaryOnly = primary.filter((p) => !shared.includes(p));
  const secondOnly = second.filter((s) => !primary.some((p) => agrees(p, s)));
  const all = [...shared, ...primaryOnly, ...secondOnly];
  const comments = all.slice(0, cap);
  return { comments, counts: { primary: primary.length, second: second.length, both: shared.length, added: secondOnly.length, cut: all.length - comments.length, pooled: comments.length } };
}

function main(): number {
  const { values } = parseArgs({ options: { primary: { type: "string" }, second: { type: "string" }, out: { type: "string" } } });
  if (!values.primary || !values.second || !values.out) {
    console.error("usage: pool-reviews.ts --primary <dir> --second <dir> --out <dir>");
    return 2;
  }
  const names = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "pool-counts.json").sort();
  const files = names(values.primary);
  if (files.length === 0 || files.join("\n") !== names(values.second).join("\n")) {
    console.error("the two directories must hold the same review files, and at least one");
    return 2;
  }
  if (fs.existsSync(values.out) && fs.readdirSync(values.out).length > 0) {
    console.error(`${values.out} is not empty; never overwritten`);
    return 2;
  }
  fs.mkdirSync(values.out, { recursive: true });
  const read = (dir: string, file: string) => PullReview.parse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  const cases: Record<string, PoolCounts> = {};
  const total: PoolCounts = { primary: 0, second: 0, both: 0, added: 0, cut: 0, pooled: 0 };
  for (const file of files) {
    const a = read(values.primary, file);
    const b = read(values.second, file);
    if (a.pr_title !== b.pr_title) {
      console.error(`${file}: the two reviews are of different pull requests`);
      return 2;
    }
    const { comments, counts } = poolReviews(a.comments, b.comments);
    fs.writeFileSync(path.join(values.out, file), JSON.stringify({ pr_title: a.pr_title, comments }, null, 2) + "\n");
    cases[file.replace(/\.json$/, "")] = counts;
    for (const k of Object.keys(total) as (keyof PoolCounts)[]) total[k] += counts[k];
  }
  fs.writeFileSync(path.join(values.out, "pool-counts.json"), JSON.stringify({ v: POOL_VERSION, cap: MAX_COMMENTS, files: files.length, total, cases }, null, 2) + "\n");
  console.log(`${files.length} cases\tprimary=${total.primary}\tsecond=${total.second}\tboth=${total.both}\tadded=${total.added}\tcut=${total.cut}\tpooled=${total.pooled}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
