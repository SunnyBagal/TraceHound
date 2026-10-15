// Context-aware verifier, verify-ctx-v1 (decision 058): per-finding context over invented
// mini-repos (git init in a temp dir), the verdict rule and the prompt. Nothing from the dataset or
// the benchmark pull requests. A scripted ChatClient stands in for the model. No network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { PullReview } from "../src/bench/types.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import { BudgetExceededError, type ChatRequest, type ChatResult } from "../src/llm/client.ts";
import { CONTEXT_CLOSE, CONTEXT_OPEN, gitSource } from "../src/review/context.ts";
import { buildFindingContext, findingNames, MIN_WINDOW_LINES, REFS_PER_FINDING, REFS_PER_NAME, WINDOW_LINES } from "../src/review/verify-context.ts";
import { VERIFY_CTX_SYSTEM_PROMPT } from "../src/review/verify-ctx-prompt.ts";
import { keptReview, parseVerdictReply, VERIFY_CTX_PROMPT_SHA256, VERIFY_CTX_PURPOSE, verifyReviewWithContext } from "../src/review/verify-ctx.ts";
import { VERIFY_PROMPT_SHA256 } from "../src/review/verify.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Commit `base`, then `head` (null deletes); return the repo, head sha and `git diff base head`. */
function miniRepo(base: Record<string, string>, head: Record<string, string | null>): { dir: string; head: string; diff: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-vctx-test-"));
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

const filler = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `// filler line ${from + i}`);

describe("finding names", () => {
  it("Python: the enclosing def and the names called on the line", () => {
    const lines = ["class Shelf:", "    def lend(self, book):", "        if book.lost:", "            return", "        self.ledger.record_loan(book)"];
    expect(findingNames("lib/shelf.py", lines, 5)).toEqual({ enclosing: "lend", defined: null, called: ["record_loan"], all: ["lend", "record_loan"] });
  });

  it("Go: a method with a receiver encloses the line", () => {
    const lines = ["package store", "", "func (s *Store) FlushPending(ctx context.Context) error {", "\tn := s.drainQueue(ctx)", "\treturn nil", "}"];
    expect(findingNames("store/store.go", lines, 4)).toMatchObject({ enclosing: "FlushPending", called: ["drainQueue"] });
  });

  it("Java: a method with a modifier encloses the line; keywords are not calls", () => {
    const lines = ["public final class TokenMinter {", "    protected int lifespanSeconds(Realm realm) {", "        if (realm == null) return 0;", "        return realm.getLifespan();", "    }", "}"];
    expect(findingNames("src/TokenMinter.java", lines, 4)).toMatchObject({ enclosing: "lifespanSeconds", called: ["getLifespan"] });
    expect(findingNames("src/TokenMinter.java", lines, 3).called).toEqual([]);
  });

  it("Ruby: def self. with ! dropped encloses the line", () => {
    const lines = ["module Store", "  class Archive", "    def self.archive_stale!", "      purge_records(older_than)", "    end", "  end", "end"];
    expect(findingNames("app/archive.rb", lines, 4)).toMatchObject({ enclosing: "archive_stale", called: ["purge_records"] });
  });

  it("a definition on the line is its own enclosing name; a stoplisted or short name is skipped", () => {
    const lines = ["def refund_amount(order):", "    return order.total", "", "def save(self):", "    self.flush_rows()"];
    expect(findingNames("x.py", lines, 1)).toEqual({ enclosing: "refund_amount", defined: "refund_amount", called: [], all: ["refund_amount"] });
    expect(findingNames("x.py", lines, 5)).toEqual({ enclosing: null, defined: null, called: ["flush_rows"], all: ["flush_rows"] });
  });
});

describe("per-finding context", () => {
  it("shows the window, the file's diff and references; markers wrap the block", () => {
    const cart = ["export function computeTotal(items) {", "  let t = 0;", "  for (const i of items) t += i.price;", "  return t;", "}", ""].join("\n");
    const r = miniRepo({ "lib/cart.ts": cart, "lib/other.ts": "export const x = 1;\n", "app/page.ts": "import { computeTotal } from '../lib/cart';\nconsole.log(computeTotal([]));\n" }, {
      "lib/cart.ts": cart.replace("t += i.price", "t += i.price * i.qty"),
      "lib/other.ts": "export const x = 2;\n",
    });
    const ctx = buildFindingContext(gitSource(r.dir, r.head), r.diff, { path: "lib/cart.ts", line: 3 });
    expect(ctx.text.startsWith(`${CONTEXT_OPEN}\n`)).toBe(true);
    expect(ctx.text.endsWith(`${CONTEXT_CLOSE}\n`)).toBe(true);
    expect(ctx.text).toContain("## lib/cart.ts at the pull request's head, lines 1-5 of 5");
    expect(ctx.text).toContain("     3  ");
    expect(ctx.text).toContain("## Diff of lib/cart.ts (1 hunk)");
    expect(ctx.text).toContain("     3 +  for (const i of items) t += i.price * i.qty;");
    expect(ctx.text).not.toContain("lib/other.ts"); // the finding's file's diff only
    expect(ctx.text).toContain("## Lines outside lib/cart.ts that mention computeTotal");
    expect(ctx.text).toContain("### app/page.ts:1");
    expect(ctx.text).toContain("### app/page.ts:2");
    expect(ctx.record).toMatchObject({
      window: { status: "shown", from: 1, to: 5, radius: WINDOW_LINES },
      diff: { status: "shown", hunks: 1, shown: 1 },
      names: { enclosing: "computeTotal" },
      references: { matches: 2, shown: 2 },
      cut: { references: 0, windowShrunk: false, hunksDropped: 0, overBudget: false },
    });
    expect(ctx.record.chars).toBe(ctx.text.length);
  });

  it("references: at most 6 per name and 15 per finding; non-test files first, then path, then line", () => {
    const base: Record<string, string> = {
      "core/engine.ts": ["export function alphaStep() {}", "export function betaStep() {}", "export function gammaStep() {}", "export function runAll() {", "  return 1;", "}", ""].join("\n"),
    };
    // 8 non-test files and 2 test files mention each name; the test files sort first by path
    for (const n of ["alphaStep", "betaStep", "gammaStep"]) {
      for (let i = 1; i <= 8; i++) base[`src/m${i}.ts`] = `${base[`src/m${i}.ts`] ?? ""}${n}();\n`;
      for (let i = 1; i <= 2; i++) base[`a-tests/t${i}.test.ts`] = `${base[`a-tests/t${i}.test.ts`] ?? ""}${n}();\n`;
    }
    const r = miniRepo(base, { "core/engine.ts": base["core/engine.ts"]!.replace("  return 1;", "  alphaStep(); betaStep(); gammaStep(); return 1;") });
    const ctx = buildFindingContext(gitSource(r.dir, r.head), r.diff, { path: "core/engine.ts", line: 5 });
    expect(ctx.record.names.all).toEqual(["runAll", "alphaStep", "betaStep", "gammaStep"]);
    expect(ctx.record.references.perName).toEqual({ runAll: 0, alphaStep: REFS_PER_NAME, betaStep: REFS_PER_NAME, gammaStep: REFS_PER_FINDING - 2 * REFS_PER_NAME });
    expect(ctx.record.references.shown).toBe(REFS_PER_FINDING);
    const shown = [...ctx.text.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(shown.slice(0, 6)).toEqual(["src/m1.ts:1", "src/m2.ts:1", "src/m3.ts:1", "src/m4.ts:1", "src/m5.ts:1", "src/m6.ts:1"]);
    expect(shown.some((s) => s!.startsWith("a-tests/"))).toBe(false);
    expect(shown.some((s) => s!.startsWith("core/engine.ts"))).toBe(false); // never the finding's file
  });

  it("test files are shown after non-test files when the cap leaves room", () => {
    const r = miniRepo({ "lib/q.py": "def drain_queue():\n    return []\n", "a/test_q.py": "drain_queue()\n", "z/use.py": "drain_queue()\n" }, { "lib/q.py": "def drain_queue():\n    return [1]\n" });
    const ctx = buildFindingContext(gitSource(r.dir, r.head), r.diff, { path: "lib/q.py", line: 2 });
    expect([...ctx.text.matchAll(/^### (.+)$/gm)].map((m) => m[1])).toEqual(["z/use.py:1", "a/test_q.py:1"]);
  });

  // a 300-line file with hunks at lines 10, 150 and 280 and two references
  const longFile = (marker: string) => {
    const lines = filler(300);
    lines[9] = `// edge ${marker}`;
    lines[149] = `export function settleBalance() { return ${marker}; }`;
    lines[279] = `// tail ${marker}`;
    return lines.join("\n") + "\n";
  };
  const big = miniRepo({ "lib/ledger.ts": longFile("0"), "app/a.ts": "settleBalance();\n", "app/b.ts": "settleBalance();\n" }, { "lib/ledger.ts": longFile("1") });
  const finding = { path: "lib/ledger.ts", line: 150 };
  const full = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding, Infinity);

  it("budget cut 1: references go first, last first", () => {
    expect(full.record.references.shown).toBe(2);
    expect(full.record.diff.shown).toBe(3);
    const ctx = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding, full.text.length - 1);
    expect(ctx.record.cut).toMatchObject({ references: 1, windowShrunk: false, hunksDropped: 0, overBudget: false });
    expect(ctx.text).toContain("### app/a.ts:1");
    expect(ctx.text).not.toContain("### app/b.ts:1");
  });

  it("budget cut 2: then the window shrinks evenly toward 40 lines either side", () => {
    const noRefs = full.text.length - full.record.references.chars;
    const ctx = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding, noRefs - 500);
    expect(ctx.record.cut.references).toBe(2);
    expect(ctx.record.cut.windowShrunk).toBe(true);
    expect(ctx.record.cut.hunksDropped).toBe(0);
    const w = ctx.record.window;
    expect(w.radius).toBeLessThan(WINDOW_LINES);
    expect(w.radius).toBeGreaterThanOrEqual(MIN_WINDOW_LINES);
    expect([w.from, w.to]).toEqual([150 - w.radius, 150 + w.radius]);
    expect(ctx.record.chars).toBeLessThanOrEqual(noRefs - 500);
  });

  it("budget cut 3: then diff hunks, farthest from the line first; the 40-line window stays", () => {
    const at40 = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding, 0);
    // budget 0: everything cut that may be cut; the window at 40 lines either side remains
    expect(at40.record.window).toMatchObject({ status: "shown", radius: MIN_WINDOW_LINES, from: 110, to: 190 });
    expect(at40.record.diff.shown).toBe(0);
    expect(at40.record.cut).toMatchObject({ references: 2, windowShrunk: true, hunksDropped: 3, overBudget: true });
    expect(at40.text).toContain("   150  export function settleBalance() { return 1; }");
    // the window at 40 lines plus all three hunks, less one character: one hunk goes, the one at
    // line 10 (137 lines from the finding) before the one at 280 (127 lines away)
    const ctx = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding, at40.text.length + full.record.diff.chars - 1);
    expect(ctx.record.cut).toMatchObject({ references: 2, windowShrunk: true, hunksDropped: 1, overBudget: false });
    expect(ctx.record.window.radius).toBe(MIN_WINDOW_LINES);
    expect(ctx.text).toContain("// tail 1");
    expect(ctx.text).not.toContain("// edge 1");
  });

  it("the diff is cut at 12,000 characters, nearest hunks first", () => {
    const lines = filler(2000);
    const head = [...lines];
    for (let i = 0; i < 2000; i += 100) head[i] = `${"x".repeat(600)} ${i}`;
    const r = miniRepo({ "lib/wide.ts": lines.join("\n") + "\n" }, { "lib/wide.ts": head.join("\n") + "\n" });
    const ctx = buildFindingContext(gitSource(r.dir, r.head), r.diff, { path: "lib/wide.ts", line: 1001 });
    expect(ctx.record.diff.hunks).toBe(20);
    expect(ctx.record.diff.omittedOverLimit).toBeGreaterThan(0);
    expect(ctx.record.diff.shown).toBe(20 - ctx.record.diff.omittedOverLimit);
    expect(ctx.text).toContain(`${"x".repeat(600)} 1000`); // only the diff shows the whole line
    expect(ctx.text).not.toContain(`${"x".repeat(600)} 0\n`);
    expect(ctx.record.diff.chars).toBeLessThanOrEqual(12_000 + 200);
  });

  it("a path not at the head: no window, recorded as missing", () => {
    const r = miniRepo({ "a.ts": "export const a = 1;\n" }, { "a.ts": "export const a = 2;\n" });
    const ctx = buildFindingContext(gitSource(r.dir, r.head), r.diff, { path: "nowhere.ts", line: 1 });
    expect(ctx.record.window.status).toBe("missing");
    expect(ctx.record.diff.status).toBe("missing");
    expect(ctx.text).toBe(`${CONTEXT_OPEN}\n${CONTEXT_CLOSE}\n`);
  });

  it("is deterministic: same input, same context byte for byte", () => {
    const a = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding);
    const b = buildFindingContext(gitSource(big.dir, big.head), big.diff, finding);
    expect(b.text).toBe(a.text);
    expect(b.record).toEqual(a.record);
  });
});

function scriptedClient(replies: (string | Error)[]): ChatClient & { requests: ChatRequest[]; metas: { purpose: string }[] } {
  const requests: ChatRequest[] = [];
  const metas: { purpose: string }[] = [];
  return {
    requests,
    metas,
    async chat(request: ChatRequest, meta: { purpose: string }): Promise<ChatResult> {
      requests.push(request);
      metas.push(meta);
      const next = replies.shift();
      if (next === undefined) throw new Error("no scripted reply left");
      if (next instanceof Error) throw next;
      return { content: next, cached: false, latencyMs: 7, inputTokens: 900, outputTokens: 40, costUSD: 0.0003 };
    },
  };
}

describe("verify-ctx-v1", () => {
  it("parses keep and drop, with or without a fence; anything else is invalid", () => {
    expect(parseVerdictReply('{"verdict": "keep", "reason": "Off by one."}')).toEqual({ ok: true, verdict: "keep", reason: "Off by one." });
    expect(parseVerdictReply('```json\n{"verdict": "Drop", "reason": "Handled above."}\n```')).toEqual({ ok: true, verdict: "drop", reason: "Handled above." });
    expect(parseVerdictReply('{"verdict": "maybe", "reason": "x"}').ok).toBe(false);
    expect(parseVerdictReply('{"verdict": "keep"}').ok).toBe(false);
    expect(parseVerdictReply('{"confidence": 4, "reason": "x"}').ok).toBe(false);
    expect(parseVerdictReply("keep").ok).toBe(false);
  });

  const r = miniRepo({ "lib/shelf.ts": "export function pick(books) {\n  return books;\n}\n" }, { "lib/shelf.ts": "export function pick(books) {\n  return books[0].title;\n}\n" });
  const input = { title: "Pick the first title", description: "Returns one title.", diff: r.diff };
  const review: PullReview = {
    pr_title: input.title,
    pr_number: 3,
    comments: [
      { path: "lib/shelf.ts", line: 2, body: "Crashes on an empty list." },
      { path: "lib/shelf.ts", line: 1, body: "The name is unclear." },
      { path: "lib/shelf.ts", line: 2, body: "Third finding." },
      { path: "lib/shelf.ts", line: 2, body: "Fourth finding." },
    ],
  };

  it("keeps a finding iff the valid reply says keep; two invalid replies or a failed request keep it as VERIFY_FAILED", async () => {
    const client = scriptedClient([
      '{"verdict": "keep", "reason": "a"}',
      '{"verdict": "drop", "reason": "b"}',
      "not json",
      '{"verdict": "unsure", "reason": "c"}',
      new Error("HTTP 500"),
    ]);
    const v = await verifyReviewWithContext(client, input, review, { source: gitSource(r.dir, r.head), head: r.head });
    expect(v.comments.map((c) => [c.status, c.verdict, c.attempts])).toEqual([
      ["VERIFIED", "keep", 1],
      ["VERIFIED", "drop", 1],
      ["VERIFY_FAILED", null, 2],
      ["VERIFY_FAILED", null, 1],
    ]);
    expect(v.verify).toMatchObject({ version: "verify-ctx-v1", findings: 4, kept: 3, dropped: 1, verifyFailed: 2, retried: 1, head: r.head, promptSha256: VERIFY_CTX_PROMPT_SHA256 });
    const k = keptReview(v);
    expect(k.comments.map((c) => c.body)).toEqual(["Crashes on an empty list.", "Third finding.", "Fourth finding."]);
    expect(PullReview.parse(k).comments).toHaveLength(3);
    // the request: Super, temperature 0, reasoning on, purpose review, the context between the markers
    const req = client.requests[0]!;
    expect(req).toMatchObject({ model: "nvidia/nemotron-3-super-120b-a12b", temperature: 0, chat_template_kwargs: { enable_thinking: true } });
    expect(client.metas.every((m) => m.purpose === "review")).toBe(true);
    expect(VERIFY_CTX_PURPOSE).toBe("review");
    const user = req.messages[1]!.content as string;
    expect(user).toContain("Finding:\nFile: lib/shelf.ts\nLine: 2\nCrashes on an empty list.");
    expect(user).toContain(`${CONTEXT_OPEN}\n## lib/shelf.ts at the pull request's head`);
    expect(user.trimEnd().endsWith(CONTEXT_CLOSE)).toBe(true);
    // a retry repeats the request and names the problem
    expect(client.requests[3]!.messages.at(-1)!.content).toContain("Your reply was invalid");
  });

  it("a budget refusal stops the run", async () => {
    const client = scriptedClient([new BudgetExceededError("refusing")]);
    await expect(verifyReviewWithContext(client, input, review, { source: gitSource(r.dir, r.head), head: r.head })).rejects.toThrow(BudgetExceededError);
  });

  it("prompt: one keep-or-drop question, JSON reply, no confidence; sha256 pinned; verify-v1 unchanged", () => {
    expect(VERIFY_CTX_SYSTEM_PROMPT).toContain("is this finding a real defect in the changed code that a careful reviewer would block the merge for, given the context?");
    expect(VERIFY_CTX_SYSTEM_PROMPT).toContain('{"verdict": "keep", "reason": "..."}');
    expect(VERIFY_CTX_SYSTEM_PROMPT).not.toMatch(/confidence/i);
    expect(createHash("sha256").update(VERIFY_CTX_SYSTEM_PROMPT).digest("hex")).toBe(VERIFY_CTX_PROMPT_SHA256);
    expect(VERIFY_CTX_PROMPT_SHA256).toBe("75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70");
    expect(VERIFY_PROMPT_SHA256).toMatch(/^ab2d6105/);
  });
});
