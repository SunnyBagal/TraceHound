// The two trees of a pull request for the contracts stages (contracts-v1): a worktree at the merge
// base of base and head, one at head, and what the diff edited. No model, no network; every git
// call goes through changes/git.ts, which drops GIT_DIR & co. (decision 032).
import { readFileSync } from "node:fs";
import path from "node:path";
import { addWorktree, git, linkNodeModules } from "../changes/git.ts";

export interface Hunk {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  removed: string[]; // base lines oldStart.. (text, without the leading "-")
  added: string[]; // head lines newStart..
}

export interface FileDiff {
  path: string; // head path (base path for a deleted file); renames are a delete plus an add (--no-renames)
  status: "added" | "deleted" | "modified";
  binary: boolean;
  hunks: Hunk[];
}

export interface Trees {
  repo: string;
  baseSha: string; // the merge base of base and head
  headSha: string;
  base: string; // worktree directories
  head: string;
  /** Every path the diff touches, at either side (a rename counts both paths). */
  edited: Set<string>;
  /** -M rename detection, base path → head path; used only to match diagnostics across a rename. */
  renames: Map<string, string>;
  files: Map<string, FileDiff>;
  nodeModules: string[];
  /** Line `line` (1-based) of `file` at `side`, or "" when the file or line is missing. */
  lineText(side: "base" | "head", file: string, line: number): string;
  close(): void;
}

export function resolveCommit(repo: string, ref: string): string {
  return git(repo, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

/** Parse `git diff -U0 --no-renames` with line text: per file, its hunks. */
export function parseDiff(diff: string): Map<string, FileDiff> {
  const files = new Map<string, FileDiff>();
  let current: FileDiff | undefined;
  let hunk: Hunk | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      hunk = undefined;
      current = undefined; // a quoted (unusual) path is skipped rather than merged into the previous file
      if (!header) continue;
      current = { path: header[2]!, status: "modified", binary: false, hunks: [] };
      files.set(current.path, current);
      continue;
    }
    if (!current) continue;
    if (!hunk) {
      if (line.startsWith("new file mode")) current.status = "added";
      else if (line.startsWith("deleted file mode")) current.status = "deleted";
      else if (line.startsWith("Binary files ")) current.binary = true;
    }
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (h) {
      hunk = { oldStart: Number(h[1]), oldLen: h[2] === undefined ? 1 : Number(h[2]), newStart: Number(h[3]), newLen: h[4] === undefined ? 1 : Number(h[4]), removed: [], added: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("-")) hunk.removed.push(line.slice(1));
    else if (line.startsWith("+")) hunk.added.push(line.slice(1));
  }
  return files;
}

/** Where a base line sits at head: shifted past earlier hunks, undefined when the diff removed or changed it. */
export function mapBaseLine(diff: FileDiff | undefined, baseLine: number): number | undefined {
  if (!diff) return baseLine;
  let delta = 0;
  for (const h of diff.hunks) {
    if (h.oldLen === 0) {
      // a pure insertion after base line oldStart
      if (baseLine <= h.oldStart) break;
      delta += h.newLen;
      continue;
    }
    if (baseLine < h.oldStart) break;
    if (baseLine < h.oldStart + h.oldLen) return undefined;
    delta += h.newLen - h.oldLen;
  }
  return baseLine + delta;
}

/** Worktrees at merge-base(base, head) and head, plus the diff between them. `close()` removes both. */
export function openTrees(repoInput: string, baseRef: string, headRef: string): Trees {
  const repo = path.resolve(repoInput);
  const headSha = resolveCommit(repo, headRef);
  const baseSha = git(repo, ["merge-base", resolveCommit(repo, baseRef), headSha]).trim();
  const files = parseDiff(git(repo, ["-c", "core.quotePath=false", "diff", "-U0", "--no-renames", "--no-color", "--no-ext-diff", baseSha, headSha]));
  const edited = new Set(files.keys());
  const renames = new Map<string, string>();
  for (const line of git(repo, ["-c", "core.quotePath=false", "diff", "--name-status", "-M", "--no-color", baseSha, headSha]).split("\n")) {
    const [code, from, to] = line.split("\t");
    if (code?.startsWith("R") && from && to) renames.set(from, to);
  }
  const baseTree = addWorktree(repo, baseSha);
  let headTree: ReturnType<typeof addWorktree> | undefined;
  try {
    headTree = addWorktree(repo, headSha);
    const nodeModules = [...new Set([...linkNodeModules(repo, baseTree.dir), ...linkNodeModules(repo, headTree.dir)])].sort();
    const cache = new Map<string, string[] | null>();
    const ht = headTree;
    return {
      repo,
      baseSha,
      headSha,
      base: baseTree.dir,
      head: ht.dir,
      edited,
      renames,
      files,
      nodeModules,
      lineText(side, file, line) {
        const key = `${side}:${file}`;
        if (!cache.has(key)) {
          try {
            cache.set(key, readFileSync(path.join(side === "base" ? baseTree.dir : ht.dir, file), "utf8").split(/\r?\n/));
          } catch {
            cache.set(key, null);
          }
        }
        return cache.get(key)?.[line - 1] ?? "";
      },
      close() {
        ht.remove();
        baseTree.remove();
      },
    };
  } catch (error) {
    headTree?.remove();
    baseTree.remove();
    throw error;
  }
}
