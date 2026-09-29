"use client";

import { ArrowRight, ExternalLink, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { EDGE_STYLES, redisKeys } from "@/lib/graph";
import { permalink } from "@/lib/github";
import { KIND_META } from "@/lib/kinds";
import type { Component, ComponentEdge, Snapshot } from "@/lib/types";
import { CodeSnippet } from "./CodeSnippet";
import type { Selection } from "./GraphCanvas";
import { NameSourceBadge } from "./NameSourceBadge";

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="border-t border-line px-4 py-3.5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {title}
        {count !== undefined && <span className="ml-1.5 font-normal text-faint/80">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function FileLink({ snapshot, file, start, end, children }: { snapshot: Snapshot; file: string; start?: number; end?: number; children?: ReactNode }) {
  const href = permalink(snapshot.repo, file, start, end);
  const label = children ?? `${file}${start ? `:${start}${end && end !== start ? `-${end}` : ""}` : ""}`;
  if (!href) return <span className="font-mono text-[11.5px] text-text">{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 break-all font-mono text-[11.5px] text-text hover:text-accent">
      {label}
      <ExternalLink className="size-3 shrink-0 text-faint group-hover:text-accent" aria-label="GitHub permalink" />
    </a>
  );
}

function ConfidenceTag({ edge }: { edge: ComponentEdge }) {
  const style = EDGE_STYLES[edge.confidenceLabel];
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-text" title={style.meaning}>
      <svg width="26" height="6" aria-hidden>
        <line x1="1" y1="3" x2="25" y2="3" stroke="currentColor" strokeWidth="1.8" strokeDasharray={style.dash} strokeLinecap={edge.confidenceLabel === "dynamic" ? "round" : "butt"} />
      </svg>
      {style.text}
    </span>
  );
}

function NodeInspector({ snapshot, component, onSelect }: { snapshot: Snapshot; component: Component; onSelect: (s: Selection) => void }) {
  const { icon: Icon, label } = KIND_META[component.kind];
  const keys = redisKeys(snapshot, component);
  const warnings = snapshot.warnings.filter((w) => w.componentId === component.id);
  const name = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  const outgoing = snapshot.edges.filter((e) => e.source === component.id);
  const incoming = snapshot.edges.filter((e) => e.target === component.id);
  return (
    <>
      <header className="px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg border border-line bg-card text-accent">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{component.name}</h2>
            <div className="text-xs text-faint">
              {label} · <span className="font-mono">{component.id}</span>
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <NameSourceBadge naming={component.naming} />
          {component.naming.source === "llm" && (
            <span className="text-[11px] text-faint">
              heuristic: <span className="text-muted">{component.naming.heuristicName}</span>
            </span>
          )}
        </div>
        {component.summary && <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{component.summary}</p>}
        <p className="mt-1.5 text-xs text-faint">{component.subtitle}</p>
      </header>

      {warnings.length > 0 && (
        <Section title="Warnings" count={warnings.length}>
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w.id} className="flex gap-2 text-[12.5px] text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Files · why each is here" count={component.files.length}>
        <ul className="space-y-2">
          {component.membership.map((m) => (
            <li key={m.file}>
              <FileLink snapshot={snapshot} file={m.file} />
              <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{m.reason}</div>
            </li>
          ))}
        </ul>
      </Section>

      {component.routes.length > 0 && (
        <Section title="Routes" count={component.routes.length}>
          <ul className="space-y-1">
            {component.routes.map((r) => {
              const ev = snapshot.evidence.find((e) => e.id === r.evidenceId);
              return (
                <li key={r.evidenceId} className="flex items-baseline gap-2 font-mono text-[12px]">
                  <span className="w-14 shrink-0 text-accent">{r.method}</span>
                  <FileLink snapshot={snapshot} file={r.file} start={ev?.range.startLine} end={ev?.range.endLine}>
                    {r.path}
                  </FileLink>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {keys.length > 0 && (
        <Section title="Redis keys" count={keys.length}>
          <ul className="flex flex-wrap gap-1.5">
            {keys.map((k) => (
              <li key={k} className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {k}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {component.resource?.models && component.resource.models.length > 0 && (
        <Section title="Models">
          <p className="font-mono text-[12px] text-muted">{component.resource.models.join(", ")}</p>
        </Section>
      )}

      {component.envVars.length > 0 && (
        <Section title="Env vars" count={component.envVars.length}>
          <p className="font-mono text-[11.5px] leading-relaxed text-muted">{component.envVars.join(" · ")}</p>
        </Section>
      )}

      <Section title="Connections" count={outgoing.length + incoming.length}>
        <ul className="space-y-1.5">
          {[...outgoing.map((e) => ({ e, other: e.target, dir: "→" })), ...incoming.map((e) => ({ e, other: e.source, dir: "←" }))].map(({ e, other, dir }) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect({ type: "edge", id: e.id })} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-card">
                <span className="text-faint">{dir}</span>
                <span className="text-text">{name(other)}</span>
                <span className="text-faint">{e.kind}</span>
                <span className="ml-auto">
                  <ConfidenceTag edge={e} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function EdgeInspector({ snapshot, edge, onSelect }: { snapshot: Snapshot; edge: ComponentEdge; onSelect: (s: Selection) => void }) {
  const name = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  const evidence = edge.evidenceIds.map((id) => snapshot.evidence.find((e) => e.id === id)!).filter(Boolean);
  const detectors = [...new Set(evidence.map((e) => e.extractor))];
  return (
    <>
      <header className="px-4 pb-3.5 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          <button type="button" className="hover:text-accent" onClick={() => onSelect({ type: "node", id: edge.source })}>
            {name(edge.source)}
          </button>
          <ArrowRight className="size-4 text-faint" aria-hidden />
          <button type="button" className="hover:text-accent" onClick={() => onSelect({ type: "node", id: edge.target })}>
            {name(edge.target)}
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
          <dt className="text-faint">Relationship</dt>
          <dd className="font-mono text-text">{edge.kind}</dd>
          <dt className="text-faint">Label</dt>
          <dd className="font-mono text-muted">{edge.label}</dd>
          <dt className="text-faint">Confidence</dt>
          <dd>
            <ConfidenceTag edge={edge} /> <span className="ml-1 text-[11px] text-faint">{EDGE_STYLES[edge.confidenceLabel].meaning}</span>
          </dd>
          <dt className="text-faint">Detector</dt>
          <dd className="font-mono text-muted">{detectors.map((d) => `${d} extractor`).join(", ")}</dd>
        </dl>
      </header>
      <Section title="Evidence" count={evidence.length}>
        <ol className="space-y-4">
          {evidence.map((ev) => (
            <li key={ev.id} data-testid="evidence-item">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <FileLink snapshot={snapshot} file={ev.file} start={ev.range.startLine} end={ev.range.endLine} />
                {ev.symbol && <span className="font-mono text-[11px] text-faint">in {ev.symbol}</span>}
              </div>
              <p className="mb-1.5 text-[12px] text-muted">
                {ev.detail}
                {ev.resolution && <span className="text-faint"> · {ev.resolution}</span>}
              </p>
              <CodeSnippet evidence={ev} />
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

/** Right panel on desktop, bottom sheet on phones. */
export function Inspector({ snapshot, selection, onSelect }: { snapshot: Snapshot; selection: Selection; onSelect: (s: Selection) => void }) {
  const component = selection?.type === "node" ? snapshot.components.find((c) => c.id === selection.id) : undefined;
  const edge = selection?.type === "edge" ? snapshot.edges.find((e) => e.id === selection.id) : undefined;
  const open = Boolean(component || edge);
  return (
    <aside
      aria-label="Inspector"
      aria-hidden={!open}
      className={[
        "fixed inset-x-0 bottom-0 z-20 max-h-[62dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-panel shadow-[0_-12px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out",
        "md:static md:z-auto md:max-h-none md:w-[420px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none md:transition-[margin] ",
        open ? "translate-y-0 md:mr-0" : "translate-y-full md:-mr-[420px] md:translate-y-0",
      ].join(" ")}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-2 backdrop-blur">
        <span className="mx-auto h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
        <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-faint md:inline">{edge ? "Edge" : "Component"}</span>
        <button type="button" onClick={() => onSelect(null)} className="absolute right-2 top-1.5 rounded-md p-1 text-faint hover:bg-card hover:text-text" aria-label="Close inspector">
          <X className="size-4" />
        </button>
      </div>
      {component && <NodeInspector snapshot={snapshot} component={component} onSelect={onSelect} />}
      {edge && <EdgeInspector snapshot={snapshot} edge={edge} onSelect={onSelect} />}
    </aside>
  );
}
