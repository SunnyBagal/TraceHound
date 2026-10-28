"use client";

import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/Logo";

export type AnimState = "idle" | "play" | "static";

/**
 * Runs `callback` once when `ref` scrolls into view (at least `threshold` of it visible), or at
 * once where IntersectionObserver is missing.
 */
export function useInView(ref: React.RefObject<Element | null>, callback: () => void, threshold = 0.35) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      latest.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          latest.current();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
}

/** Paused at the first frame until in view, then plays once; static (the final frame) with reduced motion. */
export function usePlayOnView(ref: React.RefObject<Element | null>, threshold?: number) {
  const [state, setState] = useState<AnimState>("idle");
  useEffect(() => {
    if (prefersReducedMotion()) setState("static");
  }, []);
  useInView(ref, () => setState((s) => (s === "idle" && !prefersReducedMotion() ? "play" : s)), threshold);
  return [state, setState] as const;
}

export interface Step {
  title: string;
  text: React.ReactNode;
  /** when its beat starts in the drawing, ms */
  t: number;
}

/** the colour of each step's rail, in order (the landing's tab tones) */
const TONES = ["amber", "violet", "glacier", "green"] as const;

/**
 * One landing animation, in a bordered box (coderabbit's layout, our tones): the steps on the left,
 * each with a coloured rail that lights while the drawing is on its beat; the drawing on the right,
 * on the landing's grainy gradient when `art` names a tone. It is paused at its first frame until it
 * scrolls into view, then plays once; a click (or Enter / Space) replays it. With
 * prefers-reduced-motion it shows the final frame, static, and is not a button. The caption (the
 * steps and an optional note) is the text alternative. `wide` is the drawing for large screens (lg
 * and up); `children` the one for narrower screens (or for all, without `wide`).
 */
export function AnimatedFigure({
  name,
  title,
  steps,
  note,
  art,
  wide,
  children,
}: {
  name: string;
  title: string;
  steps: Step[];
  note?: React.ReactNode;
  /** the stage's gradient tone; none = the plain night panel */
  art?: (typeof TONES)[number];
  wide?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const [state, setState] = usePlayOnView(ref);
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(-1);

  // the lit step follows the drawing's beats while it plays
  useEffect(() => {
    if (state !== "play") return;
    setActive(0);
    const timers = steps.slice(1).map((s, i) => setTimeout(() => setActive(i + 1), s.t));
    return () => timers.forEach(clearTimeout);
  }, [state, run, steps]);

  const drawing = (
    // a span: a button may only hold phrasing content
    <span key={run} className="lp-anim block w-full" data-state={state}>
      {wide ? (
        <>
          <span className="hidden lg:block" data-variant="wide">
            {wide}
          </span>
          <span className="block lg:hidden" data-variant="narrow">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </span>
  );
  return (
    <div className="fig-wrap">
      <h3 className="fig-title">{title}</h3>
      <figure className="fig" data-testid={`anim-${name}`} data-state={state}>
        <figcaption id={captionId} className="fig-steps">
          <ol>
            {steps.map((s, i) => (
              <li key={s.title} className="fig-step" data-tone={TONES[i % TONES.length]} data-on={state === "static" || i === active || undefined}>
                <span className="fig-step-title">{s.title}</span>
                <span className="fig-step-text">{s.text}</span>
              </li>
            ))}
          </ol>
          {note && <p className="fig-note">{note}</p>}
        </figcaption>
        <div ref={ref} className={`fig-stage ${art ? "fx-art" : ""}`} data-tone={art}>
          {art && <span className="fx-beams" aria-hidden />}
          {state === "static" ? (
            <div role="img" aria-labelledby={captionId} className="fig-drawing">
              {drawing}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRun((r) => r + 1);
                setState("play");
              }}
              aria-label={`Replay the animation: ${title}`}
              aria-describedby={captionId}
              className="fig-drawing cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {drawing}
            </button>
          )}
        </div>
      </figure>
    </div>
  );
}
