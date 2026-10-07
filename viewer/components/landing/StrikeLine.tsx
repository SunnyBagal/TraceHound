"use client";

import { useRef, useState } from "react";
import { useInView } from "./AnimatedFigure";

/** `struck` with a line that draws itself the first time it scrolls into view (CSS: .lp-strike). */
export function Strike({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [drawn, setDrawn] = useState(false);
  useInView(ref, () => setDrawn(true), 0.6);
  return (
    <s ref={ref} className="lp-strike" data-drawn={drawn || undefined} data-testid="strike">
      {children}
    </s>
  );
}
