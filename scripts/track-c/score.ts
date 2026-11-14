#!/usr/bin/env node
/**
 * score.ts (side track C): counts for one run directory of review-case.ts against the dev export.
 *
 *   node scripts/track-c/score.ts --export <dev export json> --run <review-case out dir> --detail <file outside the repo>
 *     [--judge-model sonnet] [--no-judge]
 *
 * Two measures per bug case, as docs/eval/ts-protocol.md §4 defines them:
 * - location hit, model-free: scripts/testset/kit.ts `locationHit` (a comment on a target's file within ±10
 *   lines of any target's range);
 * - judged catch: the judge matches any comment to the case's one reference issue. The prompt, the user message
 *   and the reply check are bench-judge-v1's own (src/bench/judge.ts), but the model is a Claude model on
 *   headless Claude Code, NOT Nemotron: this is a PROXY judge, not the scorer of record. One retry on an
 *   invalid reply, then JUDGE_FAILED, which is never a catch.
 * Also: comments per case, comments on clean cases, run failures, wall time and list-price cost from the run
 * records. stdout: counts only. --detail gets the per-case rows (case ids, verdicts); it must be outside the repo.
 * The labels are read by this script and are never printed.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { JUDGE_SYSTEM_PROMPT, judgeUserMessage, validateJudgeReply, type JudgeInput } from "../../packages/analyzer/src/bench/judge.ts";
import { locationHit, wilson, type Target } from "../testset/kit.ts";

interface ExportCase {
  id: string; repo: string; label: "bug" | "clean"; title: string;
  expected_findings: { description: string; locations: { file: string; lines_at_head: [number, number]; role: "primary" | "alternate" }[] }[];
}
interface Comment { path: string; line: number | null; body: string }

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]! + ([...xs].sort((a, b) => a - b)[Math.ceil((xs.length - 1) / 2)]! - [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!) / 2 : NaN);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function judge(input: JudgeInput, model: string): { ok: true; caught: boolean } | { ok: false; why: string } {
  let why = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = spawnSync(
      "claude",
      ["-p", judgeUserMessage(input), "--system-prompt", JUDGE_SYSTEM_PROMPT, "--model", model, "--output-format", "json", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
      { encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024, cwd: "/", stdio: ["ignore", "pipe", "pipe"] },
    );
    let reply = "";
    try {
      reply = (JSON.parse(run.stdout || "null") as { result?: string } | null)?.result ?? "";
    } catch {
      /* not JSON: counted as an invalid reply */
    }
    const start = reply.indexOf("{");
    const checked = validateJudgeReply(start >= 0 ? reply.slice(start, reply.lastIndexOf("}") + 1) : reply, input);
    if (checked.ok) return { ok: true, caught: Object.values(checked.matches).some((g) => g === "G1") };
    why = checked.why;
  }
  return { ok: false, why };
}

function main(): number {
  const { values } = parseArgs({ options: { export: { type: "string" }, run: { type: "string" }, detail: { type: "string" }, "judge-model": { type: "string", default: "sonnet" }, "no-judge": { type: "boolean", default: false } } });
  if (!values.export || !values.run || !values.detail) {
    console.error("usage: score.ts --export <json> --run <dir> --detail <file outside the repo> [--judge-model sonnet] [--no-judge]");
    return 2;
  }
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  if (path.resolve(values.detail).startsWith(repoRoot + path.sep)) {
    console.error("--detail must be outside the repository (it holds case ids and verdicts)");
    return 2;
  }
  if (fs.existsSync(values.detail)) {
    console.error(`${values.detail} exists; never overwritten`);
    return 2;
  }
  const cases = (JSON.parse(fs.readFileSync(values.export, "utf8")) as { side: string; cases: ExportCase[] }).cases;
  const rows: Record<string, unknown>[] = [];
  let bug = 0, clean = 0, reviewedBug = 0, reviewedClean = 0, hits = 0, catches = 0, judgeFailed = 0, cleanComments = 0, cleanWithComments = 0, failedRuns = 0, zeroComment = 0;
  const perCase: number[] = [], wall: number[] = [], cost: number[] = [], turns: number[] = [];
  for (const c of cases) {
    c.label === "bug" ? bug++ : clean++;
    const reviewFile = path.join(values.run, "reviews", `${c.id}.json`);
    const runFile = path.join(values.run, "runs", `${c.id}.json`);
    const record = fs.existsSync(runFile) ? (JSON.parse(fs.readFileSync(runFile, "utf8")) as { status: string; attempts: { wallMs: number; costUSD?: number; turns?: number }[] }) : undefined;
    if (record) {
      wall.push(record.attempts.reduce((n, a) => n + a.wallMs, 0) / 1000);
      cost.push(record.attempts.reduce((n, a) => n + (a.costUSD ?? 0), 0));
      turns.push(record.attempts.reduce((n, a) => n + (a.turns ?? 0), 0));
    }
    if (!fs.existsSync(reviewFile)) {
      failedRuns++;
      rows.push({ case: c.id, label: c.label, status: record?.status ?? "no-run" });
      continue;
    }
    const comments = (JSON.parse(fs.readFileSync(reviewFile, "utf8")) as { comments: Comment[] }).comments;
    perCase.push(comments.length);
    if (comments.length === 0) zeroComment++;
    if (c.label === "clean") {
      reviewedClean++;
      cleanComments += comments.length;
      if (comments.length) cleanWithComments++;
      rows.push({ case: c.id, label: "clean", comments: comments.length });
      continue;
    }
    reviewedBug++;
    const expected = c.expected_findings[0]!;
    const targets: Target[] = expected.locations.map((l) => ({ file: l.file, lines: l.lines_at_head, role: l.role }));
    const hit = locationHit(comments, targets);
    if (hit) hits++;
    let caught: boolean | "judge-failed" | null = null;
    if (!values["no-judge"]) {
      if (comments.length === 0) caught = false;
      else {
        const verdict = judge({ prTitle: c.title, golden: [{ id: "G1", text: expected.description }], tool: comments.map((t, i) => ({ id: `T${i + 1}`, ...t })) }, values["judge-model"]!);
        caught = verdict.ok ? verdict.caught : "judge-failed";
      }
      if (caught === true) catches++;
      if (caught === "judge-failed") judgeFailed++;
    }
    rows.push({ case: c.id, label: "bug", comments: comments.length, locationHit: hit, judged: caught });
  }
  const w = (k: number, n: number) => { const i = wilson(k, n); return i ? `[${(100 * i[0]).toFixed(0)}%, ${(100 * i[1]).toFixed(0)}%]` : "n/a"; };
  fs.writeFileSync(values.detail, JSON.stringify({ run: path.resolve(values.run), judge: values["no-judge"] ? null : `bench-judge-v1 prompt on claude ${values["judge-model"]} (proxy)`, rows }, null, 2) + "\n");
  console.log(`cases: ${bug} bug, ${clean} clean; reviews completed: ${reviewedBug} bug, ${reviewedClean} clean; runs without a review: ${failedRuns}`);
  console.log(`location hits (model-free, ±10 lines): ${hits} of ${bug} ${w(hits, bug)}`);
  if (!values["no-judge"]) console.log(`judged catches (PROXY judge: bench-judge-v1 prompt on claude ${values["judge-model"]}): ${catches} of ${bug} ${w(catches, bug)}; JUDGE_FAILED ${judgeFailed}`);
  console.log(`comments per completed case: mean ${mean(perCase).toFixed(2)}, median ${median(perCase)}, max ${Math.max(...perCase, 0)}; cases with 0 comments: ${zeroComment} of ${perCase.length}`);
  console.log(`clean cases: ${cleanComments} comments on ${cleanWithComments} of ${reviewedClean} reviewed`);
  console.log(`per case: wall s median ${median(wall).toFixed(0)}, max ${Math.max(...wall, 0).toFixed(0)}; turns median ${median(turns)}; list-price cost USD median ${median(cost).toFixed(4)}, mean ${mean(cost).toFixed(4)}, total ${cost.reduce((a, b) => a + b, 0).toFixed(2)} (reported by the CLI; nothing was billed per call)`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
