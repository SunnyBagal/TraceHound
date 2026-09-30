"use client";

import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { memo } from "react";
import { EDGE_STYLES, NODE_HEIGHT, NODE_WIDTH, type EvidenceEdge as EvidenceEdgeType } from "@/lib/graph";

const FAN = 30; // px between parallel edges along a node side

type Side = "left" | "right" | "top" | "bottom";
const NORMAL: Record<Side, { x: number; y: number }> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function box(node: InternalNode) {
  const { x, y } = node.internals.positionAbsolute;
  return { x, y, w: node.measured?.width ?? NODE_WIDTH, h: node.measured?.height ?? NODE_HEIGHT };
}

function anchor(b: ReturnType<typeof box>, side: Side, shift: number) {
  switch (side) {
    case "left": return { x: b.x, y: b.y + b.h / 2 + shift };
    case "right": return { x: b.x + b.w, y: b.y + b.h / 2 + shift };
    case "top": return { x: b.x + b.w / 2 + shift, y: b.y };
    case "bottom": return { x: b.x + b.w / 2 + shift, y: b.y + b.h };
  }
}

/**
 * Floating edge: leaves from whichever side of the source faces the target (and vice versa), so
 * backward edges in the left-to-right layout don't loop around the canvas.
 */
function route(s: ReturnType<typeof box>, t: ReturnType<typeof box>, parallelIndex: number, parallelCount: number) {
  const dx = t.x + t.w / 2 - (s.x + s.w / 2);
  const dy = t.y + t.h / 2 - (s.y + s.h / 2);
  const horizontal = Math.abs(dx) > Math.abs(dy) * 0.9 || Math.abs(dx) > (s.w + t.w) / 2 + 24;
  const [ss, ts]: [Side, Side] = horizontal ? (dx >= 0 ? ["right", "left"] : ["left", "right"]) : dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
  // edges between the same pair (either direction) share sides; the shift is an absolute
  // offset along that side, so each one gets its own lane
  const shift = (parallelIndex - (parallelCount - 1) / 2) * FAN;
  const p0 = anchor(s, ss, shift);
  const p3 = anchor(t, ts, shift);
  const reach = Math.max(48, Math.hypot(p3.x - p0.x, p3.y - p0.y) / 3);
  const p1 = { x: p0.x + NORMAL[ss].x * reach, y: p0.y + NORMAL[ss].y * reach };
  const p2 = { x: p3.x + NORMAL[ts].x * reach, y: p3.y + NORMAL[ts].y * reach };
  return {
    path: `M ${p0.x},${p0.y} C ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
    labelX: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
    labelY: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
  };
}

function EvidenceEdgeView({ id, source, target, data, selected }: EdgeProps<EvidenceEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!data || !sourceNode || !targetNode) return null;
  const { edge, parallelIndex, parallelCount } = data;
  const style = EDGE_STYLES[edge.confidenceLabel];
  const active = selected || data.active;
  const flagDynamic = data.impactMode && edge.confidenceLabel === "dynamic"; // impact mode: dynamic edges are called out
  const { path, labelX, labelY } = route(box(sourceNode), box(targetNode), parallelIndex, parallelCount);
  const hover = Boolean(data.panelHover); // inspector-row hover, styled apart from the selection
  const stroke = hover ? "var(--highlight)" : active ? "var(--edge-active)" : "var(--edge)";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{
          stroke,
          strokeWidth: hover ? 2.8 : active ? 2.2 : 1.6,
          strokeDasharray: style.dash,
          strokeLinecap: edge.confidenceLabel === "dynamic" ? "round" : "butt",
          opacity: data.dimmed ? (flagDynamic ? 0.5 : 0.14) : 1,
          transition: "opacity 200ms, stroke 200ms",
        }}
        markerEnd={`url(#th-arrow${hover ? "-highlight" : active ? "-active" : ""})`}
      />
      {/* test/inspection hook: the path's dash pattern is the confidence style */}
      <path data-testid="edge-path" data-edge-id={edge.id} data-panel-hover={hover || undefined} data-confidence={edge.confidenceLabel} d={path} fill="none" stroke="none" strokeDasharray={style.dash ?? "none"} />
      <EdgeLabelRenderer>
        <div
          data-testid="edge-label"
          className={[
            "nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-tight transition-opacity duration-200",
            hover ? "border-highlight bg-panel text-text" : active ? "border-accent/60 bg-panel text-text" : "border-line bg-bg/90 text-muted",
          ].join(" ")}
          style={{ left: labelX, top: labelY, opacity: data.dimmed ? (flagDynamic ? 0.6 : 0.15) : 1 }}
          title={`${edge.label} (${edge.weight} evidence)`}
        >
          {flagDynamic && (
            <span data-testid="dynamic-flag" className="mr-1 rounded bg-warn px-1 font-semibold text-bg">
              ⚠ DYNAMIC
            </span>
          )}
          {edge.kind} · <span className={active ? "text-accent" : "text-text/80"}>{style.text}</span>
          {edge.weight > 1 && <span className="text-faint"> ×{edge.weight}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const EvidenceEdge = memo(EvidenceEdgeView);

/** Arrowhead markers referenced by EvidenceEdge. */
export function EdgeMarkers() {
  return (
    <svg className="absolute size-0" aria-hidden>
      <defs>
        {[
          ["th-arrow", "var(--edge)"],
          ["th-arrow-active", "var(--edge-active)"],
          ["th-arrow-highlight", "var(--highlight)"],
        ].map(([id, color]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
