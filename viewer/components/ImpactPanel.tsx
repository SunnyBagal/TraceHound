"use client";

import { ChevronRight, ExternalLink, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { EDGE_STYLES } from "@/lib/graph";
import { githubSlug, permalink } from "@/lib/github";
import type { ImpactReport } from "@/lib/impact";
import type { Snapshot } from "@/lib/types";
import type { Selection } from "./GraphCanvas";
import { MODEL_NAME_DISCLOSURE, ModelMark } from "./ModelMark";

const STATUS: Record<ImpactReport["files"][number]["status"], string> = { added: "A", modified: "M", deleted: "D", renamed: "R", copied: "C", "type-changed": "T" };

function Heading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint first:mt-0">
      {children}
      {count !== undefined && <span className="ml-1.5 font-normal">{count}</span>}
    </h3>
  );
}

function Evidence({ snapshot, file, line }: { snapshot: Snapshot; file: string; line: number }) {
  const href = permalink(snapshot.repo, file, line);
  const text = `${file}:${line}`;
  if (!href) return <span className="break-all font-mono text-[11px] text-muted">{text}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 break-all font-mono text-[11px] text-muted hover:text-accent">
      {text}
      <ExternalLink className="size-3 shrink-0 text-faint group-hover:text-accent" aria-label="GitHub permalink at the base commit" />
    </a>
  );
}

/** ?impact=<name>: the report behind the canvas highlight — every affected component's chain, with evidence. */
export function ImpactPanel({ name, impact, snapshot, onSelect }: { name: string; impact: ImpactReport; snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const [open, setOpen] = useState(true);
  const slug = githubSlug(snapshot.repo);
  const componentName = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  const modelNamed = (id: string) => snapshot.components.find((c) => c.id === id)?.naming.source === "llm";
  const Name = ({ id }: { id: string }) => (
    <button type="button" onClick={() => onSelect({ type: "node", id })} className="text-left hover:text-accent">
      <span className="font-medium text-text">
        {componentName(id)}
        {modelNamed(id) && <ModelMark className="ml-1 align-[-1px]" />}
      </span>{" "}
      <span className="font-mono text-[11px] text-faint">{id}</span>
    </button>
  );

  return (
    <aside
      aria-label="Impact"
      data-testid="impact-panel"
      className="absolute left-3 top-3 z-10 flex max-h-[48dvh] w-[min(380px,calc(100vw-76px))] flex-col rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur md:static md:z-auto md:max-h-none md:w-[380px] md:shrink-0 md:rounded-none md:border-y-0 md:border-l-0 md:border-r md:shadow-none"
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-start gap-2 px-4 py-2.5 text-left md:cursor-default" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Impact</div>
          <div className="truncate font-mono text-[13px] text-text">{name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {impact.base.slice(0, 7)}..{impact.head.slice(0, 7)} · depth {impact.depth} · {impact.affected.length} affected
          </div>
        </div>
        <ChevronRight className={`mt-1 size-4 text-faint transition-transform md:hidden ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-3 text-[12px]">
          <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]" aria-label="Impact legend">
            <span className="rounded-md border-2 border-solid border-impact-changed px-1.5 font-mono font-semibold text-impact-changed">CHANGED</span>
            <span className="rounded-md border-2 border-dashed border-impact-affected px-1.5 font-mono font-semibold text-impact-affected">AFFECTED · depth n</span>
            <span className="rounded bg-warn px-1 font-mono font-semibold text-bg">⚠ DYNAMIC</span>
          </div>

          <Heading count={impact.files.length}>Changed files</Heading>
          <ul className="space-y-1">
            {impact.files.map((f) => (
              <li key={`${f.status}:${f.path}`} className="flex gap-2">
                <span className="w-3 shrink-0 font-mono text-faint">{STATUS[f.status]}</span>
                <span className="min-w-0">
                  {slug ? (
                    <a href={`https://github.com/${slug}/blob/${f.status === "deleted" ? impact.base : impact.head}/${f.path}`} target="_blank" rel="noreferrer" className="break-all font-mono text-[11px] text-text hover:text-accent">
                      {f.path}
                    </a>
                  ) : (
                    <span className="break-all font-mono text-[11px] text-text">{f.path}</span>
                  )}
                  <span className="block text-[11px] text-faint">{f.componentId ? `→ ${f.componentId}` : `unmapped: ${f.reason}`}</span>
                </span>
              </li>
            ))}
          </ul>

          <Heading count={impact.changed.length}>Changed components</Heading>
          <ul className="space-y-1">
            {impact.changed.map((c) => (
              <li key={c.id}>
                <Name id={c.id} />
              </li>
            ))}
          </ul>

          <Heading count={impact.affected.length}>Affected components</Heading>
          <ol className="space-y-3" data-testid="impact-chains">
            {impact.affected.map((a) => (
              <li key={a.id} className="rounded-lg border border-dashed border-line-strong p-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Name id={a.id} />
                  <span className="font-mono text-[10.5px] text-impact-affected">depth {a.depth}</span>
                  {a.dynamic && (
                    <span className="inline-flex items-center gap-1 rounded bg-warn px-1 font-mono text-[10px] font-semibold text-bg">
                      <TriangleAlert className="size-3" aria-hidden /> via dynamic edge
                    </span>
                  )}
                </div>
                <ol className="mt-1.5 space-y-1.5 border-l border-line pl-2.5">
                  {a.chain.map((h, i) => (
                    <li key={`${h.edgeId}:${i}`}>
                      <button type="button" onClick={() => onSelect({ type: "edge", id: h.edgeId })} className="text-left font-mono text-[11px] text-text hover:text-accent" title="Open this edge in the inspector">
                        {h.source} -{h.kind}→ {h.target}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
                        {h.confidenceLabel === "dynamic" ? (
                          <span className="rounded bg-warn px-1 font-mono font-semibold text-bg">⚠ DYNAMIC</span>
                        ) : (
                          <span className="text-muted" title={EDGE_STYLES[h.confidenceLabel].meaning}>
                            {h.confidenceLabel}
                          </span>
                        )}
                        <span className="text-faint">·</span>
                        <span className="text-muted">&ldquo;{h.label}&rdquo;</span>
                        <span className="text-faint">· {h.walk}{h.depthCost === 0 ? ", leaves broker (no depth)" : ""}</span>
                      </div>
                      <Evidence snapshot={snapshot} file={h.evidence.file} line={h.evidence.line} />
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>

          <Heading count={impact.unmapped.length}>Unmapped files</Heading>
          {impact.unmapped.length ? (
            <ul className="space-y-1">
              {impact.unmapped.map((f) => (
                <li key={f.path} className="break-all font-mono text-[11px] text-muted">
                  {f.path} <span className="text-faint">({f.reason})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-faint">none</p>
          )}

          <Heading>Linked tests</Heading>
          <p className="text-muted" data-testid="impact-tests">
            {impact.linkedTests.length} linked test{impact.linkedTests.length === 1 ? "" : "s"}
          </p>
          {impact.linkedTests.map((t) => (
            <div key={`${t.file}:${t.componentId}`} className="font-mono text-[11px] text-muted">
              {t.file} → {t.componentId}
            </div>
          ))}

          <p className="mt-3 text-[11px] leading-snug text-faint">{impact.directionRule}</p>
          {impact.affected.some((a) => modelNamed(a.id)) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-faint">
              <ModelMark /> {MODEL_NAME_DISCLOSURE}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
