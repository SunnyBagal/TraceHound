// ReviewBench's side of the adapter (spike cc-02, docs/bench/reviewbench-spike.md). Every shape in
// this file is UNVERIFIED: the spike session could not read review-bench/ReviewBench itself (its
// GitHub access was scoped to this repo), so the field names come from secondary sources quoted in
// the spike doc. Check each one against the repo's corpus manifest, docs/OFFLINE_EVAL.md and
// scripts/try-agent.sh before a run; nothing outside this file should need to change when they move.

/** One corpus manifest entry: a pull request pinned to two commits in its review-bench mirror. */
export interface RbTask {
  id: string;
  /** upstream `owner/name` */
  repo: string;
  pr_number: number;
  base: string;
  head: string;
  title?: string;
  body?: string;
  language?: string;
}

/** One finding as the judge reads it: "{file, start_line, end_line, message}" (spike doc, source 4). */
export interface RbFinding {
  file: string;
  start_line: number;
  end_line: number;
  message: string;
}

/** The mirror that holds a task's base and head commits: `review-bench/<owner>_<repo>`. */
export const MIRROR_ORG = "review-bench";
export function mirrorUrl(repo: string): string {
  return `https://github.com/${MIRROR_ORG}/${repo.replace("/", "_")}.git`;
}

/** One findings file per task under the run's `findings/` directory, which `npm run judge --candidate` reads. */
export function findingsFileName(task: RbTask): string {
  return `${task.id}.json`;
}

const SHA = /^[0-9a-f]{7,64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function text(entry: Record<string, unknown>, key: string): string | undefined {
  const value = entry[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`task field ${key} is not a string`);
  return value;
}

/**
 * A manifest entry → RbTask. Accepts the field names seen so far (`base`/`head`, with
 * `base_sha`/`head_sha` as fallbacks) and derives `id` as `<owner>_<repo>-<pr_number>` when the
 * entry has none. Throws on anything it cannot use rather than guessing.
 */
export function parseTask(value: unknown): RbTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("task is not an object");
  const entry = value as Record<string, unknown>;
  const repo = text(entry, "repo");
  if (!repo || !REPO.test(repo)) throw new Error("task repo must be owner/name");
  const pr = entry.pr_number;
  if (typeof pr !== "number" || !Number.isSafeInteger(pr) || pr <= 0) throw new Error("task pr_number must be a positive integer");
  const base = text(entry, "base") ?? text(entry, "base_sha");
  const head = text(entry, "head") ?? text(entry, "head_sha");
  if (!base || !SHA.test(base) || !head || !SHA.test(head)) throw new Error("task base and head must be commit shas");
  const id = text(entry, "id") ?? `${repo.replace("/", "_")}-${pr}`;
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error("task id must be a safe file name");
  const title = text(entry, "title");
  const body = text(entry, "body") ?? text(entry, "description");
  const language = text(entry, "language");
  return {
    id, repo, pr_number: pr, base, head,
    ...(title !== undefined && { title }),
    ...(body !== undefined && { body }),
    ...(language !== undefined && { language }),
  };
}

/** A manifest file: a bare array of entries, or `{ tasks: [...] }`. Duplicate ids are an error. */
export function parseManifest(value: unknown): RbTask[] {
  const entries = Array.isArray(value) ? value
    : value && typeof value === "object" && Array.isArray((value as { tasks?: unknown }).tasks) ? (value as { tasks: unknown[] }).tasks
      : null;
  if (!entries) throw new Error("manifest must be an array of tasks or { tasks: [...] }");
  const tasks = entries.map(parseTask);
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`duplicate task id ${task.id}`);
    ids.add(task.id);
  }
  return tasks;
}
