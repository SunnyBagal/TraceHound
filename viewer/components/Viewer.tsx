"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeModel, ChangeSetEntry } from "@/lib/changes";
import { useHighlight, type Highlight } from "@/lib/highlight";
import { impactParam, type ImpactReport } from "@/lib/impact";
import { current, usePanelNavigation } from "@/lib/navigation";
import type { RepoInfo } from "@/lib/repos";
import type { Snapshot } from "@/lib/types";
import { ChangeList } from "./ChangeList";
import { ChangeSummaryBar } from "./ChangeSummaryBar";
import { ChangeWarningsPanel } from "./ChangeWarningsPanel";
import { GraphCanvas, type Selection } from "./GraphCanvas";
import { ImpactPanel } from "./ImpactPanel";
import { Inspector } from "./Inspector";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { WarningsControl } from "./WarningsControl";

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

/** Below 768px (the inspector's md breakpoint) the change view is a list, not a canvas. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

export interface ViewerProps {
  snapshot: Snapshot;
  repos?: RepoInfo[];
  repoId?: string;
  changeSets?: ChangeSetEntry[];
  impact?: ImpactReport;
  changes?: ChangeModel;
}

export function Viewer({ snapshot, repos = [], repoId, changeSets = [], impact, changes }: ViewerProps) {
  // ?component= / ?edge= deep links, and the inspector's back/breadcrumb history
  const nav = usePanelNavigation(snapshot);
  const entry = current(nav.stack);
  const selection: Selection = entry ? { type: entry.type, id: entry.id } : null;
  const [impactName] = useState(() => (typeof window === "undefined" ? null : impactParam(window.location.search)));
  const [focus, setFocus] = useState<{ ids: string[]; nonce: number }>({ ids: [], nonce: 0 });
  const overlay = useOverlayWidth();
  const phone = useIsPhone();
  const { close } = nav;
  const occludeRight = selection ? overlay : 0;
  // inspector-row hover/focus highlight: transient, dropped whenever the panel shows something else
  const highlight = useHighlight();
  const { clear } = highlight;
  useEffect(() => clear(), [clear, entry?.type, entry?.id, entry?.tab]);

  // change view: the warning whose components are lit on the canvas (click again or Esc to drop it)
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const warningHighlight = useMemo<Highlight | null>(() => {
    if (!changes || !activeWarning) return null;
    const nodeIds = changes.warningComponents.get(activeWarning) ?? [];
    const edgeIds = snapshot.edges.filter((e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)).map((e) => e.id);
    return { key: `warning:${activeWarning}`, nodeIds, edgeIds };
  }, [changes, activeWarning, snapshot]);
  const toggleWarning = useCallback(
    (id: string) => {
      const next = activeWarning === id ? null : id;
      setActiveWarning(next);
      const ids = next ? (changes?.warningComponents.get(next) ?? []) : [];
      if (ids.length) setFocus((f) => ({ ids, nonce: f.nonce + 1 }));
    },
    [activeWarning, changes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (current(nav.stack)) close();
      else setActiveWarning(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, nav.stack]);

  const listView = Boolean(changes) && phone;

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh overflow-hidden">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar snapshot={snapshot} repos={repos} repoId={repoId} changeSets={changeSets} changes={changes} />
          {changes && <ChangeSummaryBar model={changes} />}
          <main className="relative flex min-h-0 flex-1">
            {listView && changes ? (
              <ChangeList model={changes} onOpen={(id) => nav.open({ type: "node", id })} />
            ) : (
              <>
                {impact && <ImpactPanel name={impactName ?? "impact"} impact={impact} snapshot={snapshot} onSelect={nav.open} />}
                {changes && <ChangeWarningsPanel model={changes} activeId={activeWarning} onToggle={toggleWarning} onOpen={(id) => nav.open({ type: "node", id })} />}
                <div className="relative min-w-0 flex-1 overflow-hidden">
                  <GraphCanvas
                    snapshot={snapshot}
                    selection={selection}
                    onSelect={nav.open}
                    focusIds={focus.ids}
                    focusNonce={focus.nonce}
                    impact={impact}
                    changes={changes}
                    occludeRight={occludeRight}
                    highlight={highlight.active ?? warningHighlight}
                  />
                  {!changes && (
                    <WarningsControl
                      snapshot={snapshot}
                      right={occludeRight}
                      onFocus={(id) => {
                        nav.open({ type: "node", id });
                        setFocus((f) => ({ ids: [id], nonce: f.nonce + 1 }));
                      }}
                    />
                  )}
                </div>
              </>
            )}
            <Inspector snapshot={snapshot} nav={nav} bind={highlight.bind} changes={changes} />
          </main>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
