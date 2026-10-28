import type { ReactNode } from "react";
import { LogoLink } from "./Logo";
import { DEFAULT_REVIEW_REPO, reviewsHref } from "@/lib/reviews";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const NAV = [["Graph", `${base}/graph`], ["Reviews", reviewsHref()], ["Benchmark", `${base}/benchmark`]] as const;

/** The reviews and benchmark pages: the landing's night theme, a hairline frame and mono tabs. */
export function ReviewShell({ children, active = "Reviews" }: { children: ReactNode; active?: "Reviews" | "Benchmark" }) {
  return <div className="page-shell h-dvh overflow-y-auto overflow-x-hidden bg-page text-text" data-page={active.toLowerCase()}>
    <header className="rv-top">
      <nav aria-label="Main" className="rv-top-bar">
        <LogoLink href={`${base}/`} label="TraceHound home" title="TraceHound" markClassName="size-7" className="text-[17px] font-semibold tracking-[-0.01em]"><span className="max-[480px]:sr-only">TraceHound</span></LogoLink>
        <div className="rv-tabs">
          {NAV.map(([label, href]) => <a key={label} href={href} aria-current={active === label ? "page" : undefined} className="rv-tab">{label}</a>)}
        </div>
      </nav>
    </header>
    <main className="rv-frame">{children}</main>
    <footer className="rv-foot">Public GitHub data · fetched in your browser · no account required</footer>
  </div>;
}

/**
 * A page's opening band: kicker, title and lede on the left; on the right an optional panel on the
 * landing's grainy gradient (tone = the landing tab the page belongs to).
 */
export function ShellHero({ kicker, title, children, aside, tone }: { kicker: string; title: ReactNode; children?: ReactNode; aside?: ReactNode; tone: "violet" | "green" }) {
  return <header className="rv-hero" data-has-aside={aside ? "" : undefined}>
    <div className="rv-hero-copy">
      <p className="fx-kicker">{kicker}</p>
      <h1 className="rv-h1">{title}</h1>
      {children}
    </div>
    {aside && <div className="fx-art rv-hero-art" data-tone={tone}><span className="fx-beams" aria-hidden />{aside}</div>}
  </header>;
}

export function RepositoryForm({ repo = DEFAULT_REVIEW_REPO }: { repo?: string }) {
  return <form action={`${base}/reviews`} method="get" className="rv-form">
    <label className="min-w-[220px] flex-1 text-sm text-muted">Public repository
      <input name="repo" defaultValue={repo} required aria-label="Public repository" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="owner/name" className="mt-2 block w-full rounded-lg border border-line-strong bg-bg px-3.5 py-3 font-mono text-sm text-text outline-none focus:border-accent" />
    </label>
    <button type="submit" className="rounded-lg bg-text px-5 py-3 text-sm font-semibold text-page transition-colors hover:bg-white">Load reviews</button>
  </form>;
}
