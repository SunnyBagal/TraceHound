import type { Evidence, FileFacts, Warning } from "../schema.ts";

// Loaded by the runtime or tooling rather than imported: never orphans.
const NOT_IMPORTED_BY_DESIGN = [/\.d\.ts$/, /(^|\/)[^/]+\.config\.[cm]?[jt]s$/];

/**
 * Source files no other file imports and that aren't package entry points. They can't be reached
 * at runtime through the module graph, so they're usually dead code or unfinished wiring.
 */
export function orphanWarnings(files: FileFacts[], fileToComponent: Map<string, string>): Warning[] {
  const imported = new Set(files.flatMap((f) => f.imports.flatMap((i) => (i.target && i.target !== f.path ? [i.target] : []))));
  return files
    .filter((f) => f.language === "ts" && !f.isEntry && !imported.has(f.path) && !NOT_IMPORTED_BY_DESIGN.some((re) => re.test(f.path)))
    .map((f) => ({
      id: `orphan-file:${f.path}`,
      kind: "orphan-file" as const,
      severity: "warning" as const,
      file: f.path,
      componentId: fileToComponent.get(f.path),
      message: `${f.path} is not imported by any file and is not an entry point${
        f.symbols.some((s) => s.exported) ? ` (exports ${f.symbols.filter((s) => s.exported).length} symbols nobody uses)` : ""
      }`,
    }));
}

/**
 * BullMQ (decision 035): nothing the detector found is dropped silently. A producer whose queue
 * has no consumer anywhere (or the reverse), a queue name that isn't static (so it has no node
 * and no edge), a defined queue nobody uses, and constructs the detector doesn't model all
 * become warnings, each pointing at its evidence.
 */
export function queueWarnings(files: FileFacts[], fileToComponent: Map<string, string>, evidence: Map<string, Evidence>): Warning[] {
  const ops = files.flatMap((f) => (f.queueOps ?? []).map((op) => ({ f, op })));
  const at = (id: string) => {
    const e = evidence.get(id);
    return e ? `${e.file}:${e.range.startLine}` : id;
  };
  const warn = (kind: Warning["kind"], f: FileFacts, evidenceId: string, message: string): Warning => ({
    id: `${kind}:${evidenceId}`,
    kind,
    severity: "warning",
    file: f.path,
    componentId: fileToComponent.get(f.path),
    message,
  });
  const byName = (role: string, name: string) => ops.filter(({ op }) => op.role === role && op.queue?.value === name);
  const out: Warning[] = [];
  for (const { f, op } of ops) {
    const name = op.queue?.value;
    if (op.role === "unsupported") {
      out.push(warn("queue-unsupported", f, op.evidenceId, `BullMQ ${op.construct} at ${at(op.evidenceId)} is not modeled by the bullmq-queues detector; no edge drawn for it`));
      continue;
    }
    if (name === undefined) {
      const what = op.role === "produce" && !op.queue ? (op.construct ?? `${op.variable}.add(…) on a Queue whose definition isn't resolvable`) : `queue name ${op.queue?.raw || "(missing)"}`;
      const why = op.role === "produce" && !op.queue && op.construct ? "; its queue isn't known" : " is not static";
      out.push(warn("queue-unresolved", f, op.evidenceId, `BullMQ ${op.role} at ${at(op.evidenceId)}: ${what}${why}, so it can't be paired; no node, no edge`));
      continue;
    }
    if (op.role === "produce" && byName("consume", name).length === 0)
      out.push(warn("queue-unpaired", f, op.evidenceId, `BullMQ producer at ${at(op.evidenceId)} adds to queue "${name}", but no Worker consumes "${name}" in this repo`));
    if (op.role === "consume" && byName("produce", name).length === 0)
      out.push(warn("queue-unpaired", f, op.evidenceId, `BullMQ Worker at ${at(op.evidenceId)} consumes queue "${name}", but nothing in this repo adds to "${name}"`));
    if (op.role === "define" && byName("produce", name).length === 0 && byName("consume", name).length === 0)
      out.push(warn("queue-unpaired", f, op.evidenceId, `BullMQ queue "${name}" defined at ${at(op.evidenceId)} has no producer and no consumer in this repo`));
  }
  return out;
}
