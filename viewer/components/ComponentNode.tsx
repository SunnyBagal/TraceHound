"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { rollupBadges, type ComponentDiff } from "@/lib/changes";
import type { ImpactRole } from "@/lib/impact";
import { memo, type CSSProperties } from "react";
import { NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { KIND_META } from "@/lib/kinds";
import { ComponentIcon } from "./ComponentIcon";
import { ModelMark } from "./ModelMark";
import { METHOD_COLORS } from "@/lib/contents";

function ComponentNodeView({ data, selected }: NodeProps<ComponentNodeType>) {
  const { component, warnings } = data;
  const { label, color } = KIND_META[component.kind];
  const tint = selected ? "var(--accent)" : data.panelHover || data.highlighted ? "var(--highlight)" : data.impact?.role === "changed" ? "var(--impact-changed)" : data.impact?.role === "affected" ? "var(--impact-affected)" : color;
  return (
    <div
      data-testid="component-node"
      data-component-id={component.id}
      style={{ width: NODE_WIDTH, height: data.height ?? NODE_HEIGHT, "--kind": tint, borderLeftWidth: 3, borderLeftColor: tint } as CSSProperties}
      data-kind={component.kind}
      data-impact={data.impact?.role ?? (data.impact === null ? "none" : undefined)}
      data-panel-hover={data.panelHover || undefined}
      data-change={data.change ? "touched" : data.change === null ? "untouched" : undefined}
      className={[
        "group relative flex flex-col justify-between rounded-xl border bg-card p-[22px] transition-[opacity,box-shadow,border-color,background-color] duration-200",
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
      <div className="flex h-[22px] shrink-0 min-w-0 items-center gap-[11px]">
        <ComponentIcon kind={component.kind} tech={data.tech} size="node" tint={tint} />
        <div className="min-w-0 truncate text-[15px] font-semibold text-[var(--kind)]" title={component.name}>
          {component.name}
        </div>
        {component.naming.source === "llm" && <ModelMark />}
        <button type="button" className="nodrag nopan ml-auto shrink-0 rounded p-1 text-muted hover:bg-panel" aria-label={`${data.expanded ? "Collapse" : "Expand"} ${component.name}`} aria-expanded={Boolean(data.expanded)} onClick={(event) => { event.stopPropagation(); data.onToggle?.(); }}>
          {data.expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {warnings.length > 0 && (
          <span className="ml-auto shrink-0 pl-1 text-warn" title={warnings.map((w) => w.message).join("\n")} aria-label={`${warnings.length} warning(s)`}>
            <TriangleAlert className="size-4" />
          </span>
        )}
      </div>
      <p data-testid="node-summary" title={component.summary ?? component.subtitle} className="mt-2 truncate text-sm leading-relaxed text-muted">{component.summary ?? component.subtitle}</p>
      <div className="truncate text-sm text-faint">
        <span className="uppercase tracking-wider">{data.changeSetOnly ? "change set only" : label}</span> · {component.counts.files} files
        {component.counts.routes > 0 && <> · {component.counts.routes} routes</>}
      </div>
      {data.expanded && <div className="mt-3 border-t border-line pt-2 text-sm leading-relaxed text-text" data-testid="node-contents">
        {(data.contents ?? []).slice(0, 8).map((item, index) => <div key={index} className="flex h-8 min-w-0 items-center gap-2">
          {item.method && <span className="shrink-0 rounded bg-bg px-1.5 font-mono font-medium" style={{ color: METHOD_COLORS[item.method] }}>{item.method}</span>}
          {item.detail && <span className="shrink-0 text-muted">{item.detail}</span>}
          <span className="truncate" title={item.label}>{item.label}</span>
        </div>)}
        {!data.contents?.length && <p className="text-muted">No contents recorded.</p>}
        {(data.contents?.length ?? 0) > 8 && <button type="button" className="nodrag nopan mt-1 text-accent hover:underline" onClick={(event) => { event.stopPropagation(); data.onMore?.(); }}>+{data.contents!.length - 8} more</button>}
      </div>}
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
