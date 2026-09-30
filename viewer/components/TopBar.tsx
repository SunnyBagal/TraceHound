"use client";

import { Check, Copy, GitCommitHorizontal } from "lucide-react";
import { useState } from "react";
import { EDGE_STYLES } from "@/lib/graph";
import { githubSlug } from "@/lib/github";
import type { Resolution, Snapshot } from "@/lib/types";
import { LogoLink } from "./Logo";

export function TopBar({ snapshot }: { snapshot: Snapshot }) {
  const [copied, setCopied] = useState(false);
  const slug = githubSlug(snapshot.repo);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.repo.commitSha);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked: the full SHA is still in the title tooltip
    }
  };
  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 md:px-4">
      {/* the mark lives in the rail; below 640px the rail is hidden and it comes back here */}
      <LogoLink className="-ml-1 size-8 sm:hidden" />
      <span className="hidden shrink-0 text-sm font-semibold tracking-tight sm:inline">TraceHound</span>
      <span className="shrink-0 text-line-strong">/</span>
      {slug ? (
        <a href={`https://github.com/${slug}/tree/${snapshot.repo.commitSha}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-text hover:text-accent">
          {snapshot.repo.name}
        </a>
      ) : (
        <span className="min-w-0 truncate text-sm">{snapshot.repo.name}</span>
      )}
      <button
        type="button"
        onClick={copy}
        title={`Snapshot of ${snapshot.repo.commitSha} · analyzer ${snapshot.analyzerVersion}`}
        aria-label={`Copy commit ${snapshot.repo.commitSha}`}
        data-testid="commit-chip"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 font-mono text-[11px] text-muted hover:border-line-strong hover:text-text"
      >
        <GitCommitHorizontal className="size-3.5" aria-hidden />
        {snapshot.repo.commitSha.slice(0, 7)}
        {copied ? <Check className="size-3 text-accent" aria-label="copied" /> : <Copy className="size-3" aria-hidden />}
      </button>
      <div className="ml-auto hidden items-center gap-3 lg:flex" aria-label="Edge legend">
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
