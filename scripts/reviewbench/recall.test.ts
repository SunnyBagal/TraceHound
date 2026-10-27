import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_FINDINGS, toRecallFindings } from "./adapter.ts";
import { PIPELINES, readRecall, readSettings } from "./entry.ts";

// recall-v3 (decision 070) is additive: the functions every other pipeline runs are byte-identical
// to main before 070 (sha256 of each function's source text, taken from origin/main at f488cef), and
// readSettings differs only in the configuration error's wording. recall-v3's own conversion keeps
// ranges, anchors null lines and caps at 60.
const HERE = import.meta.dirname;
function fnHash(file: string, name: string): string {
  const src = readFileSync(path.join(HERE, file), "utf8");
  const m = new RegExp(`^(export )?(async )?function ${name}\\b[\\s\\S]*?\\n}\\n`, "m").exec(src);
  return m ? createHash("sha256").update(m[0]).digest("hex") : "missing";
}

describe("existing pipelines are unchanged", () => {
  it.each([
    ["entry.ts", "poolVerify", "fa876bdf2158a1b3b41d80a2d6a8f61e9de93117ed426031b34d393261940519"],
    ["entry.ts", "readReview", "17e52f3b9cba185dff42df7ab77a8fee1f12b5678ae1b2d5301a0b0dabaa52f9"],
    ["entry.ts", "reportPass", "d2a2aba8f8bbc3110620df29cb3f3da609a12ae3a19ab09c09105aee5015ba59"],
    ["entry.ts", "poolRaw", "608837a7a7610eee03589f94e46dac4037d6c4b5605412c7b2e8d06e8db7bc4e"],
    ["entry.ts", "poolRawX2", "0b8a38d2a5471cafb97b2559cc34814850f88a9ac23f498b4afae857a1a8f490"],
    ["entry.ts", "poolRawMissed", "349cba4e58573a8b7ecede7f66385dcdc22d2e4c7423c193c25575ecdd1c203d"],
    ["entry.ts", "abortableExec", "d3f789d7cc7e42f81fd536b3d567a5894f80b0905334c54a32760eb7b319e345"],
    ["entry.ts", "reason", "b737a8a7562c1f9f1290469e5811f75f304e9e79795c1ef1dcf78a60a90d49db"],
    ["adapter.ts", "toInput", "2fe10a7b3a121a505bd93d75d4400f12554765d11b201b7018a10b3682eac59c"],
    ["adapter.ts", "toFindings", "e441cf14fb7bbee80820d41374113193d97ead69ab023d165d2722d95be80f5e"],
    ["adapter.ts", "unionFindings", "1a2232798e796f3511ae2a83b68cad12708e99501bda1a2ec874d4e36ee525f6"],
  ])("%s %s", (file, name, sha) => expect(fnHash(file, name)).toBe(sha));

  it("keeps the four pipelines, in order, and MAX_FINDINGS 40; recall-v3 is added after them", () => {
    expect(PIPELINES).toEqual(["pool-verify-v1", "pool-raw", "pool-raw-x2", "pool-raw-missed", "recall-v3"]);
    expect(MAX_FINDINGS).toBe(40);
  });

  it("accepts recall-v3 outside the image (it never clears the cache)", () => {
    const env = { RB_OUT: "/o.json", RB_HEAD: "abc", RB_PR_NUMBER: "3", NEBIUS_API_KEY: "k", RB_CONFIG_PIPELINE: "recall-v3" };
    expect(readSettings(env).pipeline).toBe("recall-v3");
  });
});

describe("recall-v3 conversion", () => {
  const diff = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -4,1 +4,3 @@\n ctx\n+one\n+two\n";

  it("keeps ranges, anchors a null line to the file's first changed line, line 1 outside the diff", () => {
    const out = toRecallFindings([
      { path: "./src/a.ts", line: 5, start_line: 5, end_line: 6, body: " range " },
      { path: "src/a.ts", line: null, start_line: null, end_line: null, body: "file level" },
      { path: "src/other.ts", line: null, body: "elsewhere" },
      { path: "src/a.ts", line: 9, start_line: 9, end_line: 2, body: "reversed" },
      { path: "", line: 1, body: "no path" },
      { path: "src/a.ts", line: 1, body: "   " },
    ], "tracehound", diff);
    expect(out.findings).toEqual([
      { file: "src/a.ts", start_line: 5, end_line: 6, message: "range", producer: "tracehound" },
      { file: "src/a.ts", start_line: 5, end_line: 5, message: "file level", producer: "tracehound" },
      { file: "src/other.ts", start_line: 1, end_line: 1, message: "elsewhere", producer: "tracehound" },
      { file: "src/a.ts", start_line: 9, end_line: 9, message: "reversed", producer: "tracehound" },
    ]);
    expect(out.dropped).toEqual({ noLine: 0, empty: 2 });
  });

  it("caps at 60", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ path: "src/a.ts", line: 5, start_line: 5, end_line: 5, body: `f${i}` }));
    const out = toRecallFindings(many, "p", diff);
    expect(out.findings).toHaveLength(60);
    expect(out.capped).toBe(10);
    expect(out.findings.at(-1)!.message).toBe("f59");
  });
});

describe("readRecall", () => {
  const ctx = () => {
    const seen: [number, number][] = [];
    const lines: string[] = [];
    return { seen, lines, c: { log: (l: string) => lines.push(l), reportChunks: (f: number, n: number) => seen.push([f, n]) } };
  };

  it("returns findings with ranges and reports failed lens calls", () => {
    const { seen, c } = ctx();
    const out = readRecall({ comments: [{ path: "a.ts", line: 3, start_line: 3, end_line: 4, body: "x", producer: "lensA" }], review: { calls: [{ status: "OK" }, { status: "FAILED", failure: "HTTP 500" }], missed: { status: "OK" } } }, c);
    expect(out).toEqual([{ path: "a.ts", line: 3, start_line: 3, end_line: 4, body: "x" }]);
    expect(seen).toEqual([[1, 2]]);
  });

  it("fails the pull request only when every lens call failed and nothing was found", () => {
    const { c } = ctx();
    expect(() => readRecall({ comments: [], review: { calls: [{ status: "FAILED", failure: "HTTP 429: slow down" }] } }, c)).toThrow(/every lens call failed \(first: HTTP 429: slow down\)/);
    expect(readRecall({ comments: [], review: { calls: [{ status: "OK" }] } }, c)).toEqual([]);
    expect(() => readRecall({ nope: 1 }, c)).toThrow(/invalid output/);
  });
});
