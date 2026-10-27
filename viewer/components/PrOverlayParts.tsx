"use client";

import { BaseEdge, EdgeLabelRenderer, Handle, Position, useInternalNode, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { GitPullRequest } from "lucide-react";
import { memo } from "react";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph";

/**
 * The PR overlay's own node and edges. They are not evidence: a PR edge only ever points at a
 * component holding one of the PR's changed files or a finding location, is dashed, labelled in
 * words ("changed in #N") and drawn in the overlay colour, never the evidence grey.
 */
export const PR_NODE_WIDTH = 200;
export const PR_NODE_HEIGHT = 64;
export type PrNodeData = { number: number; title: string; files: number; findings: number };
export type PrNode = Node<PrNodeData, "pr">;
export type PrEdgeData = { label: string; findings: number; dimmed?: boolean };
export type PrEdge = Edge<PrEdgeData, "pr">;

function PrNodeView({ data }: NodeProps<PrNode>) {
  return (
    <div data-testid="pr-node" className="pr-node flex h-16 w-[200px] items-center gap-3 rounded-2xl border border-dashed border-accent/70 bg-bg/90 px-4" title={data.title}>
      <GitPullRequest className="size-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-accent">PR #{data.number}</div>
        <div className="truncate text-xs text-muted">{data.files} file{data.files === 1 ? "" : "s"} · {data.findings} finding{data.findings === 1 ? "" : "s"}</div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
export const PrNodeComponent = memo(PrNodeView);

function PrEdgeView({ id, source, target, data }: EdgeProps<PrEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;
  const sx = s.internals.positionAbsolute.x + (s.measured?.width ?? PR_NODE_WIDTH);
  const sy = s.internals.positionAbsolute.y + (s.measured?.height ?? PR_NODE_HEIGHT) / 2;
  const tx = t.internals.positionAbsolute.x;
  const ty = t.internals.positionAbsolute.y + Math.min(t.measured?.height ?? NODE_HEIGHT, NODE_HEIGHT) / 2;
  const reach = Math.max(60, Math.abs(tx - sx) / 2.4);
  const path = `M ${sx},${sy} C ${sx + reach},${sy} ${tx - reach},${ty} ${tx},${ty}`;
  // the label sits near the component end, where the edge is unambiguous
  const k = 0.78, u = 1 - k;
  const lx = u ** 3 * sx + 3 * u ** 2 * k * (sx + reach) + 3 * u * k ** 2 * (tx - reach) + k ** 3 * tx;
  const ly = u ** 3 * sy + 3 * u ** 2 * k * sy + 3 * u * k ** 2 * ty + k ** 3 * ty;
  return (
    <>
      <BaseEdge id={id} path={path} className="pr-edge" style={{ stroke: "var(--accent)", strokeWidth: 1.5, strokeDasharray: "6 6", opacity: data?.dimmed ? 0.25 : 0.85 }} />
      <EdgeLabelRenderer>
        <span data-testid="pr-edge-label" className="nodrag nopan pointer-events-none absolute rounded-md border border-accent/50 bg-bg px-1.5 py-px font-mono text-xs text-accent" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, maxWidth: NODE_WIDTH }}>
          {data?.label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
export const PrEdgeComponent = memo(PrEdgeView);
