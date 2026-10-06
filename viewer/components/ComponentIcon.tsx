import { KIND_META } from "@/lib/kinds";
import { headerFact, techLogo, techTitle, type TechFact } from "@/lib/tech";
import type { ComponentKind } from "@/lib/types";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** A vendored technology logo (public/icons, see CREDITS.md). */
export function TechLogo({ fact, className }: { fact: TechFact; className?: string }) {
  const { icon, tint } = techLogo(fact);
  const src = `${base}/icons/${icon}`;
  if (tint) {
    // a single-colour icon: the file is the mask, the tint fills it
    const mask = `url("${src}") center / contain no-repeat`;
    return <span aria-hidden data-logo={icon} className={["block", className].join(" ")} style={{ backgroundColor: tint, mask, WebkitMask: mask }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
  return <img src={src} alt="" data-logo={icon} className={["object-contain", className].join(" ")} draggable={false} />;
}

/**
 * The header icon: a technology logo only when a fact proves the component IS that technology
 * or runs on it as its framework/runtime (hover shows that fact); otherwise its generic kind
 * icon. Technologies it merely uses stay in the inspector's stack list (decision 031).
 *
 * "node" is the canvas card's icon: no tile, full-strength colour, a 22px slot. Lucide draws
 * inside a 2/24 margin, so line icons are rendered 26px and overhang the slot by 2px a side:
 * their strokes span the slot the way a logo does, and both look the same size. "header" is the
 * same without a tile at 28px, beside the inspector's name (Railway's panel header).
 */
export function ComponentIcon({ kind, tech, size = "md" }: { kind: ComponentKind; tech: TechFact[]; size?: "md" | "lg" | "node" | "header" }) {
  const primary = headerFact(tech);
  const { icon: Icon, label } = KIND_META[kind];
  const title = primary ? `${techTitle(primary)}${primary.use ? ` · ${primary.use.kind === "broker" ? "broker" : "data store"}: ${primary.use.reason}` : ""}` : `${label} (no data-store, framework or runtime fact)`;
  const props = { title, "aria-label": title, role: "img", "data-testid": "component-icon", "data-tech": primary?.tech ?? "none", "data-use": primary?.use?.kind } as const;
  if (size === "node") {
    return (
      <span className="grid size-[22px] shrink-0 place-items-center" {...props}>
        {primary ? <TechLogo fact={primary} className="size-[22px]" /> : <Icon className="-m-[2px] size-[26px] text-text" aria-hidden />}
      </span>
    );
  }
  if (size === "header") {
    return (
      <span className="grid size-7 shrink-0 place-items-center" {...props}>
        {primary ? <TechLogo fact={primary} className="size-7" /> : <Icon className="-m-[2.5px] size-[33px] text-text" aria-hidden />}
      </span>
    );
  }
  const box = size === "lg" ? "size-10 rounded-xl" : "size-8 rounded-lg";
  return (
    <span className={`grid shrink-0 place-items-center border border-line bg-panel ${box}`} {...props}>
      {primary ? <TechLogo fact={primary} className={size === "lg" ? "size-5.5" : "size-4.5"} /> : <Icon className={`${size === "lg" ? "size-5" : "size-4"} text-muted`} aria-hidden />}
    </span>
  );
}
