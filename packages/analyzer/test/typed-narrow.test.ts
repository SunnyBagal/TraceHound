import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeNarrowTyped } from "../src/affected/typed-narrow.ts";
import { cleanGitEnv } from "../src/git-env.ts";

// The diff gives `priceOf` a second required parameter and updates one caller. An untouched caller in
// another package now fails to compile (TS2554). An error that exists at both commits must cancel.
const BASE: Record<string, string> = {
  "package.json": JSON.stringify({ name: "shop", private: true, workspaces: ["core", "web"] }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["core", "web"] }),
  "core/package.json": JSON.stringify({ name: "core" }),
  "core/src/index.ts": 'export * from "./pricing.ts";\n',
  "core/src/pricing.ts": "export function priceOf(qty: number): number {\n  return qty * 250;\n}\n",
  "core/src/invoice.ts": 'import { priceOf } from "./pricing.ts";\nexport const total = (qty: number): number => priceOf(qty) + 99;\n',
  "web/package.json": JSON.stringify({ name: "web" }),
  "web/src/badge.ts": 'import { priceOf } from "core";\nconst old: string = 1; // an error at both commits\nexport const badge = (qty: number) => (priceOf(qty) > 1000 ? "big" : "small");\nexport { old };\n',
};

let repo: string;
let base: string;
let head: string;
const g = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "th-typed-narrow-"));
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
  writeFileSync(path.join(repo, "core/src/pricing.ts"), "export function priceOf(qty: number, currency: string): number {\n  return currency === \"usd\" ? qty * 2.5 : qty * 250;\n}\n");
  writeFileSync(path.join(repo, "core/src/invoice.ts"), 'import { priceOf } from "./pricing.ts";\nexport const total = (qty: number): number => priceOf(qty, "usd") + 99;\n');
  g(["commit", "-q", "-am", "prices take a currency"]);
  head = g(["rev-parse", "HEAD"]);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("narrow typed check", () => {
  it("reports the diagnostic a change adds in a file it did not edit, and nothing that was there before", () => {
    const report = computeNarrowTyped({ repo, base, head });
    expect(report.status).toBe("complete");
    expect(report.checked).toMatchObject({ files: 1, missingAtBase: 0 });
    expect(report.diagnostics).toEqual({ base: 1, head: 2, new: 1 });
    expect(report.findings).toHaveLength(1);
    const f = report.findings[0]!;
    expect(f).toMatchObject({ path: "web/src/badge.ts", line: 3, source: "tsc" });
    expect(f.body).toContain("TS2554");
    expect(f.evidence[0]).toMatchObject({ path: "core/src/pricing.ts", line: 1, side: "head" });
    expect(f.evidence[1]).toMatchObject({ path: "web/src/badge.ts", line: 3 });
  });

  it("has nothing to check when no unedited file uses a changed declaration", () => {
    const report = computeNarrowTyped({ repo, base: head, head });
    expect(report.status).toBe("nothing-to-check");
    expect(report.findings).toEqual([]);
  });
});
