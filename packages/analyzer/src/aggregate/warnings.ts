import type { FileFacts, Warning } from "../schema.ts";

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
