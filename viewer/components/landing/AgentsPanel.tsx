"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/Logo";
import { WOLF_PATH } from "@/lib/wolf";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface Agent {
  name: string;
  does: string;
  model: string;
}

/* the three places an agent's work can go; an agent lights the ones its model string names */
const MODELS = [
  { id: "none", label: "no model", sub: "deterministic" },
  { id: "nano", label: "Nemotron Nano", sub: "30B-A3B" },
  { id: "super", label: "Nemotron Super", sub: "120B-A12B" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];
const modelsOf = (model: string): ModelId[] => (model === "no model" ? ["none"] : [...(model.includes("Nano") ? ["nano" as const] : []), ...(model.includes("Super") ? ["super" as const] : [])]);

/* vite+'s integrations figure, our way: the agent's tile in the middle with a gradient rim, "no model"
   on the left, the two Nemotron tiles on the right on a square bracket; straight wires, square corners */
const W = 520;
const H = 360;
const C = { cx: 260, cy: 160, s: 136 };
const T = 92;
const TILES: Record<ModelId, { cx: number; cy: number }> = { none: { cx: 70, cy: 160 }, nano: { cx: 450, cy: 78 }, super: { cx: 450, cy: 262 } };
const TRUNK = (C.cx + C.s / 2 + TILES.nano.cx - T / 2) / 2;
const WIRES: Record<ModelId, string> = {
  none: `M${C.cx - C.s / 2} ${C.cy} H${TILES.none.cx + T / 2}`,
  nano: `M${C.cx + C.s / 2} ${C.cy} H${TRUNK} V${TILES.nano.cy} H${TILES.nano.cx - T / 2}`,
  super: `M${C.cx + C.s / 2} ${C.cy} H${TRUNK} V${TILES.super.cy} H${TILES.super.cx - T / 2}`,
};
const EYE_W = 54;
const MARK = 74;

function Figure({ agent }: { agent: Agent }) {
  const lit = modelsOf(agent.model);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ag-fig" role="img" aria-label={`${agent.name}: ${agent.model}`}>
      <defs>
        <linearGradient id="ag-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3214a8" />
          <stop offset="0.4" stopColor="#7657ff" />
          <stop offset="0.72" stopColor="#2fb0e8" />
          <stop offset="1" stopColor="#7657ff" />
        </linearGradient>
        <pattern id="ag-grain" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="1" height="5" fill="rgba(255, 255, 255, 0.28)" />
        </pattern>
        <linearGradient id="ag-line" gradientUnits="userSpaceOnUse" x1={TILES.none.cx} y1="0" x2={TILES.nano.cx} y2="0">
          <stop offset="0" stopColor="#5ee68f" />
          <stop offset="0.5" stopColor="#2fb0e8" />
          <stop offset="1" stopColor="#5ee68f" />
        </linearGradient>
      </defs>
      {MODELS.map((m) => (
        <g key={m.id} className="ag-route" data-on={lit.includes(m.id) || undefined}>
          <path d={WIRES[m.id]} className="ag-wire" />
          {lit.includes(m.id) && <path key={agent.name} d={WIRES[m.id]} className="ag-pulse" pathLength={1} />}
        </g>
      ))}
      {MODELS.map((m) => {
        const on = lit.includes(m.id);
        const { cx, cy } = TILES[m.id];
        return (
          <g key={m.id} className="ag-tile" data-on={on || undefined}>
            <rect x={cx - T / 2} y={cy - T / 2} width={T} height={T} rx={20} className="ag-tile-box" />
            {m.id === "none" ? (
              <text x={cx} y={cy + 10} textAnchor="middle" className="ag-tile-glyph">{"{ }"}</text>
            ) : (
              <image href={`${base}/icons/nvidia-color-eye.svg`} x={cx - EYE_W / 2} y={cy - (EYE_W * (166 / 249.5)) / 2} width={EYE_W} height={EYE_W * (166 / 249.5)} className="ag-eye" data-on={on || undefined} />
            )}
            <text x={cx} y={cy + T / 2 + 22} textAnchor="middle" className="ag-model-label">{m.label}</text>
            <text x={cx} y={cy + T / 2 + 39} textAnchor="middle" className="ag-model-sub">{m.sub}</text>
          </g>
        );
      })}
      <g className="ag-hub">
        <rect x={C.cx - C.s / 2} y={C.cy - C.s / 2} width={C.s} height={C.s} rx={30} className="ag-hub-box" />
        <rect x={C.cx - C.s / 2} y={C.cy - C.s / 2} width={C.s} height={C.s} rx={30} className="ag-hub-rim" stroke="url(#ag-rim)" />
        <rect x={C.cx - C.s / 2} y={C.cy - C.s / 2} width={C.s} height={C.s} rx={30} className="ag-hub-rim" stroke="url(#ag-grain)" />
        <path d={WOLF_PATH} fillRule="evenodd" className="ag-hub-mark" transform={`translate(${C.cx - MARK / 2} ${C.cy - MARK / 2}) scale(${MARK / 600}) translate(-55 -55)`} />
      </g>
      <g className="ag-name">
        <rect x={C.cx - agent.name.length * 4.6 - 16} y={C.cy + C.s / 2 + 18} width={agent.name.length * 9.2 + 32} height={34} rx={9} />
        <text x={C.cx} y={C.cy + C.s / 2 + 40} textAnchor="middle" fontSize={16}>
          {agent.name}
        </text>
      </g>
    </svg>
  );
}

/**
 * The agents (vite.dev's plugin figure, our tones): pick an agent on the left and the figure shows
 * which model it calls: its slab, the model id on the wire, and the model plates it lights. It
 * cycles through the agents while in view until someone picks one; reduced motion: no cycling.
 */
export function AgentsPanel({ agents }: { agents: readonly Agent[] }) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setVisible(entries[entries.length - 1]!.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (held || !visible || prefersReducedMotion()) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % agents.length), 3200);
    return () => clearInterval(timer);
  }, [held, visible, agents.length]);
  return (
    <div className="ag" ref={ref}>
      <ul className="ag-list" data-testid="agent-rows">
        {agents.map((a, i) => (
          <li key={a.name}>
            <button
              type="button"
              className="ag-row"
              aria-pressed={i === active}
              onClick={() => {
                setActive(i);
                setHeld(true);
              }}
            >
              <span className="ag-name">{a.name}</span>
              <span className="ag-does">{a.does}</span>
              <span className="ag-model">
                {/* eslint-disable-next-line @next/next/no-img-element -- a vendored static icon */}
                {a.model.startsWith("Nemotron") && <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden className="inline-block h-3.5 w-5 shrink-0 object-contain" />}
                {a.model}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="ag-stage fx-art" data-tone="green">
        <span className="fx-beams" aria-hidden />
        <div className="ag-card">
          <Figure agent={agents[active]!} />
        </div>
      </div>
    </div>
  );
}
