"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/Logo";

/**
 * The pipeline's rail: a line that runs down beside the four stages as the page scrolls, amber to
 * violet to glacier to green, lighting each stage's node as it reaches it. Writes `--p` (0–1) on the
 * track and `data-reached` on each stage; without JS or with reduced motion the line is full.
 */
export function PipelineTrack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stages = [...el.querySelectorAll<HTMLElement>("[data-stage]")];
    const set = (p: number) => {
      el.style.setProperty("--p", p.toFixed(4));
      const box = el.getBoundingClientRect();
      for (const s of stages) {
        const at = (s.getBoundingClientRect().top - box.top + 46) / box.height;
        if (p >= at) s.dataset.reached = "";
        else delete s.dataset.reached;
      }
    };
    if (prefersReducedMotion()) {
      set(1);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const line = window.innerHeight * 0.62;
      set(Math.min(1, Math.max(0, (line - box.top) / box.height)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div ref={ref} className="pl" data-testid="pipeline">
      <span className="pl-rail" aria-hidden>
        <span className="pl-rail-fill" />
      </span>
      {children}
    </div>
  );
}
