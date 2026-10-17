import { KIND_META } from "@/lib/kinds";
import type { Component } from "@/lib/types";

export function KindLegend({ components }: { components: Component[] }) {
  const present = [...new Set(components.map((c) => c.kind))];
  return (
    <details className="rounded-lg border border-line bg-panel/95 px-3 py-2 text-sm text-muted shadow-lg" data-testid="kind-legend">
      <summary className="cursor-pointer select-none">Component kinds · {present.length}</summary>
      <ul className="mt-3 grid gap-2 pb-1">
        {present.map((kind) => {
          const { icon: Icon, label, color } = KIND_META[kind];
          return <li key={kind} data-kind={kind} className="flex items-center gap-2"><Icon className="size-4" style={{ color }} aria-hidden /><span>{label}</span></li>;
        })}
      </ul>
    </details>
  );
}
