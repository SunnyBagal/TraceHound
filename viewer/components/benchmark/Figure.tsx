import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A figure as the Opus 5.5 page draws one: a square frame with its title inside, the caption under it. */
export function Figure({ id, title, meta, children, caption, captionTestId, glow }: { id: string; title: ReactNode; meta?: ReactNode; children: ReactNode; caption: ReactNode; captionTestId?: string; glow?: Glow }) {
  return <figure aria-labelledby={id} className="bench-figure">
    <Card className="bench-frame" data-glow={glow}>
      <CardHeader className="bench-fig-header px-0"><CardTitle><h3 id={id} className="bench-fig-title">{title}</h3></CardTitle>{meta && <p className="bench-fig-meta">{meta}</p>}</CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
    <figcaption className="bench-caption" data-testid={captionTestId}>{caption}</figcaption>
  </figure>;
}

/** The homepage's tones as a thin textured gradient border (vite+'s card edge); used on three containers only. */
export type Glow = "violet" | "glacier" | "amber";

type Swatch = "ours" | "history" | "tool" | "band" | "solid" | "hatch" | "line" | "dash";
/** Square swatches with plain labels, top right. */
export function Legend({ items }: { items: [Swatch, string][] }) {
  return <ul className="bench-legend" aria-label="Legend">
    {items.map(([kind, label]) => <li key={label}><span className="bench-swatch" data-kind={kind} aria-hidden />{label}</li>)}
  </ul>;
}
