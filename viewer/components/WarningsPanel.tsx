"use client";

import { ChevronRight, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";

export function WarningsPanel({ snapshot, onFocus }: { snapshot: Snapshot; onFocus: (componentId: string) => void }) {
  const [open, setOpen] = useState(true);
  const { warnings } = snapshot;
  if (!warnings.length) return null;
  const name = (id?: string) => snapshot.components.find((c) => c.id === id)?.name;
  return (
    <div className="absolute left-3 top-3 z-10 w-[min(360px,calc(100vw-76px))] rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]" aria-expanded={open}>
        <TriangleAlert className="size-4 text-warn" aria-hidden />
        <span className="font-medium text-text">
          {warnings.length} warning{warnings.length > 1 ? "s" : ""}
        </span>
        <ChevronRight className={`ml-auto size-4 text-faint transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="border-t border-line p-1.5" data-testid="warnings-list">
          {warnings.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                disabled={!w.componentId}
                onClick={() => {
                  if (!w.componentId) return;
                  if (window.innerWidth < 768) setOpen(false); // make room on phones
                  onFocus(w.componentId);
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-card disabled:cursor-default"
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-faint">
                  {w.kind}
                  {w.componentId && <span className="normal-case tracking-normal text-accent">→ {name(w.componentId)}</span>}
                </div>
                {w.file && <div className="mt-0.5 break-all font-mono text-[11.5px] text-text">{w.file}</div>}
                <div className="mt-0.5 text-[12px] leading-snug text-muted">{w.message}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
