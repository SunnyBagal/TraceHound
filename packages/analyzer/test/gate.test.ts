import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { TraceHoundConfig } from "../src/config.ts";
import { parseDiff, newSideLines } from "../src/review/diff.ts";
import { prefilterDiff } from "../src/gate/prefilter.ts";
import { gateFindings } from "../src/gate/gate.ts";
import type { Candidate, GateContext } from "../src/gate/gate.ts";
import { nitMatch, nitPatterns } from "../src/gate/nits.ts";
import { headReader, main } from "../src/gate/cli.ts";

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

describe("gate CLI", () => {
  const directories: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  function setup(findings: unknown = { findings: [candidate()] }, pr: unknown = { title: "Synthetic input", diff: diff()[0]!.text }) {
    const repo = mkdtempSync(path.join(tmpdir(), "tracehound-gate-"));
    directories.push(repo);
    const input = path.join(repo, "pr.json");
    const records = path.join(repo, "findings.json");
    const out = path.join(repo, "out.json");
    writeFileSync(input, JSON.stringify(pr));
    writeFileSync(records, JSON.stringify(findings));
    return { repo, out, records, args: ["--pr", input, "--findings", records, "--repo", repo, "--out", out],
      result: () => JSON.parse(readFileSync(out, "utf8")) as { kept: Candidate[]; dropped: { rule: string }[]; counts: Record<string, number> } };
  }
  it("accepts recorded findings and pool comments, preserving findings and extra fields", () => {
    for (const field of ["findings", "comments"]) {
      const findings = [{ ...candidate(), extra: "preserved" }];
      const cli = setup({ [field]: findings });
      expect(main(cli.args)).toBe(0);
      expect(cli.result()).toEqual({ kept: findings, dropped: [], counts: {} });
    }
    const cli = setup([candidate()]);
    expect(main(cli.args)).toBe(0);
  });
  it("applies review.ignore and emits per-finding rule counts", () => {
    const cli = setup({ findings: [candidate(), candidate({ body: "Another failure" })] });
    writeFileSync(path.join(cli.repo, "tracehound.json"), JSON.stringify({ review: { ignore: ["src/**"] } }));
    expect(main(cli.args)).toBe(0);
    expect(cli.result().counts).toEqual({ prefiltered: 2 });
    expect(cli.result().kept).toEqual([]);
  });
  it("applies evidence, severity and cap flags", () => {
    const findings = [candidate({ path: "head.ts", source: "contract", severity: "low" }), candidate({ path: "other.ts", source: "tsc", severity: "high" })];
    const cli = setup({ findings });
    writeFileSync(path.join(cli.repo, "head.ts"), "quote();\n");
    writeFileSync(path.join(cli.repo, "other.ts"), "quote();\n");
    expect(main([...cli.args, "--require-evidence"])).toBe(0);
    expect(cli.result().counts).toEqual({ "evidence-missing": 2 });
    for (const f of findings) f.evidence = [{ path: f.path, line: 1, quote: "quote();" }];
    writeFileSync(cli.records, JSON.stringify({ findings }));
    expect(main([...cli.args, "--require-evidence", "--min-severity", "medium", "--max-per-pr", "0"])).toBe(0);
    expect(cli.result().counts).toEqual({ "severity-floor": 1, cap: 1 });
  });
  it("confines reads to real files within the checkout, rejecting traversal, absolute paths and escaping symlinks", () => {
    const cli = setup();
    const outside = setup();
    writeFileSync(path.join(cli.repo, "head.ts"), "head contents");
    symlinkSync(path.join(outside.repo, "pr.json"), path.join(cli.repo, "escape.json"));
    const read = headReader(cli.repo);
    expect(read("head.ts")).toBe("head contents");
    for (const file of ["../pr.json", path.join(outside.repo, "pr.json"), "escape.json", "absent.ts", "."]) expect(read(file)).toBeUndefined();
    expect(ruleFor(candidate({ source: "contract", path: "escape.json" }), context({ readFileAt: read }))).toBe("not-in-diff");
    expect(ruleFor(candidate({ evidence: [{ path: "escape.json", line: 1, quote: "x" }] }), context({ readFileAt: read }))).toBe("evidence-mismatch");
  });
  it.each([["--max-per-pr", "-1"], ["--max-per-pr", "1.5"], ["--max-per-pr", "9007199254740992"], ["--min-severity", "urgent"], ["--unknown"]])("rejects invalid flags %j", (...flags) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cli = setup();
    expect(main([...cli.args, ...flags])).toBe(1);
  });
  it("rejects malformed data without echoing its contents, and requires paths", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cli = setup({ findings: [{ body: "synthetic-sensitive-value" }] });
    expect(main(cli.args)).toBe(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("synthetic-sensitive-value");
    expect(main([])).toBe(1);
  });
  it("refuses declared excluded repository identities (synthetic metadata only)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const repository of ["calcom/cal.com", { full_name: "calcom/cal.com" }]) {
      const cli = setup({ findings: [] }, { repository, diff: "" });
      expect(main(cli.args)).toBe(1);
    }
  });
  it("dispatches tracehound gate from bin.ts without model credentials", () => {
    const cli = setup();
    const env = { ...process.env };
    delete env.NEBIUS_API_KEY;
    const run = spawnSync(process.execPath, [new URL("../src/bin.ts", import.meta.url).pathname, "gate", ...cli.args], { env, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(cli.result().kept).toEqual([candidate()]);
    expect(run.stdout).toBe("");
  });
});

const candidate = (patch: Partial<Candidate> = {}): Candidate => ({ path: "src/cart.ts", line: 1, body: "An empty cart charges the default amount.", ...patch });
const context = (patch: Partial<GateContext> = {}): GateContext => ({
  diff: diff(), readFileAt: (path) => path === "src/cart.ts" ? "return charge();\n" : undefined, suppressions: [], ...patch,
});
const ruleFor = (finding: Candidate, ctx = context()) => gateFindings([finding], ctx).dropped[0]?.rule;

describe("gate", () => {
  it("prefiltered: drops removed paths but retains regular paths and partially filtered files", () => {
    expect(ruleFor(candidate({ path: "yarn.lock" }), context({ diff: diff("yarn.lock") }))).toBe("prefiltered");
    expect(ruleFor(candidate())).toBeUndefined();
    const files = parseDiff(diff()[0]!.text + "@@ -10 +10 @@\n- a b\n+ab\n");
    expect(ruleFor(candidate(), context({ diff: files }))).toBeUndefined();
    expect(ruleFor(candidate({ line: 10 }), context({ diff: files }))).toBe("not-in-diff");
  });
  it("not-in-diff: validates added/context lines, rejecting removed, deleted, absent and null locations", () => {
    const files = parseDiff(diff()[0]!.header + "@@ -1,2 +1,2 @@\n same\n-old\n+new\n");
    for (const line of [1, 2]) expect(ruleFor(candidate({ line }), context({ diff: files }))).toBeUndefined();
    for (const line of [0, 3, null]) expect(ruleFor(candidate({ line }), context({ diff: files }))).toBe("not-in-diff");
    expect(ruleFor(candidate({ path: "missing.ts" }))).toBe("not-in-diff");
    const deleted = parseDiff("diff --git a/src/cart.ts b/src/cart.ts\n--- a/src/cart.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n");
    expect(ruleFor(candidate(), context({ diff: deleted }))).toBe("not-in-diff");
  });
  it.each(["contract", "tsc"])("not-in-diff: %s exemption requires a head file", (source) => {
    expect(ruleFor(candidate({ source, line: null }), context({ diff: [] }))).toBeUndefined();
    expect(ruleFor(candidate({ source, path: "absent.ts", line: null }))).toBe("not-in-diff");
    expect(ruleFor(candidate({ source: "other", line: null }))).toBe("not-in-diff");
  });
  it("evidence-missing: opt-in, missing or empty evidence fails; cited evidence passes", () => {
    const ctx = context({ options: { requireEvidence: true } });
    expect(ruleFor(candidate(), ctx)).toBe("evidence-missing");
    expect(ruleFor(candidate({ evidence: [] }), ctx)).toBe("evidence-missing");
    expect(ruleFor(candidate({ evidence: [{ path: "src/cart.ts", line: 1, quote: "return charge();" }] }), ctx)).toBeUndefined();
    expect(ruleFor(candidate())).toBeUndefined();
  });
  it("evidence-mismatch: trims lines, supports multiline quotes and both ±3 boundaries", () => {
    const ctx = context({ readFileAt: () => "first\nx\ny\n  target();  \n  next();\nz\nlast\n" });
    const evidence = (line: number, quote = "target();"): Candidate => candidate({ evidence: [{ path: "src/cart.ts", line, quote }] });
    for (const line of [1, 4, 7]) expect(ruleFor(evidence(line), ctx)).toBeUndefined();
    expect(ruleFor(evidence(8), ctx)).toBe("evidence-mismatch");
    expect(ruleFor(evidence(1, " target();\n next(); "), ctx)).toBeUndefined();
    expect(ruleFor(evidence(1, "target( );"), ctx)).toBe("evidence-mismatch");
    expect(ruleFor(evidence(0), ctx)).toBe("evidence-mismatch");
    expect(ruleFor(evidence(1, " "), ctx)).toBe("evidence-mismatch");
    expect(ruleFor(evidence(1), context({ readFileAt: () => undefined }))).toBe("evidence-mismatch");
    expect(ruleFor(candidate({ evidence: [evidence(1).evidence![0]!, { path: "src/cart.ts", line: 1, quote: "absent" }] }), ctx)).toBe("evidence-mismatch");
    expect(ruleFor(candidate(), ctx)).toBeUndefined();
  });
  it("style: category drops, functional claims pass", () => {
    expect(ruleFor(candidate({ category: "style" }))).toBe("style");
    expect(ruleFor(candidate({ category: "correctness" }))).toBeUndefined();
  });
  const styleRegressions = JSON.parse(readFileSync(new URL("./fixtures/gate/style-regressions.json", import.meta.url), "utf8")) as { body: string; kept: boolean }[];
  it.each(styleRegressions)("style regression: $body", ({ body, kept }) => {
    const finding = candidate({ body });
    const result = gateFindings([finding], context());
    expect(result.kept).toEqual(kept ? [finding] : []);
    expect(result.dropped.map((drop) => drop.rule)).toEqual(kept ? [] : ["style"]);
    expect(nitMatch(body) === undefined).toBe(kept);
  });
  it.each([
    "crash", "throws", "throw", "exception", "TypeError", "null", "undefined", "NaN", "panic", "fail", "fails", "error", "wrong", "incorrect",
    "broken", "breaks", "never", "always", "leak", "race", "overflow", "off-by-one", "injection", "XSS", "unauthorized", "bypass", "data loss",
    "deadlock", "infinite loop", "regression", "is never set", "returns an empty list instead of the saved records",
  ])("style: runtime signal %s protects a nit-shaped report", (signal) => {
    const body = `Consider the runtime defect: ${signal}.`;
    expect(nitMatch(body)).toBeUndefined();
    expect(ruleFor(candidate({ body }))).toBeUndefined();
  });
  it.each([
    { category: "contract" }, { source: "contract" }, { source: "tsc" },
    { source: "contract", category: "style" }, { source: "tsc", category: "style" },
  ])("style: contract/compiler findings are exempt: %j", (patch) => {
    expect(ruleFor(candidate({ body: "Consider renaming this variable for clarity.", ...patch }))).toBeUndefined();
  });
  it("style: explicit style category still drops defect-shaped prose without an exemption", () => {
    expect(ruleFor(candidate({ category: "style", body: styleRegressions[0]!.body }))).toBe("style");
  });
  const nits = JSON.parse(readFileSync(new URL("./fixtures/gate/nits.json", import.meta.url), "utf8")) as { id: string; positive: string; negative: string }[];
  it("style: every reviewed pattern has a fixture", () => {
    expect(nits.map((f) => f.id)).toEqual(nitPatterns.map((p) => p.id));
  });
  it.each(nits)("style: $id positive and negative", ({ id, positive, negative }) => {
    expect(nitMatch(positive)).toBe(id);
    expect(ruleFor(candidate({ body: positive }))).toBe("style");
    expect(nitMatch(negative)).toBeUndefined();
    expect(ruleFor(candidate({ body: negative }))).toBeUndefined();
  });
  it("suppressed: uses an injected fingerprint matcher", () => {
    const ctx = context({ suppressions: [{ matches: (f) => f.body === "fingerprint match" }] });
    expect(ruleFor(candidate({ body: "fingerprint match" }), ctx)).toBe("suppressed");
    expect(ruleFor(candidate(), ctx)).toBeUndefined();
    expect(ruleFor(candidate({ body: "fingerprint match" }))).toBeUndefined();
  });
  it("duplicate: same normalized path within 3; votes, severity, then earliest win", () => {
    const ctx = context({ diff: [], readFileAt: () => "head" });
    const base = candidate({ source: "contract" });
    const cases: [Partial<Candidate>, Partial<Candidate>, number][] = [
      [{ votes: 1, severity: "critical" }, { votes: 2, severity: "low" }, 1],
      [{ votes: 2, severity: "low" }, { votes: 2, severity: "high" }, 1],
      [{ votes: 2, severity: "high" }, { votes: 2, severity: "high" }, 0],
      [{}, {}, 0],
    ];
    for (const [a, b, winner] of cases) {
      const inputs = [{ ...base, ...a }, { ...base, path: "./b/src/cart.ts", line: 4, ...b }];
      const result = gateFindings(inputs, ctx);
      expect(result.kept).toEqual([inputs[winner]]);
      expect(result.dropped[0]?.rule).toBe("duplicate");
    }
    for (const patch of [{ line: 5 }, { path: "different.ts" }, { line: null }]) {
      expect(gateFindings([base, { ...base, ...patch }], ctx).dropped).toEqual([]);
    }
  });
  it("severity-floor: opt-in; equal, higher and unspecified severities pass", () => {
    const ctx = context({ options: { minSeverity: "medium" } });
    expect(ruleFor(candidate({ severity: "low" }), ctx)).toBe("severity-floor");
    for (const severity of [undefined, "medium", "high", "critical"] as const) expect(ruleFor(candidate({ severity }), ctx)).toBeUndefined();
    expect(ruleFor(candidate({ severity: "low" }))).toBeUndefined();
  });
  it("cap: ranks votes, severity, then order, retaining selected input order", () => {
    const inputs = [candidate({ path: "a", votes: 1, severity: "critical" }), candidate({ path: "b", votes: 2, severity: "low" }),
      candidate({ path: "c", votes: 2, severity: "high" }), candidate({ path: "d", votes: 2, severity: "high" })].map((f) => ({ ...f, source: "contract" }));
    const ctx = context({ readFileAt: () => "head", options: { maxPerPr: 2 } });
    const result = gateFindings(inputs, ctx);
    expect(result.kept).toEqual(inputs.slice(2));
    expect(result.dropped.map((d) => d.rule)).toEqual(["cap", "cap"]);
    expect(gateFindings(inputs, { ...ctx, options: {} }).kept).toEqual(inputs);
    expect(gateFindings(inputs, { ...ctx, options: { maxPerPr: 4 } }).dropped).toEqual([]);
    expect(gateFindings(inputs, { ...ctx, options: { maxPerPr: 0 } }).kept).toEqual([]);
    expect(() => gateFindings(inputs, { ...ctx, options: { maxPerPr: -1 } })).toThrow();
  });
  it("runs rules in the specified order", () => {
    const ctx = context({ diff: [...diff(), ...diff("yarn.lock")], options: { requireEvidence: true, minSeverity: "high", maxPerPr: 0 }, suppressions: [{ matches: () => true }] });
    expect(ruleFor(candidate({ path: "yarn.lock", category: "style" }), ctx)).toBe("prefiltered");
    expect(ruleFor(candidate({ line: 50, category: "style" }), ctx)).toBe("not-in-diff");
    expect(ruleFor(candidate({ category: "style" }), ctx)).toBe("evidence-missing");
    const bad = candidate({ evidence: [{ path: "src/cart.ts", line: 1, quote: "bad" }], category: "style" });
    expect(ruleFor(bad, ctx)).toBe("evidence-mismatch");
    const good = candidate({ evidence: [{ path: "src/cart.ts", line: 1, quote: "return charge();" }] });
    expect(ruleFor({ ...good, category: "style" }, ctx)).toBe("style");
    expect(ruleFor(good, ctx)).toBe("suppressed");
    const ranked = [{ ...good, votes: 1, severity: "critical" as const }, { ...good, votes: 2, severity: "low" as const }];
    expect(gateFindings(ranked, { ...ctx, suppressions: [] }).dropped.map((d) => d.rule)).toEqual(["duplicate", "severity-floor"]);
    expect(ruleFor({ ...good, severity: "high" }, { ...ctx, suppressions: [] })).toBe("cap");
  });
  it("is idempotent across deterministic generated pools and options, including overlapping duplicate neighborhoods", () => {
    let seed = 42;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let run = 0; run < 80; run++) {
      const inputs = Array.from({ length: 30 }, (_, i) => candidate({ path: `src/${random() % 4}.ts`, line: (random() % 15) + 1,
        source: "contract", votes: random() % 4, severity: (["low", "medium", "high", undefined] as const)[random() % 4], body: i % 9 === 0 ? "Nit: shorter name" : `Failure ${i}` }));
      const original = structuredClone(inputs);
      const ctx = context({ readFileAt: () => "head", options: { ...(run % 2 ? { maxPerPr: 7 } : {}), ...(run % 3 ? { minSeverity: "medium" as const } : {}) } });
      const once = gateFindings(inputs, ctx);
      expect(gateFindings(once.kept, ctx)).toEqual({ kept: once.kept, dropped: [] });
      expect(inputs).toEqual(original);
    }
    const chain = [1, 4, 7].map((line) => candidate({ line, source: "contract" }));
    expect(gateFindings(chain, context()).kept.map((f) => f.line)).toEqual([1, 7]);
  });
  it("pool-verify-v1 output comments pass through unchanged when no rule fires (synthetic fixture)", () => {
    const output = JSON.parse(readFileSync(new URL("./fixtures/gate/pool-verify-v1.json", import.meta.url), "utf8")) as { comments: Candidate[] };
    const result = gateFindings(output.comments, context({ diff: [...diff(), ...diff("src/session.ts")] }));
    expect(result).toEqual({ kept: output.comments, dropped: [] });
    expect(result.kept[0]).toBe(output.comments[0]);
  });
});
