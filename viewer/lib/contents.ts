import type { Component, Snapshot } from "./types";

export interface ContentItem { label: string; method?: string; detail?: string }
export function nodeContents(snapshot: Snapshot, component: Component): ContentItem[] {
  const files = snapshot.files.filter((f) => component.files.includes(f.path));
  const named = (id: string) => snapshot.components.find((c) => c.id === id)?.name ?? id;
  if (component.kind === "api") return component.routes.map((r) => ({ method: r.method, label: r.path }));
  if (component.kind === "queue") return snapshot.edges.flatMap((e) => {
    if (e.kind === "produces" && e.target === component.id) return [{ label: named(e.source), detail: "Producer" }];
    if (e.kind === "consumes" && e.source === component.id) return [{ label: named(e.target), detail: "Consumer" }];
    return [];
  });
  if (component.kind === "worker") return [...new Set(files.flatMap((f) => (f.queueOps ?? []).filter((op) => op.role === "consume" && op.handler).map((op) => op.handler!)))].map((label) => ({ label, detail: "Processor" }));
  if (component.kind === "db") return (component.resource?.models ?? []).map((label) => ({ label, detail: "Model" }));
  if (component.kind === "cache") return (component.resource?.keys ?? []).map((label) => ({ label, detail: "Key" }));
  const exports = files.flatMap((f) => f.symbols.filter((s) => s.exported).map((s) => ({ label: s.name, detail: s.kind })));
  return exports.length ? exports : component.entryPoints.map((e) => ({ label: e.file, detail: "Entry file" }));
}

export const METHOD_COLORS: Record<string, string> = {
  GET: "#79df9c", POST: "#7cc4ff", PUT: "#f2c15c", PATCH: "#c4b5fd", DELETE: "#ff918b", OPTIONS: "#a6b1c8", HEAD: "#5ed6c3", ALL: "#f5a6d7",
};

export function expandedHeight(items: ContentItem[]): number {
  return 136 + Math.max(1, Math.min(items.length, 8)) * 32 + (items.length > 8 ? 36 : 12);
}
