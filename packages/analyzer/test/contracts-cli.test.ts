// contracts-v1, CLI: `tracehound contracts` writes { typed, keyed, dependents, findings, timings }.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/contracts/cli.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import { CASES } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));
const outDir = mkdtempSync(path.join(tmpdir(), "tracehound-contracts-cli-"));
cleanups.push(() => rmSync(outDir, { recursive: true, force: true }));

describe("tracehound contracts", () => {
  it("writes the report for a pull request and prints a summary", () => {
    const c = CASES.find((x) => x.name === "HTTP route path changed on the server only")!;
    const r = makeRepo(c.base, c.head);
    cleanups.push(r.cleanup);
    const out = path.join(outDir, "nested", "report.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["--repo", r.repo, "--base", r.base, "--head", r.head, "--out", out, "--budget-s", "60"])).toBe(0);
    const printed = log.mock.calls.map((a) => String(a[0])).join("\n");
    log.mockRestore();
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(report)).toEqual(["refs", "typed", "keyed", "dependents", "findings", "timings"]);
    expect(report.refs).toEqual({ base: r.base, head: r.head, mergeBase: r.base });
    expect(report.typed.complete).toBe(true);
    expect(report.findings.map((f: { source: string; path: string; line: number }) => `${f.source} ${f.path}:${f.line}`)).toEqual(["contract src/client.ts:2"]);
    expect(Object.keys(report.timings)).toEqual(["worktreesMs", "typedMs", "keyedMs", "dependentsMs", "findingsMs", "totalMs"]);
    expect(printed).toContain("findings: 1 (tsc 0, contract 1)");
    // the worktrees are gone
    expect(execFileSync("git", ["-C", r.repo, "worktree", "list"], { encoding: "utf8", env: cleanGitEnv() }).trim().split("\n")).toHaveLength(1);
  });

  it("base is the merge base: commits on the base branch after the fork point are not the pull request's", () => {
    const r = makeRepo({ "a.py": '@app.route("/api/a")\ndef a(): pass\n', "b.py": 'get("/api/a")\n' }, {});
    cleanups.push(r.cleanup);
    const git = (...args: string[]) => execFileSync("git", ["-C", r.repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();
    git("checkout", "-q", "-b", "feature");
    execFileSync("sh", ["-c", `printf 'x = 1\\n' > "${r.repo}/c.py"`]);
    git("add", "c.py");
    git("commit", "-qm", "feature");
    const head = git("rev-parse", "HEAD");
    git("checkout", "-q", "main");
    execFileSync("sh", ["-c", `printf '@app.route("/api/b")\\ndef a(): pass\\n' > "${r.repo}/a.py"`]);
    git("commit", "-qam", "main moves on");
    const out = path.join(outDir, "merge-base.json");
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["--repo", r.repo, "--base", "main", "--head", head, "--out", out])).toBe(0);
    vi.restoreAllMocks();
    const report = JSON.parse(readFileSync(out, "utf8"));
    expect(report.refs.mergeBase).toBe(r.head);
    expect(report.keyed.keys).toEqual([]); // main's route change is not in the pull request
    expect(report.typed).toMatchObject({ skipped: "no-tsconfig" });
  });

  it("usage errors exit 1 and print the usage", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["--repo", "x"])).toBe(1);
    expect(main(["--repo", "x", "--base", "a", "--head", "b", "--out", "o.json", "--budget-s", "0"])).toBe(1);
    expect(main(["--bogus"])).toBe(1);
    expect(err.mock.calls.map((a) => String(a[0]))).toEqual([
      expect.stringContaining("usage: tracehound contracts --repo"),
      expect.stringContaining("--budget-s must be a positive number"),
      expect.stringContaining("usage: tracehound contracts --repo"),
    ]);
    err.mockRestore();
  });
});
