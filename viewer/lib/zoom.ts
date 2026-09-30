/**
 * Railway-style capped zoom on an unbounded canvas (decision 031): pan anywhere, but zoom stays
 * between these limits, including fit view and every programmatic pan.
 */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 1.5;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * The keep-selection-visible pan: the viewport that brings `bounds` (flow coordinates) into the
 * part of the pane the inspector doesn't cover, or null when it is already there. It pans at the
 * current zoom, clamped to the limits; it never zooms to make something fit.
 */
export function keepInView(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: Viewport,
  pane: { width: number; height: number },
  occludeRight: number,
  margin: number,
): Viewport | null {
  const zoom = clampZoom(viewport.zoom);
  const { x, y } = viewport;
  const visible = { left: margin, top: margin, right: pane.width - occludeRight - margin, bottom: pane.height - margin };
  const screen = { left: bounds.minX * zoom + x, top: bounds.minY * zoom + y, right: bounds.maxX * zoom + x, bottom: bounds.maxY * zoom + y };
  const inside = screen.left >= visible.left && screen.right <= visible.right && screen.top >= visible.top && screen.bottom <= visible.bottom;
  if (visible.right <= visible.left) return null;
  if (inside) return zoom === viewport.zoom ? null : { x, y, zoom };
  const dx = (visible.left + visible.right) / 2 - (screen.left + screen.right) / 2;
  const dy = screen.top < visible.top || screen.bottom > visible.bottom ? (visible.top + visible.bottom) / 2 - (screen.top + screen.bottom) / 2 : 0;
  return { x: x + dx, y: y + dy, zoom };
}
