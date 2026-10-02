"use client";

import { ChevronRight, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { orderComponents, rollupBadges, type ChangeModel } from "@/lib/changes";
import { techFacts } from "@/lib/tech";
import { ComponentChanges, ComponentName } from "./ChangeParts";
import { ComponentIcon } from "./ComponentIcon";
import { NoWarnings, WarningCard } from "./ChangeWarningsPanel";

const TONE = { added: "text-diff-added", removed: "text-diff-removed", modified: "text-diff-modified", muted: "text-faint", warn: "text-warn" } as const;

/**
 * Phones: the change view as a list. Warnings first, then the touched components (warned first),
 * each expanding into files and declarations; untouched components last, collapsed.
 */
export function ChangeList({ model, onOpen }: { model: ChangeModel; onOpen: (id: string) => void }) {
  const ordered = useMemo(() => orderComponents(model.display.components, model.diffs), [model]);
  const touched = ordered.filter((c) => model.diffs.has(c.id));
  const untouched = ordered.filter((c) => !model.diffs.has(c.id));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(touched.length === 1 ? [touched[0]!.id] : []));
  const [showUntouched, setShowUntouched] = useState(false);
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (id: string) => {
    const c = model.display.components.find((x) => x.id === id)!;
    const diff = model.diffs.get(id);
    const open = expanded.has(id);
    return (
      <li key={id} data-testid="change-row" data-component-id={id} className={`rounded-xl border bg-card ${diff?.warnings ? "border-warn/60" : "border-line"} ${diff ? "" : "opacity-60"}`}>
        <button type="button" onClick={() => toggle(id)} aria-expanded={open} className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left">
          <ComponentIcon kind={c.kind} tech={techFacts(model.display, c)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-text">
              <ComponentName model={model} id={id} />
            </span>
            <span className="flex flex-wrap gap-1 pt-0.5">
              {diff ? (
                rollupBadges(diff).map((b) => (
                  <span key={b.key} title={b.title} className={`rounded border border-line bg-panel px-1 font-mono text-[11px] font-semibold ${TONE[b.tone]}`}>
                    {b.text}
                  </span>
                ))
              ) : (
                <span className="text-[12px] text-faint">unchanged</span>
              )}
            </span>
          </span>
          <ChevronRight className={`size-4 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        </button>
        {open && (
          <div className="border-t border-line px-3 py-3">
            <ComponentChanges model={model} componentId={id} onOpen={onOpen} />
            <button type="button" onClick={() => onOpen(id)} className="mt-3 text-[13px] text-accent hover:underline">
              Component details →
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3" data-testid="change-list">
      <section aria-label="What could break">
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
          <TriangleAlert className={`size-3.5 ${model.warnings.length ? "text-warn" : ""}`} aria-hidden /> What could break
          <span className="font-normal">{model.warnings.length}</span>
        </h2>
        {model.warnings.length ? (
          <ul className="space-y-2.5">
            {model.warnings.map((w) => (
              <WarningCard key={w.id} model={model} warning={w} active={false} onOpen={(id) => setExpanded((s) => new Set(s).add(id))} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-line bg-card/50 p-3">
            <NoWarnings />
          </div>
        )}
      </section>
      <section aria-label="Components" className="mt-5">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-faint">
          Components touched <span className="font-normal">{touched.length}</span>
        </h2>
        <ul className="space-y-2">{touched.map((c) => row(c.id))}</ul>
        {untouched.length > 0 && (
          <>
            <button type="button" onClick={() => setShowUntouched((o) => !o)} aria-expanded={showUntouched} className="mt-3 flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
              <ChevronRight className={`size-3.5 transition-transform ${showUntouched ? "rotate-90" : ""}`} aria-hidden />
              {showUntouched ? "Hide" : "Show"} {untouched.length} unchanged component{untouched.length === 1 ? "" : "s"}
            </button>
            {showUntouched && <ul className="mt-2 space-y-2">{untouched.map((c) => row(c.id))}</ul>}
          </>
        )}
      </section>
    </div>
  );
}
