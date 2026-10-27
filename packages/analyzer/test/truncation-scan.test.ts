// scripts/bench/truncation-scan.ts on an invented cache directory: counts only, no network.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main, NOTE, scan } from "../../../scripts/bench/truncation-scan.ts";

const MODEL = "invented/model";
const dir = mkdtempSync(path.join(tmpdir(), "tracehound-scan-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const body = (finish_reason: string | undefined, content: string | null, model = MODEL) =>
  ({ model, choices: [{ ...(finish_reason !== undefined && { finish_reason }), message: { content } }] });
const files: Record<string, unknown> = {
  "a.json": body("stop", '{"findings":[]}'),
  "b.json": body("length", ""),
  "c.json": body("length", null),
  "d.json": body("length", '{"findings":[{"path":"src/a.ts","line":3,"bo'),
  "e.json": body("length", '```json\n{"findings":[]}\n```'),
  "f.json": body("length", '{"verdict":"keep","reason":"real"}'),
  "g.json": body("length", 'Here it is:\n```json\n{"findings":[]}\n```'),
  "h.json": body(undefined, "x"),
  "i.json": body("length", "", "other/model"),
};
for (const [name, value] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(value));
writeFileSync(path.join(dir, "j.json"), "{not json");
writeFileSync(path.join(dir, "k.json.tmp"), "{}");

describe("truncation scan", () => {
  it("counts finish_reason and splits length into empty / unparseable / parseable (strict parsers)", () => {
    expect(scan(dir, MODEL)).toEqual({
      total: 8, otherModels: 1, unreadable: 1,
      byFinishReason: { stop: 1, length: 6, "(none)": 1 },
      length: { contentEmpty: 2, unparseable: 2, parseable: 2 },
    });
  });

  it("prints the undercount note first, then counts only", () => {
    const lines: string[] = [];
    expect(main(["--cache", dir, "--model", MODEL], l => lines.push(l))).toBe(0);
    expect(lines.slice(0, NOTE.length)).toEqual(NOTE);
    expect(lines.slice(NOTE.length)).toEqual([
      `model ${MODEL}: 8 cached responses (1 for other models, 1 unreadable, skipped)`,
      "finish_reason (none): 1",
      "finish_reason length: 6",
      "finish_reason stop: 1",
      "length: content empty 2, content present but unparseable 2, parseable 2",
    ]);
    expect(lines.join("\n")).not.toContain("findings");
  });

  it("refuses without --cache/--model or with a missing directory", () => {
    const lines: string[] = [];
    expect(main(["--model", MODEL], l => lines.push(l))).toBe(2);
    expect(main(["--cache", path.join(dir, "missing"), "--model", MODEL], l => lines.push(l))).toBe(2);
    expect(lines).toEqual(["usage: node scripts/bench/truncation-scan.ts --cache <dir> --model <id>", `no cache directory at ${path.join(dir, "missing")}`]);
  });
});
