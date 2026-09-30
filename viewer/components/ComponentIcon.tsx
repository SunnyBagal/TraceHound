import { KIND_META } from "@/lib/kinds";
import { TECH_META, techTitle, type TechFact } from "@/lib/tech";
import type { ComponentKind } from "@/lib/types";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** A vendored technology logo (public/icons, see CREDITS.md). */
export function TechLogo({ fact, className }: { fact: TechFact; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
  return <img src={`${base}/icons/${TECH_META[fact.tech].icon}`} alt="" className={["object-contain", className].join(" ")} draggable={false} />;
}

/**
 * The header icon: the component's primary technology when a fact proves one (hover shows that
 * fact), otherwise its generic kind icon.
 */
export function ComponentIcon({ kind, tech, size = "md" }: { kind: ComponentKind; tech: TechFact[]; size?: "md" | "lg" }) {
  const primary = tech[0];
  const { icon: Icon, label } = KIND_META[kind];
  const box = size === "lg" ? "size-10 rounded-xl" : "size-8 rounded-lg";
  const title = primary ? techTitle(primary) : `${label} (no technology fact)`;
  return (
    <span
      className={`grid shrink-0 place-items-center border border-line bg-panel ${box}`}
      title={title}
      aria-label={title}
      role="img"
      data-testid="component-icon"
      data-tech={primary?.tech ?? "none"}
    >
      {primary ? <TechLogo fact={primary} className={size === "lg" ? "size-5.5" : "size-4.5"} /> : <Icon className={`${size === "lg" ? "size-5" : "size-4"} text-muted`} aria-hidden />}
    </span>
  );
}
