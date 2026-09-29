import { describe, expect, it } from "vitest";
import { extractImports } from "../src/extract/imports.ts";
import { extractSymbols } from "../src/extract/symbols.ts";
import { memoryProject } from "./helpers.ts";

describe("extractImports", () => {
  const { ctx, evidence, sf } = memoryProject({
    "/src/index.ts": [
      `import express from "express";`,
      `import { env } from "./utils/env.js";`,
      `import type { Req } from "./types.js";`,
      `import { PrismaClient } from "./generated/prisma/client";`,
      `export { helper } from "./utils/helper.ts";`,
      `import "dotenv/config";`,
    ].join("\n"),
    "/src/utils/env.ts": `export const env = {};`,
    "/src/utils/helper.ts": `export const helper = 1;`,
    "/src/types.ts": `export interface Req {}`,
  });
  const facts = extractImports(sf("/src/index.ts"), ctx);
  const bySpec = Object.fromEntries(facts.map((f) => [f.specifier, f]));

  it("resolves bundler-style .js specifiers to .ts files", () => {
    expect(bySpec["./utils/env.js"]).toMatchObject({ target: "src/utils/env.ts", external: false, typeOnly: false, names: ["env"] });
  });

  it("marks bare specifiers as external without a target", () => {
    expect(bySpec["express"]).toMatchObject({ target: undefined, external: true, names: ["express"] });
    expect(bySpec["dotenv/config"]).toMatchObject({ external: true, names: [] });
  });

  it("flags type-only imports", () => {
    expect(bySpec["./types.js"]).toMatchObject({ target: "src/types.ts", typeOnly: true });
  });

  it("records unresolved relative imports as facts with low confidence and no target", () => {
    const fact = bySpec["./generated/prisma/client"]!;
    expect(fact.target).toBeUndefined();
    expect(fact.external).toBe(false);
    expect(evidence.get(fact.evidenceId)).toMatchObject({ confidence: 0.5, extractor: "imports" });
  });

  it("includes re-exports", () => {
    expect(bySpec["./utils/helper.ts"]).toMatchObject({ target: "src/utils/helper.ts", names: ["helper"] });
  });

  it("attaches line-accurate evidence with a snippet", () => {
    const ev = evidence.get(bySpec["./utils/env.js"]!.evidenceId)!;
    expect(ev).toMatchObject({ file: "src/index.ts", range: { startLine: 2, endLine: 2 }, confidence: 1 });
    expect(ev.snippet.lines).toContain(`import { env } from "./utils/env.js";`);
  });
});

describe("extractSymbols", () => {
  it("lists top-level declarations with export flags", () => {
    const { sf } = memoryProject({
      "/a.ts": [
        `export function a() {}`,
        `const b = () => 1;`,
        `export class C {}`,
        `export const D = { x: 1 };`,
        `export interface E {}`,
        `type F = string;`,
      ].join("\n"),
    });
    expect(extractSymbols(sf("/a.ts")).map((s) => [s.name, s.kind, s.exported])).toEqual([
      ["a", "function", true],
      ["b", "function", false],
      ["C", "class", true],
      ["D", "variable", true],
      ["E", "interface", true],
      ["F", "type", false],
    ]);
  });
});
