// Repair task spec: eval/tasks/<id>/task.json (decision 026). Relative paths resolve against the
// task directory. The repro test lives next to task.json, never in the target repo.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const Sha = z.string().regex(/^[0-9a-f]{40}$/, "full 40-char commit SHA");

export const TaskSpec = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** gitUrl: cloned on the host, then copied in. localPath: a git repo on disk (test fixtures only). */
  source: z.union([z.object({ gitUrl: z.string().min(1) }).strict(), z.object({ localPath: z.string().min(1) }).strict()]),
  baseSha: Sha, // the buggy commit
  image: z.string().optional(), // default: the pinned sandbox image
  setup: z.array(z.string()).default([]), // run in /work after checkout; each must exit 0
  issue: z.string().min(1),
  repro: z.object({
    testFile: z.string(), // relative to the task dir; copied in only while REPRODUCING / VERIFYING
    dest: z.string(), // where it goes inside the repo
    command: z.string(), // must fail at baseSha, pass after the fix
  }),
  regression: z.array(z.string()).default([]),
  typecheck: z.object({ packages: z.array(z.string()).min(1), command: z.string().default("tsc --noEmit") }).optional(),
  limits: z.object({
    steps: z.number().int().positive(), // provider operations the agent may make
    wallClockMs: z.number().int().positive(), // from create; exceeded in PATCHING = budget exhausted, before it = FAILED
    tokens: z.number().int().nonnegative(), // model tokens the agent may use, counted by the harness from API usage
    commandTimeoutMs: z.number().int().positive().default(120_000), // per harness/agent command
  }),
});
export type TaskSpec = z.infer<typeof TaskSpec>;

export interface LoadedTask {
  spec: TaskSpec;
  dir: string;
  reproContent: string;
  localPath?: string; // resolved
}

export function loadTask(file: string): LoadedTask {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`task file ${abs} does not exist`);
  const dir = path.dirname(abs);
  const spec = TaskSpec.parse(JSON.parse(readFileSync(abs, "utf8")));
  const reproFile = path.resolve(dir, spec.repro.testFile);
  if (!existsSync(reproFile)) throw new Error(`repro test ${reproFile} does not exist`);
  if (path.isAbsolute(spec.repro.dest) || spec.repro.dest.split("/").includes("..")) throw new Error(`repro.dest must be a path inside the repo: ${spec.repro.dest}`);
  const localPath = "localPath" in spec.source ? path.resolve(dir, spec.source.localPath) : undefined;
  return { spec, dir, reproContent: readFileSync(reproFile, "utf8"), localPath };
}
