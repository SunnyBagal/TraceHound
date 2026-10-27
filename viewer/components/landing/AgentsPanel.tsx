"use client";

import { useEffect, useRef, useState } from "react";
import { boxCorners, fitProjection, iso, slabOf, topMatrix, type Plan } from "@/components/iso/iso-kit";
import { prefersReducedMotion } from "@/components/Logo";
import { IsoSlab } from "./IsoSlab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface Agent {
  name: string;
  does: string;
  model: string;
}

/* the model plates, bottom to top; an agent lights the ones its model string names */
const PLATES = [
  { id: "none", label: "no model" },
  { id: "nano", label: "Nemotron Nano" },
  { id: "super", label: "Nemotron Super" },
] as const;
type PlateId = (typeof PLATES)[number]["id"];
const platesOf = (model: string): PlateId[] => (model === "no model" ? ["none"] : [...(model.includes("Nano") ? ["nano" as const] : []), ...(model.includes("Super") ? ["super" as const] : [])]);

/* the world: the agent's slab, and a stack of model plates to its right on screen (+x, −y) */
const SLAB: Plan = { x: 0, y: 0, w: 130, d: 130, r: 24 };
const STACK: Plan = { x: 310, y: -310, w: 124, d: 124, r: 20 };
const GAP = 44;
const W = 600;
const H = 290;
const P = fitProjection([...boxCorners(SLAB, 0, 24), ...boxCorners(STACK, 0, GAP * 2 + 4)], W, H, { pad: 14 });
const plateZ = (i: number) => i * GAP;
const PLATE_PATHS = PLATES.map((_, i) => slabOf(STACK, plateZ(i), 4, P, 10));
const slabRight = iso([SLAB.x + SLAB.w, SLAB.y, 12], P);
const plateLeft = (i: number) => iso([STACK.x, STACK.y + STACK.d, plateZ(i) + 4], P);
const PILL = { x: (slabRight[0] + plateLeft(1)[0]) / 2, y: (slabRight[1] + plateLeft(1)[1]) / 2 };

function Figure({ agent }: { agent: Agent }) {
  const lit = platesOf(agent.model);
  const text = agent.model === "no model" ? "no model · deterministic" : agent.model;
  const pw = text.length * 7 + 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ag-fig" role="img" aria-label={`${agent.name}: ${agent.model}`}>
      <IsoSlab P={P} plan={SLAB} h={24} tone="#5ee68f" id="ag-slab" mark />
      <path d={`M${slabRight[0]} ${slabRight[1]} H${PILL.x - pw / 2}`} className="ag-wire" />
      {PLATES.map((p, i) => {
        const [lx, ly] = plateLeft(i);
        return <path key={p.id} d={`M${PILL.x + pw / 2} ${PILL.y} C${PILL.x + pw / 2 + 30} ${PILL.y}, ${lx - 30} ${ly}, ${lx} ${ly}`} className="ag-wire" data-on={lit.includes(p.id) || undefined} />;
      })}
      {PLATES.map((p, i) => {
        const s = PLATE_PATHS[i]!;
        return (
          <g key={p.id} className="ag-plate" data-on={lit.includes(p.id) || undefined}>
            <path d={s.fill} className="ag-plate-fill" />
            <path d={s.shades.filter(Boolean).join("")} className="ag-plate-side" />
            <path d={s.top} className="ag-plate-top" />
            <path d={s.outline} className="ag-plate-line" />
            <text transform={topMatrix([STACK.x + 14, STACK.y + STACK.d - 12], plateZ(i) + 4, P, "x")} fontSize={15} className="ag-plate-label">
              {p.label}
            </text>
          </g>
        );
      })}
      <g className="ag-pill">
        <rect x={PILL.x - pw / 2} y={PILL.y - 15} width={pw} height={30} rx={8} />
        <text x={PILL.x} y={PILL.y + 4.5} textAnchor="middle" fontSize={11.5}>
          {text}
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
