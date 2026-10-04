import { ArrowUpRight } from "lucide-react";
import { LogoLink } from "./Logo";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Railway-style left rail (hidden below 640px, where the logo moves into the header). The
 * bottom avatar is an author credit linking to GitHub, not an account menu: there is no login.
 */
export function Rail() {
  return (
    <nav aria-label="TraceHound" data-testid="rail" className="hidden h-full w-14 shrink-0 flex-col items-center justify-between bg-panel py-3 sm:flex">
      <LogoLink className="size-10" />
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
        <span className="absolute bottom-0.5 right-0.5 grid size-3.5 place-items-center rounded-full border border-line bg-panel text-faint group-hover:text-text" aria-hidden>
          <ArrowUpRight className="size-2.5" />
        </span>
      </a>
    </nav>
  );
}
