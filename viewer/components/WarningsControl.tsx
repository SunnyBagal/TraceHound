"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";

/**
 * Compact warnings button: vertically centred on the canvas's right edge (left of the inspector
 * when it is open, never under it); bottom right above the safe area on phones. The list opens
 * as a popover that grows leftward (upward and leftward on phones).
 */
export function WarningsControl({ snapshot, onFocus, right = 0 }: { snapshot: Snapshot; onFocus: (componentId: string) => void; right?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // capture phase, so Esc closes the popover before the viewer's Esc closes the inspector
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const { warnings } = snapshot;
  if (!warnings.length) return null;
  const name = (id?: string) => snapshot.components.find((c) => c.id === id)?.name;
  const label = `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`;

  return (
    <div
      ref={ref}
      data-testid="warnings-control"
      className="absolute bottom-[calc(12px+env(safe-area-inset-bottom))] z-10 transition-[right] duration-300 md:bottom-auto md:top-1/2 md:-translate-y-1/2"
      style={{ right: right + 12 }}
    >
      <button
        type="button"
        data-testid="warnings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="warnings-popover"
        aria-label={label}
        title={label}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border bg-panel/95 px-2.5 py-1.5 text-[12.5px] font-medium text-text shadow-lg backdrop-blur",
          open ? "border-warn/60" : "border-line hover:border-line-strong",
        ].join(" ")}
      >
        <TriangleAlert className="size-4 text-warn" aria-hidden />
        {warnings.length}
      </button>
      {open && (
        <div
          id="warnings-popover"
          role="dialog"
          aria-label={label}
          className={[
            "absolute flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur",
            // phones: above the button, right-aligned; desktop: left of the button, centred on it
            "bottom-full right-0 mb-2 max-h-[60dvh] md:bottom-auto md:right-full md:top-1/2 md:mb-0 md:mr-2 md:max-h-[min(70dvh,520px)] md:-translate-y-1/2",
          ].join(" ")}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] font-medium text-text">
            <TriangleAlert className="size-4 text-warn" aria-hidden />
            {label}
          </div>
          <ul className="min-h-0 overflow-y-auto p-1.5" data-testid="warnings-list">
            {warnings.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={!w.componentId}
                  onClick={() => {
                    if (!w.componentId) return;
                    if (window.innerWidth < 768) setOpen(false); // the inspector takes the whole phone screen
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
        </div>
      )}
    </div>
  );
}
