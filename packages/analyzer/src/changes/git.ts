// Git plumbing for change sets: temporary worktrees and zero-context hunks. Every git call drops
// GIT_DIR & co. (decision 032), so a hook or `rebase --exec` can't point it at another repo.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnv } from "../git-env.ts";

export class ChangesError extends Error {
  override name = "ChangesError";
}

export function git(repo: string, args: string[], input?: string): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: cleanGitEnv(), maxBuffer: 256 * 1024 * 1024, ...(input !== undefined && { input }), stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new ChangesError(`git ${args.join(" ")} failed in ${repo}${stderr ? `: ${stderr}` : ""}`);
  }
}

/** A detached worktree of `sha` in a temp dir; `remove()` deletes it and prunes the registration. */
export function addWorktree(repo: string, sha: string): { dir: string; remove(): void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-changes-"));
  git(repo, ["worktree", "add", "--quiet", "--detach", "--force", dir, sha]);
  return {
    dir,
    remove() {
      try {
        git(repo, ["worktree", "remove", "--force", dir]);
      } catch {
        rmSync(dir, { recursive: true, force: true });
        git(repo, ["worktree", "prune"]);
      }
    },
  };
}

export interface FileHunks {
  status: "added" | "removed" | "modified";
  removed: Set<number>; // base line numbers removed or changed
  added: Set<number>; // head line numbers added or changed
}

/** Parse `git diff -U0 --no-renames` output: per file, the changed line numbers on each side. */
export function parseZeroContextDiff(diff: string): Map<string, FileHunks> {
  const files = new Map<string, FileHunks>();
  let current: FileHunks | undefined;
  for (const line of diff.split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      current = { status: "modified", removed: new Set(), added: new Set() };
      files.set(header[2]!, current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "removed";
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      const [oldStart, oldLen, newStart, newLen] = [Number(hunk[1]), hunk[2] === undefined ? 1 : Number(hunk[2]), Number(hunk[3]), hunk[4] === undefined ? 1 : Number(hunk[4])];
      for (let i = 0; i < oldLen; i++) current.removed.add(oldStart + i);
      for (let i = 0; i < newLen; i++) current.added.add(newStart + i);
    }
  }
  return files;
}
