import { createReviewsClient, reviewFindings, reviewRepo, ReviewsError, type Finding, type GitHubComment, type PullFile, type PullRequest, type ReviewFooter, type TraceReview } from "./reviews";
import type { Snapshot } from "./types";
import { sessionCachedFetch } from "./ghcache";

export { sessionCachedFetch };

/**
 * The PR lane on /graph: a repo's pull requests with TraceHound's review status, and for the
 * selected one the components its changed files and findings fall in. Live from GitHub's public
 * API first (every response kept in sessionStorage), then a static file written by
 * scripts/reviews-snapshot.mjs. Nothing here calls a model; findings are what the review posted.
 */

export type ReviewStatus = "reviewed" | "no-findings" | "not-reviewed" | "unknown";
export interface LanePull {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  updatedAt: string;
  status: ReviewStatus;
  /** findings TraceHound posted; null when the review couldn't be read (rate limit) */
  findingCount: number | null;
}
export interface LaneList { pulls: LanePull[]; source: "live" | "static"; notice?: string }
export interface PullOverlayData { number: number; title: string; files: PullFile[]; findings: Finding[]; reviewId?: number; source: "live" | "static"; notice?: string }

/** scripts/reviews-snapshot.mjs output: public PR data and TraceHound's own review only. */
export interface StaticReviews {
  version: 1;
  repo: string;
  generatedAt: string;
  pulls: { pull: PullRequest; files: PullFile[]; review?: TraceReview; comments: GitHubComment[] }[];
}

export const RATE_LIMIT_NOTICE = "GitHub’s hourly limit for anonymous requests is used up in this browser.";

const findingTotal = (footer: ReviewFooter) => footer.findings?.length ?? footer.posted;
export function reviewStatus(review: TraceReview | undefined, unavailable?: boolean): { status: ReviewStatus; findingCount: number | null } {
  if (unavailable) return { status: "unknown", findingCount: null };
  if (!review) return { status: "not-reviewed", findingCount: 0 };
  const count = findingTotal(review.footer);
  return { status: count ? "reviewed" : "no-findings", findingCount: count };
}

const laneState = (p: PullRequest): LanePull["state"] => (p.merged_at ? "merged" : p.state);
const byNewest = (a: LanePull, b: LanePull) => b.number - a.number;

export const staticReviewsPath = (repo: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/reviews/${reviewRepo(repo).replace("/", "__")}.json`;

export function createPullsClient(fetcher: typeof fetch) {
  const live = createReviewsClient(sessionCachedFetch(fetcher));
  let staticFile: Promise<StaticReviews | undefined> | undefined;
  const loadStatic = (repo: string) => staticFile ??= savedReviews(repo, fetcher);
  const notice = (error: unknown) => (error instanceof ReviewsError && error.rateLimited ? RATE_LIMIT_NOTICE : error instanceof Error ? error.message : "GitHub couldn’t be reached.");

  return {
    async list(repo: string): Promise<LaneList> {
      reviewRepo(repo);
      try {
        const { pulls, rateLimited } = await live.list(repo);
        const lane = pulls.map(({ pull, review, unavailable }) => ({ number: pull.number, title: pull.title, state: laneState(pull), updatedAt: pull.updated_at, ...reviewStatus(review, unavailable) })).sort(byNewest);
        if (!rateLimited) return { pulls: lane, source: "live" };
        const saved = await loadStatic(repo);
        if (!saved) return { pulls: lane, source: "live", notice: RATE_LIMIT_NOTICE };
        // fill what the limit cut off from the saved copy
        const known = new Map(saved.pulls.map((p) => [p.pull.number, p]));
        return { pulls: lane.map((p) => (p.status === "unknown" && known.has(p.number) ? { ...p, ...reviewStatus(known.get(p.number)!.review) } : p)), source: "live", notice: `${RATE_LIMIT_NOTICE} Some review states come from a saved copy.` };
      } catch (error) {
        const saved = await loadStatic(repo);
        if (!saved) throw error instanceof ReviewsError && error.rateLimited ? new ReviewsError(RATE_LIMIT_NOTICE, true) : error;
        return {
          pulls: saved.pulls.map(({ pull, review }) => ({ number: pull.number, title: pull.title, state: laneState(pull), updatedAt: pull.updated_at, ...reviewStatus(review) })).sort(byNewest),
          source: "static",
          notice: `${notice(error)} Showing the copy saved ${saved.generatedAt.slice(0, 10)}.`,
        };
      }
    },
    async overlay(repo: string, number: number): Promise<PullOverlayData> {
      try {
        const [files, detail] = await Promise.all([live.files(repo, number), live.detail(repo, number)]);
        return { number, title: detail.pull.title, files, findings: detail.findings, reviewId: detail.review?.id, source: "live" };
      } catch (error) {
        const saved = (await loadStatic(repo))?.pulls.find((p) => p.pull.number === number);
        if (!saved) throw error instanceof ReviewsError && error.rateLimited ? new ReviewsError(RATE_LIMIT_NOTICE, true) : error;
        return {
          number, title: saved.pull.title, files: saved.files, reviewId: saved.review?.id, source: "static",
          findings: saved.review ? reviewFindings(saved.review, saved.comments) : [],
          notice: `${notice(error)} Showing the copy saved ${(await loadStatic(repo))!.generatedAt.slice(0, 10)}.`,
        };
      }
    },
  };
}

/* ───────────── graph overlay (pure) ───────────── */

export interface PrOverlay {
  number: number;
  /** components holding at least one changed file, with those files */
  touched: Map<string, string[]>;
  findings: Map<string, Finding[]>;
  /** changed files no component contains (test support, config, files the snapshot predates) */
  outsideFiles: string[];
  /** findings whose path is in no component: listed, never dropped */
  outsideFindings: Finding[];
}

export function prOverlay(snapshot: Snapshot, number: number, files: { filename: string }[], findings: Finding[]): PrOverlay {
  const owner = new Map<string, string>();
  for (const c of snapshot.components) for (const f of c.files) owner.set(f, c.id);
  const touched = new Map<string, string[]>();
  const outsideFiles: string[] = [];
  for (const { filename } of files) {
    const id = owner.get(filename);
    if (!id) { outsideFiles.push(filename); continue; }
    touched.set(id, [...(touched.get(id) ?? []), filename]);
  }
  const byComponent = new Map<string, Finding[]>();
  const outsideFindings: Finding[] = [];
  for (const finding of findings) {
    const id = owner.get(finding.path);
    if (!id) { outsideFindings.push(finding); continue; }
    byComponent.set(id, [...(byComponent.get(id) ?? []), finding]);
  }
  return { number, touched, findings: byComponent, outsideFiles, outsideFindings };
}

/** Components the PR node points at: a changed file or a finding location in them, nothing else. */
export const overlayTargets = (o: PrOverlay) => [...new Set([...o.touched.keys(), ...o.findings.keys()])];

const EFFECT = /\b(?:can|could|will|would|may|might)\s+(?:\w+\s+){0,2}(?:cause|break|lead|result|fail|crash|return|leak|drop|allow|lose|skip|throw|expose|corrupt|miss)|\b(?:causes|breaks|leads to|results in|crashes|leaks|exposes|corrupts)\b/i;
const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim();
const clip = (text: string) => (text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text);

/**
 * Effect-first title (R15) without a model: the comment's first sentence that states an effect
 * ("can cause…", "breaks…"), else its first sentence. Always a verbatim sentence of the comment.
 */
export function findingTitle(body: string): string {
  const prose = body.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(`{3}|#|>)/.test(l)).join(" ");
  const sentences = plain(prose).split(/(?<=[.!?])\s+(?=[A-Z`"'(])/).filter(Boolean);
  return clip(sentences.find((s) => EFFECT.test(s)) ?? sentences[0] ?? plain(body));
}

export const prParam = (search: string): number | null => {
  const n = new URLSearchParams(search).get("pr");
  return n && /^[1-9]\d{0,6}$/.test(n) ? Number(n) : null;
};

let pageClient: ReturnType<typeof createPullsClient> | undefined;
export const pullsClient = () => pageClient ??= createPullsClient((...args) => fetch(...args));

/**
 * /reviews on a rate limit: the same saved copy, in the reviews pages' own shapes. Undefined when
 * there is no copy for the repo (the page then shows the rate-limit state).
 */
export async function savedReviews(repo: string, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<StaticReviews | undefined> {
  try {
    const r = await fetcher(staticReviewsPath(repo));
    if (!r.ok) return undefined;
    const data = (await r.json()) as StaticReviews;
    return data?.version === 1 && data.repo.toLowerCase() === repo.toLowerCase() && Array.isArray(data.pulls) ? data : undefined;
  } catch {
    return undefined;
  }
}
