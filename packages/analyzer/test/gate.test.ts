import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TraceHoundConfig } from "../src/config.ts";
import { parseDiff, newSideLines } from "../src/review/diff.ts";
import { prefilterDiff } from "../src/gate/prefilter.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/gate/prefilter.json", import.meta.url), "utf8")) as {
  lockfiles: string[]; generated: string[]; snapshots: string[];
};
function diff(path = "src/cart.ts", added = "return charge();", removed = "return 0;") {
  return parseDiff(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-${removed}\n+${added}\n`);
}

describe("prefilter", () => {
  it.each(fixture.lockfiles)("lockfile: drops %s, keeps similarly named source", (path) => {
    expect(prefilterDiff(diff(`pkg/${path}`)).dropped).toEqual([{ path: `pkg/${path}`, rule: "lockfile" }]);
    expect(prefilterDiff(diff(`${path}.ts`)).kept).toHaveLength(1);
  });
  it.each(fixture.generated)("generated: drops %s, keeps source", (path) => {
    expect(prefilterDiff(diff(path)).dropped[0]?.rule).toBe("generated");
    expect(prefilterDiff(diff("src/handwritten.ts")).dropped).toEqual([]);
  });
  it.each(["@generated", "DO NOT EDIT"])("generated: marker %s in first five added lines", (marker) => {
    expect(prefilterDiff(diff("src/a.ts", `1\n+2\n+3\n+4\n+// ${marker}`)).dropped[0]?.rule).toBe("generated");
    expect(prefilterDiff(diff("src/a.ts", `1\n+2\n+3\n+4\n+5\n+// ${marker}`)).dropped).toEqual([]);
    expect(prefilterDiff(diff("src/a.ts", "changed", `// ${marker}`)).dropped).toEqual([]);
  });
  it.each(fixture.snapshots)("snapshot: drops %s, keeps snapshot-related source", (path) => {
    expect(prefilterDiff(diff(path)).dropped[0]?.rule).toBe("snapshot");
    expect(prefilterDiff(diff("src/snapshot.ts")).dropped).toEqual([]);
  });
  it.each(["Binary files a/img.png and b/img.png differ", "GIT binary patch"])("binary: %s", (marker) => {
    expect(prefilterDiff(parseDiff(`diff --git a/img.png b/img.png\n${marker}\n`)).dropped).toEqual([{ path: "img.png", rule: "binary" }]);
    expect(prefilterDiff(diff("img.svg")).dropped).toEqual([]);
  });
  it("whitespace: removes only equivalent hunks, preserving text, coordinates and input", () => {
    const files = parseDiff(diff()[0]!.header + "@@ -1 +1 @@\n- a b\n+ab\n@@ -10 +10 @@\n-old()\n+new()\n");
    const original = structuredClone(files);
    const result = prefilterDiff(files);
    expect(result.dropped).toEqual([{ path: "src/cart.ts", rule: "whitespace" }]);
    expect(result.kept[0]!.hunks).toHaveLength(1);
    expect([...newSideLines(result.kept[0]!)]).toEqual([10]);
    expect(result.kept[0]!.text).not.toContain("+ab");
    expect(files).toEqual(original);
    expect(prefilterDiff(diff("a.ts", "a();", "b();")).dropped).toEqual([]);
    expect(prefilterDiff(diff("a.ts", "\t", " ")).kept[0]!.hunks).toEqual([]);
    expect(prefilterDiff(prefilterDiff(files).kept).kept).toEqual(result.kept);
  });
  it("config-ignore: matches repo-relative globs only when configured", () => {
    const options = { ignore: ["src/**", "**/*.fixture.ts"] };
    expect(prefilterDiff(diff(), options).dropped[0]?.rule).toBe("config-ignore");
    expect(prefilterDiff(diff("test/a.fixture.ts"), options).kept).toEqual([]);
    expect(prefilterDiff(diff("lib/a.ts"), options).kept).toHaveLength(1);
    expect(prefilterDiff(diff()).kept).toHaveLength(1);
  });
  it("config-ignore: review.ignore is optional and defaults to [], preserving existing defaults", () => {
    expect(TraceHoundConfig.parse({})).toEqual({ components: {}, ignore: [], entryPoints: [] });
    expect(TraceHoundConfig.parse({ review: {} }).review?.ignore).toEqual([]);
    expect(TraceHoundConfig.parse({ review: { ignore: ["docs/**"] } }).review?.ignore).toEqual(["docs/**"]);
    expect(() => TraceHoundConfig.parse({ review: { ignore: [""] } })).toThrow();
  });
});
