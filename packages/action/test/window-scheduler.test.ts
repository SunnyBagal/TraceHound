/**
 * scripts/testset/window-scheduler.ts (decision 076c item 11, 076d items 1c and 3). Dev fixtures only: the "fork" is
 * fixtures/scheduler-sim.ts (a stand-in for open-prs.ts and the collector; no network, no git, no gh). Most tests run
 * the scheduler in-process on a fake clock; the last one starts it detached as a real process, kills it in the middle
 * of a slot and starts it again.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guardSide, main, parseCli, pinnedPaths, readTools, realIo, runScheduler, type Io, type Opts } from "../../../scripts/testset/window-scheduler.ts";
import { simulate } from "./fixtures/scheduler-sim.ts";
import { main as collectMain } from "../../../scripts/testset/collect-tool-reviews.ts";

const SCRIPT = path.resolve(import.meta.dirname, "../../../scripts/testset/window-scheduler.ts");
const T0 = "2026-11-20T00:00:00.000Z";
const H = 3_600_000;
const FORKS = ["SunnyBagal/twenty", "SunnyBagal/medusa", "SunnyBagal/twenty", "SunnyBagal/payload"];
const PLAN = { v: 1, t0: T0, slotSeconds: 3600, firstSlot: 1, retriggerFromSlot: 30, lastSlot: 58, retriggerDueSeconds: 86_400, graceSeconds: 1800,
  minTriggerSpacingSeconds: 3600, firstTriggerAttempts: 2, timeoutSeconds: { open: 900, trigger: 300, collect: 600, retrigger: 300 } };

type Rec = Record<string, unknown> & { event: string; at: string };
class Killed extends Error {}
/** A plan that ends after the first triggers and `free` more slots (no re-trigger slot). */
const firstOnly = (n: number, free = 0) => ({ retriggerFromSlot: n + free + 1, lastSlot: n + free });

/** A run directory with n dev cases, the stand-in scripts, and a fake clock that starts at T0. */
function fixture(n: number, o: { plan?: Record<string, unknown>; sim?: Record<string, unknown>; execute?: boolean; startAt?: number } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "window-sched-"));
  const f = (name: string) => path.join(dir, name);
  const json = (name: string, v: unknown) => writeFileSync(f(name), JSON.stringify(v, null, 1) + "\n");
  const cases = Array.from({ length: n }, (_, i) => ({ position: i + 1, id: `case-90${i + 1}`, fork: FORKS[i]! }));
  json("cases.json", cases);
  json("plan.json", { ...PLAN, ...o.plan });
  json("tools.json", { v: 1, tools: { coderabbit: { logins: ["x[bot]"], notCompletion: [] }, greptile: { logins: ["y[bot]"], notCompletion: [] } } });
  json("manifest.json", cases.map((c) => ({ id: c.id })));
  json("sim.json", { pushed: [], prs: {}, comments: {}, review: {}, fail: {}, sleepMs: {}, ...o.sim });
  writeFileSync(f("calls.jsonl"), "");
  writeFileSync(f("kit.ts"), "// stands where the collector's kit.ts is (a pinned path)\n");
  for (const s of ["open-prs.ts", "collector.ts"]) copyFileSync(path.join(import.meta.dirname, "fixtures", "scheduler-sim.ts"), f(s));
  const argv = (...extra: string[]) => ["--side", "dev", "--cases", f("cases.json"), "--plan", f("plan.json"), "--tools", f("tools.json"), "--manifest", f("manifest.json"),
    "--clones", f("clones"), "--resume-dir", f("resume"), "--state-dir", f("state"), "--open-prs", f("open-prs.ts"), "--collector", f("collector.ts"),
    ...(o.execute ? ["--execute", "--pins", f("pins.json")] : []), ...extra];
  const pin = () => json("pins.json", { v: 1, sha256: Object.fromEntries(pinnedPaths(parseCli(argv().filter((a) => a !== "--execute")).o).map((p) => [p, sha(p)])) });
  if (o.execute) pin();
  const clock = { t: o.startAt ?? Date.parse(T0) };
  const said: string[] = [];
  /** the process table of the test: process group → its processes; `immortal` groups survive a kill; `unlisted`: the process list cannot be read */
  const groups = new Map<number, { pid: number; cmd: string }[]>(), killed: number[] = [], immortal = new Set<number>(), unlisted = { on: false };
  /** the scheduler's own gh reads (the fork's branches): paths asked for, and how many of the next reads fail */
  const reads: string[] = [], readFails = { n: 0 };
  let boot = 0, execs = 0;
  /** `die`: the scheduler process is killed at the first command for which it returns "before" (nothing ran) or "after" (the command ran, its end was never logged). */
  const io = (die: (argv: string[]) => "before" | "after" | null = () => null, seconds: (argv: string[]) => number = () => 5): Io => {
    const pid = 5000 + ++boot;
    return { now: () => clock.t, sleep: async (ms) => { clock.t += ms; }, busy: () => false, alive: () => false, ident: () => ({ pid, ppid: 1, pgid: pid }), say: (l) => { said.push(l); },
      groupAlive: (g) => (groups.get(g)?.length ?? 0) > 0, group: (g) => (unlisted.on ? null : groups.get(g) ?? []),
      killGroup: (g) => { killed.push(g); if (!immortal.has(g)) groups.delete(g); },
      // the fork as the stand-in has it: main, and the two refs of every case pushed to that fork so far
      read: (_bin, a) => {
        reads.push(a.join(" "));
        if (readFails.n > 0) { readFails.n--; return { exit: 1, stdout: "" }; }
        const fork = /^repos\/(SunnyBagal\/[^/]+)\/branches\?per_page=100&page=1$/.exec(a[3]!)![1];
        const pushed: string[] = JSON.parse(readFileSync(f("sim.json"), "utf8")).pushed;
        const names = [...pushed.filter((id) => cases.find((c) => c.id === id)!.fork === fork).flatMap((id) => [`cases/${id}-base`, `cases/${id}`]), "main"];
        return { exit: 0, stdout: JSON.stringify(names.map((name) => ({ name, commit: { sha: "0".repeat(40) } }))) };
      },
      exec: async (a, { outFile, onPid }) => {
        const how = die(a);
        if (how === "before") throw new Killed();
        onPid(7000 + ++execs);
        clock.t += seconds(a) * 1000;
        const exit = simulate(a.slice(2), { dir, now: () => clock.t });
        writeFileSync(outFile, "");
        if (how === "after") throw new Killed();
        return { exit, signal: null, timedOut: false, cleaned: true };
      } };
  };
  const opts = (): Opts => parseCli(argv()).o;
  /** Runs to the end, or to the simulated kill (the lock of the killed process stays, as after SIGKILL). */
  const run = async (i: Io = io()): Promise<number | "killed"> => {
    try { return await runScheduler(opts(), i); } catch (e) {
      if (!(e instanceof Killed)) throw e;
      writeFileSync(path.join(f("state"), "scheduler.lock"), "4999\n");
      return "killed";
    }
  };
  const log = (): Rec[] => readFileSync(path.join(f("state"), "scheduler.log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Rec);
  const calls = (): { kind: string; id: string; execute: boolean; at: string; pushed: number; argv: string[] }[] => readFileSync(f("calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sim = () => JSON.parse(readFileSync(f("sim.json"), "utf8"));
  const state = () => JSON.parse(readFileSync(path.join(f("state"), "scheduler.state.json"), "utf8"));
  const slots = () => log().filter((r) => r.event === "slot-end").map((r) => `${r.slot}:${r.outcome}`);
  /** when each trigger or re-trigger of a tool was posted (the stand-in posts at the end of its command), in time order */
  const posts = (tool: string) => ["twenty", "medusa", "payload"].flatMap((n) => { const file = path.join(f("resume"), `${n}.resume.jsonl`);
    return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []; })
    .filter((r) => (r.step === `triggered:${tool}` || r.step === `retriggered:${tool}`) && r.existing !== true).map((r) => Date.parse(r.at)).sort((a, b) => a - b);
  return { dir, f, json, cases, argv, pin, io, run, log, calls, sim, state, slots, said, clock, opts, groups, killed, immortal, unlisted, posts, reads, readFails };
}
const sha = (p: string) => spawnSync("shasum", ["-a", "256", p], { encoding: "utf8" }).stdout.slice(0, 64);
const at = (hours: number, seconds = 0) => new Date(Date.parse(T0) + hours * H + seconds * 1000).toISOString();

describe("window-scheduler: slots, order and the log", () => {
  it("dry run by default: open-prs runs without --execute, nothing is pushed or posted, every slot is logged with its planned UTC time", async () => {
    const t = fixture(3);
    expect(await t.run()).toBe(0);
    expect(t.calls().map((c) => `${c.kind}:${c.id}:${c.execute}`)).toEqual(["open:case-901:false", "trigger:case-901:false", "open:case-902:false", "trigger:case-902:false",
      "open:case-903:false", "trigger:case-903:false"]);
    expect(t.sim()).toMatchObject({ pushed: [], prs: {}, comments: {} });
    expect(existsSync(t.f("resume"))).toBe(false);
    expect(t.reads).toEqual([]); // a dry run makes no gh call of its own
    expect(t.log().some((r) => r.event === "fork-branches")).toBe(false);
    const starts = t.log().filter((r) => r.event === "slot-start");
    expect(starts.map((r) => [r.slot, r.plannedAt, r.at, r.action, r.position, r.delaySeconds])).toEqual([[1, at(1), at(1), "first", 1, 0], [2, at(2), at(2), "first", 2, 0], [3, at(3), at(3), "first", 3, 0]]);
    // a dry run writes no trigger record, so it ends after the first triggers
    expect(t.slots()).toEqual(["1:done", "2:done", "3:done"]);
    expect(t.log().at(-1)!.event).toBe("end");
    expect(existsSync(path.join(t.f("state"), "scheduler.done"))).toBe(true);
    for (const r of t.log()) expect(r.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(t.log()[0]).toMatchObject({ event: "boot", pid: 5001, ppid: 1, pgid: 5001 });
    expect(t.state()).toMatchObject({ execute: false, ended: true, boots: [{ pid: 5001, ppid: 1 }] });
    // a finished run does nothing when started again
    expect(await t.run()).toBe(0);
    expect(t.calls()).toHaveLength(6);
  });

  it("execute: each case is pushed only in its own slot, then triggered; re-trigger checks follow the collector's verdict, one PR per slot", async () => {
    const review = { "case-901": { coderabbit: "no-review", greptile: "completed" }, "case-902": { coderabbit: "completed", greptile: "completed" },
      "case-903": { coderabbit: "invalid-binding", greptile: "no-review" } };
    const t = fixture(3, { execute: true, sim: { review } });
    // the first case's push is slow (20 s), the others take 5 s: the trigger of slot 2 waits for the hour to be full
    expect(await t.run(t.io(() => null, (a) => (a.includes("--clone") && a.includes("case-901") ? 20 : 5)))).toBe(0);
    const first = t.calls().slice(0, 6);
    expect(first.map((c) => `${c.kind}:${c.id}:${c.execute}:${c.pushed}`)).toEqual(["open:case-901:true:0", "trigger:case-901:true:1", "open:case-902:true:1", "trigger:case-902:true:2",
      "open:case-903:true:2", "trigger:case-903:true:3"]);
    // 076d 1c: no branch is on a fork before its slot
    first.filter((c) => c.kind === "open").forEach((c, i) => expect(Date.parse(c.at)).toBeGreaterThanOrEqual(Date.parse(at(i + 1))));
    expect(first[0]!.argv).toEqual(["--manifest", t.f("manifest.json"), "--fork", "SunnyBagal/twenty", "--resume-file", path.join(t.f("resume"), "twenty.resume.jsonl"),
      "--clone", path.join(t.f("clones"), "twenty"), "--ids", "case-901", "--execute"]);
    expect(first[3]!.argv).toEqual(["--manifest", t.f("manifest.json"), "--fork", "SunnyBagal/medusa", "--resume-file", path.join(t.f("resume"), "medusa.resume.jsonl"),
      "--trigger", "coderabbit,greptile", "--ids", "case-902", "--execute"]);
    // never two posts of a tool inside one hour: each trigger command starts an hour after the last one ENDED
    for (const tool of ["coderabbit", "greptile"]) {
      const posts = t.posts(tool);
      expect(posts.length).toBe(4);
      for (let i = 1; i < posts.length; i++) expect(posts[i]! - posts[i - 1]!).toBeGreaterThanOrEqual(H);
    }
    // slot 1's trigger ended at +25 s, so slot 2's starts at +25 s (20 s wait) and ends at +30 s; slot 3's waits 25 s
    // (slot 31's check of position 3 also waits, before its collection: slot 30's re-trigger command ended at 30:00:10)
    expect(t.log().filter((r) => r.event === "spacing-wait").map((r) => [r.slot, r.seconds])).toEqual([[2, 20], [3, 25], [31, 10]]);
    // slots 4..29 hold no first trigger and come before the re-trigger slots: nothing happens in them
    expect(t.slots().slice(0, 29)).toEqual(["1:done", "2:done", "3:done", ...Array.from({ length: 26 }, (_, i) => `${i + 4}:nothing-to-do`)]);
    // slot 30: position 1 (coderabbit no-review → re-triggered, greptile completed); slot 31: position 2 needs nothing, so
    // the same slot goes on to position 3 (coderabbit invalid-binding, greptile re-triggered); then nothing is left
    expect(t.slots().slice(29)).toEqual(["30:retriggered", "31:retriggered"]);
    const later = t.calls().slice(6).map((c) => `${c.kind}:${c.id}:${c.argv.includes("--tool") ? c.argv[c.argv.indexOf("--tool") + 1] : c.argv[c.argv.indexOf("--retrigger") + 1]}`);
    expect(later).toEqual(["collect:case-901:coderabbit", "retrigger:case-901:coderabbit", "collect:case-901:greptile",
      "collect:case-902:coderabbit", "collect:case-902:greptile", "collect:case-903:coderabbit", "collect:case-903:greptile", "retrigger:case-903:greptile"]);
    expect(t.sim().comments).toEqual({ "case-901": { coderabbit: 2, greptile: 1 }, "case-902": { coderabbit: 1, greptile: 1 }, "case-903": { coderabbit: 1, greptile: 2 } });
    const collect = t.calls()[6]!.argv, dir = path.join(t.f("state"), "check", "p1-coderabbit.s30.1");
    expect(collect).toEqual(["--side", "dev", "--tool", "coderabbit", "--config", t.f("tools.json"), "--repo", "SunnyBagal/twenty", "--manifest", t.f("manifest.json"),
      "--pr-map", `${dir}.pr-map.json`, "--window-start", T0, "--window-end", at(30), "--resume-file", path.join(t.f("resume"), "twenty.resume.jsonl"), "--ids", "case-901", "--out", dir]);
    expect(t.calls()[7]!.argv.slice(-7)).toEqual(["--retrigger", "coderabbit", "--status", path.join(dir, "coderabbit.status.json"), "--ids", "case-901", "--execute"]);
    expect(t.log().filter((r) => r.event === "tool-handled").map((r) => `${r.position}:${r.tool}:${String(r.why).split(":")[0]}`)).toEqual(["1:coderabbit:re-triggered", "1:greptile:completed",
      "2:coderabbit:completed", "2:greptile:completed", "3:coderabbit:invalid-binding", "3:greptile:re-triggered"]);
    expect(t.state().positions.map((p: { firstTrigger: string }) => p.firstTrigger)).toEqual(["done", "done", "done"]);
    expect(t.said.join("\n")).not.toMatch(/title|body/i);
    // addendum item 3: the fork's branches are logged right before every trigger and re-trigger command
    const twenty1 = ["cases/case-901", "cases/case-901-base", "main"], twenty2 = ["cases/case-901", "cases/case-901-base", "cases/case-903", "cases/case-903-base", "main"];
    const all = t.log();
    const listed = all.filter((r) => r.event === "fork-branches");
    expect(listed.map((r) => [r.slot, r.position, r.fork, r.before, (r.branches as { name: string }[]).map((b) => b.name)])).toEqual([
      [1, 1, "SunnyBagal/twenty", "trigger", twenty1],
      [2, 2, "SunnyBagal/medusa", "trigger", ["cases/case-902", "cases/case-902-base", "main"]],
      [3, 3, "SunnyBagal/twenty", "trigger", twenty2],
      [30, 1, "SunnyBagal/twenty", "retrigger:coderabbit", twenty2],
      [31, 3, "SunnyBagal/twenty", "retrigger:greptile", twenty2]]);
    for (const r of listed) {
      expect(r.count).toBe((r.branches as unknown[]).length);
      expect((r.branches as { sha: string }[]).every((b) => /^[0-9a-f]{40}$/.test(b.sha))).toBe(true);
      // the very next command in the log is the trigger it was listed for
      const next = all.find((x) => x.event === "step-start" && x.n === r.nextStep)!;
      expect([next.step, next.position]).toEqual([r.before, r.position]);
      expect(all.indexOf(next)).toBe(all.indexOf(r) + 1);
    }
    const posted = t.log().filter((r) => r.event === "step-start" && (r.step === "trigger" || String(r.step).startsWith("retrigger:")));
    expect(posted).toHaveLength(listed.length); // no trigger command without its list
    expect(t.reads.every((x) => /^api --method GET repos\/SunnyBagal\/(twenty|medusa)\/branches\?per_page=100&page=1$/.test(x))).toBe(true);
  });

  it("a collection that cannot be read is tried once more; failing twice, the slot passes and the same PR is first at the next slot", async () => {
    const t = fixture(1, { execute: true, plan: { retriggerFromSlot: 26, lastSlot: 30 }, sim: { review: { "case-901": { coderabbit: "no-review", greptile: "completed" } }, fail: { "collect:coderabbit:case-901": 3 } } });
    expect(await t.run()).toBe(0);
    expect(t.slots().filter((s) => /^2[67]:/.test(s))).toEqual(["26:passed:collection-failed-twice", "27:retriggered"]);
    // slot 26: two failed collections; slot 27: one failed, the second (a new directory) read
    expect(t.calls().filter((c) => c.kind === "collect" && c.argv.includes("coderabbit")).map((c) => path.basename(c.argv[c.argv.indexOf("--out") + 1]!)))
      .toEqual(["p1-coderabbit.s26.1", "p1-coderabbit.s26.2", "p1-coderabbit.s27.1", "p1-coderabbit.s27.2"]);
    expect(t.sim().comments["case-901"]).toEqual({ coderabbit: 2, greptile: 1 });
  });
});

describe("window-scheduler: restart, missed slots and failures", () => {
  it("killed between two steps of a slot: the restart resumes the slot from its log and does not repeat the finished step", async () => {
    const t = fixture(2, { execute: true, plan: firstOnly(2) });
    expect(await t.run(t.io((a) => (a.includes("--trigger") && a.includes("case-901") ? "before" : null)))).toBe("killed");
    expect(t.sim()).toMatchObject({ pushed: ["case-901"], comments: {} });
    t.clock.t += 60_000; // back a minute later, inside the slot's grace
    expect(await t.run()).toBe(0);
    expect(t.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901", "open:case-902", "trigger:case-902"]);
    expect(t.log().filter((r) => r.event === "boot")).toHaveLength(2);
    expect(t.log().filter((r) => r.event === "slot-start" && r.slot === 1)).toHaveLength(1);
    expect(t.log().filter((r) => r.event === "slot-resume").map((r) => [r.slot, r.action, r.position])).toEqual([[1, "first", 1]]);
    expect(t.state().positions[0]).toMatchObject({ firstTrigger: "done", attempts: 1 });
    expect(t.state().boots).toHaveLength(2);
  });

  it("killed in the middle of a step that had already posted: the step runs again, nothing is pushed, opened or posted twice, and the next PR still waits its hour", async () => {
    const t = fixture(2, { execute: true, plan: firstOnly(2) });
    expect(await t.run(t.io((a) => (a.includes("--trigger") && a.includes("case-901") ? "after" : null)))).toBe("killed");
    expect(t.sim().comments).toEqual({ "case-901": { coderabbit: 1, greptile: 1 } });
    expect(t.log().filter((r) => r.event === "step-start" && r.step === "trigger")).toHaveLength(1);
    expect(t.log().filter((r) => r.event === "step-end" && r.step === "trigger")).toHaveLength(0);
    t.clock.t += 20 * 60_000; // the scheduler is down for 20 minutes
    expect(await t.run()).toBe(0);
    expect(t.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901", "trigger:case-901", "open:case-902", "trigger:case-902"]);
    expect(t.sim()).toMatchObject({ pushed: ["case-901", "case-902"], prs: { "case-901": 1 }, comments: { "case-901": { coderabbit: 1, greptile: 1 }, "case-902": { coderabbit: 1, greptile: 1 } } });
    const records = readFileSync(path.join(t.f("resume"), "twenty.resume.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).step);
    expect(records).toEqual(["pushed", "pr-created", "triggered:coderabbit", "triggered:greptile"]);
    // the cut command is closed in the log when its processes are seen gone, and that moment bounds its post
    expect(t.log().filter((r) => r.event === "step-cleared").map((r) => [r.step, r.position, r.killed])).toEqual([["trigger", 1, false]]);
    for (const tool of ["coderabbit", "greptile"]) { const [a, b] = t.posts(tool); expect(b! - a!).toBeGreaterThanOrEqual(H); }
    // case-902's trigger waited an hour from the end of case-901's last command, 20 minutes past its own slot
    expect(Date.parse(t.calls()[4]!.at)).toBeGreaterThanOrEqual(Date.parse(at(2)) + 20 * 60_000);
  });

  // codex 076d review, P2-S1: the hour is between posts, not between command starts
  it("unequal command durations: a slow trigger command (180 s of checks before its post) still leaves an hour to the next PR's post", async () => {
    const t = fixture(3, { execute: true, plan: firstOnly(3) });
    expect(await t.run(t.io(() => null, (a) => (a.includes("--trigger") && a.includes("case-901") ? 180 : 5)))).toBe(0);
    for (const tool of ["coderabbit", "greptile"]) {
      const posts = t.posts(tool);
      expect(posts).toHaveLength(3);
      for (let i = 1; i < posts.length; i++) expect(posts[i]! - posts[i - 1]!).toBeGreaterThanOrEqual(H);
    }
    // case-901's post is at 01:03:05; case-902's command may not start before 02:03:05
    expect(t.posts("coderabbit").map((x) => new Date(x).toISOString())).toEqual([at(1, 185), at(2, 190), at(3, 195)]);
    expect(t.slots()).toEqual(["1:done", "2:done", "3:done"]);
  });

  it("a cut trigger command that is never run again still bounds the next PR: the hour counts from when its processes were seen gone", async () => {
    // case-901's first try fails; in its second try the trigger command posts after 180 s and the scheduler is killed
    // before logging its end. It is back 40 minutes later, past the slot's grace: both tries are used, so the command is
    // not run again and case-902 follows.
    const t = fixture(2, { execute: true, plan: firstOnly(2, 1), sim: { fail: { "trigger:case-901": 1 } } });
    const seconds = (a: string[]) => (a.includes("--trigger") && a.includes("case-901") ? 180 : 5);
    let n = 0;
    expect(await t.run(t.io((a) => (a.includes("--trigger") && a.includes("case-901") && ++n === 2 ? "after" : null), seconds))).toBe("killed");
    t.clock.t += 40 * 60_000;
    const back = t.clock.t;
    expect(await t.run(t.io(() => null, seconds))).toBe(0);
    expect(t.slots()).toEqual(["1:failed:trigger", "2:interrupted-late", "3:done"]);
    expect(t.log().filter((r) => r.event === "step-cleared").map((r) => [r.step, r.position, Date.parse(r.at)])).toEqual([["trigger", 1, back]]);
    // the scheduler has no confirmed success for case-901, so it is failed-first-trigger; the resume file shows what was posted
    expect(t.state().positions.map((p: { firstTrigger: string }) => p.firstTrigger)).toEqual(["failed-first-trigger", "done"]);
    const [first, second] = t.posts("coderabbit");
    expect(second! - first!).toBeGreaterThanOrEqual(H);
    // case-902's trigger command started an hour after the cut command was seen gone, not at its own slot
    const start = t.log().find((r) => r.event === "step-start" && r.step === "trigger" && r.position === 2)!;
    expect(Date.parse(start.at)).toBe(back + H);
    expect(t.sim().comments).toEqual({ "case-901": { coderabbit: 1, greptile: 1 }, "case-902": { coderabbit: 1, greptile: 1 } });
  });

  // codex 076d review, P2-S2: the verdict a re-trigger is posted from is collected after the spacing wait
  it("a review that completes while the scheduler waits out the spacing is seen: the collection comes after the wait and nothing is posted", async () => {
    const review = { "case-901": { coderabbit: "no-review", greptile: "completed" }, "case-902": { coderabbit: { completedAt: at(31, 8) }, greptile: "completed" } };
    const t = fixture(2, { execute: true, sim: { review } });
    expect(await t.run()).toBe(0);
    // slot 30 re-triggers case-901 (its command ends at 30:00:10); slot 31 must wait until 31:00:10 before it may post
    expect(t.slots().slice(-2)).toEqual(["30:retriggered", "31:nothing-needed"]);
    const wait = t.log().findIndex((r) => r.event === "spacing-wait" && r.slot === 31);
    const collect = t.log().findIndex((r) => r.event === "step-start" && r.slot === 31 && r.step === "collect:coderabbit");
    expect(wait).toBeGreaterThan(-1);
    expect(collect).toBeGreaterThan(wait);
    const collects = t.calls().filter((c) => c.kind === "collect" && c.id === "case-902" && c.argv.includes("coderabbit"));
    expect(collects).toHaveLength(1);
    expect(Date.parse(collects[0]!.at)).toBeGreaterThanOrEqual(Date.parse(at(31, 10)));
    expect(t.calls().filter((c) => c.kind === "retrigger").map((c) => c.id)).toEqual(["case-901"]);
    expect(t.sim().comments["case-902"]).toEqual({ coderabbit: 1, greptile: 1 });
    expect(t.log().filter((r) => r.event === "tool-handled" && r.position === 2).map((r) => String(r.why).split(":")[0])).toEqual(["completed", "completed"]);
  });

  // codex 076d review, P2-S3: fail closed while a command's processes may still write
  it("a timed-out command whose processes cannot be confirmed ended stops the scheduler; a restart goes on only once they are gone", async () => {
    const t = fixture(2, { execute: true, plan: firstOnly(2) });
    const stuck: Io["exec"] = async (a, o) => {
      if (!(a.includes("--trigger") && a.includes("case-901"))) return t.io().exec(a, o);
      o.onPid(8001);
      t.groups.set(8001, [{ pid: 8001, cmd: `${process.execPath} ${t.f("open-prs.ts")} --resume-file ${path.join(t.f("resume"), "twenty.resume.jsonl")} --trigger coderabbit,greptile` },
        { pid: 8101, cmd: "/usr/local/bin/gh pr comment 1 --repo SunnyBagal/twenty --body-file -" }]);
      t.immortal.add(8001);
      t.clock.t += 300_000;
      return { exit: null, signal: "SIGKILL", timedOut: true, cleaned: false };
    };
    expect(await t.run({ ...t.io(), exec: stuck })).toBe(3);
    expect(t.log().at(-1)).toMatchObject({ event: "stop", reason: "a timed-out command's processes could not be confirmed ended", step: "trigger", pid: 8001 });
    expect(t.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901"]);
    expect(t.state()).toMatchObject({ stopped: "a timed-out command's processes could not be confirmed ended", ended: false });
    // started again while the gh process is still there: the group is killed, cannot be confirmed gone, and it stops again
    expect(await t.run()).toBe(3);
    expect(t.killed).toEqual([8001]);
    expect(t.log().at(-1)).toMatchObject({ event: "stop", reason: "a cut command's processes could not be confirmed ended", pid: 8001 });
    expect(t.calls()).toHaveLength(1);
    // codex 076d-r2, P2-R1: the group is alive but the process list cannot be read: unknown is not "gone".
    // Not cleared, nothing started, and nothing killed either (it is not known to be this command)
    t.unlisted.on = true;
    expect(await t.run()).toBe(3);
    expect(t.log().at(-1)).toMatchObject({ event: "stop", reason: "a cut command's process group is alive and its processes cannot be listed or identified", pid: 8001, evidence: "unknown", killed: false });
    expect(t.killed).toEqual([8001]);
    expect(t.calls()).toHaveLength(1);
    expect(t.log().some((r) => r.event === "step-cleared")).toBe(false);
    // listed again, but only a process nobody can attribute, and no group leader: still unknown, still stopped
    t.unlisted.on = false;
    t.groups.set(8001, [{ pid: 8300, cmd: "/usr/libexec/some-helper --serve" }]);
    expect(await t.run()).toBe(3);
    expect(t.log().at(-1)).toMatchObject({ event: "stop", evidence: "unknown", killed: false });
    expect(t.killed).toEqual([8001]);
    expect(t.calls()).toHaveLength(1);
    expect(t.log().some((r) => r.event === "step-cleared")).toBe(false);
    // the group id now belongs to another program (its leader is not this command): a process id is not reused while its
    // group has a member, so the command's group had ended; the step is cleared without a kill and the run goes on
    t.groups.set(8001, [{ pid: 8001, cmd: "/Applications/Notes.app/Contents/MacOS/Notes" }]);
    expect(await t.run()).toBe(0);
    expect(t.killed).toEqual([8001]);
    expect(t.log().filter((r) => r.event === "step-cleared").map((r) => [r.step, r.pid, r.killed])).toEqual([["trigger", 8001, false]]);
    expect(t.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901", "open:case-902", "trigger:case-902"]);
    // a cut command that is still running past its own timeout is killed as a group, and the run goes on once it is gone
    const k = fixture(1, { execute: true, plan: firstOnly(1) });
    const cutRun = k.io((a) => (a.includes("--trigger") ? "before" : null));
    expect(await k.run({ ...cutRun, exec: async (a, o) => { if (a.includes("--trigger")) { o.onPid(8002); k.groups.set(8002, [{ pid: 8050, cmd: "/usr/bin/git -C /clone push --atomic https://github.com/SunnyBagal/twenty.git" }]); } return cutRun.exec(a, o); } })).toBe("killed");
    expect(await k.run()).toBe(0);
    expect(k.killed).toEqual([8002]);
    expect(k.log().filter((r) => r.event === "step-cleared").map((r) => [r.pid, r.killed])).toEqual([[8002, true]]);
  });

  it("a slot that comes up more than the grace late is not fired late; its case takes the next slot, before any later case is pushed", async () => {
    // the scheduler is down from before slot 1 until 31 minutes after it
    const t = fixture(3, { execute: true, plan: firstOnly(3, 1), startAt: Date.parse(T0) + H + 31 * 60_000 });
    expect(await t.run()).toBe(0);
    expect(t.slots().slice(0, 4)).toEqual(["1:missed", "2:done", "3:done", "4:done"]);
    // the missed slot was no try: case-901 is first in slot 2, and the later cases move back one slot each
    expect(t.log().filter((r) => r.event === "slot-start").slice(0, 3).map((r) => [r.slot, r.position])).toEqual([[2, 1], [3, 2], [4, 3]]);
    expect(t.calls().filter((c) => c.kind === "open").map((c) => [c.id, c.at, c.pushed])).toEqual([["case-901", at(2, 5), 0], ["case-902", at(3, 5), 1], ["case-903", at(4, 5), 2]]);
    expect(t.state()).toMatchObject({ missed: 1 });
    expect(t.state().positions.map((p: { attempts: number }) => p.attempts)).toEqual([1, 1, 1]);
    // killed mid-slot and back after the grace: the slot is closed as interrupted, and the case's second try is the next
    // slot, before case-902 is pushed
    const k = fixture(2, { execute: true, plan: firstOnly(2, 1) });
    expect(await k.run(k.io((a) => (a.includes("--trigger") && a.includes("case-901") ? "before" : null)))).toBe("killed");
    k.clock.t += 40 * 60_000;
    expect(await k.run()).toBe(0);
    expect(k.slots().slice(0, 3)).toEqual(["1:interrupted-late", "2:done", "3:done"]);
    expect(k.calls().map((c) => `${c.kind}:${c.id}:${c.pushed}`)).toEqual(["open:case-901:0", "trigger:case-901:1", "open:case-902:1", "trigger:case-902:2"]);
    expect(k.state().positions[0]).toMatchObject({ firstTrigger: "done", attempts: 2 });
  });

  it("a failed first trigger is tried again in the next slot before any later case is pushed; after two failed tries the case is failed-first-trigger and the next follows", async () => {
    const t = fixture(3, { execute: true, plan: firstOnly(3, 1), sim: { fail: { "open:case-902": 1 } } });
    expect(await t.run()).toBe(0);
    expect(t.slots().slice(0, 4)).toEqual(["1:done", "2:failed:open", "3:done", "4:done"]);
    // case-903 is not pushed until case-902's first trigger has succeeded (pushed = branches on the forks at each call)
    expect(t.calls().slice(0, 7).map((c) => `${c.kind}:${c.id}:${c.pushed}`)).toEqual(["open:case-901:0", "trigger:case-901:1", "open:case-902:1", "open:case-902:1", "trigger:case-902:2",
      "open:case-903:2", "trigger:case-903:3"]);
    expect(t.log().filter((r) => r.event === "slot-start").map((r) => [r.slot, r.position])).toEqual([[1, 1], [2, 2], [3, 2], [4, 3]]);
    expect(t.log().some((r) => r.event === "failed-first-trigger")).toBe(false);
    const g = fixture(2, { execute: true, plan: firstOnly(2, 2), sim: { fail: { "open:case-901": 5 } } });
    expect(await g.run()).toBe(0);
    expect(g.slots().slice(0, 4)).toEqual(["1:failed:open", "2:failed:open", "3:done", "4:nothing-to-do"]);
    expect(g.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "open:case-901", "open:case-902", "trigger:case-902"]);
    expect(g.state().positions.map((p: { firstTrigger: string; attempts: number }) => [p.firstTrigger, p.attempts])).toEqual([["failed-first-trigger", 2], ["done", 1]]);
    expect(g.sim().pushed).toEqual(["case-902"]);
    // recorded once, after the second failed slot and before case-902's slot starts
    const failed = g.log().filter((r) => r.event === "failed-first-trigger");
    expect(failed.map((r) => [r.position, r.id, r.tries])).toEqual([[1, "case-901", 2]]);
    expect(g.log().indexOf(failed[0]!)).toBeLessThan(g.log().findIndex((r) => r.event === "slot-start" && r.slot === 3));
    expect(g.said.join("\n")).toMatch(/position 1 \| case-901 \| first trigger \| failed-first-trigger after 2 tries/);
    // the branch list is part of the first trigger: unreadable twice, nothing is posted and the try is spent
    const b = fixture(1, { execute: true, plan: firstOnly(1, 1) });
    b.readFails.n = 2;
    expect(await b.run()).toBe(0);
    expect(b.slots()).toEqual(["1:failed:branches", "2:done"]);
    expect(b.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901"]);
    expect(b.log().filter((r) => r.event === "fork-branches-failed").map((r) => [r.slot, r.attempt])).toEqual([[1, 1], [1, 2]]);
    expect(b.log().filter((r) => r.event === "fork-branches").map((r) => r.slot)).toEqual([2]);
    expect(Date.parse(b.calls()[1]!.at)).toBeGreaterThanOrEqual(Date.parse(at(2)));
  });

  it("a pinned file that changes stops the scheduler before the next slot; a held lock and another run's state dir refuse", async () => {
    const t = fixture(3, { execute: true, plan: firstOnly(3) });
    let n = 0;
    const edit: Io["exec"] = async (a, o) => { if (++n === 3) writeFileSync(t.f("open-prs.ts"), readFileSync(t.f("open-prs.ts"), "utf8") + "// edited\n"); return t.io().exec(a, o); };
    expect(await t.run({ ...t.io(), exec: edit })).toBe(3);
    expect(t.slots()).toEqual(["1:done", "2:done"]);
    expect(t.log().at(-1)).toMatchObject({ event: "stop", reason: "a pinned file changed", file: t.f("open-prs.ts") });
    expect(t.state()).toMatchObject({ stopped: "a pinned file changed", ended: false });
    expect(t.calls()).toHaveLength(4);
    // re-pinned by hand, it goes on from slot 3
    t.pin();
    expect(await t.run()).toBe(0);
    expect(t.calls().slice(4, 6).map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-903", "trigger:case-903"]);
    // --execute without pins, and pins that lack a file
    const p = fixture(1, { execute: true });
    const said: string[] = [];
    expect(await main(p.argv().filter((a) => a !== "--pins" && a !== p.f("pins.json")), { ...p.io(), say: (l) => { said.push(l); } })).toBe(2);
    expect(said.join("\n")).toMatch(/--execute needs --pins/);
    p.json("pins.json", { v: 1, sha256: {} });
    expect(await main(p.argv(), { ...p.io(), say: (l) => { said.push(l); } })).toBe(2);
    expect(said.join("\n")).toMatch(/--pins lacks 9 required file\(s\)/);
    // a live scheduler holds the lock
    const l = fixture(1);
    mkdirSync(l.f("state"), { recursive: true });
    writeFileSync(path.join(l.f("state"), "scheduler.lock"), "4242\n");
    await expect(runScheduler(l.opts(), { ...l.io(), alive: (pid) => pid === 4242 })).rejects.toThrow(/another scheduler \(pid 4242\) holds/);
    expect(existsSync(path.join(l.f("state"), "scheduler.lock"))).toBe(true);
    // a dry run's state dir is not continued by --execute
    const d = fixture(1);
    expect(await d.run()).toBe(0);
    d.pin();
    await expect(runScheduler(parseCli([...d.argv(), "--execute", "--pins", d.f("pins.json")]).o, d.io())).rejects.toThrow(/holds the log of another run/);
  });
});

describe("window-scheduler: inputs and the held-out guard", () => {
  it("refuses held-out without the explicit flag: the side, a held-out path, a ho- id", async () => {
    expect(() => guardSide(undefined, false, [], [])).toThrow(/--side dev\|heldout is required/);
    expect(() => guardSide("heldout", false, [], [])).toThrow(/--side heldout needs --heldout-ok/);
    expect(() => guardSide("dev", true, [], [])).toThrow(/--heldout-ok is only for --side heldout/);
    for (const p of ["/x/tracehound-testset/heldout/manifest.json", "/x/labels/HeldOut/a.json", "/x/tracehound-ho-window/open-prs", "/x/held-out/cases.json", "heldout/x"]) {
      expect(() => guardSide("dev", false, ["/x/dev/ok.json", p], []), p).toThrow(/--side dev refuses a held-out path/);
    }
    expect(() => guardSide("dev", false, ["/x/dev/ok.json", null, undefined], ["case-001", "ho-002"])).toThrow(/refuses 1 case id\(s\) that are not case-NNN/);
    expect(guardSide("dev", false, ["/x/dev/ok.json"], ["case-001"])).toBe("dev");
    // through the command line: nothing is read or run, exit 2
    const t = fixture(2);
    const run = async (argv: string[]) => { const said: string[] = []; const code = await main(argv, { ...t.io(), say: (l) => { said.push(l); } }); return { code, out: said.join("\n") }; };
    const swap = (flag: string, value: string) => t.argv().map((a, i, all) => (all[i - 1] === flag ? value : a));
    expect(await run(swap("--side", "heldout"))).toMatchObject({ code: 2, out: expect.stringMatching(/needs --heldout-ok/) });
    expect(await run(swap("--state-dir", path.join(t.dir, "tracehound-ho-window")))).toMatchObject({ code: 2, out: expect.stringMatching(/refuses a held-out path/) });
    mkdirSync(t.f("heldout"));
    copyFileSync(t.f("manifest.json"), path.join(t.f("heldout"), "manifest.json"));
    expect(await run(swap("--manifest", path.join(t.f("heldout"), "manifest.json")))).toMatchObject({ code: 2, out: expect.stringMatching(/refuses a held-out path/) });
    t.json("cases.json", [{ position: 1, id: "case-901", fork: "SunnyBagal/twenty" }, { position: 2, id: "ho-002", fork: "SunnyBagal/twenty" }]);
    expect(await run(t.argv())).toMatchObject({ code: 2, out: expect.stringMatching(/refuses 1 case id/) });
    expect(t.calls()).toEqual([]);
    expect(existsSync(t.f("state"))).toBe(false);
  });

  it("the plan and the case list are checked before anything runs; --execute has floors; --list prints every slot with its UTC time", async () => {
    const t = fixture(3);
    const out = async (argv: string[]) => { const said: string[] = []; const code = await main(argv, { ...t.io(), say: (l) => { said.push(l); } }); return { code, out: said.join("\n") }; };
    const withPlan = async (over: Record<string, unknown>, ...extra: string[]) => { t.json("plan.json", { ...PLAN, ...over }); return out(t.argv(...extra)); };
    expect((await withPlan({ retriggerFromSlot: 3 })).out).toMatch(/retriggerFromSlot 3 must be after the last first-trigger slot 3/);
    expect((await withPlan({ lastSlot: 2, retriggerFromSlot: 4 })).out).toMatch(/lastSlot 2 is before the last first-trigger slot 3/);
    expect((await withPlan({ t0: "2026-11-20T00:00:00+05:30" })).out).toMatch(/t0 must be a UTC instant/);
    expect((await withPlan({ extra: 1 })).out).toMatch(/unknown field extra/);
    expect((await withPlan({ graceSeconds: 3600 })).out).toMatch(/graceSeconds must be shorter than a slot/);
    expect((await withPlan({ timeoutSeconds: { open: 1 } })).out).toMatch(/timeoutSeconds must be/);
    for (const n of [1, 3]) expect((await withPlan({ firstTriggerAttempts: n })).out).toMatch(/firstTriggerAttempts must be 2 \(Sunny's addendum to 076d/);
    // short slots are for a dry run only
    expect((await withPlan({ slotSeconds: 60, graceSeconds: 30, minTriggerSpacingSeconds: 60 }, "--list")).code).toBe(0);
    for (const [over, want] of [[{ slotSeconds: 60, graceSeconds: 30 }, /slotSeconds 60 is under 3600/], [{ minTriggerSpacingSeconds: 1800 }, /minTriggerSpacingSeconds 1800 is under 3600/],
      [{ retriggerDueSeconds: 3600 }, /retriggerDueSeconds 3600 is under 86400/], [{ graceSeconds: 2400 }, /graceSeconds 2400 is over 1800/]] as const) {
      const r = await withPlan(over, "--execute", "--list");
      expect(r.code).toBe(2);
      expect(r.out).toMatch(want);
    }
    t.json("plan.json", PLAN);
    const list = await out(t.argv("--list"));
    expect(list.code).toBe(0);
    expect(list.out.split("\n").slice(0, 3)).toEqual([`slot 1 | ${at(1)} | first trigger: position 1 case-901 SunnyBagal/twenty (push, open the PR, trigger coderabbit,greptile)`,
      `slot 2 | ${at(2)} | first trigger: position 2 case-902 SunnyBagal/medusa (push, open the PR, trigger coderabbit,greptile)`,
      `slot 3 | ${at(3)} | first trigger: position 3 case-903 SunnyBagal/twenty (push, open the PR, trigger coderabbit,greptile)`]);
    expect(list.out).toMatch(/58 slot\(s\): 3 first-trigger slot\(s\), re-trigger checks from slot 30, last slot 58/);
    expect((await out(t.argv("--status"))).out).toBe('{"status":"not started"}');
    t.json("cases.json", [{ position: 2, id: "case-901", fork: "SunnyBagal/twenty" }]);
    expect((await out(t.argv())).out).toMatch(/row 1 must have position 1/);
    t.json("cases.json", [{ position: 1, id: "case-901", fork: "twentyhq/twenty" }]);
    expect((await out(t.argv())).out).toMatch(/fork must be SunnyBagal/);
    expect(t.calls()).toEqual([]);
  });
});

describe("window-scheduler as a real detached process", () => {
  // codex 076d-r2, P2-R1, through the real fallback: a live process group and a `ps` that fails
  it("recovery with a live command group and an unavailable process list stops (exit 3): nothing cleared, nothing started, nothing killed, until the group is gone", async () => {
    const t = fixture(2, { execute: true, plan: firstOnly(2) });
    // a real process group standing for the cut trigger command (its own session, like every command the scheduler starts)
    const live = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "ignore" });
    const pgid = live.pid!;
    const exited = new Promise((res) => live.on("exit", res));
    const cutRun = t.io((a) => (a.includes("--trigger") && a.includes("case-901") ? "before" : null));
    expect(await t.run({ ...cutRun, exec: async (a, o) => { if (a.includes("--trigger")) o.onPid(pgid); return cutRun.exec(a, o); } })).toBe("killed");
    // a ps that exits 1, first on PATH: realIo.group and realIo.busy cannot list processes
    const bin = t.f("bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "ps"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const PATH = process.env.PATH;
    const real = (): Io => ({ ...t.io(), groupAlive: realIo.groupAlive, group: realIo.group, busy: realIo.busy, killGroup: realIo.killGroup });
    try {
      process.env.PATH = `${bin}${path.delimiter}${PATH}`;
      expect(realIo.group(pgid)).toBeNull();
      expect(realIo.busy(["anything"])).toBeNull();
      expect(realIo.groupAlive(pgid)).toBe(true);
      const before = t.calls().length;
      expect(await t.run(real())).toBe(3);
      expect(t.log().at(-1)).toMatchObject({ event: "stop", reason: "a cut command's process group is alive and its processes cannot be listed or identified", pid: pgid, evidence: "unknown", killed: false });
      expect(t.log().some((r) => r.event === "step-cleared")).toBe(false);
      expect(t.log().filter((r) => r.event === "step-start")).toHaveLength(2); // open and the cut trigger; none after
      expect(t.calls()).toHaveLength(before);
      expect(t.sim().comments).toEqual({});
      expect(realIo.groupAlive(pgid)).toBe(true); // and it was not killed
      // a second start changes nothing while the evidence is still missing
      expect(await t.run(real())).toBe(3);
      expect(t.calls()).toHaveLength(before);
    } finally {
      process.env.PATH = PATH;
    }
    // the operator looks, the process ends, the process list is back: the group is gone, so the step is cleared and the run goes on
    process.kill(-pgid, "SIGKILL");
    await exited;
    expect(realIo.groupAlive(pgid)).toBe(false);
    expect(await t.run(real())).toBe(0);
    expect(t.log().filter((r) => r.event === "step-cleared").map((r) => [r.step, r.pid, r.killed])).toEqual([["trigger", pgid, false]]);
    expect(t.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901", "open:case-902", "trigger:case-902"]);
  }, 30_000);

  // codex 076d review, P2-S3: the timeout ends the whole command, not only the script
  it("a command's timeout kills its whole process group: a grandchild started by the command writes nothing afterwards", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "window-sched-timeout-"));
    const marker = path.join(dir, "late-write"), script = path.join(dir, "command.mjs");
    // the command starts a child of its own (as open-prs.ts starts gh) that would write 1.5 s later, and hangs
    writeFileSync(script, `import { spawn } from "node:child_process";
spawn(process.execPath, ["-e", 'setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "late"), 1500)', ${JSON.stringify(marker)}], { stdio: "ignore" });
setTimeout(() => {}, 60000);
`);
    let pid = 0;
    const r = await realIo.exec([process.execPath, script], { outFile: path.join(dir, "out.txt"), timeoutMs: 400, onPid: (p) => { pid = p; } });
    expect(r).toMatchObject({ timedOut: true, cleaned: true, signal: "SIGKILL" });
    expect(pid).toBeGreaterThan(0);
    expect(realIo.groupAlive(pid)).toBe(false);
    expect(realIo.group(pid)).toEqual([]);
    await new Promise((res) => setTimeout(res, 2500));
    expect(existsSync(marker)).toBe(false);
    // a command that ends by itself is not touched
    writeFileSync(script, "process.exitCode = 7;\n");
    expect(await realIo.exec([process.execPath, script], { outFile: path.join(dir, "out2.txt"), timeoutMs: 10_000, onPid: () => {} })).toEqual({ exit: 7, signal: null, timedOut: false, cleaned: true });
  }, 30_000);

  it("SIGKILL in the middle of a slot, then a restart: the cut command is left to finish, nothing is repeated, the slot completes", async () => {
    // slot 1 is 2 s away; the stand-in's trigger takes 2.5 s to post, and the scheduler is killed while it runs
    const t0 = new Date(Date.now() - H + 2000).toISOString();
    const t = fixture(1, { execute: true, plan: { t0, retriggerFromSlot: 2, lastSlot: 1 }, sim: { sleepMs: { "trigger:case-901": 2500 } } });
    t.pin();
    // the scheduler's own read of the fork's branches goes to this stand-in, never to a real gh
    writeFileSync(t.f("gh"), `#!/bin/sh\necho "$@" >> "$(dirname "$0")/gh-calls.txt"\nprintf '%s' '[{"name":"cases/case-901","commit":{"sha":"${"1".repeat(40)}"}},{"name":"main","commit":{"sha":"${"2".repeat(40)}"}}]'\n`, { mode: 0o755 });
    const launchers: number[] = [process.pid];
    const start = () => { const r = spawnSync(process.execPath, [SCRIPT, ...t.argv("--gh-bin", t.f("gh")), "--detach"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
      expect(r.status, r.stdout + r.stderr).toBe(0); launchers.push(r.pid); return Number(/started detached: pid (\d+)/.exec(r.stdout)![1]); };
    const until = async (what: string, ok: () => boolean, ms = 20_000) => { const end = Date.now() + ms; while (!ok()) { if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 50)); } };
    const logOr = (): Rec[] => (existsSync(path.join(t.f("state"), "scheduler.log.jsonl")) ? t.log() : []);
    const pid1 = start();
    await until("the trigger step to start", () => logOr().some((r) => r.event === "step-start" && r.step === "trigger"));
    process.kill(pid1, "SIGKILL");
    await until("the first scheduler to be gone", () => { try { process.kill(pid1, 0); return false; } catch { return true; } });
    expect(t.log().some((r) => r.event === "step-end" && r.step === "trigger")).toBe(false);
    const pid2 = start();
    expect(pid2).not.toBe(pid1);
    await until("the restarted scheduler to finish", () => existsSync(path.join(t.f("state"), "scheduler.done")));
    const log = t.log();
    const boots = log.filter((r) => r.event === "boot");
    expect(boots.map((b) => b.pid)).toEqual([pid1, pid2]);
    // detached: its own process group (session leader), and by the first command its parent is neither this test nor
    // the launcher that started it (on macOS: pid 1)
    for (const b of boots) expect(b.pgid).toBe(b.pid);
    for (const r of log.filter((x) => x.event === "step-start")) {
      expect(launchers).not.toContain(r.ppid);
      if (process.platform === "darwin") expect(r.ppid).toBe(1);
    }
    // the cut trigger command had ended before the step ran again: its last record is older than the second trigger call
    // (under load it may already be gone when the restart looks, so a step-wait record is not required)
    const lastPost = Math.max(...readFileSync(path.join(t.f("resume"), "twenty.resume.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => String(r.step).startsWith("triggered:")).map((r) => Date.parse(r.at)));
    expect(Date.parse(t.calls()[2]!.at)).toBeGreaterThanOrEqual(lastPost);
    expect(log.filter((r) => r.event === "step-cleared").map((r) => [r.step, r.killed])).toEqual([["trigger", false]]);
    const waited = log.findIndex((r) => r.event === "step-wait" && r.step === "trigger");
    if (waited >= 0) expect(waited).toBeLessThan(log.findIndex((r) => r.event === "step-cleared"));
    expect(log.filter((r) => r.event === "step-start").map((r) => r.step)).toEqual(["open", "trigger", "trigger"]);
    expect(log.filter((r) => r.event === "step-end").map((r) => [r.step, r.exit])).toEqual([["open", 0], ["trigger", 0]]);
    expect(log.filter((r) => r.event === "slot-start")).toHaveLength(1);
    expect(log.filter((r) => r.event === "slot-end").map((r) => r.outcome)).toEqual(["done"]);
    expect(t.calls().map((c) => c.kind)).toEqual(["open", "trigger", "trigger"]);
    expect(t.sim()).toMatchObject({ pushed: ["case-901"], prs: { "case-901": 1 }, comments: { "case-901": { coderabbit: 1, greptile: 1 } } });
    // the branches were read (GET only) and logged before the trigger command, each time it was started
    expect(log.filter((r) => r.event === "fork-branches").map((r) => [r.before, (r.branches as { name: string }[]).map((b) => b.name)])).toEqual([["trigger", ["cases/case-901", "main"]], ["trigger", ["cases/case-901", "main"]]]);
    expect(readFileSync(t.f("gh-calls.txt"), "utf8").trim().split("\n")).toEqual(Array(2).fill("api --method GET repos/SunnyBagal/twenty/branches?per_page=100&page=1"));
    expect(existsSync(path.join(t.f("state"), "scheduler.lock"))).toBe(false);
    expect(readFileSync(path.join(t.f("state"), "scheduler.out"), "utf8")).toMatch(/\| slot 1 \| position 1 \| case-901 \| slot \| resumed: first/);
  }, 60_000);
});

describe("tools.s1.json (decision 076e item 1, addendum b): S1's starting tools file", () => {
  const TOOLS_S1 = path.resolve(import.meta.dirname, "../../../scripts/testset/tools.s1.json");
  /** S1 as 076e item 1 runs it: two dev cases on one fork, one hourly slot each, re-triggers off (retriggerFromSlot after lastSlot), H1's timeouts. */
  const S1_PLAN = { slotSeconds: 3600, firstSlot: 0, retriggerFromSlot: 2, lastSlot: 1, retriggerDueSeconds: 86_400, graceSeconds: 1800,
    minTriggerSpacingSeconds: 3600, firstTriggerAttempts: 2, timeoutSeconds: { open: 600, trigger: 300, collect: 300, retrigger: 300 } };

  it("is the merged scheduler's tools schema with both tools on, in trigger order, and no held-out details", () => {
    const raw = readFileSync(TOOLS_S1, "utf8");
    expect(JSON.parse(raw)).toEqual({ v: 1, tools: { coderabbit: { logins: [], notCompletion: [] }, greptile: { logins: [], notCompletion: [] } } });
    expect(readTools(TOOLS_S1)).toEqual(["coderabbit", "greptile"]);
    expect(raw).not.toMatch(/held-?out|ho-\d|case-\d|SunnyBagal/i);
  });

  it("the plan and config readers accept it with S1's two dev cases; a dry run opens and triggers both tools on both, and nothing else", async () => {
    const t = fixture(2, { plan: S1_PLAN });
    copyFileSync(TOOLS_S1, t.f("tools.json"));
    t.json("cases.json", [{ position: 1, id: "case-901", fork: "SunnyBagal/medusa" }, { position: 2, id: "case-902", fork: "SunnyBagal/medusa" }]);
    const { o, mode } = parseCli(t.argv("--list"));
    expect(mode).toBe("list");
    expect(o.execute).toBe(false);
    expect(o.tools).toEqual(["coderabbit", "greptile"]);
    expect(o.plan).toMatchObject({ firstSlot: 0, retriggerFromSlot: 2, lastSlot: 1 });
    expect(await t.run()).toBe(0);
    expect(t.calls().map((c) => `${c.kind}:${c.id}:${c.execute}`)).toEqual(["open:case-901:false", "trigger:case-901:false", "open:case-902:false", "trigger:case-902:false"]);
    for (const c of t.calls().filter((x) => x.kind === "trigger")) expect(c.argv).toEqual(expect.arrayContaining(["--trigger", "coderabbit,greptile"]));
    expect(t.slots()).toEqual(["0:done", "1:done"]); // slot 1 is the last; no re-trigger slot follows
    expect(t.sim()).toMatchObject({ pushed: [], prs: {}, comments: {} });
    expect(t.reads).toEqual([]);
  });

  it("re-triggers stay off even if the plan had room: the collector refuses a tools file with no logins, so no re-trigger check can pass", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "tools-s1-"));
    const lines: string[] = [];
    for (const tool of ["coderabbit", "greptile"]) {
      expect(collectMain(["--side", "dev", "--tool", tool, "--config", TOOLS_S1, "--repo", "SunnyBagal/medusa", "--manifest", path.join(dir, "m.json"),
        "--pr-map", path.join(dir, "p.json"), "--out", path.join(dir, "out"), "--window-start", "2026-11-20T00:00:00Z", "--window-end", "2026-11-21T00:00:00Z",
        "--resume-file", path.join(dir, "r.jsonl")], { log: (l) => lines.push(l) })).toBe(2);
    }
    expect(lines.join("\n")).toMatch(/no login list for coderabbit[\s\S]*no login list for greptile/);
  });
});
