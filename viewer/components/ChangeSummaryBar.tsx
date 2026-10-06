"use client";

import { Cpu, GitCompareArrows, Info, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { changeSummary, type ChangeModel } from "@/lib/changes";
import { DIFF_EDGE } from "./EvidenceEdge";

function Stat({ children, title, testId }: { children: ReactNode; title: string; testId: string }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap" title={title} data-testid={testId}>
      {children}
    </span>
  );
}

const short = (ref: string) => (/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref);

/** The facts a reviewer should read before trusting the view: how it was computed, and its limits. */
function Limits({ model, onClose }: { model: ChangeModel; onClose: () => void }) {
  const { set, entry } = model;
  const unmapped = set.files.filter((f) => !f.componentId);
  return (
    <div
      role="dialog"
      aria-label="Limits of this change set"
      data-testid="limits"
      className="absolute left-2 right-2 top-full z-40 mt-1 max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-panel p-4 shadow-lg sm:left-auto sm:w-[560px]"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold uppercase tracking-wider text-faint">How this was computed</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:bg-card hover:text-text">
          <X className="size-4" />
        </button>
      </div>
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-snug text-muted">
        <li>
          Computed without AI by <span className="font-mono text-text">tracehound changes</span> (analyzer {set.analyzerVersion}): ts-morph and git over both trees, no model.
        </li>
        {model.graphSha ? (
          <li>
            Components and their edges are drawn from the published snapshot at <span className="font-mono">{short(model.graphSha)}</span>
            {model.graphSha !== set.base.sha && <> (the change set&apos;s base is <span className="font-mono">{short(set.base.sha)}</span>)</>}. Component ids are the same at both commits; the counts come from the change set.
          </li>
        ) : (
          <li>This repo has no published snapshot: the canvas shows only the components the change set names.</li>
        )}
        {entry.kind === "demo" && <li>A demo diff: head is a local commit made from <span className="font-mono">changesets/{entry.patch}</span>, so head-side lines have no GitHub permalink.</li>}
        {entry.kind === "run" && <li>A repair run: head is the run&apos;s patch applied to its base; line numbers refer to the patch.</li>}
        {unmapped.length > 0 && (
          <li>
            {unmapped.length} changed file{unmapped.length === 1 ? "" : "s"} belong to no component (ignored by the repo&apos;s config, or not TypeScript):{" "}
            <span className="break-all font-mono text-[12px]">{unmapped.map((f) => f.path).join(", ")}</span>
          </li>
        )}
        {set.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {entry.regenerate && (
        <>
          <h3 className="mb-1 mt-3 text-[13px] font-semibold uppercase tracking-wider text-faint">Regenerate</h3>
          <pre className="whitespace-pre-wrap break-all rounded-lg border border-line bg-bg p-2 font-mono text-[11.5px] text-muted">{entry.regenerate}</pre>
        </>
      )}
    </div>
  );
}

export function ChangeSummaryBar({ model }: { model: ChangeModel }) {
  const s = changeSummary(model.set);
  const decls = s.declarations.added + s.declarations.removed + s.declarations.modified;
  const [limits, setLimits] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { set, entry } = model;
  const head = "run" in set.head ? "patch" : short(set.head.sha);

  useEffect(() => {
    if (!limits) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setLimits(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setLimits(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [limits]);

  return (
    <div ref={ref} className="relative shrink-0 border-b border-line bg-page" data-testid="change-summary">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[13px] text-muted md:px-4">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-text">
          <GitCompareArrows className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="truncate font-medium">{entry.title}</span>
          <span className="shrink-0 font-mono text-[12px] text-faint">
            {short(set.base.sha)}..{head}
          </span>
        </span>
        <Stat title="Components with a changed declaration, a changed edge, or a warning" testId="stat-components">
          <span className="font-semibold text-text">{s.components}</span> component{s.components === 1 ? "" : "s"} touched
        </Stat>
        <Stat title={`Declarations: ${s.declarations.added} added, ${s.declarations.removed} removed, ${s.declarations.modified} modified; ${s.declarations.formatting} formatting only (not counted as modified)`} testId="stat-declarations">
          <span className="font-semibold text-text">{decls}</span> declaration{decls === 1 ? "" : "s"}
          <span className="font-mono text-[12px]">
            (<span className="text-diff-added">+{s.declarations.added}</span> <span className="text-diff-removed">−{s.declarations.removed}</span>{" "}
            <span className="text-diff-modified">~{s.declarations.modified}</span>)
          </span>
          {s.declarations.formatting > 0 && <span className="text-faint">+ {s.declarations.formatting} formatting only</span>}
        </Stat>
        <Stat title="produces/consumes edges (they cross a broker, i.e. a process boundary) added or removed" testId="stat-cross-process">
          <span className="font-semibold text-text">{s.crossProcessEdges}</span> cross-process edge{s.crossProcessEdges === 1 ? "" : "s"} changed
        </Stat>
        <Stat title="Rules that fired" testId="stat-warnings">
          <span className={`font-semibold ${s.warnings ? "text-warn" : "text-text"}`}>{s.warnings}</span> warning{s.warnings === 1 ? "" : "s"}
        </Stat>
        <span className="ml-auto inline-flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] text-muted"
            title="Change sets come from ts-morph and git only. No model is involved; component names keep their own labels."
            data-testid="no-ai"
          >
            <Cpu className="size-3.5" aria-hidden /> Computed without AI
          </span>
          <button type="button" onClick={() => setLimits((o) => !o)} aria-expanded={limits} className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline" data-testid="limits-toggle">
            <Info className="size-3.5" aria-hidden /> Limits
          </button>
        </span>
      </div>
      <div className="hidden items-center gap-4 border-t border-line/60 px-4 py-1 text-[11.5px] text-faint lg:flex" aria-label="Change legend">
        {(Object.keys(DIFF_EDGE) as (keyof typeof DIFF_EDGE)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5" title={DIFF_EDGE[k].meaning}>
            <svg width="24" height="6" aria-hidden>
              <line x1="1" y1="3" x2="23" y2="3" stroke={DIFF_EDGE[k].stroke} strokeWidth="2" strokeDasharray={DIFF_EDGE[k].dash} strokeLinecap={k === "regrouped" ? "round" : "butt"} />
            </svg>
            {k} component edge
          </span>
        ))}
        <span>dimmed: unchanged</span>
        <span>
          <span className="text-diff-added">+</span> added · <span className="text-diff-removed">−</span> removed · <span className="text-diff-modified">~</span> modified declarations
        </span>
      </div>
      {limits && <Limits model={model} onClose={() => setLimits(false)} />}
    </div>
  );
}
