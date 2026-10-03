// Reproduce stage (decision 048), without Docker or a model: the report reading, each check's rule,
// claims, the emitted repair task, a model error → FAILED, and the repair agent's first message
// unchanged. The scripted end-to-end cases on a real sandbox are in harness-reproduce.test.ts.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult, ToolCall } from "../src/llm/client.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { AGENT_PROMPT_FILE, RepairLoopAgent } from "../src/harness/loop.ts";
import { repoStateCommand, runRepair, SQUASH_HISTORY, type RegressionResult } from "../src/harness/run.ts";
import { loadTask, type LoadedTask } from "../src/harness/task.ts";
import {
  checkDiff,
  claimText,
  judgeFileRun,
  judgeRegression,
  judgeSecondRun,
  loadClaim,
  parseJunitCases,
  REPRO_PROMPT_FILE,
  reproductionToTask,
  runReproduce,
  runnerPath,
  type FileRun,
  type ReproRecord,
} from "../src/harness/reproduce.ts";
import { BUN_TEST_FILE_PATTERN } from "../src/harness/task.ts";

// bun 1.4.2's JUnit report, as written in the sandbox image (build log, reproduce stage, step 0)
const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="5" assertions="2" failures="4" skipped="0" time="0.2">
  <testsuite name="test/x.test.ts" file="test/x.test.ts" tests="5" assertions="2" failures="4" skipped="0" time="0.2" hostname="h">
    <testsuite name="d" file="test/x.test.ts" line="2" tests="2" assertions="2" failures="1" skipped="0" time="0.01" hostname="h">
      <testcase name="eq fails" classname="d" time="0.01" file="test/x.test.ts" line="2" assertions="1">
        <failure type="AssertionError" message="expect(received).toBe(expected)&#10;&#10;Expected: 3&#10;Received: 2&#10;">AssertionError: expect(received).toBe(expected)</failure>
      </testcase>
      <testcase name="passes" classname="d" time="0.0001" file="test/x.test.ts" line="2" assertions="1" />
    </testsuite>
    <testcase name="type error at runtime" classname="" time="0.0003" file="test/x.test.ts" line="3" assertions="0">
      <failure type="TypeError" message="undefined is not an object (evaluating &apos;(void 0).foo&apos;)">TypeError: …</failure>
    </testcase>
    <testcase name="timeout" classname="" time="0.2" file="test/x.test.ts" line="4" assertions="0">
      <failure type="TimeoutError" message="test timed out" />
    </testcase>
    <testcase name="node assert" classname="" time="0.01" file="test/x.test.ts" line="5" assertions="0">
      <failure type="AssertionError" message="Expected values to be strictly equal:&#10;&#10;1 !== 2&#10;">AssertionError: …</failure>
    </testcase>
  </testsuite>
</testsuites>`;

const run = (cases: FileRun["cases"], extra: Partial<FileRun> = {}): FileRun => ({ cmd: "bun test ./test/x.test.ts", exitCode: cases?.some((c) => c.status === "failed") ? 1 : 0, timedOut: false, ...(cases && { cases }), ...extra });
const passed = (name: string) => ({ file: "test/x.test.ts", name, status: "passed" as const });
const assertFail = (name: string) => ({ file: "test/x.test.ts", name, status: "failed" as const, failureType: "AssertionError" });

describe("reading bun's report per case, with the failure type", () => {
  it("keeps parseJunit's names and order and adds each failure's type and message", () => {
    const cases = parseJunitCases(REPORT);
    expect(cases.map((c) => [c.name, c.status, c.failureType])).toEqual([
      ["d > eq fails", "failed", "AssertionError"],
      ["d > passes", "passed", undefined],
      ["type error at runtime", "failed", "TypeError"],
      ["timeout", "failed", "TimeoutError"],
      ["node assert", "failed", "AssertionError"],
    ]);
    expect(cases[0]!.message).toBe("expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2\n");
    expect(cases[2]!.message).toBe("undefined is not an object (evaluating '(void 0).foo')");
    expect(() => parseJunitCases("not xml")).toThrow(/not a JUnit report/);
  });
});

describe("check b: the file runs and fails on an assertion", () => {
  it("an assertion failure qualifies; a passing file does not reproduce", () => {
    expect(judgeFileRun(run([assertFail("a"), passed("b")]))).toEqual({ kind: "fails", failing: ["a"], detail: "1 of 2 case(s) failed on an assertion: a" });
    expect(judgeFileRun(run([passed("a"), passed("b")]))).toMatchObject({ kind: "passes" });
  });
  it("rejects a file that did not load, has no tests, timed out, or fails on something other than an assertion", () => {
    expect(judgeFileRun(run(undefined, { exitCode: 1 }))).toMatchObject({ kind: "rejected", detail: expect.stringMatching(/did not load: no report written \(exit 1/) });
    expect(judgeFileRun(run(undefined, { exitCode: 0 }))).toMatchObject({ kind: "rejected", detail: expect.stringMatching(/^zero tests collected/) });
    expect(judgeFileRun(run([]))).toMatchObject({ kind: "rejected", detail: "zero tests collected" });
    expect(judgeFileRun(run([assertFail("a")], { timedOut: true }))).toMatchObject({ kind: "rejected", detail: expect.stringMatching(/timed out/) });
    for (const type of ["TypeError", "Error", "TimeoutError", "UnreachableError", undefined])
      expect(judgeFileRun(run([assertFail("a"), { ...passed("b"), status: "failed", ...(type && { failureType: type }) }]))).toMatchObject({ kind: "rejected", detail: expect.stringContaining("other than an assertion") });
    expect(judgeFileRun(run([{ ...passed("a"), status: "skipped" }]))).toMatchObject({ kind: "rejected", detail: "every test case was skipped" });
  });
});

describe("check c: the same cases fail on a second run", () => {
  it("passes only when exactly the same cases fail on an assertion again", () => {
    expect(judgeSecondRun(["a"], judgeFileRun(run([assertFail("a"), passed("b")])))).toMatchObject({ ok: true });
    expect(judgeSecondRun(["a"], judgeFileRun(run([passed("a"), passed("b")])))).toEqual({ ok: false, detail: "second run: the test passed" });
    expect(judgeSecondRun(["a"], judgeFileRun(run([assertFail("a"), assertFail("b")])))).toMatchObject({ ok: false, detail: expect.stringMatching(/different cases/) });
    expect(judgeSecondRun(["a"], judgeFileRun(run(undefined, { exitCode: 1 })))).toMatchObject({ ok: false, detail: expect.stringMatching(/did not load/) });
  });
});

describe("check a: the diff", () => {
  const opts = { pattern: BUN_TEST_FILE_PATTERN, workdir: "recall-backend" };
  const none = { modifiedBase: [], deletedBase: [], addedInRepo: [] };
  it("one new test file inside the workdir, nothing else", () => {
    expect(checkDiff({ ...none, addedInRepo: ["recall-backend/test/x.test.ts"] }, opts)).toEqual({ kind: "file", file: "recall-backend/test/x.test.ts" });
    expect(checkDiff(none, opts)).toEqual({ kind: "none" });
    expect(runnerPath("recall-backend/test/x.test.ts", "recall-backend")).toBe("test/x.test.ts");
    expect(runnerPath("tests/x.test.ts", ".")).toBe("tests/x.test.ts");
  });
  it("rejects an edit to an existing file, a deletion, two files, a file outside the pattern or outside the workdir", () => {
    expect(checkDiff({ ...none, modifiedBase: ["recall-backend/index.ts"], addedInRepo: ["recall-backend/test/x.test.ts"] }, opts)).toEqual({ kind: "rejected", detail: "modified existing file(s): recall-backend/index.ts" });
    expect(checkDiff({ ...none, modifiedBase: ["recall-backend/test/a.test.ts"] }, opts)).toMatchObject({ kind: "rejected", detail: expect.stringContaining("modified existing file(s)") });
    expect(checkDiff({ ...none, deletedBase: ["a.ts"], addedInRepo: ["recall-backend/test/x.test.ts"] }, opts)).toMatchObject({ kind: "rejected", detail: expect.stringContaining("deleted existing file(s): a.ts") });
    expect(checkDiff({ ...none, addedInRepo: ["recall-backend/test/x.test.ts", "recall-backend/test/y.test.ts"] }, opts)).toMatchObject({ kind: "rejected", detail: expect.stringContaining("added 2 files") });
    expect(checkDiff({ ...none, addedInRepo: ["recall-backend/test/x.check.ts"] }, opts)).toMatchObject({ kind: "rejected", detail: expect.stringContaining("does not match the test-file pattern") });
    expect(checkDiff({ ...none, addedInRepo: ["test/x.test.ts"] }, opts)).toEqual({ kind: "rejected", detail: "test/x.test.ts is outside the test directory recall-backend/" });
  });
});

describe("check d: every test that passed at baseline still passes (decision 043's per-test rule)", () => {
  const t = (file: string, name: string, status: "passed" | "failed" | "skipped") => ({ file, name, status });
  const base: RegressionResult = { cmd: "bun test", exitCode: 0, timedOut: false, tests: [t("test/a.test.ts", "A", "passed"), t("test/b.test.ts", "B", "passed")] };
  const NEW = "test/new.test.ts";
  const after = (tests: ReturnType<typeof t>[], exitCode = 1): RegressionResult => ({ cmd: "bun test", exitCode, timedOut: false, tests });
  it("the suite's non-zero exit is accepted when the new file's own failing case explains it", () => {
    expect(judgeRegression(base, after([...base.tests!, t(NEW, "claim", "failed")]), NEW)).toEqual({ ok: true, detail: "all 2 tests that passed at baseline still pass with the file added (the suite's exit 1 comes from the new file's 1 failing case(s))" });
  });
  it("rejects a baseline test that now fails, is skipped or is missing; a failure outside the file; an unexplained exit", () => {
    expect(judgeRegression(base, after([t("test/a.test.ts", "A", "passed"), t("test/b.test.ts", "B", "failed"), t(NEW, "claim", "failed")]), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("test/b.test.ts > B (failed)") });
    expect(judgeRegression(base, after([t("test/a.test.ts", "A", "passed"), t("test/b.test.ts", "B", "skipped"), t(NEW, "claim", "failed")]), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("(skipped)") });
    expect(judgeRegression(base, after([t("test/a.test.ts", "A", "passed"), t(NEW, "claim", "failed")]), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("(missing)") });
    expect(judgeRegression(base, { cmd: "bun test", exitCode: 1, timedOut: false, reportError: "no report written" }, NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("[no report written]") });
    expect(judgeRegression(base, after([...base.tests!, t("test/c.test.ts", "C", "failed"), t(NEW, "claim", "failed")]), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("tests outside the new file fail with it added: test/c.test.ts > C") });
    expect(judgeRegression(base, after([...base.tests!, t(NEW, "claim", "passed")]), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("no test of the new file fails to explain it") });
    expect(judgeRegression({ ...base, tests: [] }, after(base.tests!), NEW)).toMatchObject({ ok: false, detail: expect.stringContaining("no per-test baseline") });
  });
  it("a test that already failed at baseline doesn't count against the file", () => {
    const failing: RegressionResult = { ...base, exitCode: 1, tests: [...base.tests!, t("test/c.test.ts", "C", "failed")] };
    expect(judgeRegression(failing, after([...failing.tests!, t(NEW, "claim", "failed")]), NEW)).toMatchObject({ ok: true });
  });
});

const tmp = () => mkdtempSync(path.join(tmpdir(), "th-claim-"));
const PROFILE = { id: "toy", workdir: ".", test: "bun test", typecheck: "$TSC --noEmit", testReport: { format: "junit", command: "bun test --reporter=junit --reporter-outfile=$REPORT" } };
function writeClaim(dir: string, extra: Record<string, unknown> = {}, profile: Record<string, unknown> = PROFILE): string {
  writeFileSync(path.join(dir, "profile.json"), JSON.stringify(profile));
  const file = path.join(dir, "claim.json");
  writeFileSync(file, JSON.stringify({ id: "toy-discount", profile: "profile.json", source: { localPath: "repo" }, baseSha: "a".repeat(40), title: "Discounts are wrong", claim: "A 10% discount on 200 charges 190; it should charge 180.", ...extra }));
  return file;
}

describe("claims", () => {
  it("loads a claim with its profile and optional seed; the agent sees title, claim and evidence", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "seed.patch"), "diff --git a/x b/x\n");
    const c = loadClaim(writeClaim(dir, { evidence: ["src/cart.ts:12"], seed: { patch: "seed.patch" } }));
    expect(c).toMatchObject({ spec: { id: "toy-discount" }, profile: { id: "toy" }, seedPatch: "diff --git a/x b/x\n", localPath: path.join(dir, "repo") });
    expect(claimText(c.spec)).toBe("Discounts are wrong\n\nA 10% discount on 200 charges 190; it should charge 180.\n\nEvidence: src/cart.ts:12");
  });
  it("rejects a profile without a JUnit report, unknown fields, and a missing seed", () => {
    expect(() => loadClaim(writeClaim(tmp(), {}, { id: "toy", test: "bun test" }))).toThrow(/needs "test" and a JUnit "testReport"/);
    expect(() => loadClaim(writeClaim(tmp(), { observed: "x" }))).toThrow(/Unrecognized key/);
    expect(() => loadClaim(writeClaim(tmp(), { seed: { patch: "nope.patch" } }))).toThrow(/does not exist/);
  });
});

describe("a REPRODUCED run becomes a repair task", () => {
  it("issue = the claim text, repro = the agent's test at its path, the seed copied; the repair harness's own loader accepts it", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "seed.patch"), "diff --git a/src/cart.ts b/src/cart.ts\n");
    const claim = loadClaim(writeClaim(dir, { seed: { patch: "seed.patch" } }));
    const record = { runId: "r1", claimId: claim.spec.id, state: "REPRODUCED", testFile: { path: "tests/discount.test.ts", runnerPath: "tests/discount.test.ts", content: "test-text", sha256: "x" } } as ReproRecord;
    const out = path.join(dir, "task");
    const task = loadTask(reproductionToTask(record, claim, out));
    expect(task.spec).toMatchObject({
      id: "toy-discount-from-repro",
      kind: "dev",
      issue: "A 10% discount on 200 charges 190; it should charge 180.",
      repro: { testFile: "repro.test.ts", dest: "tests/discount.test.ts", command: "bun test './tests/discount.test.ts'" },
      seed: { patch: "seed.patch" },
      limits: { steps: 40, tokens: 300_000, costUSD: 0.1 },
    });
    expect(task.reproContent).toBe("test-text");
    expect(task.profile?.id).toBe("toy");
    expect(readFileSync(path.join(out, "seed.patch"), "utf8")).toBe(claim.seedPatch);
    expect(() => reproductionToTask({ ...record, state: "NOT_REPRODUCED" }, claim, out)).toThrow(/not REPRODUCED/);
  });
});

// ── fake sandbox and model ────────────────────────────────────────────────────────────────
const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "", durationMs: 1, timedOut: false });
class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  creates = 0;
  async create(): Promise<SandboxHandle> {
    return { id: `fake-${++this.creates}`, provider: this.name };
  }
  async disableNetwork() {}
  async exec(_h: SandboxHandle, cmd: string): Promise<ExecResult> {
    if (cmd === SQUASH_HISTORY) return ok(`${"b".repeat(40)}\n`);
    if (cmd === repoStateCommand("b".repeat(40))) return ok(`${"0".repeat(64)}\n0\n0\n`);
    if (cmd.startsWith("git ls-tree")) return ok("package.json\0src/cart.ts\0");
    if (cmd.includes("if [ -f node_modules/typescript/bin/tsc ]")) return ok("image\nVersion 5.9.3\n");
    if (cmd.startsWith("curl") || cmd.startsWith("run-repro")) return { ...ok(), exitCode: 1 };
    return ok();
  }
  async writeFile() {}
  async readFile() {
    return "";
  }
  async destroy() {}
}
let n = 0;
const call = (name: string, args: unknown): ToolCall => ({ id: `c${++n}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
const model = (fn: (req: ChatRequest) => ChatResult | Promise<ChatResult>) => {
  const requests: ChatRequest[] = [];
  return { requests, client: { chat: async (req: ChatRequest) => (requests.push(structuredClone(req)), fn(req)) } };
};
const finishing = (): ChatResult => ({ content: "", cached: false, latencyMs: 1, inputTokens: 10, outputTokens: 1, costUSD: 0, toolCalls: [call("finish", { summary: "x" })], finishReason: "tool_calls" });

describe("a reproduce run (fake sandbox)", () => {
  it("a model request error ends the run FAILED, with no check run", async () => {
    const dir = tmp();
    const claim = loadClaim(writeClaim(dir));
    const { client } = model(() => {
      throw new Error("model request timed out after 60000 ms");
    });
    const provider = new FakeProvider();
    const r = await runReproduce({ claim, agent: new RepairLoopAgent({ promptFile: REPRO_PROMPT_FILE }), provider, image: "img", llm: client });
    expect(r).toMatchObject({ state: "FAILED", reason: "agent error: model request timed out after 60000 ms", checks: {} });
    expect(provider.creates).toBe(1); // the check sandbox was never created
    expect((r.agentRun!.trace as { promptFile: string }).promptFile).toBe("repro-v1.md");
  });
  it("an agent that adds nothing → NOT_REPRODUCED (no qualifying file); the agent got the claim and the repro prompt", async () => {
    const claim = loadClaim(writeClaim(tmp()));
    const { client, requests } = model(finishing);
    const r = await runReproduce({ claim, agent: new RepairLoopAgent({ promptFile: REPRO_PROMPT_FILE }), provider: new FakeProvider(), image: "img", llm: client });
    expect(r).toMatchObject({ state: "NOT_REPRODUCED", reason: "no qualifying file: the agent added no file", endReason: "finish" });
    expect(requests[0]!.messages[0]!.content).toContain("Your job is to write ONE new test");
    expect(requests[0]!.messages[1]!.content).toBe(
      "Issue:\nDiscounts are wrong\n\nA 10% discount on 200 charges 190; it should charge 180.\n\nLimits for this task: at most 40 tool calls, 300000 model tokens, 900 s. Start by exploring the repository.",
    );
  });
});

describe("the repair agent is unchanged (decision 048 rule: a prompt-file parameter only with the default unchanged)", () => {
  const fakeTask = (): LoadedTask => ({
    spec: {
      id: "fake",
      source: { localPath: "/x" },
      baseSha: "a".repeat(40),
      setup: [],
      issue: "discounts are wrong",
      repro: { testFile: "r.ts", dest: "r.test.ts", command: "run-repro" },
      regression: ["bun test ./tests"],
      typecheck: { packages: ["."], command: "tsc --noEmit" },
      limits: { steps: 10, wallClockMs: 60_000, tokens: 100_000, commandTimeoutMs: 5_000, costUSD: 0.1 },
    },
    dir: "/tasks",
    reproContent: "",
    localPath: "/x",
  });
  const sha = (s: unknown) => createHash("sha256").update(JSON.stringify(s)).digest("hex");
  it("a default repair run's first request messages are byte-identical to main's (pinned), and its prompt file is still agent-v5.md", async () => {
    const { client, requests } = model(finishing);
    const r = await runRepair({ task: fakeTask(), agent: new RepairLoopAgent(), provider: new FakeProvider(), image: "img", llm: client });
    // pinned at ba07667 (main, PR #9 merged), before any reproduce-stage code existed
    expect(sha(requests[0]!.messages)).toBe("bc57c40be1609ec6d36296e63357a70a5a2daa68c6e914b4a6b08cd9c0111fb1");
    expect(createHash("sha256").update(readFileSync(AGENT_PROMPT_FILE)).digest("hex")).toBe("556861d40ba86940a72c05d15b08cf07eea15a6d8a5508c6c7d3d352b92222b6");
    expect(r.agentRun!.trace).toMatchObject({ promptFile: "agent-v5.md", loopVersion: "agent-v6" });
    expect(path.basename(REPRO_PROMPT_FILE)).toBe("repro-v1.md");
  });
});
