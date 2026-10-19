import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanGitEnv } from "../src/git-env.ts";
import { fingerprint, similar, SAME_EXTENSION_JACCARD, SAME_PATH_JACCARD } from "../src/learn/fingerprint.ts";
import { FeedbackSuppression } from "../src/learn/suppress.ts";
import { collectFeedback, patchTouches, serializeFeedback } from "../../action/src/learn.ts";
import { feedbackFixture } from "./fixtures/learn/api.ts";
import { appliesTo, main as conventionsMain, readConventions } from "../src/learn/conventions.ts";

const finding = { path: "src/profile.ts", line: 20, body: "null dereference of user in getProfile" };
const rephrased = { ...finding, body: "Possible null dereference: user may be undefined in getProfile" };
const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); vi.restoreAllMocks(); });
function tempRepo() { const dir = mkdtempSync(path.join(tmpdir(), "tracehound-learn-")); dirs.push(dir); return dir; }
function save(repo: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text);
}

describe("read-only conventions", () => {
  it("reads the supported files in deterministic order and scopes instructions to changed paths", () => {
    const repo = tempRepo();
    for (const file of ["AGENTS.md", "CLAUDE.md", ".cursor/BUGBOT.md", ".github/copilot-instructions.md", ".tracehound/rules.md"]) save(repo, file, file);
    save(repo, ".github/instructions/b.instructions.md", '---\napplyTo: "**/*.py"\n---\nPython rules');
    save(repo, ".github/instructions/a.instructions.md", '---\napplyTo: "src/**/*.ts"\n---\nTS rules');
    save(repo, ".github/instructions/ignored.md", "unscoped");
    save(repo, ".github/instructions/missing.instructions.md", "missing frontmatter");
    const result = readConventions(repo, ["src/profile.ts"]);
    expect(result.files.map(file => file.path)).toEqual(["AGENTS.md", "CLAUDE.md", ".cursor/BUGBOT.md",
      ".github/copilot-instructions.md", ".github/instructions/a.instructions.md", ".tracehound/rules.md"]);
    expect(result.text).toContain("TS rules"); expect(result.text).not.toContain("Python rules");
    expect(readConventions(repo, ["src/profile.ts"])).toEqual(result);
  });
  it("honors per-file and total caps with each cut noted", () => {
    const repo = tempRepo();
    save(repo, "AGENTS.md", "a".repeat(5000)); save(repo, "CLAUDE.md", "b".repeat(5000));
    save(repo, ".tracehound/rules.md", "c".repeat(5000));
    const result = readConventions(repo, []);
    expect(result.files[0]!.chars).toBe(4000);
    expect(result.files.every(file => file.chars <= 4000)).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(8000);
    expect(result.text.match(/cut: 4,000/g)).toHaveLength(3);
    expect(result.text.match(/cut: 8,000/g)).toHaveLength(2);
  });
  it("ignores absent files and symlinks escaping the head checkout", () => {
    const repo = tempRepo(), outside = tempRepo(); save(outside, "private.md", "outside");
    symlinkSync(path.join(outside, "private.md"), path.join(repo, "AGENTS.md"));
    mkdirSync(path.join(repo, ".github"));
    symlinkSync(outside, path.join(repo, ".github/instructions"));
    expect(readConventions(repo, [])).toEqual({ files: [], text: "" });
    expect(readFileSync(path.join(outside, "private.md"), "utf8")).toBe("outside");
  });
  it("matches comma-separated globs, brace alternatives, CRLF and normalized changed paths", () => {
    expect(appliesTo('---\r\napplyTo: "src/**/*.{ts,tsx},lib/*.js"\r\n---\r\nrules', ["./src\\profile.ts"])).toBe(true);
    expect(appliesTo("---\napplyTo: '**/*.py'\n---\nrules", ["src/profile.ts"])).toBe(false);
    expect(appliesTo("applyTo: '**/*.ts'", ["src/profile.ts"])).toBe(false);
  });
  it("the one-line bin dispatch writes conventions JSON without model or network access", () => {
    const repo = tempRepo(), out = path.join(repo, "out.json"); save(repo, "AGENTS.md", "Repo conventions");
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../src/bin.ts"), "conventions",
      "--repo", repo, "--changed", "src/profile.ts,src/other.py", "--out", out], { env: cleanGitEnv(), encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(readConventions(repo, ["src/profile.ts", "src/other.py"]));
    expect(readFileSync(path.join(repo, "AGENTS.md"), "utf8")).toBe("Repo conventions");
  });
  it("rejects missing CLI arguments without reading repo contents", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(conventionsMain([])).toBe(1);
  });
});

describe("explainable feedback suppression", () => {
  it("suppresses a rephrased defect with source PR, comment, URL and reason", () => {
    const rejected = { ...fingerprint(finding), repo: "example/widget", pr: 4, commentId: 12,
      reason: "reaction", url: "https://github.com/example/widget/pull/4#discussion_r12" };
    const items = [rejected];
    const suppression = new FeedbackSuppression(items);
    items.length = 0;
    rejected.tokens.length = 0;
    expect(suppression.matches(rephrased)).toBe(true);
    expect(suppression.explain(rephrased)).toMatchObject({ pr: 4, commentId: 12, reason: "reaction", url: rejected.url });
    expect(suppression.matches({ ...finding, body: "SQL injection: name is concatenated into the query in getProfile" })).toBe(false);
    expect(suppression.matches({ ...rephrased, path: "src/profile.py" })).toBe(false);
    expect(suppression.explain({ ...finding, body: "different issue" })).toBeUndefined();
  });
});

describe("maintainer feedback collection (local GitHub API fixtures)", () => {
  const collect = (f: ReturnType<typeof feedbackFixture>) => collectFeedback("example/widget", f.options, f.deps);
  it("collects a maintainer thumbs down with its reason and URL", async () => {
    const f = feedbackFixture();
    expect(await collect(f)).toEqual([{ ...fingerprint(finding), repo: "example/widget", pr: 3, commentId: 10,
      reason: "reaction", url: f.root.html_url }]);
  });
  it("ignores a thumbs down from a read-only user", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/collaborators/owner/permission"] = { permission: "read" };
    expect(await collect(f)).toEqual([]);
  });
  it("does not reject a resolved thread when a later commit touched the lines", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [];
    f.thread.isResolved = true;
    f.entries["/repos/example/widget/commits/later?per_page=100&page=1"] = { files: [{ filename: finding.path,
      status: "modified", patch: "@@ -18,4 +18,4 @@\n context\n context\n-old\n+fixed\n context" }] };
    expect(await collect(f)).toEqual([]);
  });
  it("accepts a resolved thread with provably unchanged nearby lines", async () => {
    const f = feedbackFixture(); f.thread.isResolved = true;
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [];
    expect(await collect(f)).toMatchObject([{ reason: "resolved-unchanged" }]);
  });
  it("a maintainer good catch reply un-rejects the same comment", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [f.root, { ...f.reply, body: "Good catch!" }];
    expect(await collect(f)).toEqual([]);
  });
  it("a later thumbs up un-rejects; a still later thumbs down re-rejects", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [f.reaction,
      { ...f.reaction, id: 31, content: "+1", created_at: "2026-10-04T00:00:00Z" }];
    expect(await collect(f)).toEqual([]);
    f.reaction.created_at = "2026-10-05T00:00:00Z";
    expect(await collect(f)).toMatchObject([{ reason: "reaction" }]);
  });
  it("collection twice produces byte-identical rejected.json", async () => {
    const f = feedbackFixture();
    const first = serializeFeedback(await collect(f));
    expect(serializeFeedback(await collect(f))).toBe(first);
    expect(first.endsWith("\n")).toBe(true);
  });
  it.each(["false positive", "not a bug", "won't fix", "wontfix", "nit", "ignore", "not an issue", "by design"])("recognizes whole phrase %s, case insensitively", async text => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [f.root, { ...f.reply, body: `This is ${text.toUpperCase()}.` }];
    expect(await collect(f)).toMatchObject([{ reason: `reply:${text}` }]);
  });
  it.each(["nitrogen", "wontfixable", "ignored"])("does not match partial phrase %s", async body => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [];
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [f.root, { ...f.reply, body }];
    expect(await collect(f)).toEqual([]);
  });
  it("caches permission checks per run across reactions and replies", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [f.root, f.reply];
    await collect(f);
    expect(f.calls.filter(call => call.includes("/permission"))).toHaveLength(1);
  });
  it.each(["read", "triage", "none"])("does not accept %s resolver permissions", async permission => {
    const f = feedbackFixture(); f.thread.isResolved = true;
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [];
    f.entries["/repos/example/widget/collaborators/owner/permission"] = { permission };
    expect(await collect(f)).toEqual([]);
  });
  it("never trusts another bot or a human comment sitting in a marked review", async () => {
    const f = feedbackFixture(); f.root.user.login = "stranger";
    expect(await collect(f)).toEqual([]);
  });
  it("ignores bot comments in unmarked reviews and quoted footer text", async () => {
    const f = feedbackFixture(); f.review.body = `${f.footer}\n\nquoted, not a footer`;
    expect(await collect(f)).toEqual([]);
    expect(f.calls.some(call => call.includes("/permission"))).toBe(false);
  });
  it("learns body findings, ignoring header/footer and fix suggestions", async () => {
    const f = feedbackFixture();
    f.review.body = `TraceHound\n\n${finding.path}:500\n${finding.body}\n\nSuggested fix (model-generated, not tested):\n\`\`\`diff\n-fix\n\`\`\`\n\nThese comments are model-generated and unverified.\n\n${f.footer}`;
    f.reviewReactions.push({ id: "reaction1", content: "THUMBS_DOWN", createdAt: f.reaction.created_at, user: f.reaction.user });
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [];
    expect(await collect(f)).toEqual([{ ...fingerprint(finding), repo: "example/widget", pr: 3, commentId: 2,
      reason: "reaction", url: f.review.html_url }]);
    f.entries["/repos/example/widget/issues/3/comments?per_page=100&page=1"] = [{ ...f.reply,
      body: `${f.review.html_url} good catch` }];
    expect(await collect(f)).toEqual([]);
  });
  it("ignores unrelated positive discussion and signals on other comments", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls/3/comments?per_page=100&page=1"] = [f.root, { ...f.reply, in_reply_to_id: 99, body: "fixed" }];
    expect(await collect(f)).toHaveLength(1);
  });
  it("does not fetch PRs older than 60 days", async () => {
    const f = feedbackFixture();
    f.entries["/repos/example/widget/pulls?state=all&sort=updated&direction=desc&per_page=30"] = [{ number: 3, updated_at: "2026-08-01T00:00:00Z" }];
    expect(await collect(f)).toEqual([]); expect(f.calls).toHaveLength(1);
  });
  it("does not infer unchanged from missing commit history or missing patches", async () => {
    const f = feedbackFixture(); f.thread.isResolved = true;
    f.entries["/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1"] = [];
    f.entries["/repos/example/widget/commits/later?per_page=100&page=1"] = { files: [{ filename: finding.path, status: "modified" }] };
    expect(await collect(f)).toEqual([]);
    f.entries["/repos/example/widget/pulls/3/commits?per_page=100&page=1"] = [{ sha: "unrelated" }];
    expect(await collect(f)).toEqual([]);
  });
  it("refuses the benchmark repository before any request", async () => {
    const f = feedbackFixture();
    await expect(collectFeedback("CALCOM/CAL.COM", f.options, f.deps)).rejects.toThrow("refused");
    expect(f.calls).toEqual([]);
  });
  it("checks actual changed lines, ±5 boundaries, and translates distant insertions", () => {
    expect(patchTouches("@@ -15 +15 @@\n-old\n+new", 20).touched).toBe(true);
    expect(patchTouches("@@ -26 +26 @@\n-old\n+new", 20).touched).toBe(false);
    expect(patchTouches("@@ -1 +1,2 @@\n context\n+extra", 20)).toEqual({ touched: false, line: 21 });
    expect(patchTouches("not a patch", 20).touched).toBe(true);
  });
});

describe("learning fingerprints", () => {
  it("normalizes paths and keeps a sorted lowercase word set without code, numbers or stop words", () => {
    expect(fingerprint({ path: "./src\\Profile.TS", body: "The NULL null dereference at 123: `user.secret` and ``code here``." }))
      .toEqual({ path: "src/Profile.TS", ext: ".ts", tokens: ["dereference", "null"] });
  });
  it.each([
    ["same defect, same file", rephrased, true],
    ["different defect, same file", { ...finding, body: "SQL injection: name is concatenated into the query in getProfile" }, false],
    ["same defect, different extension", { ...rephrased, path: "src/profile.py" }, false],
    ["same words, same extension", { ...finding, path: "src/other.ts" }, true],
  ])("%s → %s", (_case, candidate, expected) => {
    expect(similar(fingerprint(finding), fingerprint(candidate))).toBe(expected);
  });
  it("uses inclusive named thresholds and treats empty sets/extensions conservatively", () => {
    expect(SAME_PATH_JACCARD).toBe(0.5);
    expect(SAME_EXTENSION_JACCARD).toBe(0.7);
    const a = { path: "a.ts", ext: ".ts", tokens: ["a", "b"] };
    expect(similar(a, { ...a, tokens: ["a"] })).toBe(true);
    expect(similar(a, { ...a, path: "b.ts", tokens: ["a"] })).toBe(false);
    expect(similar({ ...a, tokens: [] }, { ...a, tokens: [] })).toBe(false);
    expect(similar({ ...a, path: "a", ext: "" }, { ...a, path: "b", ext: "" })).toBe(false);
    expect(similar({ ...a, tokens: ["a", "b", "c", "d", "e", "f", "g"] },
      { ...a, path: "b.ts", tokens: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] })).toBe(true);
  });
});

