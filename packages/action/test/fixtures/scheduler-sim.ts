#!/usr/bin/env node
// A stand-in for tracehound-testset scripts/open-prs.ts and scripts/testset/collect-tool-reviews.ts in
// test/window-scheduler.test.ts. No network, no git, no gh: the "fork" is sim.json next to this file
// ({pushed: [id], prs: {id: n}, comments: {id: {tool: count}}, review: {id: {tool: status}}, fail: {key: times},
// sleepMs: {key: ms}}), and every call is one JSON line in calls.jsonl. Like the real scripts it never pushes, opens or
// triggers twice: it reads its resume file and the "PR" first. Used in-process (simulate) and as a command (node's
// type stripping; erasable syntax only).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DAY_MS = 24 * 3_600_000;

export function simulate(argv: string[], { dir, now, sleep = () => {} }: { dir: string; now: () => number; sleep?: (ms: number) => void }): number {
  const val = (flag: string): string | undefined => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const stateFile = path.join(dir, "sim.json");
  const load = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const save = (s: unknown) => fs.writeFileSync(stateFile, JSON.stringify(s));
  const st = load();
  const execute = argv.includes("--execute");
  const id = val("--ids")!;
  const kind = val("--retrigger") ? "retrigger" : val("--trigger") ? "trigger" : val("--tool") ? "collect" : "open";
  const fork = val("--fork") ?? val("--repo");
  const resume = val("--resume-file");
  const key = kind === "collect" ? `collect:${val("--tool")}:${id}` : `${kind}:${id}`;
  fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({ kind, id, fork, execute, at: new Date(now()).toISOString(), pushed: st.pushed.length, argv }) + "\n");
  if ((st.fail?.[key] ?? 0) > 0) { st.fail[key]--; save(st); return 1; }
  const records = () => (resume && fs.existsSync(resume) ? fs.readFileSync(resume, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const has = (step: string) => records().some((r: { id: string; step: string }) => r.id === id && r.step === step);
  const record = (step: string, more: Record<string, unknown> = {}) => { fs.mkdirSync(path.dirname(resume!), { recursive: true }); fs.appendFileSync(resume!, JSON.stringify({ v: 1, fork, id, step, at: new Date(now()).toISOString(), ...more }) + "\n"); };
  if (kind === "open") {
    if (!val("--clone")) return 2;
    if (!execute) return 0;
    if (!st.pushed.includes(id)) st.pushed.push(id);
    st.prs[id] ??= Object.keys(st.prs).length + 1;
    save(st);
    if (!has("pushed")) record("pushed");
    if (!has("pr-created")) record("pr-created", { number: st.prs[id] });
    return 0;
  }
  if (kind === "trigger") {
    if (!execute) return 0;
    if (!has("pr-created")) return 2;
    for (const tool of val("--trigger")!.split(",")) {
      if (has(`triggered:${tool}`)) continue;
      const c = ((load().comments[id] ??= {})[tool] ?? 0);
      if (c === 0) {
        sleep(st.sleepMs?.[key] ?? 0); // a slow post: the scheduler can be killed while this command still runs
        const s = load();
        ((s.comments[id] ??= {})[tool] = 1);
        save(s);
      }
      record(`triggered:${tool}`, { existing: c > 0 });
    }
    return 0;
  }
  if (kind === "collect") {
    const tool = val("--tool")!, out = val("--out")!;
    if (!resume || val("--bound") || !val("--window-start") || !val("--window-end") || !val("--pr-map") || fs.existsSync(out)) return 2;
    const prMap = JSON.parse(fs.readFileSync(val("--pr-map")!, "utf8"));
    if (prMap[id] !== st.prs[id]) return 2;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${tool}.status.json`), JSON.stringify({ [id]: st.review?.[id]?.[tool] ?? "no-review" }));
    fs.writeFileSync(path.join(out, `${tool}.collection.json`), JSON.stringify({ v: 1, tool, repo: fork, window: { start: val("--window-start"), end: val("--window-end") } }));
    return 0;
  }
  // retrigger: only no-review, only 24 h after the first trigger, never a third
  const tool = val("--retrigger")!;
  if (!execute) return 2;
  let status: unknown;
  try { status = JSON.parse(fs.readFileSync(val("--status")!, "utf8"))[id]; } catch { return 2; }
  const first = records().find((r: { id: string; step: string }) => r.id === id && r.step === `triggered:${tool}`);
  if (!first || status !== "no-review") return 2;
  if (has(`retriggered:${tool}`) || now() < Date.parse(first.at) + DAY_MS) return 0;
  const s = load();
  if (s.comments[id][tool] >= 2) { record(`retriggered:${tool}`, { existing: true }); return 0; }
  s.comments[id][tool]++;
  save(s);
  record(`retriggered:${tool}`);
  return 0;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === fs.realpathSync(path.resolve(process.argv[1]))) {
  const sleep = (ms: number) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
  process.exitCode = simulate(process.argv.slice(2), { dir: path.dirname(fileURLToPath(import.meta.url)), now: () => Date.now(), sleep });
}
