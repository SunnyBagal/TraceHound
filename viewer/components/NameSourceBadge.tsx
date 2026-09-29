import { Sparkles } from "lucide-react";
import type { Component } from "@/lib/types";

/** Where a component's display name came from. */
export function NameSourceBadge({ naming, compact = false }: { naming: Component["naming"]; compact?: boolean }) {
  if (naming.source === "llm") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
        title={`Named by ${naming.model ?? "Nemotron"} from extracted facts; heuristic name: ${naming.heuristicName}`}
      >
        <Sparkles className="size-3" aria-hidden />
        {compact ? "Nemotron" : "named by Nemotron"}
      </span>
    );
  }
  const label = naming.source === "override" ? "override" : "heuristic";
  return (
    <span className="inline-flex items-center rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-medium text-muted" title={`Name source: ${label}`}>
      {label}
    </span>
  );
}
