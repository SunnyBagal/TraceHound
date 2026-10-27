"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Clock, GitPullRequest, MessageSquare, SearchCheck, Waypoints, Wrench } from "lucide-react";
import { DEFAULT_REVIEW_REPO, MODEL_DISCLOSURE, loadPullReview, loadReviewList, pullHref, reviewFindings, reviewNumber, reviewRepo, ReviewsError, reviewsHref, type PullRequest, type PullReview, type ReviewList } from "@/lib/reviews";
import { savedReviews } from "@/lib/pulls";
import { ReviewFinding } from "./ReviewFinding";
import { RepositoryForm, ReviewShell } from "./ReviewShell";

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
    <ul className="divide-y divide-panel-line overflow-hidden rounded-2xl border border-panel-line bg-panel" aria-hidden>
      {[0, 1, 2].map((i) => <li key={i} className="flex items-center gap-4 px-5 py-6 sm:px-7"><span className="skeleton size-5 rounded-full" /><span className="flex-1 space-y-2.5"><span className="skeleton block h-4 w-2/3 rounded" /><span className="skeleton block h-3 w-1/3 rounded" /></span></li>)}
    </ul>
  </div>;
  return <EmptyState tone={/rate limit/i.test(state.message) ? "wait" : "info"}><span role="status">{state.message}</span></EmptyState>;
}

/** Loading, rate-limited, no-findings and not-reviewed states share one calm card. */
function EmptyState({ tone = "info", children }: { tone?: "wait" | "info" | "clean"; children: React.ReactNode }) {
  const Icon = tone === "wait" ? Clock : tone === "clean" ? SearchCheck : MessageSquare;
  return <div className="flex items-start gap-4 rounded-2xl border border-panel-line bg-panel px-5 py-7 sm:px-7" data-testid="empty-state" data-tone={tone}>
    <span className={`grid size-9 shrink-0 place-items-center rounded-full border ${tone === "clean" ? "border-diff-added/40 text-diff-added" : tone === "wait" ? "border-warn/40 text-warn" : "border-line-strong text-muted"}`}><Icon className="size-4.5" aria-hidden /></span>
    <div className="pt-1.5 text-base leading-relaxed text-muted">{children}</div>
  </div>;
}

/** reviewed / no findings / not reviewed, as on the graph's PR lane */
function StatusPill({ review, unavailable }: { review?: PullReview["review"]; unavailable?: boolean }) {
  const [label, tone] = unavailable ? ["review unknown", "border border-line-strong text-muted"] : !review ? ["not reviewed", "border border-line-strong text-muted"] : review.footer.posted ? ["reviewed", "bg-accent text-ink"] : ["no findings", "border border-diff-added/50 text-diff-added"];
  return <span className={`rounded-md px-1.5 py-px font-mono text-xs ${tone}`} data-testid="review-status">{label}</span>;
}

export function ReviewsDashboard() {
  const { repo, state } = useReviewData(list);
  return <ReviewShell>
    <div className="mb-9 flex flex-wrap items-end justify-between gap-8">
      <div><p className="vkicker mb-4">TraceHound / Reviews</p><h1 className="vh2">Bugs, with a way to fix them.</h1><p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted">Findings and suggested fixes from TraceHound’s GitHub reviews. <a className="inline-flex items-center gap-1 text-text underline decoration-line-strong underline-offset-4 hover:decoration-accent" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/graph?repo=tracehound-demo`}><Waypoints className="size-3.5" aria-hidden />See them on the graph</a></p></div>
      <RepositoryForm key={repo} repo={repo} />
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm leading-relaxed text-muted"><h2 className="break-all font-mono text-text">{repo}</h2><p>All open PRs + last 30 closed · {MODEL_DISCLOSURE}</p></div>
    <LoadMessage state={state} />
    {state.status === "ready" && <>
      <SavedNotice at={state.data.savedAt} />
      {state.data.rateLimited && <div className="mb-4"><EmptyState tone="wait"><span role="status">GitHub rate limit, try later</span><span className="mt-1 block text-sm">The rows below loaded first; their review counts fill in after GitHub&apos;s hourly limit resets.</span></EmptyState></div>}
      {state.data.pulls.length === 0 ? <EmptyState>No pull requests found in this repository.</EmptyState> : <ul className="divide-y divide-panel-line overflow-hidden rounded-2xl border border-panel-line bg-panel" aria-label="Pull requests">
        {state.data.pulls.map(({ pull, review, unavailable }) => <li key={pull.number}>
          <a href={reviewsHref(repo, pull.number)} className="group flex flex-wrap items-center justify-between gap-5 px-5 py-6 transition-colors hover:bg-card-hover sm:px-7">
            <div className="flex min-w-0 flex-1 items-start gap-4"><GitPullRequest className={`mt-1 size-5 shrink-0 ${pull.merged_at ? "text-violet-300" : pull.state === "open" ? "text-green-300" : "text-muted"}`} aria-hidden /><div className="min-w-0"><h3 className="text-base font-medium leading-relaxed text-text group-hover:text-accent">{pull.title}</h3><p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted"><span>#{pull.number} · {stateLabel(pull)}{unavailable ? " · Review unavailable" : !review ? " · No TraceHound review" : ""}</span><StatusPill review={review} unavailable={unavailable} /></p></div></div>
            <div className="flex items-center gap-5 text-sm text-muted sm:pl-9"><span className="flex items-center gap-2"><MessageSquare className="size-4" aria-hidden /><span><strong className="font-medium text-text">{review?.footer.posted ?? "—"}</strong> {plural(review?.footer.posted, "finding")}</span></span><span className="flex items-center gap-2"><Wrench className="size-4" aria-hidden /><span><strong className="font-medium text-text">{review?.footer.fixes.valid ?? "—"}</strong> {plural(review?.footer.fixes.valid, "suggestion")}</span></span><ArrowUpRight className="size-4 text-faint" aria-hidden /></div>
          </a>
        </li>)}
      </ul>}
      <p className="mt-5 text-sm leading-relaxed text-muted">Counts come from the latest TraceHound review footer. A dash means no count is available.</p>
    </>}
  </ReviewShell>;
}

export function PullReviewDashboard() {
  const { repo, state } = useReviewData(detail);
  return <ReviewShell>
    <a href={reviewsHref(repo)} className="mb-7 inline-flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" aria-hidden />All reviews</a>
    <LoadMessage state={state} />
    {state.status === "ready" && <><SavedNotice at={state.data.savedAt} /><PullFindings repo={repo} data={state.data} /></>}
  </ReviewShell>;
}

function PullFindings({ repo, data: { pull, review, findings } }: { repo: string; data: PullReview }) {
  return <>
    <header className="mb-9 border-b border-panel-line pb-8">
      <p className="mb-3 break-all font-mono text-sm text-muted">{repo} · #{pull.number} · {stateLabel(pull)}</p>
      <h1 className="vh2 max-w-[30ch]">{pull.title}</h1>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted"><p>{review ? `${review.footer.posted} ${plural(review.footer.posted, "finding")} · ${review.footer.fixes.valid} ${plural(review.footer.fixes.valid, "suggestion")}` : "No TraceHound review"} · {MODEL_DISCLOSURE}</p><a href={pullHref(repo, pull.number)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text hover:text-accent">Pull request on GitHub<ArrowUpRight className="size-4" aria-hidden /></a>{repo.toLowerCase() === "sunnybagal/tracehound-demo" && <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/graph?repo=tracehound-demo&pr=${pull.number}`} className="inline-flex items-center gap-1 text-text hover:text-accent"><Waypoints className="size-4" aria-hidden />On the graph</a>}</div>
      {review && review.footer.headSha !== pull.head.sha && <p className="mt-4 text-sm leading-relaxed text-muted">This review is for an earlier commit ({review.footer.headSha.slice(0, 7)}). Check the current code on GitHub before applying a fix.</p>}
    </header>
    {findings.length ? <div className="space-y-6">{findings.map((finding) => <ReviewFinding key={finding.id} finding={finding} repo={repo} number={pull.number} reviewId={review!.id} />)}</div> : <EmptyState tone={review && !review.footer.posted ? "clean" : "info"}>{review ? review.footer.posted ? "The review’s inline comments are unavailable. Open the review on GitHub." : "TraceHound posted no findings in this review." : "No TraceHound review with a data footer has been posted on this pull request."}</EmptyState>}
  </>;
}
