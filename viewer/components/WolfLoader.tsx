"use client";

import { useEffect, useRef } from "react";
import { createSnowWolfMono } from "@/lib/wolf-snow";

/** The full-page loader: the dot-matrix wolf running through snow, on the page's own background. */
export function WolfLoader({ className, cell = 2 }: { className?: string; cell?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const page = getComputedStyle(canvas).getPropertyValue("--page-bg").trim();
    const loader = createSnowWolfMono(canvas, { cell, ...(/^#[\da-f]{6}$/i.test(page) ? { background: page } : {}) });
    return () => loader.destroy();
  }, [cell]);

  return <canvas ref={ref} aria-hidden data-testid="wolf-loader" className={`block h-auto max-w-full [image-rendering:pixelated] ${className ?? ""}`} />;
}
