// Decision 047: time to the fault file and the per-run counts, computed on the host from a trace.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LoopTurn } from "../src/harness/loop.ts";
import { faultFileRead, patchFiles, repoRelative, runMetrics } from "../src/harness/run-metrics.ts";

const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
const SEED = ["diff --git a/src/cart.ts b/src/cart.ts", "index 1..2 100644", "--- a/src/cart.ts", "+++ b/src/cart.ts", "@@ -1 +1 @@", "-a", "+b", ""].join("\n");

let n = 0;
/** One turn: calls as [name, args, ok, result?, ranAs?]; no calls = a reply without a tool call. */
function turn(calls: [string, unknown, boolean, string?, string?][], tokens = 100): LoopTurn {
  const t: LoopTurn = { turn: ++n, at: "", latencyMs: 1, inputTokens: tokens - 10, outputTokens: 10, costUSD: 0, cached: false, toolCalls: [], toolResults: [] };
  for (const [name, args, ok, result, ranAs] of calls) {
    const id = `c${++n}`;
    t.toolCalls.push({ id, name, arguments: JSON.stringify(args) });
    t.toolResults.push({ id, name, ok, result: result ?? (ok ? "ok" : "error: x"), ...(ranAs && { ranAs }) });
  }
  if (!calls.length) t.toolResults.push({ id: "-", name: "(none)", ok: false, result: "no tool call: nudged to use tools" });
  return t;
}

describe("time to fault file (decision 047)", () => {
  it("the files a seed patch changes: both sides, /dev/null excluded, the dev tasks' seeds", () => {
    expect(patchFiles(SEED)).toEqual(["src/cart.ts"]);
    expect(patchFiles("--- /dev/null\n+++ b/new.ts\n@@\n+x\n--- a/old.ts\n+++ /dev/null\n")).toEqual(["new.ts", "old.ts"]);
    const seeds = ["chat-recent", "search-description", "session-expiry", "short-summary"].map((t) => patchFiles(readFileSync(path.join(TASKS, `recall-dev-${t}`, "seed.patch"), "utf8")));
    expect(seeds).toEqual([["recall-backend/index.ts"], ["recall-backend/db/schema.ts"], ["recall-backend/middleware/middleware.ts"], ["recall-backend/worker.ts"]]);
  });

  it("paths as the model writes them", () => {
    expect(["/work/src/cart.ts", "./src/cart.ts", "src/cart.ts", "src/../src/cart.ts"].map(repoRelative)).toEqual(Array(4).fill("src/cart.ts"));
    expect([".", "/work", "/scratch/x.ts", "../etc/passwd", 7, ""].map(repoRelative)).toEqual(Array(6).fill(undefined));
  });

  it("counts steps as the harness does; only a successful read_file (or a call run as read_file) of a seed file counts", () => {
    const turns = [
      turn([["list_dir", { path: "." }, true]]), // step 1
      turn([]), // step 2: a reply without a tool call
      turn([["read_file", { path: "src/cart.ts" }, false, "error: not a file: src/cart.ts"], ["search", { pattern: "cart" }, true]]), // 3, 4: a failed read, a search hit
      turn([["str_replace_editor", { command: "view", path: "src/other.ts" }, true, "ok", "read_file"]]), // 5: another file
      turn([["str_replace_editor", { command: "view", path: "/work/src/cart.ts" }, true, "ok", "read_file"], ["read_file", { path: "src/cart.ts" }, true]]), // 6: the first read
    ];
    expect(faultFileRead({ turns }, SEED)).toEqual({ files: ["src/cart.ts"], read: { step: 6, turn: turns[4]!.turn, tokens: 500, file: "src/cart.ts" } });
  });

  it("a call after finish in the same turn is not a step; never reading a seed file gives null", () => {
    const turns = [turn([["finish", { summary: "x" }, true, "finished"], ["read_file", { path: "src/cart.ts" }, false, "not executed: finish was already called in this turn"]])];
    expect(faultFileRead({ turns }, SEED)).toEqual({ files: ["src/cart.ts"], read: null });
    const later = [turn([["finish", { summary: "x" }, false, "not finished: …"], ["read_file", { path: "src/cart.ts" }, true]])];
    expect(faultFileRead({ turns: later }, SEED).read).toMatchObject({ step: 2 });
  });

  it("run counts: end reason, failed edits (aliased ones included), unknown-tool calls, aliased calls", () => {
    const turns = [
      turn([["edit_file", { path: "a" }, false], ["write_file", { path: "a" }, false], ["edit_file", { path: "a" }, true]]),
      turn([["str_replace_editor", { command: "edit_file" }, false, "error: oldText not found", "edit_file"], ["str_replace_editor", {}, false, 'error: unknown tool "str_replace_editor". Available: read_file']]),
      turn([["finish", { summary: "x" }, true, "finished"], ["edit_file", { path: "a" }, false, "not executed: finish was already called in this turn"]]),
    ];
    const trace = { turns, finishSummary: "x" };
    expect(runMetrics({ agentRun: { steps: 6, trace } })).toEqual({ endReason: "finish", failedEdits: 3, unknownToolCalls: 1, aliasCalls: 1 });
    expect(runMetrics({ agentRun: { steps: 40, budgetExhausted: "steps 40", trace: { turns } } }).endReason).toBe("budget: steps 40");
    expect(runMetrics({ agentRun: { steps: 9, stopped: "stuck", trace: { turns } } }).endReason).toBe("stopped: stuck");
    expect(runMetrics({}).endReason).toBe("—");
  });
});
