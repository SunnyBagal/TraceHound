import { z } from "zod";
import { sessionCachedFetch } from "./ghcache.ts";

export const DEFAULT_REVIEW_REPO = "SunnyBagal/tracehound-demo";
export const MODEL_DISCLOSURE = "model-generated, not tested";
const count = z.number().int().nonnegative();
const location = z.object({ path: z.string(), line: count.nullable(), startLine: count.optional(), source: z.enum(["diff", "ctx", "both"]), hasSuggestion: z.boolean() });
export const ReviewFooter = z.object({
  version: z.literal(1), pipeline: z.string(), headSha: z.string().regex(/^[a-f\d]{40}$/i),
  pool: count, kept: count, posted: count,
  fixes: z.object({ attempted: count, valid: count, rejected: count }),
  findings: z.array(location).optional(), findingsTruncated: z.boolean().optional(),
});
export type ReviewFooter = z.infer<typeof ReviewFooter>;
export type FindingSource = "diff" | "ctx" | "both";
export interface PullRequest { number: number; title: string; state: "open" | "closed"; merged_at: string | null; head: { sha: string }; updated_at: string }
interface GitHubReview { id: number; body: string | null; user: { login: string } | null; submitted_at: string | null }
interface GitHubComment {
  id: number; pull_request_review_id: number; user: { login: string } | null; path: string; body: string;
  line: number | null; original_line: number | null; start_line: number | null; original_start_line: number | null;
  diff_hunk: string; commit_id: string; in_reply_to_id?: number;
}
export interface TraceReview { id: number; footer: ReviewFooter }
export interface ReviewedPull { pull: PullRequest; review?: TraceReview; unavailable?: boolean }
export interface ReviewList { pulls: ReviewedPull[]; rateLimited: boolean }
export interface Finding {
  id: string; commentId?: number; path: string; line: number | null; startLine: number | null;
  body: string; suggestion?: string; original?: string; source?: FindingSource; outdated: boolean;
}
export interface PullReview { pull: PullRequest; review?: TraceReview; findings: Finding[] }
/** One entry of GET /repos/{o}/{r}/pulls/{n}/files, as the PR lane uses it. */
export interface PullFile { filename: string; status: string; additions: number; deletions: number; previous_filename?: string }
export type { GitHubComment, GitHubReview };

export class ReviewsError extends Error {
  readonly rateLimited: boolean;
  constructor(message: string, rateLimited = false) { super(message); this.rateLimited = rateLimited; }
}

/** Validate before any request, including the benchmark test-set refusal. */
export function reviewRepo(value: string | null | undefined): string {
  const repo = value ?? DEFAULT_REVIEW_REPO;
  if (!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(repo) || [".", ".."].includes(repo.split("/")[1]!)) throw new ReviewsError("Enter a public repository as owner/name.");
  if (repo.toLowerCase() === "calcom/cal.com") throw new ReviewsError("This benchmark test-set repository is not available in the reviews viewer.");
  return repo;
}

export function reviewNumber(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ReviewsError("Enter a valid pull request number.");
  return Number(value);
}

export function parseFooter(body: string | null): ReviewFooter | undefined {
  if (!body || body.length > 200_000) return undefined;
  const match = /<!--\s*tracehound:v1\s+(\{[\s\S]*?\})\s*-->/.exec(body);
  if (!match) return undefined;
  try { const result = ReviewFooter.safeParse(JSON.parse(match[1]!)); return result.success ? result.data : undefined; } catch { return undefined; }
}

export function latestTraceReview(reviews: GitHubReview[]): TraceReview | undefined {
  return [...reviews].sort((a, b) => b.id - a.id).flatMap((review) => {
    if (review.user?.login !== "github-actions[bot]") return [];
    const footer = parseFooter(review.body);
    return footer ? [{ id: review.id, footer }] : [];
  })[0];
}

export function suggestionBlock(body: string): { body: string; suggestion?: string } {
  const match = /^(`{3,})suggestion[^\r\n]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/m.exec(body);
  if (!match) return { body: body.trim() };
  const text = (body.slice(0, match.index).replace(/Suggested fix \(model-generated, not tested\):\s*$/, "") + body.slice(match.index + match[0].length)).trim();
  return { body: text, suggestion: match[2]!.replace(/\r\n/g, "\n") };
}

/** Original = the PR's new-side lines being replaced, never the removed base-side lines. */
export function originalLines(hunk: string, start: number, end: number): string | undefined {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 10_000) return undefined;
  const selected = new Map<number, string>();
  let line: number | undefined;
  for (const text of hunk.split(/\r?\n/)) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (header) { line = Number(header[1]); continue; }
    if (line === undefined || !/^[ +]/.test(text)) continue;
    if (line >= start && line <= end) selected.set(line, text.slice(1));
    line++;
  }
  const lines: string[] = [];
  for (let n = start; n <= end; n++) { if (!selected.has(n)) return undefined; lines.push(selected.get(n)!); }
  return lines.join("\n");
}

export function reviewFindings(review: TraceReview, comments: GitHubComment[]): Finding[] {
  const remaining = new Set(review.footer.findings ?? []);
  const findings = comments.filter((c) => c.pull_request_review_id === review.id && c.user?.login === "github-actions[bot]" && !c.in_reply_to_id).map((comment): Finding => {
    const line = comment.original_line ?? comment.line;
    const start = comment.original_start_line ?? comment.start_line ?? line;
    const metadata = [...remaining].find((f) => f.path === comment.path && (f.line === line || f.startLine === start || (f.line !== null && start !== null && line !== null && f.line >= start && f.line <= line)));
    if (metadata) remaining.delete(metadata);
    const content = suggestionBlock(comment.body);
    return {
      id: String(comment.id), commentId: comment.id, path: comment.path, line: comment.line ?? line, startLine: start,
      ...content, ...(content.suggestion !== undefined && start !== null && line !== null ? { original: originalLines(comment.diff_hunk, start, line) } : {}),
      source: metadata?.source, outdated: comment.line === null,
    };
  });
  // Body-only findings are still represented; do not invent their text or a fix.
  for (const [index, metadata] of [...remaining].entries()) findings.push({ id: `body-${index}`, path: metadata.path, line: metadata.line, startLine: metadata.startLine ?? metadata.line, body: "This finding is in the GitHub review body. Open the review to read it.", source: metadata.source, outdated: false });
  return findings;
}

export function pullHref(repo: string, number: number, suffix = ""): string {
  return `https://github.com/${reviewRepo(repo)}/pull/${number}${suffix}`;
}
export function reviewsHref(repo = DEFAULT_REVIEW_REPO, number?: number): string {
  const params = new URLSearchParams({ repo: reviewRepo(repo) });
  if (number !== undefined) params.set("n", String(number));
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/reviews${number === undefined ? "" : "/pr"}?${params}`;
}

/** One client per page, including cached promises and failures, so Strict Mode cannot double-fetch. */
export function createReviewsClient(fetcher: typeof fetch) {
  const cache = new Map<string, Promise<unknown>>();
  let limited = false;
  async function request<T>(endpoint: string): Promise<T> {
    const cached = cache.get(endpoint);
    if (cached) return cached as Promise<T>;
    if (limited) throw new ReviewsError("GitHub rate limit, try later", true);
    const result = (async () => {
      let response: Response;
      try { response = await fetcher(`https://api.github.com${endpoint}`, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000) }); }
      catch { throw new ReviewsError("GitHub couldn’t be reached. Try reloading later."); }
      const data = await response.json().catch(() => undefined);
      if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(data?.message ?? "")))) {
        limited = true; throw new ReviewsError("GitHub rate limit, try later", true);
      }
      if (!response.ok) throw new ReviewsError(response.status === 404 ? "This repository or pull request isn’t publicly available." : `GitHub is unavailable (HTTP ${response.status}). Try later.`);
      return data;
    })();
    cache.set(endpoint, result);
    return result as Promise<T>;
  }
  async function pages<T>(endpoint: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const batch = await request<T[]>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new ReviewsError("GitHub returned an unreadable response.");
      all.push(...batch);
      if (batch.length < 100) return all;
    }
  }
  const endpoint = (repo: string) => `/repos/${reviewRepo(repo)}`;
  const getReviews = async (repo: string, number: number) => latestTraceReview(await pages<GitHubReview>(`${endpoint(repo)}/pulls/${number}/reviews`));
  return {
    async list(repo: string): Promise<ReviewList> {
      const base = endpoint(repo);
      const open = await pages<PullRequest>(`${base}/pulls?state=open&sort=updated&direction=desc`);
      const closed = await request<PullRequest[]>(`${base}/pulls?state=closed&sort=updated&direction=desc&per_page=30`);
      if (!Array.isArray(closed)) throw new ReviewsError("GitHub returned an unreadable response.");
      const pulls: ReviewedPull[] = [...new Map([...open, ...closed].map((p) => [p.number, p])).values()].map((pull) => ({ pull }));
      let rateLimited = false;
      for (const item of pulls) {
        if (rateLimited) { item.unavailable = true; continue; }
        try { item.review = await getReviews(repo, item.pull.number); }
        catch (error) { if (!(error instanceof ReviewsError) || !error.rateLimited) throw error; item.unavailable = true; rateLimited = true; }
      }
      return { pulls, rateLimited };
    },
    async files(repo: string, number: number): Promise<PullFile[]> {
      if (!Number.isSafeInteger(number) || number < 1) throw new ReviewsError("Enter a valid pull request number.");
      return (await pages<PullFile>(`${endpoint(repo)}/pulls/${number}/files`)).map(({ filename, status, additions, deletions, previous_filename }) => ({ filename, status, additions, deletions, ...(previous_filename ? { previous_filename } : {}) }));
    },
    async detail(repo: string, number: number): Promise<PullReview> {
      if (!Number.isSafeInteger(number) || number < 1) throw new ReviewsError("Enter a valid pull request number.");
      const base = `${endpoint(repo)}/pulls/${number}`;
      const pull = await request<PullRequest>(base);
      const review = await getReviews(repo, number);
      return { pull, review, findings: review ? reviewFindings(review, await pages<GitHubComment>(`${base}/comments`)) : [] };
    },
  };
}

let pageClient: ReturnType<typeof createReviewsClient> | undefined;
const client = () => pageClient ??= createReviewsClient(sessionCachedFetch((...args) => fetch(...args)));
export const loadReviewList = (repo: string) => client().list(repo);
export const loadPullReview = (repo: string, number: number) => client().detail(repo, number);
