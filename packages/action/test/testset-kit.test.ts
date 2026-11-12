// The Track B scoring kit (B2; scripts/testset/): Wilson and the exact sign test, the side guard, location hits,
// build-goldens (multi-file primary by git order, preflight), score-testset, the blind hand-check sheet, and the
// read-only tool-comment collector against a fake gh. Synthetic fixtures only; no model, no network.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { symlinkSync } from "node:fs";
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
    expect(signTest(8, 1)).toBeCloseTo(0.0390625, 10); // §7 row, as written
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

  it("codex C1 probe 1: the dev guard follows symlinks, for existing paths and for new outputs under an aliased parent", () => {
    const d = tmp();
    mkdirSync(path.join(d, "store", "heldout"), { recursive: true });
    writeFileSync(path.join(d, "store", "heldout", "labels.jsonl"), "");
    symlinkSync(path.join(d, "store", "heldout"), path.join(d, "alias"));
    expect(() => checkSide("dev", false, [path.join(d, "alias", "labels.jsonl")])).toThrow(/refuses a held-out path/);
    expect(() => checkSide("dev", false, [path.join(d, "alias", "new", "out.json")])).toThrow(/refuses a held-out path/);
    symlinkSync(path.join(d, "store", "heldout", "later"), path.join(d, "dangling"));
    expect(() => checkSide("dev", false, [path.join(d, "dangling", "x.json")])).toThrow(/refuses a held-out path/);
    symlinkSync(path.join(d, "store"), path.join(d, "fine"));
    expect(checkSide("dev", false, [path.join(d, "fine", "dev.json")])).toBe("dev");
  });

  it("codex 076a re-review: `..` after a symlink steps up from the link's target (literal alias/../ paths)", () => {
    const d = tmp();
    mkdirSync(path.join(d, "store", "heldout", "nested"), { recursive: true });
    writeFileSync(path.join(d, "store", "heldout", "labels.jsonl"), "");
    mkdirSync(path.join(d, "dev"));
    symlinkSync(path.join(d, "store", "heldout", "nested"), path.join(d, "dev", "alias"));
    // built by string, not path.join, which would normalise the `..` away
    const input = `${d}/dev/alias/../labels.jsonl`;
    expect(readFileSync(input, "utf8")).toBe(""); // the filesystem reads the held-out file through it
    expect(() => checkSide("dev", false, [input])).toThrow(/refuses a held-out path/);
    expect(() => checkSide("dev", false, [`${d}/dev/alias/../new/out.json`])).toThrow(/refuses a held-out path/);
    expect(checkSide("dev", false, [`${d}/dev/alias/../../x.json`])).toBe("dev"); // nested/.. = heldout, heldout/.. = store: not held-out
    // a relative literal path from a working directory behind the link
    const cwd = process.cwd();
    try {
      process.chdir(path.join(d, "dev"));
      expect(() => checkSide("dev", false, ["alias/../labels.jsonl"])).toThrow(/refuses a held-out path/);
      expect(checkSide("dev", false, ["plain/../dev-only.json"])).toBe("dev");
    } finally { process.chdir(cwd); }
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
function goldensFixture(o: { rename?: boolean } = {}) {
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
  // optionally, src/a.ts moves to lib/a.ts between the case head and the fix (labels keep head paths)
  const aFix = o.rename ? "lib/a.ts" : "src/a.ts";
  if (o.rename) { mkdirSync(path.join(repo, "lib")); git("mv", "src/a.ts", "lib/a.ts"); git("commit", "-qm", "move"); }
  writeFileSync(path.join(repo, aFix), lines(40, "a3")); writeFileSync(path.join(repo, "src/b.ts"), lines(40, "b3"));
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
  // x1 judged every th review and matched nothing
  json(path.join(d, "dev", "th-x1.detail.json"), { detail: ["P1", "P2", "P3", "P4"].map((t) => ({ prTitle: t, status: "SCORED",
    comments: JSON.parse(readFileSync(path.join(d, "dev", "th", `c${t.slice(1)}.json`), "utf8")).comments.map((c: object) => ({ ...c, matched: null })) })) });
  // runner records for th: c3 failed (a miss), costs per case
  for (const [id, status, cost] of [["c1", "ok", 0.05], ["c2", "ok", 0.07], ["c3", "failed", 0.02], ["c4", "ok", 0.04]] as const) {
    json(path.join(d, "dev", "th-records", `${id}.json`), { case: id, status, usage: { ledger: { costUSD: cost } } });
  }
  json(path.join(d, "dev", "th-records", "c3.r2.json"), { case: "c3", status: "failed", usage: { ledger: { costUSD: 0.03 } } });
  const policy = (over: Record<string, string> = {}, name = "policy.json") => {
    const file = path.join(d, "dev", name);
    json(file, { v: 1, approved: { by: "synthetic test", on: "2026-11-11", ref: "test fixture" }, official_attempt: "last", failed_case: "miss",
      unstarted_case: "miss", no_review_in_pairs: "exclude", sheet_judge_cues: "hidden", ...over });
    return file;
  };
  return { d, goldens, dir: (x: string) => path.join(d, "dev", x), policy };
}

describe("score-testset", () => {
  it("catches per case once, misses scored, no-review out of pairs, Wilson, comments, location hits, cost; counts only on stdout", () => {
    const f = scoringFixture();
    const out = f.dir("summary.json");
    // x1 detail covers th's completed bug cases c1 and c2 (c3 is a miss under the policy)
    json(f.dir("th-x1.detail.json"), { detail: ["P1", "P2"].map((t) => ({ prTitle: t, status: "SCORED",
      comments: JSON.parse(readFileSync(f.dir(`th/c${t.slice(1)}.json`), "utf8")).comments.map((c: object) => ({ ...c, matched: null })) })) });
    const r = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
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
    expect(r.out).toContain("policy: approved by synthetic test on 2026-11-11 (test fixture)");
    expect(s.policy.no_review_in_pairs).toBe("exclude");
  });

  it("pending policies apply only through --policy, with each choice's effect", () => {
    const f = scoringFixture();
    const base = ["--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--records", `th=${f.dir("th-records")}`];
    expect(run(scoreMain, [...base, "--out", f.dir("p0.json")]).out).toMatch(/--policy is required: no_review_in_pairs, official_attempt, failed_case, unstarted_case are pending/);
    const partial = f.dir("partial.json");
    json(partial, { v: 1, approved: { by: "x", on: "2026-11-11", ref: "r" }, no_review_in_pairs: "exclude" });
    expect(run(scoreMain, [...base, "--policy", partial, "--out", f.dir("p1.json")]).out).toMatch(/official_attempt must be one of last \| first/);
    const unapproved = f.dir("unapproved.json");
    json(unapproved, { v: 1, approved: { by: "", on: "2026-11-11", ref: "r" }, official_attempt: "last", failed_case: "miss", unstarted_case: "miss", no_review_in_pairs: "exclude" });
    expect(run(scoreMain, [...base, "--policy", unapproved, "--out", f.dir("p2.json")]).out).toMatch(/approved.by, approved.on and approved.ref are required/);
    // failed_case no-review: th's c3 leaves the pair (n 1)
    expect(run(scoreMain, [...base, "--policy", f.policy({ failed_case: "no-review" }, "pa.json"), "--out", f.dir("p3.json")]).code).toBe(0);
    const p3 = JSON.parse(readFileSync(f.dir("p3.json"), "utf8"));
    expect([p3.tools.th.misses, p3.tools.th.noReview, p3.pairs[0].n]).toEqual([0, 1, 1]);
    // no_review_in_pairs not-caught: every bug case is in the pair; cr's no-review c2 counts as not caught (th caught it)
    expect(run(scoreMain, [...base, "--policy", f.policy({ no_review_in_pairs: "not-caught" }, "pb.json"), "--out", f.dir("p4.json")]).code).toBe(0);
    expect(JSON.parse(readFileSync(f.dir("p4.json"), "utf8")).pairs[0]).toMatchObject({ n: 3, onlyA: 2, onlyB: 1 });
    // official_attempt first + a case never started: unstarted_case no-review
    rmSync(f.dir("th-records/c4.json"));
    expect(run(scoreMain, [...base, "--policy", f.policy({ official_attempt: "first", unstarted_case: "no-review" }, "pc.json"), "--out", f.dir("p5.json")]).code).toBe(0);
    expect(JSON.parse(readFileSync(f.dir("p5.json"), "utf8")).tools.th).toMatchObject({ noReview: 1, completedClean: 0, misses: 1 });
  });

  it("codex C1 probe 3: missing or mismatched judge evidence refuses; it never becomes a scored miss", () => {
    const f = scoringFixture();
    const empty = f.dir("empty.detail.json");
    json(empty, { detail: [] });
    const r = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--judge", `th=${empty}`, "--out", f.dir("e1.json")]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("incomplete: th: judge detail lacks 3 completed bug case(s)");
    expect(existsSync(f.dir("e1.json"))).toBe(false);
    const other = f.dir("other.detail.json");
    const d = JSON.parse(readFileSync(f.dir("th.detail.json"), "utf8"));
    d.detail[0].comments[0].body = "a different comment";
    json(other, d);
    const r2 = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--judge", `th=${other}`, "--out", f.dir("e2.json")]);
    expect(r2.out).toContain("incomplete: th: judge judged other comments than the review for 1 case(s)");
  });

  it("a hand-check replaces the judge; a JUDGE_FAILED case is counted, not caught; refusals", () => {
    const f = scoringFixture();
    const hc = f.dir("handcheck.json");
    const sha = (tool: string, id: string) => createHash("sha256").update(readFileSync(f.dir(`${tool}/${id}.json`))).digest("hex");
    json(hc, { decisions: [{ tool: "th", case: "c1", caught: false, review_sha256: sha("th", "c1") }, { tool: "cr", case: "c1", caught: true, review_sha256: sha("cr", "c1") }],
      reviewed: [["th", "c1"], ["th", "c2"], ["th", "c3"], ["cr", "c1"], ["cr", "c3"]].map(([t, c]) => ({ tool: t, case: c, review_sha256: sha(t!, c!) })) });
    const out = f.dir("s2.json");
    const r = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`, "--handcheck", hc, "--out", out]);
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(out, "utf8"));
    expect([s.tools.th.caught, s.tools.cr.caught, s.tools.th.handchecked]).toEqual([0, 1, true]);
    const d2 = f.dir("th.detail2.json");
    const all = JSON.parse(readFileSync(f.dir("th.detail.json"), "utf8"));
    all.detail[0] = { prTitle: "P1", status: "JUDGE_FAILED", comments: [] };
    json(d2, all);
    const s3 = f.dir("s3.json");
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", s3]).code).toBe(0);
    expect(JSON.parse(readFileSync(s3, "utf8")).tools.th).toMatchObject({ judgeFailed: 1, caught: 2 });
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--out", f.dir("s4.json")]).out).toMatch(/needs a --judge/);
    expect(run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", s3]).out).toMatch(/never overwritten/);
    expect(run(scoreMain, ["--side", "heldout", "--heldout-ok", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--judge", `th=${d2}`, "--out", f.dir("s5.json")]).out)
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
    const args = (out: string, seed: string, cues = false) => ["build", "--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--judge-x1", `th=${f.dir("th-x1.detail.json")}`, "--seed", seed, "--out", out,
      "--policy", f.policy(cues ? { sheet_judge_cues: "shown" } : {}, cues ? "cues.json" : "policy.json")];
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
    expect(decisions.every((d) => (d as { guess?: unknown }).guess === null)).toBe(true); // the guess column, blank
    expect(sheet).toContain("write in `guess` which tool you think wrote each comment");
    expect(mapping.tools).toEqual(["th", "cr"]);
    // guesses (076c item 7): th/c1 right (case and spaces ignored), cr/c3 unsure, th/c2 wrong, th/c3 right
    const item = (tool: string, c: string) => mapping.items.find((i: { tool: string; case: string }) => i.tool === tool && i.case === c).item;
    const guesses: Record<string, string> = { [item("th", "c1")]: " TH ", [item("cr", "c3")]: "unsure", [item("th", "c2")]: "cr", [item("th", "c3")]: "th" };
    const filled = decisions.map((d) => ({ ...d, decision: d.item === thC1 ? "same-bug" : "not", guess: guesses[d.item], reason: "r" }));
    const dec = f.dir("decided.json");
    json(dec, filled);
    const r = run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", f.dir("hc.json")]);
    expect(r.code).toBe(0);
    const hc = JSON.parse(readFileSync(f.dir("hc.json"), "utf8"));
    expect(hc.decisions.filter((d: { caught: boolean }) => d.caught).map(({ tool, case: c, caught }: { tool: string; case: string; caught: boolean }) => ({ tool, case: c, caught })))
      .toEqual([{ tool: "th", case: "c1", caught: true }]);
    expect(hc.decisions.every((d: { review_sha256: string }) => /^[0-9a-f]{64}$/.test(d.review_sha256))).toBe(true);
    expect(hc.reviewed.length).toBe(5); // th c1-c3, cr c1 and c3
    expect(hc.guess).toEqual({ items: 4, guessed: 3, unsure: 1, right: 2, tools: 2, commonestToolItems: 3 });
    // a guess left blank, or a name that is not a --tool of this sheet: exit 2, no output
    for (const [name, g] of [["guess-null", null], ["guess-other", "greptile"]] as const) {
      json(dec, filled.map((d) => (d.item === thC1 ? { ...d, guess: g } : d)));
      const outFile = f.dir(`hc-${name}.json`);
      const rg = run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", outFile]);
      expect(rg.code).toBe(2);
      expect(rg.out).toContain(`${thC1} has no guess (one of th, cr, unsure)`);
      expect(existsSync(outFile)).toBe(false);
    }
    json(dec, filled.slice(1));
    expect(run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", f.dir("hc2.json")]).out).toMatch(/has no decision/);
    // a decision present but left null (as build writes it) or blank: exit 2, no output (§7)
    for (const [name, blank] of [["null", null], ["empty", ""], ["space", " "]] as const) {
      json(dec, filled.map((d) => (d.item === thC1 ? { ...d, decision: blank } : d)));
      const outFile = f.dir(`hc-${name}.json`);
      const rb = run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(a, "mapping.json"), "--decisions", dec, "--out", outFile]);
      expect(rb.code).toBe(2);
      expect(rb.out).toContain(`${thC1} has no decision`);
      expect(existsSync(outFile)).toBe(false);
    }
    // the judge cue is a policy choice: absent unless the policy says "shown"
    expect(sheet).not.toContain("A judge proposed a match");
    const shown = f.dir("sheet-cues");
    expect(run(sheetMain, args(shown, "42", true)).code).toBe(0);
    expect(readFileSync(path.join(shown, "sheet.md"), "utf8")).toContain("**A judge proposed a match:** yes");
    const noPolicy = args(f.dir("sheet-np"), "42").slice(0, -2);
    expect(run(sheetMain, noPolicy).out).toMatch(/--policy is required: sheet_judge_cues/);
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
    json(path.join(dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"], notCompletion: ["rate limit exceeded", "^Failed\\b.*retry"] } } });
    const args = (out: string, ...extra: string[]) => ["--side", "dev", "--tool", "coderabbit", "--config", path.join(dev, "tools.json"), "--repo", "SunnyBagal/twenty",
      "--manifest", path.join(dev, "manifest.json"), "--pr-map", path.join(dev, "prmap.json"), "--window-start", START, "--window-end", END,
      "--out", out, "--gh-bin", path.join(dev, "gh"), ...extra];
    return { d, dev, args, log: () => readFileSync(path.join(dev, "gh.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) };
  }
  // the completion bound is always named (codex 076c review P2-1): these collections have no trigger records
  const WS = ["--bound", "window-start"];
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
    const code = collectMain(f.args(out, ...WS), { log: (l) => lines.push(l), env: { ...process.env, NEBIUS_API_KEY: "sk-fake-key-do-not-leak", GH_TOKEN: "ghp_fake" } });
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
      "repos/SunnyBagal/twenty/pulls/11/comments?per_page=100&page=2", "repos/SunnyBagal/twenty/pulls/11/reviews?per_page=100&page=1",
      "repos/SunnyBagal/twenty/issues/11/comments?per_page=100&page=1", "repos/SunnyBagal/twenty/pulls/12"]);
    for (const c of calls) {
      expect(c.argv.slice(0, 3)).toEqual(["api", "--method", "GET"]);
      expect(c.envKeys).not.toContain("NEBIUS_API_KEY");
      expect(c.envKeys).toContain("GH_TOKEN");
    }
    const coll = JSON.parse(readFileSync(path.join(out, "coderabbit.collection.json"), "utf8"));
    expect(Object.keys(coll.files).sort()).toEqual(["coderabbit.status.json", "coderabbit/c1.json", "raw/coderabbit/c1.json", "raw/coderabbit/c2.json"]);
    // never overwrites
    expect(collectMain(f.args(out, ...WS), { log: () => {} })).toBe(2);
  });

  it("no-review without a review or a counted comment; a failing gh is never echoed; refusals", () => {
    const f = collectorFixture({ 11: { pr: { base: { sha: BASE }, head: { sha: HEAD } }, comments: [comment(1, { user: { login: "other[bot]" } })], reviews: [] } });
    const lines: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "o1"), "--ids", "c1", ...WS), { log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "o1", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "no-review" });
    json(path.join(f.dev, "gh.json"), { fail: true, pulls: {} });
    const l2: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "o2"), "--ids", "c1", ...WS), { log: (l) => l2.push(l) })).toBe(1);
    expect(l2.join("\n")).not.toMatch(/secret-ish|404/);
    expect(l2[0]).toContain("read-failed 1");
    const refuse = (...a: string[]) => { const l: string[] = []; collectMain(a, { log: (x) => l.push(x) }); return l.join("\n"); };
    expect(refuse(...f.args(path.join(f.dev, "o3"), ...WS).map((x) => (x === "SunnyBagal/twenty" ? "twentyhq/twenty" : x)))).toMatch(/must be SunnyBagal/);
    expect(refuse(...f.args(path.join(f.dev, "o4"), ...WS).map((x) => (x === START ? "2026-11-20T00:00:00+05:30" : x)))).toMatch(/UTC ISO/);
    json(path.join(f.dev, "tools.json"), { v: 1, tools: {} });
    expect(refuse(...f.args(path.join(f.dev, "o5"), ...WS))).toMatch(/no login list for coderabbit/);
    expect(() => assertGhRead(["api", "--method", "POST", "repos/SunnyBagal/twenty/pulls/1"], "SunnyBagal/twenty")).toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/twentyhq/twenty/pulls/1"], "SunnyBagal/twenty")).toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/SunnyBagal/twenty/pulls/1/comments?per_page=100&page=1"], "SunnyBagal/twenty")).not.toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/SunnyBagal/twenty/issues/1/comments?per_page=100&page=1"], "SunnyBagal/twenty")).not.toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/SunnyBagal/twenty/issues/1"], "SunnyBagal/twenty")).toThrow();
    expect(() => assertGhRead(["api", "--method", "GET", "repos/twentyhq/twenty/issues/1/comments?per_page=100&page=1"], "SunnyBagal/twenty")).toThrow();
  });

  // decision 076c item 2 (Planner B's U1): issue comments make a case completed, never counted
  const issue = (id: number, over: Record<string, unknown> = {}) => ({ id, user: bot, created_at: "2026-11-21T00:00:00Z", body: "Summary: no issues found.", ...over });
  const pr = { base: { sha: BASE }, head: { sha: HEAD } };

  it("completion: a zero-inline review completed by an issue comment; a rate-limit or failure message is not completion", () => {
    const f = collectorFixture({
      11: { pr, comments: [], reviews: [], issueComments: [issue(1)] },
      12: { pr, comments: [], reviews: [{ id: 2, user: bot, submitted_at: "2026-11-21T00:00:00Z", commit_id: HEAD, body: "Rate limit exceeded: wait 40 minutes" }],
        issueComments: [issue(3, { body: "## Rate Limit Exceeded\nPlease wait" }), issue(4, { body: "Failed 😕 Tag the bot to retry." }), issue(5, { user: { login: "sunny" }, body: "ok" })] },
    });
    const out = path.join(f.dev, "c");
    const lines: string[] = [];
    expect(collectMain(f.args(out, ...WS), { log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit.status.json"), "utf8"))).toEqual({ c1: "completed", c2: "no-review" });
    // completed with zero counted comments: the review file exists and is empty; the issue comment is not a comment
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit", "c1.json"), "utf8")).comments).toEqual([]);
    expect(lines[0]).toContain("completed 1, no-review 1");
    expect(lines[0]).toContain("0 counted comment(s)");
    expect(lines[1]).toBe("coderabbit: completion objects after the window start (--bound window-start: a deviation, never drives a re-trigger): review 0, inline 0, issue comment 1; not completion (pattern) 3");
    const coll = JSON.parse(readFileSync(path.join(out, "coderabbit.collection.json"), "utf8"));
    expect(coll.notCompletion).toEqual(["rate limit exceeded", "^Failed\\b.*retry"]);
    expect(coll.completionFrom).toBe("window start (--bound window-start)");
    expect(JSON.parse(readFileSync(path.join(out, "raw", "coderabbit", "c2.json"), "utf8")).issueComments).toHaveLength(3);
    // the patterns are required (an explicit [] is allowed) and must compile
    json(path.join(f.dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"] } } });
    const l2: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "c2"), ...WS), { log: (l) => l2.push(l) })).toBe(2);
    expect(l2[0]).toMatch(/no notCompletion list for coderabbit/);
    json(path.join(f.dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"], notCompletion: ["("] } } });
    const l3: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "c3"), ...WS), { log: (l) => l3.push(l) })).toBe(2);
    expect(l3[0]).toMatch(/is not a regular expression/);
    json(path.join(f.dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"], notCompletion: [] } } });
    expect(collectMain(f.args(path.join(f.dev, "c4"), ...WS), { log: () => {} })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "c4", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "completed", c2: "completed" });
  });

  it("completion counts only objects after the case's first trigger (--resume-file); a case with no trigger record refuses", () => {
    const f = collectorFixture({
      11: { pr, comments: [], reviews: [], issueComments: [issue(1, { created_at: "2026-11-20T10:00:00Z" })] }, // before c1's trigger
      12: { pr, comments: [], reviews: [], issueComments: [issue(2, { created_at: "2026-11-20T13:00:00Z" })] }, // after c2's trigger
    });
    const resume = path.join(f.dev, "twenty.resume.jsonl");
    const rec = (id: string, step: string, at: string) => JSON.stringify({ v: 1, fork: "SunnyBagal/twenty", id, step, at });
    writeFileSync(resume, [rec("c1", "pr-created", "2026-11-19T00:00:00Z"), rec("c1", "triggered:coderabbit", "2026-11-20T11:00:00Z"),
      rec("c2", "triggered:coderabbit", "2026-11-20T12:00:00Z"), rec("c2", "triggered:greptile", "2026-11-20T14:00:00Z")].join("\n") + "\n");
    const out = path.join(f.dev, "t");
    const lines: string[] = [];
    expect(collectMain(f.args(out, "--resume-file", resume), { log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit.status.json"), "utf8"))).toEqual({ c1: "no-review", c2: "completed" });
    expect(lines[1]).toContain("after the first trigger: review 0, inline 0, issue comment 1");
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit.collection.json"), "utf8")).completionFrom).toBe("first trigger (--resume-file)");
    // with the explicit window-start bound, c1's comment is inside the window and completes it
    expect(collectMain(f.args(path.join(f.dev, "t2"), ...WS), { log: () => {} })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "t2", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "completed", c2: "completed" });
    expect(JSON.parse(readFileSync(path.join(f.dev, "t2", "coderabbit.collection.json"), "utf8")).completionFrom).toBe("window start (--bound window-start)");
    // a case without a trigger record for this tool refuses before any read
    writeFileSync(resume, rec("c1", "triggered:coderabbit", "2026-11-20T11:00:00Z") + "\n");
    const l3: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "t3"), "--resume-file", resume), { log: (l) => l3.push(l) })).toBe(2);
    expect(l3[0]).toMatch(/c2 has no triggered:coderabbit record in --resume-file/);
    expect(existsSync(path.join(f.dev, "t3"))).toBe(false);
    // a resume file for another fork refuses
    writeFileSync(resume, JSON.stringify({ v: 1, fork: "SunnyBagal/medusa", id: "c1", step: "triggered:coderabbit", at: "2026-11-20T11:00:00Z" }) + "\n");
    const l4: string[] = [];
    expect(collectMain(f.args(path.join(f.dev, "t4"), "--resume-file", resume), { log: (l) => l4.push(l) })).toBe(2);
    expect(l4[0]).toMatch(/is for SunnyBagal\/medusa/);
  });

  // codex 076c review P2-1 (decision 076d item 4): the bound is never implicit
  it("refuses with neither --resume-file nor --bound window-start, with both, and with another --bound; nothing is read or written", () => {
    // codex's probe: window start 72 h before the end, a bot issue comment 30 h and the actual first trigger 25 h before it
    const f = collectorFixture({ 11: { pr, comments: [], reviews: [], issueComments: [issue(1, { created_at: "2026-11-21T18:00:00Z" })] } });
    const resume = path.join(f.dev, "twenty.resume.jsonl");
    writeFileSync(resume, JSON.stringify({ v: 1, fork: "SunnyBagal/twenty", id: "c1", step: "triggered:coderabbit", at: "2026-11-21T23:00:00Z" }) + "\n");
    const refused = (dir: string, ...extra: string[]) => {
      const l: string[] = [];
      const code = collectMain(f.args(path.join(f.dev, dir), "--ids", "c1", ...extra), { log: (x) => l.push(x) });
      expect(existsSync(path.join(f.dev, dir))).toBe(false);
      return { code, out: l.join("\n") };
    };
    const neither = refused("n1");
    expect(neither.code).toBe(2);
    expect(neither.out).toMatch(/refused: the completion bound must be named: --resume-file .* or --bound window-start for cases with no trigger record/);
    const both = refused("n2", "--resume-file", resume, ...WS);
    expect(both.code).toBe(2);
    expect(both.out).toMatch(/--resume-file and --bound window-start are separate collections/);
    const other = refused("n3", "--bound", "trigger");
    expect(other.code).toBe(2);
    expect(other.out).toMatch(/--bound takes one value: window-start/);
    expect(f.log()).toEqual([]); // no gh call in any refusal
    // the probe's two bounds, each named: the trigger bound gives no-review (U1), the window-start bound completed
    expect(collectMain(f.args(path.join(f.dev, "n4"), "--ids", "c1", "--resume-file", resume), { log: () => {} })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "n4", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "no-review" });
    expect(collectMain(f.args(path.join(f.dev, "n5"), "--ids", "c1", ...WS), { log: () => {} })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(f.dev, "n5", "coderabbit.status.json"), "utf8"))).toEqual({ c1: "completed" });
  });
});

describe("build-goldens with a rename between the case head and the fix", () => {
  it("follows the rename to place the head path in the fix's order; a single-row defect needs no fix lookup", () => {
    const f = goldensFixture({ rename: true });
    const out = path.join(f.d, "dev", "goldens-r");
    const r = run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--overlay", f.overlay, "--repos", f.repos, "--out", out]);
    expect(r.code).toBe(0);
    const g = JSON.parse(readFileSync(path.join(out, "goldens.json"), "utf8"));
    // the fix lists lib/a.ts before src/b.ts; src/a.ts (the head path) was renamed to lib/a.ts, so it is the primary
    expect(g.cases[0].targets.map((t: { file: string; role: string }) => [t.file, t.role])).toEqual([["src/a.ts", "primary"], ["src/b.ts", "alternate"]]);
    // without the overlay the case has one row: no fix-order lookup, the labeller's primary stands
    const out2 = path.join(f.d, "dev", "goldens-r2");
    expect(run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--repos", f.repos, "--out", out2]).code).toBe(0);
    expect(JSON.parse(readFileSync(path.join(out2, "goldens.json"), "utf8")).cases[0].targets).toEqual([{ file: "src/b.ts", lines: [10, 12], role: "primary" }]);
  });
});

describe("build-goldens with the schema-v2 overlay (codex C1 question 2)", () => {
  function overlayRows(f: ReturnType<typeof goldensFixture>, rows: { file: string; fix_file: string; role: string; lines: [number, number] }[], id = "case-1") {
    const file = path.join(f.d, "dev", `multifile-${Math.random().toString(36).slice(2)}.jsonl`);
    writeFileSync(file, rows.map((r, i) => JSON.stringify({ id, label: "bug", file: r.file, lines_at_head: r.lines, description: `row ${i}`, fix_sha: f.fix,
      introducing_sha: f.head, role: r.role, fix_file: r.fix_file, fix_path_order: i + 1, source_label_file: "x.jsonl", source_rows: [] })).join("\n") + "\n");
    return file;
  }
  const build = (f: ReturnType<typeof goldensFixture>, overlay: string, out: string) =>
    run(buildMain, ["--side", "dev", "--manifest", path.join(f.d, "dev", "manifest.json"), "--labels", f.labels, "--overlay", overlay, "--repos", f.repos, "--out", out]);

  it("keeps the overlay's canonical roles, uses fix_file for renamed paths, and refuses a primary out of git order", () => {
    const f = goldensFixture({ rename: true });
    const good = overlayRows(f, [{ file: "src/a.ts", fix_file: "lib/a.ts", role: "primary", lines: [20, 22] }, { file: "src/b.ts", fix_file: "src/b.ts", role: "alternate", lines: [10, 12] }]);
    const out = path.join(f.d, "dev", "o1");
    expect(build(f, good, out).code).toBe(0);
    const g = JSON.parse(readFileSync(path.join(out, "goldens.json"), "utf8"));
    expect(g.cases[0].targets).toEqual([{ file: "src/a.ts", lines: [20, 22], role: "primary" }, { file: "src/b.ts", lines: [10, 12], role: "alternate" }]);
    expect(g.cases[0].description).toBe("row 0");
    const wrong = overlayRows(f, [{ file: "src/b.ts", fix_file: "src/b.ts", role: "primary", lines: [10, 12] }, { file: "src/a.ts", fix_file: "lib/a.ts", role: "alternate", lines: [20, 22] }]);
    expect(build(f, wrong, path.join(f.d, "dev", "o2")).out).toContain("the overlay's primary is not the first of its files in git's path order");
    const two = overlayRows(f, [{ file: "src/a.ts", fix_file: "lib/a.ts", role: "primary", lines: [20, 22] }, { file: "src/b.ts", fix_file: "src/b.ts", role: "primary", lines: [10, 12] }]);
    expect(build(f, two, path.join(f.d, "dev", "o3")).out).toContain("the overlay has 2 primary rows");
    const onClean = overlayRows(f, [{ file: "src/a.ts", fix_file: "lib/a.ts", role: "primary", lines: [20, 22] }], "case-2");
    const r = build(f, onClean, path.join(f.d, "dev", "o4"));
    expect(r.out).toContain("preflight error: case-1: bug case has no rows in the overlay");
    expect(r.out).toContain("preflight error: case-2: overlay rows on a clean case");
  });
});

describe("hand-check evidence completeness (codex 076a re-review 2)", () => {
  it("sheet build: v1 required for every tool, x1 too on held-out; a reviewed bug case without a judge entry refuses; JUDGE_FAILED lists every comment", () => {
    const f = scoringFixture();
    const sheet = (out: string, ...extra: string[]) => run(sheetMain, ["build", "--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`,
      "--seed", "1", "--out", out, "--policy", f.policy(), ...extra]);
    expect(sheet(f.dir("s0")).out).toMatch(/th has no --judge \(v1\) detail/);
    // held-out: both judges required
    const hg = f.dir("ho-goldens.json");
    json(hg, { ...JSON.parse(readFileSync(f.goldens, "utf8")), side: "heldout" });
    const ho = run(sheetMain, ["build", "--side", "heldout", "--heldout-ok", "--goldens", hg, "--tool", `th=${f.dir("th")}`, "--judge", `th=${f.dir("th.detail.json")}`,
      "--seed", "1", "--out", f.dir("s1"), "--policy", f.policy()]);
    expect(ho.out).toMatch(/th has no --judge-x1 detail \(held-out uses both judges\)/);
    // a judge detail with no entry for a reviewed bug case
    const partial = f.dir("partial.detail.json");
    const d = JSON.parse(readFileSync(f.dir("th.detail.json"), "utf8"));
    json(partial, { detail: d.detail.filter((x: { prTitle: string }) => x.prTitle !== "P2") });
    expect(sheet(f.dir("s2"), "--judge", `th=${partial}`).out).toMatch(/no judged entry for 1 reviewed bug case\(s\)/);
    // the probe: a review whose comment is outside the location range and a judge with no entry for it can no longer give an empty sheet
    const failed = f.dir("failed.detail.json");
    json(failed, { detail: d.detail.map((x: { prTitle: string }) => (x.prTitle === "P1" ? { prTitle: "P1", status: "JUDGE_FAILED", comments: [] } : x)) });
    const out = f.dir("s3");
    expect(sheet(out, "--judge", `th=${failed}`).code).toBe(0);
    const items = JSON.parse(readFileSync(path.join(out, "mapping.json"), "utf8")).items as { case: string; comment: number; reasons: string[] }[];
    // both of c1's comments are listed (judge failed), including x.ts:90, which is outside the location range
    expect(items.filter((i) => i.case === "c1").map((i) => [i.comment, i.reasons]).sort()).toEqual([[0, ["judge-v1-failed", "location"]], [1, ["judge-v1-failed"]]]);
  });

  it("score --handcheck: a completed case without its review, an unconsidered review or a changed review refuses; build → resolve → score works", () => {
    const f = scoringFixture();
    // the probe: status completed, empty review directory, a hand-check catch
    const empty = f.dir("empty-reviews");
    mkdirSync(empty);
    const st = f.dir("st.json");
    json(st, { c1: "completed", c2: "no-review", c3: "no-review", c4: "no-review" });
    const hc0 = f.dir("hc0.json");
    json(hc0, { decisions: [{ tool: "th", case: "c1", caught: true, review_sha256: "0".repeat(64) }], reviewed: [] });
    const r0 = run(scoreMain, ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${empty}`, "--status", `th=${st}`, "--handcheck", hc0, "--out", f.dir("h0.json")]);
    expect(r0.code).toBe(2);
    expect(r0.out).toContain("incomplete: th: 1 completed case(s) have no review file");
    expect(r0.out).toContain("incomplete: th: 1 hand-check decision(s) are not bound to a completed case's current review");
    expect(existsSync(f.dir("h0.json"))).toBe(false);
    // the real path: build the sheet, decide, resolve, score
    const sheetDir = f.dir("sheet");
    expect(run(sheetMain, ["build", "--side", "dev", "--goldens", f.goldens, "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--seed", "5", "--out", sheetDir, "--policy", f.policy()]).code).toBe(0);
    const mapping = JSON.parse(readFileSync(path.join(sheetDir, "mapping.json"), "utf8"));
    const decided = f.dir("decided.json");
    json(decided, mapping.items.map((i: { item: string; tool: string; case: string }) => ({ item: i.item, decision: i.tool === "cr" && i.case === "c3" ? "same-bug" : "not",
      guess: i.case === "c3" ? i.tool : "unsure", reason: "r" })));
    const hc = f.dir("hc.json");
    expect(run(sheetMain, ["resolve", "--side", "dev", "--mapping", path.join(sheetDir, "mapping.json"), "--decisions", decided, "--out", hc]).code).toBe(0);
    const args = (out: string) => ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`, "--handcheck", hc, "--out", out];
    const r1 = run(scoreMain, args(f.dir("h1.json")));
    expect(r1.code).toBe(0);
    const s1 = JSON.parse(readFileSync(f.dir("h1.json"), "utf8"));
    expect([s1.tools.th.caught, s1.tools.cr.caught]).toEqual([0, 1]);
    // the guess hit rate: one line, counts only (076c item 7)
    const c3 = mapping.items.filter((i: { case: string }) => i.case === "c3").length, n = mapping.items.length;
    const commonest = Math.max(...["th", "cr"].map((t) => mapping.items.filter((i: { tool: string }) => i.tool === t).length));
    const guessLines = r1.out.split("\n").filter((l) => l.startsWith("hand-check guess:"));
    expect(guessLines).toEqual([`hand-check guess: right ${c3} of ${c3} guessed (${n - c3} unsure, ${n} items, 2 tools; uniform chance 1/2; always naming the commonest tool: ${commonest} of ${n})`]);
    expect(s1.handcheckGuess).toEqual({ items: n, guessed: c3, unsure: n - c3, right: c3, tools: 2, commonestToolItems: commonest });
    // a review that changed after the hand-check refuses
    const r = JSON.parse(readFileSync(f.dir("cr/c3.json"), "utf8"));
    r.comments.push({ path: "w.ts", line: 9, body: "added later" });
    json(f.dir("cr/c3.json"), r);
    const r2 = run(scoreMain, args(f.dir("h2.json")));
    expect(r2.code).toBe(2);
    expect(r2.out).toContain("incomplete: cr: the hand-check did not consider the current review of 1 completed bug case(s)");
    expect(r2.out).toContain("incomplete: cr: 1 hand-check decision(s) are not bound to a completed case's current review");
    // an old-style hand-check without the reviewed list refuses
    const old = f.dir("old.json");
    json(old, { decisions: [] });
    expect(run(scoreMain, [...args(f.dir("h3.json")).slice(0, -4), "--handcheck", old, "--out", f.dir("h3.json")]).out).toMatch(/must be handcheck-sheet.ts resolve output/);
  });
});

// docs/specs/B2.md §7 (Planner A): the expected values pinned with the spec's own inputs; §5.2: at most one rerun.
describe("spec B2 §7 pinned values", () => {
  it("wilson and commentHits", () => {
    const r = (x: [number, number] | null) => x && x.map((v) => +v.toFixed(4));
    expect(r(wilson(10, 20))).toEqual([0.2993, 0.7007]);
    expect(r(wilson(5, 20))).toEqual([0.1119, 0.4687]);
    expect(r(wilson(0, 20))).toEqual([0, 0.1611]);
    expect(r(wilson(3, 4))).toEqual([0.3006, 0.9544]);
    expect(wilson(3, 0)).toBeNull();
    const t: Target[] = [{ file: "a.ts", lines: [100, 110], role: "primary" }];
    expect([90, 89, 120, 121].map((line) => commentHits({ path: "a.ts", line, body: "" }, t))).toEqual([true, false, true, false]);
    expect(commentHits({ path: "a.ts", line: null, body: "" }, t)).toBe(false);
    expect(commentHits({ path: "b.ts", line: 105, body: "" }, t)).toBe(false);
  });

  // 4 bug cases c1-c4 and 1 clean c5; tool A completed all, the judge credits c1, c2; tool B has no review of c1 and is
  // credited on c2, c3, c4
  function specFixture() {
    const d = tmp();
    const dir = (x: string) => path.join(d, "dev", x);
    const tg = (i: number) => [{ file: `f${i}.ts`, lines: [10, 12], role: "primary" }];
    json(dir("goldens.json"), { v: 1, side: "dev", cases: [1, 2, 3, 4].map((i) => ({ case: `c${i}`, pr_title: `P${i}`, label: "bug", targets: tg(i), description: `bug ${i}` }))
      .concat([{ case: "c5", pr_title: "P5", label: "clean", targets: [], description: undefined } as never]) });
    const write = (tool: string, ids: number[], extra: Record<number, number> = {}) => {
      for (const i of ids) json(dir(`${tool}/c${i}.json`), { pr_title: `P${i}`, comments: Array.from({ length: 1 + (extra[i] ?? 0) }, (_, k) => ({ path: `f${i}.ts`, line: 50 + k, body: `${tool} ${i}.${k}` })) });
    };
    const detail = (tool: string, ids: number[], caught: number[], name = `${tool}.detail.json`) => json(dir(name), { detail: ids.map((i) => {
      const r = JSON.parse(readFileSync(dir(`${tool}/c${i}.json`), "utf8"));
      return { prTitle: `P${i}`, status: "SCORED", comments: r.comments.map((c: object) => ({ ...c, matched: caught.includes(i) ? "G1" : null })) };
    }) });
    json(dir("policy.json"), { v: 1, approved: { by: "synthetic", on: "2026-11-11", ref: "spec B2 §7" }, official_attempt: "last", failed_case: "miss",
      unstarted_case: "miss", no_review_in_pairs: "exclude", sheet_judge_cues: "hidden" });
    return { d, dir, write, detail };
  }

  it("score-testset: A 2 of 4, B 3 of 4 (3 of 3 completed), pair n 3, only-A 0, only-B 2, p 0.5; a second match on one case still counts once", () => {
    const f = specFixture();
    f.write("A", [1, 2, 3, 4, 5]); f.write("B", [2, 3, 4, 5]);
    f.detail("A", [1, 2, 3, 4, 5], [1, 2]); f.detail("B", [2, 3, 4, 5], [2, 3, 4]);
    const args = (out: string, aDetail = "A.detail.json") => ["--side", "dev", "--goldens", f.dir("goldens.json"), "--policy", f.dir("policy.json"),
      "--tool", `A=${f.dir("A")}`, "--tool", `B=${f.dir("B")}`, "--judge", `A=${f.dir(aDetail)}`, "--judge", `B=${f.dir("B.detail.json")}`, "--out", out];
    expect(run(scoreMain, args(f.dir("s1.json"))).code).toBe(0);
    const s = JSON.parse(readFileSync(f.dir("s1.json"), "utf8"));
    expect([s.tools.A.caught, s.tools.A.bugCases, s.tools.A.caughtWilson.map((x: number) => +x.toFixed(3))]).toEqual([2, 4, [0.15, 0.85]]);
    expect([s.tools.B.caught, s.tools.B.caughtOfCompleted]).toEqual([3, "3/3"]);
    expect(s.pairs).toEqual([{ a: "A", b: "B", n: 3, onlyA: 0, onlyB: 2, p: 0.5 }]);
    // a second comment on c2 that also matches: A still 2 of 4
    f.write("A", [2], { 2: 1 });
    f.detail("A", [1, 2, 3, 4, 5], [1, 2], "A2.detail.json");
    expect(run(scoreMain, args(f.dir("s2.json"), "A2.detail.json")).code).toBe(0);
    expect(JSON.parse(readFileSync(f.dir("s2.json"), "utf8")).tools.A.caught).toBe(2);
    // a completed bug case missing from the judge detail refuses
    f.detail("A", [2, 3, 4, 5], [2], "A3.detail.json");
    expect(run(scoreMain, args(f.dir("s3.json"), "A3.detail.json")).code).toBe(2);
  });

  it("score-testset --records: the rerun counts; two failures are a miss kept in the pairs; a third record refuses (§5.2)", () => {
    const f = specFixture();
    f.write("A", [1, 2, 3, 4, 5]); f.write("C", [1, 2, 3, 4, 5]);
    f.detail("A", [1, 2, 3, 4, 5], [1]); f.detail("C", [1, 2, 3, 4, 5], []);
    const recs = (name: string, c1: [string, string?, string?]) => {
      for (const i of [2, 3, 4, 5]) json(f.dir(`${name}/c${i}.json`), { case: `c${i}`, status: "ok", usage: { ledger: { costUSD: 0.05 } } });
      c1.forEach((status, k) => { if (status) json(f.dir(`${name}/c1${k ? `.r${k + 1}` : ""}.json`), { case: "c1", status, usage: { ledger: { costUSD: 0.05 } } }); });
    };
    const args = (records: string, out: string) => ["--side", "dev", "--goldens", f.dir("goldens.json"), "--policy", f.dir("policy.json"),
      "--tool", `A=${f.dir("A")}`, "--tool", `C=${f.dir("C")}`, "--judge", `A=${f.dir("A.detail.json")}`, "--judge", `C=${f.dir("C.detail.json")}`,
      "--records", `A=${f.dir(records)}`, "--out", out];
    recs("ok-rerun", ["failed", "ok"]);
    expect(run(scoreMain, args("ok-rerun", f.dir("r1.json"))).code).toBe(0);
    const r1 = JSON.parse(readFileSync(f.dir("r1.json"), "utf8"));
    expect([r1.tools.A.caught, r1.tools.A.misses, r1.tools.A.completedBug]).toEqual([1, 0, 4]);
    recs("two-failures", ["failed", "failed"]);
    expect(run(scoreMain, args("two-failures", f.dir("r2.json"))).code).toBe(0);
    const r2 = JSON.parse(readFileSync(f.dir("r2.json"), "utf8"));
    expect([r2.tools.A.caught, r2.tools.A.misses, r2.tools.A.noReview]).toEqual([0, 1, 0]);
    expect(r2.pairs[0]).toMatchObject({ n: 4, onlyA: 0, onlyB: 0 }); // c1 stays in the pair, not caught
    recs("three", ["failed", "failed", "ok"]);
    const r3 = run(scoreMain, args("three", f.dir("r3.json")));
    expect(r3.code).toBe(2);
    expect(r3.out).toMatch(/c1: 3 runner records \(decision 076a allows one rerun/);
  });

  it("handcheck-sheet: the same seed gives byte-equal sheet.md and mapping.json", () => {
    const f = specFixture();
    f.write("A", [1, 2, 3, 4, 5]); f.detail("A", [1, 2, 3, 4, 5], [1, 2]);
    const build = (out: string) => run(sheetMain, ["build", "--side", "dev", "--goldens", f.dir("goldens.json"), "--tool", `A=${f.dir("A")}`,
      "--judge", `A=${f.dir("A.detail.json")}`, "--seed", "9", "--out", out, "--policy", f.dir("policy.json")]).code;
    expect([build(f.dir("x")), build(f.dir("y"))]).toEqual([0, 0]);
    for (const file of ["sheet.md", "mapping.json"]) expect(readFileSync(path.join(f.dir("x"), file))).toEqual(readFileSync(path.join(f.dir("y"), file)));
  });
});

describe("spec B2 §7 collector row", () => {
  it("one valid comment counted; reply, other account, 1 s after the window and an older commit excluded by reason; review bodies and issue comments are never counted", () => {
    const HEAD = "a".repeat(40), BASE = "b".repeat(40), END = "2026-11-23T00:00:00Z";
    const d = tmp(); const dev = path.join(d, "dev"); mkdirSync(dev, { recursive: true });
    copyFileSync(path.join(import.meta.dirname, "fixtures", "collector-fake-gh.mjs"), path.join(dev, "gh.mjs"));
    writeFileSync(path.join(dev, "gh"), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/gh.mjs" "$@"\n`, { mode: 0o755 });
    writeFileSync(path.join(dev, "gh.log"), "");
    const bot = { login: "coderabbitai[bot]", type: "Bot" };
    const c = (id: number, over: Record<string, unknown> = {}) => ({ id, user: bot, created_at: "2026-11-21T00:00:00Z", commit_id: HEAD, original_commit_id: HEAD,
      path: "x.ts", line: 5, body: `comment ${id}`, ...over });
    json(path.join(dev, "gh.json"), { pulls: { 11: { pr: { base: { sha: BASE }, head: { sha: HEAD } },
      reviews: [{ id: 1, user: bot, submitted_at: "2026-11-21T00:00:00Z", commit_id: HEAD, body: "REVIEW BODY SUMMARY" }],
      issueComments: [{ id: 99, user: bot, created_at: "2026-11-21T00:00:00Z", body: "ISSUE COMMENT WALKTHROUGH" }],
      comments: [c(1), c(2, { in_reply_to_id: 1 }), c(3, { user: { login: "other[bot]", type: "Bot" } }), c(4, { created_at: "2026-11-23T00:00:01Z" }),
        c(5, { commit_id: "c".repeat(40), original_commit_id: "c".repeat(40) })] } } });
    json(path.join(dev, "manifest.json"), [{ id: "c1", title: "P1", base_sha: BASE, case_head_sha: HEAD }]);
    json(path.join(dev, "prmap.json"), { c1: 11 });
    json(path.join(dev, "tools.json"), { v: 1, tools: { coderabbit: { logins: ["coderabbitai[bot]"], notCompletion: ["rate limit exceeded", "^Failed\\b.*retry"] } } });
    const out = path.join(dev, "o");
    const lines: string[] = [];
    expect(collectMain(["--side", "dev", "--tool", "coderabbit", "--config", path.join(dev, "tools.json"), "--repo", "SunnyBagal/twenty",
      "--manifest", path.join(dev, "manifest.json"), "--pr-map", path.join(dev, "prmap.json"), "--window-start", "2026-11-20T00:00:00Z", "--window-end", END,
      "--out", out, "--gh-bin", path.join(dev, "gh"), "--bound", "window-start"], { log: (l) => lines.push(l) })).toBe(0);
    expect(JSON.parse(readFileSync(path.join(out, "coderabbit", "c1.json"), "utf8")).comments).toEqual([{ path: "x.ts", line: 5, body: "comment 1" }]);
    expect(lines[0]).toContain("1 counted comment(s); excluded: other author 1, reply 1, outside window 1, other commit 1, duplicate 0");
    const calls = readFileSync(path.join(dev, "gh.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).argv[3]);
    // decision 076c item 2: issue comments are read for completion only, never counted
    expect(calls.filter((p: string) => p.includes("/issues/"))).toEqual(["repos/SunnyBagal/twenty/issues/11/comments?per_page=100&page=1"]);
    expect(readFileSync(path.join(out, "coderabbit", "c1.json"), "utf8")).not.toMatch(/REVIEW BODY|ISSUE COMMENT/);
  });
});

// decision 076c item 9 / premortem row 11 / Planner B's U6: the collector's statuses through the scorer
describe("collector statuses in score-testset (076c, U6)", () => {
  it("invalid-binding is no-review for that tool (out of its pairs, counted); read-failed is not a result and refuses", () => {
    const f = scoringFixture();
    const st = f.dir("cr.status.json");
    json(st, { c1: "invalid-binding", c2: "no-review", c3: "completed", c4: "completed" });
    const args = (out: string) => ["--side", "dev", "--goldens", f.goldens, "--policy", f.policy(), "--tool", `th=${f.dir("th")}`, "--tool", `cr=${f.dir("cr")}`,
      "--judge", `th=${f.dir("th.detail.json")}`, "--judge", `cr=${f.dir("cr.detail.json")}`, "--status", `cr=${st}`, "--out", out];
    const r = run(scoreMain, args(f.dir("u6.json")));
    expect(r.code).toBe(0);
    const s = JSON.parse(readFileSync(f.dir("u6.json"), "utf8"));
    expect([s.tools.cr.noReview, s.tools.cr.invalidBinding, s.tools.cr.completedBug, s.tools.cr.caught]).toEqual([2, 1, 1, 1]);
    expect(s.tools.th.invalidBinding).toBe(0);
    expect(r.out).toContain("cr: caught 1/3");
    expect(r.out).toContain("no-review 2 (invalid-binding 1)");
    // c1 (invalid-binding) and c2 (no-review) leave the pair; c3 is caught by both
    expect(s.pairs).toEqual([{ a: "th", b: "cr", n: 1, onlyA: 0, onlyB: 0, p: 1 }]);
    // read-failed: exit 2, the reason, no output
    json(st, { c1: "read-failed", c2: "no-review", c3: "completed", c4: "completed" });
    const rf = run(scoreMain, args(f.dir("u6-rf.json")));
    expect(rf.code).toBe(2);
    expect(rf.out).toContain("c1 is read-failed, which is not a result: repeat the collection into a new directory");
    expect(existsSync(f.dir("u6-rf.json"))).toBe(false);
    // any other status still refuses
    json(st, { c1: "pending", c2: "no-review", c3: "completed", c4: "completed" });
    expect(run(scoreMain, args(f.dir("u6-x.json"))).out).toMatch(/c1 has status pending/);
  });
});
