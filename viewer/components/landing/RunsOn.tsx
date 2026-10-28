import { fitProjection, boxCorners, type Plan } from "@/components/iso/iso-kit";
import { IsoSlab } from "./IsoSlab";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** What TraceHound runs on (left) and is built with (right), around its slab (vite.dev's ecosystem row). */
const RUNS_ON = ["NVIDIA Nemotron", "Nebius Token Factory", "Docker sandbox"] as const;
const BUILT_WITH = ["ts-morph", "ELK", "React Flow"] as const;

const PLAN: Plan = { x: 0, y: 0, w: 120, d: 120, r: 22 };
const P = fitProjection(boxCorners(PLAN, 0, 22), 260, 180, { pad: 18 });

function Box({ label, items, side }: { label: string; items: readonly string[]; side: "l" | "r" }) {
  return (
    <div className="ro-box" data-side={side}>
      <p className="ro-label">{label}</p>
      <ul className="ro-tiles">
        {items.map((name) => (
          <li key={name} className="ro-tile">
            {/* eslint-disable-next-line @next/next/no-img-element -- a vendored static icon */}
            {name === "NVIDIA Nemotron" && <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden className="h-3.5 w-5 object-contain" />}
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunsOn() {
  return (
    <section aria-label="Runs on" className="ro">
      <div className="lp-col ro-row">
        <Box label="Runs on" items={RUNS_ON} side="l" />
        <span className="ro-wire" data-side="l" aria-hidden />
        <svg viewBox="0 0 260 180" className="ro-slab" aria-hidden>
          <IsoSlab P={P} plan={PLAN} h={22} tone="#f5a524" id="ro-slab" mark />
        </svg>
        <span className="ro-wire" data-side="r" aria-hidden />
        <Box label="Built with" items={BUILT_WITH} side="r" />
      </div>
    </section>
  );
}
