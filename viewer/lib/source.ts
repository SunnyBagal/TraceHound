import { githubSlug } from "./github";
import type { Evidence, Snapshot } from "./types";

export function fileEvidence(snapshot: Snapshot, file: string): Evidence | undefined {
  return snapshot.evidence.find((e) => e.file === file && e.snippet.lines.length > 0);
}

/** Use a known declaration range; route registrations can refer to named handlers. */
export function declarationRange(snapshot: Snapshot, file: string, evidence?: Evidence) {
  const facts = snapshot.files.find((f) => f.path === file);
  const route = facts?.routes.find((r) => r.evidenceId === evidence?.id);
  const symbol = facts?.symbols.find((s) => s.name === evidence?.symbol || route?.handlers.includes(s.name));
  return symbol?.range ?? (route && evidence && evidence.range.endLine > evidence.range.startLine ? evidence.range : undefined);
}

export function sourceWindow(text: string, evidence?: Evidence, declaration?: { startLine: number; endLine: number }) {
  const all = text.split(/\r?\n/);
  const startLine = Math.max(1, declaration?.startLine ?? (evidence?.range.startLine ?? 1) - 30);
  const endLine = Math.min(all.length, declaration?.endLine ?? (evidence?.range.endLine ?? 1) + 30);
  return { startLine, lines: all.slice(startLine - 1, endLine) };
}

const files = new Map<string, Promise<string>>();
export function fetchSource(repo: Snapshot["repo"], file: string): Promise<string> {
  const slug = githubSlug(repo);
  if (!slug) return Promise.reject(new Error("Source unavailable"));
  const url = `https://raw.githubusercontent.com/${slug}/${repo.commitSha}/${file.split("/").map(encodeURIComponent).join("/")}`;
  let result = files.get(url);
  if (!result) {
    result = fetch(url, { signal: AbortSignal.timeout(10000) }).then((res) => {
      if (!res.ok) throw new Error("Source unavailable");
      return res.text();
    });
    files.set(url, result);
  }
  return result;
}
