import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { parseDiff } from "../../packages/analyzer/src/review/diff.ts";
import { languageCounts, parseKept, prDiff, stratify, taskToInput, toSubmission } from "./adapter.ts";
import { main } from "./cli.ts";
import { findingsFileName, mirrorUrl, parseManifest, parseTask, type RbTask } from "./format.ts";

// Hand-made 2-PR fixture: not ReviewBench data (its licence is unverified, so none is committed).
const fixture = (name: string) => join(import.meta.dirname, "fixtures", name);
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const manifest = parseManifest(readJson(fixture("manifest.json")));

const temps: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "tracehound-rb-"));
  temps.push(dir);
  return dir;
};
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8", env: cleanGitEnv() }).trim();

/** A real repository standing in for a mirror: base, then a head that changes src/page.ts. */
function mirror(): { dir: string; base: string; head: string } {
  const dir = temp();
  git(dir, "init", "-q", "-b", "main");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/page.ts"), "export function size(n: number) {\n  return n;\n}\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  writeFileSync(join(dir, "src/page.ts"), "export function size(n: number) {\n  const max = 100;\n  return Math.min(n, max);\n}\n");
  git(dir, "commit", "-q", "-am", "head");
  return { dir, base, head: git(dir, "rev-parse", "HEAD") };
}

describe("format", () => {
  it("parses both fixture entries, deriving the id and accepting *_sha field names", () => {
    expect(manifest.map((t) => t.id)).toEqual(["example-org_widgets-101", "example-org_ledger-7"]);
    expect(manifest[1]).toMatchObject({ base: "3333333", head: "4444444", language: "Python" });
    expect(manifest[1]!.title).toBeUndefined();
    expect(parseManifest({ tasks: readJson(fixture("manifest.json")) })).toEqual(manifest);
  });

  it("rejects entries it cannot use", () => {
    const ok = { repo: "a/b", pr_number: 1, base: "abcdef1", head: "abcdef2" };
    expect(() => parseTask({ ...ok, repo: "b" })).toThrow(/owner\/name/);
    expect(() => parseTask({ ...ok, pr_number: 0 })).toThrow(/pr_number/);
    expect(() => parseTask({ ...ok, head: "main" })).toThrow(/shas/);
    expect(() => parseTask({ ...ok, id: "../x" })).toThrow(/file name/);
    expect(() => parseTask({ ...ok, title: 3 })).toThrow(/title/);
    expect(() => parseManifest([ok, ok])).toThrow(/duplicate/);
    expect(() => parseManifest({})).toThrow(/array/);
  });

  it("names the mirror and the findings file", () => {
    expect(mirrorUrl("example-org/widgets")).toBe("https://github.com/review-bench/example-org_widgets.git");
    expect(findingsFileName(manifest[0]!)).toBe("example-org_widgets-101.json");
  });
});

describe("ReviewBench PR → pipeline input", () => {
  it("takes base...head from a local clone, in the form the reviewers parse", () => {
    const repo = mirror();
    const task: RbTask = { ...manifest[0]!, base: repo.base, head: repo.head };
    const diff = prDiff(repo.dir, task);
    const files = parseDiff(diff);
    expect(files.map((f) => f.newPath)).toEqual(["src/page.ts"]);
    const input = taskToInput(task, diff);
    expect(input).toEqual({ title: "Clamp the page size", body: "Hand-made fixture, not ReviewBench data.", number: 101, diff });
  });

  it("stands in the PR address for a missing title and refuses an empty diff", () => {
    expect(taskToInput(manifest[1]!, "diff --git a/x b/x\n")).toMatchObject({ title: "example-org/ledger#7", body: "", number: 7 });
    expect(() => taskToInput(manifest[1]!, "  \n")).toThrow(/empty diff/);
  });
});

describe("pipeline output → ReviewBench findings", () => {
  it("maps kept findings to one-line ranges and counts what it drops", () => {
    const submission = toSubmission(parseKept(readJson(fixture("kept-101.json"))));
    expect(submission.findings).toEqual([{
      file: "src/page.ts", start_line: 3, end_line: 3,
      message: "The clamp uses the wrong bound: a size of 0 passes through and divides by zero later.",
    }]);
    expect(submission.dropped).toEqual({ "no-line": 1, "empty-body": 1 });
  });

  it("rejects a kept file that is not the verifier's shape", () => {
    expect(() => parseKept({})).toThrow(/comments/);
    expect(() => parseKept({ comments: [{ path: "a", line: 0, body: "b" }] })).toThrow(/invalid/);
  });
});

describe("stratified subset", () => {
  // The full set's published language mix (spike doc): 68 TS, 41 Python, 25 C#, 19 Go, 15 JS, 51 other.
  const mix: [string, number][] = [["TypeScript", 68], ["Python", 41], ["C#", 25], ["Go", 19], ["JavaScript", 15], ["Other", 51]];
  const full: RbTask[] = mix.flatMap(([language, n]) => Array.from({ length: n }, (_, i) => ({
    id: `${language.replace("#", "s")}-${i}`, repo: "x/y", pr_number: i + 1, base: "abcdef1", head: "abcdef2", language,
  })));

  it("gives each language its largest-remainder share of 60 of 219", () => {
    const subset = stratify(full, 60, "cc-02");
    expect(subset).toHaveLength(60);
    expect(Object.fromEntries(languageCounts(subset))).toEqual({ TypeScript: 19, Other: 14, Python: 11, "C#": 7, Go: 5, JavaScript: 4 });
  });

  it("is fixed by the seed, independent of manifest order, and returned in manifest order", () => {
    const a = stratify(full, 60, "cc-02").map((t) => t.id);
    const b = stratify([...full].reverse(), 60, "cc-02").map((t) => t.id);
    expect([...b].reverse()).toEqual(a);
    expect(stratify(full, 60, "other seed").map((t) => t.id)).not.toEqual(a);
    expect(stratify(full, 219, "s")).toEqual(full);
    expect(stratify(full, 0, "s")).toEqual([]);
    expect(() => stratify(full, 220, "s")).toThrow(/size/);
  });

  it("puts tasks without a language in one 'unknown' stratum", () => {
    expect(languageCounts(stratify(parseManifest([{ repo: "a/b", pr_number: 1, base: "abcdef1", head: "abcdef2" }]), 1, "s"))).toEqual([["unknown", 1]]);
  });
});

describe("cli", () => {
  it("prepare → (pipeline) → submit writes the reviewer input and a findings file, never over a file", () => {
    const repo = mirror();
    const dir = temp();
    const entries = (readJson(fixture("manifest.json")) as Record<string, unknown>[]);
    const file = join(dir, "manifest.json");
    writeFileSync(file, JSON.stringify([{ ...entries[0], base: repo.base, head: repo.head }, entries[1]]));
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const id = "example-org_widgets-101";

    expect(main(["prepare", "--manifest", file, "--task", id, "--repo", repo.dir, "--out", join(dir, "input.json")], log)).toBe(0);
    expect(readJson(join(dir, "input.json"))).toMatchObject({ title: "Clamp the page size", number: 101 });
    expect(() => main(["prepare", "--manifest", file, "--task", id, "--repo", repo.dir, "--out", join(dir, "input.json")], log)).toThrow(/EEXIST/);

    expect(main(["submit", "--manifest", file, "--task", id, "--kept", fixture("kept-101.json"), "--findings", join(dir, "findings")], log)).toBe(0);
    expect(readJson(join(dir, "findings", `${id}.json`))).toHaveLength(1);
    expect(lines.at(-1)).toBe(`submitted ${id}: 1 findings, dropped no-line 1, empty-body 1`);
    // stdout carries counts and ids, never finding text
    expect(lines.join("\n")).not.toMatch(/clamp uses/i);

    expect(main(["subset", "--manifest", file, "--size", "1", "--seed", "s", "--out", join(dir, "subset.json")], log)).toBe(0);
    expect(readJson(join(dir, "subset.json"))).toHaveLength(1);
    expect(() => main(["submit", "--manifest", file, "--task", "nope", "--kept", "x", "--findings", dir], log)).toThrow(/not in the manifest/);
    expect(() => main(["prepare", "--manifest", file], log)).toThrow(/--task is required/);
    expect(main(["unknown"], log)).toBe(1);
  });
});
