"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";
import { useHighlight } from "@/lib/highlight";
import { impactParam, type ImpactReport } from "@/lib/impact";
import { current, usePanelNavigation } from "@/lib/navigation";
import type { Snapshot } from "@/lib/types";
import { GraphCanvas, type Selection } from "./GraphCanvas";
import { ImpactPanel } from "./ImpactPanel";
import { Inspector } from "./Inspector";
import { TopBar } from "./TopBar";
import { WarningsPanel } from "./WarningsPanel";

/** Inspector overlay width on desktop; mirrors md:w-[clamp(420px,34vw,600px)] in Inspector. 0 on phones. */
function useOverlayWidth(): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const measure = () => setWidth(window.innerWidth >= 768 ? Math.min(600, Math.max(420, window.innerWidth * 0.34)) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return width;
}

export function Viewer({ snapshot, impact }: { snapshot: Snapshot; impact?: ImpactReport }) {
  // ?component= / ?edge= deep links, and the inspector's back/breadcrumb history
  const nav = usePanelNavigation(snapshot);
  const entry = current(nav.stack);
  const selection: Selection = entry ? { type: entry.type, id: entry.id } : null;
  const [impactName] = useState(() => (typeof window === "undefined" ? null : impactParam(window.location.search)));
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });
  const overlay = useOverlayWidth();
  const { close } = nav;
  // inspector-row hover/focus highlight: transient, dropped whenever the panel shows something else
  const highlight = useHighlight();
  const { clear } = highlight;
  useEffect(() => clear(), [clear, entry?.type, entry?.id, entry?.tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar snapshot={snapshot} />
        <main className="relative flex min-h-0 flex-1">
          {impact && <ImpactPanel name={impactName ?? "impact"} impact={impact} snapshot={snapshot} onSelect={nav.open} />}
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <GraphCanvas
              snapshot={snapshot}
              selection={selection}
              onSelect={nav.open}
              focusId={focus.id}
              focusNonce={focus.nonce}
              impact={impact}
              occludeRight={selection ? overlay : 0}
              highlight={highlight.active}
            />
            {/* on phones the impact panel takes the warnings panel's corner */}
            <div className={impact ? "hidden md:block" : undefined}>
              <WarningsPanel
                snapshot={snapshot}
                onFocus={(id) => {
                  nav.open({ type: "node", id });
                  setFocus((f) => ({ id, nonce: f.nonce + 1 }));
                }}
              />
            </div>
            <Inspector snapshot={snapshot} nav={nav} bind={highlight.bind} />
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
