// scripts/bench/w1-fill.ts on invented summaries: no held-out file, no network.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { condition, evaluate, fill, format, leftovers, main, Resolver } from "../../../scripts/bench/w1-fill.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const dir = mkdtempSync(path.join(tmpdir(), "tracehound-w1fill-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const tool = (caught: number, extra: Record<string, unknown> = {}) => ({
  attempted: 29, bugCases: 20, cleanCases: 9, caught, caughtWilson: [0.2373, 0.5617], completedBug: 20, completedClean: 9,
  noReview: 0, misses: 0, invalidBinding: 0, judgeFailed: 0, caughtX1: 9, judgeFailedX1: 0, handchecked: true,
  comments: { total: 31, perAttempted: { mean: 1.075, median: 1 }, perCompleted: { mean: 1.075, median: 1 }, clean: 2 },
  locationHits: 7, costUSD: { total: 2.0371, perAttemptedMean: 0.070246785, median: 0.0511, max: 0.4373 },
  exposure: { exposed: { bugCases: 0, completedBug: 0, caught: 0 }, unexposed: { bugCases: 20, completedBug: 20, caught } }, ...extra,
});
const pair = (b: string, x: Record<string, unknown>) => ({ a: "tracehound", b, registered: true, n: 20, reviewedByBoth: 20, onlyA: 1, onlyB: 5, both: 6, neither: 8, p: 0.21875, ...x });
const summary = (pairs: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  v: 1, side: "invented", tools: { tracehound: tool(7), coderabbit: tool(11, { invalidBinding: 1, noReview: 2 }), greptile: tool(10) },
  pairs: [...pairs, { a: "coderabbit", b: "greptile", registered: false, n: 20, reviewedByBoth: 20, onlyA: 2, onlyB: 1, p: null }],
  registeredTests: { pairs: [["tracehound", "coderabbit"], ["tracehound", "greptile"]], alpha: 0.05, min_reviewed_by_both: 15 },
  exposure: { exposedBugCases: 0, unexposedBugCases: 20 },
  handcheckGuess: { items: 61, guessed: 40, unsure: 21, right: 15, tools: 3, commonestToolItems: 25 }, ...extra,
});
const C_C = pair("coderabbit", {}), C_G = pair("greptile", { onlyA: 2, onlyB: 2, p: 1 });
const r = (pairs = [C_C, C_G], extra: Record<string, unknown> = {}, values: Record<string, unknown> = {}) =>
  new Resolver({ summary: summary(pairs, extra), values });

describe("w1-fill: outcome[a,b] (W1 §3.2)", () => {
  it("C when p ≥ alpha, whatever the gap", () => {
    expect(r().outcome("tracehound", "coderabbit")).toBe("C");
    expect(r([pair("coderabbit", { onlyA: 0, onlyB: 9, p: 0.0039 }), C_G]).outcome("tracehound", "greptile")).toBe("C");
  });
  it("A when p < alpha and TraceHound is ahead, B when behind", () => {
    expect(r([pair("coderabbit", { onlyA: 8, onlyB: 1, p: 0.039 }), C_G]).outcome("tracehound", "coderabbit")).toBe("A");
    expect(r([pair("coderabbit", { onlyA: 0, onlyB: 6, p: 0.031 }), C_G]).outcome("tracehound", "coderabbit")).toBe("B");
  });
  it("the floor is checked before p: under 15 reviewed by both is floor even with p < alpha", () => {
    expect(r([pair("coderabbit", { reviewedByBoth: 14, onlyA: 0, onlyB: 9, p: 0.0039 }), C_G]).outcome("tracehound", "coderabbit")).toBe("floor");
  });
  it("refuses an unregistered pair, a missing p at or above the floor, and a pair not in the summary", () => {
    expect(() => r().outcome("coderabbit", "greptile")).toThrow(/not a registered pair/);
    expect(() => r([pair("coderabbit", { p: null }), C_G]).outcome("tracehound", "coderabbit")).toThrow(/no p/);
    expect(() => r().outcome("greptile", "tracehound")).toThrow(/no such pair/);
  });
});

describe("w1-fill: expressions, conditions and formats", () => {
  it("sums inherit the parent path, products and G", () => {
    expect(evaluate(r(), "tools.coderabbit.completedBug+completedClean")!.value).toBe(29);
    expect(evaluate(r(), "tools.coderabbit.invalidBinding + tools.greptile.invalidBinding")!.value).toBe(1);
    expect(evaluate(r(), "G[tracehound,coderabbit]")!.value).toBe(4);
    const v = evaluate(r(undefined, {}, { "budget:h1ConsoleRatio": 1.2 }), "tools.tracehound.costUSD.perAttemptedMean×budget:h1ConsoleRatio")!;
    expect(format("x×y", v.value, v.product)).toBe("0.0843");
  });
  it("conditions: comparisons, unicode signs, absent fallback flag = false, flags from --values, undecidable", () => {
    expect(condition(r(), "G[tracehound,coderabbit] ≥ 6")).toBe(false);
    expect(condition(r(), "pairs[tracehound,greptile].onlyA + pairs[tracehound,greptile].onlyB == 0")).toBe(false);
    expect(condition(r(), "tools.tracehound.completedBug+completedClean < 29")).toBe(false);
    expect(condition(r(), "handcheckX1Fallback != true")).toBe(true);
    expect(condition(r(undefined, { handcheckX1Fallback: true }), "handcheckX1Fallback == true")).toBe(true);
    expect(condition(r(undefined, {}, { "secondary-x": 1 }), "secondary:haikuVsA0.meanMinusA0 ≥ −2")).toBeUndefined();
    expect(condition(r(undefined, {}, { "flag:pooledRan": false }), "flag:pooledRan")).toBe(false);
    expect(condition(r(undefined, {}, { "flag:datedDraft": false }), "flag:datedDraft == false")).toBe(true);
    expect(condition(r(), "flag:pooledRan")).toBeUndefined();
    expect(condition(r(), "outcome[tracehound,coderabbit] == C")).toBe(true);
  });
  it("formats as ts-dev.md and the scorer print them", () => {
    expect(format("tools.x.caughtWilson[0]", 0.23733101420380254, false)).toBe("23.7");
    expect(format("tools.x.caughtWilson[1]", 0.5617589138033927, false)).toBe("56.2%");
    expect(format("pairs[a,b].p", 0.21875, false)).toBe("0.219");
    expect(format("pairs[a,b].p", 0.0000019073486328125, false)).toBe("0.00000191");
    expect(format("pairs[a,b].p", null, false)).toBe("–");
    expect(format("tools.x.costUSD.perAttemptedMean", 0.070246785, false)).toBe("0.0702");
    expect(format("tools.x.comments.perCompleted.mean", 1.075, false)).toBe("1.07"); // toFixed, as score-testset.ts and ts-dev.md
    expect(format("tools.x.caught", 7, false)).toBe("7");
    expect(format("R", "medusa (9), payload (5)", false)).toBe("medusa (9), payload (5)");
    expect(format("flag:x", true, false)).toBeUndefined();
  });
});

describe("w1-fill: blocks", () => {
  const text = [
    "Head {{tools.tracehound.caught}} of 20.",
    "{{if outcome[tracehound,coderabbit] == A}}",
    "ahead {{pairs[tracehound,coderabbit].onlyA}}",
    "{{end if}}",
    "{{if outcome[tracehound,coderabbit] == C}}",
    "no difference, p = {{pairs[tracehound,coderabbit].p}}.",
    "{{if G[tracehound,coderabbit] ≥ 6}} Gap {{G[tracehound,coderabbit]}}.{{end if}}",
    "{{if G[tracehound,coderabbit] ≥ 4}} Gap {{G[tracehound,coderabbit]}}.{{end if}}",
    "{{end if}}",
    "Inline: {{if outcome[tracehound,greptile] == C}}none{{end if}}{{if outcome[tracehound,greptile] == A}}more{{end if}}; {{if flag:pooledRan}}pooled{{end if}}.",
    "<!-- legend {{if …}} {{placeholder}} -->",
    "Verdict {{right / wrong / too vague to score}}.",
    "",
  ].join("\n");

  it("keeps the branch that holds, drops the others with their lines, nested and inline, and leaves the rest", () => {
    const { text: out, report } = fill(text, r());
    expect(out).toBe([
      "Head 7 of 20.",
      "no difference, p = 0.219.",
      "Gap 4.",
      "Inline: none; {{if flag:pooledRan}}pooled{{end if}}.",
      "<!-- legend {{if …}} {{placeholder}} -->",
      "Verdict {{right / wrong / too vague to score}}.",
      "",
    ].join("\n"));
    expect(report.kept).toBe(3);
    expect(report.dropped).toBe(3);
    expect(report.undecided.map((u) => u.cond)).toEqual(["flag:pooledRan"]);
    expect(report.left.map((l) => l.name)).toEqual(["right / wrong / too vague to score"]);
    expect(leftovers(out)).toBe(3);
  });
  it("leaves GitHub Actions expressions (a space after the braces) alone, and a $ before a placeholder stays", () => {
    const { text: out, report } = fill("pr: ${{ github.event.pull_request.number }} cost ${{tools.tracehound.costUSD.perAttemptedMean}}", r());
    expect(out).toBe("pr: ${{ github.event.pull_request.number }} cost $0.0702");
    expect(report.left).toEqual([]);
    expect(leftovers(out)).toBe(0);
  });
  it("refuses unbalanced markers and a quote going into TypeScript source", () => {
    expect(() => fill("{{if flag:x}} a", r())).toThrow(/without \{\{end if\}\}/);
    expect(() => fill("a {{end if}}", r())).toThrow(/without \{\{if\}\}/);
    expect(() => fill('"{{R}}"', r(undefined, {}, { R: 'say "x"' }), { tsSource: true })).toThrow(/quote/);
  });
});

describe("w1-fill: the W1 skeleton files on this branch", () => {
  const FILES = ["docs/bench/ts-heldout.md", "docs/bench/results.md", "viewer/lib/benchmark.ts", "README.md"];
  // every name that is neither in the summary nor a stated writer's choice, given as an invented value
  const values: Record<string, unknown> = {
    R: "repo-a (10), repo-b (10), repo-c (9)", "decision-number": "999", "flag:pooledRan": false, "flag:datedDraft": false,
    "budget:h1ConsoleRatio": 1.17, "budget:h1Console": "2.40", "budget:h1Ledger": "2.04", "budget:h2Ledger": "0.10", "budget:h1ConsoleUtc": "t",
  };
  const HUMAN = /^(right \/ wrong|the §3\.2 sentence|choose one|planner-b-draft|vendor-fact-check|ho-score:|h1:|p1:|secondary:|pooled:)/;

  it("every placeholder resolves from the summary or --values, except the writer's choices and the named other sources", () => {
    for (const flag of [false, true]) for (const f of FILES) {
      const res = new Resolver({ summary: summary([C_C, C_G]), values: { ...values, "flag:pooledRan": flag, "flag:datedDraft": flag } });
      const { report } = fill(readFileSync(path.join(ROOT, f), "utf8"), res, { tsSource: f.endsWith(".ts") });
      expect(report.left.filter((l) => !HUMAN.test(l.name)).map((l) => `${f}:${l.line} ${l.name}`)).toEqual([]);
      expect(report.undecided.filter((u) => !/secondary:/.test(u.cond)).map((u) => `${f}:${u.line} ${u.cond} (flags ${flag})`)).toEqual([]);
    }
  });

  it("results.md §11 and the viewer table fill to the same cells", () => {
    const res = new Resolver({ summary: summary([C_C, C_G]), values });
    const md = fill(readFileSync(path.join(ROOT, "docs/bench/results.md"), "utf8"), res).text;
    const ts = fill(readFileSync(path.join(ROOT, "viewer/lib/benchmark.ts"), "utf8"), res, { tsSource: true }).text;
    const section = md.slice(md.indexOf("## 11. Fresh TypeScript PRs"));
    const mdRows = section.split("\n").filter((l) => l.startsWith("| ") && !/^\|[-| ]+\|$/.test(l)).slice(1)
      .map((l) => l.slice(2, -2).split(" | ").map((c) => c.replace(/\*/g, "")));
    expect(mdRows.length).toBe(3);
    for (const row of mdRows) for (const cell of row) expect(ts).toContain(JSON.stringify(cell));
  });

  it("CLI: dry run writes nothing, --out-dir writes, --check fails while writer's choices remain", () => {
    const s = path.join(dir, "summary.json"), v = path.join(dir, "values.json");
    writeFileSync(s, JSON.stringify(summary([C_C, C_G])));
    writeFileSync(v, JSON.stringify(values));
    const f = path.join(dir, "page.md");
    writeFileSync(f, "K {{tools.greptile.caught}}; {{if flag:pooledRan}}x{{end if}}\n");
    const lines: string[] = [];
    expect(main(["--summary", s, "--values", v, f], (l) => lines.push(l))).toBe(0);
    expect(lines.at(-1)).toBe("dry run: nothing written");
    expect(readFileSync(f, "utf8")).toContain("{{");
    expect(main(["--summary", s, "--values", v, "--write", "--check", f], () => {})).toBe(0);
    expect(readFileSync(f, "utf8")).toBe("K 10; \n");
    writeFileSync(f, "{{choose one: a | b}}\n");
    expect(main(["--summary", s, "--write", "--check", f], () => {})).toBe(1);
    expect(main(["--summary", path.join(dir, "missing.json"), f], () => {})).toBe(2);
  });
});
