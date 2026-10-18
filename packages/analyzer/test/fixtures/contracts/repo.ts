// A throwaway git repo for the contracts tests: commit `base`, apply `head` (null deletes a file), commit.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnv } from "../../../src/git-env.ts";

export type Files = Record<string, string>;

export function makeRepo(base: Files, head: Record<string, string | null>): { repo: string; base: string; head: string; cleanup(): void } {
  const repo = mkdtempSync(path.join(tmpdir(), "tracehound-contracts-test-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();
  const write = (files: Record<string, string | null>) => {
    for (const [f, text] of Object.entries(files)) {
      const abs = path.join(repo, f);
      if (text === null) rmSync(abs);
      else {
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
    }
  };
  git("init", "-q", "-b", "main");
  write(base);
  git("add", "-A");
  git("commit", "-qm", "base");
  const baseSha = git("rev-parse", "HEAD");
  write(head);
  git("add", "-A");
  git("commit", "-qm", "head", "--allow-empty");
  return { repo, base: baseSha, head: git("rev-parse", "HEAD"), cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
