"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import { rollupBadges, type ComponentDiff } from "@/lib/changes";
import type { ImpactRole } from "@/lib/impact";
import { memo, type CSSProperties } from "react";
import { NODE_HEIGHT, NODE_WIDTH, type ComponentNode as ComponentNodeType } from "@/lib/graph";
import { KIND_META } from "@/lib/kinds";
import { ComponentIcon } from "./ComponentIcon";
import { ModelMark } from "./ModelMark";
import { METHOD_COLORS } from "@/lib/contents";
import { findingTitle } from "@/lib/pulls";
import { MODEL_DISCLOSURE } from "@/lib/reviews";

/** The drop-down strip under every card. */
const STRIP = 32;

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
      data-pr={data.pr ? "touched" : data.pr === null ? "untouched" : undefined}
      className={[
        "th-node group relative flex flex-col rounded-md border bg-card transition-[opacity,box-shadow,border-color,background-color,filter,translate] duration-200",
        data.impact?.role === "changed"
          ? "border-2 border-solid border-impact-changed"
          : data.impact?.role === "affected"
            ? "border-2 border-dashed border-impact-affected"
            : data.pr && !selected
              ? "border-accent shadow-[0_0_0_1px_var(--accent),0_0_28px_-10px_var(--accent-glow)] hover:bg-card-hover"
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
      {data.pr && <PrChip pr={data.pr} />}
      {data.pr && data.pr.findings.length > 0 && <FindingsBadge count={data.pr.findings.length} name={component.name} onOpen={data.onFindings} />}
      {data.pr && data.pr.findings.length > 0 && <FindingCallout findings={data.pr.findings} onOpen={data.onFindings} />}
      {/* the card proper (Railway's): the logo in its own colours and the name on top, the kind at the bottom; the summary lives in the inspector */}
      <div className="flex min-h-0 flex-col justify-between px-[22px] pb-[18px] pt-[22px]" style={{ flexBasis: NODE_HEIGHT - STRIP - 2 }}>
      <div className="flex h-[22px] shrink-0 min-w-0 items-center gap-[11px]">
        <ComponentIcon kind={component.kind} tech={data.tech} size="node" tint={color} />
        <div className="min-w-0 truncate text-[16px] font-semibold text-text" title={component.name}>
          {component.name}
        </div>
        {component.naming.source === "llm" && <ModelMark />}
        {warnings.length > 0 && (
          <span className="ml-auto shrink-0 pl-1 text-warn" title={warnings.map((w) => w.message).join("\n")} aria-label={`${warnings.length} warning(s)`}>
            <TriangleAlert className="size-4" />
          </span>
        )}
      </div>
      <div className="truncate text-sm text-faint">
        <span className="uppercase tracking-wider">{data.changeSetOnly ? "change set only" : label}</span> · {component.counts.files} files
        {component.counts.routes > 0 && <> · {component.counts.routes} routes</>}
      </div>
      </div>
      {/* the drop-down: a plain strip under the card; expanded, the contents open above it */}
      {data.expanded && <div className="min-h-0 flex-1 overflow-hidden border-t border-line bg-white/[0.025] px-[22px] py-1.5 text-sm leading-relaxed text-text" data-testid="node-contents">
        {(data.contents ?? []).slice(0, 8).map((item, index) => <div key={index} className="flex h-8 min-w-0 items-center gap-2">
          {item.method && <span className="shrink-0 rounded bg-bg px-1.5 font-mono font-medium" style={{ color: METHOD_COLORS[item.method] }}>{item.method}</span>}
          {item.detail && <span className="shrink-0 text-muted">{item.detail}</span>}
          <span className="truncate" title={item.label}>{item.label}</span>
        </div>)}
        {!data.contents?.length && <p className="text-muted">No contents recorded.</p>}
        {(data.contents?.length ?? 0) > 8 && <button type="button" className="nodrag nopan h-6 text-accent hover:underline" onClick={(event) => { event.stopPropagation(); data.onMore?.(); }}>+{data.contents!.length - 8} more</button>}
      </div>}
      <button
        type="button"
        data-testid="node-toggle"
        className="nodrag nopan grid w-full shrink-0 place-items-center rounded-b-[5px] border-t border-line bg-white/[0.025] text-muted transition-colors hover:bg-white/[0.06] hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        style={{ height: STRIP }}
        aria-label={`${data.expanded ? "Collapse" : "Expand"} ${component.name}`}
        aria-expanded={Boolean(data.expanded)}
        onClick={(event) => { event.stopPropagation(); data.onToggle?.(); }}
      >
        {data.expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      </button>
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
      className={`absolute -top-2.5 left-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border bg-bg px-1.5 py-px font-mono text-sm font-semibold leading-tight ${diff.warnings ? "border-warn/70" : "border-line-strong"}`}
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

/** PR lane: which PR touched this component and how many of its files; same place and shape as the change chip. */
function PrChip({ pr }: { pr: NonNullable<ComponentNodeType["data"]["pr"]> }) {
  return (
    <span data-testid="pr-badge" className="absolute -top-2.5 left-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border border-accent/60 bg-bg px-1.5 py-px font-mono text-sm font-semibold leading-tight text-accent" title={pr.files.join("\n")}>
      #{pr.number}
      <span className="text-muted">{pr.files.length ? `${pr.files.length} file${pr.files.length === 1 ? "" : "s"} changed` : "finding only"}</span>
    </span>
  );
}

/** PR lane: TraceHound's findings in this component; opens them in the inspector. */
function FindingsBadge({ count, name, onOpen }: { count: number; name: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      data-testid="findings-badge"
      aria-label={`${count} finding${count === 1 ? "" : "s"} in ${name}`}
      onClick={(event) => { event.stopPropagation(); onOpen?.(); }}
      className="findings-badge nodrag nopan absolute -right-2.5 -top-3 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 font-mono text-sm font-bold text-ink shadow-[0_0_0_3px_var(--bg),0_0_18px_var(--accent-glow)] hover:brightness-110"
    >
      {count}
    </button>
  );
}

/** Pinned under the card: the first finding, effect-first, with its location and the disclosure. */
function FindingCallout({ findings, onOpen }: { findings: NonNullable<ComponentNodeType["data"]["pr"]>["findings"]; onOpen?: () => void }) {
  const first = findings[0]!;
  return (
    <button
      type="button"
      data-testid="finding-callout"
      onClick={(event) => { event.stopPropagation(); onOpen?.(); }}
      className="finding-callout nodrag nopan absolute left-0 top-[calc(100%+14px)] z-10 w-full rounded-md border border-accent/50 bg-panel/95 p-3 text-left shadow-[0_14px_36px_-14px_var(--scrim)] backdrop-blur hover:border-accent"
    >
      <span className="block text-sm font-medium leading-snug text-text">{findingTitle(first.body)}</span>
      <span className="mt-1.5 block truncate font-mono text-xs text-muted">{first.path}{first.line !== null ? `:${first.line}` : ""}</span>
      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-faint">
        <span>{MODEL_DISCLOSURE}</span>
        {findings.length > 1 && <span className="shrink-0 text-accent">+{findings.length - 1} more</span>}
      </span>
    </button>
  );
}

/** Text label for the impact role: never colour alone (solid vs dashed border + words). */
function ImpactChip({ role }: { role: ImpactRole }) {
  const text = role.role === "changed" ? "CHANGED" : `AFFECTED · depth ${role.depth}${role.dynamic ? " · ⚠ dynamic" : ""}`;
  return (
    <span
      data-testid="impact-chip"
      className={[
        "absolute -top-2.5 left-3 rounded-md border px-1.5 py-px font-mono text-sm font-semibold tracking-wide",
        role.role === "changed" ? "border-impact-changed bg-impact-changed text-bg" : "border-dashed border-impact-affected bg-bg text-impact-affected",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

export const ComponentNode = memo(ComponentNodeView);
