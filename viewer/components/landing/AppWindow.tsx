"use client";

import { useEffect, useRef, useState } from "react";
import { GRAPH_HREF } from "@/lib/landing";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * The app in a window over the hero's snow (after nuphos): four real screenshots of /graph and
 * /reviews (public/landing/app-*.webp, captured from this build), one per tab. With motion the
 * tabs advance by themselves while the window is in view; a click or key choice stops that.
 */
export const FRAMES = [
  { id: "graph", label: "See the architecture", title: "tracehound-demo · component graph", href: `${GRAPH_HREF}?repo=tracehound-demo`, alt: "The component graph of tracehound-demo: cards for the API, queue, worker and shared code, joined by evidence edges." },
  { id: "lane", label: "Pick a pull request", title: "tracehound-demo · pull request #2", href: `${GRAPH_HREF}?repo=tracehound-demo&pr=2`, alt: "Pull request #2 selected in the PR lane: the component it changed is lit, the rest dimmed, with the finding pinned under it." },
  { id: "findings", label: "Findings on the graph", title: "tracehound-demo · findings", href: `${GRAPH_HREF}?repo=tracehound-demo&pr=2&component=recall-backend%3Ashared`, alt: "The inspector open on the changed component, listing TraceHound's finding with its file and line and a link to the GitHub comment." },
  { id: "review", label: "Read the review", title: "Reviews · pull request #2", href: `${base}/reviews/pr?repo=SunnyBagal%2Ftracehound-demo&n=2`, alt: "TraceHound's review of pull request #2: the finding, its location and the suggested fix." },
] as const;

const ADVANCE_MS = 5200;

export function AppWindow() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setAuto(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % FRAMES.length), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [auto, index]);
  const frame = FRAMES[index]!;
  const choose = (i: number) => { setIndex(i); setAuto(false); };
  return (
    <div ref={ref} className="app-window-wrap" data-testid="app-window">
      <div className="app-window">
        <div className="app-window-bar">
          <span className="app-window-dots" aria-hidden><i /><i /><i /></span>
          <span className="app-window-title">{frame.title}</span>
          <a href={frame.href} className="app-window-open">Open<span className="sr-only"> {frame.label}</span> ↗</a>
        </div>
        <div className="app-window-body" role="tabpanel" id="app-window-panel" aria-labelledby={`app-tab-${frame.id}`}>
          {FRAMES.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- static screenshots
            <img key={f.id} src={`${base}/landing/app-${f.id}.webp`} alt={i === index ? f.alt : ""} aria-hidden={i !== index} width={2880} height={1760} loading={i === 0 ? "eager" : "lazy"} data-active={i === index || undefined} draggable={false} />
          ))}
        </div>
      </div>
      <div className="app-tabs" role="tablist" aria-label="What TraceHound shows">
        {FRAMES.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            id={`app-tab-${f.id}`}
            aria-selected={i === index}
            aria-controls="app-window-panel"
            onClick={() => choose(i)}
            className="app-tab"
            data-auto={auto && i === index ? "on" : undefined}
            style={{ "--advance": `${ADVANCE_MS}ms` } as React.CSSProperties}
          >
            <span className="app-tab-n">0{i + 1}</span>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
