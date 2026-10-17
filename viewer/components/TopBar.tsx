"use client";

import { ExternalLink, GitCommitHorizontal, X } from "lucide-react";
import type { ChangeModel, ChangeSetEntry } from "@/lib/changes";
import { EDGE_STYLES } from "@/lib/graph";
import { githubSlug } from "@/lib/github";
import { commitHref, provenanceLabel } from "@/lib/provenance";
import type { RepoInfo } from "@/lib/repos";
import type { Resolution, Snapshot } from "@/lib/types";
import { LogoLink } from "./Logo";
import { RepoSwitcher } from "./RepoSwitcher";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function TopBar({ snapshot, repos = [], repoId, changeSets = [], changes }: { snapshot: Snapshot; repos?: RepoInfo[]; repoId?: string; changeSets?: ChangeSetEntry[]; changes?: ChangeModel }) {
  const slug = githubSlug(snapshot.repo);
  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 bg-page px-3 sm:gap-3 md:px-4">
      {/* the mark lives in the rail; below 640px the rail is hidden and it comes back here */}
      <LogoLink className="-ml-1 size-8 sm:hidden" />
      <RepoSwitcher repos={repos} repoId={repoId} label={repos.find((r) => r.id === repoId)?.displayName ?? snapshot.repo.name} changeSets={changeSets} changesId={changes?.entry.id} />
      {slug && (
        <a href={`https://github.com/${slug}/tree/${snapshot.repo.commitSha}`} target="_blank" rel="noreferrer" className="hidden shrink-0 text-faint hover:text-accent sm:inline" title={`${snapshot.repo.name} on GitHub at ${snapshot.repo.commitSha.slice(0, 7)}`} aria-label="Open on GitHub">
          <ExternalLink className="size-3.5" />
        </a>
      )}
      <a
        href={commitHref(snapshot.repo)}
        target="_blank"
        rel="noreferrer"
        title={`Snapshot of ${snapshot.repo.commitSha} · analyzer ${snapshot.analyzerVersion}`}
        data-testid="commit-chip"
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <GitCommitHorizontal className="size-3.5" aria-hidden />
        <span className="truncate">{provenanceLabel(snapshot.repo)}</span>
      </a>
      {changes && (
        <a
          href={repoId ? `${base}/graph?repo=${repoId}` : `${base}/graph`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/50 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:border-accent"
          title="Leave the change view"
          data-testid="exit-changes"
        >
          change set <X className="size-3" aria-hidden />
        </a>
      )}
      <div className={`ml-auto hidden items-center gap-3 ${changes ? "" : "lg:flex"}`} aria-label="Edge legend">
        {(Object.keys(EDGE_STYLES) as Resolution[]).map((label) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted" title={EDGE_STYLES[label].meaning}>
            <svg width="24" height="6" aria-hidden>
              <line x1="1" y1="3" x2="23" y2="3" stroke="var(--edge)" strokeWidth="1.8" strokeDasharray={EDGE_STYLES[label].dash} strokeLinecap={label === "dynamic" ? "round" : "butt"} />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </header>
  );
}
