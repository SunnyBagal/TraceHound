"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { GITHUB_URL, GRAPH_HREF, HERO_TRADEMARKS } from "@/lib/landing";
import { AppWindow } from "./AppWindow";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * The hero, laid out as nuphos.ai's is (owner's request for the hackathon; credited to nuphos):
 * a Georgia headline with an italic second line, the description, the button and "View on
 * GitHub", then the app window. The owner's picture is two wolves facing each other in the snow:
 * the black wolf wears NVIDIA (TraceHound runs on Nemotron), the white pack the coding agents
 * whose pull requests it reviews. The picture hangs from the button by the point between the two
 * noses, so the button always sits between them. As on nuphos the two figures slide in from the
 * sides out of a blur; scrolling then grows the picture around the noses. Reduced motion: still.
 *
 * Positions are fractions of the 2000×1124 picture, measured on it.
 */
export const NOSES = { x: 0.4985, y: 0.476 }; // black nose (850, 538), white nose (1145, 532)

type Mark = { id: string; label: string; x: number; y: number; size: number; rotate: number; tile: string; side: "l" | "r"; art: { mask?: string; img?: string; color?: string; scale?: number }; shape?: "round" | "square" };
/*
 * The black wolf and the lead white wolf wear theirs on the neck, just behind the head; the
 * wolves behind wear theirs over the face, as in the owner's mock-up.
 */
export const MARKS: Mark[] = [
  { id: "nvidia", label: "NVIDIA", side: "l", x: 550 / 2000, y: 515 / 1124, size: 0.105, rotate: -12, tile: "#76b900", art: { mask: "nvidia.svg", color: "#ffffff", scale: 0.7 } },
  { id: "claude", label: "Claude", side: "r", x: 1445 / 2000, y: 540 / 1124, size: 0.1, rotate: 10, tile: "#d97757", art: { mask: "brands/claude.svg", color: "#ffffff", scale: 0.64 } },
  { id: "chatgpt", label: "ChatGPT", side: "r", x: 1638 / 2000, y: 425 / 1124, size: 0.066, rotate: 0, tile: "#0b0b0f", art: { mask: "brands/openai.svg", color: "#ffffff", scale: 0.66 }, shape: "round" },
  { id: "antigravity", label: "Antigravity", side: "r", x: 1836 / 2000, y: 352 / 1124, size: 0.066, rotate: -4, tile: "#ffffff", art: { img: "brands/antigravity-color.svg", scale: 0.74 } },
  { id: "opencode", label: "OpenCode", side: "r", x: 1918 / 2000, y: 452 / 1124, size: 0.05, rotate: 8, tile: "#f4f1ea", art: { mask: "brands/opencode.svg", color: "#0b0b0f", scale: 0.58 } },
  { id: "cursor", label: "Cursor", side: "r", x: 1852 / 2000, y: 682 / 1124, size: 0.078, rotate: -6, tile: "#0b0b0f", art: { mask: "brands/cursor.svg", color: "#ffffff", scale: 0.62 } },
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

/** One wolf's half of the picture: the whole picture, masked to its side of the noses. */
function Half({ side }: { side: "l" | "r" }) {
  return (
    <div className={`hero-half hero-half-${side}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export: next/image would not optimise it */}
      <img
        src={`${base}/landing/wolves-2560.webp`}
        srcSet={`${base}/landing/wolves-960.webp 960w, ${base}/landing/wolves-1600.webp 1600w, ${base}/landing/wolves-2560.webp 2560w, ${base}/landing/wolves-3840.webp 3840w`}
        sizes="(max-width: 767px) 260vw, 100vw"
        alt=""
        width={3840}
        height={2158}
        fetchPriority="high"
        className="hero-image"
        data-testid={side === "l" ? "hero-image" : undefined}
        draggable={false}
      />
      {MARKS.map((m, i) => (m.side === side ? <MarkTile key={m.id} mark={m} index={i} /> : null))}
    </div>
  );
}

/** Scroll grows the picture around the noses (--z); the page itself scrolls normally. */
function useHeroZoom(ref: RefObject<HTMLElement | null>) {
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
    const tick = () => {
      shown += (target - shown) * 0.18;
      if (Math.abs(target - shown) < 0.0005) shown = target;
      el.style.setProperty("--z", (1 + shown * 0.32).toFixed(4));
      frame = shown === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      target = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
      if (!frame) frame = requestAnimationFrame(tick);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [motion, ref]);
}

/** The nav turns to night glass once the snow has scrolled away (with or without motion). */
function useNightNav(hero: RefObject<HTMLElement | null>) {
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
  const ref = useRef<HTMLElement>(null);
  useHeroZoom(ref);
  useNightNav(ref);
  return (
    <section ref={ref} className="hero" data-testid="hero" aria-labelledby="hero-title">
      <div className="hero-copy hero-reveal-text">
        <h1 id="hero-title" className="hero-title">
          Understand your code.{" "}
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
            <Half side="l" />
            <Half side="r" />
          </div>
        </div>
        <a href={GRAPH_HREF} className="hero-connect" data-testid="connect-github">
          <GithubIcon className="size-[18px]" />
          Connect GitHub
        </a>
        <a href={GITHUB_URL} className="hero-ghost" data-testid="view-github">
          <GithubIcon className="size-[18px]" />
          View on GitHub
        </a>
      </div>

      <div className="hero-window hero-reveal-video">
        <AppWindow />
      </div>
      <p className="mt-5 px-4 text-center text-[12px] leading-snug text-[#6b6d66]" data-testid="hero-trademarks">
        {HERO_TRADEMARKS}
      </p>
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
