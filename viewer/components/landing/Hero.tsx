"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GITHUB_URL, GRAPH_HREF } from "@/lib/landing";
import { AppWindow } from "./AppWindow";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * The hero (owner's design, after nuphos): two wolves facing each other in the snow. The black
 * wolf wears NVIDIA (TraceHound runs on Nemotron); the white pack wears the coding agents whose
 * pull requests it reviews. "Connect GitHub" sits between their noses; the app window follows
 * under it, over the snow. Scrolling zooms the picture around the noses; with reduced motion
 * nothing moves.
 *
 * Positions are fractions of the 2000×1124 picture, so marks stay on their wolves at every size.
 */
export const FOCUS = { x: 0.465, y: 0.48 }; // between the two noses

type Mark = { id: string; label: string; x: number; y: number; size: number; rotate: number; tile: string; art: { mask?: string; img?: string; color?: string; scale?: number }; shape?: "round" | "square" };
/*
 * Each mark sits on its wolf's neck, just behind the head, as the owner asked (measured on the
 * 2000×1124 picture). The black wolf wears NVIDIA; the lead white wolf Claude, then ChatGPT,
 * Antigravity and OpenCode on the wolves behind it and Cursor on the one in front.
 */
export const MARKS: Mark[] = [
  { id: "nvidia", label: "NVIDIA", x: 550 / 2000, y: 515 / 1124, size: 0.105, rotate: -12, tile: "#76b900", art: { mask: "nvidia.svg", color: "#ffffff", scale: 0.7 } },
  { id: "claude", label: "Claude", x: 1445 / 2000, y: 545 / 1124, size: 0.1, rotate: 10, tile: "#d97757", art: { mask: "brands/claude.svg", color: "#ffffff", scale: 0.64 } },
  { id: "chatgpt", label: "ChatGPT", x: 1722 / 2000, y: 458 / 1124, size: 0.05, rotate: 0, tile: "#0b0b0f", art: { mask: "brands/openai.svg", color: "#ffffff", scale: 0.66 }, shape: "round" },
  { id: "antigravity", label: "Antigravity", x: 1818 / 2000, y: 452 / 1124, size: 0.04, rotate: -4, tile: "#ffffff", art: { img: "brands/antigravity-color.svg", scale: 0.72 } },
  { id: "opencode", label: "OpenCode", x: 1938 / 2000, y: 538 / 1124, size: 0.042, rotate: 8, tile: "#f4f1ea", art: { mask: "brands/opencode.svg", color: "#0b0b0f", scale: 0.58 } },
  { id: "cursor", label: "Cursor", x: 1932 / 2000, y: 790 / 1124, size: 0.058, rotate: -6, tile: "#0b0b0f", art: { mask: "brands/cursor.svg", color: "#ffffff", scale: 0.62 } },
];

function MarkTile({ mark, index }: { mark: Mark; index: number }) {
  const art = mark.art;
  const inner = `${(art.scale ?? 1) * 100}%`;
  return (
    <span
      className="hero-mark"
      data-testid="hero-mark"
      data-mark={mark.id}
      title={mark.label}
      style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.size * 100}%`, "--r": `${mark.rotate}deg`, "--i": index } as CSSProperties}
    >
      <span className={`hero-mark-tile ${mark.shape === "round" ? "rounded-full" : "rounded-[24%]"}`} style={{ background: mark.tile }}>
        {art.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- a vendored static mark
          <img src={`${base}/icons/${art.img}`} alt="" style={{ width: inner, height: inner }} draggable={false} />
        ) : (
          <span style={{ width: inner, height: inner, background: art.color, WebkitMask: `url(${base}/icons/${art.mask}) center / contain no-repeat`, mask: `url(${base}/icons/${art.mask}) center / contain no-repeat` }} />
        )}
      </span>
      <span className="sr-only">{mark.label}</span>
    </span>
  );
}

/**
 * As on nuphos: nothing is pinned. The page scrolls normally and the picture, which hangs from the
 * button between the noses, grows around that point (--z), so the button stays between them.
 */
function useHeroZoom() {
  const ref = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!reduce.matches);
    update();
    reduce.addEventListener("change", update);
    return () => reduce.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motion) return;
    let frame = 0;
    let target = 0;
    let shown = 0;
    // ease toward the scroll position so wheel steps glide instead of jumping
    const tick = () => {
      shown += (target - shown) * 0.2;
      if (Math.abs(target - shown) < 0.0005) shown = target;
      el.style.setProperty("--z", (1 + shown * 0.6).toFixed(4));
      frame = shown === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      target = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
      if (!frame) frame = requestAnimationFrame(tick);
    };
    // the marks lean a little toward the pointer
    const onPointer = (e: PointerEvent) => {
      el.style.setProperty("--mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      el.style.setProperty("--my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [motion]);
  return { ref, motion };
}

/** The nav turns to night glass once the snow has scrolled away (with or without motion). */
function useNightNav(hero: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".lp-nav");
    const el = hero.current;
    if (!nav || !el) return;
    const update = () => { nav.toggleAttribute("data-night", el.getBoundingClientRect().bottom < 0); };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [hero]);
}

export function Hero() {
  const { ref, motion } = useHeroZoom();
  useNightNav(ref);
  return (
    <section ref={ref} className="hero" data-motion={motion ? "on" : "off"} data-testid="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-title">
          Understand your code. <br />
          <em>Fix what breaks.</em>
        </h1>
        <p className="hero-line" data-testid="hero-line">
          An evidence-backed graph of your repo&apos;s architecture, and a pull-request reviewer on NVIDIA Nemotron through Nebius Token Factory.
        </p>
      </div>

      <div className="hero-cta">
        {/* the point between the two noses: the picture hangs from it */}
        <div className="hero-anchor">
          <div className="hero-stage" aria-hidden data-testid="hero-stage">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static export: next/image would not optimise it */}
            <img
              src={`${base}/landing/wolves-2560.webp`}
              srcSet={`${base}/landing/wolves-960.webp 960w, ${base}/landing/wolves-1600.webp 1600w, ${base}/landing/wolves-2560.webp 2560w, ${base}/landing/wolves-3840.webp 3840w`}
              sizes="(max-aspect-ratio: 4/5) 200vw, 100vw"
              alt=""
              width={3840}
              height={2158}
              fetchPriority="high"
              className="hero-image"
              data-testid="hero-image"
              draggable={false}
            />
            {MARKS.map((m, i) => <MarkTile key={m.id} mark={m} index={i} />)}
          </div>
        </div>
        <a href={GRAPH_HREF} className="hero-connect" data-testid="connect-github">
          <GithubIcon className="size-[18px]" />
          Connect GitHub
        </a>
        <a href={GITHUB_URL} className="hero-ghost" data-testid="view-github">
          <GithubIcon className="size-4" />
          View on GitHub
          <ArrowUpRight className="size-3.5 opacity-60" aria-hidden />
        </a>
      </div>

      <div className="hero-window">
        <AppWindow />
      </div>
    </section>
  );
}

function GithubIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
