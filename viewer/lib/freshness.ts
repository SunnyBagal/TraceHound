import { githubSlug } from "./github";
import type { Snapshot } from "./types";

// A single promise (including failures) per page, shared across remounts and Strict Mode.
let request: { key: string; result: Promise<number | undefined> } | undefined;
export function commitsBehindMain(repo: Snapshot["repo"]): Promise<number | undefined> {
  const slug = githubSlug(repo);
  if (!slug) return Promise.resolve(undefined);
  const key = `${slug}/${repo.commitSha}`;
  if (request) return request.key === key ? request.result : Promise.resolve(undefined);
  const result = fetch(`https://api.github.com/repos/${slug}/compare/${repo.commitSha}...main`, {
    signal: AbortSignal.timeout(5000), headers: { Accept: "application/vnd.github+json" },
  }).then(async (response) => {
    if (!response.ok) return undefined;
    const data = await response.json();
    return Number.isSafeInteger(data.ahead_by) && data.ahead_by >= 0 ? data.ahead_by as number : undefined;
  }).catch(() => undefined);
  request = { key, result };
  return result;
}
