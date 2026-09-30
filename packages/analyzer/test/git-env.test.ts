// Decision 032: inside a hook or `git rebase --exec`, GIT_DIR & co. override `git -C`, and our
// fixture builders once committed into the caller's worktree. Every git spawn now gets
// cleanGitEnv(); this proves it against a sentinel repo that GIT_DIR/GIT_WORK_TREE point at.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import { cleanGitEnv, isRepoSelectingGitVar, scrubGitEnv } from "../src/git-env.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";

// the test's own git calls: an explicit env with nothing git-specific inherited
const ownEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const git = (repo: string, ...args: string[]) =>
  execFileSync("git", ["-C", repo, "-c", "user.name=s", "-c", "user.email=s@s", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: ownEnv() }).trim();
const snap = (repo: string) => ({
  config: git(repo, "config", "--list", "--local"),
  refs: git(repo, "for-each-ref"),
  index: git(repo, "ls-files", "-s"),
  head: git(repo, "rev-parse", "HEAD"),
});

describe("git env hygiene (decision 032)", () => {
  it("cleanGitEnv drops the repo-selecting variables and keeps everything else", () => {
    const env = {
      GIT_DIR: "/x/.git", GIT_WORK_TREE: "/x", GIT_INDEX_FILE: "i", GIT_OBJECT_DIRECTORY: "o", GIT_ALTERNATE_OBJECT_DIRECTORIES: "a",
      GIT_COMMON_DIR: "c", GIT_NAMESPACE: "n", GIT_PREFIX: "p", GIT_CONFIG_PARAMETERS: "'core.bare'='true'",
      GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.bare", GIT_CONFIG_VALUE_0: "true", GIT_CONFIG_KEY_11: "k", GIT_CONFIG_VALUE_11: "v",
      GIT_ASKPASS: "askpass", GIT_EDITOR: "true", PATH: "/bin", HOME: "/h",
    };
    expect(cleanGitEnv(env)).toEqual({ GIT_ASKPASS: "askpass", GIT_EDITOR: "true", PATH: "/bin", HOME: "/h" });
    expect(env.GIT_DIR).toBe("/x/.git"); // a copy, not in place
    expect(isRepoSelectingGitVar("GIT_CONFIG_KEYS_0")).toBe(false);
    const inPlace: NodeJS.ProcessEnv = { ...env };
    expect(scrubGitEnv(inPlace).sort()).toEqual(Object.keys(env).filter((k) => !["GIT_ASKPASS", "GIT_EDITOR", "PATH", "HOME"].includes(k)).sort());
    expect(inPlace).toEqual({ GIT_ASKPASS: "askpass", GIT_EDITOR: "true", PATH: "/bin", HOME: "/h" });
  });

  it("the test setup file scrubbed this process's env at startup", () => {
    expect(Object.keys(process.env).filter(isRepoSelectingGitVar)).toEqual([]);
  });

  // GIT_DIR alone is what `git rebase --exec` exported when this bit us; GIT_DIR + GIT_WORK_TREE is the other common shape
  for (const shape of ["GIT_DIR + GIT_WORK_TREE", "GIT_DIR only"] as const) {
    it(`with ${shape} pointing at a sentinel repo, build-toy-repo and the fixture-repo helper leave it untouched`, () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "tracehound-sentinel-"));
      const sentinel = path.join(tmp, "sentinel");
      const toy = path.join(tmp, "toy");
      execFileSync("git", ["init", "-q", "-b", "main", sentinel], { env: ownEnv() });
      writeFileSync(path.join(sentinel, "SENTINEL"), "do not touch\n");
      git(sentinel, "add", "SENTINEL");
      git(sentinel, "commit", "-q", "-m", "sentinel");
      const before = snap(sentinel);

      const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
      process.env.GIT_DIR = path.join(sentinel, ".git");
      if (shape === "GIT_DIR + GIT_WORK_TREE") process.env.GIT_WORK_TREE = sentinel;
      const errors: string[] = [];
      let toySha: string | undefined;
      let fixture: ReturnType<typeof makeFixtureRepo> | undefined;
      try {
        try {
          toySha = buildToyRepo(toy);
        } catch (e) {
          errors.push(`build-toy-repo: ${(e as Error).message.split("\n")[0]}`);
        }
        try {
          fixture = makeFixtureRepo();
        } catch (e) {
          errors.push(`fixture-repo: ${(e as Error).message.split("\n")[0]}`);
        }
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
      try {
        expect(snap(sentinel)).toEqual(before); // config (no core.bare), refs, index and HEAD unchanged
        expect(errors).toEqual([]);
        expect(toySha).toBe(TOY_BASE_SHA);
        expect(git(toy, "rev-parse", "HEAD")).toBe(TOY_BASE_SHA);
        expect(git(toy, "status", "--porcelain")).toBe("");
        expect(git(fixture!.repo, "rev-parse", "HEAD")).toBe(fixture!.base);
        expect(git(fixture!.repo, "log", "--format=%an", "-1")).toBe("t");
      } finally {
        fixture?.cleanup();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
