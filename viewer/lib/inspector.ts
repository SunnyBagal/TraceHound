/**
 * The desktop inspector floats over the canvas like Railway's: about half the viewport wide,
 * clamp(480px, 50vw, 760px), inset INSPECTOR_GAP px from the canvas's top, right and bottom
 * edges. Inspector.tsx spells the same numbers as Tailwind classes; keep the two in step. Below
 * INSPECTOR_MIN_VIEWPORT the inspector is a full-screen sheet and covers no part of the canvas
 * it would need to pan around.
 */
export const INSPECTOR_MIN_WIDTH = 480;
export const INSPECTOR_MAX_WIDTH = 760;
export const INSPECTOR_VW = 0.5;
export const INSPECTOR_GAP = 10;
export const INSPECTOR_MIN_VIEWPORT = 768;

export function inspectorWidth(viewportWidth: number): number {
  if (viewportWidth < INSPECTOR_MIN_VIEWPORT) return 0;
  return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, viewportWidth * INSPECTOR_VW));
}

/** px of the canvas's right edge the open inspector covers: its width plus the gap beside it. */
export function inspectorOcclusion(viewportWidth: number): number {
  const width = inspectorWidth(viewportWidth);
  return width ? width + INSPECTOR_GAP : 0;
}
