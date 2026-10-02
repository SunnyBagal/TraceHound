// Change sets (decision 038): a declaration-level diff of two trees with an architectural rollup.
// Deterministic: ts-morph + git + the existing extractors. No model, nothing silently dropped.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { analyzeRepo } from "../analyze.ts";
import { loadWorkspace, relPath } from "../load/workspace.ts";
import { ANALYZER_VERSION } from "../version.ts";
import {
  CHANGESET_SCHEMA_VERSION,
  ChangeSet,
  type CallCounts,
  type ChangeWarning,
  type ComponentChange,
  type DeclarationChange,
  type EdgeChange,
  type FileChange,
  type ModificationKind,
  type Snapshot,
} from "../schema.ts";
import { indexTree, type Decl, type RouteSpan, type TreeIndex } from "./declarations.ts";
import { addWorktree, ChangesError, git, parseZeroContextDiff, type FileHunks } from "./git.ts";

export { ChangesError } from "./git.ts";

export const LIMITATIONS = [
  "Renames are not detected: a renamed or moved declaration appears as removed + added (ids are file path + qualified name), and file renames are diffed with --no-renames.",
  "Return types are compared only where annotated; inferred return types are not compared.",
  "Bodies are compared as exact text: a formatting-only edit counts as a body change.",
  "Types, interfaces and non-exported module-level values are not declarations of their own: their edits show as the module's body.",
  "Call resolution is static (ts-morph symbols). Calls through parameters, locals, element access or untyped values are counted as dynamic per file; calls into packages or the TS lib are counted as external. Neither produces an edge.",
  "Without a package's or the runtime's types installed, a call is counted external when its receiver chain starts at something imported, typed or constructed from a package, or at an undeclared runtime global from a fixed list (console, crypto, setTimeout, fetch, …); any other free identifier is dynamic.",
  "Both trees are analyzed in fresh git worktrees, which carry no node_modules: installed package types are never used, so calls on values typed only by a package are dynamic unless the receiver rule above applies.",
  "Top-level code is one declaration per file (kind module): a change to statements outside any function shows as the module's body, not a finer declaration.",
  "Route and queue edges come from the existing extractors (http-routes, bullmq-queues, redis) and are attributed to the innermost declaration around their evidence line.",
];

type Side = "base" | "head";
interface TreeSide {
  side: Side;
  root: string;
  snapshot: Snapshot;
  index: TreeIndex;
  sourceFiles: Map<string, SourceFile>;
  componentOf: (file: string) => string | undefined;
  edges: Map<string, { from: string; to: string; kind: EdgeChange["kind"]; evidence: EdgeChange["evidence"] }>;
}

export interface ChangeSetInput {
  repo: string;
  base: string; // a commit-ish
  head?: string; // a commit-ish (diff mode)
  run?: { runId: string; taskId: string; patch: string }; // run mode: the patch applies to base
  configPath?: string;
}

/** Analyze one tree: snapshot (components, routes, queues) + declarations and calls. */
function analyzeTree(root: string, side: Side, configPath: string | undefined): TreeSide {
  const ws = loadWorkspace(root);
  const snapshot = analyzeRepo(root, { configPath, workspace: ws, now: () => new Date(0) });
  const rel = (abs: string) => relPath(ws.repoRoot, abs);
  const analyzed = new Set(snapshot.files.filter((f) => f.language === "ts").map((f) => f.path));
  const files = ws.sourceFiles.filter((sf) => analyzed.has(rel(sf.getFilePath())));
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const routeSpans: RouteSpan[] = snapshot.components.flatMap((c) =>
    c.routes.map((r) => ({ file: r.file, startLine: evidence.get(r.evidenceId)!.range.startLine, label: `${r.method} ${r.path}` })),
  );
  const index = indexTree(files, rel, routeSpans);
  const fileToComponent = new Map(snapshot.components.flatMap((c) => c.files.map((f) => [f, c.id] as const)));

  const edges: TreeSide["edges"] = new Map();
  const addEdge = (from: string, to: string, kind: EdgeChange["kind"], ev: EdgeChange["evidence"][number]) => {
    const id = `${from}->${to}:${kind}`;
    const e = edges.get(id) ?? { from, to, kind, evidence: [] };
    e.evidence.push(ev);
    edges.set(id, e);
  };
  for (const c of index.calls) if (c.bucket === "resolved" && c.to && c.to !== c.from) addEdge(c.from, c.to, "calls", { side, file: c.file, line: c.line, extractor: "calls (ts-morph symbols)" });
  for (const r of index.routes) addEdge(r.route, r.handler, "route", { side, file: r.file, line: r.line, extractor: r.resolved ? "http-routes" : "http-routes (handler not resolvable: the registering declaration)" });
  for (const f of snapshot.files) {
    for (const op of f.queueOps ?? []) {
      if (op.role !== "produce" && op.role !== "consume") continue;
      const ev = evidence.get(op.evidenceId)!;
      const decl = index.enclosingLine(f.path, ev.range.startLine);
      const queue = `queue:bullmq:${op.queue?.value ?? "<dynamic>"}`;
      const e = { side, file: f.path, line: ev.range.startLine, extractor: "bullmq-queues" };
      if (op.role === "produce") addEdge(decl, queue, "produces", e);
      else addEdge(queue, decl, "consumes", e);
    }
    for (const op of f.redisOps) {
      if (op.role !== "produce" && op.role !== "consume") continue;
      const ev = evidence.get(op.evidenceId)!;
      const decl = index.enclosingLine(f.path, ev.range.startLine);
      const queue = `queue:redis:${op.key?.value ?? "<dynamic>"}`;
      const e = { side, file: f.path, line: ev.range.startLine, extractor: "redis" };
      if (op.role === "produce") addEdge(decl, queue, "produces", e);
      else addEdge(queue, decl, "consumes", e);
    }
  }
  return { side, root, snapshot, index, sourceFiles: new Map(files.map((sf) => [rel(sf.getFilePath()), sf])), componentOf: (f) => fileToComponent.get(f), edges };
}

/** A tracehound config for the repo: explicit, else configs/<repo name>.tracehound.json when it exists. */
export function resolveConfig(repo: string, explicit: string | undefined, workspaceRoot: string): string | undefined {
  if (explicit) return path.resolve(explicit);
  let url = "";
  try {
    url = git(repo, ["remote", "get-url", "origin"]).trim();
  } catch {}
  const name = /[/:]([^/:]+?)(?:\.git)?$/.exec(url)?.[1]?.toLowerCase();
  const candidate = name ? path.join(workspaceRoot, "configs", `${name}.tracehound.json`) : undefined;
  return candidate && existsSync(candidate) ? candidate : undefined;
}

const sameParts = (a: Decl["parts"], b: Decl["parts"]): ModificationKind[] => {
  const kinds: ModificationKind[] = [];
  if (a.signature !== b.signature) kinds.push("signature");
  if (a.returnType !== b.returnType) kinds.push("returnType");
  if (a.body !== b.body) kinds.push("body");
  if (a.typeAnnotation !== b.typeAnnotation) kinds.push("typeAnnotation");
  return kinds;
};

/** Changed lines inside a declaration's span; a module counts only lines outside its top-level declarations. */
function linesIn(d: Decl, changed: Set<number> | undefined, index: TreeIndex): number {
  if (!changed?.size) return 0;
  const others = d.kind === "module" ? (index.byFile.get(d.file) ?? []).filter((x) => x.topLevel) : [];
  let n = 0;
  for (const line of changed) {
    if (line < d.startLine || line > d.endLine) continue;
    if (others.some((o) => line >= o.startLine && line <= o.endLine)) continue;
    n++;
  }
  return n;
}

export function computeChangeSet(input: ChangeSetInput): ChangeSet {
  const started = performance.now();
  const repo = path.resolve(input.repo);
  const baseSha = git(repo, ["rev-parse", "--verify", `${input.base}^{commit}`]).trim();
  const headSha = input.head ? git(repo, ["rev-parse", "--verify", `${input.head}^{commit}`]).trim() : undefined;
  if (!headSha && !input.run) throw new ChangesError("need a head commit or a run patch");
  const baseTree = addWorktree(repo, baseSha);
  const headTree = addWorktree(repo, headSha ?? baseSha);
  try {
    let diffText: string;
    if (input.run) {
      // the run's patch, applied to its base in the head worktree; written outside the worktree
      const patchDir = mkdtempSync(path.join(tmpdir(), "tracehound-run-patch-"));
      try {
        const patchFile = path.join(patchDir, "run.patch");
        writeFileSync(patchFile, input.run.patch);
        if (input.run.patch.trim()) git(headTree.dir, ["apply", "--whitespace=nowarn", "--binary", patchFile]);
      } finally {
        rmSync(patchDir, { recursive: true, force: true });
      }
      git(headTree.dir, ["add", "-A"]);
      diffText = git(headTree.dir, ["diff", "--cached", "-U0", "--no-renames", baseSha]);
    } else {
      diffText = git(repo, ["diff", "-U0", "--no-renames", baseSha, headSha!]);
    }
    const hunks = parseZeroContextDiff(diffText);
    const configPath = input.configPath;
    const base = analyzeTree(baseTree.dir, "base", configPath);
    const head = analyzeTree(headTree.dir, "head", configPath);
    const result = build(base, head, hunks);
    const changeSet: ChangeSet = {
      schemaVersion: CHANGESET_SCHEMA_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      repo: { name: head.snapshot.repo.name, path: repo },
      base: { ref: input.base, sha: baseSha },
      head: input.run
        ? { run: { runId: input.run.runId, taskId: input.run.taskId, patchSha256: createHash("sha256").update(input.run.patch).digest("hex") } }
        : { ref: input.head!, sha: headSha! },
      ...(configPath && { config: configPath }),
      ...result,
      stats: { ...result.stats, runtimeMs: Math.round(performance.now() - started) },
      limitations: LIMITATIONS,
    };
    return ChangeSet.parse(changeSet);
  } finally {
    baseTree.remove();
    headTree.remove();
  }
}

function build(base: TreeSide, head: TreeSide, hunks: Map<string, FileHunks>): Omit<ChangeSet, "schemaVersion" | "analyzerVersion" | "repo" | "base" | "head" | "config" | "limitations" | "stats"> & { stats: Omit<ChangeSet["stats"], "runtimeMs"> } {
  // ── declarations ────────────────────────────────────────────────────────────────────────
  const ids = new Set([...base.index.decls.keys(), ...head.index.decls.keys()]);
  const all = new Map<string, DeclarationChange>();
  for (const id of ids) {
    const b = base.index.decls.get(id);
    const h = head.index.decls.get(id);
    const d = (h ?? b)!;
    const mods = b && h ? sameParts(b.parts, h.parts) : [];
    if (b && h && b.kind !== h.kind && !mods.includes("signature")) mods.unshift("signature");
    const status: DeclarationChange["status"] = !b ? "added" : !h ? "removed" : mods.length ? "modified" : "unchanged";
    const comp = h ? head.componentOf(h.file) : base.componentOf(b!.file);
    const baseComp = b ? base.componentOf(b.file) : undefined;
    all.set(id, {
      id,
      name: d.name,
      file: d.file,
      kind: d.kind,
      exported: d.exported,
      status,
      ...(comp && { componentId: comp }),
      ...(baseComp && baseComp !== comp && { baseComponentId: baseComp }),
      modifications: status === "modified" ? mods : [],
      lines: { added: h ? linesIn(h, hunks.get(h.file)?.added, head.index) : 0, removed: b ? linesIn(b, hunks.get(b.file)?.removed, base.index) : 0 },
      ...(b && { base: { file: b.file, startLine: b.startLine, endLine: b.endLine } }),
      ...(h && { head: { file: h.file, startLine: h.startLine, endLine: h.endLine } }),
    });
  }
  const changedDecl = (id: string) => (all.get(id)?.status ?? "unchanged") !== "unchanged";

  // ── edges ────────────────────────────────────────────────────────────────────────────────
  const declFile = (id: string) => (id.includes("#") ? id.slice(0, id.indexOf("#")) : undefined);
  const edgeIds = new Set([...base.edges.keys(), ...head.edges.keys()]);
  const edges: EdgeChange[] = [];
  const unchangedEdges: EdgeChange[] = [];
  for (const id of edgeIds) {
    const b = base.edges.get(id);
    const h = head.edges.get(id);
    const e = (h ?? b)!;
    const side = h ? head : base;
    const status: EdgeChange["status"] = !b ? "added" : !h ? "removed" : "unchanged";
    const fromFile = declFile(e.from);
    const toFile = declFile(e.to);
    const crossProcess = e.kind === "produces" || e.kind === "consumes";
    const fromComp = fromFile && side.componentOf(fromFile);
    const toComp = toFile && side.componentOf(toFile);
    const crossComponent = crossProcess || (e.kind === "calls" && !!fromComp && !!toComp && fromComp !== toComp);
    const change: EdgeChange = { id, from: e.from, to: e.to, kind: e.kind, status, crossComponent, crossProcess, evidence: (h ?? b)!.evidence.slice(0, 20) };
    if (status !== "unchanged") edges.push(change);
    else if (changedDecl(e.from) || changedDecl(e.to)) unchangedEdges.push(change);
  }
  edges.push(...unchangedEdges);
  edges.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));

  // ── warnings ─────────────────────────────────────────────────────────────────────────────
  const warnings: ChangeWarning[] = [...queueOrphaned(base, head), ...crossComponentSignature(all, head), ...removedStillReferenced(all, base, head)];

  // ── declarations to list: every change, plus unchanged ones an edge or a warning points at ──
  const referenced = new Set([...edges.flatMap((e) => [e.from, e.to]), ...warnings.flatMap((w) => (w.declarationId ? [w.declarationId] : []))]);
  const declarations = [...all.values()].filter((d) => d.status !== "unchanged" || referenced.has(d.id)).sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));

  // ── files ────────────────────────────────────────────────────────────────────────────────
  const files: FileChange[] = [...hunks.entries()]
    .map(([f, h]) => {
      const comp = h.status === "removed" ? base.componentOf(f) : head.componentOf(f);
      const bc = base.index.callCounts.get(f);
      const hc = head.index.callCounts.get(f);
      return { path: f, status: h.status, linesAdded: h.added.size, linesRemoved: h.removed.size, ...(comp && { componentId: comp }), calls: { ...(bc && { base: bc }), ...(hc && { head: hc }) } };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // ── component rollup ─────────────────────────────────────────────────────────────────────
  const bEdges = new Set(base.snapshot.edges.map((e) => e.id));
  const hEdges = new Set(head.snapshot.edges.map((e) => e.id));
  const compEdgeAdded = head.snapshot.edges.filter((e) => !bEdges.has(e.id));
  const compEdgeRemoved = base.snapshot.edges.filter((e) => !hEdges.has(e.id));
  const name = (id: string) => head.snapshot.components.find((c) => c.id === id)?.name ?? base.snapshot.components.find((c) => c.id === id)?.name ?? id;
  const compOfDecl = (id: string) => all.get(id)?.componentId ?? (declFile(id) ? head.componentOf(declFile(id)!) ?? base.componentOf(declFile(id)!) : undefined);
  const touched = new Set<string>([
    ...declarations.filter((d) => d.status !== "unchanged").flatMap((d) => [d.componentId, d.baseComponentId].filter((x): x is string => !!x)),
    ...edges.filter((e) => e.status !== "unchanged").flatMap((e) => [compOfDecl(e.from), compOfDecl(e.to)].filter((x): x is string => !!x)),
    ...[...compEdgeAdded, ...compEdgeRemoved].flatMap((e) => [e.source, e.target]),
  ]);
  const components: ComponentChange[] = [...touched].sort().map((id) => {
    const decls = declarations.filter((d) => d.componentId === id || d.baseComponentId === id);
    const mine = edges.filter((e) => compOfDecl(e.from) === id || compOfDecl(e.to) === id);
    const count = (status: string, pred: (e: EdgeChange) => boolean) => mine.filter((e) => e.status === status && pred(e)).length;
    return {
      id,
      name: name(id),
      declarations: { added: decls.filter((d) => d.status === "added").length, modified: decls.filter((d) => d.status === "modified").length, removed: decls.filter((d) => d.status === "removed").length },
      edges: {
        crossComponentAdded: count("added", (e) => e.crossComponent),
        crossComponentRemoved: count("removed", (e) => e.crossComponent),
        crossProcessAdded: count("added", (e) => e.crossProcess),
        crossProcessRemoved: count("removed", (e) => e.crossProcess),
      },
      componentEdges: { added: compEdgeAdded.filter((e) => e.source === id || e.target === id).map((e) => e.id), removed: compEdgeRemoved.filter((e) => e.source === id || e.target === id).map((e) => e.id) },
    };
  });

  const sum = (m: Map<string, CallCounts>): CallCounts => [...m.values()].reduce((a, c) => ({ resolved: a.resolved + c.resolved, external: a.external + c.external, dynamic: a.dynamic + c.dynamic }), { resolved: 0, external: 0, dynamic: 0 });
  const statusCount = (s: string) => [...all.values()].filter((d) => d.status === s).length;
  const allEdgeStatuses = [...edgeIds].map((id) => (!base.edges.has(id) ? "added" : !head.edges.has(id) ? "removed" : "unchanged"));
  return {
    components,
    files,
    declarations,
    edges,
    warnings,
    stats: {
      declarations: { added: statusCount("added"), removed: statusCount("removed"), modified: statusCount("modified"), unchanged: statusCount("unchanged") },
      edges: { added: allEdgeStatuses.filter((s) => s === "added").length, removed: allEdgeStatuses.filter((s) => s === "removed").length, unchanged: allEdgeStatuses.filter((s) => s === "unchanged").length },
      files: { added: files.filter((f) => f.status === "added").length, removed: files.filter((f) => f.status === "removed").length, modified: files.filter((f) => f.status === "modified").length },
      calls: { base: sum(base.index.callCounts), head: sum(head.index.callCounts) },
    },
  };
}

// ── warning rules ────────────────────────────────────────────────────────────────────────────

const RULE_QUEUE = "A queue that had both a producer and a consumer at base has only one side at head.";
function queueOrphaned(base: TreeSide, head: TreeSide): ChangeWarning[] {
  const sides = (t: TreeSide) => {
    const m = new Map<string, { producers: EdgeChange["evidence"]; consumers: EdgeChange["evidence"] }>();
    for (const e of t.edges.values()) {
      if (e.kind !== "produces" && e.kind !== "consumes") continue;
      const q = e.kind === "produces" ? e.to : e.from;
      const s = m.get(q) ?? { producers: [], consumers: [] };
      (e.kind === "produces" ? s.producers : s.consumers).push(...e.evidence);
      m.set(q, s);
    }
    return m;
  };
  const b = sides(base);
  const h = sides(head);
  const out: ChangeWarning[] = [];
  for (const [queue, was] of b) {
    if (!was.producers.length || !was.consumers.length) continue;
    const now = h.get(queue) ?? { producers: [], consumers: [] };
    const lost = !now.consumers.length && now.producers.length ? "consumer" : !now.producers.length && now.consumers.length ? "producer" : undefined;
    if (!lost) continue;
    const remaining = lost === "consumer" ? now.producers : now.consumers;
    const gone = lost === "consumer" ? was.consumers : was.producers;
    out.push({
      id: `queue-orphaned-by-diff:${queue}`,
      kind: "queue-orphaned-by-diff",
      rule: RULE_QUEUE,
      message: `${queue.replace(/^queue:/, "")} lost its last ${lost}: at head it has ${remaining.length} ${lost === "consumer" ? "producer" : "consumer"} call site(s) and no ${lost}`,
      evidence: [
        ...remaining.map((e) => ({ side: "head" as const, file: e.file, line: e.line, detail: `remaining ${lost === "consumer" ? "producer" : "consumer"} (${e.extractor})` })),
        ...gone.map((e) => ({ side: "base" as const, file: e.file, line: e.line, detail: `${lost} at base, gone at head (${e.extractor})` })),
      ],
    });
  }
  return out;
}

const RULE_SIGNATURE = "A declaration whose signature or annotated return type changed has callers (at head) in other components.";
function crossComponentSignature(all: Map<string, DeclarationChange>, head: TreeSide): ChangeWarning[] {
  const out: ChangeWarning[] = [];
  for (const d of all.values()) {
    if (d.status !== "modified" || !d.modifications.some((m) => m === "signature" || m === "returnType")) continue;
    const callers = head.index.calls.filter((c) => c.to === d.id && c.from !== d.id && head.componentOf(c.file) && head.componentOf(c.file) !== d.componentId);
    if (!callers.length) continue;
    out.push({
      id: `cross-component-signature-change:${d.id}`,
      kind: "cross-component-signature-change",
      rule: RULE_SIGNATURE,
      declarationId: d.id,
      message: `${d.id} changed its ${d.modifications.filter((m) => m === "signature" || m === "returnType").join(" and ")}; ${callers.length} call site(s) in ${[...new Set(callers.map((c) => head.componentOf(c.file)))].join(", ")} call it`,
      evidence: callers.map((c) => ({ side: "head", file: c.file, line: c.line, detail: `${c.from} calls ${c.detail} (component ${head.componentOf(c.file)})` })),
    });
  }
  return out;
}

const RULE_REMOVED = "A declaration removed by the diff is still referenced at head (an import of it, an unresolved use of its name, or a member access on its class).";
function removedStillReferenced(all: Map<string, DeclarationChange>, base: TreeSide, head: TreeSide): ChangeWarning[] {
  const out: ChangeWarning[] = [];
  const diagnostics = new Map<string, { start: number; end: number }[]>();
  const caught = (sf: SourceFile, node: Node) => {
    const f = sf.getFilePath();
    if (!diagnostics.has(f)) diagnostics.set(f, sf.getPreEmitDiagnostics().map((d) => ({ start: d.getStart() ?? -1, end: (d.getStart() ?? -1) + (d.getLength() ?? 0) })));
    return diagnostics.get(f)!.some((d) => d.start <= node.getEnd() && d.end >= node.getStart());
  };
  const resolves = (fromFile: string, spec: string, target: string) => {
    if (!spec.startsWith(".")) return false;
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec)).replace(/\.(js|mjs|cjs|jsx)$/, "");
    return [joined, `${joined}.ts`, `${joined}.tsx`, `${joined}/index.ts`, `${joined}/index.tsx`].includes(target) || joined === target.replace(/\.(ts|tsx|mts|cts)$/, "");
  };
  for (const d of all.values()) {
    if (d.status !== "removed" || d.kind === "module" || d.kind === "route-handler") continue;
    const refs: ChangeWarning["evidence"] = [];
    let allCaught = true;
    const note = (sf: SourceFile, file: string, node: Node, detail: string) => {
      const c = caught(sf, node);
      allCaught &&= c;
      refs.push({ side: "head", file, line: node.getStartLineNumber(), detail: `${detail}${c ? " (tsc reports an error here)" : ""}` });
    };
    const member = d.kind === "method" || d.kind === "property";
    const [className, memberName] = member ? d.name.split(".") as [string, string] : [undefined, undefined];
    for (const [file, sf] of head.sourceFiles) {
      if (!member) {
        for (const imp of sf.getImportDeclarations()) {
          if (!resolves(file, imp.getModuleSpecifierValue(), d.file)) continue;
          const named = imp.getNamedImports().find((n) => n.getName() === d.name);
          const def = d.name === "default" && imp.getDefaultImport();
          if (named) note(sf, file, named, `imports ${d.name} from ${imp.getModuleSpecifierValue()}`);
          else if (def) note(sf, file, def, `imports the default export of ${imp.getModuleSpecifierValue()}`);
        }
        if (file === d.file) {
          for (const ident of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
            if (ident.getText() !== d.name || ident.getSymbol()?.getDeclarations().length) continue;
            const parent = ident.getParent();
            if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ident) continue;
            note(sf, file, ident, `uses ${d.name}, which no longer resolves`);
          }
        }
      } else {
        for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
          if (pa.getName() !== memberName || pa.getNameNode().getSymbol()) continue;
          const typeSymbol = pa.getExpression().getType().getSymbol();
          if (typeSymbol?.getName() !== className) continue;
          const declFile = typeSymbol.getDeclarations()[0]?.getSourceFile().getFilePath();
          if (!declFile || relPath(head.root, declFile) !== d.file) continue;
          note(sf, file, pa.getNameNode(), `accesses ${className}.${memberName}, which no longer exists`);
        }
      }
    }
    if (!refs.length) continue;
    out.push({
      id: `removed-declaration-still-referenced:${d.id}`,
      kind: "removed-declaration-still-referenced",
      rule: RULE_REMOVED,
      declarationId: d.id,
      message: `${d.id} was removed but ${refs.length} reference(s) remain at head${allCaught ? " - also caught by typecheck" : ""}`,
      evidence: [...refs, ...(all.get(d.id)?.base ? [{ side: "base" as const, file: d.file, line: all.get(d.id)!.base!.startLine, detail: "the removed declaration" }] : [])],
      alsoCaughtByTypecheck: allCaught,
    });
  }
  void base;
  return out;
}
