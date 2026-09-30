import { Sparkles } from "lucide-react";
import { modelWrittenLabel } from "@/lib/naming";
import type { Component } from "@/lib/types";

/** Where a component's display name and summary came from. Model output is always labelled. */
export function NameSourceBadge({ naming }: { naming: Component["naming"] }) {
  const modelLabel = modelWrittenLabel(naming);
  if (modelLabel) {
    return (
      <span
        data-testid="model-written"
        className="inline-flex max-w-full items-start gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] font-medium leading-tight text-accent"
        title={`${modelLabel}. Name and summary were written by ${naming.model} from extracted facts only; identifiers are checked against the facts, prose claims are not. Heuristic name: ${naming.heuristicName}`}
      >
        <Sparkles className="mt-px size-3 shrink-0" aria-hidden />
        <span>{modelLabel}</span>
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
