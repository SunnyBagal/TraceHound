"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { RESIZE_STEP, RESIZE_STEP_BIG } from "@/lib/inspector-width";

/**
 * The inspector's left edge (desktop only): drag it, or focus it and use the arrow keys (Shift for
 * bigger steps, Home / End for the narrowest / widest). Dragging resizes the panel live through
 * `onPreview` and commits once on release, so the canvas re-frames once, not on every pixel.
 */
export function InspectorResizer({ width, min, max, onPreview, onCommit, controls }: {
  width: number;
  min: number;
  max: number;
  onPreview: (width: number | null) => void;
  onCommit: (width: number) => void;
  controls: string;
}) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, width, last: width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // the edge is on the panel's left: moving it left widens the panel
    d.last = clamp(d.width + (d.x - e.clientX));
    onPreview(d.last);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onPreview(null);
    if (d.last !== d.width) onCommit(d.last);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? RESIZE_STEP_BIG : RESIZE_STEP;
    const next =
      e.key === "ArrowLeft" ? width + step
      : e.key === "ArrowRight" ? width - step
      : e.key === "Home" ? min
      : e.key === "End" ? max
      : null;
    if (next === null) return;
    e.preventDefault();
    onCommit(clamp(next));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="inspector-resizer"
      title="Drag to resize (or focus and use ← →)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className="inspector-resizer absolute inset-y-0 left-0 z-30 w-2.5 cursor-col-resize touch-none max-md:hidden"
    />
  );
}
