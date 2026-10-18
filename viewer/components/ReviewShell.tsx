import type { ReactNode } from "react";
import { LogoLink } from "./Logo";
import { DEFAULT_REVIEW_REPO, reviewsHref } from "@/lib/reviews";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export function ReviewShell({ children, active = "Reviews" }: { children: ReactNode; active?: "Reviews" | "Benchmark" }) {
  return <div className="h-dvh overflow-y-auto bg-page text-text">
    <header className="border-b border-panel-line bg-panel">
      <nav aria-label="Main" className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-10">
        <LogoLink href={`${base}/`} label="TraceHound home" title="TraceHound" markClassName="size-7" className="text-lg font-semibold">TraceHound</LogoLink>
        <div className="flex items-center gap-5 text-sm">
          {[["Graph", `${base}/graph`], ["Reviews", reviewsHref()], ["Benchmark", `${base}/benchmark`]].map(([label, href]) => <a key={label} href={href} aria-current={active === label ? "page" : undefined} className={active === label ? "font-medium text-text" : "text-muted hover:text-text"}>{label}</a>)}
        </div>
      </nav>
    </header>
    <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-10 sm:py-14">{children}</main>
    <footer className="mx-auto max-w-[1440px] px-5 pb-8 text-sm leading-relaxed text-muted sm:px-10">Public GitHub data · fetched in your browser · no account required</footer>
  </div>;
}

export function RepositoryForm({ repo = DEFAULT_REVIEW_REPO }: { repo?: string }) {
  return <form action={`${base}/reviews`} method="get" className="flex w-full max-w-full flex-wrap items-end gap-3 sm:w-[32rem]">
    <label className="min-w-0 flex-1 text-sm text-muted">Public repository
      <input name="repo" defaultValue={repo} required aria-label="Public repository" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="owner/name" className="mt-2 block w-full rounded-lg border border-line-strong bg-bg px-3.5 py-3 font-mono text-sm text-text outline-none focus:border-accent" />
    </label>
    <button type="submit" className="rounded-lg border border-accent/60 bg-accent-soft px-5 py-3 text-sm font-medium text-accent hover:bg-accent/20">Load reviews</button>
  </form>;
}
