// The track C case runner's prompt per packet arm (sidetrack/ab2-plan.md). No model: the one end-to-end
// test puts a stand-in `claude` on PATH that prints an empty review.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPrompt, RUNNER_VERSION, skillBody } from "../../../scripts/track-c/review-case.ts";
import { cleanGitEnv } from "../src/git-env.ts";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const ROOT = path.resolve(import.meta.dirname, "../../..");
const RUN = { repo: "/r", base: "b", head: "h", factsDir: "/f", hasContracts: false };

describe("track C runner: the prompt of each packet arm", () => {
  it("leaves the packet arms' text as it was at ccf6c01 (A/B 1)", () => {
    // sidetrack/ab1-plan.md pins the skill file; the prompt hashes were taken at ccf6c01, before --packet none existed
    expect(sha(readFileSync(path.join(ROOT, ".claude/skills/tracehound-review/SKILL.md")))).toBe("9b5e37576228e0f798e53306e17ef3a4cb66a378a27c98455c377bf62941f660");
    expect(sha(skillBody())).toBe("f3143ef9069da45b524332ca895c97c548ad9ed0a3476c24a7c92c9d2f5fa934");
    expect(sha(skillBody("capped"))).toBe(sha(skillBody("full")));
    expect(sha(buildPrompt(RUN))).toBe("7dc1c4d8ee85f2e83ab6a6970bdbef6d6fbdcfbb0efb5ede876bcdb62b177af1");
    expect(sha(buildPrompt({ ...RUN, packet: "capped" }))).toBe("7dc1c4d8ee85f2e83ab6a6970bdbef6d6fbdcfbb0efb5ede876bcdb62b177af1");
    expect(sha(buildPrompt({ ...RUN, hasContracts: true }))).toBe("8398553f77bb80866eba064094dafc7486008c981f0864754f7f535d4809edeb");
  });

  it("gives the no-packet arm the same text without the affected set (hashes pinned in sidetrack/ab2-plan.md)", () => {
    const none = skillBody("none");
    expect(sha(none)).toBe("5ee39c8996c57c86361828620684011ca3285098591063cc33ce1e7ea9ff06c7");
    expect(sha(buildPrompt({ ...RUN, packet: "none" }))).toBe("75c2457e8c20a9c53ffe22e09552abc0a90c90def409d03be9854cf697b61170");
    expect(none).not.toMatch(/affected set|affected\.txt|src\/affected/);
    expect(buildPrompt({ ...RUN, packet: "none" })).not.toContain("affected.txt");
    expect(none).toContain("search the\nrepository yourself for the places that use it before concluding anything about them.");
    // everything outside steps 1 and 2 is the packet arms' text, byte for byte
    const tail = (s: string) => s.slice(s.indexOf("## 3. Validate each candidate"));
    const top = (s: string) => s.slice(0, s.indexOf("## 1. Collect facts"));
    expect(tail(none)).toBe(tail(skillBody()));
    expect(top(none)).toBe(top(skillBody()));
  });
});

describe("track C runner: --packet none end to end, with a stand-in for claude", () => {
  let dir: string;
  let repo: string;
  let base: string;
  let head: string;
  const g = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "th-trackc-"));
    repo = path.join(dir, "repo");
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src/a.ts"), "export const a = (n: number) => n + 1;\n");
    g(["init", "-q", "-b", "main"]);
    g(["config", "user.email", "t@example.invalid"]);
    g(["config", "user.name", "t"]);
    g(["add", "."]);
    g(["commit", "-q", "-m", "base"]);
    base = g(["rev-parse", "HEAD"]);
    writeFileSync(path.join(repo, "src/a.ts"), "export const a = (n: number) => n + 2;\n");
    g(["commit", "-q", "-am", "head"]);
    head = g(["rev-parse", "HEAD"]);
    writeFileSync(path.join(dir, "pr.json"), JSON.stringify({ "case-x": { title: "Add two", description: "d" } }));
    // the stand-in records its arguments and answers like `claude -p --output-format json`
    mkdirSync(path.join(dir, "bin"));
    const fake = path.join(dir, "bin/claude");
    writeFileSync(fake, `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(path.join(dir, "argv.json"))}, JSON.stringify(process.argv.slice(2)));\nconsole.log(JSON.stringify({ result: '{"pr_title":"","comments":[]}', num_turns: 1, total_cost_usd: 0, usage: {}, is_error: false }));\n`);
    chmodSync(fake, 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (packet: string, out: string) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts/track-c/review-case.ts"), "--id", "case-x", "--repo", repo, "--base", base, "--head", head, "--pr-text", path.join(dir, "pr.json"), "--out", out, "--model", "sonnet", "--skip-checkout", "--packet", packet], {
      encoding: "utf8",
      env: { ...cleanGitEnv(), PATH: `${path.join(dir, "bin")}${path.delimiter}${process.env.PATH ?? ""}` },
    });

  it("does not run the lookup, writes no affected.txt and records the arm", () => {
    const out = path.join(dir, "out-none");
    const r = run("none", out);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(out, "facts/case-x/diff.patch"))).toBe(true);
    expect(existsSync(path.join(out, "facts/case-x/affected.txt"))).toBe(false);
    const record = JSON.parse(readFileSync(path.join(out, "runs/case-x.json"), "utf8"));
    expect(record).toMatchObject({ v: RUNNER_VERSION, packet: "none", status: "ok", comments: 0, commentsOnFilesOutsideDiff: 0, affected: null });
    expect(JSON.parse(readFileSync(path.join(out, "reviews/case-x.json"), "utf8"))).toEqual({ pr_title: "Add two", comments: [] });
    const argv = JSON.parse(readFileSync(path.join(dir, "argv.json"), "utf8")) as string[];
    expect(argv[1]).not.toContain("affected.txt");
    expect(argv.slice(argv.indexOf("--tools") + 1, argv.indexOf("--tools") + 4)).toEqual(["Read", "Grep", "Glob"]);
  });

  it("still writes the packet for the capped arm, and refuses an unknown one", () => {
    const out = path.join(dir, "out-capped");
    expect(run("capped", out).status).toBe(0);
    expect(readFileSync(path.join(out, "facts/case-x/affected.txt"), "utf8")).toContain("AFFECTED SET, short form (affected@0.5;");
    expect(JSON.parse(readFileSync(path.join(out, "runs/case-x.json"), "utf8"))).toMatchObject({ packet: "capped", affected: { version: "affected@0.5" } });
    const bad = run("tiny", path.join(dir, "out-bad"));
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("--packet must be full, capped or none");
  });
});
