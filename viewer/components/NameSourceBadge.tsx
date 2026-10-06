import { NamedByModel } from "./ModelMark";
import type { Component } from "@/lib/types";

/** Where a component's display name came from. A model-written name always names its model. */
export function NameSourceBadge({ naming }: { naming: Component["naming"] }) {
  if (naming.source === "llm") return <NamedByModel model={naming.model} />;
  const label = naming.source === "override" ? "override" : "heuristic";
  return (
    <span className="inline-flex items-center rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-muted" title={`Name source: ${label}${naming.source === "override" ? " (tracehound.json)" : ""}`}>
      {label}
    </span>
  );
}
