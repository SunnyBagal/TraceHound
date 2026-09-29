"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGraph, neighbours, NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { elkLayout, type Positions } from "@/lib/layout";
import { clearPositions, loadPositions, savePositions } from "@/lib/positions";
import type { Snapshot } from "@/lib/types";
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
}

export function GraphCanvas({ snapshot, selection, onSelect, focusId, focusNonce }: GraphCanvasProps) {
  const base = useMemo(() => buildGraph(snapshot), [snapshot]);
  const storageKey = `${snapshot.repo.commitSha}:${snapshot.analyzerVersion}`;
  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentNodeType>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [layoutRun, setLayoutRun] = useState(0);
  const { fitView, setCenter } = useReactFlow();

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
        requestAnimationFrame(() => fitView({ padding: 0.18, duration: 300 }));
      });
    return () => {
      cancelled = true;
    };
  }, [base, storageKey, setNodes, fitView, layoutRun]);

  useEffect(() => {
    if (!focusId) return;
    const node = nodes.find((n) => n.id === focusId);
    if (!node) return;
    // On phones the inspector is a bottom sheet: aim for the visible strip above it.
    const zoom = 1.05;
    const sheetShift = window.innerWidth < 768 ? (window.innerHeight * 0.28) / zoom : 0;
    setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2 + sheetShift, { zoom, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per focus request, not per drag
  }, [focusId, focusNonce]);

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
      nodes.map((n) => ({
        ...n,
        selected: selection?.type === "node" && selection.id === n.id,
        data: { ...n.data, dimmed: focusSet ? !focusSet.has(n.id) : false, highlighted: focusId === n.id },
      })),
    [nodes, selection, focusSet, focusId],
  );
  const displayEdges = useMemo(
    () =>
      base.edges.map((e) => ({
        ...e,
        selected: selection?.type === "edge" && selection.id === e.id,
        data: { ...e.data!, active: activeEdgeIds.has(e.id), dimmed: focusSet ? !activeEdgeIds.has(e.id) : false },
      })),
    [base.edges, selection, activeEdgeIds, focusSet],
  );

  const persist = useCallback(() => {
    savePositions(storageKey, Object.fromEntries(nodes.map((n) => [n.id, n.position])));
  }, [nodes, storageKey]);

  const onNodeClick: NodeMouseHandler<ComponentNodeType> = (_, node) => onSelect({ type: "node", id: node.id });

  return (
    <div className="relative size-full" data-testid="graph-canvas">
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
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a2a33" />
        <MiniMap pannable zoomable nodeColor={() => "#34343d"} nodeStrokeWidth={0} className="!hidden md:!block" />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-right">
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
