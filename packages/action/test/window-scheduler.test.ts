/**
 * scripts/testset/window-scheduler.ts (decision 076c item 11, 076d items 1c and 3). Dev fixtures only: the "fork" is
 * fixtures/scheduler-sim.ts (a stand-in for open-prs.ts and the collector; no network, no git, no gh). Most tests run
 * the scheduler in-process on a fake clock; the last one starts it detached as a real process, kills it in the middle
 * of a slot and starts it again.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guardSide, main, parseCli, pinnedPaths, runScheduler, type Io, type Opts } from "../../../scripts/testset/window-scheduler.ts";
import { simulate } from "./fixtures/scheduler-sim.ts";

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
  let boot = 0;
  /** `die`: the scheduler process is killed at the first command for which it returns "before" (nothing ran) or "after" (the command ran, its end was never logged). */
  const io = (die: (argv: string[]) => "before" | "after" | null = () => null, seconds: (argv: string[]) => number = () => 5): Io => {
    const pid = 5000 + ++boot;
    return { now: () => clock.t, sleep: async (ms) => { clock.t += ms; }, busy: () => false, alive: () => false, ident: () => ({ pid, ppid: 1, pgid: pid }), say: (l) => { said.push(l); },
      exec: async (a, { outFile }) => {
        const how = die(a);
        if (how === "before") throw new Killed();
        clock.t += seconds(a) * 1000;
        const exit = simulate(a.slice(2), { dir, now: () => clock.t });
        writeFileSync(outFile, "");
        if (how === "after") throw new Killed();
        return { exit, signal: null, timedOut: false };
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
  return { dir, f, json, cases, argv, pin, io, run, log, calls, sim, state, slots, said, clock, opts };
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
    // never two triggers of a tool inside one hour
    const trig = t.log().filter((r) => r.event === "step-start" && (r.step === "trigger" || String(r.step).startsWith("retrigger:coderabbit"))).map((r) => Date.parse(r.at));
    for (let i = 1; i < trig.length; i++) expect(trig[i]! - trig[i - 1]!).toBeGreaterThanOrEqual(H);
    expect(t.log().filter((r) => r.event === "spacing-wait").map((r) => [r.slot, r.seconds])).toEqual([[2, 15], [3, 15]]);
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

  it("killed in the middle of a step that had already posted: the step runs again, and nothing is pushed, opened or posted twice", async () => {
    const t = fixture(1, { execute: true, plan: firstOnly(1) });
    expect(await t.run(t.io((a) => (a.includes("--trigger") ? "after" : null)))).toBe("killed");
    expect(t.sim().comments).toEqual({ "case-901": { coderabbit: 1, greptile: 1 } });
    expect(t.log().filter((r) => r.event === "step-start" && r.step === "trigger")).toHaveLength(1);
    expect(t.log().filter((r) => r.event === "step-end" && r.step === "trigger")).toHaveLength(0);
    expect(await t.run()).toBe(0);
    expect(t.calls().map((c) => c.kind)).toEqual(["open", "trigger", "trigger"]);
    expect(t.sim()).toMatchObject({ pushed: ["case-901"], prs: { "case-901": 1 }, comments: { "case-901": { coderabbit: 1, greptile: 1 } } });
    const records = readFileSync(path.join(t.f("resume"), "twenty.resume.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).step);
    expect(records).toEqual(["pushed", "pr-created", "triggered:coderabbit", "triggered:greptile"]);
  });

  it("a slot that comes up more than the grace late is not fired late; its case takes the next free slot, one first trigger per slot", async () => {
    // the scheduler is down from before slot 1 until 31 minutes after it
    const t = fixture(3, { execute: true, plan: firstOnly(3, 1), startAt: Date.parse(T0) + H + 31 * 60_000 });
    expect(await t.run()).toBe(0);
    expect(t.slots().slice(0, 4)).toEqual(["1:missed", "2:done", "3:done", "4:done"]);
    expect(t.log().filter((r) => r.event === "slot-start").slice(0, 3).map((r) => [r.slot, r.position])).toEqual([[2, 2], [3, 3], [4, 1]]);
    expect(t.calls().filter((c) => c.kind === "open").map((c) => [c.id, c.at])).toEqual([["case-902", at(2, 5)], ["case-903", at(3, 5)], ["case-901", at(4, 5)]]);
    expect(t.state()).toMatchObject({ missed: 1 });
    // killed mid-slot and back after the grace: the slot is closed as interrupted, the case is finished in a free slot
    const k = fixture(2, { execute: true, plan: firstOnly(2, 1) });
    expect(await k.run(k.io((a) => (a.includes("--trigger") && a.includes("case-901") ? "before" : null)))).toBe("killed");
    k.clock.t += 40 * 60_000;
    expect(await k.run()).toBe(0);
    expect(k.slots().slice(0, 3)).toEqual(["1:interrupted-late", "2:done", "3:done"]);
    expect(k.calls().map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "open:case-902", "trigger:case-902", "trigger:case-901"]);
    expect(k.state().positions[0]).toMatchObject({ firstTrigger: "done", attempts: 2 });
  });

  it("a failed step ends the slot (no trigger after a failed push); one more slot is tried, then the case is given up and the window goes on", async () => {
    const t = fixture(3, { execute: true, plan: firstOnly(3, 1), sim: { fail: { "open:case-902": 1 } } });
    expect(await t.run()).toBe(0);
    expect(t.slots().slice(0, 4)).toEqual(["1:done", "2:failed:open", "3:done", "4:done"]);
    expect(t.calls().slice(0, 7).map((c) => `${c.kind}:${c.id}`)).toEqual(["open:case-901", "trigger:case-901", "open:case-902", "open:case-903", "trigger:case-903", "open:case-902", "trigger:case-902"]);
    const g = fixture(2, { execute: true, plan: firstOnly(2, 2), sim: { fail: { "open:case-901": 5 } } });
    expect(await g.run()).toBe(0);
    expect(g.slots().slice(0, 4)).toEqual(["1:failed:open", "2:done", "3:failed:open", "4:nothing-to-do"]);
    expect(g.calls().filter((c) => c.id === "case-901")).toHaveLength(2);
    expect(g.state().positions.map((p: { firstTrigger: string }) => p.firstTrigger)).toEqual(["gave-up", "done"]);
    expect(g.sim().pushed).toEqual(["case-902"]);
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
  it("SIGKILL in the middle of a slot, then a restart: the cut command is left to finish, nothing is repeated, the slot completes", async () => {
    // slot 1 is 2 s away; the stand-in's trigger takes 2.5 s to post, and the scheduler is killed while it runs
    const t0 = new Date(Date.now() - H + 2000).toISOString();
    const t = fixture(1, { execute: true, plan: { t0, retriggerFromSlot: 2, lastSlot: 1 }, sim: { sleepMs: { "trigger:case-901": 2500 } } });
    t.pin();
    const launchers: number[] = [process.pid];
    const start = () => { const r = spawnSync(process.execPath, [SCRIPT, ...t.argv(), "--detach"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
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
    // the cut trigger command was left to finish before the step ran again
    expect(log.some((r) => r.event === "step-wait" && r.step === "trigger")).toBe(true);
    expect(log.filter((r) => r.event === "step-start").map((r) => r.step)).toEqual(["open", "trigger", "trigger"]);
    expect(log.filter((r) => r.event === "step-end").map((r) => [r.step, r.exit])).toEqual([["open", 0], ["trigger", 0]]);
    expect(log.filter((r) => r.event === "slot-start")).toHaveLength(1);
    expect(log.filter((r) => r.event === "slot-end").map((r) => r.outcome)).toEqual(["done"]);
    expect(t.calls().map((c) => c.kind)).toEqual(["open", "trigger", "trigger"]);
    expect(t.sim()).toMatchObject({ pushed: ["case-901"], prs: { "case-901": 1 }, comments: { "case-901": { coderabbit: 1, greptile: 1 } } });
    expect(existsSync(path.join(t.f("state"), "scheduler.lock"))).toBe(false);
    expect(readFileSync(path.join(t.f("state"), "scheduler.out"), "utf8")).toMatch(/\| slot 1 \| position 1 \| case-901 \| slot \| resumed: first/);
  }, 60_000);
});
