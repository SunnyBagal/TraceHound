"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { GraphCanvas, type Selection } from "./GraphCanvas";
import { Inspector } from "./Inspector";
import { TopBar } from "./TopBar";
import { WarningsPanel } from "./WarningsPanel";

/** Deep links: ?component=<id> or ?edge=<id> opens the inspector on load. */
function initialSelection(snapshot: Snapshot): Selection {
  try {
    const params = new URLSearchParams(window.location.search);
    const component = params.get("component");
    const edge = params.get("edge");
    if (component && snapshot.components.some((c) => c.id === component)) return { type: "node", id: component };
    if (edge && snapshot.edges.some((e) => e.id === edge)) return { type: "edge", id: edge };
  } catch {
    // no window/URL: start unselected
  }
  return null;
}

export function Viewer({ snapshot }: { snapshot: Snapshot }) {
  const [selection, setSelection] = useState<Selection>(() => initialSelection(snapshot));
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar snapshot={snapshot} />
        <main className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <GraphCanvas snapshot={snapshot} selection={selection} onSelect={setSelection} focusId={focus.id} focusNonce={focus.nonce} />
            <WarningsPanel
              snapshot={snapshot}
              onFocus={(id) => {
                setSelection({ type: "node", id });
                setFocus((f) => ({ id, nonce: f.nonce + 1 }));
              }}
            />
          </div>
          <Inspector snapshot={snapshot} selection={selection} onSelect={setSelection} />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
