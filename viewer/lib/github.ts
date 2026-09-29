import type { Snapshot } from "./types";

/** "https://github.com/acme/shop.git" → "acme/shop"; undefined when the repo isn't on GitHub. */
export function githubSlug(repo: Snapshot["repo"]): string | undefined {
  const match = repo.url && /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(repo.url);
  return match ? match[1] : undefined;
}

/** Permalink to a file range at the analyzed commit. */
export function permalink(repo: Snapshot["repo"], file: string, startLine?: number, endLine?: number): string | undefined {
  const slug = githubSlug(repo);
  if (!slug) return undefined;
  const lines = startLine ? `#L${startLine}${endLine && endLine !== startLine ? `-L${endLine}` : ""}` : "";
  return `https://github.com/${slug}/blob/${repo.commitSha}/${file.split("/").map(encodeURIComponent).join("/")}${lines}`;
}
