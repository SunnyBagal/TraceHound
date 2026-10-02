// Git plumbing for change sets: temporary worktrees and zero-context hunks. Every git call drops
// GIT_DIR & co. (decision 032), so a hook or `rebase --exec` can't point it at another repo.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
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

/**
 * Link every node_modules of the source checkout (repo root and each direct subdirectory, i.e.
 * workspace packages) into a worktree, so package and runtime types resolve as they do in the
 * checkout. Symlinks to the checkout's own directories: nothing is installed or written. Both sides
 * of a diff see the checkout's dependencies, which may differ from what base or head declare.
 * Returns the repo-relative paths linked.
 */
export function linkNodeModules(repo: string, worktree: string): string[] {
  const linked: string[] = [];
  const dirs = [".", ...readdirSync(repo, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules").map((d) => d.name)];
  for (const dir of dirs) {
    const source = path.join(repo, dir, "node_modules");
    const target = path.join(worktree, dir, "node_modules");
    if (!existsSync(source) || !existsSync(path.join(worktree, dir)) || existsSync(target)) continue;
    if (!lstatSync(source).isDirectory() && !lstatSync(source).isSymbolicLink()) continue;
    symlinkSync(source, target, "dir");
    linked.push(path.posix.join(dir, "node_modules").replace(/^\.\//, ""));
  }
  return linked;
}
