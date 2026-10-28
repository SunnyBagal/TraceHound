"use client";

import { useEffect, useRef, useState } from "react";
import { boxCorners, fitProjection, iso, type Plan } from "@/components/iso/iso-kit";
import { prefersReducedMotion } from "@/components/Logo";
import { IsoSlab } from "./IsoSlab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface Agent {
  name: string;
  does: string;
  model: string;
}

/* the three places an agent's work can go; an agent lights the ones its model string names */
const MODELS = [
  { id: "none", label: "no model", sub: "deterministic", tone: "#9aa1b2" },
  { id: "nano", label: "Nemotron Nano", sub: "30B-A3B", tone: "#76b900" },
  { id: "super", label: "Nemotron Super", sub: "120B-A12B", tone: "#76b900" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];
const modelsOf = (model: string): ModelId[] => (model === "no model" ? ["none"] : [...(model.includes("Nano") ? ["nano" as const] : []), ...(model.includes("Super") ? ["super" as const] : [])]);

/* the world: the agent's slab at the back (top of the picture), the three model slabs on one line
   in front of it (x + y equal, so they sit side by side on screen) */
const AGENT: Plan = { x: 0, y: 0, w: 130, d: 130, r: 24 };
const SPOTS: readonly (readonly [number, number])[] = [
  [40, 330],
  [185, 185],
  [330, 40],
];
const MS = 96;
const W = 520;
const H = 410;
const plans = SPOTS.map(([x, y]): Plan => ({ x, y, w: MS, d: MS, r: 18 }));
const P = fitProjection([...boxCorners(AGENT, 0, 26), ...plans.flatMap((p) => boxCorners(p, 0, 18))], W, H, { pad: 14, headroom: 58 });
const agentBottom = iso([AGENT.x + AGENT.w, AGENT.y + AGENT.d, 0], P);
const modelTop = (i: number) => iso([plans[i]!.x + MS / 2, plans[i]!.y + MS / 2, 18], P);
const BUS = (agentBottom[1] + Math.min(...plans.map((_, i) => modelTop(i)[1]))) / 2;
/** agent → down to the bus → across → down to the model slab, with rounded corners */
const wire = (i: number) => {
  const [x0, y0] = agentBottom;
  const [x1, y1] = modelTop(i);
  if (Math.abs(x1 - x0) < 1) return `M${x0} ${y0 + 6} V${y1}`;
  const r = 14;
  const dir = Math.sign(x1 - x0);
  return `M${x0} ${y0 + 6} V${BUS - r} Q${x0} ${BUS} ${x0 + dir * r} ${BUS} H${x1 - dir * r} Q${x1} ${BUS} ${x1} ${BUS + r} V${y1}`;
};

function Figure({ agent }: { agent: Agent }) {
  const lit = modelsOf(agent.model);
  const name = iso([AGENT.x + AGENT.w / 2, AGENT.y + AGENT.d / 2, 26], P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ag-fig" role="img" aria-label={`${agent.name}: ${agent.model}`}>
      {MODELS.map((m, i) => (
        <g key={m.id} className="ag-route" data-on={lit.includes(m.id) || undefined}>
          <path d={wire(i)} className="ag-wire" />
          {lit.includes(m.id) && <path key={agent.name} d={wire(i)} className="ag-pulse" pathLength={1} />}
        </g>
      ))}
      <IsoSlab P={P} plan={AGENT} h={26} tone="#5ee68f" id="ag-agent" mark />
      <g className="ag-name">
        <rect x={name[0] - agent.name.length * 4.6 - 16} y={name[1] - 118} width={agent.name.length * 9.2 + 32} height={34} rx={9} />
        <text x={name[0]} y={name[1] - 96} textAnchor="middle" fontSize={16}>
          {agent.name}
        </text>
      </g>
      {MODELS.map((m, i) => {
        const on = lit.includes(m.id);
        const ly = iso([plans[i]!.x + MS, plans[i]!.y + MS, 0], P)[1];
        const cx = modelTop(i)[0];
        return (
          <g key={m.id} className="ag-model-slab" data-on={on || undefined}>
            <IsoSlab P={P} plan={plans[i]!} h={18} tone={on ? m.tone : "#3a3c47"} id={`ag-m-${m.id}`} dim={!on} />
            <text x={cx} y={ly + 30} textAnchor="middle" className="ag-model-label">
              {m.label}
            </text>
            <text x={cx} y={ly + 48} textAnchor="middle" className="ag-model-sub">
              {m.sub}
            </text>
          </g>
        );
      })}
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
