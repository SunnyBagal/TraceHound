// The Track B scoring kit (B2; scripts/testset/): Wilson and the exact sign test, the side guard, location hits,
// build-goldens (multi-file primary by git order, preflight), score-testset, the blind hand-check sheet, and the
// read-only tool-comment collector against a fake gh. Synthetic fixtures only; no model, no network.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import { GoldenFile } from "../../analyzer/src/bench/types.ts";
import { checkSide, commentHits, locationHit, RefusalError, shuffled, signTest, wilson, type Target } from "../../../scripts/testset/kit.ts";
import { main as buildMain } from "../../../scripts/testset/build-goldens.ts";
import { main as scoreMain } from "../../../scripts/testset/score-testset.ts";
import { main as sheetMain } from "../../../scripts/testset/handcheck-sheet.ts";
import { main as hitMain } from "../../../scripts/testset/location-hit.ts";
import { assertGhRead, main as collectMain } from "../../../scripts/testset/collect-tool-reviews.ts";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "th-kit-")); dirs.push(d); return d; };
const json = (f: string, v: unknown) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1)); };
const run = (fn: (a: string[], log: (l: string) => void) => number, args: string[]) => { const out: string[] = []; const code = fn(args, (l) => out.push(l)); return { code, out: out.join("\n") }; };

describe("kit", () => {
  it("Wilson 95% without continuity correction and the exact two-sided sign test", () => {
    const w10 = wilson(10, 20)!, w5 = wilson(5, 20)!;
    expect([w10[0], w10[1]].map((x) => +x.toFixed(3))).toEqual([0.299, 0.701]);
    expect([w5[0], w5[1]].map((x) => +x.toFixed(3))).toEqual([0.112, 0.469]);
    expect(wilson(0, 0)).toBeNull();
    expect(signTest(6, 0)).toBeCloseTo(0.03125, 10);
    expect(signTest(5, 0)).toBeCloseTo(0.0625, 10);
    expect(signTest(7, 1)).toBeCloseTo(0.0703125, 10);
    expect(signTest(1, 8)).toBeCloseTo(0.0390625, 10);
    expect(signTest(10, 2)).toBeCloseTo(0.03857421875, 10);
    expect(signTest(0, 0)).toBe(1);
    expect(signTest(3, 3)).toBe(1);
  });

  it("the side guard: --side required, held-out needs --heldout-ok, dev refuses held-out paths", () => {
    expect(() => checkSide(undefined, false, [])).toThrow(RefusalError);
    expect(() => checkSide("heldout", false, [])).toThrow(/needs --heldout-ok/);
    expect(checkSide("heldout", true, ["/x/heldout/y"])).toBe("heldout");
    expect(() => checkSide("dev", false, ["/data/heldout/labels.jsonl"])).toThrow(/refuses a held-out path/);
    expect(checkSide("dev", false, ["/data/dev/heldout-notes-not-a-segment.json", undefined])).toBe("dev");
  });

  it("location hit: ±10 lines of any target, inclusive; null lines and other files never hit", () => {
    const t: Target[] = [{ file: "a.ts", lines: [50, 55], role: "primary" }, { file: "b.ts", lines: [5, 5], role: "alternate" }];
    expect(commentHits({ path: "a.ts", line: 40, body: "" }, t)).toBe(true);
    expect(commentHits({ path: "a.ts", line: 65, body: "" }, t)).toBe(true);
    expect(commentHits({ path: "a.ts", line: 66, body: "" }, t)).toBe(false);
    expect(commentHits({ path: "a.ts", line: null, body: "" }, t)).toBe(false);
    expect(commentHits({ path: "b.ts", line: 15, body: "" }, t)).toBe(true);
    expect(commentHits({ path: "c.ts", line: 50, body: "" }, t)).toBe(false);
    expect(locationHit([], t)).toBe(false);
  });

  it("a seeded shuffle is reproducible and seed-dependent", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffled(xs, 7)).toEqual(shuffled(xs, 7));
    expect(shuffled(xs, 7)).not.toEqual(shuffled(xs, 8));
    expect([...shuffled(xs, 7)].sort((a, b) => a - b)).toEqual(xs);
  });
});

// a tiny repo "web": base → introducing head (case-1) → fix touching src/b.ts and src/a.ts (git lists a before b)
function goldensFixture() {
  const d = tmp();
  const repo = path.join(d, "repos", "web");
  const env = { ...cleanGitEnv(), GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  const git = (...a: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8", env }).trim();
  mkdirSync(path.join(repo, "src"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
  const lines = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `// ${tag} ${i + 1}`).join("\n") + "\n";
  writeFileSync(path.join(repo, "src/a.ts"), lines(30, "a")); writeFileSync(path.join(repo, "src/b.ts"), lines(30, "b"));
  git("add", "-A"); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
  writeFileSync(path.join(repo, "src/a.ts"), lines(40, "a2")); writeFileSync(path.join(repo, "src/b.ts"), lines(40, "b2"));
  git("add", "-A"); git("commit", "-qm", "introduce"); const head = git("rev-parse", "HEAD");
  writeFileSync(path.join(repo, "src/a.ts"), lines(40, "a3")); writeFileSync(path.join(repo, "src/b.ts"), lines(40, "b3"));
  git("add", "-A"); git("commit", "-qm", "fix"); const fix = git("rev-parse", "HEAD");
  const manifest = [
    { id: "case-1", repo: "web", title: "Bug PR", base_sha: base, case_head_sha: head, head_sha: head },
    { id: "case-2", repo: "web", title: "Clean PR", base_sha: base, case_head_sha: head, head_sha: head },
  ];
  json(path.join(d, "dev", "manifest.json"), manifest);
  const labels = path.join(d, "dev", "labels.jsonl");
  writeFileSync(labels, [
    { id: "case-1", label: "bug", role: "primary", file: "src/b.ts", lines_at_head: [10, 12], fix_sha: fix, introducing_sha: head, description: "the defect" },
    { id: "case-1", label: "bug", role: "note", file: "src/a.ts", lines_at_head: [1, 2], fix_sha: "f".repeat(40), introducing_sha: head, description: "another defect" },
    { id: "case-2", label: "clean", checked_until_sha: fix },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const overlay = path.join(d, "dev", "overlay.json");
  json(overlay, { v: 1, alternates: [{ case: "case-1", file: "src/a.ts", lines_at_head: [20, 22], fix_sha: fix, reason: "same defect, second copy" }] });
  return { d, repo, base, head, fix, manifest, labels, overlay, repos: path.join(d, "repos") };
}

describe("build-goldens", () => {
  it("primary by git's path order of the fix, alternates only from the overlay, a High golden per bug, none for clean", () => {
    const f = goldensFixture();
    const out = path.join(f.d, "dev", "goldens");
    const r = run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--overlay", f.overlay, "--repos", f.repos, "--out", out]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`goldens: 2 cases (1 bug, 1 clean), 1 alternate target(s) in 1 case(s) -> ${out}`);
    const g = JSON.parse(readFileSync(path.join(out, "goldens.json"), "utf8"));
    // the labeller's primary was src/b.ts; src/a.ts comes first in git's order, so it is the primary by rule
    expect(g.cases[0].targets).toEqual([{ file: "src/a.ts", lines: [20, 22], role: "primary" }, { file: "src/b.ts", lines: [10, 12], role: "alternate" }]);
    expect(g.cases[0].description).toBe("the defect"); // the note row (another fix) is not a target
    expect(g.cases[1]).toEqual({ case: "case-2", pr_title: "Clean PR", label: "clean", targets: [] });
    const bench = GoldenFile.parse(JSON.parse(readFileSync(path.join(out, "bench-golden.json"), "utf8")));
    expect(bench.map((b) => [b.pr_title, b.comments.length, b.comments[0]?.severity])).toEqual([["Bug PR", 1, "High"], ["Clean PR", 0, undefined]]);
    expect(bench[0]!.comments[0]!.comment).toContain("src/a.ts:20-22; src/b.ts:10-12");
    // never overwrites
    const again = run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--repos", f.repos, "--out", out]);
    expect(again.code).toBe(2);
    expect(again.out).toMatch(/exists; never overwritten/);
  });

  it("preflight errors refuse the build and write nothing", () => {
    const f = goldensFixture();
    const bad = path.join(f.d, "dev", "bad-overlay.json");
    json(bad, { v: 1, alternates: [
      { case: "case-1", file: "src/a.ts", lines_at_head: [20, 99], fix_sha: f.fix, reason: "range past the end" },
    ] });
    const out = path.join(f.d, "dev", "g2");
    const r = run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--overlay", bad, "--repos", f.repos, "--out", out]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("preflight error: case-1: target range past the end of the file at the case head");
    expect(existsSync(out)).toBe(false);
    json(bad, { v: 1, alternates: [{ case: "case-1", file: "src/a.ts", lines_at_head: [20, 22], fix_sha: "f".repeat(40), reason: "other fix" }] });
    expect(run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--overlay", bad, "--repos", f.repos, "--out", out]).out)
      .toContain("overlay alternate names another fix");
    const noLabel = path.join(f.d, "dev", "empty.jsonl");
    writeFileSync(noLabel, "");
    expect(run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", noLabel, "--repos", f.repos, "--out", out]).out)
      .toContain("preflight error: case-1: no label of record");
    expect(run(buildMain, ["--side", "heldout", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--repos", f.repos, "--out", out]).out)
      .toMatch(/needs --heldout-ok/);
  });
});

// scoring: 3 bug cases + 1 clean; tools "th" (records: case-3 failed → miss) and "cr" (case-2 no review)
function scoringFixture() {
  const d = tmp();
  const goldens = path.join(d, "dev", "goldens.json");
  const t = (file: string, a: number, b: number, role: "primary" | "alternate" = "primary") => ({ file, lines: [a, b], role });
  json(goldens, { v: 1, side: "dev", cases: [
    { case: "c1", pr_title: "P1", label: "bug", targets: [t("x.ts", 10, 12)], description: "bug one" },
    { case: "c2", pr_title: "P2", label: "bug", targets: [t("y.ts", 5, 5), t("z.ts", 40, 41, "alternate")], description: "bug two" },
    { case: "c3", pr_title: "P3", label: "bug", targets: [t("w.ts", 1, 3)], description: "bug three" },
    { case: "c4", pr_title: "P4", label: "clean", targets: [] },
  ] });
  const review = (tool: string, id: string, title: string, comments: { path: string; line: number | null; body: string }[]) =>
    json(path.join(d, "dev", tool, `${id}.json`), { pr_title: title, comments });
  review("th", "c1", "P1", [{ path: "x.ts", line: 11, body: "alpha finds bug one" }, { path: "x.ts", line: 90, body: "alpha noise" }]);
  review("th", "c2", "P2", [{ path: "z.ts", line: 50, body: "alpha alt-file comment <!-- tracehound:v1 {} -->" }]);
  review("th", "c3", "P3", [{ path: "w.ts", line: 2, body: "alpha on a failed case" }]);
  review("th", "c4", "P4", [{ path: "q.ts", line: 1, body: "alpha on clean" }]);
  review("cr", "c1", "P1", [{ path: "x.ts", line: 30, body: "beta misses" }]);
  review("cr", "c3", "P3", [{ path: "w.ts", line: 3, body: "beta finds bug three" }]);
  review("cr", "c4", "P4", []);
  const detail = (tool: string, matches: Record<string, (string | null)[]>, failed: string[] = []) => json(path.join(d, "dev", `${tool}.detail.json`), {
    detail: Object.entries(matches).map(([title, m]) => {
      const id = `c${title.slice(1)}`;
      const r = JSON.parse(readFileSync(path.join(d, "dev", tool, `${id}.json`), "utf8"));
      return { prTitle: title, status: failed.includes(title) ? "JUDGE_FAILED" : "SCORED",
        comments: r.comments.map((c: object, i: number) => ({ ...c, matched: m[i] ?? null })) };
    }) });
  detail("th", { P1: ["G1", null], P2: ["G1"], P3: ["G1"], P4: [null] });
  detail("cr", { P1: [null], P3: ["G1"], P4: [] });
  json(path.join(d, "dev", "th-x1.detail.json"), { detail: [{ prTitle: "P1", status: "SCORED", comments: [{ path: "x.ts", line: 11, body: "alpha finds bug one", matched: null }, { path: "x.ts", line: 90, body: "alpha noise", matched: null }] }] });
  // runner records for th: c3 failed (a miss), costs per case
  for (const [id, status, cost] of [["c1", "ok", 0.05], ["c2", "ok", 0.07], ["c3", "failed", 0.02], ["c4", "ok", 0.04]] as const) {
    json(path.join(d, "dev", "th-records", `${id}.json`), { case: id, status, usage: { ledger: { costUSD: cost } } });
  }
  json(path.join(d, "dev", "th-records", "c3.r2.json"), { case: "c3", status: "failed", usage: { ledger: { costUSD: 0.03 } } });
  return { d, goldens, dir: (x: string) => path.join(d, "dev", x) };
}

describe("score-testset", () => {
  it("catches per case once, misses scored, no-review out of pairs, Wilson, comments, location hits, cost; counts only on stdout", () => {
    const f = scoringFixture();
    const out = f.dir("summary.json");
    const r = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--judge-x1", `th=${f.dir("th-x1.detail.json")}`,
      "--records", `th=${f.dir("th-records")}`, "--out", out]);
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(out, "utf8"));
    // th: c1 and c2 caught; c3 failed twice → a miss (its G1 match does not count)
    expect(s.tools.th).toMatchObject({ caught: 2, bugCases: 3, completedBug: 2, completedClean: 1, misses: 1, noReview: 0, caughtOfCompleted: "2/2",
      caughtX1: 0, locationHits: 2, comments: { total: 4, clean: 1 } }); // a miss contributes no comments
    expect(s.tools.th.costUSD.total).toBeCloseTo(0.21, 10); // every attempt's ledger delta, the rerun included
    expect(s.tools.th.costUSD.max).toBeCloseTo(0.07, 10);
    expect(s.tools.th.caughtWilson).toEqual(wilson(2, 3));
    // cr: c2 has no review file → no-review; c3 caught
    expect(s.tools.cr).toMatchObject({ caught: 1, completedBug: 2, noReview: 1, misses: 0, locationHits: 1 });
    // pair: c2 is out (cr no-review); c1 th only, c3 cr only (th's miss counts as not caught)
    expect(s.pairs).toEqual([{ a: "th", b: "cr", n: 2, onlyA: 1, onlyB: 1, p: 1 }]);
    expect(r.out).not.toMatch(/finds bug|noise|alt-file/);
    expect(r.out).toContain("th: caught 2/3");
    expect(r.out).toContain("pair th vs cr: paired n 2 · th only 1 · cr only 1 · exact two-sided p 1.0000");
  });

  it("a hand-check replaces the judge; a JUDGE_FAILED case is counted, not caught; refusals", () => {
    const f = scoringFixture();
    const hc = f.dir("handcheck.json");
    json(hc, { decisions: [{ tool: "th", case: "c1", caught: false }, { tool: "cr", case: "c1", caught: true }] });
    const out = f.dir("s2.json");
    const r = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`, "--handcheck", hc, "--out", out]);
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(out, "utf8"));
    expect([s.tools.th.caught, s.tools.cr.caught, s.tools.th.handchecked]).toEqual([0, 1, true]);
    const d2 = f.dir("th.detail2.json");
    json(d2, { detail: [{ prTitle: "P1", status: "JUDGE_FAILED", comments: [] }] });
    const s3 = f.dir("s3.json");
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", s3]).code).toBe(0);
    expect(JSON.parse(readFileSync(s3, "utf8")).tools.th).toMatchObject({ judgeFailed: 1, caught: 0 });
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--out", f.dir("s4.json")]).out).toMatch(/needs a --judge/);
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", s3]).out).toMatch(/never overwritten/);
    expect(run(scoreMain, ["--side", "heldout", "--heldout-ok", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", f.dir("s5.json")]).out)
      .toMatch(/goldens are for side dev/);
  });

  it("location-hit.ts: counts per tool, review-less cases reported", () => {
    const f = scoringFixture();
    const r = run(hitMain, ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`, "--out", f.dir("hits.json")]);
    expect(r.code).toBe(0);
    expect(r.out.split("\n")).toEqual(["th: location hits 3/3 bug cases (0 without a review file)", "cr: location hits 1/3 bug cases (1 without a review file)"]);
  });
});

describe("handcheck-sheet", () => {
  it("is blind (no tool, no judge outcome, no reason), shuffled by a recorded seed, hashed; resolve needs every decision", () => {
    const f = scoringFixture();
    const args = (out: string, seed: string) => ["build", "--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--judge-x1", `th=${f.dir("th-x1.detail.json")}`, "--seed", seed, "--out", out];
    const a = f.dir("sheet-a"), b = f.dir("sheet-b"), c = f.dir("sheet-c");
    expect(run(sheetMain, args(a, "42")).code).toBe(0);
    expect(run(sheetMain, args(b, "42")).code).toBe(0);
    expect(run(sheetMain, args(c, "43")).code).toBe(0);
    const sheet = readFileSync(path.join(a, "sheet.md"), "utf8");
    expect(sheet).toBe(readFileSync(path.join(b, "sheet.md"), "utf8"));
    const mapping = JSON.parse(readFileSync(path.join(a, "mapping.json"), "utf8"));
    // candidates: th c1#0 (v1 + location), th c2#0 (v1 only: z.ts:50 is 9 lines past the alternate → also location),
    // th c3#0 (v1 + location), cr c1 none (x.ts:30 is 18 lines away, no match), cr c3#0 (v1 + location); clean cases never
    expect(mapping.items.map((i: { tool: string; case: string }) => `${i.tool}/${i.case}`).sort()).toEqual(["cr/c3", "th/c1", "th/c2", "th/c3"]);
    expect(mapping.items.find((i: { case: string; tool: string }) => i.tool === "th" && i.case === "c2").reasons).toEqual(["judge-v1", "location"]);
    expect(JSON.parse(readFileSync(path.join(c, "mapping.json"), "utf8")).items.map((i: { case: string; tool: string }) => i.tool + i.case))
      .not.toEqual(mapping.items.map((i: { case: string; tool: string }) => i.tool + i.case));
    expect(sheet).not.toMatch(/\bth\b|\bcr\b|judge|location hit|tracehound:v1|<!--/i);
    expect(sheet).toContain("alpha alt-file comment"); // the finding text itself stays
    const hashes = JSON.parse(readFileSync(path.join(a, "hashes.json"), "utf8"));
    expect(Object.keys(hashes)).toEqual(["v", "sheet.md", "decisions.json", "mapping.json", "recipe"]);
    // resolve
    const decisions = JSON.parse(readFileSync(path.join(a, "decisions.json"), "utf8")) as { item: string; decision: string | null }[];
    const thC1 = mapping.items.find((i: { tool: string; case: string }) => i.tool === "th" && i.case === "c1").item;
    const filled = decisions.map((d) => ({ ...d, decision: d.item === thC1 ? "same-bug" : "not", reason: "r" }));
    const dec = f.dir("decided.json");
    json(dec, filled);
    const r = run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", f.dir("hc.json")]);
    expect(r.code).toBe(0);
    const hc = JSON.parse(readFileSync(f.dir("hc.json"), "utf8"));
    expect(hc.decisions.filter((d: { caught: boolean }) => d.caught)).toEqual([{ tool: "th", case: "c1", caught: true }]);
    json(dec, filled.slice(1));
    expect(run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", f.dir("hc2.json")]).out).toMatch(/has no decision/);
  });
});

describe("collect-tool-reviews", () => {
  const HEAD = "a".repeat(40), BASE = "b".repeat(40);
  const START = "2026-11-20T00:00:00Z", END = "2026-11-23T00:00:00Z";
  function collectorFixture(pulls: Record<string, unknown>) {
    const d = tmp();
    const dev = path.join(d, "dev");
    mkdirSync(dev, { recursive: true });
    copyFileSync(path.join(import.meta.dirname, "fixtures", "collector-fake-gh.mjs"), path.join(dev, "gh.mjs"));
    writeFileSync(path.join(dev, "gh"), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/gh.mjs" "$@"\n`, { mode: 0o755 });
    json(path.join(dev, "gh.json"), { pulls });
    writeFileSync(path.join(dev, "gh.log"), "");
    json(path.join(dev, "manifest.json"), [{ id: "c1", title: "P1", base_sha: BASE, case_head_sha: HEAD }, { id: "c2", title: "P2", base_sha: BASE, case_head_sha: HEAD }]);
    json(path.join(dev, "prmap.json"), { c1: 11, c2: 12 });
    json(path.join(dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"] } } });
    const args = (out: string, ...extra: string[]) => ["--side", "dev", "--tool", "coderabbit", "--config", path.join(dev, "tools.json"), "--repo", "SunnyBagal/twenty",
      "--manifest", path.join(dev, "manifest.json"), "--pr-map", path.join(dev, "prmap.json"), "--window-start", START, "--window-end", END,
      "--out", out, "--gh-bin", path.join(dev, "gh"), ...extra];
    return { d, dev, args, log: () => readFileSync(path.join(dev, "gh.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) };
  }
  const bot = { login: "CodeRabbitAI[bot]", type: "Bot" };
  const comment = (id: number, over: Record<string, unknown> = {}) => ({ id, user: bot, created_at: "2026-11-21T00:00:00Z", commit_id: HEAD,
    original_commit_id: HEAD, path: "x.ts", line: id, original_line: id, body: `finding ${id}`, ...over });

  it("applies the counting rule, paginates, binds the commit pair, and reads only with an allowlisted env", () => {
    const many = Array.from({ length: 120 }, (_, i) => comment(1000 + i, { body: "bulk" }));
    const f = collectorFixture({
      11: { pr: { base: { sha: BASE }, head: { sha: HEAD } }, reviews: [{ id: 1, user: bot, submitted_at: "2026-11-21T00:00:00Z", commit_id: HEAD }],
        comments: [comment(1), comment(2, { in_reply_to_id: 1 }), comment(3, { user: { login: "sunny", type: "User" } }),
          comment(4, { created_at: "2026-11-24T00:00:00Z" }), comment(5, { commit_id: "c".repeat(40), original_commit_id: "c".repeat(40) }),
          comment(6, { line: null, original_line: 77 }), comment(1), ...many] },
      12: { pr: { base: { sha: BASE }, head: { sha: "d".repeat(40) } }, comments: [], reviews: [] },
    });
    const out = path.join(f.dev, "collected");
    const lines: string[] = [];
    const code = collectMain(f.args(out), { log: (l) => lines.push(l), env: { ...process.env, NEBIUS_API_KEY: "sk-fake-key-do-not-leak", GH_TOKEN: "ghp_fake" } });
    expect(code).toBe(0);
    const review = JSON.parse(readFileSync(path.join(out, "coderabbit", "c1.json"), "utf8"));
    expect(review.pr_title).toBe("P1");
    expect(review.comments.slice(0, 2)).toEqual([{ path: "x.ts", line: 1, body: "finding 1" }, { path: "x.ts", line: 77, body: "finding 6" }]);
    expect(review.comments).toHaveLength(122); // 1, 6 and the 120 bulk comments across two pages
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit.status.json"), "utf8"))).toEqual({ c1: "completed", c2: "invalid-binding" });
    expect(existsSync(path.join(out, "coderabbit", "c2.json"))).toBe(false);
    expect(lines[0]).toBe("coderabbit: 2 case(s): completed 1, no-review 0, invalid-binding 1, read-failed 0; 122 counted comment(s); excluded: other author 1, reply 1, outside window 1, other commit 1, duplicate 1");
    const calls = f.log();
    expect(calls.map((c: { argv: string[] }) => c.argv[3])).toEqual(["repos/SunnyBagal/twenty/pulls/11", "repos/SunnyBagal/twenty/pulls/11/comments?per_page=100&page=1",
      "repos/SunnyBagal/twenty/pulls/11/comments?per_page=100&page=2", "repos/SunnyBagal/twenty/pulls/11/reviews?per_page=100&page=1", "repos/SunnyBagal/twenty/pulls/12"]);
    for (const c of calls) {
      expect(c.argv.slice(0, 3)).toEqual(["api", "--method", "GET"]);
      expect(c.envKeys).not.toContain("NEBIUS_API_KEY");
      expect(c.envKeys).toContain("GH_TOKEN");
    }
    const coll = JSON.parse(readFileSync(path.join(out, "coderabbit.collection.json"), "utf8"));
    expect(Object.keys(coll.files).sort()).toEqual(["coderabbit.status.json", "coderabbit/c1.json", "raw/coderabbit/c1.json", "raw/coderabbit/c2.json"]);
    // never overwrites
    expect(collectMain(f.args(out), { log: () => {} })).toBe(2);
  });

  it("no-review without a review or a counted comment; a failing gh is never echoed; refusals", () => {
    const f = collectorFixture({ 11: { pr: { base: { sha: BASE }, head: { sha: HEAD } }, comments: [comment(1, { user: { login: "other[bot]" } })], reviews: [] } });
    const lines: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "o1"), "--ids", "c1"), { log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "o1", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "no-review" });
    json(path.join(f.dev, "gh.json"), { fail: true, pulls: {} });
    const l2: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "o2"), "--ids", "c1"), { log: (l) => l2.push(l) })).toBe(1);
    expect(l2.join("\n")).not.toMatch(/secret-ish|404/);
    expect(l2[0]).toContain("read-failed 1");
    const refuse = (...a: string[]) => { const l: string[] = []; collectMain(a, { log: (x) => l.push(x) }); return l.join("\n"); };
    expect(refuse(...f.args(path.join(f.dev, "o3")).map((x) => (x === "SunnyBagal/twenty" ? "twentyhq/twenty" : x)))).toMatch(/must be SunnyBagal/);
    expect(refuse(...f.args(path.join(f.dev, "o4")).map((x) => (x === START ? "2026-11-20T00:00:00+05:30" : x)))).toMatch(/UTC ISO/);
    json(path.join(f.dev, "tools.json"), { v: 1, tools: {} });
    expect(refuse(...f.args(path.join(f.dev, "o5")))).toMatch(/no login list for coderabbit/);
    expect(() => assertGhRead(["api", "--method", "POST", "repos/SunnyBagal/twenty/pulls/1"], "SunnyBagal/twenty")).toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/twentyhq/twenty/pulls/1"], "SunnyBagal/twenty")).toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/SunnyBagal/twenty/pulls/1/comments?per_page=100&page=1"], "SunnyBagal/twenty")).not.toThrow();
  });
});
