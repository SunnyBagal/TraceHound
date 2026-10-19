// Evidence verifier, verify-evidence-v1 (decision 065): reply parsing and schema, the retry and the
// verdict rule, the prompt builder, and that a kept finding's quotes are what `tracehound gate`
// checks. An invented mini-repo (git init in a temp dir); nothing from the dataset or the benchmark
// pull requests. A scripted ChatClient stands in for the model. No network.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatClient } from "../src/agent/decider.ts";
import { PullReview } from "../src/bench/types.ts";
import { headReader } from "../src/gate/cli.ts";
import { gateFindings } from "../src/gate/gate.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import { BudgetExceededError, type ChatRequest, type ChatResult } from "../src/llm/client.ts";
import { CONTEXT_CLOSE, gitSource } from "../src/review/context.ts";
import { parseDiff } from "../src/review/diff.ts";
import { verifyCtxUserMessage } from "../src/review/verify-ctx-prompt.ts";
import { VERIFY_CTX_PROMPT_SHA256 } from "../src/review/verify-ctx.ts";
import { VERIFY_EVIDENCE_SYSTEM_PROMPT, verifyEvidenceUserMessage } from "../src/review/verify-evidence-prompt.ts";
import {
  gateReview,
  parseEvidenceReply,
  VERIFY_EVIDENCE_PROMPT_SHA256,
  VERIFY_EVIDENCE_PURPOSE,
  verifyReviewWithEvidence,
} from "../src/review/verify-evidence.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** Commit `base`, then `head`; return the repo (head checked out), head sha and `git diff base head`. */
function miniRepo(base: Record<string, string>, head: Record<string, string>): { dir: string; head: string; diff: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-vev-test-"));
  repos.push(dir);
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() });
  const write = (files: Record<string, string>) => {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), text);
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

const ev = (quote: string, line = 2, p = "lib/shelf.ts") => ({ path: p, line, quote });
const reply = (o: Record<string, unknown>) =>
  JSON.stringify({ verdict: "keep", evidence: [ev("return books[0].title;")], scenario: "With books = [] it throws a TypeError.", severity: "high", category: "correctness", ...o });

describe("verify-evidence-v1 reply", () => {
  it("parses a keep, with or without a fence, enums case-insensitive", () => {
    expect(parseEvidenceReply(reply({}))).toEqual({
      ok: true,
      reply: { verdict: "keep", evidence: [ev("return books[0].title;")], scenario: "With books = [] it throws a TypeError.", severity: "high", category: "correctness" },
    });
    const fenced = parseEvidenceReply("```json\n" + reply({ verdict: "Keep", severity: "MEDIUM", category: " Contract " }) + "\n```");
    expect(fenced.ok && [fenced.reply.verdict, fenced.reply.severity, fenced.reply.category]).toEqual(["keep", "medium", "contract"]);
  });

  it("a keep needs 1 to 3 single-line quotes and a scenario; a drop may cite nothing", () => {
    expect(parseEvidenceReply(reply({ evidence: [] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ evidence: [ev("a"), ev("b"), ev("c"), ev("d")] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ evidence: [ev("a"), ev("b"), ev("c")] })).ok).toBe(true);
    expect(parseEvidenceReply(reply({ evidence: [ev("a\nb")] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ evidence: [ev("   ")] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ evidence: [{ path: "x.ts", line: 0, quote: "a" }] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ evidence: [{ path: "", line: 3, quote: "a" }] })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ scenario: " " })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ verdict: "drop", evidence: [], scenario: "" })).ok).toBe(true);
  });

  it("rejects anything off the schema", () => {
    expect(parseEvidenceReply(reply({ verdict: "maybe" })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ severity: "critical" })).ok).toBe(false);
    expect(parseEvidenceReply(reply({ category: "naming" })).ok).toBe(false);
    expect(parseEvidenceReply(JSON.stringify({ verdict: "keep", reason: "x" })).ok).toBe(false);
    expect(parseEvidenceReply("[1]")).toEqual({ ok: false, why: "the reply is not a JSON object" });
    expect(parseEvidenceReply("keep")).toEqual({ ok: false, why: "the reply is not valid JSON" });
    const r = parseEvidenceReply(reply({ evidence: [] }));
    expect(!r.ok && r.why).toContain('"evidence"');
  });
});

describe("verify-evidence-v1 run", () => {
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
      { path: "lib/shelf.ts", line: 2, body: "Fifth finding." },
    ],
  };

  it("keep iff a valid reply says keep; one retry; two invalid replies or a failed request keep it as VERIFY_FAILED with no evidence", async () => {
    const client = scriptedClient([
      reply({}),
      reply({ verdict: "drop", evidence: [], scenario: "Naming only.", severity: "low", category: "style" }),
      "not json",
      reply({ evidence: [ev("return books[0].title;"), ev("export function pick(books) {", 1)], severity: "medium" }),
      "not json",
      reply({ evidence: [] }),
      new Error("HTTP 500"),
    ]);
    const v = await verifyReviewWithEvidence(client, input, review, { source: gitSource(r.dir, r.head), head: r.head });
    expect(v.comments.map((c) => [c.status, c.verdict, c.attempts, c.evidence.length])).toEqual([
      ["VERIFIED", "keep", 1, 1],
      ["VERIFIED", "drop", 1, 0],
      ["VERIFIED", "keep", 2, 2],
      ["VERIFY_FAILED", null, 2, 0],
      ["VERIFY_FAILED", null, 1, 0],
    ]);
    expect(v.comments[3]!.failure).toBe('the reply is not valid JSON; after one retry: "evidence": a keep needs 1 to 3 evidence items');
    expect(v.verify).toMatchObject({ version: "verify-evidence-v1", findings: 5, kept: 4, dropped: 1, verifyFailed: 2, retried: 2, head: r.head, promptSha256: VERIFY_EVIDENCE_PROMPT_SHA256 });
    expect(v.verify.usage.calls).toBe(6);
    // the retry repeats the request, then the invalid reply, then names the problem
    const retry = client.requests[3]!;
    expect(retry.messages.slice(0, 2)).toEqual(client.requests[2]!.messages);
    expect(retry.messages[2]).toEqual({ role: "assistant", content: "not json" });
    expect(retry.messages[3]!.content).toContain("Your reply was invalid: the reply is not valid JSON");
    // the request: Super, temperature 0, reasoning on, purpose review
    expect(client.requests[0]).toMatchObject({ model: "nvidia/nemotron-3-super-120b-a12b", temperature: 0, chat_template_kwargs: { enable_thinking: true } });
    expect(client.metas.every((m) => m.purpose === "review")).toBe(true);
    expect(VERIFY_EVIDENCE_PURPOSE).toBe("review");

    // gate input: kept findings only, VERIFY_FAILED without evidence
    const g = gateReview(v);
    expect(g.comments.map((c) => [c.body, c.evidence?.length ?? null, c.severity ?? null])).toEqual([
      ["Crashes on an empty list.", 1, "high"],
      ["Third finding.", 2, "medium"],
      ["Fourth finding.", null, null],
      ["Fifth finding.", null, null],
    ]);
    expect(PullReview.parse(g).comments).toHaveLength(4);

    // the gate checks the quotes: matching ones pass, VERIFY_FAILED is evidence-missing under
    // requireEvidence; the third finding passes its quotes and is then a duplicate of the first
    const gated = gateFindings(g.comments, { diff: parseDiff(r.diff), readFileAt: headReader(r.dir), suppressions: [], options: { requireEvidence: true, minSeverity: "medium" } });
    expect(gated.kept.map((c) => c.body)).toEqual(["Crashes on an empty list."]);
    expect(gated.dropped.map((d) => [d.finding.body, d.rule])).toEqual([
      ["Fourth finding.", "evidence-missing"],
      ["Fifth finding.", "evidence-missing"],
      ["Third finding.", "duplicate"],
    ]);
  });

  it("a quote that is not in the file is the gate's evidence-mismatch", async () => {
    const client = scriptedClient([reply({ evidence: [ev("+  return books[0].title;")] })]);
    const v = await verifyReviewWithEvidence(client, input, { ...review, comments: review.comments.slice(0, 1) }, { source: gitSource(r.dir, r.head), head: r.head });
    const gated = gateFindings(gateReview(v).comments, { diff: parseDiff(r.diff), readFileAt: headReader(r.dir), suppressions: [], options: { requireEvidence: true } });
    expect(gated.dropped.map((d) => d.rule)).toEqual(["evidence-mismatch"]);
  });

  it("a budget refusal stops the run", async () => {
    const client = scriptedClient([new BudgetExceededError("refusing")]);
    await expect(verifyReviewWithEvidence(client, input, review, { source: gitSource(r.dir, r.head), head: r.head })).rejects.toThrow(BudgetExceededError);
  });

  it("the prompt builder is pure and is verify-ctx-v1's user message; the system prompt's sha256 is pinned", async () => {
    const msg = { title: "T", description: "D", finding: { path: "a.ts", line: 2, body: "B" }, context: `ctx\n${CONTEXT_CLOSE}` };
    const frozen = structuredClone(msg);
    expect(verifyEvidenceUserMessage(msg)).toBe(verifyEvidenceUserMessage(msg));
    expect(msg).toEqual(frozen);
    expect(verifyEvidenceUserMessage(msg)).toBe(verifyCtxUserMessage(msg));
    // two runs over the same input send byte-identical requests
    const a = scriptedClient([reply({})]);
    const b = scriptedClient([reply({})]);
    const one = { ...review, comments: review.comments.slice(0, 1) };
    await verifyReviewWithEvidence(a, input, one, { source: gitSource(r.dir, r.head), head: r.head });
    await verifyReviewWithEvidence(b, input, one, { source: gitSource(r.dir, r.head), head: r.head });
    expect(JSON.stringify(a.requests)).toBe(JSON.stringify(b.requests));
    expect(VERIFY_EVIDENCE_SYSTEM_PROMPT).toContain("you cannot quote the code that fails");
    expect(VERIFY_EVIDENCE_SYSTEM_PROMPT).toContain('"evidence" holds 1 to 3 items');
    expect(createHash("sha256").update(VERIFY_EVIDENCE_SYSTEM_PROMPT).digest("hex")).toBe(VERIFY_EVIDENCE_PROMPT_SHA256);
    expect(VERIFY_EVIDENCE_PROMPT_SHA256).toBe("004be1d682d6a92a1e0ed184772419724be4c58818f25421e7c2ba4482b651a4");
    expect(VERIFY_CTX_PROMPT_SHA256).toMatch(/^75703fc6/);
  });
});

describe("065 driver: means, adoption rules, drop-log matching (scripts/bench/evidence.ts)", async () => {
  const { adoptA, adoptB, means, outcomesOf, pipelineVerdict } = await import("../../../scripts/bench/evidence.ts");
  const counts = (tp: number, fp: number, fn: number) => ({ comments: tp + fp, tp, fp, duplicates: 0, lowMatched: 0, fn, goldenCounted: tp + fn });
  // two runs: P 0.4 / 0.5, R 0.4 / 0.5
  const base = means([
    { label: "1", v1: counts(4, 6, 6), x1: counts(5, 5, 5) },
    { label: "2", v1: counts(5, 5, 5), x1: counts(5, 5, 5) },
  ]);

  it("means are plain means of the per-run micro values", () => {
    expect(base.v1.p).toBeCloseTo(0.45, 12);
    expect(base.v1.f).toBeCloseTo(0.45, 12);
    expect(base.x1.f).toBeCloseTo(0.5, 12);
  });

  it("A: precision strictly above, F at least under v1 and x1", () => {
    const same = adoptA(base, base);
    expect(same.checks.precisionV1.pass).toBe(false);
    expect(same.checks.fV1.pass && same.checks.fX1.pass).toBe(true);
    const better = { v1: { ...base.v1, p: base.v1.p + 0.001 }, x1: base.x1 };
    expect(adoptA(better, base).adopted).toBe(true);
    expect(adoptA({ v1: better.v1, x1: { ...base.x1, f: base.x1.f - 0.001 } }, base).adopted).toBe(false);
  });

  it("B: F +3.0 and P +8.0 points under v1, F at least under x1; margins exactly at the bar pass", () => {
    const at = { v1: { ...base.v1, f: base.v1.f + 0.03, p: base.v1.p + 0.08 }, x1: base.x1 };
    expect(adoptB(at, base).adopted).toBe(true);
    expect(adoptB({ ...at, v1: { ...at.v1, f: base.v1.f + 0.0299 } }, base).checks.fMarginV1.pass).toBe(false);
    expect(adoptB({ ...at, v1: { ...at.v1, p: base.v1.p + 0.0799 } }, base).checks.pMarginV1.pass).toBe(false);
    expect(adoptB({ ...at, x1: { ...base.x1, f: base.x1.f - 0.01 } }, base).adopted).toBe(false);
    expect(pipelineVerdict(true, true)).toMatch(/^B, with A's rules/);
    expect(pipelineVerdict(false, false)).toMatch(/^LOSS/);
  });

  it("drop-log outcomes match by file, path, line and body, each detail comment once", () => {
    const detail = {
      detail: [
        { reviewFile: "0.json", status: "SCORED", comments: [
          { path: "a.ts", line: 1, body: "x", outcome: "tp" },
          { path: "a.ts", line: 1, body: "x", outcome: "fp" },
          { path: "b.ts", line: 2, body: "y", outcome: "duplicate" },
        ] },
        { reviewFile: "1.json", status: "JUDGE_FAILED", comments: [{ path: "a.ts", line: 1, body: "x" }] },
      ],
    };
    const f = { path: "a.ts", line: 1, body: "x" };
    expect(outcomesOf(detail, "0.json", [f, f, f, { path: "b.ts", line: 2, body: "y" }])).toEqual(["tp", "fp", null, "duplicate"]);
    expect(outcomesOf(detail, "1.json", [f])).toEqual([null]);
    expect(outcomesOf(detail, "9.json", [f])).toEqual([null]);
  });
});
