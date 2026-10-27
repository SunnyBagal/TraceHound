"use client";

import { ArrowUpRight, CircleDot, GitMerge, GitPullRequest, GitPullRequestClosed, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { prParam, pullsClient, type LaneList, type LanePull, type PullOverlayData, type PrOverlay, type ReviewStatus } from "@/lib/pulls";
import { pullHref } from "@/lib/reviews";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** The lane's list, the selected PR (?pr=N, replaced in place) and that PR's files and findings. */
export function usePrLane(repo: string | undefined) {
  const [list, setList] = useState<Load<LaneList> | null>(null);
  const [selected, setSelected] = useState<number | null>(() => (typeof window === "undefined" ? null : prParam(window.location.search)));
  const [overlay, setOverlay] = useState<Load<PullOverlayData> | null>(null);

  useEffect(() => {
    if (!repo) { setList(null); return; }
    let active = true;
    setList({ status: "loading" });
    pullsClient().list(repo)
      .then((data) => { if (active) setList({ status: "ready", data }); })
      .catch((error: Error) => { if (active) setList({ status: "error", message: error.message }); });
    return () => { active = false; };
  }, [repo]);

  useEffect(() => {
    if (!repo || selected === null) { setOverlay(null); return; }
    let active = true;
    setOverlay({ status: "loading" });
    pullsClient().overlay(repo, selected)
      .then((data) => { if (active) setOverlay({ status: "ready", data }); })
      .catch((error: Error) => { if (active) setOverlay({ status: "error", message: error.message }); });
    return () => { active = false; };
  }, [repo, selected]);

  const select = useCallback((n: number | null) => {
    setSelected(n);
    const params = new URLSearchParams(window.location.search);
    if (n === null) params.delete("pr"); else params.set("pr", String(n));
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  return { list, selected, overlay, select };
}

const STATE_ICON = { open: GitPullRequest, merged: GitMerge, closed: GitPullRequestClosed } as const;
const STATE_TONE = { open: "text-diff-added", merged: "text-highlight", closed: "text-diff-removed" } as const;
export const STATUS_LABEL: Record<ReviewStatus, string> = { reviewed: "reviewed", "no-findings": "no findings", "not-reviewed": "not reviewed", unknown: "review unknown" };

function PullChip({ pull, active, onSelect }: { pull: LanePull; active: boolean; onSelect: () => void }) {
  const Icon = STATE_ICON[pull.state];
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid="pr-chip"
        data-status={pull.status}
        title={pull.title}
        className={[
          "pr-chip group flex h-11 max-w-[300px] items-center gap-2.5 rounded-lg border px-3 text-left text-sm",
          active ? "border-accent bg-accent-soft text-text shadow-[0_0_0_1px_var(--accent),0_0_24px_-8px_var(--accent-glow)]" : "border-line bg-card text-muted hover:border-line-strong hover:bg-card-hover hover:text-text",
        ].join(" ")}
      >
        <Icon className={`size-4 shrink-0 ${STATE_TONE[pull.state]}`} aria-label={pull.state} />
        <span className="font-mono text-faint">#{pull.number}</span>
        <span className="min-w-0 truncate text-text">{pull.title}</span>
        <span className={`shrink-0 rounded-md px-1.5 py-px font-mono text-xs ${pull.status === "reviewed" ? "bg-accent text-ink" : "border border-line-strong text-muted"}`} data-testid="pr-status">
          {pull.status === "reviewed" ? `${pull.findingCount} finding${pull.findingCount === 1 ? "" : "s"}` : STATUS_LABEL[pull.status]}
        </span>
      </button>
    </li>
  );
}

/** A horizontal strip above the canvas: the repo's pull requests, newest first. */
export function PrLane({ repo, list, selected, onSelect }: { repo: string; list: Load<LaneList>; selected: number | null; onSelect: (n: number | null) => void }) {
  return (
    <section aria-label="Pull requests" data-testid="pr-lane" className="flex min-w-0 shrink-0 items-center gap-3 px-3 pb-2 md:px-4">
      <a href={`https://github.com/${repo}/pulls`} target="_blank" rel="noreferrer" className="hidden shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-faint hover:text-text md:inline-flex">
        Pull requests <ArrowUpRight className="size-3" aria-hidden />
      </a>
      {list.status === "loading" && <p className="inline-flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Loading pull requests…</p>}
      {list.status === "error" && <p role="status" className="text-sm text-muted">{list.message}</p>}
      {list.status === "ready" && (
        <>
          {list.data.pulls.length === 0 ? <p className="text-sm text-muted">No pull requests yet.</p> : (
            <ol className="lane-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" data-testid="pr-list">
              {list.data.pulls.map((p) => <PullChip key={p.number} pull={p} active={selected === p.number} onSelect={() => onSelect(selected === p.number ? null : p.number)} />)}
            </ol>
          )}
          {list.data.notice && <p role="status" className="hidden max-w-[34ch] shrink-0 text-xs leading-snug text-faint xl:block" data-testid="pr-notice">{list.data.notice}</p>}
        </>
      )}
      {selected !== null && (
        <button type="button" onClick={() => onSelect(null)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-sm text-muted hover:text-text" data-testid="pr-clear">
          <X className="size-3.5" aria-hidden /> Plain graph
        </button>
      )}
    </section>
  );
}

/** Over the canvas (top left): what the selected PR touched, and everything the graph can't place. */
export function PrSummary({ repo, overlay, model }: { repo: string; overlay: Load<PullOverlayData>; model: PrOverlay | null }) {
  if (overlay.status === "loading") return <div className="pr-summary" data-testid="pr-summary"><p className="inline-flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Loading the pull request…</p></div>;
  if (overlay.status === "error") return <div className="pr-summary" data-testid="pr-summary" role="status"><p className="text-sm text-muted">{overlay.message}</p></div>;
  const { data } = overlay;
  const inGraph = model ? [...model.touched.values()].reduce((n, f) => n + f.length, 0) : 0;
  const outside = model?.outsideFiles ?? [];
  const outsideFindings = model?.outsideFindings ?? [];
  return (
    <div className="pr-summary" data-testid="pr-summary">
      <a href={pullHref(repo, data.number)} target="_blank" rel="noreferrer" className="group flex items-start gap-2 text-sm font-semibold text-text hover:text-accent">
        <CircleDot className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0"><span className="font-mono text-faint">#{data.number}</span> {data.title}</span>
        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-faint group-hover:text-accent" aria-hidden />
      </a>
      <p className="mt-1.5 text-sm text-muted">
        {data.files.length} file{data.files.length === 1 ? "" : "s"} changed · {inGraph} in {model?.touched.size ?? 0} component{model?.touched.size === 1 ? "" : "s"} · {data.findings.length} finding{data.findings.length === 1 ? "" : "s"}
      </p>
      {data.notice && <p className="mt-1.5 text-xs leading-snug text-faint" role="status">{data.notice}</p>}
      {(outside.length > 0 || outsideFindings.length > 0) && (
        <details className="mt-2.5 border-t border-line pt-2" data-testid="outside-graph" open={outsideFindings.length > 0}>
          <summary className="cursor-pointer text-sm text-muted hover:text-text">Outside the graph · {outside.length} file{outside.length === 1 ? "" : "s"}{outsideFindings.length ? ` · ${outsideFindings.length} finding${outsideFindings.length === 1 ? "" : "s"}` : ""}</summary>
          <ul className="mt-2 space-y-1">
            {outside.map((f) => <li key={f} className="break-all font-mono text-xs text-muted">{f}</li>)}
          </ul>
          {outsideFindings.length > 0 && (
            <ul className="mt-2 space-y-2">
              {outsideFindings.map((f) => (
                <li key={f.id}>
                  <a className="block text-xs leading-snug text-text hover:text-accent" href={pullHref(repo, data.number, f.commentId ? `#discussion_r${f.commentId}` : "")} target="_blank" rel="noreferrer">
                    <span className="break-all font-mono text-muted">{f.path}{f.line !== null ? `:${f.line}` : ""}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}
