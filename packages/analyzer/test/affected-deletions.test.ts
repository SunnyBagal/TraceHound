// affected@0.5: a declaration the diff only removes lines from is in the affected set.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AFFECTED_VERSION, computeAffected, deletionPoints, formatAffected, formatAffectedCapped } from "../src/affected/affected.ts";
import { cleanGitEnv } from "../src/git-env.ts";

// The diff removes the guard in `reserve` (lines only removed), removes the whole function `legacy`
// that sits between two others, and changes one line of `release`. No line is added in `reserve`.
const STOCK = [
  "export function reserve(qty: number): number {", // 1
  "  if (qty <= 0) throw new Error(\"qty must be positive\");", // 2, removed
  "  return qty;", // 3
  "}", // 4
  "export function legacy(): number {", // 5-7, removed
  "  return 0;",
  "}",
  "export function release(qty: number): number {", // 8
  "  return -qty;", // 9, changed
  "}", // 10
  "",
].join("\n");
const BASE: Record<string, string> = {
  "package.json": JSON.stringify({ name: "depot", private: true }),
  "src/stock.ts": STOCK,
  "src/order.ts": ['import { reserve, release } from "./stock.ts";', "export const place = (qty: number) => reserve(qty) * 2;", "export const cancel = (qty: number) => release(qty);", ""].join("\n"),
};

let repo: string;
let base: string;
let head: string;
const g = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "th-affected-del-"));
  for (const [file, text] of Object.entries(BASE)) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
  }
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "t@example.invalid"]);
  g(["config", "user.name", "t"]);
  g(["add", "."]);
  g(["commit", "-q", "-m", "base"]);
  base = g(["rev-parse", "HEAD"]);
  const lines = STOCK.split("\n");
  const next = [lines[0], lines[2], lines[3], lines[7], "  return 0 - qty;", lines[9], ""].join("\n");
  writeFileSync(path.join(repo, "src/stock.ts"), next);
  g(["commit", "-q", "-am", "drop the guard and the legacy function"]);
  head = g(["rev-parse", "HEAD"]);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("affected set: lines only removed", () => {
  it("reads the deletion points of a zero-context diff", () => {
    const diff = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -10,2 +9,0 @@ function f(x) {", "-  if (!x) return;", "-  check(x);", "@@ -20 +18 @@", "-a", "+b", "@@ -1 +0,0 @@", "-top", "diff --git a/src/b.ts b/src/b.ts", "@@ -3,0 +4,2 @@", "+x", "+y"].join("\n");
    expect([...deletionPoints(diff)]).toEqual([
      ["src/a.ts", [9, 0]],
      ["src/b.ts", []],
    ]);
  });

  it("lists a declaration whose only change is removed lines, with its callers", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}` });
    expect(report.version).toBe(AFFECTED_VERSION);
    expect(report.declarations.map((d) => d.id)).toEqual(["src/stock.ts#reserve", "src/stock.ts#release"]);
    const reserve = report.declarations[0]!;
    // head: reserve is lines 1-3, and the guard was removed after line 1
    expect(reserve).toMatchObject({ status: "resolved", startLine: 1, endLine: 3, changedLines: [], removedAfter: [1], referencesTotal: 1, referencesOutsideDiff: 1 });
    expect(reserve.references.map((r) => `${r.file}:${r.line}`)).toEqual(["src/order.ts:2"]);
    expect(reserve.references[0]).toMatchObject({ relation: "call", inDiff: false, text: "export const place = (qty: number) => reserve(qty) * 2;" });
  });

  it("does not charge a neighbour with a whole declaration removed beside it", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}` });
    // `legacy` was removed after head line 3, reserve's last line: outside reserve, before release
    const release = report.declarations[1]!;
    expect(release).toMatchObject({ startLine: 4, endLine: 6, changedLines: [5], removedAfter: [] });
    expect(report.declarations.some((d) => d.name === "legacy")).toBe(false);
  });

  it("says where lines were removed in both packet forms, and keeps the old wording for added lines", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}` });
    const full = formatAffected(report);
    expect(full).toContain("## src/stock.ts#reserve (function, exported) lines 1-3; lines removed after 1");
    expect(full).toContain("## src/stock.ts#release (function, exported) lines 4-6; changed lines 5");
    const short = formatAffectedCapped(report);
    expect(short).toContain("## src/stock.ts#reserve (function, exported) lines 1-3; lines removed after 1; 1 references outside the diff in 1 files");
    expect(short).toContain("  - src/order.ts:2 [call] in place: export const place = (qty: number) => reserve(qty) * 2;");
  });
});
