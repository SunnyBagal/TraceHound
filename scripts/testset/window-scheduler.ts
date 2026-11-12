#!/usr/bin/env node
/**
 * window-scheduler.ts: the clock of a trigger window (decision 076c item 11, 076d items 1c and 3; H1 "Who keeps the clock").
 * One slot per grid step. In its slot a case's branch is pushed and its PR opened (never earlier: 076d 1c), then the
 * review tools are triggered; after the first triggers, each slot serves one PR's re-trigger check (076b item 2, 076c
 * items 2 and 3). The scheduler only keeps time and order: every GitHub action is a call of tracehound-testset
 * scripts/open-prs.ts, and "no completed review" is the verdict of scripts/testset/collect-tool-reviews.ts.
 *
 *   node scripts/testset/window-scheduler.ts --side dev --cases <json> --plan <json> --tools <tools.json>
 *     --manifest <cases manifest> --clones <dir with one clone per fork name> --resume-dir <dir> --state-dir <dir>
 *     --open-prs <tracehound-testset/scripts/open-prs.ts> --collector <scripts/testset/collect-tool-reviews.ts>
 *     [--pins <json>] [--execute] [--detach] [--list | --status | --print-pins] [--gh-bin gh] [--git-bin git] [--heldout-ok]
 *
 * Inputs, all passed at run time:
 * - --cases: the ordered case list, `[{position: 1.., id, fork: "SunnyBagal/<name>"}]`. Position p owns slot
 *   firstSlot + p − 1; the order is whatever the list says (076d 1c: base-date order), the scheduler never reorders.
 * - --plan: `{v: 1, t0: "<UTC instant>", slotSeconds, firstSlot, retriggerFromSlot, lastSlot, retriggerDueSeconds,
 *   graceSeconds, minTriggerSpacingSeconds, firstTriggerAttempts, timeoutSeconds: {open, trigger, collect, retrigger}}`.
 *   Every field is required. Slot k is planned at t0 + k × slotSeconds: absolute times from one start time, never "an
 *   hour after the last slot".
 * - --tools: the collector's tools.json; its tool names, in file order, are the tools triggered.
 *
 * A slot does one thing (the first that applies):
 * 1. the first trigger of the position that owns the slot: `open-prs.ts --ids <id>` (push the two case refs, open the
 *    PR), then `open-prs.ts --trigger <tools> --ids <id>`;
 * 2. the first trigger of the lowest position whose own slot was missed or failed (H1 failures 1 and 7: "the next free
 *    slot"), at most plan.firstTriggerAttempts slots per position;
 * 3. from plan.retriggerFromSlot, and only when no first trigger is pending: the re-trigger check of the lowest due
 *    position (every triggered tool's first `triggered:<tool>` record is retriggerDueSeconds old). Per tool: collect
 *    (`--window-start t0 --window-end now --resume-file …`, into <state>/check/), then `completed` and
 *    `invalid-binding` end that tool for the PR, `no-review` posts `open-prs.ts --retrigger <tool> --status …`. A
 *    collection that cannot be read is tried once more; if it fails again the slot passes and the PR is first at the
 *    next slot. If no tool needed a re-trigger the same slot goes on to the next due position.
 * A slot starts only within graceSeconds of its planned time; later it is `missed` and nothing is fired late.
 * Spacing: a command that posts a tool's trigger on a PR is never started sooner than minTriggerSpacingSeconds after
 * the END of the last such command on another PR (its logged end; for a command that was cut, the moment its processes
 * were seen gone). A post lies between a command's start and its end, so two posts of one tool on two PRs are at least
 * that far apart, whatever each command spends on its checks first. In a re-trigger check the wait comes before the
 * collection, so the verdict a re-trigger is posted from is never older than the collection and the post themselves.
 *
 * Properties (H1): dry run by default (open-prs.ts is called without --execute; the re-trigger check is listed, not
 * run); `--detach` restarts the scheduler as a session leader detached from the caller, and every start writes pid,
 * parent pid and process group to the log and the state file; a lock file allows one copy per state dir; the log
 * (<state>/scheduler.log.jsonl, one fsynced JSON line per action with its UTC time, planned time and delay) is the
 * source of truth, and a restarted scheduler replays it: a step that ended with exit 0 is never run again, a step that
 * was cut is run again only after no process of it is left (open-prs.ts itself never pushes, opens or triggers twice).
 * Every command runs in its own process group, whose id is logged; "no process left" means that whole group (the script
 * and every gh or git it started). A command that reaches its timeout has its whole group killed, and the scheduler
 * goes on only once the group is seen gone; if that cannot be established it stops (exit 3) rather than risk a retry
 * that overlaps a late write;
 * before every slot the sha256 of every pinned file (--pins; required with --execute) is compared and a difference
 * stops the scheduler; every command has a timeout; the state file is rewritten after every slot.
 * Held-out: `--side heldout` needs --heldout-ok (never passed by tuning agents). On `--side dev` any path that names
 * held-out and any `ho-` case id is refused before anything is read.
 * Exit codes: 0 finished (or listed), 2 refused, 3 stopped (a pinned file changed, or a command's processes could not be
 * confirmed ended).
 * stdout: one line per action (UTC time, slot, position, case id, step, result); never a title or a comment text. The
 * commands' own output goes to <state>/steps/.
 */
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { RefusalError, resolveLinks, sha256 } from "./kit.ts";

const FORK_RE = /^SunnyBagal\/[A-Za-z0-9._-]+$/;
const ID_RE = /^(case|ho)-\d{3}$/;
const TOOL_RE = /^[a-z0-9-]+$/;
/** H1: a slot late by more than 30 minutes is failure 7; CodeRabbit is planned at one review per hour (076 S0.4). */
export const EXECUTE_MIN = { slotSeconds: 3600, minTriggerSpacingSeconds: 3600, retriggerDueSeconds: 86_400 };
export const EXECUTE_MAX_GRACE_SECONDS = 1800;
const ENV_ALLOW = ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR", "XDG_CONFIG_HOME"];

export interface CaseRow { position: number; id: string; fork: string }
export interface Plan {
  v: 1; t0: string; slotSeconds: number; firstSlot: number; retriggerFromSlot: number; lastSlot: number;
  retriggerDueSeconds: number; graceSeconds: number; minTriggerSpacingSeconds: number; firstTriggerAttempts: number;
  timeoutSeconds: { open: number; trigger: number; collect: number; retrigger: number };
}
export interface Opts {
  side: "dev" | "heldout"; heldoutOk: boolean; execute: boolean;
  cases: CaseRow[]; plan: Plan; tools: string[];
  files: { cases: string; plan: string; tools: string; manifest: string; openPrs: string; collector: string; pins: string | null };
  clones: string; resumeDir: string; stateDir: string; node: string; ghBin: string | null; gitBin: string | null;
}
/** `cleaned` is false only when a timed-out command's process group could not be confirmed ended. */
export interface StepResult { exit: number | null; signal: string | null; timedOut: boolean; cleaned: boolean }
/** Effects, replaced in tests: the clock, the commands, and what the process table says. */
export interface Io {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Runs one command in its own process group (`onPid` gets the group's id); at the timeout the whole group is killed. */
  exec(argv: string[], o: { outFile: string; timeoutMs: number; onPid: (pid: number) => void }): Promise<StepResult>;
  /** true while a process whose command line holds every needle is running (a command cut off by a kill may still run) */
  busy(needles: string[]): boolean;
  /** command lines of the live processes in a process group */
  group(pgid: number): string[];
  killGroup(pgid: number): void;
  alive(pid: number): boolean;
  ident(): { pid: number; ppid: number; pgid: number | null };
  say(line: string): void;
}
type Rec = { at: string; event: string } & Record<string, unknown>;
class Stop extends Error {}

// ---- guards and inputs -----------------------------------------------------------------------------------------------

/** A path names held-out if any segment (as given, resolved, or behind symlinks) says so. */
function namesHeldout(p: string): boolean {
  const hit = (x: string) => x.split(path.sep).some((s) => /held-?out/i.test(s) || /^tracehound-ho(-|$)/i.test(s));
  return hit(p) || hit(path.resolve(p)) || hit(resolveLinks(p));
}

/** `--side heldout` needs the explicit flag; `--side dev` refuses every held-out path and every `ho-` id. */
export function guardSide(side: string | undefined, heldoutOk: boolean, paths: (string | null | undefined)[], ids: string[]): "dev" | "heldout" {
  if (side !== "dev" && side !== "heldout") throw new RefusalError("--side dev|heldout is required");
  if (side === "heldout") {
    if (!heldoutOk) throw new RefusalError("--side heldout needs --heldout-ok (never passed by tuning agents)");
    return side;
  }
  if (heldoutOk) throw new RefusalError("--heldout-ok is only for --side heldout");
  for (const p of paths) if (p && namesHeldout(p)) throw new RefusalError(`--side dev refuses a held-out path: ${p}`);
  const ho = ids.filter((id) => !/^case-\d{3}$/.test(id)).length;
  if (ho) throw new RefusalError(`--side dev refuses ${ho} case id(s) that are not case-NNN (held-out ids need --side heldout --heldout-ok)`);
  return side;
}

const isInt = (x: unknown, min: number): x is number => Number.isSafeInteger(x) && (x as number) >= min;

export function readPlan(file: string, nCases: number, execute: boolean): Plan {
  const p = JSON.parse(fs.readFileSync(file, "utf8")) as Plan;
  const bad = (why: string): never => { throw new RefusalError(`--plan: ${why}`); };
  if (!p || p.v !== 1) bad("not a plan file (v1)");
  const known = ["v", "t0", "slotSeconds", "firstSlot", "retriggerFromSlot", "lastSlot", "retriggerDueSeconds", "graceSeconds", "minTriggerSpacingSeconds", "firstTriggerAttempts", "timeoutSeconds"];
  for (const k of Object.keys(p)) if (!known.includes(k)) bad(`unknown field ${k}`);
  if (typeof p.t0 !== "string" || !/Z$/.test(p.t0) || !Number.isFinite(Date.parse(p.t0))) bad("t0 must be a UTC instant (…Z)");
  for (const k of ["slotSeconds", "retriggerDueSeconds", "minTriggerSpacingSeconds", "firstTriggerAttempts"] as const) if (!isInt(p[k], 1)) bad(`${k} must be a whole number ≥ 1`);
  for (const k of ["firstSlot", "graceSeconds"] as const) if (!isInt(p[k], 0)) bad(`${k} must be a whole number ≥ 0`);
  if (!isInt(p.retriggerFromSlot, 0) || !isInt(p.lastSlot, 0)) bad("retriggerFromSlot and lastSlot must be whole numbers");
  const t = p.timeoutSeconds;
  if (!t || typeof t !== "object" || Object.keys(t).sort().join() !== "collect,open,retrigger,trigger" || !Object.values(t).every((x) => isInt(x, 1))) {
    bad("timeoutSeconds must be {open, trigger, collect, retrigger}, whole seconds ≥ 1");
  }
  const lastOwn = p.firstSlot + nCases - 1;
  if (p.retriggerFromSlot <= lastOwn) bad(`retriggerFromSlot ${p.retriggerFromSlot} must be after the last first-trigger slot ${lastOwn} (first triggers go before re-triggers, 076b item 2)`);
  if (p.lastSlot < lastOwn) bad(`lastSlot ${p.lastSlot} is before the last first-trigger slot ${lastOwn}`);
  if (p.graceSeconds >= p.slotSeconds) bad("graceSeconds must be shorter than a slot");
  if (execute) {
    for (const [k, min] of Object.entries(EXECUTE_MIN) as [keyof typeof EXECUTE_MIN, number][]) if (p[k] < min) bad(`${k} ${p[k]} is under ${min}, the least --execute allows`);
    if (p.graceSeconds > EXECUTE_MAX_GRACE_SECONDS) bad(`graceSeconds ${p.graceSeconds} is over ${EXECUTE_MAX_GRACE_SECONDS}, the most --execute allows`);
  }
  return p;
}

export function readCases(file: string): CaseRow[] {
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as CaseRow[];
  if (!Array.isArray(rows) || !rows.length) throw new RefusalError("--cases must be a non-empty JSON list of {position, id, fork}");
  rows.forEach((r, i) => {
    if (!r || r.position !== i + 1) throw new RefusalError(`--cases: row ${i + 1} must have position ${i + 1} (the list is the order)`);
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) throw new RefusalError(`--cases: row ${i + 1} has a bad id`);
    if (typeof r.fork !== "string" || !FORK_RE.test(r.fork)) throw new RefusalError(`--cases: row ${i + 1}: fork must be SunnyBagal/<name>`);
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new RefusalError("--cases names a case twice");
  return rows.map((r) => ({ position: r.position, id: r.id, fork: r.fork }));
}

export function readTools(file: string): string[] {
  const c = JSON.parse(fs.readFileSync(file, "utf8")) as { v?: unknown; tools?: Record<string, unknown> };
  const names = c?.v === 1 && c.tools && typeof c.tools === "object" ? Object.keys(c.tools) : [];
  if (!names.length || names.some((n) => !TOOL_RE.test(n))) throw new RefusalError("--tools must be a tools.json (v1) with at least one lower-case tool name");
  return names;
}

const forkName = (fork: string) => fork.slice("SunnyBagal/".length);
const resumeFile = (o: Opts, fork: string) => path.join(o.resumeDir, `${forkName(fork)}.resume.jsonl`);
const SELF = fileURLToPath(import.meta.url);
/** Every file whose change must stop the window: the code that runs and the frozen inputs. */
export function pinnedPaths(o: Opts): string[] {
  return [SELF, path.join(path.dirname(SELF), "kit.ts"), o.files.openPrs, o.files.collector, path.join(path.dirname(o.files.collector), "kit.ts"),
    o.files.manifest, o.files.tools, o.files.cases, o.files.plan].filter((p, i, a) => a.indexOf(p) === i);
}
const fileSha = (p: string) => sha256(fs.readFileSync(p));

function readPins(o: Opts): Map<string, string> | null {
  if (!o.files.pins) {
    if (o.execute) throw new RefusalError("--execute needs --pins <json> (the sha256 of every script and input; --print-pins writes it)");
    return null;
  }
  const j = JSON.parse(fs.readFileSync(o.files.pins, "utf8")) as { v?: unknown; sha256?: Record<string, unknown> };
  if (j?.v !== 1 || !j.sha256 || typeof j.sha256 !== "object") throw new RefusalError("--pins must be {v: 1, sha256: {<absolute path>: <hex>}}");
  const pins = new Map(Object.entries(j.sha256).map(([k, v]) => [k, String(v)]));
  const missing = pinnedPaths(o).filter((p) => !pins.has(p));
  if (missing.length) throw new RefusalError(`--pins lacks ${missing.length} required file(s): ${missing.join(", ")}`);
  return pins;
}

// ---- the open-prs resume file (read only) --------------------------------------------------------------------------------

interface ResumeInfo { pr: number | null; triggered: Map<string, number>; retriggered: Set<string> }
/** PR number, each tool's first `triggered:<tool>` time and its `retriggered:<tool>` records, by case id. A torn last line is ignored. */
export function readResume(file: string): Map<string, ResumeInfo> {
  const out = new Map<string, ResumeInfo>();
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let r: { id?: unknown; step?: unknown; at?: unknown; number?: unknown };
    try { r = JSON.parse(line); } catch { if (i === lines.length - 1) return; throw new RefusalError(`${file}: line ${i + 1} is not JSON`); }
    if (typeof r.id !== "string" || typeof r.step !== "string") return;
    const d = out.get(r.id) ?? { pr: null, triggered: new Map<string, number>(), retriggered: new Set<string>() };
    if (r.step === "pr-created" && typeof r.number === "number") d.pr = r.number;
    else if (r.step.startsWith("triggered:")) {
      const tool = r.step.slice("triggered:".length), at = typeof r.at === "string" ? Date.parse(r.at) : NaN;
      if (Number.isFinite(at) && (!d.triggered.has(tool) || at < d.triggered.get(tool)!)) d.triggered.set(tool, at);
    } else if (r.step.startsWith("retriggered:")) d.retriggered.add(r.step.slice("retriggered:".length));
    out.set(r.id, d);
  });
  return out;
}

// ---- the log and what it says ------------------------------------------------------------------------------------------

interface SlotState { plannedAt: string; startedAt: string; action: "first" | "retrigger" | "idle"; position: number | null; ended: boolean; outcome: string | null; delaySeconds: number }
interface FirstState { attempts: number; openDone: boolean; triggerDone: boolean }
export interface State {
  boots: { at: string; pid: number; ppid: number; pgid: number | null }[];
  binding: Record<string, unknown> | null;
  slots: Map<number, SlotState>;
  first: Map<number, FirstState>;
  handled: Map<number, Map<string, string>>;
  /** per tool, per position: when its last trigger or re-trigger command ended (logged end, or seen gone after a cut) */
  triggerEnd: Map<string, Map<number, number>>;
  /** a command with a start and no confirmed end: cut by a kill, or timed out without its group confirmed gone */
  cut: { n: number; slot: number; position: number; step: string; at: string; timeoutSeconds: number; needles: string[]; pid: number | null } | null;
  resumeSha: Map<string, string>;
  steps: number; ended: boolean; stopped: string | null;
}

export function replay(recs: Rec[], tools: string[]): State {
  const s: State = { boots: [], binding: null, slots: new Map(), first: new Map(), handled: new Map(), triggerEnd: new Map(), cut: null, resumeSha: new Map(), steps: 0, ended: false, stopped: null };
  const first = (p: number) => { if (!s.first.has(p)) s.first.set(p, { attempts: 0, openDone: false, triggerDone: false }); return s.first.get(p)!; };
  for (const r of recs) {
    if (r.event === "boot") { s.boots.push({ at: r.at, pid: r.pid as number, ppid: r.ppid as number, pgid: r.pgid as number | null }); s.binding ??= r.binding as Record<string, unknown>; s.stopped = null; }
    else if (r.event === "slot-start") {
      s.slots.set(r.slot as number, { plannedAt: r.plannedAt as string, startedAt: r.at, action: r.action as SlotState["action"], position: (r.position as number | null) ?? null, ended: false, outcome: null, delaySeconds: r.delaySeconds as number });
      if (r.action === "first") first(r.position as number).attempts++;
    } else if (r.event === "slot-end") {
      const slot = s.slots.get(r.slot as number) ?? { plannedAt: r.plannedAt as string, startedAt: r.at, action: "idle" as const, position: null, ended: true, outcome: null, delaySeconds: (r.delaySeconds as number) ?? 0 };
      slot.ended = true; slot.outcome = r.outcome as string;
      s.slots.set(r.slot as number, slot);
    } else if (r.event === "step-start") {
      s.steps++;
      s.cut = { n: r.n as number, slot: r.slot as number, position: r.position as number, step: r.step as string, at: r.at, timeoutSeconds: r.timeoutSeconds as number,
        needles: (r.needles as string[] | undefined) ?? [], pid: null };
    } else if (r.event === "step-pid") { if (s.cut && s.cut.n === r.n) s.cut.pid = r.pid as number; }
    else if (r.event === "step-end" || r.event === "step-cleared") {
      // a post lies before the command's end: the end bounds it from above, whatever the exit code was
      const step = r.step as string, at = Date.parse(r.at);
      const mark = (t: string) => { if (!s.triggerEnd.has(t)) s.triggerEnd.set(t, new Map()); s.triggerEnd.get(t)!.set(r.position as number, at); };
      if (step === "trigger") for (const t of tools) mark(t);
      else if (step.startsWith("retrigger:")) mark(step.slice("retrigger:".length));
      // a timed-out command whose group was not confirmed gone stays open until a later start clears it
      if (r.event === "step-end" && r.timedOut === true && r.cleaned === false) { if (s.cut && typeof r.pid === "number") s.cut.pid = r.pid; }
      else s.cut = null;
      if (r.event === "step-cleared") continue;
      if (r.exit === 0 && r.step === "open") first(r.position as number).openDone = true;
      if (r.exit === 0 && r.step === "trigger") first(r.position as number).triggerDone = true;
      if (typeof r.resumeSha === "string") s.resumeSha.set(r.fork as string, r.resumeSha);
    } else if (r.event === "tool-handled") {
      if (!s.handled.has(r.position as number)) s.handled.set(r.position as number, new Map());
      s.handled.get(r.position as number)!.set(r.tool as string, r.why as string);
    } else if (r.event === "resume-changed-outside") s.resumeSha.set(r.fork as string, r.now as string);
    else if (r.event === "stop") s.stopped = r.reason as string;
    else if (r.event === "end") s.ended = true;
  }
  return s;
}

function readLog(file: string): Rec[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out: Rec[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line) as Rec); } catch {
      // only the last line can be torn by a kill mid-write; the action it would have recorded is treated as not done
      if (i !== lines.length - 1) throw new RefusalError(`${file}: line ${i + 1} is not JSON; the log is the record of what was done, fix it by hand`);
    }
  });
  return out;
}

function appendLog(file: string, rec: Rec): void {
  let prefix = "";
  const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
  if (size > 0) {
    const fd = fs.openSync(file, "r");
    const b = Buffer.alloc(1);
    fs.readSync(fd, b, 0, 1, size - 1);
    fs.closeSync(fd);
    if (b[0] !== 0x0a) prefix = "\n"; // a torn last line stays on its own line
  }
  const fd = fs.openSync(file, "a");
  try { fs.writeSync(fd, prefix + JSON.stringify(rec) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ---- the run ---------------------------------------------------------------------------------------------------------

const iso = (ms: number) => new Date(ms).toISOString();
const slotTime = (plan: Plan, k: number) => Date.parse(plan.t0) + k * plan.slotSeconds * 1000;

export function slotTable(o: Opts): { slot: number; plannedAt: string; what: string }[] {
  const out: { slot: number; plannedAt: string; what: string }[] = [];
  for (let k = o.plan.firstSlot; k <= o.plan.lastSlot; k++) {
    const own = o.cases[k - o.plan.firstSlot];
    out.push({ slot: k, plannedAt: iso(slotTime(o.plan, k)), what: own ? `first trigger: position ${own.position} ${own.id} ${own.fork} (push, open the PR, trigger ${o.tools.join(",")})`
      : k >= o.plan.retriggerFromSlot ? "re-trigger check (or a first trigger still owed)" : "free (a first trigger still owed, else nothing)" });
  }
  return out;
}

export async function runScheduler(o: Opts, io: Io): Promise<number> {
  const logFile = path.join(o.stateDir, "scheduler.log.jsonl"), stateFile = path.join(o.stateDir, "scheduler.state.json");
  const lockFile = path.join(o.stateDir, "scheduler.lock");
  const pins = readPins(o);
  fs.mkdirSync(path.join(o.stateDir, "steps"), { recursive: true });
  const me = io.ident();
  // one copy per state dir
  for (;;) {
    try { fs.writeFileSync(lockFile, `${me.pid}\n`, { flag: "wx" }); break; } catch {
      const other = Number(fs.readFileSync(lockFile, "utf8").trim());
      if (Number.isSafeInteger(other) && other !== me.pid && io.alive(other)) throw new RefusalError(`another scheduler (pid ${other}) holds ${lockFile}`);
      fs.rmSync(lockFile, { force: true }); // a killed scheduler's lock
    }
  }
  try {
    const binding = { execute: o.execute, side: o.side, cases: fileSha(o.files.cases), plan: fileSha(o.files.plan), tools: fileSha(o.files.tools) };
    const before = replay(readLog(logFile), o.tools);
    if (before.binding && JSON.stringify(before.binding) !== JSON.stringify(binding)) {
      throw new RefusalError(`${o.stateDir} holds the log of another run (other mode, side, case list, plan or tools); a run keeps its own state dir`);
    }
    if (before.ended) { io.say(`${iso(io.now())} | already finished: ${logFile} ends with "end"; nothing to do`); return 0; }
    const log = (event: string, x: Record<string, unknown> = {}) => appendLog(logFile, { at: iso(io.now()), event, ...x });
    log("boot", { ...me, binding, scheduler: fileSha(SELF), pinned: pins ? pins.size : 0 });
    let st = replay(readLog(logFile), o.tools);
    const { plan } = o;
    const say = (slot: number, c: CaseRow | null, step: string, result: string) =>
      io.say(`${iso(io.now())} | slot ${slot} | ${c ? `position ${c.position} | ${c.id}` : "- | -"} | ${step} | ${result}`);
    const writeState = () => writeAtomic(stateFile, JSON.stringify({ v: 1, updatedAt: iso(io.now()), execute: o.execute, side: o.side, t0: plan.t0, boots: st.boots,
      slots: [...st.slots].map(([slot, s]) => ({ slot, ...s })),
      positions: o.cases.map((c) => ({ position: c.position, id: c.id, firstTrigger: firstDone(c) ? "done" : (st.first.get(c.position)?.attempts ?? 0) >= plan.firstTriggerAttempts ? "gave-up" : "pending",
        attempts: st.first.get(c.position)?.attempts ?? 0, tools: Object.fromEntries(st.handled.get(c.position) ?? []) })),
      slotsLateOver30Min: [...st.slots.values()].filter((s) => s.delaySeconds > 1800).length, missed: [...st.slots.values()].filter((s) => s.outcome === "missed" || s.outcome === "interrupted-late").length,
      stopped: st.stopped, ended: st.ended }, null, 1) + "\n");
    const firstDone = (c: CaseRow) => { const f = st.first.get(c.position); return !!f && f.openDone && f.triggerDone; };
    const pending = (c: CaseRow) => !firstDone(c) && (st.first.get(c.position)?.attempts ?? 0) < plan.firstTriggerAttempts;
    const ownSlot = (c: CaseRow) => plan.firstSlot + c.position - 1;
    const refresh = () => { st = replay(readLog(logFile), o.tools); };
    const bins = [...(o.ghBin ? ["--gh-bin", o.ghBin] : [])];
    const exec = o.execute ? ["--execute"] : [];
    const checkPins = () => {
      if (!pins) return;
      for (const p of pinnedPaths(o)) {
        let now: string;
        try { now = fileSha(p); } catch { now = "unreadable"; }
        if (now !== pins.get(p)) { log("stop", { reason: "a pinned file changed", file: p }); refresh(); writeState(); throw new Stop(`a pinned file changed: ${p}`); }
      }
    };
    const noteResume = (fork: string) => {
      // the open-prs resume file changes with every action; a change the scheduler did not make is logged, not fatal
      // (H1 §5 lets the operator step in by hand)
      const f = resumeFile(o, fork);
      const now = fs.existsSync(f) ? fileSha(f) : "absent";
      const was = st.resumeSha.get(fork);
      if (was !== undefined && was !== now) { log("resume-changed-outside", { fork, was, now }); refresh(); }
    };
    let seq = st.steps;
    /** One command: waits for a cut-off copy of it to end, runs it with a timeout, logs its start and end. */
    const step = async (slot: number, c: CaseRow, name: string, argv: string[], timeoutSeconds: number, needles: string[]): Promise<StepResult> => {
      const deadline = io.now() + timeoutSeconds * 1000;
      let waited = false;
      while (io.busy(needles)) {
        if (!waited) { log("step-wait", { slot, position: c.position, step: name, why: "a process of this command is still running" }); waited = true; }
        if (io.now() >= deadline) { log("step-not-started", { slot, position: c.position, step: name, why: "a process of this command was still running at the timeout" }); refresh(); return { exit: null, signal: null, timedOut: true, cleaned: true }; }
        await io.sleep(1000);
      }
      const n = ++seq;
      const outFile = path.join(o.stateDir, "steps", `s${slot}-p${c.position}-${name.replace(/[^a-z0-9-]+/g, "-")}.${n}.txt`);
      const started = io.now();
      let pid: number | null = null;
      log("step-start", { n, slot, position: c.position, id: c.id, fork: c.fork, step: name, dry: !o.execute, argv, outFile: path.basename(outFile), timeoutSeconds, needles, ppid: io.ident().ppid });
      const r = await io.exec(argv, { outFile, timeoutMs: timeoutSeconds * 1000, onPid: (p) => { pid = p; log("step-pid", { n, slot, position: c.position, step: name, pid: p }); } });
      const f = resumeFile(o, c.fork);
      log("step-end", { n, slot, position: c.position, id: c.id, fork: c.fork, step: name, dry: !o.execute, exit: r.exit, signal: r.signal, timedOut: r.timedOut, cleaned: r.cleaned, pid,
        seconds: Math.round((io.now() - started) / 1000), resumeSha: fs.existsSync(f) ? fileSha(f) : "absent" });
      refresh();
      say(slot, c, name, r.timedOut ? `timeout after ${timeoutSeconds} s${r.cleaned ? "; its process group is gone" : ""}` : `exit ${r.exit}${r.signal ? ` (${r.signal})` : ""}${o.execute ? "" : " (dry run)"}`);
      if (r.timedOut && !r.cleaned) {
        // fail closed: a process of this command may still write; nothing else runs until a later start sees it gone
        log("stop", { reason: "a timed-out command's processes could not be confirmed ended", slot, position: c.position, step: name, pid });
        refresh(); writeState();
        throw new Stop(`the processes of a timed-out command (${name}, slot ${slot}) could not be confirmed ended`);
      }
      return r;
    };
    /**
     * Waits until minTriggerSpacingSeconds have passed since the END of the last trigger command of these tools on
     * another PR: that command's post happened before its end, and this command's post comes after its start, so the
     * two posts are at least that far apart. A command of this PR that was cut and runs again is not counted against
     * itself (open-prs.ts posts nothing twice).
     */
    const spacing = async (slot: number, c: CaseRow, tools: string[]) => {
      const last = Math.max(-Infinity, ...tools.flatMap((t) => [...(st.triggerEnd.get(t) ?? [])].filter(([p]) => p !== c.position).map(([, at]) => at)));
      const wait = last + plan.minTriggerSpacingSeconds * 1000 - io.now();
      if (wait > 0) {
        log("spacing-wait", { slot, position: c.position, seconds: Math.ceil(wait / 1000), tools });
        say(slot, c, "spacing", `waiting ${Math.ceil(wait / 1000)} s: ${plan.minTriggerSpacingSeconds} s between triggers of one tool`);
        while (io.now() < last + plan.minTriggerSpacingSeconds * 1000) await io.sleep(Math.min(30_000, last + plan.minTriggerSpacingSeconds * 1000 - io.now()));
      }
    };
    const openPrs = (c: CaseRow, more: string[]) => [o.node, o.files.openPrs, "--manifest", o.files.manifest, "--fork", c.fork, "--resume-file", resumeFile(o, c.fork), ...more, "--ids", c.id, ...bins];
    const openNeedles = (c: CaseRow) => [o.files.openPrs, resumeFile(o, c.fork)];

    const runFirst = async (slot: number, c: CaseRow): Promise<string> => {
      if (!st.first.get(c.position)?.openDone) {
        const r = await step(slot, c, "open", [...openPrs(c, ["--clone", path.join(o.clones, forkName(c.fork))]), ...(o.gitBin ? ["--git-bin", o.gitBin] : []), ...exec], plan.timeoutSeconds.open, openNeedles(c));
        if (r.exit !== 0) return "failed:open";
      }
      if (!st.first.get(c.position)?.triggerDone) {
        await spacing(slot, c, o.tools);
        const r = await step(slot, c, "trigger", [...openPrs(c, ["--trigger", o.tools.join(",")]), ...exec], plan.timeoutSeconds.trigger, openNeedles(c));
        if (r.exit !== 0) return "failed:trigger";
      }
      return "done";
    };

    const handle = (c: CaseRow, tool: string, why: string, slot: number) => { log("tool-handled", { slot, position: c.position, tool, why }); refresh(); say(slot, c, `re-trigger check ${tool}`, why); };
    /** Positions with a re-trigger check still owed, lowest first: every triggered tool's first trigger is old enough. */
    const duePositions = (resume: Map<string, Map<string, ResumeInfo>>, now: number) => o.cases.filter((c) => {
      const info = resume.get(c.fork)?.get(c.id);
      const open = o.tools.filter((t) => info?.triggered.has(t) && !st.handled.get(c.position)?.has(t));
      return open.length > 0 && Math.max(...open.map((t) => info!.triggered.get(t)!)) + plan.retriggerDueSeconds * 1000 <= now;
    });
    const readAllResume = () => new Map([...new Set(o.cases.map((c) => c.fork))].map((f) => [f, readResume(resumeFile(o, f))]));

    const runRetrigger = async (slot: number): Promise<string> => {
      const due = duePositions(readAllResume(), io.now());
      if (!due.length) return "nothing-due";
      if (!o.execute) {
        // a dry run posts nothing and reads nothing from GitHub: it lists the check the slot would make
        // (one position per slot, as if each needed its re-trigger: the worst case of H1 §3)
        const c = due[0]!;
        for (const t of o.tools) {
          if (!readResume(resumeFile(o, c.fork)).get(c.id)?.triggered.has(t) || st.handled.get(c.position)?.has(t)) continue;
          handle(c, t, "dry run: listed (collect with window t0..now and --resume-file, then open-prs.ts --retrigger only if no-review); not collected, nothing posted", slot);
        }
        return "dry-run:listed";
      }
      for (const c of due) {
        let posted = false;
        for (const tool of o.tools) {
          if (st.handled.get(c.position)?.has(tool)) continue;
          const info = readResume(resumeFile(o, c.fork)).get(c.id);
          if (!info?.triggered.has(tool)) continue; // never triggered: no re-trigger (open-prs.ts refuses it too)
          if (info.retriggered.has(tool)) { handle(c, tool, "already re-triggered (resume file)", slot); continue; }
          if (info.pr === null) return "passed:no-pr-record";
          // the spacing wait comes first: the collection is made after it, so a review that completes during the wait
          // is seen, and a re-trigger is posted straight from a fresh verdict (H1 §3: checked now, not at its due time)
          await spacing(slot, c, [tool]);
          let status: string | null = null, dir = "";
          for (let attempt = 1; attempt <= 2 && status === null; attempt++) {
            let n = 1;
            do { dir = path.join(o.stateDir, "check", `p${c.position}-${tool}.s${slot}.${n++}`); } while (fs.existsSync(dir) || fs.existsSync(`${dir}.pr-map.json`));
            fs.mkdirSync(path.dirname(dir), { recursive: true });
            fs.writeFileSync(`${dir}.pr-map.json`, JSON.stringify({ [c.id]: info.pr }) + "\n", { flag: "wx" });
            const r = await step(slot, c, `collect:${tool}`, [o.node, o.files.collector, "--side", o.side, ...(o.heldoutOk ? ["--heldout-ok"] : []), "--tool", tool, "--config", o.files.tools,
              "--repo", c.fork, "--manifest", o.files.manifest, "--pr-map", `${dir}.pr-map.json`, "--window-start", plan.t0, "--window-end", iso(io.now()),
              "--resume-file", resumeFile(o, c.fork), "--ids", c.id, "--out", dir, ...bins], plan.timeoutSeconds.collect, [o.files.collector, dir]);
            if (r.exit !== 0) continue; // 1: read-failed (not a result); 2: refused
            try { status = String((JSON.parse(fs.readFileSync(path.join(dir, `${tool}.status.json`), "utf8")) as Record<string, unknown>)[c.id] ?? ""); } catch { status = null; }
            if (status === "read-failed" || status === "") status = null;
          }
          if (status === null) return "passed:collection-failed-twice"; // the PR is first at the next slot
          if (status === "completed") { handle(c, tool, "completed: never re-triggered", slot); continue; }
          if (status === "invalid-binding") { handle(c, tool, "invalid-binding: no re-trigger", slot); continue; }
          if (status !== "no-review") return "passed:unknown-status";
          const r = await step(slot, c, `retrigger:${tool}`, [...openPrs(c, ["--retrigger", tool, "--status", path.join(dir, `${tool}.status.json`)]), "--execute"], plan.timeoutSeconds.retrigger, openNeedles(c));
          if (r.exit !== 0) return "passed:retrigger-failed";
          if (!readResume(resumeFile(o, c.fork)).get(c.id)?.retriggered.has(tool)) return "passed:retrigger-not-recorded";
          handle(c, tool, "re-triggered", slot);
          posted = true;
        }
        if (posted) return "retriggered";
      }
      return "nothing-needed";
    };

    /** Nothing left: no first trigger owed and no triggered tool unhandled (a dry run writes no trigger record, so it ends after the first triggers unless the resume files already hold some). */
    const nothingLeft = () => {
      if (o.cases.some(pending)) return false;
      const resume = readAllResume();
      return !o.cases.some((c) => o.tools.some((t) => resume.get(c.fork)?.get(c.id)?.triggered.has(t) && !st.handled.get(c.position)?.has(t)));
    };

    // a command the last scheduler left without a confirmed end: its whole process group must be gone before anything runs
    if (st.cut) {
      const cut = st.cut;
      const marks = [...cut.needles, ...(o.ghBin ? [o.ghBin] : []), ...(o.gitBin ? [o.gitBin] : [])];
      // the group id could have been reused by an unrelated program: only processes that look like this command count
      const ours = (cmd: string) => marks.some((m) => cmd.includes(m)) || /(^|\/)(gh|git)(\s|$)/.test(cmd);
      const left = () => (cut.pid !== null && io.group(cut.pid).some(ours)) || (cut.needles.length > 0 && io.busy(cut.needles));
      const deadline = Date.parse(cut.at) + cut.timeoutSeconds * 1000;
      let killed = false;
      if (left()) {
        log("step-wait", { slot: cut.slot, position: cut.position, step: cut.step, pid: cut.pid, why: "the command cut by the last stop is still running" });
        io.say(`${iso(io.now())} | slot ${cut.slot} | position ${cut.position} | ${cut.step} | waiting for the cut command to end`);
        while (left() && io.now() < deadline) await io.sleep(1000);
        if (left()) {
          // past its own timeout with nobody supervising it: kill the whole group, then confirm
          if (cut.pid !== null) io.killGroup(cut.pid);
          killed = true;
          for (let i = 0; i < 10 && left(); i++) await io.sleep(1000);
          if (left()) {
            log("stop", { reason: "a cut command's processes could not be confirmed ended", slot: cut.slot, position: cut.position, step: cut.step, pid: cut.pid });
            refresh(); writeState();
            throw new Stop(`the processes of the cut command (${cut.step}, slot ${cut.slot}) could not be confirmed ended`);
          }
        }
      }
      log("step-cleared", { n: cut.n, slot: cut.slot, position: cut.position, step: cut.step, pid: cut.pid, killed });
      refresh();
    }
    checkPins();
    writeState();
    for (let k = plan.firstSlot; k <= plan.lastSlot; k++) {
      const was = st.slots.get(k);
      if (was?.ended) continue;
      if (!was && nothingLeft()) break;
      const planned = slotTime(plan, k);
      while (io.now() < planned) await io.sleep(Math.min(30_000, planned - io.now()));
      checkPins();
      const delaySeconds = Math.max(0, Math.round((io.now() - planned) / 1000));
      if (io.now() - planned > plan.graceSeconds * 1000) {
        // H1 failure 7: never fired late; the position, if any, takes the next free slot
        log("slot-end", { slot: k, plannedAt: iso(planned), delaySeconds, outcome: was ? "interrupted-late" : "missed" });
        refresh(); writeState();
        say(k, null, "slot", `${was ? "interrupted and " : ""}late by ${delaySeconds} s (over ${plan.graceSeconds} s): not fired`);
        continue;
      }
      for (const f of new Set(o.cases.map((c) => c.fork))) noteResume(f);
      let action: SlotState["action"], c: CaseRow | null = null;
      if (was) { action = was.action; c = o.cases.find((x) => x.position === was.position) ?? null; log("slot-resume", { slot: k, action, position: c?.position ?? null, delaySeconds }); }
      else {
        const own = o.cases.find((x) => ownSlot(x) === k);
        const owed = own && pending(own) ? own : o.cases.find((x) => pending(x) && ownSlot(x) < k);
        if (owed) { action = "first"; c = owed; }
        else action = k >= plan.retriggerFromSlot && !o.cases.some(pending) ? "retrigger" : "idle";
        log("slot-start", { slot: k, plannedAt: iso(planned), delaySeconds, action, position: c?.position ?? null, id: c?.id ?? null });
      }
      refresh();
      say(k, c, "slot", `${was ? "resumed" : "started"}: ${action}, planned ${iso(planned)}, delay ${delaySeconds} s`);
      const outcome = action === "first" ? await runFirst(k, c!) : action === "retrigger" ? await runRetrigger(k) : "nothing-to-do";
      log("slot-end", { slot: k, plannedAt: iso(planned), delaySeconds, outcome });
      refresh(); writeState();
      say(k, c, "slot", `ended: ${outcome}`);
    }
    log("end", { slots: st.slots.size });
    refresh(); writeState();
    fs.writeFileSync(path.join(o.stateDir, "scheduler.done"), `${iso(io.now())}\n`);
    io.say(`${iso(io.now())} | finished: ${st.slots.size} slot(s) in the log`);
    return 0;
  } catch (e) {
    if (e instanceof Stop) { io.say(`${iso(io.now())} | STOPPED: ${e.message}`); return 3; }
    throw e;
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

// ---- command line ------------------------------------------------------------------------------------------------------

/** Signal 0 to a process group: true while any process of it exists. */
function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch (e) { return (e as { code?: string }).code === "EPERM"; }
}
function killGroup(pgid: number): void {
  try { process.kill(-pgid, "SIGKILL"); } catch { /* already gone */ }
}

export const realIo: Io = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
  exec: (argv, { outFile, timeoutMs, onPid }) => new Promise((res) => {
    const fd = fs.openSync(outFile, "a");
    // an allowlisted env: no model key and no GIT_* variable reaches a command
    const env = Object.fromEntries(ENV_ALLOW.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    // its own process group: the script and every gh or git it starts can be ended, and seen ended, together
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ["ignore", fd, fd], env, detached: true });
    const pgid = child.pid ?? null;
    if (pgid !== null) onPid(pgid);
    let timedOut = false, done = false;
    const finish = (exit: number | null, signal: string | null, cleaned: boolean) => { if (done) return; done = true; clearTimeout(timer); fs.closeSync(fd); res({ exit, signal, timedOut, cleaned }); };
    const timer = setTimeout(() => { timedOut = true; if (pgid !== null) killGroup(pgid); else child.kill("SIGKILL"); }, timeoutMs);
    child.on("error", () => finish(null, null, true));
    child.on("close", (code, signal) => {
      if (!timedOut || pgid === null) return finish(code, signal, true);
      // the script is dead; a gh or git it started may not be: kill the group until nothing of it is left (10 s at most)
      let tries = 0;
      const check = () => {
        if (!groupAlive(pgid)) return finish(code, signal, true);
        if (++tries > 100) return finish(code, signal, false);
        killGroup(pgid);
        setTimeout(check, 100);
      };
      check();
    });
  }),
  busy: (needles) => {
    const r = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) return false;
    return r.stdout.split("\n").some((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return !!m && Number(m[1]) !== process.pid && needles.every((n) => m[2]!.includes(n)); });
  },
  alive: (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as { code?: string }).code === "EPERM"; } },
  group: (pgid) => {
    const r = spawnSync("ps", ["-axo", "pgid=,command="], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) return groupAlive(pgid) ? ["(process list unavailable; the group is alive)"] : [];
    return r.stdout.split("\n").flatMap((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return m && Number(m[1]) === pgid ? [m[2]!] : []; });
  },
  killGroup: (pgid) => killGroup(pgid),
  ident: () => {
    const r = spawnSync("ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" });
    const pgid = r.status === 0 && /^\s*\d+\s*$/.test(r.stdout) ? Number(r.stdout.trim()) : null;
    return { pid: process.pid, ppid: process.ppid, pgid };
  },
  say: (line) => console.log(line),
};

export function parseCli(argv: string[]): { o: Opts; mode: "run" | "list" | "status" | "print-pins"; detach: boolean } {
  const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
    side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, cases: { type: "string" }, plan: { type: "string" }, tools: { type: "string" },
    manifest: { type: "string" }, clones: { type: "string" }, "resume-dir": { type: "string" }, "state-dir": { type: "string" }, "open-prs": { type: "string" },
    collector: { type: "string" }, pins: { type: "string" }, execute: { type: "boolean", default: false }, detach: { type: "boolean", default: false },
    list: { type: "boolean", default: false }, status: { type: "boolean", default: false }, "print-pins": { type: "boolean", default: false },
    "gh-bin": { type: "string" }, "git-bin": { type: "string" }, node: { type: "string" },
  } });
  const need = ["cases", "plan", "tools", "manifest", "clones", "resume-dir", "state-dir", "open-prs", "collector"] as const;
  const paths = [...need.map((k) => values[k]), values.pins];
  // the side is checked on the paths as typed, before any file is read
  guardSide(values.side, values["heldout-ok"]!, paths, []);
  const missing = need.filter((k) => !values[k]);
  if (missing.length) throw new RefusalError(`missing: ${missing.map((k) => `--${k}`).join(", ")}`);
  if ([values.list, values.status, values["print-pins"]].filter(Boolean).length > 1) throw new RefusalError("--list, --status and --print-pins are separate modes");
  const abs = (p: string) => path.resolve(p);
  const cases = readCases(values.cases!);
  const side = guardSide(values.side, values["heldout-ok"]!, paths, cases.map((c) => c.id));
  const plan = readPlan(values.plan!, cases.length, values.execute!);
  const o: Opts = { side, heldoutOk: values["heldout-ok"]!, execute: values.execute!, cases, plan, tools: readTools(values.tools!),
    files: { cases: abs(values.cases!), plan: abs(values.plan!), tools: abs(values.tools!), manifest: abs(values.manifest!), openPrs: abs(values["open-prs"]!),
      collector: abs(values.collector!), pins: values.pins ? abs(values.pins) : null },
    clones: abs(values.clones!), resumeDir: abs(values["resume-dir"]!), stateDir: abs(values["state-dir"]!), node: values.node ?? process.execPath,
    ghBin: values["gh-bin"] ?? null, gitBin: values["git-bin"] ?? null };
  for (const f of [o.files.manifest, o.files.openPrs, o.files.collector]) if (!fs.statSync(f, { throwIfNoEntry: false })?.isFile()) throw new RefusalError(`${f} is not a file`);
  return { o, mode: values.list ? "list" : values.status ? "status" : values["print-pins"] ? "print-pins" : "run", detach: values.detach! };
}

export async function main(argv: string[], io: Io = realIo): Promise<number> {
  try {
    const { o, mode, detach } = parseCli(argv);
    if (mode === "list") {
      const rows = slotTable(o);
      for (const r of rows) io.say(`slot ${r.slot} | ${r.plannedAt} | ${r.what}`);
      io.say(`${rows.length} slot(s): ${o.cases.length} first-trigger slot(s), re-trigger checks from slot ${o.plan.retriggerFromSlot}, last slot ${o.plan.lastSlot}; ${o.execute ? "EXECUTE" : "dry run"} plan check passed`);
      return 0;
    }
    if (mode === "print-pins") {
      io.say(JSON.stringify({ v: 1, sha256: Object.fromEntries(pinnedPaths(o).map((p) => [p, fileSha(p)])) }, null, 1));
      return 0;
    }
    if (mode === "status") {
      const f = path.join(o.stateDir, "scheduler.state.json");
      io.say(fs.existsSync(f) ? fs.readFileSync(f, "utf8").trimEnd() : JSON.stringify({ status: "not started" }));
      return 0;
    }
    if (detach) {
      // a session leader with no terminal and no parent that is an agent's session: it outlives the caller
      readPins(o);
      fs.mkdirSync(o.stateDir, { recursive: true });
      const out = fs.openSync(path.join(o.stateDir, "scheduler.out"), "a");
      const child = spawn(process.execPath, [SELF, ...argv.filter((a) => a !== "--detach")], { detached: true, stdio: ["ignore", out, out] });
      child.unref();
      io.say(`started detached: pid ${child.pid}; log ${path.join(o.stateDir, "scheduler.log.jsonl")}, output ${path.join(o.stateDir, "scheduler.out")}`);
      return 0;
    }
    io.say(`${iso(io.now())} | ${o.execute ? "EXECUTE" : "DRY RUN (open-prs.ts runs without --execute; nothing is pushed, opened or posted)"}: ${o.cases.length} case(s), tools ${o.tools.join(",")}, slots ${o.plan.firstSlot}..${o.plan.lastSlot} from ${o.plan.t0}, side ${o.side}`);
    return await runScheduler(o, io);
  } catch (e) {
    const known = e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS");
    io.say(`refused: ${known ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

const invoked = (): boolean => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href; } catch { return false; } };
if (invoked()) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
