import { posix } from "node:path";
import type { DiffFile, Hunk } from "../review/diff.ts";

export type PrefilterRule = "lockfile" | "generated" | "snapshot" | "binary" | "whitespace" | "config-ignore";
export interface PrefilterOptions {
  /** tracehound.json review.ignore, relative to the repository root. */
  ignore?: readonly string[];
}
export interface PrefilterResult {
  kept: DiffFile[];
  /** Whitespace entries describe removed hunks; the file itself remains in kept. */
  dropped: { path: string; rule: PrefilterRule }[];
}

const lockfiles = new Set([
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb",
  "Cargo.lock", "poetry.lock", "Gemfile.lock", "go.sum", "composer.lock",
]);

function whitespaceOnly(hunk: Hunk): boolean {
  const lines = hunk.text.trimEnd().split("\n").slice(1);
  const added = lines.filter((line) => line.startsWith("+"));
  const removed = lines.filter((line) => line.startsWith("-"));
  const strip = (items: string[]) => items.map((line) => line.slice(1)).join("\n").replace(/\s/g, "");
  return added.length + removed.length > 0 && strip(added) === strip(removed);
}

/** Pure S1 filter. Input objects are never mutated; retained hunk coordinates stay unchanged. */
export function prefilterDiff(files: readonly DiffFile[], options: PrefilterOptions = {}): PrefilterResult {
  const kept: DiffFile[] = [];
  const dropped: PrefilterResult["dropped"] = [];
  for (const file of files) {
    const path = file.path;
    const added = file.hunks.flatMap((hunk) => hunk.text.split("\n").slice(1)
      .filter((line) => line.startsWith("+")).map((line) => line.slice(1))).slice(0, 5);
    let rule: PrefilterRule | undefined;
    if (lockfiles.has(posix.basename(path))) rule = "lockfile";
    else if (/(?:^|\/)(?:dist|build|out|\.next|coverage|vendor|node_modules)\//.test(path)
      || /(?:\.min\.(?:js|css)|\.map|\.pb\.go|_pb2\.py)$/.test(path)
      || added.some((line) => /@generated|DO NOT EDIT/i.test(line))) rule = "generated";
    else if (/(?:^|\/)__snapshots__\//.test(path) || path.endsWith(".snap")) rule = "snapshot";
    else if (/^(?:Binary files .* differ|GIT binary patch)$/m.test(file.header)) rule = "binary";
    else if (options.ignore?.some((glob) => posix.matchesGlob(path, glob))) rule = "config-ignore";
    if (rule) {
      dropped.push({ path, rule });
      continue;
    }
    const hunks = file.hunks.filter((hunk) => {
      if (!whitespaceOnly(hunk)) return true;
      dropped.push({ path, rule: "whitespace" });
      return false;
    });
    kept.push(hunks.length === file.hunks.length ? file : { ...file, hunks, text: file.header + hunks.map((h) => h.text).join("") });
  }
  return { kept, dropped };
}
