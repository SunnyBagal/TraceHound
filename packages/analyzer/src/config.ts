import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ComponentKind } from "./schema.ts";

export const CONFIG_FILE = "tracehound.json";

// The key becomes the component id verbatim, so it must be stable and URL-safe.
const ComponentId = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/, "component ids are lowercase slugs, e.g. redis-rpc-bridge");

const OverrideSpec = z.union([
  z.array(z.string()).min(1),
  z
    .object({
      name: z.string().min(1).optional(),
      kind: ComponentKind.optional(),
      /** pinned files; without them the entry only renames (or drops the summary of) the component with this id */
      files: z.array(z.string()).min(1).optional(),
      /** false: drop the model-written summary (a wrong one is dropped, never replaced by hand) */
      summary: z.literal(false).optional(),
    })
    .strict()
    .refine((o) => o.files || o.name || o.summary === false, "an override needs files, a name, or summary: false")
    .refine((o) => !o.kind || o.files, "kind can only be set together with files"),
]);

export const TraceHoundConfig = z
  .object({
    $schema: z.string().optional(),
    /** component id → repo-relative file globs (or { name, kind, files }). Overrides win over heuristics. */
    components: z.record(ComponentId, OverrideSpec).default({}),
    /** 0.7.0+: repo-relative globs left out of the analysis; listed in the snapshot's `ignored`. */
    ignore: z.array(z.string().min(1)).default([]),
    /** 0.7.0+: repo-relative globs of process entry points that no package.json names (e.g. a Vite main.tsx). */
    entryPoints: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type TraceHoundConfig = z.infer<typeof TraceHoundConfig>;

export interface ComponentOverride {
  id: string;
  name?: string;
  kind?: ComponentKind;
  globs: string[];
}

/** Overrides that pin files (grouping input). Entries without files are labels; see componentLabels. */
export function normalizeOverrides(config: TraceHoundConfig): ComponentOverride[] {
  return Object.entries(config.components).flatMap(([id, spec]) =>
    Array.isArray(spec) ? [{ id, globs: spec }] : spec.files ? [{ id, name: spec.name, kind: spec.kind, globs: spec.files }] : [],
  );
}

/** Applied after grouping by component id: a name (entries without files) and/or `summary: false`. */
export interface ComponentLabel {
  id: string;
  name?: string;
  dropSummary: boolean;
}
export function componentLabels(config: TraceHoundConfig): ComponentLabel[] {
  return Object.entries(config.components).flatMap(([id, spec]) =>
    !Array.isArray(spec) && (!spec.files || spec.summary === false) ? [{ id, name: spec.files ? undefined : spec.name, dropSummary: spec.summary === false }] : [],
  );
}

/** Explicit `--config` path, else `<repo>/tracehound.json`, else no overrides. */
export function loadConfig(repoRoot: string, explicitPath?: string): { config: TraceHoundConfig; source?: string } {
  const file = explicitPath ? path.resolve(explicitPath) : path.join(repoRoot, CONFIG_FILE);
  if (!existsSync(file)) {
    if (explicitPath) throw new Error(`config not found: ${file}`);
    return { config: TraceHoundConfig.parse({}) };
  }
  const parsed = TraceHoundConfig.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`invalid ${file}:\n${z.prettifyError(parsed.error)}`);
  return { config: parsed.data, source: file };
}
