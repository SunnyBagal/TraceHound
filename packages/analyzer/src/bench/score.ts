// Scoring (decision 054, rules from the dataset's README):
// - a tool comment matching a Medium/High/Critical golden comment is a true positive; each golden
//   comment is credited once, further matches are duplicates (neither true nor false positives);
// - a tool comment matching a Low golden comment counts as nothing; a missed Low counts as nothing;
// - a tool comment matching no golden comment is a false positive;
// - a Medium-or-higher golden comment nothing matched is a false negative.
// Precision, recall and F-score come from counts summed across pull requests.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { panelVerdict, type Judge, type JudgeUsage } from "./judge.ts";
import { mapByTitle } from "./titles.ts";
import { GoldenFile, PullReview, type GoldenEntry, type Severity } from "./types.ts";

export interface Counts {
  /** tool comments in scored pull requests */
  comments: number;
  tp: number;
  fp: number;
  duplicates: number;
  /** tool comments that matched a Low golden comment */
  lowMatched: number;
  fn: number;
  /** Medium-or-higher golden comments in scored pull requests (tp + fn) */
  goldenCounted: number;
}

export const zeroCounts = (): Counts => ({ comments: 0, tp: 0, fp: 0, duplicates: 0, lowMatched: 0, fn: 0, goldenCounted: 0 });

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    comments: a.comments + b.comments,
    tp: a.tp + b.tp,
    fp: a.fp + b.fp,
    duplicates: a.duplicates + b.duplicates,
    lowMatched: a.lowMatched + b.lowMatched,
    fn: a.fn + b.fn,
    goldenCounted: a.goldenCounted + b.goldenCounted,
  };
}

export type CommentOutcome = "tp" | "fp" | "duplicate" | "low";

/** Applies the rules to one pull request. `matches[i]` is the golden index tool comment i matched, or null. */
export function scorePull(severities: Severity[], matches: (number | null)[]): { counts: Counts; outcomes: CommentOutcome[] } {
  const counts = zeroCounts();
  const credited = new Set<number>();
  const outcomes = matches.map((g): CommentOutcome => {
    counts.comments++;
    if (g === null) return (counts.fp++, "fp");
    if (severities[g] === "Low") return (counts.lowMatched++, "low");
    if (credited.has(g)) return (counts.duplicates++, "duplicate");
    credited.add(g);
    return (counts.tp++, "tp");
  });
  severities.forEach((s, i) => {
    if (s === "Low") return;
    counts.goldenCounted++;
    if (!credited.has(i)) counts.fn++;
  });
  return { counts, outcomes };
}

export interface Metrics {
  precision: number | null;
  recall: number | null;
  f: number | null;
}

export function metrics(c: Counts): Metrics {
  const precision = c.tp + c.fp ? c.tp / (c.tp + c.fp) : null;
  const recall = c.tp + c.fn ? c.tp / (c.tp + c.fn) : null;
  const f = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : precision !== null && recall !== null ? 0 : null;
  return { precision, recall, f };
}

export interface PullDetail {
  goldenIndex: number;
  prTitle: string;
  reviewFile: string;
  status: "SCORED" | "JUDGE_FAILED";
  judgeFailure?: string;
  counts?: Counts;
  golden: { id: string; severity: Severity; comment: string; creditedBy: string[] }[];
  comments: { id: string; path: string; line: number | null; body: string; matched: string | null; outcome?: CommentOutcome }[];
}

export interface RepoScore {
  counts: Counts;
  pulls: { scored: number; judgeFailed: number };
  mapping: { reviewFiles: number; matched: number; unmatchedReviews: number; unmatchedGolden: number; duplicateReviews: number };
  usage: JudgeUsage;
  detail: PullDetail[];
}

export function loadReviews(dir: string): { file: string; review: PullReview }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, review: PullReview.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))) }))
    .sort((a, b) => (a.review.pr_number ?? 0) - (b.review.pr_number ?? 0) || a.file.localeCompare(b.file));
}

export async function scoreRepo(opts: {
  golden: GoldenEntry[];
  reviews: { file: string; review: PullReview }[];
  judges: Judge[];
  concurrency?: number;
  onPull?: (done: number, total: number) => void;
}): Promise<RepoScore> {
  const golden = GoldenFile.parse(opts.golden);
  const mapping = mapByTitle(
    golden.map((g) => g.pr_title),
    opts.reviews,
    (r) => r.review.pr_title,
  );
  const usage: JudgeUsage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
  const detail: PullDetail[] = new Array(mapping.matched.length);

  const scoreOne = async (idx: number) => {
    const { golden: gi, pr } = mapping.matched[idx]!;
    const entry = golden[gi]!;
    const g = entry.comments.map((c, i) => ({ id: `G${i + 1}`, severity: c.severity, comment: c.comment, creditedBy: [] as string[] }));
    const t = pr.review.comments.map((c, i) => ({ id: `T${i + 1}`, path: c.path, line: c.line, body: c.body, matched: null as string | null }));
    const base = { goldenIndex: gi, prTitle: entry.pr_title, reviewFile: pr.file, golden: g };
    let matchIds: (string | null)[];
    if (!t.length || !g.length) {
      matchIds = t.map(() => null); // nothing to judge: no request
    } else {
      const verdict = await panelVerdict(opts.judges, {
        prTitle: entry.pr_title,
        golden: g.map((x) => ({ id: x.id, text: x.comment })),
        tool: t.map((x) => ({ id: x.id, path: x.path, line: x.line, body: x.body })),
      });
      for (const k of Object.keys(usage) as (keyof JudgeUsage)[]) usage[k] += verdict.usage[k];
      if (!verdict.ok) {
        detail[idx] = { ...base, status: "JUDGE_FAILED", judgeFailure: verdict.why, comments: t };
        return;
      }
      matchIds = t.map((x) => verdict.matches[x.id] ?? null);
    }
    const { counts, outcomes } = scorePull(
      entry.comments.map((c) => c.severity),
      matchIds.map((id) => (id === null ? null : Number(id.slice(1)) - 1)),
    );
    t.forEach((x, i) => {
      x.matched = matchIds[i]!;
      if (x.matched && outcomes[i] === "tp") g[Number(x.matched.slice(1)) - 1]!.creditedBy.push(x.id);
    });
    detail[idx] = { ...base, status: "SCORED", counts, comments: t.map((x, i) => ({ ...x, outcome: outcomes[i] })) };
  };

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < mapping.matched.length) {
      const i = next++;
      await scoreOne(i);
      opts.onPull?.(++done, mapping.matched.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));

  const scored = detail.filter((d) => d.status === "SCORED");
  return {
    counts: scored.reduce((sum, d) => addCounts(sum, d.counts!), zeroCounts()),
    pulls: { scored: scored.length, judgeFailed: detail.length - scored.length },
    mapping: {
      reviewFiles: opts.reviews.length,
      matched: mapping.matched.length,
      unmatchedReviews: mapping.unmatchedPrs.length,
      unmatchedGolden: mapping.unmatchedGolden.length,
      duplicateReviews: mapping.duplicatePrs.length,
    },
    usage,
    detail,
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** One line of counts and metrics, with n beside every figure. No comment text. */
export function formatCounts(c: Counts): string {
  const m = metrics(c);
  return (
    `comments ${c.comments} · TP ${c.tp} · FP ${c.fp} · dup ${c.duplicates} · low-matched ${c.lowMatched} · FN ${c.fn} · ` +
    `precision ${pct(m.precision)} (${c.tp}/${c.tp + c.fp}) · recall ${pct(m.recall)} (${c.tp}/${c.tp + c.fn}) · F ${pct(m.f)}`
  );
}
