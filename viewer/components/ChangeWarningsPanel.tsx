"use client";

import { ChevronRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { evidenceLink, WARNING_TITLE, type ChangeModel, type ChangeWarning } from "@/lib/changes";
import { ComponentName, EvidenceRef } from "./ChangeParts";

/** Every rule a change set checks, verbatim from the CLI (packages/analyzer/src/changes/changeset.ts RULE_*). */
const RULES: { kind: ChangeWarning["kind"]; rule: string }[] = [
  { kind: "queue-orphaned-by-diff", rule: "A queue that had both a producer and a consumer at base has only one side at head." },
  { kind: "queue-payload-type-changed", rule: "A type that changed (shape or signature) or was removed is used by a queue producer's payload or a consumer's handler (resolved through symbols)." },
  { kind: "cross-component-signature-change", rule: "A declaration whose signature or annotated return type changed has callers (at head) in other components." },
  { kind: "removed-declaration-still-referenced", rule: "A declaration removed by the diff is still referenced at head (an import of it, an unresolved use of its name, or a member access on its class)." },
];

export function WarningCard({ model, warning, active, onToggle, onOpen }: { model: ChangeModel; warning: ChangeWarning; active: boolean; onToggle?: (id: string) => void; onOpen?: (id: string) => void }) {
  const components = model.warningComponents.get(warning.id) ?? [];
  return (
    <li data-testid="change-warning" data-kind={warning.kind} data-active={active || undefined} className={`rounded-xl border p-3 ${active ? "border-warn bg-card" : "border-warn/40 bg-card/50"}`}>
      <button
        type="button"
        onClick={() => onToggle?.(warning.id)}
        aria-pressed={onToggle ? active : undefined}
        disabled={!onToggle}
        className="flex w-full items-start gap-2 text-left disabled:cursor-default"
        title={onToggle ? (active ? "Stop highlighting these components" : "Highlight the components involved") : undefined}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-text">{WARNING_TITLE[warning.kind]}</span>
          <span className="block font-mono text-[11px] text-faint">{warning.kind}</span>
        </span>
      </button>
      <p className="mt-2 text-[13px] leading-snug text-muted">
        <span className="font-medium text-text">Rule: </span>
        {warning.rule}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-text" data-testid="warning-message">
        {warning.message}
      </p>
      {warning.alsoCaughtByTypecheck && <p className="mt-1 text-[12px] text-faint">The typechecker also reports this.</p>}
      <h4 className="mb-1 mt-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Evidence</h4>
      <ul className="space-y-1.5" data-testid="warning-evidence">
        {warning.evidence.map((e, i) => (
          <li key={`${e.side}:${e.file}:${e.line}:${i}`} className="text-[12.5px]">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className={`shrink-0 rounded px-1 font-mono text-[10.5px] font-semibold ${e.side === "base" ? "bg-diff-removed/15 text-diff-removed" : "bg-diff-added/15 text-diff-added"}`}>{e.side}</span>
              <EvidenceRef link={evidenceLink(model.link, e.side, e.file, e.line)} />
            </div>
            <div className="ml-10 text-muted">{e.detail}</div>
          </li>
        ))}
      </ul>
      {components.length > 0 && (
        <p className="mt-2.5 flex flex-wrap gap-x-1.5 text-[12.5px] text-muted">
          <span className="text-faint">Involves</span>
          {components.map((id, i) => (
            <span key={id}>
              <ComponentName model={model} id={id} onOpen={onOpen} />
              {i < components.length - 1 && ","}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

export function NoWarnings() {
  return (
    <div className="text-[13px] leading-snug text-muted" data-testid="no-warnings">
      <p className="flex items-center gap-1.5 text-text">
        <ShieldCheck className="size-4 text-diff-added" aria-hidden /> None of the four rules fired.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {RULES.map((r) => (
          <li key={r.kind}>{r.rule}</li>
        ))}
      </ul>
      <p className="mt-2 text-faint">Anything these rules don&apos;t cover isn&apos;t checked.</p>
    </div>
  );
}

/** Desktop: the left panel of the change view. "What could break" first: open by default when a rule fired. */
export function ChangeWarningsPanel({ model, activeId, onToggle, onOpen }: { model: ChangeModel; activeId: string | null; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  const count = model.warnings.length;
  const [open, setOpen] = useState(count > 0);
  return (
    <aside
      aria-label="Change warnings"
      data-testid="change-warnings"
      data-open={open || undefined}
      className={`relative z-10 flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200 ${open ? "w-[380px]" : "w-11"}`}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex items-center gap-2 border-b border-line px-3 py-2.5 text-left hover:bg-card ${open ? "" : "h-full flex-col border-b-0 pt-3"}`} title={open ? "Collapse" : "What could break"}>
        <TriangleAlert className={`size-4 shrink-0 ${count ? "text-warn" : "text-faint"}`} aria-hidden />
        {open ? (
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-faint">What could break</span>
            <span className="block text-[14px] font-medium text-text">
              {count ? `${count} warning${count === 1 ? "" : "s"}` : "No warnings"}
            </span>
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-text [writing-mode:vertical-rl]">{count ? `${count} warning${count === 1 ? "" : "s"}` : "No warnings"}</span>
        )}
        {open && <ChevronRight className="size-4 rotate-180 text-faint" aria-hidden />}
      </button>
      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {count ? (
            <>
              <p className="mb-2.5 text-[12px] text-faint">Click a warning to highlight the components it involves.</p>
              <ul className="space-y-2.5">
                {model.warnings.map((w) => (
                  <WarningCard key={w.id} model={model} warning={w} active={activeId === w.id} onToggle={onToggle} onOpen={onOpen} />
                ))}
              </ul>
            </>
          ) : (
            <NoWarnings />
          )}
        </div>
      )}
    </aside>
  );
}
