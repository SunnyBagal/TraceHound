"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The wolf head, ported from tracehound-logo-howl.html (paths, mouth, timings, easing and the
 * lift/tremble as given there). At rest: the outline (evenodd: the face is a cut-out with the
 * eyes and nose inside it), with the narrower nose. The howl pose has the same commands and point
 * count, so the howl morphs it point by point; a separate mouth layer opens from (355, 559) once
 * the morph passes 0.22, and the whole head lifts 14 units and trembles during the hold.
 */
export const WOLF_PATH =
  "M474.8,372 L430.2,387.1 L408.2,430 L456.1,415.5 Z M235.2,372 L253.9,415.5 L301.8,430 L279.8,387.1 Z M188.7,60.4 L157.4,253.1 L80.6,407.4 L293.1,650.1 L416.9,650.1 L629.4,407.4 L552.6,253.1 L521.3,60.4 L370.2,165.8 L355,167 L339.8,165.8 Z M126.8,400.9 L143.4,362 L247.6,298 L337.4,381.6 L355,420 L372.6,381.6 L462.4,298 L566.6,362 L583.2,400.9 L521.5,473.8 L488.8,437.6 L472.9,524.8 L402,606.1 L366.5,617.2 L366.8,605.1 L402.2,562 L375.8,550.2 L334.2,550.2 L307.8,562 L343.2,605.1 L343.5,617.2 L308,606.1 L237.2,524.8 L221.2,437.6 L188.5,473.8 Z M494.2,127.8 L515,254 L442,220.9 Z M215.8,127.8 L268,220.9 L195,254 Z";
export const HOWL_PATH =
  "M474.8,337 L433,350 L408.2,355 L453,348 Z M235.2,337 L257,348 L301.8,355 L277,350 Z M197,99 L158,259 L84,395 L300,666 L410,666 L626,395 L552,259 L513,99 L370.2,178 L355,180 L339.8,178 Z M130,388 L146,350 L247.6,281 L337.4,345 L355,380 L372.6,345 L462.4,281 L564,350 L580,388 L518,453 L483,425 L463,536 L393,622 L355,638 L355,465 L405,426 L379,407 L331,407 L305,426 L355,465 L355,638 L317,622 L247,536 L227,425 L192,453 Z M488,161 L513,257 L445,230 Z M222,161 L265,230 L197,257 Z";
export const MOUTH_POINTS: readonly (readonly [number, number])[] = [
  [333, 494],
  [377, 494],
  [391, 548],
  [379, 591],
  [355, 612],
  [331, 591],
  [319, 548],
];
/** Where the mouth opens from (every point sits here at rest). */
export const MOUTH_ORIGIN = [355, 559] as const;
/** The mouth starts opening once the morph passes this. */
export const MOUTH_START = 0.22;
export const HEAD_LIFT = 14;
/** The resting path's bounds (80.6–629.4 × 60.4–650.1) in a square with a small margin: the favicon's crop. */
export const WOLF_VIEWBOX = "55 55 600 600";
/** The animation's box (as in the HTML): room for the howl, whose chin drops to y 666. */
export const HOWL_VIEWBOX = "0 0 710 710";

export const LIFT_MS = 680;
export const HOLD_MS = 650;
export const RETURN_MS = 440;
export const HOWL_MS = LIFT_MS + HOLD_MS + RETURN_MS;

const NUMBER = /-?\d+(?:\.\d+)?/g;
const REST = WOLF_PATH.match(NUMBER)!.map(Number);
const HOWL = HOWL_PATH.match(NUMBER)!.map(Number);
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
/** The file's easing (smootherstep). */
export const ease = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);

export interface WolfPose {
  face: string;
  mouth: string;
  mouthOpacity: number;
  transform: string;
}

/** The drawing at `progress` from rest (0) to the howl (1), with `tremble` added to the lift. */
export function wolfPose(progress: number, tremble = 0): WolfPose {
  let i = 0;
  const face =
    progress === 0
      ? WOLF_PATH
      : WOLF_PATH.replace(NUMBER, () => {
          const index = i++;
          return mix(REST[index]!, HOWL[index]!, progress).toFixed(3);
        });
  const jaw = ease(Math.max(0, Math.min(1, (progress - MOUTH_START) / (1 - MOUTH_START))));
  const mouth = MOUTH_POINTS.map(([x, y], index) => `${index === 0 ? "M" : "L"}${mix(MOUTH_ORIGIN[0], x, jaw)},${mix(MOUTH_ORIGIN[1], y, jaw)}`).join(" ") + " Z";
  return { face, mouth, mouthOpacity: jaw, transform: `translate(0 ${-progress * HEAD_LIFT + tremble})` };
}

/** Progress and tremble `elapsed` ms into a howl: lift, hold (with the tremble), return. */
export function howlFrame(elapsed: number): { progress: number; tremble: number } {
  if (elapsed < LIFT_MS) return { progress: ease(elapsed / LIFT_MS), tremble: 0 };
  if (elapsed < LIFT_MS + HOLD_MS) {
    const hold = elapsed - LIFT_MS;
    return { progress: 1, tremble: Math.sin(hold / 58) * 0.8 * Math.sin((hold / HOLD_MS) * Math.PI) };
  }
  return { progress: 1 - ease((elapsed - LIFT_MS - HOLD_MS) / RETURN_MS), tremble: 0 };
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

const REST_POSE = wolfPose(0);

/**
 * One howl, started by `howl`. A howl always finishes and never overlaps another: triggers while
 * one runs are ignored. With prefers-reduced-motion it jumps to the howl pose, holds HOLD_MS and
 * jumps back, without animation frames.
 */
function useHowl() {
  const head = useRef<SVGGElement>(null);
  const face = useRef<SVGPathElement>(null);
  const mouth = useRef<SVGPathElement>(null);
  const playing = useRef(false);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [howling, setHowling] = useState(false);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const draw = useCallback((progress: number, tremble = 0) => {
    const pose = wolfPose(progress, tremble);
    face.current?.setAttribute("d", pose.face);
    mouth.current?.setAttribute("d", pose.mouth);
    mouth.current?.setAttribute("opacity", String(pose.mouthOpacity));
    head.current?.setAttribute("transform", pose.transform);
  }, []);

  const howl = useCallback(() => {
    if (playing.current) return;
    playing.current = true;
    setHowling(true);
    const finish = () => {
      draw(0);
      playing.current = false;
      frame.current = timer.current = null;
      setHowling(false);
    };
    if (prefersReducedMotion()) {
      draw(1);
      timer.current = setTimeout(finish, HOLD_MS);
      return;
    }
    const startedAt = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startedAt;
      // always finish at the exact resting pose
      if (elapsed >= HOWL_MS) return finish();
      const { progress, tremble } = howlFrame(elapsed);
      draw(progress, tremble);
      frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
  }, [draw]);

  return { head, face, mouth, howl, howling };
}

/** Keyboard focus only (as the file does): a mouse click focuses the link too, and click howls on its own. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true; // a browser without :focus-visible: treat every focus as keyboard focus
  }
}

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * The mark as a link to the default canvas view (no selection, no impact report). It howls on
 * pointer enter (not touch), click and keyboard focus; there is no pointer-leave handler.
 */
export function LogoLink({ className = "" }: { className?: string }) {
  const { head, face, mouth, howl, howling } = useHowl();
  return (
    <a
      href={`${base}/`}
      title="TraceHound: back to the full canvas"
      aria-label="TraceHound home"
      data-testid="home-link"
      onPointerEnter={(e) => e.pointerType !== "touch" && howl()}
      onClick={howl}
      onFocus={(e) => focusVisible(e.currentTarget) && howl()}
      className={`grid shrink-0 place-items-center rounded-lg text-logo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-logo ${className}`}
    >
      <svg viewBox={HOWL_VIEWBOX} className="size-8 overflow-visible" aria-hidden data-testid="logo-mark" data-howling={howling || undefined}>
        <g ref={head} data-wolf-head transform={REST_POSE.transform}>
          <path ref={face} data-wolf-face fill="currentColor" fillRule="evenodd" d={REST_POSE.face} />
          <path ref={mouth} data-wolf-mouth fill="currentColor" opacity={REST_POSE.mouthOpacity} d={REST_POSE.mouth} />
        </g>
      </svg>
    </a>
  );
}
