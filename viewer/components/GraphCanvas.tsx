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
import { Maximize, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildGraph, neighbours, NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
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
  /** component to pulse and pan to (e.g. from the warnings panel) */
  focusId?: string | null;
  focusNonce?: number;
  /** ?impact=<name>: style changed/affected components and the edges on their chains */
  impact?: ImpactReport;
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

export function GraphCanvas({ snapshot, selection, onSelect, focusId, focusNonce, impact, occludeRight = 0, highlight = null }: GraphCanvasProps) {
  const roles = useMemo(() => (impact ? impactRoles(impact) : null), [impact]);
  const chainEdges = useMemo(() => (impact ? impactEdges(impact) : null), [impact]);
  const base = useMemo(() => buildGraph(snapshot), [snapshot]);
  const storageKey = `${snapshot.repo.commitSha}:${snapshot.analyzerVersion}`;
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNodeType>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [layoutRun, setLayoutRun] = useState(0);
  const [fitted, setFitted] = useState(0); // bumps when a layout's fitView lands
  const { fitView, setCenter, getViewport, setViewport } = useReactFlow();
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
        const saved = loadPositions(storageKey);
        setNodes(base.nodes.map((n) => ({ ...n, position: saved[n.id] ?? layout[n.id] ?? n.position })));
        requestAnimationFrame(() => void fitView(fitRef.current).then(() => !cancelled && setFitted((n) => n + 1)));
      });
    return () => {
      cancelled = true;
    };
  }, [base, storageKey, setNodes, fitView, layoutRun]);

  // Warnings panel focus: pan to and pulse the component, centred in the part of the canvas the
  // inspector doesn't cover.
  const lastFocus = useRef<number | undefined>(undefined);
  const justFocused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || lastFocus.current === focusNonce) return;
    const node = nodes.find((n) => n.id === focusId);
    if (!node) return;
    lastFocus.current = focusNonce;
    justFocused.current = `node:${focusId}`;
    const zoom = clampZoom(1.05, minZoom);
    setCenter(node.position.x + NODE_WIDTH / 2 + occludeRight / 2 / zoom, node.position.y + NODE_HEIGHT / 2, { zoom, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per focus request, not per drag
  }, [focusId, focusNonce, nodes.length > 0]);

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
            dimmed: panelHover ? false : focusSet ? !focusSet.has(n.id) : roles ? !roles.has(n.id) : false,
            highlighted: focusId === n.id,
            panelHover,
            impact: roles ? (roles.get(n.id) ?? null) : undefined,
          },
        };
      }),
    [nodes, selection, focusSet, focusId, roles, highlight],
  );
  const displayEdges = useMemo(
    () =>
      base.edges.map((e) => {
        const panelHover = Boolean(highlight?.edgeIds.includes(e.id));
        return {
          ...e,
          selected: selection?.type === "edge" && selection.id === e.id,
          data: {
            ...e.data!,
            active: activeEdgeIds.has(e.id) || (!focusSet && Boolean(chainEdges?.has(e.id))),
            dimmed: panelHover ? false : focusSet ? !activeEdgeIds.has(e.id) : chainEdges ? !chainEdges.has(e.id) : false,
            panelHover,
            onImpactChain: chainEdges?.has(e.id),
            impactMode: Boolean(chainEdges),
          },
        };
      }),
    [base.edges, selection, activeEdgeIds, focusSet, chainEdges, highlight],
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
        onEdgeClick={(_, edge) => onSelect({ type: "edge", id: edge.id })}
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
        <Panel position="top-right" className="flex flex-col gap-2 transition-[right] duration-300 sm:flex-row" style={{ right: occludeRight }}>
          <button
            type="button"
            onClick={() => fitView(occludeRight ? { ...fit, padding: { top: 0.12, bottom: 0.12, left: 0.06, right: `${occludeRight + MARGIN}px` } } : fit)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-xs text-muted backdrop-blur hover:border-line-strong hover:text-text"
            title="Fit every component in view (beside the inspector when it is open)"
          >
            <Maximize className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Fit view</span>
          </button>
          <button
            type="button"
            onClick={() => {
              clearPositions(storageKey);
              setLayoutRun((n) => n + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-xs text-muted backdrop-blur hover:border-line-strong hover:text-text"
            title="Discard saved positions and re-run the ELK layout"
          >
            <RotateCcw className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Reset layout</span>
          </button>
        </Panel>
      </ReactFlow>
      {nodes.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-faint">Laying out {base.nodes.length} components…</div>}
    </div>
  );
}
