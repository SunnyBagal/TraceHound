import type { ReactNode } from "react";
import { LogoLink } from "./Logo";
import { DEFAULT_REVIEW_REPO, reviewsHref } from "@/lib/reviews";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export function ReviewShell({ children, active = "Reviews" }: { children: ReactNode; active?: "Reviews" | "Benchmark" }) {
  return <div className="page-shell h-dvh overflow-y-auto overflow-x-hidden bg-page text-text">
    <header className="sticky top-0 z-20 border-b border-hairline bg-page/80 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-10">
        <LogoLink href={`${base}/`} label="TraceHound home" title="TraceHound" markClassName="size-7" className="text-[17px] font-semibold tracking-[-0.01em]">TraceHound</LogoLink>
        <div className="flex items-center gap-1 text-sm">
          {[["Graph", `${base}/graph`], ["Reviews", reviewsHref()], ["Benchmark", `${base}/benchmark`]].map(([label, href]) => <a key={label} href={href} aria-current={active === label ? "page" : undefined} className={`rounded-lg px-3 py-2 transition-colors ${active === label ? "bg-card font-medium text-text" : "text-muted hover:bg-card hover:text-text"}`}>{label}</a>)}
        </div>
      </nav>
    </header>
    <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-10 sm:py-14">{children}</main>
    <footer className="mx-auto max-w-[1440px] border-t border-hairline px-5 py-8 text-sm leading-relaxed text-muted sm:px-10">Public GitHub data · fetched in your browser · no account required</footer>
  </div>;
}

export function RepositoryForm({ repo = DEFAULT_REVIEW_REPO }: { repo?: string }) {
  return <form action={`${base}/reviews`} method="get" className="flex w-full max-w-full flex-wrap items-end gap-3 sm:w-[32rem]">
    <label className="min-w-0 flex-1 text-sm text-muted">Public repository
      <input name="repo" defaultValue={repo} required aria-label="Public repository" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="owner/name" className="mt-2 block w-full rounded-lg border border-line-strong bg-bg px-3.5 py-3 font-mono text-sm text-text outline-none focus:border-accent" />
    </label>
    <button type="submit" className="rounded-lg bg-text px-5 py-3 text-sm font-semibold text-page transition-colors hover:bg-white">Load reviews</button>
  </form>;
}
