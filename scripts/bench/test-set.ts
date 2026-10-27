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
export type RunNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

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

// ---- dev runs 7–9, with a reviewer model chosen by --model (decision 067) ----
// The same pipeline, rules and judges; only the model of the reviewer and verifier stages may differ.
// Runs 7, 8, 9 in order under one $8 cap, counted per model: a non-default model's runs live in
// run-<n>-<model slug>/ and have their own order and cap. A crashed run may be restarted once (061a).

export const DEV_067_RUNS = Object.freeze([7, 8, 9] as const);
export type Dev067Run = (typeof DEV_067_RUNS)[number];
export const isDev067Run = (set: string | undefined, run: string | undefined) => set === "dev" && (DEV_067_RUNS as readonly number[]).map(String).includes(run ?? "");

/** 067's Nebius cap, judging included. */
export const CAP_067_USD = 8;
export const ITEMS_067 = Object.freeze(DEV_067_RUNS.map((run) => Object.freeze({ set: "dev" as const, run, group: "dev-067", plannedUSD: 2 })));

/** A model id as a directory name: "nvidia/Nemotron-3.5-Super-VL" → "nvidia-nemotron-3-5-super-vl". */
export const modelSlug = (model: string) => model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** run-<n>-<slug>/ (or run-<n>-<slug>r/ for its restart) for a non-default model; runDir's path when slug is null. */
export const modelRunDir = (bench: string, run: Dev067Run, slug: string | null, restart = false) =>
  slug === null ? runDir(bench, "dev", run, restart) : join(bench, "reviews/dev-repeat", `run-${run}-${slug}${restart ? "r" : ""}`);

/** readStatesOf for runs 7–9 of one model. */
export function readStates067(bench: string, slug: string | null): (ItemState | null)[] {
  return ITEMS_067.map((i) => {
    const dir = modelRunDir(bench, i.run, slug);
    if (!existsSync(dir)) return null;
    const first = readRunJson(dir);
    const firstScoreFiles = scoreFileCount(dir);
    const rdir = modelRunDir(bench, i.run, slug, true);
    if (!existsSync(rdir)) return { status: first.status, costUSD: first.costUSD, firstScoreFiles };
    const r = readRunJson(rdir);
    return { status: r.status, costUSD: (r.voidCostUSD ?? first.costUSD) + r.costUSD, restarted: true, firstStatus: first.status, firstScoreFiles };
  });
}

/** planExtraItem's rules for runs 7–9: one group, capped at CAP_067_USD. */
export function planDev067Item(run: Dev067Run, states: (ItemState | null)[], restart = false): { ok: true; allowanceUSD: number } | { ok: false; why: string } {
  const idx = ITEMS_067.findIndex((i) => i.run === run);
  if (idx < 0) throw new Error(`no dev run ${run} in 067's list`);
  if (states.length !== ITEMS_067.length) throw new Error(`planDev067Item: ${states.length} states for ${ITEMS_067.length} items`);
  const name = (i: number) => `dev run ${ITEMS_067[i]!.run}`;
  let spent = 0;
  if (restart) {
    const why = restartRefusal(states[idx] ?? null, `run-${run}`);
    if (why) return { ok: false, why };
    spent = states[idx]!.costUSD;
  } else if (states[idx]) return { ok: false, why: `${name(idx)} already has a run directory` };
  for (let i = 0; i < idx; i++) {
    const s = states[i];
    if (!s) return { ok: false, why: `${name(i)} has not run; the order is ${ITEMS_067.map((_, j) => name(j)).join(", ")}` };
    if (s.status === "stopped-at-cap") return { ok: false, why: `not done: the cap stopped ${name(i)}` };
    if (!restartRefusal(s, `run-${ITEMS_067[i]!.run}`)) return { ok: false, why: `${name(i)} crashed and may be restarted once: restart it first (--set dev --run ${ITEMS_067[i]!.run} --restart)` };
    spent += s.costUSD;
  }
  const allowanceUSD = CAP_067_USD - spent;
  if (allowanceUSD <= 0) return { ok: false, why: `not done: the cap is reached (spent $${spent.toFixed(4)} of $${CAP_067_USD})` };
  return { ok: true, allowanceUSD };
}

// ---- Cal.com run 4, v2 (decision 069) ----
// The one blind Cal.com run of v2, the second look at the test set: pool-verify-v1 at review-freeze-2
// with every stage on Nemotron 3.5 Super VL. Only `--set cal_dot_com --run 4 --model <MODEL_069>` with
// TRACEHOUND_TEST_RUN=069 reaches it; runs 1–3 still need 061 and checkRun, unchanged above. One item,
// its own $3 cap; a crashed run may be restarted once (061a) into run-4r-<slug>/, which stands for run 4.

export const TEST_RUN_ID_069 = "069";
export const MODEL_069 = "nvidia/Nemotron-3.5-Super-VL";
export const isCal069Run = (set: string | undefined, run: string | undefined) => set === TEST_SET && run === "4";

/** Throws unless the model is MODEL_069 and TRACEHOUND_TEST_RUN=069 is set. */
export function checkCal069(model: string | undefined, env: NodeJS.ProcessEnv): void {
  if (model !== MODEL_069) throw new Error(`refusing --set ${TEST_SET} --run 4: it needs --model ${MODEL_069} (decision 069)`);
  if (env[TEST_RUN_ENV] !== TEST_RUN_ID_069) throw new Error(`refusing --set ${TEST_SET} --run 4: it needs ${TEST_RUN_ENV}=${TEST_RUN_ID_069} in the environment (decision 069)`);
}

/** 069's Nebius cap, judging included. */
export const CAP_069_USD = 3;
export const ITEMS_069 = Object.freeze([Object.freeze({ set: "cal_dot_com" as const, run: 4 as const, group: "cal-069", plannedUSD: 1.5 })]);

/** test/run-4-<slug>/, or test/run-4r-<slug>/ for its one restart. */
export const cal069RunDir = (bench: string, restart = false) => join(bench, "test", `run-4${restart ? "r" : ""}-${modelSlug(MODEL_069)}`);

/** readStatesOf for run 4. */
export function readStates069(bench: string): (ItemState | null)[] {
  const dir = cal069RunDir(bench);
  if (!existsSync(dir)) return [null];
  const first = readRunJson(dir);
  const firstScoreFiles = scoreFileCount(dir);
  const rdir = cal069RunDir(bench, true);
  if (!existsSync(rdir)) return [{ status: first.status, costUSD: first.costUSD, firstScoreFiles }];
  const r = readRunJson(rdir);
  return [{ status: r.status, costUSD: (r.voidCostUSD ?? first.costUSD) + r.costUSD, restarted: true, firstStatus: first.status, firstScoreFiles }];
}

/** planDev067Item's rules for the one item: capped at CAP_069_USD, the void run's spend carried on a restart. */
export function planCal069Item(states: (ItemState | null)[], restart = false): { ok: true; allowanceUSD: number } | { ok: false; why: string } {
  if (states.length !== ITEMS_069.length) throw new Error(`planCal069Item: ${states.length} states for ${ITEMS_069.length} items`);
  let spent = 0;
  if (restart) {
    const why = restartRefusal(states[0] ?? null, "run-4");
    if (why) return { ok: false, why };
    spent = states[0]!.costUSD;
  } else if (states[0]) return { ok: false, why: `${TEST_SET} run 4 already has a run directory` };
  const allowanceUSD = CAP_069_USD - spent;
  if (allowanceUSD <= 0) return { ok: false, why: `not done: the cap is reached (spent $${spent.toFixed(4)} of $${CAP_069_USD})` };
  return { ok: true, allowanceUSD };
}

// ---- dev runs 10–11, Nemotron 3 Ultra on the free NVIDIA API (decision 071) ----
// The same pipeline, prompts, rules and judges as 067; only the reviewer and verifier model differs:
// Nemotron 3 Ultra, whose requests go to the NVIDIA API (TRACEHOUND_NVIDIA_API=1 for those stages
// only; llm/client.ts). Runs 10, then 11, under one $3 Nebius cap (the judges: Ultra calls are free
// and ledgered at $0). Records in run-<n>-<model slug>/. A crashed run may be restarted once (061a).

export const DEV_071_RUNS = Object.freeze([10, 11] as const);
export type Dev071Run = (typeof DEV_071_RUNS)[number];
/** llm/client.ts's NVIDIA_API_MODEL (pinned equal by a test). */
export const MODEL_071 = "nvidia/nemotron-3-ultra-550b-a55b";
export const isDev071Run = (set: string | undefined, run: string | undefined) => set === "dev" && (DEV_071_RUNS as readonly number[]).map(String).includes(run ?? "");

/** Throws unless the model is exactly MODEL_071. */
export function checkDev071(model: string | undefined): void {
  if (model !== MODEL_071) throw new Error(`refusing --set dev --run 10|11: it needs --model ${MODEL_071} (decision 071)`);
}

/** 071's Nebius cap: the judges (the reviewer and verifier calls cost $0). */
export const CAP_071_USD = 3;
export const ITEMS_071 = Object.freeze(DEV_071_RUNS.map((run) => Object.freeze({ set: "dev" as const, run, group: "dev-071", plannedUSD: 0.2 })));

/** run-<n>-<slug>/, or run-<n>-<slug>r/ for its one restart. */
export const dev071RunDir = (bench: string, run: Dev071Run, restart = false) => join(bench, "reviews/dev-repeat", `run-${run}-${modelSlug(MODEL_071)}${restart ? "r" : ""}`);

/** readStatesOf for runs 10–11. */
export function readStates071(bench: string): (ItemState | null)[] {
  return ITEMS_071.map((i) => {
    const dir = dev071RunDir(bench, i.run);
    if (!existsSync(dir)) return null;
    const first = readRunJson(dir);
    const firstScoreFiles = scoreFileCount(dir);
    const rdir = dev071RunDir(bench, i.run, true);
    if (!existsSync(rdir)) return { status: first.status, costUSD: first.costUSD, firstScoreFiles };
    const r = readRunJson(rdir);
    return { status: r.status, costUSD: (r.voidCostUSD ?? first.costUSD) + r.costUSD, restarted: true, firstStatus: first.status, firstScoreFiles };
  });
}

/** planDev067Item's rules for runs 10–11: one group, capped at CAP_071_USD. */
export function planDev071Item(run: Dev071Run, states: (ItemState | null)[], restart = false): { ok: true; allowanceUSD: number } | { ok: false; why: string } {
  const idx = ITEMS_071.findIndex((i) => i.run === run);
  if (idx < 0) throw new Error(`no dev run ${run} in 071's list`);
  if (states.length !== ITEMS_071.length) throw new Error(`planDev071Item: ${states.length} states for ${ITEMS_071.length} items`);
  const name = (i: number) => `dev run ${ITEMS_071[i]!.run}`;
  let spent = 0;
  if (restart) {
    const why = restartRefusal(states[idx] ?? null, `run-${run}`);
    if (why) return { ok: false, why };
    spent = states[idx]!.costUSD;
  } else if (states[idx]) return { ok: false, why: `${name(idx)} already has a run directory` };
  for (let i = 0; i < idx; i++) {
    const s = states[i];
    if (!s) return { ok: false, why: `${name(i)} has not run; the order is ${ITEMS_071.map((_, j) => name(j)).join(", ")}` };
    if (s.status === "stopped-at-cap") return { ok: false, why: `not done: the cap stopped ${name(i)}` };
    if (!restartRefusal(s, `run-${ITEMS_071[i]!.run}`)) return { ok: false, why: `${name(i)} crashed and may be restarted once: restart it first (--set dev --run ${ITEMS_071[i]!.run} --model ${MODEL_071} --restart)` };
    spent += s.costUSD;
  }
  const allowanceUSD = CAP_071_USD - spent;
  if (allowanceUSD <= 0) return { ok: false, why: `not done: the cap is reached (spent $${spent.toFixed(4)} of $${CAP_071_USD})` };
  return { ok: true, allowanceUSD };
}
