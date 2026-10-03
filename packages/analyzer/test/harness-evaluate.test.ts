// Decision 046: the evaluation runner's planning, spend stop, rows, totals and table, with a fake
// executor (no Docker, no model). The real path spawns `tracehound repair` per run.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { armTotals, discoverTasks, flagBaselineAnomalies, main, markdownTable, planJobs, rowFromRecord, runJobs, type Execute, type Job } from "../src/harness/evaluate.ts";
import { main as repairMain } from "../src/harness/cli.ts";
import type { RunRecord } from "../src/harness/run.ts";

const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
const DEV = ["recall-dev-chat-recent", "recall-dev-search-description", "recall-dev-session-expiry", "recall-dev-short-summary"];

/** A minimal run record as the harness writes it. */
function record(job: Job, state: string, extra: { costUSD?: number; files?: number; graphCalls?: number; packetChars?: number } = {}): RunRecord {
  return {
    runId: `${job.taskId}-${job.arm}-${job.repeat}`,
    taskId: job.taskId,
    provider: "fake",
    agent: "nemotron",
    image: "img",
    snapshot: "none",
    baseSha: "a".repeat(40),
    startedAt: "2026-10-03T10:00:00.000Z",
    endedAt: "2026-10-03T10:02:00.000Z",
    states: [],
    finalState: state as RunRecord["finalState"],
    reason: state === "RESOLVED" ? "repro passes and nothing fails that passed at baseline" : "repro still fails (exit 1)",
    sandbox: { destroyed: true },
    commands: [],
    repro: {},
    agentRun: { steps: 12, trace: { baseFilesRead: Array.from({ length: extra.files ?? 3 }, (_, i) => `f${i}.ts`), graphCalls: [] } },
    arm: { arm: job.arm === "on" ? "graph-on" : "graph-off", packetInjected: job.arm === "on", ...(job.arm === "on" && { packetChars: extra.packetChars ?? 4000 }), graphToolCalls: extra.graphCalls ?? 0 },
    usage: { llmCalls: 10, inputTokens: 90_000, outputTokens: 5_000, tokens: 95_000, costUSD: extra.costUSD ?? 0.01 },
  };
}

describe("evaluation runner (decision 046)", () => {
  it("discovers the tasks in a directory, filtered by kind and sorted; or one task directory", () => {
    expect(discoverTasks(TASKS, "dev").map((t) => t.taskId)).toEqual(DEV);
    expect(discoverTasks(TASKS, "dev").every((t) => t.kind === "dev" && t.costLimitUSD === 0.1)).toBe(true);
    expect(discoverTasks(path.join(TASKS, "recall-dev-chat-recent")).map((t) => t.taskId)).toEqual(["recall-dev-chat-recent"]);
    expect(() => discoverTasks(TASKS, "no-such-kind")).toThrow(/no task.json .* with kind "no-such-kind"/);
    expect(() => discoverTasks(path.join(TASKS, "nope"))).toThrow(/does not exist/);
  });

  it("takes a tasks directory outside this repo", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "th-eval-tasks-"));
    const task = path.join(dir, "outside-1");
    mkdirSync(task);
    writeFileSync(path.join(task, "repro.test.ts"), "");
    writeFileSync(
      path.join(task, "task.json"),
      JSON.stringify({ id: "outside-1", kind: "evaluation", source: { gitUrl: "https://example.invalid/x.git" }, baseSha: "b".repeat(40), issue: "x", repro: { testFile: "repro.test.ts", dest: "r.test.ts", command: "true" }, limits: { steps: 5, wallClockMs: 1000, tokens: 10 } }),
    );
    expect(discoverTasks(dir)).toEqual([{ taskId: "outside-1", taskFile: path.join(task, "task.json"), kind: "evaluation", costLimitUSD: 0.1 }]);
  });

  it("plans task-major: both arms of a repeat, then the next repeat, then the next task", () => {
    const jobs = planJobs(discoverTasks(TASKS, "dev").slice(0, 2), ["on", "off"], 2);
    expect(jobs.map((j) => `${j.taskId.slice(11)}:${j.arm}:${j.repeat}`)).toEqual([
      "chat-recent:on:1",
      "chat-recent:off:1",
      "chat-recent:on:2",
      "chat-recent:off:2",
      "search-description:on:1",
      "search-description:off:1",
      "search-description:on:2",
      "search-description:off:2",
    ]);
  });

  it("rows come from the run records; a run without a record is FAILED with the reason", async () => {
    const jobs = planJobs(discoverTasks(TASKS, "dev").slice(0, 2), ["on", "off"], 1);
    const execute: Execute = async (job) => (job.taskId.endsWith("search-description") && job.arm === "off" ? { error: "repair exited 3 without a record: docker missing" } : { record: record(job, job.arm === "on" ? "RESOLVED" : "UNRESOLVED", { graphCalls: 2 }), runFile: `/runs/${job.taskId}.json` });
    const rows = await runJobs(jobs, execute, { concurrency: 2 });
    expect(rows.map((r) => [r.taskId.slice(11), r.arm, r.state])).toEqual([
      ["chat-recent", "on", "RESOLVED"],
      ["chat-recent", "off", "UNRESOLVED"],
      ["search-description", "on", "RESOLVED"],
      ["search-description", "off", "FAILED"],
    ]);
    expect(rows[0]).toMatchObject({ steps: 12, tokens: 95_000, costUSD: 0.01, wallMs: 120_000, filesOpened: 3, graphToolCalls: 2, packetInjected: true, packetChars: 4000, runFile: "/runs/recall-dev-chat-recent.json" });
    expect(rows[1]).toMatchObject({ packetInjected: false, graphToolCalls: 2 });
    expect(rows[3]).toEqual({ taskId: "recall-dev-search-description", kind: "dev", arm: "off", repeat: 1, state: "FAILED", reason: "repair exited 3 without a record: docker missing" });
  });

  it("the spend cap stops before a run that could cross it: that run and every later one are NOT_RUN", async () => {
    const jobs = planJobs(discoverTasks(TASKS, "dev"), ["on", "off"], 1); // 8 jobs, $0.10 limit each
    let spent = 1.0; // ledger total before the runner starts
    const started: string[] = [];
    const execute: Execute = async (job) => {
      started.push(`${job.taskId}:${job.arm}`);
      spent += 0.05;
      return { record: record(job, "RESOLVED", { costUSD: 0.05 }) };
    };
    // $0.25 cap: after 3 runs $0.15 is spent, and $0.15 + a $0.10 reserve is not over; after 4, $0.20 + $0.10 is
    const rows = await runJobs(jobs, execute, { maxSpendUSD: 0.25, spentUSD: () => spent });
    expect(started).toHaveLength(4);
    expect(rows.slice(4).every((r) => r.state === "NOT_RUN" && /^spend cap: \$0\.20000 spent \+ \$0\.10 reserved > \$0\.25$/.test(r.reason!))).toBe(true);
    expect(armTotals(rows, ["on", "off"])).toMatchObject([
      { arm: "on", n: 2, notRun: 2, resolved: 2 },
      { arm: "off", n: 2, notRun: 2, resolved: 2 },
    ]);
  });

  it("per-arm totals and the markdown table give the sample size beside every total and make no significance claim", () => {
    const jobs = planJobs(discoverTasks(TASKS, "dev"), ["on", "off"], 1);
    const rows = jobs.map((j, i) => rowFromRecord(j, record(j, i % 4 === 0 ? "UNRESOLVED" : "RESOLVED", { files: 2, graphCalls: j.arm === "on" ? 1 : 0 })));
    const totals = armTotals(rows, ["on", "off"]);
    expect(totals).toEqual([
      { arm: "on", n: 4, notRun: 0, resolved: 2, unresolved: 2, failed: 0, steps: 48, tokens: 380_000, costUSD: 0.04, wallMs: 480_000, filesOpened: 8, graphToolCalls: 4, failedEdits: 0, unknownToolCalls: 0, faultReadKnown: 0, faultRead: 0, faultReadSteps: 0 },
      { arm: "off", n: 4, notRun: 0, resolved: 4, unresolved: 0, failed: 0, steps: 48, tokens: 380_000, costUSD: 0.04, wallMs: 480_000, filesOpened: 8, graphToolCalls: 0, failedEdits: 0, unknownToolCalls: 0, faultReadKnown: 0, faultRead: 0, faultReadSteps: 0 },
    ]);
    const md = markdownTable(rows, totals, { tasksDir: "eval/tasks", repeats: 1, generatedAt: "2026-10-03T12:00:00.000Z" });
    expect(md).toContain("| Task | Arm | Rep | State | End | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls | Failed edits | Unknown-tool calls | Fault file first read: step (tokens) |");
    expect(md).toContain("| recall-dev-chat-recent | graph-on | 1 | UNRESOLVED | — | 12 | 95000 | $0.01000 | 120 s | 2 | 1 | 0 | 0 | — |");
    expect(md).toContain("| graph-on | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 48 (12.0; n = 4) | 380000 (95000; n = 4) | $0.04000 ($0.01000; n = 4) | 480 s (120 s; n = 4) | 8 (2.0; n = 4) | 4 (n = 4) | 0 (n = 4) | 0 (n = 4) | 0 of 0 (—; n = 0) |");
    expect(md).toContain("No significance test was run and none is implied.");
    expect(md).not.toMatch(/significant(ly)? (better|worse|differ)|p-value|confidence interval/i);
  });

  it("decision 047: end reason, failed edits, unknown-tool calls and the first fault-file read come from the record", () => {
    const [on, off] = planJobs(discoverTasks(TASKS, "dev").slice(0, 1), ["on", "off"], 1);
    const turns = [
      { turn: 1, inputTokens: 900, outputTokens: 100, toolCalls: [{ id: "a", name: "str_replace_editor", arguments: "{}" }], toolResults: [{ id: "a", name: "str_replace_editor", ok: false, result: 'error: unknown tool "str_replace_editor". Available: read_file' }] },
      { turn: 2, inputTokens: 900, outputTokens: 100, toolCalls: [{ id: "b", name: "edit_file", arguments: "{}" }], toolResults: [{ id: "b", name: "edit_file", ok: false, result: "error: oldText not found" }] },
    ];
    const withTrace = (job: Job, state: string, read: { step: number; turn: number; tokens: number; file: string } | null, end: object) => {
      const r = record(job, state);
      r.agentRun = { steps: 2, ...end, trace: { ...(r.agentRun!.trace as object), turns, ...(state === "RESOLVED" && { finishSummary: "fixed" }) } };
      r.faultFileRead = { files: ["recall-backend/index.ts"], read };
      return rowFromRecord(job, r);
    };
    const rows = [withTrace(on!, "RESOLVED", { step: 7, turn: 5, tokens: 31_000, file: "recall-backend/index.ts" }, {}), withTrace(off!, "UNRESOLVED", null, { budgetExhausted: "tokens 300000" })];
    expect(rows[0]).toMatchObject({ endReason: "finish", failedEdits: 1, unknownToolCalls: 1, aliasCalls: 0, faultReadStep: 7, faultReadTokens: 31_000 });
    expect(rows[1]).toMatchObject({ endReason: "budget: tokens 300000", faultReadStep: null, faultReadTokens: null });
    const totals = armTotals(rows, ["on", "off"]);
    expect(totals.map((t) => [t.failedEdits, t.unknownToolCalls, t.faultReadKnown, t.faultRead, t.faultReadSteps])).toEqual([[1, 1, 1, 1, 7], [1, 1, 1, 0, 0]]);
    const md = markdownTable(rows, totals, { tasksDir: "eval/tasks", repeats: 1, generatedAt: "x" });
    expect(md).toContain("| recall-dev-chat-recent | graph-on | 1 | RESOLVED | finish | 2 | 95000 | $0.01000 | 120 s | 3 | 0 | 1 | 1 | 7 (31000) |");
    expect(md).toContain("| recall-dev-chat-recent | graph-off | 1 | UNRESOLVED | budget: tokens 300000 | 2 | 95000 | $0.01000 | 120 s | 3 | 0 | 1 | 1 | never |");
    expect(md).toContain("| 1 (n = 1) | 1 (n = 1) | 1 of 1 (7.0; n = 1) |");
    expect(md).toContain("| 1 (n = 1) | 1 (n = 1) | 0 of 1 (—; n = 0) |");
  });

  it("amendment 1: baseline tests passed / total per run; a run off the most common count for its task is flagged, the verdict untouched", () => {
    const jobs = planJobs(discoverTasks(TASKS, "dev").slice(0, 2), ["on", "off"], 2); // 2 tasks x 2 arms x 2 repeats
    const tests = (passed: number, total = 62) => Array.from({ length: total }, (_, i) => ({ file: "t.ts", name: `t${i}`, status: (i < passed ? "passed" : "failed") as "passed" | "failed" }));
    // task 1: 62, 62, 62, 57 → the 57 is flagged; task 2: 62, 62, 60, 60 → a tie, all four flagged
    const passed = [62, 62, 62, 57, 62, 62, 60, 60];
    const rows = flagBaselineAnomalies(
      jobs.map((j, i) => {
        const r = record(j, "RESOLVED");
        r.baseline = { regression: [{ cmd: "bun test", exitCode: passed[i] === 62 ? 0 : 1, timedOut: false, tests: tests(passed[i]!) }], typecheck: [] };
        return rowFromRecord(j, r);
      }),
    );
    expect(rows.map((r) => [r.baselinePassed, r.baselineTotal, r.baselineAnomaly])).toEqual([
      [62, 62, false],
      [62, 62, false],
      [62, 62, false],
      [57, 62, true],
      [62, 62, true],
      [62, 62, true],
      [60, 62, true],
      [60, 62, true],
    ]);
    expect(rows.every((r) => r.state === "RESOLVED")).toBe(true);
    const md = markdownTable(rows, armTotals(rows, ["on", "off"]), { tasksDir: "eval/tasks", repeats: 2, generatedAt: "x" });
    expect(md).toContain("| Baseline tests passed / total |");
    expect(md).toContain("| 57 / 62 **baseline-anomaly** |");
    expect(md).toContain("**baseline-anomaly: 5 run(s)** (recall-dev-chat-recent graph-off #2, recall-dev-search-description graph-on #1,");
    // no per-test report: no counts, nothing compared or flagged
    const plain = flagBaselineAnomalies(jobs.slice(0, 2).map((j) => rowFromRecord(j, record(j, "UNRESOLVED"))));
    expect(plain.map((r) => [r.baselinePassed, r.baselineAnomaly])).toEqual([[undefined, undefined], [undefined, undefined]]);
    expect(markdownTable(plain, armTotals(plain, ["on", "off"]), { tasksDir: "x", repeats: 1, generatedAt: "x" })).toContain("baseline-anomaly: none");
  });

  it("rejects bad arguments with exit code 3 before running anything", async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(await main([])).toBe(3);
      expect(await main(["--tasks", TASKS, "--arms", "on,maybe"])).toBe(3);
      expect(await main(["--tasks", TASKS, "--repeats", "0"])).toBe(3);
      expect(await main(["--tasks", TASKS, "--max-spend-usd=-1"])).toBe(3);
      expect(await main(["--tasks", TASKS, "--cost-limit-usd", "0"])).toBe(3);
      // the repair CLI checks its own --cost-limit-usd before any sandbox or model client exists
      expect(await repairMain(["--task", path.join(TASKS, "recall-dev-chat-recent", "task.json"), "--agent", "noop", "--cost-limit-usd=-1"])).toBe(3);
    } finally {
      console.error = quiet;
    }
  });
});
