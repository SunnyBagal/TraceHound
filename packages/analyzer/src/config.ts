import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ComponentKind } from "./schema.ts";

export const CONFIG_FILE = "tracehound.json";

// The key becomes the component id verbatim, so it must be stable and URL-safe.
const ComponentId = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/, "component ids are lowercase slugs, e.g. redis-rpc-bridge");

const OverrideSpec = z.union([
  z.array(z.string()).min(1),
  z.object({ name: z.string().min(1).optional(), kind: ComponentKind.optional(), files: z.array(z.string()).min(1) }).strict(),
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

export function normalizeOverrides(config: TraceHoundConfig): ComponentOverride[] {
  return Object.entries(config.components).map(([id, spec]) =>
    Array.isArray(spec) ? { id, globs: spec } : { id, name: spec.name, kind: spec.kind, globs: spec.files },
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
