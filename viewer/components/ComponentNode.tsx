"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TriangleAlert } from "lucide-react";
import { rollupBadges, type ComponentDiff } from "@/lib/changes";
import type { ImpactRole } from "@/lib/impact";
import { memo } from "react";
import { NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { KIND_META } from "@/lib/kinds";
import { ComponentIcon } from "./ComponentIcon";
import { NameSourceBadge } from "./NameSourceBadge";

function ComponentNodeView({ data, selected }: NodeProps<ComponentNodeType>) {
  const { component, warnings } = data;
  const { label } = KIND_META[component.kind];
  return (
    <div
      data-testid="component-node"
      data-component-id={component.id}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      data-impact={data.impact?.role ?? (data.impact === null ? "none" : undefined)}
      data-panel-hover={data.panelHover || undefined}
      data-change={data.change ? "touched" : data.change === null ? "untouched" : undefined}
      className={[
        "group relative flex flex-col rounded-xl border bg-card px-3.5 py-3 transition-[opacity,box-shadow,border-color,background-color] duration-200",
        data.impact?.role === "changed"
          ? "border-2 border-solid border-impact-changed"
          : data.impact?.role === "affected"
            ? "border-2 border-dashed border-impact-affected"
            : data.change?.warnings && !selected
              ? "border-warn/70 hover:bg-card-hover"
              : selected
              ? "border-accent shadow-[0_0_0_1px_var(--accent),0_0_28px_-6px_var(--accent-glow)]"
              : "border-line hover:border-line-strong hover:bg-card-hover hover:shadow-[0_0_24px_-8px_var(--accent-glow)]",
        data.highlighted ? "pulse-ring" : "",
        // inspector-row hover: an offset outline in its own colour, never the selection's accent
        data.panelHover ? "outline-2 outline-offset-4 outline-highlight" : "",
        data.dimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} />
      {data.impact && <ImpactChip role={data.impact} />}
      {data.change && <ChangeChip diff={data.change} />}
      <div className="flex items-center gap-2.5">
        <ComponentIcon kind={component.kind} tech={data.tech} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold leading-tight text-text" title={component.name}>
            {component.name}
          </div>
          <div className="truncate text-[10.5px] text-faint">
            <span className="uppercase tracking-wider">{data.changeSetOnly ? "change set only" : label}</span> · {component.counts.files} files
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

/** Change view: declaration counts and changed types on the node's top edge; signs and words, not colour alone. */
function ChangeChip({ diff }: { diff: ComponentDiff }) {
  const badges = rollupBadges(diff);
  const tone = { added: "text-diff-added", removed: "text-diff-removed", modified: "text-diff-modified", muted: "text-faint", warn: "text-warn" } as const;
  return (
    <span
      data-testid="change-badges"
      className={`absolute -top-2.5 left-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border bg-bg px-1.5 py-px font-mono text-[10px] font-semibold leading-tight ${diff.warnings ? "border-warn/70" : "border-line-strong"}`}
    >
      {badges.filter((b) => b.key !== "formatting" && b.key !== "warnings").length === 0 && <span className="text-muted">{diff.warnings ? "INVOLVED" : "EDGES CHANGED"}</span>}
      {badges.map((b) => (
        <span key={b.key} title={b.title} data-badge={b.key} className={tone[b.tone]}>
          {b.text}
        </span>
      ))}
    </span>
  );
}

/** Text label for the impact role: never colour alone (solid vs dashed border + words). */
function ImpactChip({ role }: { role: ImpactRole }) {
  const text = role.role === "changed" ? "CHANGED" : `AFFECTED · depth ${role.depth}${role.dynamic ? " · ⚠ dynamic" : ""}`;
  return (
    <span
      data-testid="impact-chip"
      className={[
        "absolute -top-2.5 left-3 rounded-md border px-1.5 py-px font-mono text-[9.5px] font-semibold tracking-wide",
        role.role === "changed" ? "border-impact-changed bg-impact-changed text-bg" : "border-dashed border-impact-affected bg-bg text-impact-affected",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

export const ComponentNode = memo(ComponentNodeView);
