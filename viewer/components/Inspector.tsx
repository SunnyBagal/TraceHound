"use client";

import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, ExternalLink, Sparkles, Spline, TriangleAlert, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { componentEdgeChanges, declStatus, endpointLabel, evidenceLink, type ChangeModel } from "@/lib/changes";
import { EDGE_STYLES, redisKeys } from "@/lib/graph";
import { permalink } from "@/lib/github";
import { edgesWithEvidenceIn, noHighlight, type BindHighlight } from "@/lib/highlight";
import { KIND_META } from "@/lib/kinds";
import { current, type Entry, type PanelNavigation, type Tab } from "@/lib/navigation";
import { modelWrittenLabel } from "@/lib/naming";
import { TECH_META, techFacts, type TechFact } from "@/lib/tech";
import type { Component, ComponentEdge, Snapshot } from "@/lib/types";
import { ComponentChanges, EvidenceRef, StatusPill } from "./ChangeParts";
import { CodeSnippet } from "./CodeSnippet";
import { DIFF_EDGE } from "./EvidenceEdge";
import { ComponentIcon, TechLogo } from "./ComponentIcon";
import { NameSourceBadge } from "./NameSourceBadge";

const CHANGES_TAB: { id: Tab; label: string } = { id: "changes", label: "Changes" };
const NODE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "connections", label: "Connections" },
];
const EDGE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
];

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
        {title}
        {count !== undefined && <span className="ml-1.5 font-normal">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function FileLink({ snapshot, file, start, end, children }: { snapshot: Snapshot; file: string; start?: number; end?: number; children?: ReactNode }) {
  const href = permalink(snapshot.repo, file, start, end);
  const label = children ?? `${file}${start ? `:${start}${end && end !== start ? `-${end}` : ""}` : ""}`;
  if (!href) return <span className="break-all font-mono text-[13px] text-text">{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-baseline gap-1 break-all font-mono text-[13px] text-text hover:text-accent">
      {label}
      <ExternalLink className="size-3.5 shrink-0 self-center text-faint group-hover:text-accent" aria-label="GitHub permalink" />
    </a>
  );
}

function ConfidenceTag({ edge }: { edge: ComponentEdge }) {
  const style = EDGE_STYLES[edge.confidenceLabel];
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-md border border-line px-1.5 py-0.5 text-[12px] text-text" title={style.meaning}>
      <svg width="22" height="6" aria-hidden>
        <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="1.8" strokeDasharray={style.dash} strokeLinecap={edge.confidenceLabel === "dynamic" ? "round" : "butt"} />
      </svg>
      {style.text}
    </span>
  );
}

function Tabs({ tabs, active, onChange, counts }: { tabs: { id: Tab; label: string }[]; active: Tab; onChange: (t: Tab) => void; counts: Partial<Record<Tab, number>> }) {
  return (
    <div role="tablist" aria-label="Inspector sections" className="flex gap-1 px-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls="inspector-tabpanel"
          onClick={() => onChange(t.id)}
          className={[
            "-mb-px border-b-2 px-2.5 py-2 text-[14px] font-medium transition-colors",
            active === t.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
          ].join(" ")}
        >
          {t.label}
          {counts[t.id] !== undefined && <span className="ml-1.5 text-[12px] font-normal text-faint">{counts[t.id]}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────── component ───────────── */

function StackList({ snapshot, facts }: { snapshot: Snapshot; facts: TechFact[] }) {
  return (
    <ul className="space-y-2.5">
      {facts.map((f) => (
        <li key={`${f.tech}:${f.file}:${f.line}`} className="flex gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-card">
            <TechLogo fact={f} className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-text">{TECH_META[f.tech].label}</div>
            <FileLink snapshot={snapshot} file={f.file} start={f.line} />
            <div className="text-[13px] leading-normal text-faint">{f.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The model-written label, placed directly beside the text it qualifies. */
function ModelWrittenLabel({ text, testId, className = "" }: { text: string; testId: string; className?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-medium leading-tight text-accent ${className}`}>
      <Sparkles className="size-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

function ComponentOverview({ snapshot, component, facts }: { snapshot: Snapshot; component: Component; facts: TechFact[] }) {
  const keys = redisKeys(snapshot, component);
  const modelLabel = modelWrittenLabel(component.naming);
  const warnings = snapshot.warnings.filter((w) => w.componentId === component.id);
  return (
    <>
      <Section title="Summary">
        {component.summary && (
          // a summary only ever comes from the naming model: its label sits right beside it
          <div data-testid="summary">
            <p className="text-[15px] leading-normal text-text">{component.summary}</p>
            {modelLabel && <ModelWrittenLabel text={modelLabel} testId="summary-model-written" className="mt-1.5" />}
          </div>
        )}
        <p className={`${component.summary ? "mt-3" : ""} text-[14px] leading-normal text-muted`} data-testid="from-facts">
          <span className="text-faint">From facts: </span>
          {component.subtitle}
        </p>
        <p className="mt-2 text-[13px] leading-normal text-faint" data-testid="name-source">
          {component.naming.source === "llm" ? (
            <>
              Name written by the model; heuristic name: <span className="text-muted">{component.naming.heuristicName}</span>
            </>
          ) : component.naming.source === "override" ? (
            <>
              Name set by a <span className="font-mono text-muted">tracehound.json</span> override; heuristic name: <span className="text-muted">{component.naming.heuristicName}</span>
            </>
          ) : (
            "Heuristic name (from the code, no model)"
          )}
        </p>
        {component.naming.summaryDropped && (
          <p className="mt-1 text-[13px] leading-normal text-faint" data-testid="summary-dropped">
            The model&apos;s summary was wrong and is not shown (<span className="font-mono">summary: false</span> in tracehound.json).
          </p>
        )}
      </Section>

      {warnings.length > 0 && (
        <Section title="Warnings" count={warnings.length}>
          <ul className="space-y-2">
            {warnings.map((w) => (
              <li key={w.id} className="flex gap-2 text-[14px] leading-normal text-warn">
                <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden /> {w.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facts.length > 0 && (
        <Section title="Stack · from facts" count={facts.length}>
          <StackList snapshot={snapshot} facts={facts} />
        </Section>
      )}

      {component.routes.length > 0 && (
        <Section title="Routes" count={component.routes.length}>
          <ul className="space-y-1.5">
            {component.routes.map((r) => {
              const ev = snapshot.evidence.find((e) => e.id === r.evidenceId);
              return (
                <li key={r.evidenceId} className="flex items-baseline gap-3">
                  <span className="w-16 shrink-0 font-mono text-[13px] font-semibold text-accent">{r.method}</span>
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
              <li key={k} className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[12.5px] text-muted">
                {k}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {component.resource?.models && component.resource.models.length > 0 && (
        <Section title="Models">
          <p className="font-mono text-[13px] text-muted">{component.resource.models.join(", ")}</p>
        </Section>
      )}

      {component.envVars.length > 0 && (
        <Section title="Env vars" count={component.envVars.length}>
          <ul className="flex flex-wrap gap-1.5">
            {component.envVars.map((v) => (
              <li key={v} className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[12.5px] text-muted">
                {v}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function ComponentFiles({ snapshot, component, bind }: { snapshot: Snapshot; component: Component; bind: BindHighlight }) {
  return (
    <Section title="Files · why each is here" count={component.files.length}>
      {component.membership.length ? (
        <ul className="-mx-2 space-y-1">
          {component.membership.map((m) => (
            // hover or focus (the permalink inside) lights up every edge with evidence in this file
            <li key={m.file} data-testid="file-row" className="rounded-lg px-2 py-1.5 data-[highlighted=true]:bg-card data-[highlighted=true]:ring-1 data-[highlighted=true]:ring-highlight/70" {...bind({ key: `file:${m.file}`, nodeIds: [], edgeIds: edgesWithEvidenceIn(snapshot, m.file) })}>
              <FileLink snapshot={snapshot} file={m.file} />
              <div className="mt-0.5 text-[14px] leading-normal text-muted">{m.reason}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">No files: this is infrastructure seen through its clients.</p>
      )}
    </Section>
  );
}

function ConnectionList({ snapshot, edges, direction, onOpen, bind }: { snapshot: Snapshot; edges: ComponentEdge[]; direction: "out" | "in"; onOpen: (e: ComponentEdge) => void; bind: BindHighlight }) {
  const name = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  const Dir = direction === "out" ? ArrowUpRight : ArrowDownLeft;
  if (!edges.length) return <p className="text-[14px] text-faint">None</p>;
  return (
    <ul className="-mx-2 space-y-0.5">
      {edges.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            data-testid="connection"
            onClick={() => onOpen(e)}
            {...bind({ key: `connection:${e.id}`, nodeIds: [direction === "out" ? e.target : e.source], edgeIds: [e.id] })}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-card data-[highlighted=true]:bg-card data-[highlighted=true]:ring-1 data-[highlighted=true]:ring-highlight/70"
            title={`Open the ${e.kind} edge and its evidence`}
          >
            <Dir className="size-4 shrink-0 text-faint" aria-label={direction === "out" ? "outgoing" : "incoming"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-text">{name(direction === "out" ? e.target : e.source)}</span>
              <span className="text-[13px] text-muted">
                {e.kind}
                {e.weight > 1 && <span className="text-faint"> · {e.weight} evidence</span>}
              </span>
            </span>
            <ConfidenceTag edge={e} />
            <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ComponentConnections({ snapshot, component, onOpen, bind }: { snapshot: Snapshot; component: Component; onOpen: (e: ComponentEdge) => void; bind: BindHighlight }) {
  const outgoing = snapshot.edges.filter((e) => e.source === component.id);
  const incoming = snapshot.edges.filter((e) => e.target === component.id);
  return (
    <>
      <Section title="Outgoing" count={outgoing.length}>
        <ConnectionList snapshot={snapshot} edges={outgoing} direction="out" onOpen={onOpen} bind={bind} />
      </Section>
      <Section title="Incoming" count={incoming.length}>
        <ConnectionList snapshot={snapshot} edges={incoming} direction="in" onOpen={onOpen} bind={bind} />
      </Section>
    </>
  );
}

/* ───────────── edge ───────────── */

function Endpoint({ snapshot, id, role, onOpen, bind }: { snapshot: Snapshot; id: string; role: string; onOpen: () => void; bind: BindHighlight }) {
  const component = snapshot.components.find((c) => c.id === id);
  const facts = useMemo(() => (component ? techFacts(snapshot, component) : []), [snapshot, component]);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`endpoint-${role}`}
      {...bind({ key: `endpoint:${role}:${id}`, nodeIds: [id], edgeIds: [] })}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-left hover:border-line-strong hover:bg-card-hover data-[highlighted=true]:border-highlight data-[highlighted=true]:bg-card-hover"
    >
      {component && <ComponentIcon kind={component.kind} tech={facts} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] uppercase tracking-wider text-faint">{role}</span>
        <span className="block truncate text-[14px] font-medium text-text">{component?.name ?? id}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </button>
  );
}

function EdgeOverview({ snapshot, edge, onOpenNode, onEvidence, bind }: { snapshot: Snapshot; edge: ComponentEdge; onOpenNode: (id: string) => void; onEvidence: () => void; bind: BindHighlight }) {
  const evidence = edge.evidenceIds.map((id) => snapshot.evidence.find((e) => e.id === id)).filter((e) => e !== undefined);
  const detectors = [...new Set(evidence.map((e) => e.extractor))];
  return (
    <>
      <Section title="Endpoints">
        <div className="space-y-2">
          <Endpoint snapshot={snapshot} id={edge.source} role="from" onOpen={() => onOpenNode(edge.source)} bind={bind} />
          <Endpoint snapshot={snapshot} id={edge.target} role="to" onOpen={() => onOpenNode(edge.target)} bind={bind} />
        </div>
      </Section>
      <Section title="Details">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-[14px] leading-normal">
          <dt className="text-faint">Relationship</dt>
          <dd className="text-text">{edge.kind}</dd>
          <dt className="text-faint">Label</dt>
          <dd className="break-words font-mono text-[13px] text-muted">{edge.label}</dd>
          <dt className="text-faint">Confidence</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <ConfidenceTag edge={edge} /> <span className="text-[13px] text-muted">{EDGE_STYLES[edge.confidenceLabel].meaning}</span>
          </dd>
          <dt className="text-faint">Detector</dt>
          <dd className="text-muted">{detectors.map((d) => `${d} extractor`).join(", ")}</dd>
          <dt className="text-faint">Evidence</dt>
          <dd>
            <button type="button" onClick={onEvidence} className="text-accent hover:underline">
              {evidence.length} item{evidence.length === 1 ? "" : "s"} →
            </button>
          </dd>
        </dl>
      </Section>
    </>
  );
}

function EdgeEvidence({ snapshot, edge }: { snapshot: Snapshot; edge: ComponentEdge }) {
  const evidence = edge.evidenceIds.map((id) => snapshot.evidence.find((e) => e.id === id)).filter((e) => e !== undefined);
  return (
    <Section title="Evidence" count={evidence.length}>
      <ol className="space-y-5">
        {evidence.map((ev) => (
          <li key={ev.id} data-testid="evidence-item" className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <FileLink snapshot={snapshot} file={ev.file} start={ev.range.startLine} end={ev.range.endLine} />
              {ev.symbol && <span className="text-[13px] text-faint">in <span className="font-mono">{ev.symbol}</span></span>}
            </div>
            <p className="mb-2 text-[14px] leading-normal text-muted">
              {ev.detail}
              {ev.resolution && <span className="text-faint"> · {ev.resolution}</span>}
            </p>
            <CodeSnippet evidence={ev} />
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Change view: the edge's status in the change set and the declaration edges under it. */
function EdgeInChange({ model, edge }: { model: ChangeModel; edge: ComponentEdge }) {
  const status = model.edgeStatus.get(edge.id);
  const decls = model.pairEdges.get(`${edge.source}->${edge.target}`) ?? [];
  return (
    <Section title="In this change">
      <p className="text-[14px] leading-normal text-muted" data-testid="edge-in-change">
        {status ? (
          <>
            <StatusPill status={status === "regrouped" ? "regrouped" : status} /> <span className="ml-1">{DIFF_EDGE[status].meaning}.</span>
          </>
        ) : (
          "The component edge itself is unchanged."
        )}
      </p>
      {decls.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {decls.map((e) => (
            <li key={e.id} className="text-[13px]">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-text">
                <StatusPill status={e.status === "added" ? "added" : "removed"} /> <span className="text-faint">{e.kind}</span> {endpointLabel(e.from)} <ArrowRight className="size-3.5 text-faint" aria-label="to" /> {endpointLabel(e.to)}
              </div>
              <EvidenceRef link={evidenceLink(model.link, e.evidence[0]!.side, e.evidence[0]!.file, e.evidence[0]!.line)} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ───────────── shell ───────────── */

function crumbLabel(snapshot: Snapshot, entry: Entry, previous: Entry | undefined): string {
  const name = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  if (entry.type === "node") return name(entry.id);
  const edge = snapshot.edges.find((e) => e.id === entry.id);
  if (!edge) return entry.id;
  const fromEndpoint = previous?.type === "node" && (previous.id === edge.source || previous.id === edge.target);
  return fromEndpoint ? edge.kind : `${name(edge.source)} → ${name(edge.target)}`;
}

function Breadcrumbs({ snapshot, nav }: { snapshot: Snapshot; nav: PanelNavigation }) {
  const { stack } = nav;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] leading-snug">
        {stack.map((entry, i) => {
          const label = crumbLabel(snapshot, entry, stack[i - 1]);
          const last = i === stack.length - 1;
          return (
            <li key={`${i}:${entry.type}:${entry.id}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text" data-testid="crumb">
                  {label}
                </span>
              ) : (
                <button type="button" onClick={() => nav.jump(i)} className="truncate text-muted hover:text-accent" data-testid="crumb">
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Right overlay on desktop (Railway-style), full-screen sheet on phones. `bind` wires rows that
 * point at the canvas (connections, files, endpoints) to the transient hover highlight.
 */
export function Inspector({ snapshot, nav, bind = noHighlight, changes }: { snapshot: Snapshot; nav: PanelNavigation; bind?: BindHighlight; changes?: ChangeModel }) {
  const entry = current(nav.stack);
  const component = entry?.type === "node" ? snapshot.components.find((c) => c.id === entry.id) : undefined;
  const edge = entry?.type === "edge" ? snapshot.edges.find((e) => e.id === entry.id) : undefined;
  const open = Boolean(component || edge);
  const facts = useMemo(() => (component ? techFacts(snapshot, component) : []), [snapshot, component]);
  // change view: a component opens on its Changes tab (files → declarations)
  const tabs = edge ? EDGE_TABS : changes ? [CHANGES_TAB, ...NODE_TABS] : NODE_TABS;
  const tab = tabs.some((t) => t.id === entry?.tab) ? entry!.tab! : changes && component ? "changes" : "overview";
  const openNode = (id: string) => nav.push({ type: "node", id });

  let header: ReactNode = null;
  let body: ReactNode = null;
  let counts: Partial<Record<Tab, number>> = {};
  if (component) {
    const { label } = KIND_META[component.kind];
    counts = { files: component.files.length, connections: snapshot.edges.filter((e) => e.source === component.id || e.target === component.id).length };
    if (changes) {
      const changed = changes.set.declarations.filter((d) => (d.componentId === component.id || d.baseComponentId === component.id) && !["unchanged", "formatting"].includes(declStatus(d))).length;
      counts.changes = changed + componentEdgeChanges(changes, component.id).length;
    }
    header = (
      <div className="flex gap-3 px-5 pb-3 pt-2">
        <ComponentIcon kind={component.kind} tech={facts} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-snug text-text">{component.name}</h2>
          <div className="mt-0.5 text-[13px] text-muted">
            {changes?.synthetic.has(component.id) ? "Change set only" : label} · <span className="break-all font-mono text-[12.5px]">{component.id}</span>
          </div>
          <div className="mt-2 flex">
            <NameSourceBadge naming={component.naming} />
          </div>
        </div>
      </div>
    );
    body =
      tab === "changes" && changes ? (
        <section className="px-5 py-4">
          <ComponentChanges model={changes} componentId={component.id} onOpen={openNode} bind={bind} />
        </section>
      ) : tab === "files" ? (
        <ComponentFiles snapshot={snapshot} component={component} bind={bind} />
      ) : tab === "connections" ? (
        <ComponentConnections snapshot={snapshot} component={component} onOpen={(e) => nav.push({ type: "edge", id: e.id })} bind={bind} />
      ) : (
        <ComponentOverview snapshot={snapshot} component={component} facts={facts} />
      );
  } else if (edge) {
    const name = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
    counts = { evidence: edge.evidenceIds.length };
    header = (
      <div className="flex gap-3 px-5 pb-3 pt-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-muted" aria-hidden>
          <Spline className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-x-1.5 text-[17px] font-semibold leading-snug">
            <button type="button" className="text-left text-text hover:text-accent" onClick={() => openNode(edge.source)}>
              {name(edge.source)}
            </button>
            <ArrowRight className="size-4 shrink-0 text-faint" aria-label="to" />
            <button type="button" className="text-left text-text hover:text-accent" onClick={() => openNode(edge.target)}>
              {name(edge.target)}
            </button>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Edge · {edge.kind} <ConfidenceTag edge={edge} />
          </div>
        </div>
      </div>
    );
    body =
      tab === "evidence" ? (
        <EdgeEvidence snapshot={snapshot} edge={edge} />
      ) : (
        <>
          {changes && <EdgeInChange model={changes} edge={edge} />}
          <EdgeOverview snapshot={snapshot} edge={edge} onOpenNode={openNode} onEvidence={() => nav.setTab("evidence")} bind={bind} />
        </>
      );
  }

  return (
    <aside
      aria-label="Inspector"
      aria-hidden={!open}
      inert={!open}
      data-testid="inspector"
      className={[
        "fixed inset-0 z-30 flex flex-col bg-panel transition-transform duration-300 ease-out",
        "md:absolute md:inset-y-0 md:left-auto md:right-0 md:z-20 md:w-[clamp(420px,34vw,600px)] md:border-l md:border-line md:shadow-[-16px_0_40px_-12px_var(--scrim)]",
        open ? "translate-x-0 translate-y-0" : "translate-y-full md:translate-x-full md:translate-y-0",
      ].join(" ")}
    >
      {open && (
        <>
          <div className="shrink-0 border-b border-line bg-panel">
            <div className="flex items-center gap-1.5 px-3 pt-3">
              {nav.stack.length > 1 && (
                <button type="button" onClick={nav.back} className="rounded-md p-1.5 text-muted hover:bg-card hover:text-text" aria-label="Back" data-testid="panel-back">
                  <ArrowLeft className="size-4.5" />
                </button>
              )}
              <div className="flex min-w-0 flex-1 px-1.5">
                <Breadcrumbs snapshot={snapshot} nav={nav} />
              </div>
              <button type="button" onClick={nav.close} className="rounded-md p-1.5 text-muted hover:bg-card hover:text-text" aria-label="Close inspector" title="Close (Esc)">
                <X className="size-4.5" />
              </button>
            </div>
            {header}
            <Tabs tabs={tabs} active={tab} onChange={nav.setTab} counts={counts} />
          </div>
          <div id="inspector-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {body}
          </div>
        </>
      )}
    </aside>
  );
}
