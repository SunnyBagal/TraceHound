import { ArrowUpRight, ChartNoAxesColumn, GitPullRequest, Waypoints, type LucideIcon } from "lucide-react";
import { LogoLink } from "./Logo";
import { reviewsHref } from "@/lib/reviews";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Railway-style left rail (hidden below 640px, where the logo moves into the header). The
 * bottom avatar is an author credit linking to GitHub, not an account menu: there is no login.
 */
function RailLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active?: boolean }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`rail-link relative grid size-10 place-items-center rounded-lg ${active ? "bg-card text-text" : "text-muted hover:bg-card hover:text-text"}`}
    >
      <Icon className="size-5" aria-hidden />
    </a>
  );
}

export function Rail({ active = "graph" }: { active?: "graph" | "reviews" | "benchmark" }) {
  return (
    <nav aria-label="TraceHound" data-testid="rail" className="hidden h-full w-14 shrink-0 flex-col items-center justify-between border-r border-hairline bg-page py-3 sm:flex">
      <div className="flex flex-col items-center gap-2">
        <LogoLink className="mb-2 size-10" />
        <RailLink href={`${base}/graph`} label="Graph" icon={Waypoints} active={active === "graph"} />
        <RailLink href={reviewsHref()} label="Reviews" icon={GitPullRequest} active={active === "reviews"} />
        <RailLink href={`${base}/benchmark`} label="Benchmark" icon={ChartNoAxesColumn} active={active === "benchmark"} />
      </div>
      <a
        href="https://github.com/SunnyBagal"
        target="_blank"
        rel="noreferrer"
        title="Built by Sunny Bagal"
        aria-label="Built by Sunny Bagal (GitHub)"
        data-testid="author-link"
        className="group relative grid size-10 place-items-center rounded-lg hover:bg-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- vendored static avatar */}
        <img src={`${base}/author/sunny-bagal.jpg`} alt="" width={28} height={28} className="size-7 rounded-full opacity-85 ring-1 ring-line group-hover:opacity-100" draggable={false} />
        <span className="absolute bottom-0.5 right-0.5 grid size-3.5 place-items-center rounded-full border border-line bg-page text-faint group-hover:text-text" aria-hidden>
          <ArrowUpRight className="size-2.5" />
        </span>
      </a>
    </nav>
  );
}
