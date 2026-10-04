"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { rollupBadges, type ComponentDiff } from "@/lib/changes";
import type { ImpactRole } from "@/lib/impact";
import { memo } from "react";
import { NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { KIND_META } from "@/lib/kinds";
import { modelWrittenLabel } from "@/lib/naming";
import { ComponentIcon } from "./ComponentIcon";

function ComponentNodeView({ data, selected }: NodeProps<ComponentNodeType>) {
  const { component, warnings } = data;
  const { label } = KIND_META[component.kind];
  const modelName = modelWrittenLabel(component.naming); // set only when naming.source is "llm"
  return (
    <div
      data-testid="component-node"
      data-component-id={component.id}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      data-impact={data.impact?.role ?? (data.impact === null ? "none" : undefined)}
      data-panel-hover={data.panelHover || undefined}
      data-change={data.change ? "touched" : data.change === null ? "untouched" : undefined}
      className={[
        "group relative flex flex-col justify-center rounded-xl border bg-card px-[22px] transition-[opacity,box-shadow,border-color,background-color] duration-200",
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
      {/* Railway's header: the icon on the padding line, centred on the title line; the title and
          kind line share one left edge. The card shows only these: description, routes, name
          source and any model-written prose are in the inspector. */}
      <div className="flex min-h-0 gap-[11px]">
        <div className="flex h-[22px] shrink-0 items-center">
          <ComponentIcon kind={component.kind} tech={data.tech} size="node" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[22px] items-center gap-1.5">
            <div className="min-w-0 truncate text-[13.5px] font-semibold text-text" title={component.name}>
              {component.name}
            </div>
            {modelName && (
              <span data-testid="model-name-mark" className="shrink-0 text-accent" title={`Name is ${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}; heuristic name: ${component.naming.heuristicName}`} aria-label={`Name is model-written; heuristic name: ${component.naming.heuristicName}`} role="img">
                <Sparkles className="size-3" aria-hidden />
              </span>
            )}
            {warnings.length > 0 && (
              <span className="ml-auto shrink-0 pl-1 text-warn" title={warnings.map((w) => w.message).join("\n")} aria-label={`${warnings.length} warning(s)`}>
                <TriangleAlert className="size-4" />
              </span>
            )}
          </div>
          <div className="truncate text-[10.5px] text-faint">
            <span className="uppercase tracking-wider">{data.changeSetOnly ? "change set only" : label}</span> · {component.counts.files} files
            {component.counts.routes > 0 && <> · {component.counts.routes} routes</>}
          </div>
        </div>
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
