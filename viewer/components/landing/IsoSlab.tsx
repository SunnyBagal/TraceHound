import { iso, slabOf, type Plan, type Projection } from "@/components/iso/iso-kit";
import { WOLF_PATH } from "@/lib/wolf";

/**
 * vite.dev's slab in TraceHound's colours, drawn with the Anatomy kit's camera: a rounded slab with
 * a dark top and sides lit in `tone`, a light sheen running along the sides (CSS, stopped under
 * reduced motion), and optionally the wolf mark lying on the top face. Server-safe.
 */
export function IsoSlab({ P, plan, z = 0, h, tone, id, mark, dim }: { P: Projection; plan: Plan; z?: number; h: number; tone: string; id: string; mark?: boolean; dim?: boolean }) {
  const s = slabOf(plan, z, h, P, 10);
  const sides = s.shades.filter(Boolean).join("");
  const markAt = iso([plan.x + plan.w / 2, plan.y + plan.d / 2, z + h], P);
  // half the top face's width on screen
  const markSize = Math.abs(iso([plan.x + plan.w, plan.y, z + h], P)[0] - iso([plan.x, plan.y + plan.d, z + h], P)[0]) * 0.42;
  return (
    <g className="islab" data-dim={dim || undefined} style={{ "--c": tone } as React.CSSProperties}>
      <defs>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor={tone} stopOpacity="0.35" />
          <stop offset="0.25" stopColor={tone} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.62" stopColor={tone} />
          <stop offset="1" stopColor={tone} stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={sides} />
        </clipPath>
      </defs>
      <path d={s.fill} className="islab-fill" />
      <path d={sides} fill={`url(#${id}-side)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <rect className="islab-sheen" x="-200" y="-100" width="200" height="1000" fill={`url(#${id}-sheen)`} />
      </g>
      <path d={s.top} className="islab-top" />
      <path d={s.crease} className="islab-crease" />
      <path d={s.outline} className="islab-outline" />
      {mark && (
        // the mark lies flat on the top face, facing the viewer (vite.dev's slab): the camera's tilt
        // squashes its height by sin(elevation)
        <path d={WOLF_PATH} fillRule="evenodd" className="islab-mark" transform={`translate(${markAt[0]} ${markAt[1]}) scale(${markSize / 600} ${(markSize / 600) * Math.sin(((P.elevation ?? 30) * Math.PI) / 180)}) translate(-355 -355)`} />
      )}
    </g>
  );
}
