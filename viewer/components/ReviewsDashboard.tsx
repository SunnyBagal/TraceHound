"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Clock, GitPullRequest, MessageSquare, SearchCheck, Waypoints, Wrench } from "lucide-react";
import { DEFAULT_REVIEW_REPO, MODEL_DISCLOSURE, loadPullReview, loadReviewList, pullHref, reviewFindings, reviewNumber, reviewRepo, ReviewsError, reviewsHref, type PullRequest, type PullReview, type ReviewList } from "@/lib/reviews";
import { savedReviews } from "@/lib/pulls";
import { ReviewFinding } from "./ReviewFinding";
import { RepositoryForm, ReviewShell, ShellHero } from "./ReviewShell";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };
function useReviewData<T>(loader: (repo: string, query: URLSearchParams) => Promise<T>) {
  const [repo, setRepo] = useState(DEFAULT_REVIEW_REPO);
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    (async () => {
      try {
        const selected = reviewRepo(query.get("repo"));
        if (active) setRepo(selected);
        const data = await loader(selected, query);
        if (active) setState({ status: "ready", data });
      } catch (error) { if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Reviews are unavailable. Try later." }); }
    })();
    return () => { active = false; };
  }, [loader]);
  return { repo, state };
}
type Saved = { savedAt?: string };
const limited = (e: unknown) => e instanceof ReviewsError && e.rateLimited;
// on GitHub's rate limit, the copy scripts/reviews-snapshot.mjs saved (public/reviews/), if any
const list = async (repo: string): Promise<ReviewList & Saved> => {
  try { return await loadReviewList(repo); } catch (error) {
    const saved = limited(error) ? await savedReviews(repo) : undefined;
    if (!saved) throw error;
    return { pulls: saved.pulls.map(({ pull, review }) => ({ pull, review })), rateLimited: false, savedAt: saved.generatedAt };
  }
};
const detail = async (repo: string, query: URLSearchParams): Promise<PullReview & Saved> => {
  const n = reviewNumber(query.get("n"));
  try { return await loadPullReview(repo, n); } catch (error) {
    const hit = limited(error) ? (await savedReviews(repo))?.pulls.find((p) => p.pull.number === n) : undefined;
    if (!hit) throw error;
    return { pull: hit.pull, review: hit.review, findings: hit.review ? reviewFindings(hit.review, hit.comments) : [], savedAt: (await savedReviews(repo))!.generatedAt };
  }
};
function SavedNotice({ at }: { at?: string }) {
  if (!at) return null;
  return <div className="mb-4"><EmptyState tone="wait"><span role="status">GitHub&apos;s hourly limit is used up in this browser. Showing the copy saved {at.slice(0, 10)}.</span></EmptyState></div>;
}
const stateLabel = (pull: PullRequest) => pull.merged_at ? "Merged" : pull.state === "open" ? "Open" : "Closed";
const plural = (count: number | undefined, noun: string) => `${noun}${count === 1 ? "" : "s"}`;

function LoadMessage({ state }: { state: Load<unknown> }) {
  if (state.status === "ready") return null;
  if (state.status === "loading") return <div role="status" aria-label="Reading public reviews from GitHub…" data-testid="reviews-loading">
    <p className="sr-only">Reading public reviews from GitHub…</p>
    <p className="rv-loading-label" aria-hidden><span className="rv-pulse" />Reading public reviews from GitHub</p>
    <ul className="rv-list" aria-hidden>
      {[0, 1, 2].map((i) => <li key={i} className="rv-skel" style={{ "--i": i } as React.CSSProperties}><span className="skeleton h-4 w-10 rounded" /><span className="flex-1 space-y-2.5"><span className="skeleton block h-4 w-2/3 rounded" /><span className="skeleton block h-3 w-1/3 rounded" /></span></li>)}
    </ul>
  </div>;
  return <EmptyState tone={/rate limit/i.test(state.message) ? "wait" : "info"}><span role="status">{state.message}</span></EmptyState>;
}

/** Loading, rate-limited, no-findings and not-reviewed states share one calm card. */
function EmptyState({ tone = "info", label: given, children }: { tone?: "wait" | "info" | "clean"; label?: string; children: React.ReactNode }) {
  const Icon = tone === "wait" ? Clock : tone === "clean" ? SearchCheck : MessageSquare;
  const label = given ?? (tone === "wait" ? "waiting on GitHub" : tone === "clean" ? "no findings" : "note");
  return <div className="rv-state" data-testid="empty-state" data-tone={tone}>
    <span className="rv-state-icon"><Icon className="size-4.5" aria-hidden /></span>
    <div className="min-w-0">
      <p className="rv-state-label" aria-hidden>{label}</p>
      <div className="mt-1 text-base leading-relaxed text-text">{children}</div>
    </div>
  </div>;
}

/** reviewed / no findings / not reviewed, as on the graph's PR lane */
function StatusPill({ review, unavailable }: { review?: PullReview["review"]; unavailable?: boolean }) {
  const [label, tone] = unavailable ? ["review unknown", "unknown"] : !review ? ["not reviewed", "none"] : review.footer.posted ? ["reviewed", "reviewed"] : ["no findings", "clean"];
  return <span className="rv-pill" data-tone={tone} data-testid="review-status">{label}</span>;
}

/** the list's totals, counted from the rows on the page (a review's footer, never a guess) */
function Totals({ pulls }: { pulls: ReviewList["pulls"] }) {
  const reviewed = pulls.filter((p) => p.review);
  const cells = [
    [pulls.length, plural(pulls.length, "pull request")],
    [reviewed.length, "reviewed by TraceHound"],
    [reviewed.reduce((n, p) => n + p.review!.footer.posted, 0), "findings posted"],
    [reviewed.reduce((n, p) => n + p.review!.footer.fixes.valid, 0), "suggested fixes"],
  ] as const;
  return <dl className="rv-totals" data-testid="review-totals">
    {cells.map(([n, label]) => <div key={label}><dt>{label}</dt><dd>{n}</dd></div>)}
  </dl>;
}

export function ReviewsDashboard() {
  const { repo, state } = useReviewData(list);
  const graph = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/graph?repo=tracehound-demo`;
  return <ReviewShell>
    <ShellHero kicker="TraceHound / Reviews" title="Bugs, with a way to fix them." tone="violet" aside={<div className="rv-hero-card"><RepositoryForm key={repo} repo={repo} /></div>}>
      <p className="rv-lede">Findings and suggested fixes from TraceHound&apos;s GitHub reviews: the effect first, then the file and line. <a className="rv-inline-link" href={graph}><Waypoints className="size-3.5" aria-hidden />See them on the graph</a></p>
    </ShellHero>
    <div className="rv-section-head"><h2 className="break-all font-mono text-text">{repo}</h2><p>All open PRs + last 30 closed · <span className="rv-disclosure">{MODEL_DISCLOSURE}</span></p></div>
    <LoadMessage state={state} />
    {state.status === "ready" && <>
      <SavedNotice at={state.data.savedAt} />
      {state.data.rateLimited && <div className="mb-4"><EmptyState tone="wait"><span role="status">GitHub rate limit, try later</span><span className="mt-1 block text-sm text-muted">The rows below loaded first; their review counts fill in after GitHub&apos;s hourly limit resets.</span></EmptyState></div>}
      {state.data.pulls.length === 0 ? <EmptyState>No pull requests found in this repository.</EmptyState> : <>
        <Totals pulls={state.data.pulls} />
        <ul className="rv-list" aria-label="Pull requests">
          {state.data.pulls.map(({ pull, review, unavailable }, i) => <li key={pull.number} style={{ "--i": i } as React.CSSProperties}>
            <a href={reviewsHref(repo, pull.number)} className="rv-row group">
              <span className="rv-num">#{pull.number}</span>
              <span className="min-w-0">
                <span className="rv-row-title">{pull.title}</span>
                <span className="rv-row-meta"><GitPullRequest className={`size-3.5 ${pull.merged_at ? "text-violet-300" : pull.state === "open" ? "text-green-300" : "text-muted"}`} aria-hidden />{stateLabel(pull)}{unavailable ? " · Review unavailable" : !review ? " · No TraceHound review" : ""}<StatusPill review={review} unavailable={unavailable} /></span>
              </span>
              <span className="rv-row-counts">
                <span className="rv-count"><MessageSquare className="size-4" aria-hidden /><span><strong>{review?.footer.posted ?? "—"}</strong> {plural(review?.footer.posted, "finding")}</span></span>
                <span className="rv-count"><Wrench className="size-4" aria-hidden /><span><strong>{review?.footer.fixes.valid ?? "—"}</strong> {plural(review?.footer.fixes.valid, "suggestion")}</span></span>
                <ArrowUpRight className="rv-row-go size-4" aria-hidden />
              </span>
            </a>
          </li>)}
        </ul>
      </>}
      <p className="mt-5 text-sm leading-relaxed text-muted">Counts come from the latest TraceHound review footer. A dash means no count is available.</p>
    </>}
  </ReviewShell>;
}

export function PullReviewDashboard() {
  const { repo, state } = useReviewData(detail);
  return <ReviewShell>
    <a href={reviewsHref(repo)} className="rv-back"><ArrowLeft className="size-4" aria-hidden />All reviews</a>
    <LoadMessage state={state} />
    {state.status === "ready" && <><SavedNotice at={state.data.savedAt} /><PullFindings repo={repo} data={state.data} /></>}
  </ReviewShell>;
}

function PullFindings({ repo, data: { pull, review, findings } }: { repo: string; data: PullReview }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return <>
    <header className="rv-pr-head">
      <p className="rv-pr-meta">{repo} · #{pull.number} · {stateLabel(pull)}</p>
      <h1 className="rv-h1 max-w-[30ch]">{pull.title}</h1>
      <div className="rv-pr-facts">
        {review ? <>
          <span className="rv-fact"><strong>{review.footer.posted}</strong> {plural(review.footer.posted, "finding")}</span>
          <span className="rv-fact"><strong>{review.footer.fixes.valid}</strong> {plural(review.footer.fixes.valid, "suggestion")}</span>
          <span className="rv-fact rv-fact-mono">{review.footer.pipeline} · pool {review.footer.pool} · kept {review.footer.kept}</span>
        </> : <span className="rv-fact">No TraceHound review</span>}
        {review && <span className="rv-disclosure">{MODEL_DISCLOSURE}</span>}
      </div>
      <div className="rv-pr-links">
        <a href={pullHref(repo, pull.number)} target="_blank" rel="noreferrer" className="rv-inline-link">Pull request on GitHub<ArrowUpRight className="size-4" aria-hidden /></a>
        {repo.toLowerCase() === "sunnybagal/tracehound-demo" && <a href={`${base}/graph?repo=tracehound-demo&pr=${pull.number}`} className="rv-inline-link"><Waypoints className="size-4" aria-hidden />On the graph</a>}
      </div>
      {review && review.footer.headSha !== pull.head.sha && <p className="mt-4 text-sm leading-relaxed text-muted">This review is for an earlier commit ({review.footer.headSha.slice(0, 7)}). Check the current code on GitHub before applying a fix.</p>}
    </header>
    {findings.length ? <ol className="rv-findings">{findings.map((finding, i) => <li key={finding.id} style={{ "--i": i } as React.CSSProperties}><ReviewFinding finding={finding} repo={repo} number={pull.number} reviewId={review!.id} index={i + 1} /></li>)}</ol> : <EmptyState tone={review && !review.footer.posted ? "clean" : "info"} label={review ? undefined : "not reviewed"}>{review ? review.footer.posted ? "The review’s inline comments are unavailable. Open the review on GitHub." : "TraceHound posted no findings in this review." : "No TraceHound review with a data footer has been posted on this pull request."}</EmptyState>}
  </>;
}
