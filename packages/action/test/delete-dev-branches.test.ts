/**
 * scripts/testset/delete-dev-branches.ts (decision 076d item 1b, 076e item 5). Dev fixtures only. Most tests inject a
 * fake runner that plays gh and git for the four forks; the last group runs real git against local bare repositories
 * standing in for the forks (no network: the fork URL is a local path, gh stays fake). Each run fsyncs every log line,
 * so the groups get 60 s (the 5 s default timed out under the full suite's load).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORKS, main, type Runner } from "../../../scripts/testset/delete-dev-branches.ts";

const sha = (n: number) => n.toString(16).padStart(40, "0");
const T = Date.parse("2026-11-14T10:00:00.000Z");
type Fork = { meta: Record<string, unknown>; heads: [string, string][]; pulls: number; open: number; symref?: string };

/** Three dev cases (two on medusa, one on twenty); every fork has its default branch and an unrelated branch. */
function world() {
  const forks: Record<string, Fork> = {};
  for (const r of FORKS) {
    const up = { medusa: "medusajs/medusa", payload: "payloadcms/payload", twenty: "twentyhq/twenty", bullmq: "taskforcesh/bullmq" }[r];
    const def = r === "twenty" ? "main" : "develop";
    forks[r] = { meta: { full_name: `SunnyBagal/${r}`, fork: true, owner: { login: "SunnyBagal" }, parent: { full_name: up }, default_branch: def },
      heads: [[sha(1), `refs/heads/${def}`], [sha(2), "refs/heads/keep-me"]], pulls: 0, open: 0 };
  }
  forks.medusa!.heads.push([sha(11), "refs/heads/cases/case-001"], [sha(12), "refs/heads/cases/case-001-base"],
    [sha(13), "refs/heads/cases/case-002"], [sha(14), "refs/heads/cases/case-002-base"]);
  forks.twenty!.heads.push([sha(21), "refs/heads/cases/case-003"], [sha(22), "refs/heads/cases/case-003-base"]);
  forks.medusa!.pulls = 2; forks.medusa!.open = 2; forks.twenty!.pulls = 1; forks.twenty!.open = 1;
  const clones: Record<string, Record<string, string>> = {
    medusa: Object.fromEntries(forks.medusa!.heads.map(([s, r]) => [r, s])), twenty: Object.fromEntries(forks.twenty!.heads.map(([s, r]) => [r, s])),
  };
  return { forks, clones, urlConfig: "", pushFail: new Set<string>(), closePrs: true };
}

function setup(w = world(), cases: unknown = [{ id: "case-001", repo: "medusa" }, { id: "case-002", repo: "medusa" }, { id: "case-003", repo: "twenty" }]) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "del-dev-"));
  writeFileSync(path.join(dir, "cases.json"), JSON.stringify(cases));
  for (const r of ["medusa", "payload", "twenty", "bullmq"]) mkdirSync(path.join(dir, "repos", r), { recursive: true });
  const calls: { bin: string; argv: string[] }[] = [];
  const urlRe = /^https:\/\/github\.com\/SunnyBagal\/(\w+)\.git$/;
  const run: Runner = (bin, argv, o) => {
    calls.push({ bin, argv });
    expect(Object.keys(o.env).some((k) => k.startsWith("GIT_") && k !== "GIT_TERMINAL_PROMPT")).toBe(false);
    expect(o.env.NEBIUS_API_KEY).toBeUndefined();
    const ok = (stdout: string) => ({ status: 0, stdout, stderr: "" });
    if (bin === "gh") {
      const m = /^repos\/SunnyBagal\/(\w+)(\/pulls\?state=open&per_page=100&page=(\d+))?$/.exec(argv[3]!);
      expect(argv.slice(0, 3)).toEqual(["api", "--method", "GET"]);
      const f = w.forks[m![1]!]!;
      if (!m![2]) return ok(JSON.stringify(f.meta));
      return ok(JSON.stringify(Array.from({ length: Number(m![3]) === 1 ? f.open : 0 }, (_, i) => ({ number: i + 1 }))));
    }
    expect(bin).toBe("git");
    if (argv[0] === "init") return ok("");
    if (argv[0] === "config") return w.urlConfig ? ok(w.urlConfig) : { status: 1, stdout: "", stderr: "" };
    if (argv[0] === "-C") {
      const repo = path.basename(argv[1]!);
      const ref = argv[5]!.replace(/\^\{commit\}$/, "");
      const s = w.clones[repo]?.[ref];
      return s ? ok(s + "\n") : { status: 1, stdout: "", stderr: "" };
    }
    if (argv[0] === "ls-remote") {
      const url = argv.find((a) => urlRe.test(a))!;
      const f = w.forks[urlRe.exec(url)![1]!]!;
      if (argv[1] === "--get-url") return ok(url + "\n");
      if (argv[1] === "--symref") return ok(`ref: ${f.symref ?? `refs/heads/${f.meta.default_branch}`}\tHEAD\n${sha(1)}\tHEAD\n`);
      if (argv[1] === "--heads") return ok(f.heads.map(([s, r]) => `${s}\t${r}\n`).join(""));
      if (argv[2] === "refs/pull/*") return ok(Array.from({ length: f.pulls }, (_, i) => `${sha(90)}\trefs/pull/${i + 1}/head\n${sha(91)}\trefs/pull/${i + 1}/merge\n`).join(""));
    }
    if (argv.includes("push")) {
      const url = argv.find((a) => urlRe.test(a))!;
      const repo = urlRe.exec(url)![1]!;
      const f = w.forks[repo]!;
      const dels = argv.filter((a) => a.startsWith(":refs/")).map((a) => a.slice(1));
      if (w.pushFail.has(repo)) return { status: 1, stdout: dels.map((r) => `!\t(delete):${r}\t[rejected] (stale info)\n`).join(""), stderr: "" };
      if (!argv.includes("--dry-run")) {
        f.heads = f.heads.filter(([, r]) => !dels.includes(r));
        if (w.closePrs) f.open = 0;
      }
      return ok(`To ${url}\n${dels.map((r) => `-\t:${r}\t[deleted]\n`).join("")}Done\n`);
    }
    throw new Error(`unexpected call ${bin} ${argv.join(" ")}`);
  };
  const lines: string[] = [];
  let clock = T;
  const go = (extra: string[] = [], o: { out?: string } = {}) =>
    main(["--cases", path.join(dir, "cases.json"), "--clones", path.join(dir, "repos"), "--out", o.out ?? path.join(dir, "out"), ...extra],
      { run, now: () => (clock += 1000), say: (l) => lines.push(l), env: { PATH: "/bin", HOME: dir, NEBIUS_API_KEY: "x", GIT_DIR: "/nope" } });
  const pushes = () => calls.filter((c) => c.argv.includes("push"));
  const log = (out = path.join(dir, "out")) => readFileSync(path.join(out, "delete-dev-branches.log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { dir, w, calls, lines, go, pushes, log };
}

describe("delete-dev-branches: refusals", { timeout: 60_000 }, () => {
  it("refuses before anything is read: missing flags, held-out paths (incl. behind a symlink), ho- ids, unknown repos, duplicates", () => {
    const t = setup();
    const ho = path.join(t.dir, "heldout"); mkdirSync(ho);
    const link = path.join(t.dir, "innocent"); symlinkSync(ho, link);
    writeFileSync(path.join(ho, "cases.json"), "[]");
    const refusals: [string[], RegExp][] = [
      [["--clones", "x", "--out", "y"], /--cases is required/],
      [["--cases", path.join(ho, "cases.json"), "--clones", path.join(t.dir, "repos"), "--out", path.join(t.dir, "o1")], /held-out path/],
      [["--cases", path.join(link, "cases.json"), "--clones", path.join(t.dir, "repos"), "--out", path.join(t.dir, "o2")], /held-out path/],
      [["--cases", path.join(t.dir, "cases.json"), "--clones", path.join(t.dir, "labels", "held-out"), "--out", path.join(t.dir, "o3")], /held-out path/],
      [["--cases", path.join(t.dir, "cases.json"), "--clones", path.join(t.dir, "repos"), "--out", path.join(t.dir, "heldout", "o4")], /held-out path/],
    ];
    for (const [argv, re] of refusals) {
      t.lines.length = 0;
      expect(main(argv, { run: () => { throw new Error("no call"); }, say: (l) => t.lines.push(l) })).toBe(2);
      expect(t.lines.join("\n")).toMatch(re);
    }
    for (const [cases, re] of [
      [[{ id: "ho-001", repo: "medusa" }], /not case-NNN/],
      [[{ id: "case-001", repo: "medusa" }, { id: "ho-002", repo: "twenty" }], /not case-NNN/],
      [[{ id: "case-001", repo: "cal.com" }], /is not one of/],
      [[{ id: "case-001", repo: "medusa" }, { id: "case-001", repo: "medusa" }], /listed twice/],
      [[], /non-empty array/],
    ] as [unknown, RegExp][]) {
      const u = setup(world(), cases);
      expect(u.go()).toBe(2);
      expect(u.lines.join("\n")).toMatch(re);
      expect(u.calls).toEqual([]);
    }
    const v = setup();
    mkdirSync(path.join(v.dir, "used")); writeFileSync(path.join(v.dir, "used", "x"), "");
    expect(v.go([], { out: path.join(v.dir, "used") })).toBe(2);
    expect(v.lines.join("\n")).toMatch(/not empty; never overwritten/);
  });

  it("refuses after the reads and deletes nothing anywhere: unlisted branch, default branch, clone mismatch, fork identity, URL rewrite", () => {
    const cases: [string, (w: ReturnType<typeof world>) => void, RegExp][] = [
      ["a case branch on a fork that the list does not name", (w) => { w.forks.payload!.heads.push([sha(31), "refs/heads/cases/case-099"]); }, /SunnyBagal\/payload: 1 case branch\(es\) not in the list/],
      ["another fork's case on this fork", (w) => { w.forks.twenty!.heads.push([sha(11), "refs/heads/cases/case-001"]); }, /SunnyBagal\/twenty: 1 case branch/],
      ["any cases/ branch on bullmq", (w) => { w.forks.bullmq!.heads.push([sha(41), "refs/heads/cases/x"]); }, /SunnyBagal\/bullmq: 1 case branch/],
      ["the default branch is a listed case ref", (w) => { w.forks.medusa!.meta.default_branch = "cases/case-001"; w.forks.medusa!.symref = "refs/heads/cases/case-001"; }, /is the default branch; never deleted/],
      ["gh and git disagree on the default branch", (w) => { w.forks.twenty!.symref = "refs/heads/cases/case-003"; }, /default branch differs/],
      ["a branch differs from the clone", (w) => { w.clones.twenty!["refs/heads/cases/case-003-base"] = sha(99); }, /cases\/case-003-base differs from the clone/],
      ["a branch is missing from the clone", (w) => { delete w.clones.medusa!["refs/heads/cases/case-002"]; }, /clone missing/],
      ["not a fork", (w) => { w.forks.bullmq!.meta.fork = false; }, /is not SunnyBagal's fork of taskforcesh\/bullmq/],
      ["wrong parent", (w) => { w.forks.payload!.meta.parent = { full_name: "someone/payload" }; }, /fork of payloadcms\/payload/],
      ["a pushInsteadOf rewrite of the fork URL", (w) => { w.urlConfig = "url.git@evil:x/.pushinsteadof https://github.com/SunnyBagal/\n"; }, /rewrites https:\/\/github.com\/SunnyBagal\/medusa.git/],
    ];
    for (const [name, mutate, re] of cases) {
      const w = world(); mutate(w);
      const t = setup(w);
      for (const ex of [[], ["--execute"]]) {
        t.lines.length = 0;
        expect(t.go(ex, { out: path.join(t.dir, `out${ex.length}`) }), name).toBe(2);
        expect(t.lines.join("\n"), name).toMatch(re);
      }
      expect(t.pushes(), name).toEqual([]);
    }
  });
});

describe("delete-dev-branches: dry run and execute", { timeout: 60_000 }, () => {
  it("dry run: reads, then git push --dry-run of only the listed refs; counts per fork; every action logged with UTC time", () => {
    const t = setup();
    expect(t.go()).toBe(0);
    const p = t.pushes();
    expect(p.map((c) => c.argv.find((a) => a.startsWith("https://")))).toEqual(["https://github.com/SunnyBagal/medusa.git", "https://github.com/SunnyBagal/twenty.git"]);
    for (const c of p) expect(c.argv).toContain("--dry-run");
    expect(p[0]!.argv.filter((a) => a.startsWith(":"))).toEqual([":refs/heads/cases/case-001", ":refs/heads/cases/case-001-base", ":refs/heads/cases/case-002", ":refs/heads/cases/case-002-base"]);
    expect(p[0]!.argv).toContain(`--force-with-lease=refs/heads/cases/case-001:${sha(11)}`);
    expect(p[0]!.argv.slice(0, 7)).toEqual(["-c", "core.hooksPath=/dev/null", "push", "--atomic", "--porcelain", "--no-verify", "--dry-run"]);
    expect(t.w.forks.medusa!.heads).toHaveLength(6); // nothing deleted
    const out = t.lines.join("\n");
    expect(out).toMatch(/medusa case-branches=4 open-prs=2 refs-pull=4 \(head 2\)/);
    expect(out).toMatch(/payload case-branches=0 open-prs=0 refs-pull=0 \(head 0\)/);
    expect(out).toMatch(/twenty case-branches=2 open-prs=1 refs-pull=2 \(head 1\)/);
    expect(out).toMatch(/bullmq case-branches=0 open-prs=0/);
    const log = t.log();
    for (const r of log) expect(r.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(log.filter((r) => r.event === "cmd").length).toBe(t.calls.length);
    expect(log.at(-1)).toMatchObject({ event: "end", exit: 0 });
    expect(readFileSync(path.join(t.dir, "out", "branches.before.medusa.txt"), "utf8")).toBe(
      `${sha(11)}\trefs/heads/cases/case-001\n${sha(12)}\trefs/heads/cases/case-001-base\n${sha(13)}\trefs/heads/cases/case-002\n${sha(14)}\trefs/heads/cases/case-002-base\n`);
  });

  it("execute: one atomic push per fork, only listed refs; default and other branches stay; ends clean with exit 0", () => {
    const t = setup();
    expect(t.go(["--execute"])).toBe(0);
    for (const c of t.pushes()) expect(c.argv).not.toContain("--dry-run");
    expect(t.w.forks.medusa!.heads.map(([, r]) => r)).toEqual(["refs/heads/develop", "refs/heads/keep-me"]);
    expect(t.w.forks.twenty!.heads.map(([, r]) => r)).toEqual(["refs/heads/main", "refs/heads/keep-me"]);
    const summary = JSON.parse(readFileSync(path.join(t.dir, "out", "summary.json"), "utf8"));
    expect(summary.counts.medusa).toEqual({ caseBranches: 0, openPrs: 0, pullRefs: 4, pullHeadRefs: 2 });
    expect(t.lines.join("\n")).toMatch(/every fork: 0 case branches, 0 open PRs/);
    // a second run finds nothing to delete and makes no push
    const n = t.pushes().length;
    expect(t.go(["--execute"], { out: path.join(t.dir, "again") })).toBe(0);
    expect(t.pushes().length).toBe(n);
  });

  it("a list that leaves out a case whose branches are on a fork refuses, rather than deleting a subset", () => {
    const t = setup(world(), [{ id: "case-001", repo: "medusa" }, { id: "case-003", repo: "twenty" }]);
    expect(t.go(["--execute"])).toBe(2);
    expect(t.lines.join("\n")).toMatch(/SunnyBagal\/medusa: 2 case branch\(es\) not in the list for medusa \(first refs\/heads\/cases\/case-002\)/);
    expect(t.pushes()).toEqual([]);
  });

  it("a listed case with no branch on its fork is fine (already gone); a failed push stops before the next fork, exit 1", () => {
    const w = world(); w.pushFail.add("medusa");
    const t = setup(w, [{ id: "case-001", repo: "medusa" }, { id: "case-002", repo: "medusa" }, { id: "case-003", repo: "twenty" }, { id: "case-004", repo: "payload" }]);
    expect(t.go(["--execute"])).toBe(1);
    expect(t.pushes().map((c) => c.argv.find((a) => a.startsWith("https://")))).toEqual(["https://github.com/SunnyBagal/medusa.git"]);
    expect(t.w.forks.twenty!.heads).toHaveLength(4);
    expect(t.lines.join("\n")).toMatch(/push to SunnyBagal\/medusa did not delete all 4 refs; later forks untouched/);
    expect(t.lines.join("\n")).toMatch(/twenty case-branches=2 open-prs=1/);
  });

  it("execute ends with exit 1 when an open PR remains", () => {
    const w = world(); w.closePrs = false;
    const t = setup(w);
    expect(t.go(["--execute"])).toBe(1);
    expect(t.lines.join("\n")).toMatch(/medusa case-branches=0 open-prs=2/);
    expect(t.log().at(-1)).toMatchObject({ event: "end", exit: 1, note: "not clean" });
  });
});

describe("delete-dev-branches: real git against local bare forks", { timeout: 60_000 }, () => {
  const git = (cwd: string, ...a: string[]) => {
    const r = spawnSync("git", a, { cwd, encoding: "utf8", env: { PATH: process.env.PATH!, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1" } });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  function realWorld() {
    const dir = mkdtempSync(path.join(os.tmpdir(), "del-dev-git-"));
    const forks: Record<string, string> = {};
    for (const r of FORKS) {
      const src = path.join(dir, "repos", r);
      mkdirSync(src, { recursive: true });
      git(src, "init", "-q", "-b", r === "twenty" ? "main" : "develop");
      git(src, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "base");
      git(src, "branch", "keep-me");
      if (r === "medusa") for (const b of ["cases/case-001", "cases/case-001-base"]) git(src, "branch", b);
      if (r === "twenty") for (const b of ["cases/case-003", "cases/case-003-base"]) git(src, "branch", b);
      git(src, "update-ref", "refs/pull/7/head", "HEAD");
      forks[r] = path.join(dir, `${r}.git`);
      git(dir, "clone", "-q", "--bare", src, forks[r]!);
      git(src, "push", "-q", forks[r]!, "refs/pull/7/head");
    }
    writeFileSync(path.join(dir, "cases.json"), JSON.stringify([{ id: "case-001", repo: "medusa" }, { id: "case-003", repo: "twenty" }]));
    const gh: Runner = (bin, argv, o) => {
      if (bin === "git") {
        const r = spawnSync("git", argv, { cwd: o.cwd, encoding: "utf8", env: { ...o.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1" } });
        return { status: r.status, stdout: r.stdout, stderr: r.stderr };
      }
      const m = /^repos\/SunnyBagal\/(\w+)(\/pulls)?/.exec(argv[3]!)!;
      if (m[2]) return { status: 0, stdout: "[]", stderr: "" };
      const up = { medusa: "medusajs/medusa", payload: "payloadcms/payload", twenty: "twentyhq/twenty", bullmq: "taskforcesh/bullmq" }[m[1]!];
      return { status: 0, stdout: JSON.stringify({ full_name: `SunnyBagal/${m[1]}`, fork: true, owner: { login: "SunnyBagal" }, parent: { full_name: up },
        default_branch: m[1] === "twenty" ? "main" : "develop" }), stderr: "" };
    };
    const lines: string[] = [];
    const go = (out: string, extra: string[] = []) => main(["--cases", path.join(dir, "cases.json"), "--clones", path.join(dir, "repos"), "--out", path.join(dir, out), ...extra],
      { run: gh, url: (r) => forks[r]!, say: (l) => lines.push(l), env: { PATH: process.env.PATH } });
    const refs = (r: string) => git(dir, "ls-remote", forks[r]!).split("\n").map((l) => l.split("\t")[1]).sort();
    return { dir, forks, go, lines, refs };
  }

  it("dry run changes nothing; execute deletes exactly the listed branches; refs/pull stays and is counted", () => {
    const t = realWorld();
    const before = Object.fromEntries(FORKS.map((r) => [r, t.refs(r)]));
    expect(t.go("dry")).toBe(0);
    for (const r of FORKS) expect(t.refs(r)).toEqual(before[r]);
    expect(t.lines.join("\n")).toMatch(/medusa case-branches=2 open-prs=0 refs-pull=1/);
    expect(t.go("exec", ["--execute"])).toBe(0);
    expect(t.refs("medusa")).toEqual(["HEAD", "refs/heads/develop", "refs/heads/keep-me", "refs/pull/7/head"]);
    expect(t.refs("twenty")).toEqual(["HEAD", "refs/heads/keep-me", "refs/heads/main", "refs/pull/7/head"]);
    expect(t.refs("payload")).toEqual(before.payload);
    expect(t.lines.join("\n")).toMatch(/medusa case-branches=0 open-prs=0 refs-pull=1 \(head 1\)/);
    // the clones keep every ref
    expect(git(path.join(t.dir, "repos", "medusa"), "branch", "--list", "cases/*")).toMatch(/cases\/case-001-base/);
  });

  it("a branch that moved after the listing fails the fork's atomic push: nothing on that fork is deleted", () => {
    const t = realWorld();
    // the lease is the listed sha; move the fork's branch between listing and push by moving it in the fork first
    // and making the clone agree, then moving the fork again behind the script's back via a runner hook
    const medusaSrc = path.join(t.dir, "repos", "medusa");
    let moved = false;
    const inner: Runner = (bin, argv, o) => {
      if (bin === "git" && argv.includes("push") && !moved) {
        moved = true;
        git(medusaSrc, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "late");
        git(medusaSrc, "push", "-q", "-f", t.forks.medusa!, "HEAD:refs/heads/cases/case-001-base");
      }
      if (bin === "git") {
        const r = spawnSync("git", argv, { cwd: o.cwd, encoding: "utf8", env: { ...o.env, HOME: t.dir, GIT_CONFIG_NOSYSTEM: "1" } });
        return { status: r.status, stdout: r.stdout, stderr: r.stderr };
      }
      const m = /^repos\/SunnyBagal\/(\w+)(\/pulls)?/.exec(argv[3]!)!;
      if (m[2]) return { status: 0, stdout: "[]", stderr: "" };
      const up = { medusa: "medusajs/medusa", payload: "payloadcms/payload", twenty: "twentyhq/twenty", bullmq: "taskforcesh/bullmq" }[m[1]!];
      return { status: 0, stdout: JSON.stringify({ full_name: `SunnyBagal/${m[1]}`, fork: true, owner: { login: "SunnyBagal" }, parent: { full_name: up },
        default_branch: m[1] === "twenty" ? "main" : "develop" }), stderr: "" };
    };
    const lines: string[] = [];
    const code = main(["--cases", path.join(t.dir, "cases.json"), "--clones", path.join(t.dir, "repos"), "--out", path.join(t.dir, "lease"), "--execute"],
      { run: inner, url: (r) => t.forks[r]!, say: (l) => lines.push(l), env: { PATH: process.env.PATH } });
    expect(code).toBe(1);
    expect(t.refs("medusa")).toContain("refs/heads/cases/case-001");
    expect(t.refs("medusa")).toContain("refs/heads/cases/case-001-base");
    expect(t.refs("twenty")).toContain("refs/heads/cases/case-003"); // later fork untouched
    expect(lines.join("\n")).toMatch(/push to SunnyBagal\/medusa did not delete all 2 refs/);
    expect(existsSync(path.join(t.dir, "lease", "summary.json"))).toBe(true);
  });
});
