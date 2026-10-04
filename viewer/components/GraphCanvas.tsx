"use client";

import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import { Maximize, Minus, Plus, RotateCcw, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeModel } from "@/lib/changes";
import { buildGraph, neighbours, NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType, type EvidenceEdge as EvidenceEdgeType } from "@/lib/graph";
import { impactEdges, impactRoles, type ImpactReport } from "@/lib/impact";
import type { Highlight } from "@/lib/highlight";
import { elkLayout, type Positions } from "@/lib/layout";
import { clearPositions, loadPositions, savePositions } from "@/lib/positions";
import type { Snapshot } from "@/lib/types";
import { clampZoom, keepInView, MAX_ZOOM, MIN_ZOOM, minZoomFor } from "@/lib/zoom";
import { ComponentNode } from "./ComponentNode";
import { EdgeMarkers, EvidenceEdge } from "./EvidenceEdge";

export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

const nodeTypes = { component: ComponentNode };
const edgeTypes = { evidence: EvidenceEdge };

export interface GraphCanvasProps {
  snapshot: Snapshot;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** components to pulse and bring into view (warnings panels); one is centred, several are fitted */
  focusIds?: string[];
  focusNonce?: number;
  /** ?impact=<name>: style changed/affected components and the edges on their chains */
  impact?: ImpactReport;
  /** ?changes=<id>: badge changed components, colour changed edges, dim what the change didn't touch */
  changes?: ChangeModel;
  /** px of the canvas's right edge covered by the inspector overlay (0 when closed or on phones) */
  occludeRight?: number;
  /** transient hover/focus highlight from an inspector row (styled apart from the selection) */
  highlight?: Highlight | null;
}

const fitOptions = (minZoom: number) => ({ padding: 0.18, duration: 300, minZoom, maxZoom: MAX_ZOOM });

/** 0.4 on desktop, 0.2 on viewports narrower than 640px (lib/zoom.ts); follows resizes. */
function useMinZoom(): number {
  const [minZoom, setMinZoom] = useState(() => (typeof window === "undefined" ? MIN_ZOOM : minZoomFor(window.innerWidth)));
  useEffect(() => {
    const measure = () => setMinZoom(minZoomFor(window.innerWidth));
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return minZoom;
}
const MARGIN = 32; // px kept clear around a selection brought into view

export function GraphCanvas({ snapshot, selection, onSelect, focusIds = [], focusNonce, impact, changes, occludeRight = 0, highlight = null }: GraphCanvasProps) {
  const roles = useMemo(() => (impact ? impactRoles(impact) : null), [impact]);
  const chainEdges = useMemo(() => (impact ? impactEdges(impact) : null), [impact]);
  const base = useMemo(() => buildGraph(snapshot, changes?.extraEdges), [snapshot, changes]);
  // positions are per repo (lib/positions.ts); the commit is only used to pick up pre-040 saves
  const storageKey = snapshot.repo.name;
  const legacySha = snapshot.repo.commitSha;
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNodeType>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [layoutRun, setLayoutRun] = useState(0);
  const [fitted, setFitted] = useState(0); // bumps when a layout's fitView lands
  const { fitView, setCenter, getViewport, setViewport, zoomIn, zoomOut } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const minZoom = useMinZoom();
  const fit = fitOptions(minZoom);
  const fitRef = useRef(fit); // the layout effect reads the current limits without re-running ELK on resize
  fitRef.current = fit;

  // ELK layout, then any positions this viewer saved for this snapshot.
  useEffect(() => {
    let cancelled = false;
    elkLayout(
      base.nodes.map((n) => n.id),
      base.edges,
    )
      .catch((): Positions => Object.fromEntries(base.nodes.map((n, i) => [n.id, { x: (i % 3) * (NODE_WIDTH + 120), y: Math.floor(i / 3) * (NODE_HEIGHT + 80) }])))
      .then((layout) => {
        if (cancelled) return;
        const saved = loadPositions(storageKey, legacySha);
        setNodes(base.nodes.map((n) => ({ ...n, position: saved[n.id] ?? layout[n.id] ?? n.position })));
        requestAnimationFrame(() => void fitView(fitRef.current).then(() => !cancelled && setFitted((n) => n + 1)));
      });
    return () => {
      cancelled = true;
    };
  }, [base, storageKey, legacySha, setNodes, fitView, layoutRun]);

  // Warnings panel focus: pan to and pulse the component, centred in the part of the canvas the
  // inspector doesn't cover; several components (a change warning) are fitted into view together.
  const lastFocus = useRef<number | undefined>(undefined);
  const justFocused = useRef<string | null>(null);
  const focusKey = focusIds.join("|");
  useEffect(() => {
    if (!focusIds.length || lastFocus.current === focusNonce) return;
    const targets = nodes.filter((n) => focusIds.includes(n.id));
    if (!targets.length) return;
    lastFocus.current = focusNonce;
    if (targets.length === 1) {
      const node = targets[0]!;
      justFocused.current = `node:${node.id}`;
      const zoom = clampZoom(1.05, minZoom);
      setCenter(node.position.x + NODE_WIDTH / 2 + occludeRight / 2 / zoom, node.position.y + NODE_HEIGHT / 2, { zoom, duration: 500 });
    } else {
      void fitView({ ...fit, nodes: targets.map((n) => ({ id: n.id })), maxZoom: 1.05, ...(occludeRight ? { padding: { top: 0.15, bottom: 0.15, left: 0.1, right: `${occludeRight + MARGIN}px` } } : {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per focus request, not per drag
  }, [focusKey, focusNonce, nodes.length > 0]);

  // Keep the selected node (or both ends of the selected edge) visible while the inspector is
  // open: if the overlay would cover it, pan (same zoom, within the limits) so it sits in the
  // uncovered area.
  const selectionKey = selection ? `${selection.type}:${selection.id}` : null;
  useEffect(() => {
    const el = containerRef.current;
    if (justFocused.current && justFocused.current === selectionKey) {
      justFocused.current = null; // the focus pan above already placed it
      return;
    }
    if (!selection || !el || !nodes.length) return;
    const ids = selection.type === "node" ? [selection.id] : (() => {
      const e = snapshot.edges.find((x) => x.id === selection.id);
      return e ? [e.source, e.target] : [];
    })();
    const boxes = nodes.filter((n) => ids.includes(n.id));
    if (!boxes.length) return;
    const bounds = {
      minX: Math.min(...boxes.map((n) => n.position.x)),
      minY: Math.min(...boxes.map((n) => n.position.y)),
      maxX: Math.max(...boxes.map((n) => n.position.x + NODE_WIDTH)),
      maxY: Math.max(...boxes.map((n) => n.position.y + NODE_HEIGHT)),
    };
    const next = keepInView(bounds, getViewport(), { width: el.clientWidth, height: el.clientHeight }, occludeRight, MARGIN, minZoom);
    if (next) setViewport(next, { duration: 350 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per selection / panel change, not per drag
  }, [selectionKey, occludeRight, fitted]);

  const focusSet = useMemo(() => {
    const id = hoverId ?? (selection?.type === "node" ? selection.id : null);
    return id ? neighbours(snapshot, id) : null;
  }, [hoverId, selection, snapshot]);
  const activeEdgeIds = useMemo(() => {
    const id = hoverId ?? (selection?.type === "node" ? selection.id : null);
    return new Set(snapshot.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id));
  }, [hoverId, selection, snapshot]);

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const panelHover = Boolean(highlight?.nodeIds.includes(n.id));
        return {
          ...n,
          selected: selection?.type === "node" && selection.id === n.id,
          data: {
            ...n.data,
            // a panel-hovered node is never dimmed; then hover/selection focus; then impact mode
            // dims everything outside the impact
            // change view: components the change didn't touch stay visible, dimmed
            dimmed: panelHover ? false : focusSet ? !focusSet.has(n.id) : roles ? !roles.has(n.id) : changes ? !changes.diffs.has(n.id) : false,
            highlighted: focusIds.includes(n.id),
            panelHover,
            impact: roles ? (roles.get(n.id) ?? null) : undefined,
            change: changes ? (changes.diffs.get(n.id) ?? null) : undefined,
            changeSetOnly: changes?.synthetic.has(n.id),
          },
        };
      }),
    [nodes, selection, focusSet, focusKey, roles, highlight, changes],
  );
  const displayEdges = useMemo(
    () =>
      base.edges.map((e): EvidenceEdgeType => {
        const panelHover = Boolean(highlight?.edgeIds.includes(e.id));
        const diff = changes ? (changes.edgeStatus.get(e.id) ?? "unchanged") : undefined;
        const pair = changes?.pairEdges.get(`${e.source}->${e.target}`);
        // change view: an unchanged component edge stays lit when declaration edges under it changed
        const changed = diff !== undefined && (diff !== "unchanged" || Boolean(pair?.length));
        return {
          ...e,
          selected: selection?.type === "edge" && selection.id === e.id,
          data: {
            ...e.data!,
            active: activeEdgeIds.has(e.id) || (!focusSet && Boolean(chainEdges?.has(e.id))),
            dimmed: panelHover ? false : focusSet ? !activeEdgeIds.has(e.id) : chainEdges ? !chainEdges.has(e.id) : changes ? !changed : false,
            panelHover,
            onImpactChain: chainEdges?.has(e.id),
            impactMode: Boolean(chainEdges),
            diff,
            declEdges: pair ? { added: pair.filter((x) => x.status === "added").length, removed: pair.filter((x) => x.status === "removed").length } : undefined,
          },
        };
      }),
    [base.edges, selection, activeEdgeIds, focusSet, chainEdges, highlight, changes],
  );

  const persist = useCallback(() => {
    savePositions(storageKey, Object.fromEntries(nodes.map((n) => [n.id, n.position])));
  }, [nodes, storageKey]);

  const onNodeClick: NodeMouseHandler<ComponentNodeType> = (_, node) => onSelect({ type: "node", id: node.id });

  return (
    <div ref={containerRef} className="relative size-full" data-testid="graph-canvas">
      <EdgeMarkers />
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={persist}
        onNodeClick={onNodeClick}
        // an added component edge the published snapshot lacks has no snapshot evidence to inspect:
        // open its source component, whose Changes tab lists the declaration edges behind it
        onEdgeClick={(_, edge) => onSelect(edge.data?.extra ? { type: "node", id: edge.source } : { type: "edge", id: edge.id })}
        onPaneClick={() => onSelect(null)}
        onNodeMouseEnter={(_, n) => setHoverId(n.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        nodesConnectable={false}
        elementsSelectable
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--canvas-dot)" />
        {/* Railway-style controls: bottom left, stacked, icon only; the name is the aria-label */}
        <Panel position="bottom-left" className="flex flex-col gap-2" style={{ margin: 12, marginBottom: "calc(12px + env(safe-area-inset-bottom))" }} data-testid="canvas-controls">
          <div className={CONTROL_GROUP}>
            <ControlButton label="Zoom in" title="Zoom in" icon={Plus} onClick={() => void zoomIn({ duration: 200 })} />
            <ControlButton label="Zoom out" title="Zoom out" icon={Minus} onClick={() => void zoomOut({ duration: 200 })} />
            <ControlButton
              label="Fit view"
              title="Fit every component in view (beside the inspector when it is open)"
              icon={Maximize}
              onClick={() => fitView(occludeRight ? { ...fit, padding: { top: 0.12, bottom: 0.12, left: 0.06, right: `${occludeRight + MARGIN}px` } } : fit)}
            />
          </div>
          <div className={CONTROL_GROUP}>
            <ControlButton
              label="Reset layout"
              title="Discard saved positions and re-run the ELK layout"
              icon={RotateCcw}
              onClick={() => {
                clearPositions(storageKey);
                setLayoutRun((n) => n + 1);
              }}
            />
          </div>
        </Panel>
      </ReactFlow>
      {nodes.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-faint">Laying out {base.nodes.length} components…</div>}
    </div>
  );
}

const CONTROL_GROUP = "flex flex-col overflow-hidden rounded-lg border border-line bg-panel/90 shadow-lg backdrop-blur";

/** One canvas control: icon only, with an accessible name and a tooltip. */
function ControlButton({ label, title, icon: Icon, onClick }: { label: string; title: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title} className="grid size-8 place-items-center text-muted hover:bg-card hover:text-text focus-visible:bg-card focus-visible:text-text">
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
