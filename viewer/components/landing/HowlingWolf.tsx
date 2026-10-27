"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/Logo";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/*
 * The hound from Fig. 01 (the black wolf of public/landing/wolves-1600.webp) as a halftone of
 * glowing dots (greptile's engraving, in our night colours), howling: every few seconds its neck
 * bends and the head lifts, rings ripple out from the muzzle, then it settles. Each frame re-samples
 * the painting through a smooth bend about the base of the neck, so there is no seam. Drawn only
 * while on screen; reduced motion: one still frame, mid-howl.
 */

/** the crop of the 1600 × 900 painting that holds the black wolf's head, neck and chest */
const CROP = { x: 170, y: 190, w: 560, h: 440 };
/** in crop pixels: where the neck bends, which way is "toward the head", and the nose tip */
const PIVOT = { x: 318, y: 232 };
const AXIS = { x: 1, y: 0 };
const NOSE = { x: 505, y: 238 };
const MAX_LIFT = (-38 * Math.PI) / 180;
/** a halftone moon in the sky behind the wolf's back */
const MOON = { x: 96, y: 62, r: 34 };
const CYCLE = 7800;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 at rest → 1 howling → 0, over one cycle */
function liftAt(ms: number) {
  const t = ms % CYCLE;
  if (t < 1400) return 0;
  if (t < 2700) return smooth(0, 1, (t - 1400) / 1300);
  if (t < 5200) return 1;
  if (t < 6600) return 1 - smooth(0, 1, (t - 5200) / 1400);
  return 0;
}

export function HowlingWolf({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let visible = false;
    let src: { lum: Float32Array; w: number; h: number } | undefined;
    const still = prefersReducedMotion();
    const start = performance.now();

    const img = new Image();
    img.decoding = "async";
    img.src = `${base}/landing/wolves-1600.webp`;
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = CROP.w;
      off.height = CROP.h;
      const o = off.getContext("2d", { willReadFrequently: true });
      if (!o) return;
      o.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
      const data = o.getImageData(0, 0, CROP.w, CROP.h).data;
      const lum = new Float32Array(CROP.w * CROP.h);
      for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
      src = { lum, w: CROP.w, h: CROP.h };
      draw(still ? 1 : liftAt(performance.now() - start), still ? 2400 : performance.now() - start);
    };

    function draw(lift: number, ms: number) {
      if (!src || !canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== Math.round(cw * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const k = src.w / cw; // crop px per css px
      // about 110 dots across at any width, never finer than 3.5 px
      const PITCH = Math.max(3.5, cw / 110);
      const angle = MAX_LIFT * lift + (lift > 0.98 ? Math.sin(ms / 70) * 0.006 : 0);
      ctx.fillStyle = "#f4ecdf";
      ctx.beginPath();
      for (let y = PITCH / 2; y < ch; y += PITCH) {
        for (let x = PITCH / 2; x < cw; x += PITCH) {
          let sx = x * k;
          let sy = y * k;
          // how much of the head's turn this point takes: none behind the neck, all of it past it
          const along = (sx - PIVOT.x) * AXIS.x + (sy - PIVOT.y) * AXIS.y;
          const a = angle * smooth(-40, 125, along);
          if (a !== 0) {
            const dx = sx - PIVOT.x;
            const dy = sy - PIVOT.y;
            const c = Math.cos(-a);
            const s = Math.sin(-a);
            sx = PIVOT.x + dx * c - dy * s;
            sy = PIVOT.y + dx * s + dy * c;
          }
          const ix = Math.round(sx);
          const iy = Math.round(sy);
          if (ix < 0 || iy < 0 || ix >= src.w || iy >= src.h) continue;
          const l = src.lum[iy * src.w + ix]!;
          // the wolf is the dark of the painting; its body fades out toward the left edge
          // the wolf is the dark of the painting; its body fades out to the left, and nothing below its belly line counts
          const mask = smooth(128, 92, l) * smooth(0, 150, sx) * (sx > 240 && sy > 330 ? 0 : 1);
          if (mask <= 0.02) {
            const m = Math.hypot(sx - MOON.x, sy - MOON.y) / MOON.r;
            if (m < 1.15) {
              const rr = (PITCH / 2) * 0.7 * smooth(1.15, 0.8, m) * (0.62 + 0.38 * Math.sin(sx * 0.13 + sy * 0.11) * Math.cos(sx * 0.07 - sy * 0.19));
              if (rr > 0.35) {
                ctx.moveTo(x + rr, y);
                ctx.arc(x, y, rr, 0, Math.PI * 2);
              }
            }
            continue;
          }
          // the painted fur's own light gives the texture: brighter strands, bigger dots
          const tone = 0.3 + 0.7 * smooth(12, 72, l);
          const r = (PITCH / 2) * 0.95 * tone * mask;
          if (r < 0.35) continue;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      // the howl: rings of dots out of the muzzle while the head is up
      if (lift > 0.3) {
        const dx = NOSE.x - PIVOT.x;
        const dy = NOSE.y - PIVOT.y;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const mx = (PIVOT.x + dx * c - dy * s) / k;
        const my = (PIVOT.y + dx * s + dy * c) / k;
        const dir = angle * 1.15;
        for (let ring = 0; ring < 3; ring++) {
          const phase = ((ms / 1500 + ring / 3) % 1 + 1) % 1;
          const radius = 18 + phase * Math.max(cw, ch) * 0.3;
          const alpha = (1 - phase) * Math.min(1, (lift - 0.3) / 0.4);
          ctx.fillStyle = `rgba(255, 196, 107, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          const step = 6 / radius;
          for (let t = -0.6; t <= 0.6; t += step) {
            const px = mx + Math.cos(dir + t) * radius;
            const py = my + Math.sin(dir + t) * radius;
            const fade = 1 - Math.abs(t) / 0.6;
            const r = 1.6 * fade + 0.4;
            ctx.moveTo(px + r, py);
            ctx.arc(px, py, r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }

    const tick = () => {
      const ms = performance.now() - start;
      draw(liftAt(ms), ms);
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              visible = entries[entries.length - 1]!.isIntersecting;
              if (visible && !still && !raf) raf = requestAnimationFrame(tick);
            },
            { rootMargin: "120px 0px" },
          );
    observer?.observe(canvas);
    const onResize = () => draw(still ? 1 : liftAt(performance.now() - start), performance.now() - start);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden data-testid="howling-wolf" />;
}
