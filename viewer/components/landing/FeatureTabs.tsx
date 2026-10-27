"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, GitPullRequest, MapPin, Waypoints } from "lucide-react";
import type { Feature } from "./features";
import { Terminal } from "./Terminal";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ICONS = { graph: Waypoints, review: GitPullRequest, pin: MapPin, verify: BadgeCheck } as const;

/** `code` spans in the copy become tinted chips */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, i) => (part.startsWith("`") ? <code key={i} className="fx-code">{part.slice(1, -1)}</code> : part))}</>;
}

/**
 * The feature block (viteplus-style): every panel is on the page, one under the other, and the tab
 * row sticks above them, marking the panel in view; a tab scrolls to its panel.
 */
export function FeatureTabs({ features }: { features: Feature[] }) {
  const [current, setCurrent] = useState(features[0]!.id);
  const panels = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setCurrent((hit.target as HTMLElement).dataset.feature!);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const el of panels.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="fx-frame lp-col" data-testid="feature-tabs">
      <nav className="fx-tabs" aria-label="Features">
        {features.map((f) => {
          const Icon = ICONS[f.icon];
          return (
            <a key={f.id} href={`#feature-${f.id}`} className="fx-tab" aria-current={current === f.id ? "true" : undefined} data-tone={f.tone} onClick={() => setCurrent(f.id)}>
              <Icon className="fx-tab-icon size-3.5" aria-hidden />
              {f.tab}
            </a>
          );
        })}
      </nav>
      {features.map((f) => (
        <article
          key={f.id}
          id={`feature-${f.id}`}
          className="fx-panel"
          data-tone={f.tone}
          data-feature={f.id}
          aria-labelledby={`feature-${f.id}-title`}
          ref={(el) => {
            if (el) panels.current.set(f.id, el);
            else panels.current.delete(f.id);
          }}
        >
          <div className="fx-copy">
            <p className="fx-kicker">{f.kicker}</p>
            <h3 id={`feature-${f.id}-title`} className="fx-title">
              {f.title}
            </h3>
            <p className="fx-text">
              <Inline text={f.text} />
            </p>
            <ul className="fx-bullets">
              {f.bullets.map((b) => (
                <li key={b}>
                  <span className="fx-check" aria-hidden>
                    (<Check className="size-3" strokeWidth={2.5} />)
                  </span>
                  <span>
                    <Inline text={b} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="fx-powered">
              <span className="fx-powered-by">Powered by</span>
              {f.powered.map((p, i) => (
                <span key={p.name} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-faint">&amp;</span>}
                  {/* eslint-disable-next-line @next/next/no-img-element -- a vendored static icon */}
                  {p.nvidia && <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden className="inline-block h-3 w-4 object-contain" />}
                  {p.name}
                </span>
              ))}
            </p>
          </div>
          <div className="fx-art">
            <span className="fx-beams" aria-hidden />
            <Terminal scenarios={f.scenarios} name={f.id} />
          </div>
        </article>
      ))}
    </div>
  );
}
