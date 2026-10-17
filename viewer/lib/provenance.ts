import { githubSlug } from "./github";
import type { Snapshot } from "./types";

export function provenanceLabel(repo: Snapshot["repo"]): string {
  // Preserve the calendar date recorded by git, independent of the viewer's timezone.
  const date = repo.commitDate && new Date(`${repo.commitDate.slice(0, 10)}T00:00:00Z`);
  const stamp = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
    : undefined;
  return `${repo.branch ?? "commit"} @ ${repo.commitSha.slice(0, 7)}${stamp ? ` · ${stamp}` : ""}`;
}

export function commitHref(repo: Snapshot["repo"]): string | undefined {
  const slug = githubSlug(repo);
  return slug ? `https://github.com/${slug}/commit/${repo.commitSha}` : undefined;
}
