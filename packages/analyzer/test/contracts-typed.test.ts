// contracts-v1, typed: tsc at the merge base vs head, new diagnostics split by edited / unedited file.
import { afterAll, describe, expect, it } from "vitest";
import { computeTyped, findTsconfigs, newDiagnostics, type TypedResult } from "../src/contracts/typed.ts";
import { mapBaseLine, openTrees, parseDiff } from "../src/contracts/trees.ts";
import { CASES, TSCONFIG } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

function typed(base: Record<string, string>, head: Record<string, string | null>, opts?: Parameters<typeof computeTyped>[1]): TypedResult {
  const r = makeRepo(base, head);
  cleanups.push(r.cleanup);
  const trees = openTrees(r.repo, r.base, r.head);
  try {
    return computeTyped(trees, opts);
  } finally {
    trees.close();
  }
}
const complete = (r: TypedResult) => {
  if ("skipped" in r) throw new Error(`skipped: ${r.reason}`);
  return r;
};
const TS = { "package.json": "{}", "tsconfig.json": TSCONFIG };

describe("contracts typed: fixture cases", () => {
  for (const c of CASES.filter((x) => "tsconfig.json" in x.base)) {
    it(`${c.control ? "control" : "positive"}: ${c.name} → ${c.expected.tsc} new diagnostic(s) in unedited files`, () => {
      const r = complete(typed(c.base, c.head));
      expect(r.uneditedFiles.map((d) => `${d.path}:${d.line}`)).toEqual(c.expected.tsc ? c.expected.paths : []);
      expect(r.editedFiles).toEqual([]);
      for (const d of r.uneditedFiles) {
        expect(d.text).not.toBe("");
        expect(d.cause, `${c.name}: cause`).toBeDefined();
        expect(c.base[d.cause!.path] ?? "", "the cause is in an edited file").not.toBe(c.head[d.cause!.path] ?? c.base[d.cause!.path]);
      }
    });
  }

  it("the required-parameter break names TS2554 and points its cause at the edited declaration", () => {
    const c = CASES.find((x) => x.name === "required parameter added")!;
    const r = complete(typed(c.base, c.head));
    expect(r.uneditedFiles[0]).toMatchObject({ path: "src/app.ts", line: 2, code: 2554, message: "Expected 2 arguments, but got 1.", text: 'export const message = greet("a");', tsconfig: "tsconfig.json" });
    expect(r.uneditedFiles[0]!.cause).toMatchObject({ path: "src/greet.ts", line: 1, side: "head", text: "export function greet(name: string, greeting: string) {" });
  });

  it("a removed export points its cause at the removed base line", () => {
    const c = CASES.find((x) => x.name === "export renamed, stale importer")!;
    const r = complete(typed(c.base, c.head));
    expect(r.uneditedFiles[0]!.cause).toMatchObject({ path: "src/users.ts", line: 1, side: "base", text: "export function getUser(id: string) {" });
  });
});

describe("contracts typed: matching", () => {
  it("unresolved external modules fail the same way on both sides and cancel out", () => {
    const file = (n: number) => `import express from "express";\nimport { Queue } from "bullmq";\nexport const app = express();\nexport const q = new Queue("q");\nexport const n = ${n};\n`;
    const r = complete(typed({ ...TS, "src/a.ts": file(1), "src/b.ts": 'import _ from "lodash";\nexport const b = _;\n' }, { "src/a.ts": "\n\n" + file(2) }));
    expect(r.diagnostics.base).toBeGreaterThanOrEqual(3); // express, bullmq, lodash: TS2307 at base…
    expect(r.diagnostics.head).toBe(r.diagnostics.base); // …and the same at head
    expect(r.diagnostics.new).toBe(0);
    expect([...r.editedFiles, ...r.uneditedFiles]).toEqual([]);
  });

  it("a line shift is not a new error; a second error with the same message in the same file is", () => {
    const base = { ...TS, "src/a.ts": 'export const x: number = "a";\n', "src/b.ts": 'import { x } from "./a";\nexport const y: string = x;\n' };
    const shifted = complete(typed(base, { "src/a.ts": '// moved down\n\nexport const x: number = "a";\n' }));
    expect(shifted.diagnostics).toMatchObject({ base: 2, head: 2, new: 0 });
    const again = complete(typed(base, { "src/a.ts": 'export const x: number = "a";\nexport const z: number = "a";\n' }));
    expect(again.editedFiles.map((d) => `${d.path}:${d.line}:${d.code}`)).toEqual(["src/a.ts:2:2322"]);
    expect(again.uneditedFiles).toEqual([]);
  });

  it("a renamed file keeps its diagnostics", () => {
    const r = complete(typed({ ...TS, "src/a.ts": 'export const x: number = "a";\nexport const filler = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];\n' }, { "src/a.ts": null, "src/renamed.ts": 'export const x: number = "a";\nexport const filler = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];\n' }));
    expect(r.diagnostics).toMatchObject({ base: 1, head: 1, new: 0 });
  });

  it("follows references to configs that aren't named tsconfig.json, and checks each file once", () => {
    const strict = JSON.stringify({ compilerOptions: { strict: true, noEmit: true, lib: ["ES2022"] }, include: ["src"] });
    const r = complete(typed({ "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }), "tsconfig.app.json": strict, "src/a.ts": "export function f(n: number) {\n  return n;\n}\n", "src/b.ts": 'import { f } from "./a";\nexport const v = f(1);\n' }, { "src/a.ts": "export function f(n: number, m: number) {\n  return n + m;\n}\n" }));
    expect(r.tsconfigs.head).toEqual(["tsconfig.app.json", "tsconfig.json"]);
    expect(r.uneditedFiles.map((d) => `${d.path}:${d.line}:${d.code}:${d.tsconfig}`)).toEqual(["src/b.ts:2:2554:tsconfig.app.json"]);
  });

  it("newDiagnostics: multiset over (file, code, message), shifted base lines first", () => {
    const trees = { renames: new Map<string, string>(), files: parseDiff("diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n") };
    const d = (line: number) => ({ path: "f.ts", line, code: 1, key: "m" });
    expect(newDiagnostics(trees, [d(1), d(5)], [d(3), d(7), d(9)])).toEqual([d(9)]);
    expect(newDiagnostics(trees, [d(1)], [d(1), d(3)])).toEqual([d(1)]); // base line 1 is head line 3
  });

  it("mapBaseLine: shifts past insertions and deletions, undefined on edited lines", () => {
    const diff = parseDiff("diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -2,0 +3,2 @@\n+x\n+y\n@@ -5,2 +7 @@\n-p\n-q\n+r\n")!.get("f")!;
    expect([1, 2, 3, 4, 5, 6, 7].map((l) => mapBaseLine(diff, l))).toEqual([1, 2, 5, 6, undefined, undefined, 8]);
  });
});

describe("contracts typed: budget", () => {
  const c = CASES[0]!;
  it("a file cap below the repo's size skips the comparison", () => {
    expect(typed(c.base, c.head, { maxFiles: 1 })).toMatchObject({ skipped: "budget", reason: "2 root files at base exceed the file cap of 1" });
  });
  it("an exhausted wall-clock budget skips; nothing partial is returned", () => {
    const r = typed(c.base, c.head, { budgetMs: 0 });
    expect(r).toMatchObject({ skipped: "budget" });
    expect(r).not.toHaveProperty("uneditedFiles");
  });
  it("no tsconfig at either side: skipped, not complete", () => {
    expect(typed({ "a.py": "x = 1\n" }, { "a.py": "x = 2\n" })).toMatchObject({ skipped: "no-tsconfig" });
  });
  it("findTsconfigs ignores node_modules and build output", () => {
    const r = makeRepo({ "tsconfig.json": "{}", "node_modules/x/tsconfig.json": "{}", "dist/tsconfig.json": "{}", "pkg/tsconfig.json": "{}" }, {});
    cleanups.push(r.cleanup);
    expect(findTsconfigs(r.repo).map((f) => f.slice(r.repo.length + 1))).toEqual(["pkg/tsconfig.json", "tsconfig.json"]);
  });
});
