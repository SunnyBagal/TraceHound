"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The wolf head's outline at rest (evenodd: the face is a cut-out with the eyes and nose inside
 * it). The paths are tracehound-logo-howl.html's: the resting pose with the narrower nose, and
 * the howl (eyes shut, nose up, mouth open). Both have the same commands and point count, so the
 * howl is a point-by-point morph between them.
 */
export const WOLF_PATH =
  "M474.8,372 L430.2,387.1 L408.2,430 L456.1,415.5 Z M235.2,372 L253.9,415.5 L301.8,430 L279.8,387.1 Z M188.7,60.4 L157.4,253.1 L80.6,407.4 L293.1,650.1 L416.9,650.1 L629.4,407.4 L552.6,253.1 L521.3,60.4 L370.2,165.8 L355,167 L339.8,165.8 Z M126.8,400.9 L143.4,362 L247.6,298 L337.4,381.6 L355,420 L372.6,381.6 L462.4,298 L566.6,362 L583.2,400.9 L521.5,473.8 L488.8,437.6 L472.9,524.8 L402,606.1 L366.5,617.2 L366.8,605.1 L402.2,562 L375.8,550.2 L334.2,550.2 L307.8,562 L343.2,605.1 L343.5,617.2 L308,606.1 L237.2,524.8 L221.2,437.6 L188.5,473.8 Z M494.2,127.8 L515,254 L442,220.9 Z M215.8,127.8 L268,220.9 L195,254 Z";
export const HOWL_PATH =
  "M474.8,337 L433,350 L408.2,355 L453,348 Z M235.2,337 L257,348 L301.8,355 L277,350 Z M197,99 L158,259 L84,395 L300,666 L410,666 L626,395 L552,259 L513,99 L370.2,178 L355,180 L339.8,178 Z M130,388 L146,350 L247.6,281 L337.4,345 L355,380 L372.6,345 L462.4,281 L564,350 L580,388 L518,453 L483,425 L463,536 L393,622 L355,638 L355,465 L405,426 L379,407 L331,407 L305,426 L355,465 L355,638 L317,622 L247,536 L227,425 L192,453 Z M488,161 L513,257 L445,230 Z M222,161 L265,230 L197,257 Z";
/** The resting path's bounds (80.6–629.4 × 60.4–650.1) in a square with a small margin: the favicon's crop. */
export const WOLF_VIEWBOX = "55 55 600 600";
/** The animation's box (as in the HTML): room for the howl, whose chin drops to y 666. */
export const HOWL_VIEWBOX = "0 0 710 710";

const NUMBER = /-?\d+(?:\.\d+)?/g;
const REST = WOLF_PATH.match(NUMBER)!.map(Number);
const HOWL = HOWL_PATH.match(NUMBER)!.map(Number);

/** The path `t` of the way from rest (0) to the howl (1). */
export function wolfPathAt(t: number): string {
  if (t <= 0) return WOLF_PATH;
  let i = 0;
  return WOLF_PATH.replace(NUMBER, () => {
    const v = REST[i]! + (HOWL[i]! - REST[i]!) * t;
    i++;
    return String(Math.round(v * 10) / 10);
  });
}

/** Up 260ms, hold 420ms, down 320ms: one howl, about a second. */
const UP = 260;
const HOLD = 420;
const DOWN = 320;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const HOWL_MS = UP + HOLD + DOWN;

function howlAmount(elapsed: number): number {
  if (elapsed < UP) return ease(elapsed / UP);
  if (elapsed < UP + HOLD) return 1;
  return ease(Math.max(0, 1 - (elapsed - UP - HOLD) / DOWN));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** TraceHound mark at rest, in currentColor: the mark alone (no tile or frame behind it). */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox={HOWL_VIEWBOX} className={`text-logo ${className}`} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d={WOLF_PATH} />
    </svg>
  );
}

/**
 * One howl, started by `howl`: a running howl finishes before another can start (they never
 * overlap), and with prefers-reduced-motion the mark stays at rest.
 */
function useHowl() {
  const path = useRef<SVGPathElement>(null);
  const frame = useRef<number | null>(null);
  const [howling, setHowling] = useState(false);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const howl = useCallback(() => {
    if (frame.current !== null || prefersReducedMotion()) return;
    setHowling(true);
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      if (elapsed < HOWL_MS) {
        path.current?.setAttribute("d", wolfPathAt(howlAmount(elapsed)));
        frame.current = requestAnimationFrame(step);
        return;
      }
      path.current?.setAttribute("d", WOLF_PATH);
      frame.current = null;
      setHowling(false);
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  return { path, howl, howling };
}

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The mark as a link to the default canvas view (no selection, no impact report); it howls on hover, press and focus. */
export function LogoLink({ className = "" }: { className?: string }) {
  const { path, howl, howling } = useHowl();
  return (
    <a
      href={`${base}/`}
      title="TraceHound: back to the full canvas"
      aria-label="TraceHound home"
      data-testid="home-link"
      onPointerEnter={howl}
      onPointerDown={howl}
      onFocus={howl}
      className={`grid shrink-0 place-items-center rounded-lg text-logo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-logo ${className}`}
    >
      <svg viewBox={HOWL_VIEWBOX} className="size-8" aria-hidden data-testid="logo-mark" data-howling={howling || undefined}>
        <path ref={path} fill="currentColor" fillRule="evenodd" d={WOLF_PATH} />
      </svg>
    </a>
  );
}
