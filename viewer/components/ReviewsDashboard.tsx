"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, GitPullRequest, MessageSquare, Wrench } from "lucide-react";
import { DEFAULT_REVIEW_REPO, MODEL_DISCLOSURE, loadPullReview, loadReviewList, pullHref, reviewNumber, reviewRepo, reviewsHref, type PullRequest, type PullReview, type ReviewList } from "@/lib/reviews";
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
const list = (repo: string) => loadReviewList(repo);
const detail = (repo: string, query: URLSearchParams) => loadPullReview(repo, reviewNumber(query.get("n")));
const stateLabel = (pull: PullRequest) => pull.merged_at ? "Merged" : pull.state === "open" ? "Open" : "Closed";
const plural = (count: number | undefined, noun: string) => `${noun}${count === 1 ? "" : "s"}`;

function LoadMessage({ state }: { state: Load<unknown> }) {
  if (state.status === "ready") return null;
  return <p role="status" className="rounded-xl border border-panel-line bg-panel px-5 py-8 text-sm leading-relaxed text-muted">{state.status === "loading" ? "Reading public reviews from GitHub…" : state.message}</p>;
}

export function ReviewsDashboard() {
  const { repo, state } = useReviewData(list);
  return <ReviewShell>
    <div className="mb-9 flex flex-wrap items-end justify-between gap-8">
      <div><p className="mb-3 text-sm font-medium text-accent">TRACEHOUND / REVIEWS</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bugs, with a way to fix them.</h1><p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted">Findings and suggested fixes from TraceHound’s GitHub reviews.</p></div>
      <RepositoryForm key={repo} repo={repo} />
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm leading-relaxed text-muted"><h2 className="break-all font-mono text-text">{repo}</h2><p>All open PRs + last 30 closed · {MODEL_DISCLOSURE}</p></div>
    <LoadMessage state={state} />
    {state.status === "ready" && <>
      {state.data.rateLimited && <p role="status" className="mb-4 text-sm text-muted">GitHub rate limit, try later</p>}
      {state.data.pulls.length === 0 ? <p className="rounded-xl border border-panel-line bg-panel p-6 text-base text-muted">No pull requests found in this repository.</p> : <ul className="divide-y divide-panel-line overflow-hidden rounded-2xl border border-panel-line bg-panel" aria-label="Pull requests">
        {state.data.pulls.map(({ pull, review, unavailable }) => <li key={pull.number}>
          <a href={reviewsHref(repo, pull.number)} className="group flex flex-wrap items-center justify-between gap-5 px-5 py-6 transition-colors hover:bg-card-hover sm:px-7">
            <div className="flex min-w-0 flex-1 items-start gap-4"><GitPullRequest className={`mt-1 size-5 shrink-0 ${pull.merged_at ? "text-violet-300" : pull.state === "open" ? "text-green-300" : "text-muted"}`} aria-hidden /><div className="min-w-0"><h3 className="text-base font-medium leading-relaxed text-text group-hover:text-accent">{pull.title}</h3><p className="mt-2 text-sm text-muted">#{pull.number} · {stateLabel(pull)}{unavailable ? " · Review unavailable" : !review ? " · No TraceHound review" : ""}</p></div></div>
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
    {state.status === "ready" && <PullFindings repo={repo} data={state.data} />}
  </ReviewShell>;
}

function PullFindings({ repo, data: { pull, review, findings } }: { repo: string; data: PullReview }) {
  return <>
    <header className="mb-9 border-b border-panel-line pb-8">
      <p className="mb-3 break-all font-mono text-sm text-muted">{repo} · #{pull.number} · {stateLabel(pull)}</p>
      <h1 className="max-w-[40ch] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{pull.title}</h1>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted"><p>{review ? `${review.footer.posted} ${plural(review.footer.posted, "finding")} · ${review.footer.fixes.valid} ${plural(review.footer.fixes.valid, "suggestion")}` : "No TraceHound review"} · {MODEL_DISCLOSURE}</p><a href={pullHref(repo, pull.number)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text hover:text-accent">Pull request on GitHub<ArrowUpRight className="size-4" aria-hidden /></a></div>
      {review && review.footer.headSha !== pull.head.sha && <p className="mt-4 text-sm leading-relaxed text-muted">This review is for an earlier commit ({review.footer.headSha.slice(0, 7)}). Check the current code on GitHub before applying a fix.</p>}
    </header>
    {findings.length ? <div className="space-y-6">{findings.map((finding) => <ReviewFinding key={finding.id} finding={finding} repo={repo} number={pull.number} reviewId={review!.id} />)}</div> : <p className="rounded-xl border border-panel-line bg-panel p-7 text-base leading-relaxed text-muted">{review ? review.footer.posted ? "The review’s inline comments are unavailable. Open the review on GitHub." : "TraceHound posted no findings in this review." : "No TraceHound review with a data footer has been posted on this pull request."}</p>}
  </>;
}
