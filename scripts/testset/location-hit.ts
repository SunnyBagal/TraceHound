#!/usr/bin/env node
/**
 * location-hit.ts (B2): the model-free location hit per tool and bug case (docs/eval/ts-protocol.md §4): at least one
 * comment on a target's file within ±10 lines of the inclusive range of any target (primary or alternate); null lines
 * never hit; a case counts once.
 *
 *   node scripts/testset/location-hit.ts --side dev --goldens <goldens.json> --tool <name>=<reviews dir> … --out <json>
 *
 * stdout: counts per tool. --out: per tool, the hit/miss per case (private: case ids). Never overwrites.
 */
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, locationHit, pairs, readGoldens, readReviews, RefusalError, writeNew } from "./kit.ts";

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, goldens: { type: "string" },
      tool: { type: "string", multiple: true }, out: { type: "string" },
    } });
    const tools = pairs(values.tool, "--tool");
    const side = checkSide(values.side, values["heldout-ok"]!, [values.goldens, values.out, ...tools.values()]);
    if (!values.goldens || !tools.size || !values.out) throw new RefusalError("usage: location-hit.ts --side dev --goldens <f> --tool name=dir … --out <f>");
    if (fs.existsSync(values.out)) throw new RefusalError(`${values.out} exists; never overwritten`);
    const g = readGoldens(values.goldens);
    if (g.side !== side) throw new RefusalError(`goldens are for side ${g.side}, not ${side}`);
    const bug = g.cases.filter((c) => c.label === "bug");
    const result: Record<string, Record<string, boolean | null>> = {};
    for (const [tool, dir] of tools) {
      const reviews = readReviews(dir, g.cases.map((c) => c.case));
      result[tool] = Object.fromEntries(bug.map((c) => [c.case, reviews.has(c.case) ? locationHit(reviews.get(c.case)!.comments, c.targets) : null]));
      const v = Object.values(result[tool]!);
      log(`${tool}: location hits ${v.filter((x) => x === true).length}/${bug.length} bug cases (${v.filter((x) => x === null).length} without a review file)`);
    }
    writeNew(values.out, JSON.stringify({ v: 1, side, window: 10, tools: result }, null, 1) + "\n");
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
