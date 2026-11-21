"use client";

import { useCallback, useEffect, useState } from "react";
import { INSPECTOR_GAP, INSPECTOR_MIN_VIEWPORT, inspectorWidth } from "./inspector";

/**
 * The desktop inspector's width once the reader has dragged its left edge (ui-01). Without a
 * stored width it is lib/inspector.ts's clamp(480px, 50vw, 760px). A stored width is kept between
 * RESIZE_MIN and RESIZE_MAX and never leaves the canvas narrower than CANVAS_KEEP px. Storage may
 * throw (private windows, blocked site data): every read and write is wrapped, and the page then
 * just uses the default width.
 *
 * Follow-ups to codex-ui's review of 31ae6f5 (ui-01b):
 * - without a reserve, the default width is always inside the bounds: at 768-859px the default
 *   (480px) used to sit above `max`, so aria-valuenow exceeded aria-valuemax and the first arrow
 *   key jumped to a narrower panel;
 * - `reserve` is extra px the canvas side needs right now (the PR list expanded over an open
 *   inspector, LANE_RESERVE). The inspector narrows for as long as it lasts; the stored width is
 *   kept, so it comes back when the list folds to its rail again.
 */
export const WIDTH_KEY = "tracehound:inspector-width";
export const RESIZE_MIN = 400;
export const RESIZE_MAX = 1100;
/** px of canvas (plus the rail and gutters) always left beside the inspector */
export const CANVAS_KEEP = 380;
/** arrow keys move the edge this far; with Shift, RESIZE_STEP_BIG */
export const RESIZE_STEP = 16;
export const RESIZE_STEP_BIG = 64;
/** the expanded PR list (300px) minus its icon rail (3.25rem = 52px), which CANVAS_KEEP already counts */
export const LANE_RESERVE = 300 - 52;

export function resizeBounds(viewportWidth: number, reserve = 0): { min: number; max: number } {
  const room = Math.min(RESIZE_MAX, viewportWidth - CANVAS_KEEP - reserve);
  const max = Math.max(RESIZE_MIN, room, reserve ? 0 : Math.round(inspectorWidth(viewportWidth)));
  return { min: RESIZE_MIN, max };
}

export function clampWidth(width: number, viewportWidth: number, reserve = 0): number {
  const { min, max } = resizeBounds(viewportWidth, reserve);
  return Math.round(Math.min(max, Math.max(min, width)));
}

export function readStoredWidth(storage: () => Storage | undefined = () => window.localStorage): number | null {
  try {
    const raw = storage()?.getItem(WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeStoredWidth(width: number, storage: () => Storage | undefined = () => window.localStorage): void {
  try {
    storage()?.setItem(WIDTH_KEY, String(Math.round(width)));
  } catch {
    // storage unavailable: the width lasts for this visit only
  }
}

/** The width the inspector has at this viewport: the stored one or the default, inside the bounds; 0 on phones. */
export function effectiveWidth(viewportWidth: number, stored: number | null, reserve = 0): number {
  if (viewportWidth < INSPECTOR_MIN_VIEWPORT) return 0;
  return clampWidth(stored ?? inspectorWidth(viewportWidth), viewportWidth, reserve);
}

/**
 * Viewer's single source for the inspector width: `width` (0 on phones), `occlusion` (width + gap,
 * what the canvas avoids), `bounds` for the separator, and `setWidth`, which clamps and persists.
 */
export function useInspectorWidth(reserve = 0) {
  const [viewport, setViewport] = useState(0);
  const [stored, setStored] = useState<number | null>(null);
  useEffect(() => {
    setStored(readStoredWidth());
    const measure = () => setViewport(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const width = viewport ? effectiveWidth(viewport, stored, reserve) : 0;
  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next, window.innerWidth, reserve);
    setStored(clamped);
    writeStoredWidth(clamped);
  }, [reserve]);
  return { width, occlusion: width ? width + INSPECTOR_GAP : 0, bounds: resizeBounds(viewport || INSPECTOR_MIN_VIEWPORT, reserve), setWidth };
}
