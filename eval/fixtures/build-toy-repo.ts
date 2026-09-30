// Turn eval/fixtures/toy-cart (plain files) into a git repo with a reproducible commit SHA:
// fixed author, committer and dates, files added in sorted order. Tasks record that SHA as baseSha.
// Usage: node eval/fixtures/build-toy-repo.ts [dest]   (default eval/fixtures/.build/toy-cart)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export const TOY_SOURCE = path.resolve(import.meta.dirname, "toy-cart");
export const TOY_REPO = path.resolve(import.meta.dirname, ".build/toy-cart");
export const TOY_BASE_SHA = "3582f355e884dc4512ee157ee59848796893ec27";

const headOf = (dir: string) => {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
};

/**
 * Idempotent and safe to call from parallel test files: reuse a build already at TOY_BASE_SHA,
 * otherwise build in a private temp dir and rename it into place (first writer wins).
 */
export function buildToyRepo(dest = TOY_REPO): string {
  if (existsSync(dest) && headOf(dest) === TOY_BASE_SHA) return TOY_BASE_SHA;
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const sha = build(tmp);
  try {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    renameSync(tmp, dest);
  } catch {
    rmSync(tmp, { recursive: true, force: true }); // another process got there first
    if (headOf(dest) !== TOY_BASE_SHA) throw new Error(`could not place the toy repo at ${dest}`);
  }
  return sha;
}

function build(dest: string): string {
  cpSync(TOY_SOURCE, dest, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "toy",
    GIT_AUTHOR_EMAIL: "toy@tracehound.invalid",
    GIT_COMMITTER_NAME: "toy",
    GIT_COMMITTER_EMAIL: "toy@tracehound.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dest, "-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", "-c", "core.fileMode=false", ...args], { env, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "toy-cart: buggy applyDiscount");
  const sha = git("rev-parse", "HEAD");
  if (sha !== TOY_BASE_SHA) {
    throw new Error(`toy repo SHA ${sha} != expected ${TOY_BASE_SHA}: the fixture files changed; update TOY_BASE_SHA and eval/tasks/toy-*/task.json`);
  }
  return sha;
}

if (import.meta.main) console.log(`${buildToyRepo(process.argv[2] ?? TOY_REPO)} ${process.argv[2] ?? TOY_REPO}`);
