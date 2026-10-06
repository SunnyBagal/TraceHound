"use client";

import { ArrowRight, Atom, Box, Braces, ChevronRight, ExternalLink, FileCode, FileDiff, Hash, Route, SquareFunction, TriangleAlert, Type, Variable, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  componentEdgeChanges,
  componentFiles,
  DECL_KIND_LABEL,
  declarationLink,
  declStatus,
  endpointLabel,
  evidenceLink,
  reasons,
  STATUS_LABEL,
  WARNING_TITLE,
  type ChangeModel,
  type DeclarationChange,
  type DeclStatus,
  type EvidenceLink,
  type FileGroup,
} from "@/lib/changes";
import { noHighlight, type BindHighlight } from "@/lib/highlight";
import type { DeclarationKind } from "@tracehound/analyzer/schema";
import { ModelMark } from "./ModelMark";

export const DECL_ICON: Record<DeclarationKind, LucideIcon> = {
  function: SquareFunction,
  class: Box,
  method: Braces,
  property: Hash,
  "react-component": Atom,
  variable: Variable,
  "route-handler": Route,
  module: FileCode,
  type: Type,
};

const PILL: Record<DeclStatus, string> = {
  added: "border-diff-added/50 text-diff-added",
  removed: "border-diff-removed/50 text-diff-removed",
  modified: "border-diff-modified/50 text-diff-modified",
  formatting: "border-line text-faint",
  unchanged: "border-line text-faint",
};

export function StatusPill({ status }: { status: DeclStatus | "regrouped" }) {
  const cls = status === "regrouped" ? "border-line text-diff-regrouped" : PILL[status];
  return (
    <span data-testid="status-pill" data-status={status} className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[11.5px] font-medium leading-tight ${cls}`}>
      {status === "regrouped" ? "regrouped" : STATUS_LABEL[status]}
    </span>
  );
}

export function LineCounts({ added, removed }: { added: number; removed: number }) {
  if (!added && !removed) return null;
  return (
    <span className="shrink-0 font-mono text-[12px]" title={`${added} line${added === 1 ? "" : "s"} added, ${removed} removed`} data-testid="line-counts">
      <span className="text-diff-added">+{added}</span> <span className="text-diff-removed">−{removed}</span>
    </span>
  );
}

export function EvidenceRef({ link, className = "" }: { link: EvidenceLink; className?: string }) {
  const body = link.href ? (
    <a href={link.href} target="_blank" rel="noreferrer" className="group inline-flex items-baseline gap-1 break-all font-mono text-[12.5px] text-muted hover:text-accent">
      {link.text}
      <ExternalLink className="size-3 shrink-0 self-center text-faint group-hover:text-accent" aria-label="GitHub permalink" />
    </a>
  ) : (
    <span className="break-all font-mono text-[12.5px] text-muted" title={link.note}>
      {link.text}
    </span>
  );
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${className}`}>
      {body}
      {link.note && !link.href && <span className="text-[11.5px] text-faint">({link.note})</span>}
    </span>
  );
}

/** A component's name as the snapshot has it; model-written names keep their label. */
export function ComponentName({ model, id, onOpen }: { model: ChangeModel; id: string; onOpen?: (id: string) => void }) {
  const c = model.display.components.find((x) => x.id === id);
  const text = (
    <>
      {c?.name ?? id}
      {c?.naming.source === "llm" && <ModelMark className="ml-1 align-[-1px]" />}
    </>
  );
  if (!onOpen) return <span className="font-medium text-text">{text}</span>;
  return (
    <button type="button" onClick={() => onOpen(id)} className="text-left font-medium text-text hover:text-accent">
      {text}
    </button>
  );
}

function DeclarationRow({ model, d }: { model: ChangeModel; d: DeclarationChange }) {
  const Icon = DECL_ICON[d.kind];
  const status = declStatus(d);
  const why = status === "modified" ? reasons(d) : [];
  const link = declarationLink(model.link, d);
  const warned = model.warnedDeclarations.has(d.id);
  const moved = d.baseComponentId ? ` (was in ${model.display.components.find((c) => c.id === d.baseComponentId)?.name ?? d.baseComponentId})` : "";
  return (
    <li data-testid="declaration" data-declaration-id={d.id} data-status={status} className="rounded-lg px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-faint" aria-label={DECL_KIND_LABEL[d.kind]} role="img" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text" title={`${DECL_KIND_LABEL[d.kind]} ${d.id}${moved}`}>
          {d.name}
        </span>
        {warned && <TriangleAlert className="size-3.5 shrink-0 text-warn" aria-label="a change warning points here" />}
        <LineCounts added={d.lines.added} removed={d.lines.removed} />
        <StatusPill status={status} />
      </div>
      <div className="ml-6 mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-muted">
        <span className="text-faint">{DECL_KIND_LABEL[d.kind]}{d.exported ? ", exported" : ""}</span>
        {why.length > 0 && <span data-testid="reasons">{why.join(" · ")}</span>}
        {link && <EvidenceRef link={link} />}
      </div>
    </li>
  );
}

function Toggle({ open, onClick, children, testId }: { open: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} data-testid={testId} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12.5px] text-muted hover:bg-card hover:text-text">
      <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function FileBlock({ model, group, defaultOpen }: { model: ChangeModel; group: FileGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const f = group.change;
  const side = f?.status === "removed" ? "base" : "head";
  const link = evidenceLink(model.link, side, group.file, 1);
  const href = link.href?.replace(/#L1$/, "");
  return (
    <li data-testid="change-file" data-file={group.file} className="rounded-lg border border-line bg-card/40">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left hover:bg-card">
        <ChevronRight className={`size-3.5 shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <FileDiff className="size-4 shrink-0 text-faint" aria-hidden />
        <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-text">{group.file}</span>
        {f && <LineCounts added={f.linesAdded} removed={f.linesRemoved} />}
        {f && f.status !== "modified" && <StatusPill status={f.status} />}
      </button>
      {open && (
        <div className="border-t border-line px-1 py-1.5">
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[12px] text-faint hover:text-accent">
              file at {side} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          {group.changed.length > 0 ? (
            <ul className="space-y-0.5">
              {group.changed.map((d) => (
                <DeclarationRow key={d.id} model={model} d={d} />
              ))}
            </ul>
          ) : (
            group.formatting.length === 0 && <p className="px-2 py-1 text-[12.5px] text-faint">No declaration changed in this file.</p>
          )}
          {group.formatting.length > 0 && (
            <div data-testid="formatting-group">
              <Toggle open={showFormatting} onClick={() => setShowFormatting((o) => !o)} testId="formatting-toggle">
                {group.formatting.length} formatting only <span className="text-faint">(whitespace or comments; not counted as modified)</span>
              </Toggle>
              {showFormatting && (
                <ul className="space-y-0.5">
                  {group.formatting.map((d) => (
                    <DeclarationRow key={d.id} model={model} d={d} />
                  ))}
                </ul>
              )}
            </div>
          )}
          {group.unchanged.length > 0 && (
            <div>
              <Toggle open={showUnchanged} onClick={() => setShowUnchanged((o) => !o)} testId="unchanged-toggle">
                {showUnchanged ? "Hide" : "Show"} {group.unchanged.length} unchanged <span className="text-faint">(a changed edge or a warning points at them)</span>
              </Toggle>
              {showUnchanged && (
                <ul className="space-y-0.5" data-testid="unchanged-list">
                  {group.unchanged.map((d) => (
                    <DeclarationRow key={d.id} model={model} d={d} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function EdgeChanges({ model, componentId, onOpen, bind }: { model: ChangeModel; componentId: string; onOpen?: (id: string) => void; bind: BindHighlight }) {
  const edges = componentEdgeChanges(model, componentId);
  if (!edges.length) return <p className="text-[13px] text-faint">No call, route or queue edge was added or removed here.</p>;
  return (
    <ul className="-mx-2 space-y-1" data-testid="edge-changes">
      {edges.map((e) => {
        const from = model.componentOf(e.from);
        const to = model.componentOf(e.to);
        const other = from === componentId ? to : from;
        const snapshotEdge = from && to && from !== to ? model.display.edges.find((x) => x.source === from && x.target === to)?.id : undefined;
        const ev = e.evidence[0]!;
        return (
          <li
            key={e.id}
            data-testid="edge-change"
            data-status={e.status}
            className="rounded-lg px-2 py-1.5 data-[highlighted=true]:bg-card data-[highlighted=true]:ring-1 data-[highlighted=true]:ring-highlight/70"
            {...bind({ key: `edge-change:${e.id}`, nodeIds: other && other !== componentId ? [other] : [], edgeIds: snapshotEdge ? [snapshotEdge] : [] })}
            tabIndex={0}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[12.5px] text-text">
              <StatusPill status={e.status === "added" ? "added" : "removed"} />
              <span className="text-faint">{e.kind}</span>
              <span className="break-all">{endpointLabel(e.from)}</span>
              <ArrowRight className="size-3.5 shrink-0 text-faint" aria-label="to" />
              <span className="break-all">{endpointLabel(e.to)}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-muted">
              {other && other !== componentId ? (
                <span>
                  {from === componentId ? "to" : "from"} <ComponentName model={model} id={other} onOpen={onOpen} />
                </span>
              ) : (
                <span className="text-faint">inside this component</span>
              )}
              {e.crossProcess && <span className="text-faint">crosses a process boundary</span>}
              <span className="text-faint">{ev.side}:</span>
              <EvidenceRef link={evidenceLink(model.link, ev.side, ev.file, ev.line)} />
              {e.evidence.length > 1 && <span className="text-faint">+{e.evidence.length - 1} more</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The drill-down for one component: its warnings, files → declarations, and changed declaration edges. */
export function ComponentChanges({ model, componentId, onOpen, bind = noHighlight }: { model: ChangeModel; componentId: string; onOpen?: (id: string) => void; bind?: BindHighlight }) {
  const groups = componentFiles(model.set, componentId, model.warnedDeclarations);
  const diff = model.diffs.get(componentId);
  const warnings = model.warnings.filter((w) => model.warningComponents.get(w.id)?.includes(componentId));
  return (
    <div className="space-y-4" data-testid="component-changes">
      {!diff ? (
        <p className="text-[13.5px] text-muted">This change doesn&apos;t touch this component.</p>
      ) : (
        <p className="text-[13.5px] text-muted" data-testid="rollup-words">
          {[
            diff.added && `${diff.added} added`,
            diff.removed && `${diff.removed} removed`,
            diff.modified && `${diff.modified} modified`,
            diff.formatting && `${diff.formatting} formatting only`,
            diff.typesChanged && `${diff.typesChanged} type${diff.typesChanged === 1 ? "" : "s"} changed`,
          ]
            .filter(Boolean)
            .join(" · ") || "No declaration changed here; an edge or a warning involves it."}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w.id} className="flex gap-2 text-[13px] leading-snug text-warn">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {WARNING_TITLE[w.kind]}
            </li>
          ))}
        </ul>
      )}
      {groups.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
            Files <span className="font-normal">{groups.length}</span>
          </h4>
          <ul className="space-y-1.5">
            {groups.map((g) => (
              <FileBlock key={g.file} model={model} group={g} defaultOpen={groups.length <= 3 || g.changed.some((d) => model.warnedDeclarations.has(d.id))} />
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">Edges added or removed</h4>
        <EdgeChanges model={model} componentId={componentId} onOpen={onOpen} bind={bind} />
      </div>
    </div>
  );
}
