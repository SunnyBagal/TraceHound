"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TriangleAlert } from "lucide-react";
import { memo } from "react";
import { NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { KIND_META } from "@/lib/kinds";
import { NameSourceBadge } from "./NameSourceBadge";

function ComponentNodeView({ data, selected }: NodeProps<ComponentNodeType>) {
  const { component, warnings } = data;
  const { icon: Icon, label } = KIND_META[component.kind];
  return (
    <div
      data-testid="component-node"
      data-component-id={component.id}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={[
        "group flex flex-col rounded-xl border bg-card px-3.5 py-3 transition-[opacity,box-shadow,border-color,background-color] duration-200",
        selected ? "border-accent shadow-[0_0_0_1px_var(--accent),0_0_28px_-6px_rgba(245,165,36,0.45)]" : "border-line hover:border-line-strong hover:bg-card-hover hover:shadow-[0_0_24px_-8px_rgba(245,165,36,0.35)]",
        data.highlighted ? "pulse-ring" : "",
        data.dimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted group-hover:text-accent">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold leading-tight text-text" title={component.name}>
            {component.name}
          </div>
          <div className="truncate text-[10.5px] text-faint">
            <span className="uppercase tracking-wider">{label}</span> · {component.counts.files} files
            {component.counts.routes > 0 && <> · {component.counts.routes} routes</>}
          </div>
        </div>
        {warnings.length > 0 && (
          <span className="text-warn" title={warnings.map((w) => w.message).join("\n")} aria-label={`${warnings.length} warning(s)`}>
            <TriangleAlert className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-muted" title={component.summary ?? component.subtitle}>
        {component.summary ?? component.subtitle}
      </p>
      <div className="mt-auto flex min-w-0 justify-end pt-1.5">
        <NameSourceBadge naming={component.naming} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeView);
