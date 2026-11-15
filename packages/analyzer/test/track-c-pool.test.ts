// The pooling rule of A/B 3 (sidetrack/ab3-plan.md): fixed before any run, no model.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { poolReviews } from "../../../scripts/track-c/pool-reviews.ts";

const c = (p: string, line: number | null, body: string) => ({ path: p, line, body });
const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("track C pooling rule", () => {
  it("keeps the primary's wording for a shared finding and adds only what the primary did not say", () => {
    const primary = [c("a.ts", 10, "P1"), c("b.ts", 40, "P2")];
    const second = [c("./b.ts", 42, "S same as P2"), c("a.ts", 14, "S new: 4 lines away"), c("c.ts", 1, "S new file")];
    const { comments, counts } = poolReviews(primary, second);
    expect(comments.map((x) => x.body)).toEqual(["P2", "P1", "S new: 4 lines away", "S new file"]);
    expect(counts).toEqual({ primary: 2, second: 3, both: 1, added: 2, cut: 0, pooled: 4 });
  });

  it("never treats comments without a line as the same finding, and equals the primary when the second is empty", () => {
    expect(poolReviews([c("a.ts", null, "P")], [c("a.ts", null, "S")]).comments.map((x) => x.body)).toEqual(["P", "S"]);
    const primary = [c("a.ts", 1, "P1"), c("a.ts", 30, "P2")];
    expect(poolReviews(primary, []).comments).toEqual(primary);
    expect(poolReviews([], primary).counts).toMatchObject({ both: 0, added: 2, pooled: 2 });
  });

  it("caps the pooled review at one reviewer's limit, cutting the second's additions first", () => {
    const primary = [1, 2, 3, 4, 5].map((n) => c("a.ts", n * 100, `P${n}`));
    const second = [c("a.ts", 301, "S shared"), c("z.ts", 1, "S6"), c("z.ts", 50, "S7")];
    const { comments, counts } = poolReviews(primary, second);
    expect(comments.map((x) => x.body)).toEqual(["P3", "P1", "P2", "P4", "P5", "S6"]);
    expect(counts).toMatchObject({ both: 1, added: 2, cut: 1, pooled: 6 });
  });
});

describe("track C pooling CLI", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "th-pool-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (sub: string, file: string, value: unknown) => {
    mkdirSync(path.join(dir, sub), { recursive: true });
    writeFileSync(path.join(dir, sub, file), JSON.stringify(value));
  };
  const run = (out: string) => spawnSync(process.execPath, [path.join(ROOT, "scripts/track-c/pool-reviews.ts"), "--primary", path.join(dir, "p"), "--second", path.join(dir, "s"), "--out", path.join(dir, out)], { encoding: "utf8" });

  it("writes one pooled review per case and the counts, and never overwrites", () => {
    write("p", "case-1.json", { pr_title: "T1", comments: [c("a.ts", 5, "P")] });
    write("s", "case-1.json", { pr_title: "T1", comments: [c("a.ts", 6, "S dup"), c("b.ts", 2, "S new")] });
    write("p", "case-2.json", { pr_title: "T2", comments: [] });
    write("s", "case-2.json", { pr_title: "T2", comments: [] });
    const r = run("out");
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, "out/case-1.json"), "utf8"))).toEqual({ pr_title: "T1", comments: [c("a.ts", 5, "P"), c("b.ts", 2, "S new")] });
    expect(JSON.parse(readFileSync(path.join(dir, "out/pool-counts.json"), "utf8"))).toMatchObject({ files: 2, total: { primary: 1, second: 2, both: 1, added: 1, cut: 0, pooled: 2 } });
    expect(run("out").status).toBe(2);
  });

  it("refuses two directories that do not hold the same cases", () => {
    write("s", "case-3.json", { pr_title: "T3", comments: [] });
    const r = run("out2");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must hold the same review files");
  });
});
