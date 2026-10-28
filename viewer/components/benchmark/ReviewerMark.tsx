import { Logo } from "@/components/Logo";
import { reviewerOf, type Reviewer } from "@/lib/benchmark-view";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/* vendored logos (public/icons/CREDITS.md), drawn as masks in the text colour */
const FILES: Record<Exclude<Reviewer, "tracehound">, string> = {
  augment: "augment.svg",
  cursor: "cursor.svg",
  greptile: "greptile.svg",
  copilot: "githubcopilot.svg",
  coderabbit: "coderabbit.svg",
};

/** A reviewer's logo beside its name; TraceHound's rows get the wolf. Nothing for a row that names no reviewer. */
export function ReviewerMark({ name, className = "" }: { name: string; className?: string }) {
  const who = reviewerOf(name);
  if (!who) return null;
  if (who === "tracehound") return <span className={`bench-mark bench-mark-wolf ${className}`} data-reviewer={who} aria-hidden><Logo className="size-full" /></span>;
  return <span className={`bench-mark ${className}`} data-reviewer={who} aria-hidden style={{ "--logo-url": `url(${base}/icons/brands/${FILES[who]})` } as React.CSSProperties} />;
}

