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

/**
 * One landing animation: paused at its first frame until it scrolls into view, then it plays once;
 * a click (or Enter / Space) replays it. With prefers-reduced-motion it shows the final frame,
 * static, and is not a button. The caption is the text alternative: numbered steps that light up
 * as the drawing reaches each one, then an optional note. `wide` is the drawing for large screens
 * (lg and up); `children` the one for narrower screens (or for all, without `wide`).
 */
export function AnimatedFigure({
  name,
  title,
  steps,
  note,
  layout = "below",
  wide,
  children,
}: {
  name: string;
  title: string;
  steps: Step[];
  note?: React.ReactNode;
  layout?: "beside" | "below";
  wide?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const [state, setState] = usePlayOnView(ref);
  const [run, setRun] = useState(0);

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
  const beside = layout === "beside";
  return (
    <figure
      className={beside ? "grid gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:items-center lg:gap-x-14" : "flex flex-col gap-6"}
      data-testid={`anim-${name}`}
      data-state={state}
    >
      <div className={beside ? "flex flex-col gap-4" : "contents"}>
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        <div ref={ref} className="rounded-2xl border border-panel-line bg-panel p-1.5 sm:p-6">
          {state === "static" ? (
            <div role="img" aria-labelledby={captionId}>
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
              className="block w-full cursor-pointer rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {drawing}
            </button>
          )}
        </div>
      </div>
      <figcaption id={captionId}>
        <ol key={run} className={`lp-anim grid gap-x-8 gap-y-5 ${beside ? "" : "sm:grid-cols-2 lg:grid-cols-4"}`} data-state={state} data-testid="anim-steps">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3" data-anim="step" style={{ "--t": `${s.t}ms`, "--d": "400ms" } as React.CSSProperties}>
              <span className="mono grid size-7 shrink-0 place-items-center rounded-full border border-accent text-[12px] text-accent" aria-hidden>
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-[16px] font-semibold text-text">{s.title}</span>
                <span className="text-[15px] leading-relaxed text-muted">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
        {note && <p className="mt-5 flex items-start gap-2 text-[14px] leading-relaxed text-faint">{note}</p>}
      </figcaption>
    </figure>
  );
}
