// Context reviewer, review-ctx-v1 (decision 057): name extraction, the context builder over
// invented mini-repos (git init in a temp dir), and the prompt. Nothing from the dataset or the
// benchmark pull requests. A scripted ChatClient stands in for the model. No network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import type { ChatRequest, ChatResult } from "../src/llm/client.ts";
import { buildChunkContext, CONTEXT_CLOSE, CONTEXT_OPEN, gitSource, isTestPath, REFS_PER_CHUNK, REFS_PER_NAME } from "../src/review/context.ts";
import { changedNames, definitionName } from "../src/review/names.ts";
import { REVIEW_SYSTEM_PROMPT } from "../src/review/prompt.ts";
import { CONTEXT_SENTENCES, REVIEW_CTX_SYSTEM_PROMPT } from "../src/review/prompt-ctx.ts";
import { REVIEW_CTX_PROMPT_SHA256, reviewPullWithContext } from "../src/review/review-ctx.ts";
import { REVIEW_PROMPT_SHA256 } from "../src/review/review.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Commit `base`, then `head` (null deletes); return the repo, head sha and `git diff base head`. */
function miniRepo(base: Record<string, string>, head: Record<string, string | null>): { dir: string; head: string; diff: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-ctx-test-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() });
  const write = (files: Record<string, string | null>) => {
    for (const [f, text] of Object.entries(files)) {
      const abs = path.join(dir, f);
      if (text === null) rmSync(abs);
      else {
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
    }
  };
  git("init", "-q", "-b", "main");
  write(base);
  git("add", "-A");
  git("commit", "-qm", "base");
  write(head);
  git("add", "-A");
  git("commit", "-qm", "head");
  return { dir, head: git("rev-parse", "HEAD").trim(), diff: git("diff", "--no-color", "HEAD~1", "HEAD") };
}

const hunk = (header: string, lines: string[]) => [header, ...lines].join("\n") + "\n";

describe("changed names", () => {
  it("Python: def, async def and class, from the hunk header and from changed definition lines", () => {
    expect(definitionName("    async def fetch_rows(self, q):", "python")).toBe("fetch_rows");
    expect(definitionName("class LedgerEntry(Base):", "python")).toBe("LedgerEntry");
    const names = changedNames("pkg/ledger.py", [
      hunk("@@ -10,4 +10,6 @@ class LedgerEntry(Base):", ["     def balance(self):", "-        return self.total", "+        return self.total - self.fees", "+", "+    def refund_amount(self):", "+        return 0"]),
    ]);
    expect(names).toEqual(["LedgerEntry", "balance", "refund_amount"]);
  });

  it("Go: functions, methods with receivers, struct and interface types", () => {
    expect(definitionName("func (s *Store) FlushPending(ctx context.Context) error {", "go")).toBe("FlushPending");
    expect(definitionName("type Scheduler interface {", "go")).toBe("Scheduler");
    const names = changedNames("store/store.go", [hunk("@@ -3,3 +3,4 @@ func (s *Store) FlushPending(ctx context.Context) error {", ["\tn := len(s.queue)", "+\ts.metrics.Inc()", "\treturn nil"])]);
    expect(names).toEqual(["FlushPending"]);
    expect(changedNames("x.go", [hunk("@@ -1,0 +1,3 @@", ["+type Throttle struct {", "+\tlimit int", "+}"])])).toEqual(["Throttle"]);
  });

  it("Java: classes, interfaces, methods with a modifier; keywords are not names", () => {
    expect(definitionName("public final class TokenMinter {", "java")).toBe("TokenMinter");
    expect(definitionName("    private static List<String> collectScopes(Realm realm) {", "java")).toBe("collectScopes");
    expect(definitionName("    @Override public boolean isExpired() {", "java")).toBe("isExpired");
    expect(definitionName("        if (expired) {", "java")).toBeNull();
    const names = changedNames("src/main/java/a/TokenMinter.java", [
      hunk("@@ -20,4 +20,4 @@ public final class TokenMinter {", ["    protected int lifespanSeconds(Realm realm) {", "-        return 60;", "+        return realm.getLifespan();", "    }"]),
    ]);
    expect(names).toEqual(["TokenMinter", "lifespanSeconds"]);
  });

  it("Ruby: def, def self., class and module (last segment); ? and ! are dropped", () => {
    expect(definitionName("  def self.archive_stale!", "ruby")).toBe("archive_stale");
    expect(definitionName("class Admin::BadgeGranter < Base", "ruby")).toBe("BadgeGranter");
    const names = changedNames("app/models/badge.rb", [hunk("@@ -5,3 +5,3 @@ class Badge", ["  def grantable?(user)", "-    user.active", "+    user.active && !user.silenced", "  end"])]);
    expect(names).toEqual(["Badge", "grantable"]);
  });

  it("TypeScript and JavaScript: function, class, arrow const, method; short and stoplisted names skipped", () => {
    expect(definitionName("export async function settleInvoice(id: string) {", "ts")).toBe("settleInvoice");
    expect(definitionName("export const pickSlot = async (day: Date) => {", "ts")).toBe("pickSlot");
    expect(definitionName("  private computeWindow(a: number): number {", "ts")).toBe("computeWindow");
    expect(definitionName("  if (ready) {", "ts")).toBeNull();
    // `run` is too short, `update` is on the stoplist
    expect(changedNames("a.ts", [hunk("@@ -1,2 +1,3 @@", ["+function run() {}", "+function update() {}", "+function reconcileLedger() {}"])])).toEqual(["reconcileLedger"]);
  });
});

describe("context builder", () => {
  it("whole changed file with new line numbers; references outside the changed files, test files last, then path order; caps per name", () => {
    const callers: Record<string, string> = {};
    for (let i = 0; i < 6; i++) callers[`src/b${i}.py`] = `from pkg.core import compute_total\n\nx = compute_total(${i})\n`;
    for (let i = 0; i < 4; i++) callers[`tests/test_c${i}.py`] = `from pkg.core import compute_total\n\ndef test_it():\n    assert compute_total(${i})\n`;
    const r = miniRepo({ "pkg/core.py": "def compute_total(n):\n    return n\n", ...callers }, { "pkg/core.py": "def compute_total(n):\n    return n + 1\n" });
    const ctx = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    expect(ctx.text.startsWith(`${CONTEXT_OPEN}\n`)).toBe(true);
    expect(ctx.text.endsWith(`${CONTEXT_CLOSE}\n`)).toBe(true);
    expect(ctx.text).toContain("## Changed file pkg/core.py (whole file, 2 lines)\n     1  def compute_total(n):\n     2      return n + 1\n");
    expect(ctx.record.names).toEqual(["compute_total"]);
    // 10 files, 2 matching lines each = 20 matches; 8 shown: the 6 non-test files (12 lines) come first
    expect(ctx.record.references).toMatchObject({ matches: 20, selected: REFS_PER_NAME, shown: REFS_PER_NAME, droppedForBudget: 0 });
    const shown = [...ctx.text.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(shown).toEqual(["src/b0.py:1", "src/b0.py:3", "src/b1.py:1", "src/b1.py:3", "src/b2.py:1", "src/b2.py:3", "src/b3.py:1", "src/b3.py:3"]);
    expect(ctx.text).not.toContain("### pkg/core.py");
    expect(isTestPath("tests/test_c0.py")).toBe(true);
    expect(isTestPath("src/b0.py")).toBe(false);
  });

  it("test files come after non-test files and each reference shows 3 lines either side", () => {
    const body = (n: string) => ["a = 1", "b = 2", "c = 3", "d = 4", `y = ${n}()`, "e = 5", "f = 6", "g = 7", "h = 8"].join("\n") + "\n";
    const r = miniRepo({ "lib/m.py": "def shift_window():\n    pass\n", "tests/test_m.py": body("shift_window"), "zz/use.py": body("shift_window") }, { "lib/m.py": "def shift_window():\n    return 1\n" });
    const ctx = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    const shown = [...ctx.text.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(shown).toEqual(["zz/use.py:5", "tests/test_m.py:5"]);
    expect(ctx.text).toContain("### zz/use.py:5\n     2  b = 2\n     3  c = 3\n     4  d = 4\n     5  y = shift_window()\n     6  e = 5\n     7  f = 6\n     8  g = 7\n");
  });

  it("at most 30 references per chunk, names in order of appearance", () => {
    const defs = Array.from({ length: 5 }, (_, i) => `def handler_${"abcde"[i]}():\n    return ${i}\n`);
    const base: Record<string, string> = { "app/h.py": defs.join("") };
    for (let f = 0; f < 10; f++) base[`app/use${f}.py`] = Array.from({ length: 5 }, (_, i) => `handler_${"abcde"[i]}()`).join("\n") + "\n";
    const r = miniRepo(base, { "app/h.py": defs.map((d) => d.replace("return", "return 1 +")).join("") });
    const ctx = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    expect(ctx.record.names).toEqual(["handler_a", "handler_b", "handler_c", "handler_d", "handler_e"]);
    expect(ctx.record.references.selected).toBe(REFS_PER_CHUNK);
    expect(ctx.record.references.perName).toEqual({ handler_a: 8, handler_b: 8, handler_c: 8, handler_d: 6 });
  });

  it("a file over 12,000 characters is cut to windows of 60 lines either side of each hunk", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `value_${i} = ${i}  # ${"p".repeat(20)}`);
    const changed = [...lines];
    changed[99] = "value_99 = -1";
    changed[499] = "value_499 = -1";
    const r = miniRepo({ "big.py": lines.join("\n") + "\n" }, { "big.py": changed.join("\n") + "\n" });
    const ctx = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    expect(ctx.record.files).toEqual([expect.objectContaining({ path: "big.py", status: "windows" })]);
    // hunks at new lines 97-103 and 497-503 (3 lines of git context) → windows 37-163 and 437-563
    expect(ctx.text).toContain("        [lines 1-36 not shown]\n");
    expect(ctx.text).toContain("        [lines 164-436 not shown]\n");
    expect(ctx.text).toContain("        [lines 564-600 not shown]\n");
    expect(ctx.text).toContain("   100  value_99 = -1\n");
  });

  it("budget: references are dropped first, last ones first; then changed files are cut to windows, last file first", () => {
    const filler = (tag: string) => Array.from({ length: 200 }, (_, i) => `${tag}_${i} = ${i}`).join("\n") + "\n";
    const base: Record<string, string> = { "a.py": "def merge_rows():\n    pass\n" + filler("a"), "b.py": "def split_rows():\n    pass\n" + filler("b") };
    for (let i = 0; i < 4; i++) base[`u${i}.py`] = "merge_rows()\nsplit_rows()\n";
    const r = miniRepo(base, { "a.py": "def merge_rows():\n    return 1\n" + filler("a"), "b.py": "def split_rows():\n    return 2\n" + filler("b") });
    const src = gitSource(r.dir, r.head);
    const full = buildChunkContext(src, r.diff);
    expect(full.record.references.shown).toBe(8);
    expect(full.record.cut).toEqual({ references: 0, filesToWindows: 0, filesDropped: 0 });

    // just below the full size: one reference goes, the last one shown
    const one = buildChunkContext(src, r.diff, full.text.length - 1);
    expect(one.record.cut).toEqual({ references: 1, filesToWindows: 0, filesDropped: 0 });
    expect(one.text).not.toContain("### u3.py:2");
    expect(one.text).toContain("### u3.py:1");

    // smaller than both files: no references left, b.py (last) is cut to windows, a.py stays whole
    const noRefs = full.text.slice(0, full.text.indexOf("## Lines outside")).length + `${CONTEXT_CLOSE}\n`.length;
    const tight = buildChunkContext(src, r.diff, noRefs - 500);
    expect(tight.record.references.shown).toBe(0);
    expect(tight.record.cut.references).toBe(8);
    expect(tight.record.files.map((f) => f.status)).toEqual(["full", "cut-to-windows"]);
    expect(tight.text.length).toBeLessThanOrEqual(noRefs - 500);

    // tiny budget: everything cut, then dropped
    const tiny = buildChunkContext(src, r.diff, 100);
    expect(tiny.record.files.map((f) => f.status)).toEqual(["dropped", "dropped"]);
    expect(tiny.text).toBe(`${CONTEXT_OPEN}\n${CONTEXT_CLOSE}\n`);
  });

  it("a deleted file is skipped; its definitions still count as changed names", () => {
    const r = miniRepo({ "gone.go": "package x\n\nfunc RetireLegacy() {}\n", "keep.go": "package x\n\nfunc main2() { RetireLegacy() }\n" }, { "gone.go": null, "keep.go": "package x\n\nfunc main2() {}\n" });
    const ctx = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    expect(ctx.record.files).toEqual([expect.objectContaining({ path: "gone.go", status: "deleted", shownChars: 0 }), expect.objectContaining({ path: "keep.go", status: "full" })]);
    expect(ctx.text).not.toContain("## Changed file gone.go");
    expect(ctx.record.names).toContain("RetireLegacy");
  });

  it("deterministic: the same repo and diff give the same context byte for byte", () => {
    const r = miniRepo({ "s/a.rb": "class Ledger\n  def settle_all\n  end\nend\n", "s/b.rb": "Ledger.new.settle_all\n" }, { "s/a.rb": "class Ledger\n  def settle_all\n    true\n  end\nend\n" });
    const a = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    const b = buildChunkContext(gitSource(r.dir, r.head), r.diff);
    expect(a.text).toBe(b.text);
    expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    // the class line is not the nearest definition above the change, so only the method counts
    expect(a.record.names).toEqual(["settle_all"]);
    expect(a.text).toContain("### s/b.rb:1");
  });
});

describe("review-ctx-v1 prompt and reviewer", () => {
  it("is review-diff-v1's prompt plus one paragraph of three sentences; sha256 pinned", () => {
    expect(REVIEW_CTX_SYSTEM_PROMPT.replace(`${CONTEXT_SENTENCES}\n\n`, "")).toBe(REVIEW_SYSTEM_PROMPT);
    expect(CONTEXT_SENTENCES.split(/(?<=\.) /).length).toBe(3);
    expect(createHash("sha256").update(REVIEW_CTX_SYSTEM_PROMPT).digest("hex")).toBe(REVIEW_CTX_PROMPT_SHA256);
    expect(REVIEW_CTX_PROMPT_SHA256).toBe("0c4dcdcf4d764919b87c581278943e1c6d7b0714aa72b0f3cf60aa0f728089e0");
    expect(REVIEW_PROMPT_SHA256).toMatch(/^f77c2031/);
  });

  it("sends the context after the diff; a finding on a line only in the context is dropped", async () => {
    const r = miniRepo({ "m.py": "def scale_price(p):\n    return p\n\n\n\n\n\n\n\n\nX = 1\n" }, { "m.py": "def scale_price(p):\n    return p * 2\n\n\n\n\n\n\n\n\nX = 1\n" });
    const requests: ChatRequest[] = [];
    const client: ChatClient = {
      async chat(request: ChatRequest): Promise<ChatResult> {
        requests.push(request);
        return { content: JSON.stringify({ findings: [{ path: "m.py", line: 2, body: "doubles" }, { path: "m.py", line: 11, body: "context only" }] }), cached: false, latencyMs: 1, inputTokens: 1, outputTokens: 1, costUSD: 0 };
      },
    };
    const out = await reviewPullWithContext(client, { title: "t", description: "", diff: r.diff }, { source: gitSource(r.dir, r.head), head: r.head }, { model: "m" });
    expect(out.comments).toEqual([{ path: "m.py", line: 2, body: "doubles" }]);
    expect(out.review.dropped["line-not-in-new-version"]).toBe(1);
    expect(out.review.version).toBe("review-ctx-v1");
    expect(requests[0]!.temperature).toBe(0);
    const user = requests[0]!.messages[1]!.content as string;
    expect(user.indexOf("Diff:")).toBeLessThan(user.indexOf(CONTEXT_OPEN));
    expect(user.endsWith(`${CONTEXT_CLOSE}\n`)).toBe(true);
    expect(out.review.context).toHaveLength(1);
  });
});
