// Gates, paths, rows and the spending cap of the Cal.com test-set run (decision 061). No I/O
// except `readItemStates`, no model call. The plan these encode is decision 061; job 062 runs it.
//   - Cal.com (`cal_dot_com`) is reachable only with TRACEHOUND_TEST_RUN=061 in the environment.
//   - Rows are fixed here and frozen; nothing on the command line adds one.
//   - The $15 cap is spent in a fixed order of items; a cap stop leaves every later item not done.
//   - A crashed run may be restarted once, into run-<n>r/, only while no file exists under its
//     scores/ (061a); the restart then takes the run's place.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TEST_RUN_ENV = "TRACEHOUND_TEST_RUN";
export const TEST_RUN_ID = "061";
export const TEST_SET = "cal_dot_com";
export const DEV_REPOS = Object.freeze(["sentry", "grafana", "keycloak", "discourse"] as const);
export const SETS = Object.freeze(["cal_dot_com", "dev"] as const);
export type SetName = (typeof SETS)[number];
export type RunNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Throws unless TRACEHOUND_TEST_RUN=061 is set. */
export function requireTestRun(env: NodeJS.ProcessEnv): void {
  if (env[TEST_RUN_ENV] !== TEST_RUN_ID) throw new Error(`refusing ${TEST_SET}: the test set needs ${TEST_RUN_ENV}=${TEST_RUN_ID} in the environment (decision 061)`);
}

/**
 * What fetch-prs.ts and fetch-repos.ts fetch, and under which root. Without `--test-set`: dev repos
 * only, under <bench> (as before 061). With `--test-set cal_dot_com` and TRACEHOUND_TEST_RUN=061:
 * Cal.com only, under <bench>/test/. Anything else throws before any fetch.
 */
export function fetchTarget(argv: string[], env: NodeJS.ProcessEnv, bench: string): { repos: string[]; root: string; testSet: boolean } {
  const arg = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  if (argv.includes("--test-set")) {
    const set = arg("--test-set");
    if (set !== TEST_SET) throw new Error(`refusing --test-set ${set}: the only test set is ${TEST_SET}`);
    if (argv.includes("--repos")) throw new Error("refusing --repos with --test-set");
    requireTestRun(env);
    return { repos: [TEST_SET], root: join(bench, "test"), testSet: true };
  }
  const repos = arg("--repos")?.split(",") ?? [...DEV_REPOS];
  for (const r of repos) if (!(DEV_REPOS as readonly string[]).includes(r)) throw new Error(`refusing repo ${r}: dev repos only (${DEV_REPOS.join(", ")})`);
  return { repos, root: bench, testSet: false };
}

/** `--set` and `--run` of run-test-set.ts, with the refusals of decision 061. A restart (061a) passes the same checks. */
export function checkRun(set: string | undefined, run: string | undefined, env: NodeJS.ProcessEnv): { set: SetName; run: RunNumber } {
  if (!(SETS as readonly string[]).includes(set ?? "")) throw new Error(`refusing --set ${set}: one of ${SETS.join(", ")}`);
  if (!["1", "2", "3"].includes(run ?? "")) throw new Error(`refusing --run ${run}: 1, 2 or 3`);
  const n = Number(run) as RunNumber;
  if (set === "dev" && n === 1) throw new Error("refusing --set dev --run 1: dev run 1 is decision 059's run");
  if (set === TEST_SET) requireTestRun(env);
  return { set: set as SetName, run: n };
}

/** The repos of a set. */
export const reposOf = (set: SetName): readonly string[] => (set === TEST_SET ? [TEST_SET] : DEV_REPOS);

/** Inputs of a set: pull request files, bare clone, heads file. Cal.com's live under <bench>/test/. */
export function inputPaths(bench: string, set: SetName, repo: string) {
  const root = set === TEST_SET ? join(bench, "test") : bench;
  return {
    prs: join(root, "prs", repo),
    gitDir: join(root, "repos", repo),
    heads: join(root, "repos", `${repo}.heads.json`),
    golden: join(bench, "golden/code_review_benchmarks", `${repo}.json`),
  };
}

/** Where a run writes: run-<n>/, or run-<n>r/ for its one restart (061a). Never an existing directory. */
export const runDir = (bench: string, set: SetName, run: RunNumber, restart = false) =>
  join(bench, set === TEST_SET ? "test" : "reviews/dev-repeat", `run-${run}${restart ? "r" : ""}`);

/** The directory whose results stand for run n: run-<n>r/ once it exists, else run-<n>/. */
export function standingRunDir(bench: string, set: SetName, run: RunNumber): { dir: string; restarted: boolean } {
  const r = runDir(bench, set, run, true);
  return existsSync(r) ? { dir: r, restarted: true } : { dir: runDir(bench, set, run), restarted: false };
}

/** Files (at any depth) under <dir>/scores/; 0 when there is no scores/. */
export function scoreFileCount(dir: string): number {
  const scores = join(dir, "scores");
  if (!existsSync(scores)) return 0;
  return readdirSync(scores, { recursive: true, withFileTypes: true }).filter((e) => !e.isDirectory()).length;
}

// ---- rows ----

/** pool-verify-v1 (primary), then the declared secondaries. */
export const TRACEHOUND_ROWS = Object.freeze(["pool-verify-v1", "review-diff-v1", "pool-raw"] as const);
/** The five recorded tools (comparison rows, Cal.com run 1 only: their reviews do not change between runs). */
export const TOOL_ROWS = Object.freeze(["greptile", "coderabbit", "augment", "cursor", "copilot"] as const);
export type Row = (typeof TRACEHOUND_ROWS)[number] | (typeof TOOL_ROWS)[number];

const CAL_RUN1_ROWS: readonly Row[] = Object.freeze([...TRACEHOUND_ROWS, ...TOOL_ROWS]);

/** The rows a run judges and reports, in order. Frozen: there is no way to add one. */
export const rowsFor = (set: SetName, run: RunNumber): readonly Row[] => (set === TEST_SET && run === 1 ? CAL_RUN1_ROWS : TRACEHOUND_ROWS);

/** Review files of a row: TraceHound rows from the run directory, tools from their converted recorded reviews (054). */
export const rowReviews = (bench: string, dir: string, row: Row, repo: string) =>
  (TOOL_ROWS as readonly string[]).includes(row) ? join(bench, "reviews", row, repo) : join(dir, row, repo);

// ---- the cap ----

export const CAP_USD = 15;
/** The order of 062's items; each later item gets only what is left. */
export const ITEMS = Object.freeze([
  { set: "cal_dot_com", run: 1, group: "cal-run-1", plannedUSD: 6 },
  { set: "cal_dot_com", run: 2, group: "cal-repeats", plannedUSD: 5 },
  { set: "cal_dot_com", run: 3, group: "cal-repeats", plannedUSD: 5 },
  { set: "dev", run: 2, group: "dev-repeats", plannedUSD: 4 },
  { set: "dev", run: 3, group: "dev-repeats", plannedUSD: 4 },
] as const);
const GROUP_CAP_USD: Record<string, number | null> = { "cal-run-1": null, "cal-repeats": 5, "dev-repeats": 4 };

export type RunStatus = "running" | "complete" | "stopped-at-cap";
/** What run.json says about an item; "running" left behind by a crash means the run is void. */
export interface ItemState {
  /** the run that stands: run-<n>r's once restarted */
  status: RunStatus;
  /** everything the item spent: run-<n>'s, plus run-<n>r's once restarted */
  costUSD: number;
  /** run-<n>r/ exists (061a) */
  restarted?: boolean;
  /** run-<n>/'s own status, when restarted */
  firstStatus?: RunStatus;
  /** files under run-<n>/scores/ */
  firstScoreFiles?: number;
}

/** 061a: why run-<n>/ may not be restarted, or null when it may. */
export function restartRefusal(s: ItemState | null, dirName: string): string | null {
  if (!s) return `${dirName}/ does not exist`;
  if (s.restarted) return `${dirName}r/ already exists: a run is restarted once, and a second crash leaves it void`;
  const status = s.firstStatus ?? s.status;
  if (status !== "running") return `${dirName}/ is ${status}; only a crashed run (status running) is restarted`;
  if (s.firstScoreFiles) return `${dirName}/scores/ holds ${s.firstScoreFiles} file(s): a result exists, so the run is void with no restart`;
  return null;
}

/**
 * The money an item may spend, or why it may not start. Every earlier item must have started
 * (order); an earlier cap stop means this item is not done; an earlier crashed run that may still
 * be restarted (061a) must be restarted first; the item gets min(its group's cap minus what the
 * group spent, $15 minus everything spent). Cal.com run 1 has no group cap: it is never cut, and
 * may use the whole $15 (more than its planned $6 is reported as a deviation). A restart (061a)
 * needs restartRefusal to pass and gets what is left of the item's allowance after the void run.
 */
export function planItem(set: SetName, run: RunNumber, states: (ItemState | null)[], restart = false): { ok: true; allowanceUSD: number } | { ok: false; why: string } {
  const idx = ITEMS.findIndex((i) => i.set === set && i.run === run);
  if (idx < 0) throw new Error(`no item ${set} run ${run}`);
  if (states.length !== ITEMS.length) throw new Error(`planItem: ${states.length} states for ${ITEMS.length} items`);
  const name = (i: number) => `${ITEMS[i]!.set} run ${ITEMS[i]!.run}`;
  let spent = 0;
  let groupSpent = 0;
  if (restart) {
    const why = restartRefusal(states[idx] ?? null, `run-${run}`);
    if (why) return { ok: false, why };
    spent = groupSpent = states[idx]!.costUSD; // the void run's spend counts toward its item
  } else if (states[idx]) return { ok: false, why: `${name(idx)} already has a run directory` };
  for (let i = 0; i < idx; i++) {
    const s = states[i];
    if (!s) return { ok: false, why: `${name(i)} has not run; the order is ${ITEMS.map((_, j) => name(j)).join(", ")}` };
    if (s.status === "stopped-at-cap") return { ok: false, why: `not done: the cap stopped ${name(i)}` };
    if (!restartRefusal(s, `run-${ITEMS[i]!.run}`)) return { ok: false, why: `${name(i)} crashed and may be restarted once: restart it first (--set ${ITEMS[i]!.set} --run ${ITEMS[i]!.run} --restart)` };
    spent += s.costUSD;
    if (ITEMS[i]!.group === ITEMS[idx]!.group) groupSpent += s.costUSD;
  }
  const groupCap = GROUP_CAP_USD[ITEMS[idx]!.group]!;
  const allowanceUSD = Math.min(CAP_USD - spent, groupCap === null ? Infinity : groupCap - groupSpent);
  if (allowanceUSD <= 0) return { ok: false, why: `not done: the cap is reached (spent $${spent.toFixed(4)} of $${CAP_USD})` };
  return { ok: true, allowanceUSD };
}

/** A run directory's run.json; a directory without one is a run that died at once. */
export function readRunJson(dir: string): { status: RunStatus; costUSD: number; voidCostUSD?: number } {
  const f = join(dir, "run.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { status: "running", costUSD: 0 };
}

/**
 * Each item's state, or null when run-<n>/ does not exist. Once run-<n>r/ exists it stands for the
 * item (061a): its status, and the spend of both directories (the void run's as the restart
 * recorded it, `voidCostUSD`, which also counts ledger spend run.json missed).
 */
export function readItemStates(bench: string): (ItemState | null)[] {
  return ITEMS.map((i) => {
    const dir = runDir(bench, i.set, i.run);
    if (!existsSync(dir)) return null;
    const first = readRunJson(dir);
    const firstScoreFiles = scoreFileCount(dir);
    const rdir = runDir(bench, i.set, i.run, true);
    if (!existsSync(rdir)) return { status: first.status, costUSD: first.costUSD, firstScoreFiles };
    const r = readRunJson(rdir);
    return { status: r.status, costUSD: (r.voidCostUSD ?? first.costUSD) + r.costUSD, restarted: true, firstStatus: first.status, firstScoreFiles };
  });
}

// ---- the rerun rule ----

/** A failure string from the reviewer or verifier that is a failed request (HTTP error, network, timeout), not an invalid reply. */
export const isRequestFailure = (failure: string | undefined) => !!failure && /request failed/.test(failure);

// ---- dev runs 4–6 (decision 064) ----
// More dev runs of the same pipeline for 064's vote across runs. Everything above (Cal.com, the order
// and cap of 061's items) is unchanged; these runs have their own order and cap, with the same rules:
// run 4, then 5, then 6; a cap stop leaves every later run not done; a crashed run may be restarted
// once (061a). Dev run 3 (stopped at 061's cap) is not part of this list and is never restarted.

export const DEV_EXTRA_RUNS = Object.freeze([4, 5, 6] as const);
export type DevExtraRun = (typeof DEV_EXTRA_RUNS)[number];
export const isDevExtraRun = (set: string | undefined, run: string | undefined) => set === "dev" && (DEV_EXTRA_RUNS as readonly number[]).map(String).includes(run ?? "");

/** 064's cap for dev runs 4–6, out of its $10 Nebius cap; the rest is left for judging the vote variants. */
export const EXTRA_CAP_USD = 8.5;
export const EXTRA_ITEMS = Object.freeze(DEV_EXTRA_RUNS.map((run) => Object.freeze({ set: "dev" as const, run, group: "dev-extra", plannedUSD: 1.8 })));

/** readItemStates over any item list. */
export function readStatesOf(bench: string, items: readonly { set: SetName; run: RunNumber }[]): (ItemState | null)[] {
  return items.map((i) => {
    const dir = runDir(bench, i.set, i.run);
    if (!existsSync(dir)) return null;
    const first = readRunJson(dir);
    const firstScoreFiles = scoreFileCount(dir);
    const rdir = runDir(bench, i.set, i.run, true);
    if (!existsSync(rdir)) return { status: first.status, costUSD: first.costUSD, firstScoreFiles };
    const r = readRunJson(rdir);
    return { status: r.status, costUSD: (r.voidCostUSD ?? first.costUSD) + r.costUSD, restarted: true, firstStatus: first.status, firstScoreFiles };
  });
}

/** planItem's rules for dev runs 4–6: one group, capped at EXTRA_CAP_USD. */
export function planExtraItem(run: DevExtraRun, states: (ItemState | null)[], restart = false): { ok: true; allowanceUSD: number } | { ok: false; why: string } {
  const idx = EXTRA_ITEMS.findIndex((i) => i.run === run);
  if (idx < 0) throw new Error(`no dev run ${run} in 064's list`);
  if (states.length !== EXTRA_ITEMS.length) throw new Error(`planExtraItem: ${states.length} states for ${EXTRA_ITEMS.length} items`);
  const name = (i: number) => `dev run ${EXTRA_ITEMS[i]!.run}`;
  let spent = 0;
  if (restart) {
    const why = restartRefusal(states[idx] ?? null, `run-${run}`);
    if (why) return { ok: false, why };
    spent = states[idx]!.costUSD;
  } else if (states[idx]) return { ok: false, why: `${name(idx)} already has a run directory` };
  for (let i = 0; i < idx; i++) {
    const s = states[i];
    if (!s) return { ok: false, why: `${name(i)} has not run; the order is ${EXTRA_ITEMS.map((_, j) => name(j)).join(", ")}` };
    if (s.status === "stopped-at-cap") return { ok: false, why: `not done: the cap stopped ${name(i)}` };
    if (!restartRefusal(s, `run-${EXTRA_ITEMS[i]!.run}`)) return { ok: false, why: `${name(i)} crashed and may be restarted once: restart it first (--set dev --run ${EXTRA_ITEMS[i]!.run} --restart)` };
    spent += s.costUSD;
  }
  const allowanceUSD = EXTRA_CAP_USD - spent;
  if (allowanceUSD <= 0) return { ok: false, why: `not done: the cap is reached (spent $${spent.toFixed(4)} of $${EXTRA_CAP_USD})` };
  return { ok: true, allowanceUSD };
}
