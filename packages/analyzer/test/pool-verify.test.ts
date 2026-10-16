// pool-verify-v1's pool builder (decision 059): pool rule, reuse check, merge order, determinism.
// Invented review files in a temp dir; no network, no dataset text.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AGREE_LINES, agrees } from "../../../scripts/bench/agree-rule.ts";
import { build, checkReuse, ctxOnlyFindings, dirs, merge } from "../../../scripts/bench/pool-verify.ts";

const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

type F = { path: string; line: number | null; body: string };
const f = (p: string, line: number | null, body: string): F => ({ path: p, line, body });
const verdict = (x: F, v: "keep" | "drop" | null) => ({
  ...x,
  verdict: v,
  reason: v ? "r" : null,
  status: v ? "VERIFIED" : "VERIFY_FAILED",
  attempts: v ? 1 : 2,
});
const put = (file: string, data: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
};

/** One repo "toy" with two pull requests. */
function bench() {
  const root = mkdtempSync(path.join(tmpdir(), "tracehound-pool-test-"));
  temps.push(root);
  const d = dirs(root, "toy");
  const diff1 = [f("src/a.ts", 10, "d1"), f("src/b.ts", 20, "d2"), f("src/c.ts", 5, "d3")];
  const ctx1 = [
    f("./src/a.ts", 13, "c1"), // agrees with d1 (3 apart, path normalised)
    f("src/b.ts", 24, "c2"), // 4 apart: ctx-only
    f("src/c.ts", null, "c3"), // null line: ctx-only
    f("src/z.ts", 5, "c4"), // other path: ctx-only
  ];
  put(path.join(d.diff, "1.json"), { pr_title: "one", comments: diff1 });
  put(path.join(d.ctx, "1.json"), { pr_title: "one", comments: ctx1 });
  put(path.join(d.diffVerdicts, "1.json"), { pr_title: "one", comments: [verdict(diff1[0]!, "drop"), verdict(diff1[1]!, "keep"), verdict(diff1[2]!, null)] });
  const diff2 = [f("x.ts", 1, "e1")];
  put(path.join(d.diff, "2.json"), { pr_title: "two", pr_number: 7, comments: diff2 });
  put(path.join(d.ctx, "2.json"), { pr_title: "two", comments: [] });
  put(path.join(d.diffVerdicts, "2.json"), { pr_title: "two", comments: [verdict(diff2[0]!, "keep")] });
  return { root, d };
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as { comments: F[]; pr_number?: number };
const snapshot = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (p: string) => {
    for (const e of readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) walk(q);
      else out[path.relative(dir, q)] = readFileSync(q, "utf8");
    }
  };
  walk(dir);
  return out;
};

describe("pool rule", () => {
  it("is 058's agreement rule, unchanged", () => {
    expect(AGREE_LINES).toBe(3);
    expect(agrees(f("a/src/x.ts", 10, ""), f("src/x.ts", 13, ""))).toBe(true);
    expect(agrees(f("src/x.ts", 10, ""), f("src/x.ts", 14, ""))).toBe(false);
    expect(agrees(f("src/x.ts", null, ""), f("src/x.ts", null, ""))).toBe(false);
  });

  it("adds ctx findings that agree with none; the 3-line boundary and null lines", () => {
    const diff = [f("p.ts", 10, "d")];
    const ctx = [f("p.ts", 7, "at -3"), f("p.ts", 13, "at +3"), f("p.ts", 6, "at -4"), f("p.ts", 14, "at +4"), f("p.ts", null, "null"), f("q.ts", 10, "other")];
    expect(ctxOnlyFindings(diff, ctx).map((c) => c.body)).toEqual(["at -4", "at +4", "null", "other"]);
    // a null-line review-diff-v1 finding agrees with nothing either
    expect(ctxOnlyFindings([f("p.ts", null, "d")], [f("p.ts", 1, "c")]).map((c) => c.body)).toEqual(["c"]);
  });

  it("build writes ctx-only and the full pool, in order, with counts", () => {
    const { root, d } = bench();
    const counts = build(root, ["toy"]);
    expect(counts).toEqual({ toy: { pulls: 2, diffFindings: 4, ctxFindings: 4, agreed: 1, ctxOnly: 3, ctxOnlyNullLine: 1, pool: 7, reuseChecked: 4 } });
    expect(read(path.join(d.ctxOnly, "1.json")).comments.map((c) => c.body)).toEqual(["c2", "c3", "c4"]);
    expect(read(path.join(d.raw, "1.json")).comments.map((c) => c.body)).toEqual(["d1", "d2", "d3", "c2", "c3", "c4"]);
    expect(read(path.join(d.ctxOnly, "2.json")).comments).toEqual([]);
    expect(read(path.join(d.raw, "2.json")).pr_number).toBe(7);
    // ctx-only paths are kept as review-ctx-v1 wrote them
    expect(read(path.join(d.ctxOnly, "1.json")).comments[0]).toEqual(f("src/b.ts", 24, "c2"));
  });
});

describe("reuse check", () => {
  it("passes when verdicts match by path, line and body", () => {
    expect(() => checkReuse("x", [f("a", 1, "b")], [{ ...f("a", 1, "b"), verdict: "keep" } as F])).not.toThrow();
  });

  it.each([
    ["path", f("b", 1, "b")],
    ["line", f("a", 2, "b")],
    ["body", f("a", 1, "c")],
  ])("a %s mismatch stops", (_, v) => {
    expect(() => checkReuse("x", [f("a", 1, "b")], [v])).toThrow(/reuse check/);
  });

  it("a count mismatch stops", () => {
    expect(() => checkReuse("x", [f("a", 1, "b")], [])).toThrow(/reuse check/);
  });

  it("build stops before writing anything when one verdict does not match", () => {
    const { root, d } = bench();
    put(path.join(d.diffVerdicts, "2.json"), { pr_title: "two", comments: [verdict(f("x.ts", 1, "changed"), "keep")] });
    expect(() => build(root, ["toy"])).toThrow(/reuse check: toy\/2\.json/);
    expect(existsSync(d.ctxOnly)).toBe(false);
    expect(existsSync(d.raw)).toBe(false);
  });
});

describe("merge", () => {
  it("keeps review-diff-v1 by 058 verdicts, then ctx-only by theirs, each in original order", () => {
    const { root, d } = bench();
    build(root, ["toy"]);
    const ctx1 = read(path.join(d.ctxOnly, "1.json")).comments;
    put(path.join(d.ctxOnlyVerdicts, "1.json"), { pr_title: "one", comments: [verdict(ctx1[0]!, "keep"), verdict(ctx1[1]!, "drop"), verdict(ctx1[2]!, null)] });
    put(path.join(d.ctxOnlyVerdicts, "2.json"), { pr_title: "two", comments: [] });
    const counts = merge(root, ["toy"]);
    expect(counts).toEqual({ toy: { pulls: 2, diffIn: 4, diffKept: 3, ctxOnlyIn: 3, ctxOnlyKept: 2, ctxOnlyVerifyFailed: 1, ctxOnlyRetried: 1, kept: 5 } });
    // d1 dropped; d3 VERIFY_FAILED is kept; c3 dropped; c4 VERIFY_FAILED is kept
    expect(read(path.join(d.kept, "1.json")).comments.map((c) => c.body)).toEqual(["d2", "d3", "c2", "c4"]);
    expect(read(path.join(d.kept, "1.json")).comments[0]).toEqual(f("src/b.ts", 20, "d2"));
    expect(read(path.join(d.kept, "2.json")).comments.map((c) => c.body)).toEqual(["e1"]);
  });

  it("stops when a ctx-only verdict does not match its finding", () => {
    const { root, d } = bench();
    build(root, ["toy"]);
    put(path.join(d.ctxOnlyVerdicts, "1.json"), { pr_title: "one", comments: [verdict(f("src/b.ts", 24, "other"), "keep"), verdict(f("src/c.ts", null, "c3"), "keep"), verdict(f("src/z.ts", 5, "c4"), "keep")] });
    put(path.join(d.ctxOnlyVerdicts, "2.json"), { pr_title: "two", comments: [] });
    expect(() => merge(root, ["toy"])).toThrow(/reuse check: toy\/1\.json ctx-only/);
    expect(existsSync(path.join(d.kept, "2.json"))).toBe(false);
  });
});

describe("determinism", () => {
  it("same input, same output byte for byte", () => {
    const outputs = [0, 1].map(() => {
      const { root, d } = bench();
      build(root, ["toy"]);
      const ctx1 = read(path.join(d.ctxOnly, "1.json")).comments;
      put(path.join(d.ctxOnlyVerdicts, "1.json"), { pr_title: "one", comments: ctx1.map((c) => verdict(c, "keep")) });
      put(path.join(d.ctxOnlyVerdicts, "2.json"), { pr_title: "two", comments: [] });
      merge(root, ["toy"]);
      return snapshot(path.join(root, "reviews"));
    });
    expect(Object.keys(outputs[0]!).length).toBeGreaterThan(0);
    expect(outputs[1]).toEqual(outputs[0]);
  });
});
