import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AffectedError, computeAffected, formatAffected } from "../src/affected/affected.ts";
import { runAffected } from "../src/affected/cli.ts";
import { cleanGitEnv } from "../src/git-env.ts";

// A two-package workspace. The diff changes `priceOf`'s return unit in pricing.ts and nothing else;
// its callers in the same package, in another package and in a test file are untouched.
const BASE: Record<string, string> = {
  "package.json": JSON.stringify({ name: "shop", private: true, workspaces: ["core", "web"] }),
  "core/package.json": JSON.stringify({ name: "core" }),
  "core/src/pricing.ts": [
    "export function priceOf(qty: number): number {",
    "  return qty * 250;",
    "}",
    "export function label(qty: number): string {",
    "  return `x${qty}`;",
    "}",
    "",
  ].join("\n"),
  "core/src/invoice.ts": ['import { priceOf } from "./pricing.ts";', "export function total(qty: number): number {", "  return priceOf(qty) + 99;", "}", ""].join("\n"),
  "core/src/pricing.test.ts": ['import { priceOf } from "./pricing.ts";', "priceOf(1);", ""].join("\n"),
  "web/package.json": JSON.stringify({ name: "web" }),
  "web/src/cart.ts": ['import { priceOf, label } from "../../core/src/pricing.ts";', "export const cartLine = (qty: number) => `${label(qty)}: ${priceOf(qty)} cents`;", ""].join("\n"),
  "README.md": "shop\n",
};

let repo: string;
let base: string;
let head: string;
const g = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "th-affected-"));
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
  writeFileSync(path.join(repo, "core/src/pricing.ts"), BASE["core/src/pricing.ts"]!.replace("return qty * 250;", "return qty * 2.5;"));
  writeFileSync(path.join(repo, "README.md"), "shop, prices in dollars\n");
  g(["commit", "-q", "-am", "prices in dollars"]);
  head = g(["rev-parse", "HEAD"]);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("affected set", () => {
  it("lists the compiler-resolved references to a changed declaration, outside the diff", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}` });
    expect(report.declarations.map((d) => d.id)).toEqual(["core/src/pricing.ts#priceOf"]);
    const decl = report.declarations[0]!;
    expect(decl).toMatchObject({ status: "resolved", exported: true, changedLines: [2], referencesTotal: 3, referencesOutsideDiff: 3, referenceFiles: 3 });
    // non-test references first; the import lines are not references
    expect(decl.references.map((r) => `${r.file}:${r.line}`)).toEqual(["core/src/invoice.ts:3", "web/src/cart.ts:2", "core/src/pricing.test.ts:2"]);
    expect(decl.references[0]).toMatchObject({ enclosing: "core/src/invoice.ts#total", text: "return priceOf(qty) + 99;", inDiff: false, test: false });
    expect(decl.references[2]!.test).toBe(true);
    expect(report.counts).toMatchObject({ declarations: 1, resolved: 1, skippedBudget: 0, referencesTotal: 3, referencesShown: 3 });
  });

  it("names changed files it did not analyze, and declarations it did not reach in the budget", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}`, budgetMs: 1, now: (() => { let t = 0; return () => (t += 10); })() });
    expect(report.changedFiles).toEqual([
      { path: "README.md", status: "modified", analyzed: false },
      { path: "core/src/pricing.ts", status: "modified", analyzed: true },
    ]);
    expect(report.declarations[0]).toMatchObject({ status: "skipped-budget", referencesTotal: 0 });
    expect(report.counts.skippedBudget).toBe(1);
    expect(formatAffected(report)).toContain("references: not computed (skipped-budget)");
  });

  it("counts references over the limit instead of dropping them", () => {
    const report = computeAffected({ repo, diff: `${base}..${head}`, maxRefs: 1 });
    expect(report.declarations[0]!.references).toHaveLength(1);
    expect(report.declarations[0]!.referencesTotal).toBe(3);
    expect(formatAffected(report)).toContain("(2 more not shown)");
  });

  it("refuses a working tree that is not the diff's head", () => {
    expect(() => computeAffected({ repo, diff: `${head}..${base}` })).toThrow(AffectedError);
    expect(() => runAffected(["--repo", repo])).toThrow(/usage:/);
  });

  it("prints the packet", () => {
    const { text } = runAffected(["--repo", repo, "--diff", `${base}..${head}`]);
    expect(text).toContain("## core/src/pricing.ts#priceOf (function, exported) lines 1-3; changed lines 2");
    expect(text).toContain("- core/src/invoice.ts:3 in total: return priceOf(qty) + 99;");
    expect(text).toContain("- core/src/pricing.test.ts:2 [test] in <module>: priceOf(1);");
  });
});
