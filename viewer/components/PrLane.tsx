"use client";

import { ArrowUpRight, GitMerge, GitPullRequest, GitPullRequestClosed, LoaderCircle, PanelLeftClose, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

function PullRow({ pull, active, onSelect, children }: { pull: LanePull; active: boolean; onSelect: () => void; children?: ReactNode }) {
  const Icon = STATE_ICON[pull.state];
  const ref = useRef<HTMLLIElement>(null);
  // a deep-linked or chosen PR is scrolled into the panel's view
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  return (
    <li ref={ref} className={["border", active ? "border-accent bg-accent-soft" : "border-transparent hover:border-line hover:bg-card"].join(" ")}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid="pr-chip"
        data-status={pull.status}
        title={pull.title}
        className={`pr-chip flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm ${active ? "text-text" : "text-muted hover:text-text"}`}
      >
        <Icon className={`mt-0.5 size-4 shrink-0 ${STATE_TONE[pull.state]}`} aria-label={pull.state} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 leading-snug text-text"><span className="font-mono text-faint">#{pull.number}</span> {pull.title}</span>
          <span className={`mt-1.5 inline-block px-1.5 py-px font-mono text-xs ${pull.status === "reviewed" ? "bg-accent text-ink" : "border border-line-strong text-muted"}`} data-testid="pr-status">
            {pull.status === "reviewed" ? `${pull.findingCount} finding${pull.findingCount === 1 ? "" : "s"}` : STATUS_LABEL[pull.status]}
          </span>
        </span>
      </button>
      {children}
    </li>
  );
}

const PANEL_KEY = "tracehound:pr-panel";

/** Open by default; closing it is remembered across visits. */
function usePanelOpen() {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.localStorage.getItem(PANEL_KEY) === "closed") setOpen(false); }, []);
  const toggle = useCallback(() => setOpen((o) => {
    window.localStorage.setItem(PANEL_KEY, o ? "closed" : "open");
    return !o;
  }), []);
  return [open, toggle] as const;
}

/** Left of the canvas: the repo's pull requests, newest first. The selected one opens its summary in place and outlines its cards. */
export function PrLane({ repo, list, selected, onSelect, overlay, model }: { repo: string; list: Load<LaneList>; selected: number | null; onSelect: (n: number | null) => void; overlay: Load<PullOverlayData> | null; model: PrOverlay | null }) {
  const [open, toggle] = usePanelOpen();
  const count = list.status === "ready" ? list.data.pulls.length : null;
  if (!open) {
    // closed: the same button, floating in the canvas's top-left corner
    return (
      <button type="button" onClick={toggle} aria-expanded={false} data-testid="pr-toggle" className="absolute left-3 top-3 z-10 inline-flex h-9 items-center gap-2 border border-line bg-panel px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted shadow-[0_8px_24px_-12px_var(--scrim)] hover:border-line-strong hover:text-text max-md:hidden">
        <GitPullRequest className="size-4 text-accent" aria-hidden />
        Pull requests
        {count !== null && <span className="font-mono normal-case tracking-normal text-faint">{count}</span>}
        {selected !== null && <span className="bg-accent px-1.5 font-mono normal-case tracking-normal text-ink">#{selected}</span>}
      </button>
    );
  }
  return (
    <aside aria-label="Pull requests" data-testid="pr-lane" className="flex w-[300px] shrink-0 flex-col pb-1.5 pl-2 pr-2 max-md:hidden">
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-1">
        <button type="button" onClick={toggle} aria-expanded data-testid="pr-toggle" title="Hide pull requests" className="inline-flex h-7 items-center gap-1.5 border border-transparent px-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-faint hover:border-line hover:text-text">
          <PanelLeftClose className="size-4" aria-hidden /> Pull requests
        </button>
        <a href={`https://github.com/${repo}/pulls`} target="_blank" rel="noreferrer" aria-label="Pull requests on GitHub" title="Open on GitHub" className="grid size-7 place-items-center text-faint hover:text-text">
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        {selected !== null && (
          <button type="button" onClick={() => onSelect(null)} className="ml-auto inline-flex shrink-0 items-center gap-1 border border-line-strong px-2 py-0.5 text-xs text-muted hover:text-text" data-testid="pr-clear">
            <X className="size-3" aria-hidden /> Plain graph
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border border-line bg-panel p-1.5">
        {list.status === "loading" && <p className="inline-flex items-center gap-2 p-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Loading pull requests…</p>}
        {list.status === "error" && <p role="status" className="p-2 text-sm text-muted">{list.message}</p>}
        {list.status === "ready" && (
          <>
            {list.data.pulls.length === 0 ? <p className="p-2 text-sm text-muted">No pull requests yet.</p> : (
              <ol className="space-y-1" data-testid="pr-list">
                {list.data.pulls.map((p) => (
                  <PullRow key={p.number} pull={p} active={selected === p.number} onSelect={() => onSelect(selected === p.number ? null : p.number)}>
                    {selected === p.number && overlay && <PrSummary repo={repo} overlay={overlay} model={model} />}
                  </PullRow>
                ))}
              </ol>
            )}
            {list.data.notice && <p role="status" className="mt-2 px-2 pb-1 text-xs leading-snug text-faint" data-testid="pr-notice">{list.data.notice}</p>}
          </>
        )}
      </div>
    </aside>
  );
}

/** Under the selected PR's row: what it touched, and everything the graph can't place. */
function PrSummary({ repo, overlay, model }: { repo: string; overlay: Load<PullOverlayData>; model: PrOverlay | null }) {
  if (overlay.status === "loading") return <div className="pr-summary border-t border-line px-3 py-2.5" data-testid="pr-summary"><p className="inline-flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Loading the pull request…</p></div>;
  if (overlay.status === "error") return <div className="pr-summary border-t border-line px-3 py-2.5" data-testid="pr-summary" role="status"><p className="text-sm text-muted">{overlay.message}</p></div>;
  const { data } = overlay;
  const inGraph = model ? [...model.touched.values()].reduce((n, f) => n + f.length, 0) : 0;
  const outside = model?.outsideFiles ?? [];
  const outsideFindings = model?.outsideFindings ?? [];
  return (
    <div className="pr-summary border-t border-line px-3 py-2.5" data-testid="pr-summary">
      <p className="text-sm text-muted">
        {data.files.length} file{data.files.length === 1 ? "" : "s"} changed · {inGraph} in {model?.touched.size ?? 0} component{model?.touched.size === 1 ? "" : "s"} · {data.findings.length} finding{data.findings.length === 1 ? "" : "s"}
      </p>
      <a href={pullHref(repo, data.number)} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-faint hover:text-accent">
        Open on GitHub <ArrowUpRight className="size-3" aria-hidden />
      </a>
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
