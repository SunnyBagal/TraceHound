// Recomputes the held-out tables in docs/eval/heldout-results.md from the run records
// (decision 050). Reads records only; prints ids, counts and means, never test names or patches.
// Usage: node docs/eval/heldout/recompute.mjs <runs root>, where <runs root> holds b1-nano/ and
// b2-super/ (the eval worktree's runs/heldout-eval, or the unpacked runs tarball).
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const validPasses = {
  "b1-nano": ["pass-1", "pass-2", "pass-3", "pass-4", "pass-5"],
  "b2-super": ["pass-1", "pass-2", "pass-3", "pass-4-replacement-1", "pass-5"], // pass-4 void (outage)
};
const MODEL = { "b1-nano": "Nano", "b2-super": "Super" };

const recs = [];
for (const batch of Object.keys(validPasses)) {
  for (const dir of fs.readdirSync(path.join(root, batch))) {
    const runsDir = path.join(root, batch, dir, "runs");
    if (!fs.existsSync(runsDir)) continue;
    for (const f of fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"))) {
      const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
      const a = r.agentRun ?? {};
      const end = a.budgetExhausted ? `budget ${a.budgetExhausted.split(" ")[0]}` : a.error ? "error" : a.stopped ? "stuck" : "finish";
      // Amendment 1 / decision 049: whatever ended the run
      const verified = r.repro?.afterPatch?.exitCode === 0 && !r.repro?.afterPatch?.timedOut
        && r.comparison?.newFailures?.length === 0 && r.comparison?.regressedTests?.length === 0;
      const baseTests = r.baseline?.regression?.[0]?.tests ?? [];
      const calls = r.usage?.calls ?? [];
      recs.push({
        batch, dir, task: r.taskId.slice(-2), arm: r.arm?.arm === "graph-on" ? "on" : "off",
        state: r.finalState, end, verified, steps: a.steps, tokens: r.usage?.tokens, cost: r.usage?.costUSD,
        fault: r.faultFileRead?.read?.step ?? null, graph: r.arm?.graphToolCalls ?? 0,
        calls: calls.length, cached: calls.filter((c) => c.cached).length,
        baseline: `${baseTests.filter((t) => t.status === "passed").length}/${baseTests.length}`,
        reproPass: r.repro?.afterPatch?.exitCode === 0, newFailures: r.comparison?.newFailures?.length,
      });
    }
  }
}

// Void: a run in a valid pass that ended in an infrastructure error; its re-run counts instead.
const isVoid = (r) => r.end === "error" || r.state === "FAILED";
const counted = recs.filter((r) => (validPasses[r.batch].includes(r.dir) || r.dir.startsWith("rerun-")) && !isVoid(r));
const voids = recs.filter((r) => validPasses[r.batch].includes(r.dir) && isVoid(r)).map((v) => ({
  model: MODEL[v.batch], pass: v.dir, task: v.task, arm: v.arm, original: v.state,
  rerun: recs.filter((x) => x.batch === v.batch && x.dir.startsWith("rerun-") && x.task === v.task && x.arm === v.arm).map((x) => x.state),
}));

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const tally = (xs) => xs.reduce((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {});
const rv = (g) => `${g.filter((r) => r.state === "RESOLVED").length} / ${g.filter((r) => r.verified).length} (n = ${g.length})`;
const rows = [];
for (const batch of Object.keys(MODEL)) for (const arm of ["on", "off"]) {
  const g = counted.filter((r) => r.batch === batch && r.arm === arm);
  const read = g.filter((r) => r.fault !== null);
  rows.push({
    model: MODEL[batch], arm, n: g.length,
    resolved: g.filter((r) => r.state === "RESOLVED").length, verifiedAtStop: g.filter((r) => r.verified).length,
    meanSteps: +mean(g.map((r) => r.steps)).toFixed(2), meanTokens: Math.round(mean(g.map((r) => r.tokens))),
    meanCostUSD: +mean(g.map((r) => r.cost)).toFixed(6), totalCostUSD: +g.reduce((s, r) => s + r.cost, 0).toFixed(5),
    meanFaultReadStep: +mean(read.map((r) => r.fault)).toFixed(2), faultReadN: read.length,
    graphToolCalls: g.reduce((s, r) => s + r.graph, 0), endReasons: tally(g.map((r) => r.end)),
    crossComponent: rv(g.filter((r) => +r.task <= 4)), sameComponent: rv(g.filter((r) => +r.task >= 5)),
    perTaskResolved: Object.fromEntries(["01", "02", "03", "04", "05", "06", "07", "08"].map((t) => [t, g.filter((r) => r.task === t && r.state === "RESOLVED").length])),
    finishNotResolved: g.filter((r) => r.end === "finish" && r.state !== "RESOLVED")
      .map((r) => `${r.task}: repro ${r.reproPass ? "passes" : "still fails"}, new failures ${r.newFailures}`),
  });
}

console.log(JSON.stringify({
  records: recs.length, counted: counted.length, voids, rows,
  modelCalls: recs.reduce((s, r) => s + r.calls, 0), cacheHits: recs.reduce((s, r) => s + r.cached, 0),
  baselines: tally(recs.map((r) => r.baseline)),
}, null, 1));
