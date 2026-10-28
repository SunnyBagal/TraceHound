"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/Logo";
import { useInView } from "./AnimatedFigure";

/**
 * Marks its children for a one-time entrance: `data-reveal="armed"` after mount (CSS hides what
 * will animate), then "in" once it scrolls into view. Without JS or with reduced motion the
 * attribute never arms, so everything shows at once.
 */
export function Reveal({ className, children, threshold = 0.3, testId }: { className?: string; children: React.ReactNode; threshold?: number; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"armed" | "in" | undefined>(undefined);
  useEffect(() => {
    if (!prefersReducedMotion()) setState((s) => s ?? "armed");
  }, []);
  useInView(ref, () => setState((s) => (s === "armed" ? "in" : s)), threshold);
  return (
    <div ref={ref} className={className} data-reveal={state} data-testid={testId}>
      {children}
    </div>
  );
}
