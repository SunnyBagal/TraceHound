import { z } from "zod";
import type { ChangeSet, ChangeWarning, DeclarationChange, DeclarationKind, EdgeChange, FileChange, ModificationKind } from "@tracehound/analyzer/schema";
import type { Component, ComponentKind, Snapshot } from "./types";

/**
 * The change view (?changes=<id>, decision 040): a change set from `tracehound changes` drawn over
 * the repo's component graph. Everything here is a pure function of the change set (and the
 * published snapshot, for the graph); nothing is computed by a model.
 */

export type { ChangeSet, ChangeWarning, DeclarationChange, EdgeChange, FileChange };

/** One entry of changesets/index.json. */
export const ChangeSetEntry = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  repo: z.string(), // a repo id of snapshots/index.json; a repo without a published snapshot is drawn from the change set alone
  title: z.string(),
  kind: z.enum(["commit", "run", "demo"]), // demo: head is a local commit made from `patch` (no GitHub permalinks at head)
  base: z.string(),
  head: z.string(), // a SHA, or the run id for kind "run"
  file: z.string(), // relative to changesets/
  patch: z.string().optional(), // demo: the patch that makes head from base
  runRecord: z.string().optional(), // run: the (trimmed) run record whose `diff` the change set was computed from
  regenerate: z.string().optional(), // the command that rewrites `file`, run from the repo root
});
export type ChangeSetEntry = z.infer<typeof ChangeSetEntry>;
export const ChangeSetIndex = z.array(ChangeSetEntry);

/** ?changes=<id>, only when it's a safe id. */
export function changesParam(search: string): string | null {
  const id = new URLSearchParams(search).get("changes");
  return id && /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : null;
}

/* ───────────── declarations ───────────── */

/** What the UI shows per declaration: a whitespace/comment-only edit is its own status, not "modified". */
export type DeclStatus = "added" | "removed" | "modified" | "formatting" | "unchanged";

export function declStatus(d: DeclarationChange): DeclStatus {
  // the CLI's rule (changeset.ts formattingOnly): modified with exactly ["formatting"]
  if (d.status === "modified" && d.modifications.length === 1 && d.modifications[0] === "formatting") return "formatting";
  return d.status;
}

export const STATUS_LABEL: Record<DeclStatus, string> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  formatting: "formatting only",
  unchanged: "unchanged",
};

export const REASON: Record<ModificationKind, string> = {
  signature: "signature changed",
  returnType: "return type changed",
  body: "body changed",
  typeAnnotation: "type annotation changed",
  shape: "shape changed",
  formatting: "formatting only",
};

/** The modification reasons in words; empty for added/removed/unchanged. */
export function reasons(d: DeclarationChange): string[] {
  return d.modifications.map((m) => REASON[m]);
}

export const DECL_KIND_LABEL: Record<DeclarationKind, string> = {
  function: "function",
  class: "class",
  method: "method",
  property: "property",
  "react-component": "React component",
  variable: "exported variable",
  "route-handler": "route handler",
  module: "module code",
  type: "type",
};

const STATUS_ORDER: Record<DeclStatus, number> = { removed: 0, modified: 1, added: 2, formatting: 3, unchanged: 4 };
const startLine = (d: DeclarationChange) => (d.head ?? d.base)?.startLine ?? 0;

export interface FileGroup {
  file: string;
  change?: FileChange;
  /** added, removed and modified declarations, warned ones first */
  changed: DeclarationChange[];
  /** whitespace/comment-only edits, listed together */
  formatting: DeclarationChange[];
  /** listed in the change set because a changed edge or a warning points at them; collapsed in the UI */
  unchanged: DeclarationChange[];
}

/** A component's files and their declarations, grouped for the drill-down. Files with warnings come first. */
export function componentFiles(set: ChangeSet, componentId: string, warned: ReadonlySet<string> = new Set()): FileGroup[] {
  const mine = set.declarations.filter((d) => d.componentId === componentId || d.baseComponentId === componentId);
  const byFile = new Map<string, FileGroup>();
  const group = (file: string) => {
    let g = byFile.get(file);
    if (!g) byFile.set(file, (g = { file, change: set.files.find((f) => f.path === file), changed: [], formatting: [], unchanged: [] }));
    return g;
  };
  for (const f of set.files) if (f.componentId === componentId) group(f.path);
  for (const d of mine) {
    const status = declStatus(d);
    const g = group(d.file);
    if (status === "formatting") g.formatting.push(d);
    else if (status === "unchanged") g.unchanged.push(d);
    else g.changed.push(d);
  }
  const rank = (d: DeclarationChange) => (warned.has(d.id) ? -1 : STATUS_ORDER[declStatus(d)]);
  for (const g of byFile.values()) {
    g.changed.sort((a, b) => rank(a) - rank(b) || startLine(a) - startLine(b));
    g.formatting.sort((a, b) => startLine(a) - startLine(b));
    g.unchanged.sort((a, b) => startLine(a) - startLine(b));
  }
  const fileWarned = (g: FileGroup) => g.changed.some((d) => warned.has(d.id));
  return [...byFile.values()].sort((a, b) => Number(fileWarned(b)) - Number(fileWarned(a)) || b.changed.length - a.changed.length || a.file.localeCompare(b.file));
}

/* ───────────── components ───────────── */

export interface ComponentDiff {
  id: string;
  added: number;
  removed: number;
  /** modified, not counting formatting-only */
  modified: number;
  formatting: number;
  /** type/interface/enum declarations added, removed or modified (formatting-only excluded) */
  typesChanged: number;
  warnings: number;
  /** produces/consumes declaration edges added or removed that touch this component */
  crossProcessChanged: number;
}

/** A compact, ordered list of badges for a component node. Zero counts are left out. */
export function rollupBadges(d: ComponentDiff): { key: string; text: string; tone: "added" | "removed" | "modified" | "muted" | "warn"; title: string }[] {
  const out: ReturnType<typeof rollupBadges> = [];
  if (d.warnings) out.push({ key: "warnings", text: `⚠ ${d.warnings}`, tone: "warn", title: `${d.warnings} change warning${d.warnings === 1 ? "" : "s"} involve this component` });
  if (d.added) out.push({ key: "added", text: `+${d.added}`, tone: "added", title: `${d.added} declaration${d.added === 1 ? "" : "s"} added` });
  if (d.removed) out.push({ key: "removed", text: `−${d.removed}`, tone: "removed", title: `${d.removed} declaration${d.removed === 1 ? "" : "s"} removed` });
  if (d.modified) out.push({ key: "modified", text: `~${d.modified}`, tone: "modified", title: `${d.modified} declaration${d.modified === 1 ? "" : "s"} modified` });
  if (d.typesChanged) out.push({ key: "types", text: `${d.typesChanged} type${d.typesChanged === 1 ? "" : "s"}`, tone: "modified", title: `${d.typesChanged} type, interface or enum declaration${d.typesChanged === 1 ? "" : "s"} changed` });
  if (d.formatting) out.push({ key: "formatting", text: `${d.formatting} fmt`, tone: "muted", title: `${d.formatting} formatting-only edit${d.formatting === 1 ? "" : "s"} (whitespace or comments; not counted as modified)` });
  return out;
}

/* ───────────── endpoints and edges ───────────── */

/** Which component a file belongs to: the change set's own mapping first, then the published snapshot. */
export function fileComponents(set: ChangeSet, snapshot?: Snapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of snapshot?.components ?? []) for (const f of c.files) map.set(f, c.id);
  for (const d of set.declarations) if (d.baseComponentId) map.set(d.file, d.baseComponentId);
  for (const f of set.files) if (f.componentId) map.set(f.path, f.componentId);
  for (const d of set.declarations) if (d.componentId && !d.baseComponentId) map.set(d.file, d.componentId);
  return map;
}

/** "queue:bullmq:content-processing" → the broker component ("bullmq:content-processing", or a node whose keys include the name). */
export function queueComponent(node: string, components: Component[]): string | undefined {
  const m = /^queue:([^:]+):(.+)$/.exec(node);
  if (!m) return undefined;
  const [, tech, name] = m;
  return components.find((c) => c.id === `${tech}:${name}`)?.id ?? components.find((c) => c.resource?.tech === tech && c.resource?.keys?.includes(name!))?.id;
}

export const isRouteNode = (id: string) => id.startsWith("route:");
export const isQueueNode = (id: string) => id.startsWith("queue:");
const declFile = (id: string) => (id.includes("#") ? id.slice(0, id.indexOf("#")) : undefined);

/** A declaration-edge endpoint's short label: "processContent", "queue content-processing", "GET /api/v1/search". */
export function endpointLabel(id: string): string {
  if (isRouteNode(id)) return id.slice("route:".length);
  const q = /^queue:([^:]+):(.+)$/.exec(id);
  if (q) return `queue ${q[2]}`;
  const name = id.slice(id.indexOf("#") + 1);
  return name.startsWith("route:") ? `${name.slice("route:".length)} handler` : name === "<module>" ? `${declFile(id)} (module code)` : name;
}

export type EdgeDiffStatus = "added" | "removed" | "regrouped" | "unchanged";

/** Component-edge ids → status, from every component's rollup. */
export function componentEdgeStatus(set: ChangeSet): Map<string, Exclude<EdgeDiffStatus, "unchanged">> {
  const map = new Map<string, Exclude<EdgeDiffStatus, "unchanged">>();
  for (const c of set.components) {
    for (const id of c.componentEdges.regrouped) map.set(id, "regrouped");
    for (const id of c.componentEdges.added) map.set(id, "added");
    for (const id of c.componentEdges.removed) map.set(id, "removed");
  }
  return map;
}

/** "a:x->b:y:imports" → { source: "a:x", target: "b:y", kind: "imports" } (component ids contain ':' but never '->'). */
export function parseComponentEdgeId(id: string): { source: string; target: string; kind: string } | null {
  const arrow = id.indexOf("->");
  if (arrow < 0) return null;
  const rest = id.slice(arrow + 2);
  const colon = rest.lastIndexOf(":");
  if (colon < 0) return null;
  return { source: id.slice(0, arrow), target: rest.slice(0, colon), kind: rest.slice(colon + 1) };
}

/* ───────────── warnings ───────────── */

export const WARNING_TITLE: Record<ChangeWarning["kind"], string> = {
  "queue-orphaned-by-diff": "A queue lost its producer or consumer",
  "queue-payload-type-changed": "A queue's message type changed",
  "removed-declaration-still-referenced": "Removed code is still referenced",
  "cross-component-signature-change": "A signature changed under callers in other components",
};
// what could break soonest first: a queue nobody reads, then a payload contract, then dangling references, then signatures
const WARNING_RANK: Record<ChangeWarning["kind"], number> = {
  "queue-orphaned-by-diff": 0,
  "queue-payload-type-changed": 1,
  "removed-declaration-still-referenced": 2,
  "cross-component-signature-change": 3,
};

export function orderWarnings(warnings: ChangeWarning[]): ChangeWarning[] {
  return [...warnings].sort((a, b) => WARNING_RANK[a.kind] - WARNING_RANK[b.kind] || a.id.localeCompare(b.id));
}

/** Components a warning involves: its evidence files, its declaration, and the queue it names. */
export function warningComponents(w: ChangeWarning, set: ChangeSet, components: Component[], files: Map<string, string>): string[] {
  const ids = new Set<string>();
  const queue = w.id.startsWith(`${w.kind}:`) ? w.id.slice(w.kind.length + 1) : undefined;
  if (queue && isQueueNode(queue)) {
    const q = queueComponent(queue, components);
    if (q) ids.add(q);
  }
  if (w.declarationId) {
    const d = set.declarations.find((x) => x.id === w.declarationId);
    const c = d?.componentId ?? files.get(declFile(w.declarationId) ?? "");
    if (c) ids.add(c);
  }
  for (const e of w.evidence) {
    const c = files.get(e.file);
    if (c) ids.add(c);
  }
  return [...ids];
}

/** Components first by what could break: warned, then most changed, then the untouched ones (by name). */
export function orderComponents(components: Component[], diffs: Map<string, ComponentDiff>): Component[] {
  const weight = (id: string) => {
    const d = diffs.get(id);
    return d ? d.added + d.removed + d.modified + d.typesChanged : -1;
  };
  return [...components].sort(
    (a, b) => (diffs.get(b.id)?.warnings ?? 0) - (diffs.get(a.id)?.warnings ?? 0) || weight(b.id) - weight(a.id) || a.name.localeCompare(b.name),
  );
}

/* ───────────── evidence links ───────────── */

/**
 * The patch line (1-based, in the unified diff text) that shows `line` of `file` on `side`, or null
 * when that line is outside every hunk. Base lines are '-' or context lines; head lines '+' or context.
 */
export function patchLine(diff: string, side: "base" | "head", file: string, line: number): number | null {
  const lines = diff.split("\n");
  let current: { base?: string; head?: string } = {};
  let b = 0;
  let h = 0;
  let inHunk = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("diff --git ")) {
      current = {};
      inHunk = false;
      continue;
    }
    if (!inHunk && l.startsWith("--- ")) {
      current.base = l.slice(4).replace(/^a\//, "");
      continue;
    }
    if (!inHunk && l.startsWith("+++ ")) {
      current.head = l.slice(4).replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (hunk) {
      b = Number(hunk[1]);
      h = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || (side === "base" ? current.base : current.head) !== file) continue;
    const mark = l[0];
    if (mark === " ") {
      if ((side === "base" ? b : h) === line) return i + 1;
      b++;
      h++;
    } else if (mark === "-") {
      if (side === "base" && b === line) return i + 1;
      b++;
    } else if (mark === "+") {
      if (side === "head" && h === line) return i + 1;
      h++;
    }
  }
  return null;
}

export interface LinkContext {
  kind: ChangeSetEntry["kind"];
  /** "owner/repo" on GitHub, when the repo is there */
  slug?: string;
  baseSha: string;
  /** head commit; absent for a run */
  headSha?: string;
  /** a run's patch text, for patch line numbers */
  patch?: string;
}

export interface EvidenceLink {
  text: string;
  href?: string;
  /** why there is no permalink, or what the number means */
  note?: string;
}

/** A file:line on one side of the change, as a GitHub permalink at that side's SHA when one exists. */
export function evidenceLink(ctx: LinkContext, side: "base" | "head", file: string, line: number, endLine?: number): EvidenceLink {
  const range = `${line}${endLine && endLine !== line ? `-${endLine}` : ""}`;
  const text = `${file}:${range}`;
  if (ctx.kind === "run") {
    const at = ctx.patch ? patchLine(ctx.patch, side, file, line) : null;
    if (side === "base") return { text, note: at ? `patch line ${at}` : "base of the run; no permalink" };
    return { text: at ? `patch line ${at}` : text, note: at ? `${text} in the patched tree` : "patched tree, outside the patch's hunks; no permalink" };
  }
  if (side === "head" && ctx.kind === "demo") return { text, note: "head is a local demo commit made from the committed patch; no permalink" };
  const sha = side === "base" ? ctx.baseSha : ctx.headSha;
  if (!ctx.slug || !sha) return { text };
  const anchor = `#L${line}${endLine && endLine !== line ? `-L${endLine}` : ""}`;
  return { text, href: `https://github.com/${ctx.slug}/blob/${sha}/${file.split("/").map(encodeURIComponent).join("/")}${anchor}` };
}

/** Where a declaration is shown: head span for added/modified/unchanged, base span for removed. */
export function declarationLink(ctx: LinkContext, d: DeclarationChange): EvidenceLink | undefined {
  const span = d.status === "removed" ? d.base : (d.head ?? d.base);
  if (!span) return undefined;
  return evidenceLink(ctx, d.status === "removed" || !d.head ? "base" : "head", span.file, span.startLine, span.endLine);
}

/* ───────────── summary ───────────── */

export interface ChangeSummary {
  components: number;
  declarations: { added: number; removed: number; modified: number; formatting: number };
  crossProcessEdges: number;
  warnings: number;
}

export function changeSummary(set: ChangeSet): ChangeSummary {
  const { added, removed, modified, formatting } = set.stats.declarations;
  return {
    components: set.components.length,
    declarations: { added, removed, modified, formatting },
    crossProcessEdges: set.edges.filter((e) => e.crossProcess && e.status !== "unchanged").length,
    warnings: set.warnings.length,
  };
}

/* ───────────── the model the viewer renders ───────────── */

export interface ExtraEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}

export interface ChangeModel {
  entry: ChangeSetEntry;
  set: ChangeSet;
  /** commit of the published snapshot the graph is drawn from; undefined when the repo has none */
  graphSha?: string;
  /** the published snapshot plus any component the change set names that it lacks */
  display: Snapshot;
  /** components that exist only in the change set (no published snapshot has them) */
  synthetic: Set<string>;
  diffs: Map<string, ComponentDiff>;
  /** snapshot edge id → status; absent = unchanged */
  edgeStatus: Map<string, Exclude<EdgeDiffStatus, "unchanged">>;
  /** "source->target" → declaration-level edges added/removed between two components */
  pairEdges: Map<string, EdgeChange[]>;
  /** component edges added at head that the published snapshot doesn't have */
  extraEdges: ExtraEdge[];
  warnings: ChangeWarning[];
  warningComponents: Map<string, string[]>;
  /** declaration ids a warning points at */
  warnedDeclarations: Set<string>;
  files: Map<string, string>;
  link: LinkContext;
  componentOf: (endpoint: string) => string | undefined;
}

function syntheticComponent(id: string, name: string, files: string[]): Component {
  // Only what the change set says: an id, a name and the changed files. The kind is required by the
  // schema; nodes flagged synthetic show "change set only" instead of a kind label.
  const kind: ComponentKind = "service";
  return {
    id,
    name,
    kind,
    subtitle: "Known from the change set only: this repo has no published snapshot",
    naming: { source: "heuristic", heuristicName: name },
    files,
    entryPoints: [],
    membership: files.map((file) => ({ file, reason: "changed file the change set maps here" })),
    routes: [],
    envVars: [],
    counts: { files: files.length, routes: 0, envVars: 0 },
  };
}

export function buildChangeModel(entry: ChangeSetEntry, set: ChangeSet, snapshot?: Snapshot, opts: { patch?: string; slug?: string } = {}): ChangeModel {
  const known = new Set(snapshot?.components.map((c) => c.id) ?? []);
  const synthetic = new Set(set.components.map((c) => c.id).filter((id) => !known.has(id)));
  const extraComponents = set.components
    .filter((c) => synthetic.has(c.id))
    .map((c) => syntheticComponent(c.id, c.name, set.files.filter((f) => f.componentId === c.id).map((f) => f.path)));
  const headSha = "sha" in set.head ? set.head.sha : undefined;
  const display: Snapshot = snapshot
    ? { ...snapshot, components: [...snapshot.components, ...extraComponents] }
    : {
        schemaVersion: 1,
        analyzerVersion: set.analyzerVersion,
        repo: { name: entry.repo, commitSha: set.base.sha },
        generatedAt: "",
        components: extraComponents,
        edges: [],
        files: [],
        evidence: [],
        warnings: [],
        tests: [],
        llmCalls: [],
      };
  const files = fileComponents(set, snapshot);
  const componentOf = (endpoint: string): string | undefined => {
    if (isQueueNode(endpoint)) return queueComponent(endpoint, display.components);
    if (isRouteNode(endpoint)) return undefined;
    const d = set.declarations.find((x) => x.id === endpoint);
    return d?.componentId ?? files.get(declFile(endpoint) ?? "");
  };

  const warnings = orderWarnings(set.warnings);
  const warningComponentsMap = new Map(warnings.map((w) => [w.id, warningComponents(w, set, display.components, files)]));
  const warnedDeclarations = new Set(warnings.flatMap((w) => (w.declarationId ? [w.declarationId] : [])));

  const pairEdges = new Map<string, EdgeChange[]>();
  for (const e of set.edges) {
    if (e.status === "unchanged") continue;
    const from = componentOf(e.from);
    const to = componentOf(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    pairEdges.set(key, [...(pairEdges.get(key) ?? []), e]);
  }

  const diffs = new Map<string, ComponentDiff>();
  for (const c of set.components) {
    const decls = set.declarations.filter((d) => d.componentId === c.id || d.baseComponentId === c.id);
    diffs.set(c.id, {
      id: c.id,
      added: c.declarations.added,
      removed: c.declarations.removed,
      modified: c.declarations.modified,
      formatting: c.declarations.formatting,
      typesChanged: decls.filter((d) => d.kind === "type" && ["added", "removed", "modified"].includes(declStatus(d))).length,
      warnings: 0,
      crossProcessChanged: set.edges.filter((e) => e.crossProcess && e.status !== "unchanged" && (componentOf(e.from) === c.id || componentOf(e.to) === c.id)).length,
    });
  }
  for (const ids of warningComponentsMap.values()) {
    for (const id of ids) {
      // a component a warning involves is part of the change even when none of its code changed
      const d = diffs.get(id) ?? { id, added: 0, removed: 0, modified: 0, formatting: 0, typesChanged: 0, warnings: 0, crossProcessChanged: 0 };
      d.warnings++;
      diffs.set(id, d);
    }
  }

  const edgeStatus = componentEdgeStatus(set);
  const snapshotEdges = new Set(display.edges.map((e) => e.id));
  const ids = new Set(display.components.map((c) => c.id));
  const extraEdges = [...edgeStatus.entries()]
    .filter(([id, status]) => status === "added" && !snapshotEdges.has(id))
    .flatMap(([id]) => {
      const p = parseComponentEdgeId(id);
      return p && ids.has(p.source) && ids.has(p.target) ? [{ id, ...p }] : [];
    });

  return {
    entry,
    set,
    graphSha: snapshot?.repo.commitSha,
    display,
    synthetic,
    diffs,
    edgeStatus,
    pairEdges,
    extraEdges,
    warnings,
    warningComponents: warningComponentsMap,
    warnedDeclarations,
    files,
    link: { kind: entry.kind, slug: opts.slug, baseSha: set.base.sha, headSha, patch: opts.patch },
    componentOf,
  };
}

/** Declaration edges added or removed with at least one end in `componentId` (neighbours included). */
export function componentEdgeChanges(model: ChangeModel, componentId: string): EdgeChange[] {
  return model.set.edges.filter((e) => e.status !== "unchanged" && (model.componentOf(e.from) === componentId || model.componentOf(e.to) === componentId));
}
