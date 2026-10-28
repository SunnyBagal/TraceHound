import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A figure as the Opus 5.5 page draws one: a square frame with its title inside, the caption under it. */
export function Figure({ id, title, children, caption, captionTestId }: { id: string; title: ReactNode; children: ReactNode; caption: ReactNode; captionTestId?: string }) {
  return <figure aria-labelledby={id} className="bench-figure">
    <Card className="bench-frame">
      <CardHeader className="px-0"><CardTitle><h2 id={id} className="bench-fig-title">{title}</h2></CardTitle></CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
    <figcaption className="bench-caption" data-testid={captionTestId}>{caption}</figcaption>
  </figure>;
}

type Swatch = "ours" | "history" | "tool" | "band" | "solid" | "hatch" | "line" | "dash";
/** Square swatches with plain labels, top right. */
export function Legend({ items }: { items: [Swatch, string][] }) {
  return <ul className="bench-legend" aria-label="Legend">
    {items.map(([kind, label]) => <li key={label}><span className="bench-swatch" data-kind={kind} aria-hidden />{label}</li>)}
  </ul>;
}
