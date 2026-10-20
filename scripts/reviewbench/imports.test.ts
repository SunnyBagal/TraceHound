import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Learning stays out of the image: no data branch, no learned memory, no fix suggestions. The image
// runs scripts/reviewbench/*.ts in-process and spawns four stage commands of
// packages/analyzer/src/bin.ts (review, review-ctx, review-missed, verify-ctx); this walks the
// runtime imports of both, transitively, so a learning hook added to the pipeline or a stage later
// fails here too.
const ROOT = path.resolve(import.meta.dirname, "../..");
const HERE = import.meta.dirname;
const STAGE_CLIS = ["review/cli.ts", "review/ctx-cli.ts", "review/missed-cli.ts", "review/verify-ctx-cli.ts"]
  .map(file => path.join(ROOT, "packages/analyzer/src", file));
const FORBIDDEN = [path.join(ROOT, "packages/action/src/data.ts"), path.join(ROOT, "packages/action/src/fix.ts")];
const forbidden = (file: string) => FORBIDDEN.includes(file) || /learn/i.test(path.basename(file));

/** Runtime module specifiers of a source text: static imports and re-exports (not `import type`), side-effect and dynamic imports. */
function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;'"]*?\sfrom\s+["']([^"']+)["']/gm)) found.push(m[1]!);
  for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) found.push(m[1]!);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push(m[1]!);
  return found;
}

/** Every repository .ts file reachable from `roots` through relative runtime imports. */
function reachable(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue; // node: built-ins and packages
      const target = path.resolve(path.dirname(file), spec);
      if (target.endsWith(".ts") && existsSync(target)) queue.push(target);
    }
  }
  return seen;
}

const own = readdirSync(HERE).filter(f => f.endsWith(".ts")).map(f => path.join(HERE, f));

describe("learning stays out of the image", () => {
  it("finds runtime imports and skips type-only ones", () => {
    expect(importsOf([
      'import { a } from "./one.ts";', "import type { B } from './two.ts';", "import {\n  c,\n  d,\n} from \"./three.ts\";",
      'export { e } from "./four.ts";', 'import "./five.ts";', // split so this file's own text holds no dynamic import of a learn* file
      'const f = await imp' + 'ort("./learn-six.ts");',
    ].join("\n"))).toEqual(["./one.ts", "./three.ts", "./four.ts", "./five.ts", "./learn-six.ts"]);
  });

  it("no scripts/reviewbench file imports data.ts, fix.ts or a learn* file directly", () => {
    for (const file of own) {
      const bad = importsOf(readFileSync(file, "utf8")).filter(spec => spec.startsWith(".") && forbidden(path.resolve(path.dirname(file), spec)));
      expect(bad, path.basename(file)).toEqual([]);
    }
  });

  it("nothing the image runs reaches them transitively (the adapter and the four spawned stages)", () => {
    const roots = [...own.filter(f => !f.endsWith(".test.ts") && !f.endsWith("test-setup.ts") && !f.endsWith("vitest.config.ts")), ...STAGE_CLIS];
    const files = reachable(roots);
    // The walk really covers the pipeline and the stages.
    for (const expected of ["packages/action/src/pipeline.ts", "packages/analyzer/src/review/review.ts",
      "packages/analyzer/src/review/review-ctx.ts", "packages/analyzer/src/review/missed.ts", "packages/analyzer/src/review/verify-ctx.ts", "packages/analyzer/src/llm/client.ts"]) {
      expect(files.has(path.join(ROOT, expected)), expected).toBe(true);
    }
    expect([...files].filter(forbidden).map(f => path.relative(ROOT, f))).toEqual([]);
  });
});
