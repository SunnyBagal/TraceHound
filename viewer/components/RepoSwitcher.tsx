"use client";

import { Check, ChevronsUpDown, GitCompareArrows } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeSetEntry } from "@/lib/changes";
import { repoHref, type RepoInfo } from "@/lib/repos";

const KIND_LABEL: Record<ChangeSetEntry["kind"], string> = { commit: "commit", run: "repair run", demo: "demo diff" };

/**
 * The repo gallery: every repo of snapshots/index.json (?repo=<id>) and, under each, its change sets
 * (?repo=<id>&changes=<change id>). Change sets of a repo without a published snapshot are listed last.
 */
export function RepoSwitcher({ repos, repoId, label, changeSets, changesId }: { repos: RepoInfo[]; repoId?: string; label: string; changeSets: ChangeSetEntry[]; changesId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const href = (id: string, changes?: string) => (typeof window === "undefined" ? `?repo=${id}` : repoHref(window.location.pathname, window.location.search, id, changes));
  const known = new Set(repos.map((r) => r.id));
  const orphanSets = changeSets.filter((c) => !known.has(c.repo));
  const sets = (id: string) => changeSets.filter((c) => c.repo === id);
  const ChangeLink = ({ c }: { c: ChangeSetEntry }) => (
    <a
      href={href(c.repo, c.id)}
      data-testid="changeset-link"
      aria-current={c.id === changesId ? "page" : undefined}
      className="flex items-center gap-2 rounded-lg py-1.5 pl-7 pr-2 text-[13px] text-muted hover:bg-card hover:text-text aria-[current=page]:text-accent"
    >
      <GitCompareArrows className="size-3.5 shrink-0 text-faint" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{c.title}</span>
      <span className="shrink-0 text-[11px] text-faint">{KIND_LABEL[c.kind]}</span>
    </a>
  );

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="repo-switcher"
        title="Switch repo or open a change set"
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm text-text hover:bg-card"
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Repos and change sets" data-testid="repo-menu" className="fixed inset-x-3 top-14 z-40 max-h-[75dvh] overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[380px]">
          {repos.map((r) => (
            <div key={r.id} data-testid="repo-option" data-repo-id={r.id}>
              <a
                href={href(r.id)}
                aria-current={r.id === repoId && !changesId ? "page" : undefined}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-card"
              >
                <span className="grid size-4 shrink-0 place-items-center">{r.id === repoId && <Check className="size-4 text-accent" aria-label="current repo" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text">{r.name}</span>
                  <span className="block font-mono text-[11px] text-faint">
                    {r.latest.sha.slice(0, 7)} · analyzer {r.latest.analyzerVersion}
                  </span>
                </span>
              </a>
              {sets(r.id).map((c) => (
                <ChangeLink key={c.id} c={c} />
              ))}
            </div>
          ))}
          {orphanSets.length > 0 && (
            <div className="mt-1 border-t border-line pt-1">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-faint">No published snapshot</div>
              {orphanSets.map((c) => (
                <ChangeLink key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
