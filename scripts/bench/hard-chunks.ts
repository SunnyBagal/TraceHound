// Decision 074: recovery of empty replies on the hard-chunk set, with the cache bypassed (standing rule, 073a).
// Hard chunks: the reviewer chunks that failed in 3.5 dev runs 7r, 8, 9 (20 failures = 14 distinct chunk requests).
// Each request is drawn fresh 3 times (no response cache: neither read nor written). Arms share each first draw:
//   A = current settings: lenient parser; an invalid reply (empty or not) gets the append retry (reasoning on).
//   D = A, except an EMPTY first reply: the chunk is split in half and each half is reviewed once (lenient, no retry).
//   E = A, except an EMPTY first reply: one retry of the original messages with reasoning off and JSON-schema output.
//   (C, a reasoning token budget, is dropped: neither Token Factory nor the 3.5 model card offers one; 074.)
// A non-empty invalid first reply gets A's append retry in every arm (one shared call).
//   node scripts/bench/hard-chunks.ts check [--bench <dir>]   $0: rebuild the requests and verify them, no call
//   TRACEHOUND_BUDGET_RUN_USD=4 node scripts/bench/hard-chunks.ts run [--bench <dir>]
//   node scripts/bench/hard-chunks.ts report [--bench <dir>]
// stdout gets counts only; reply bodies and records stay in <bench>/hard-chunks-074/.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { cleanGitEnv } from "../../packages/analyzer/src/git-env.ts";
import { Budget, BudgetExceededError, capsFromEnv } from "../../packages/analyzer/src/llm/budget.ts";
import { ResponseCache } from "../../packages/analyzer/src/llm/cache.ts";
import { TokenFactoryClient, type ChatRequest, type ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import { SpendLedger } from "../../packages/analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../packages/analyzer/src/llm/prices.ts";
import { buildChunkContext, CONTEXT_BUDGET_CHARS, gitSource, type GitSource } from "../../packages/analyzer/src/review/context.ts";
import { chunkDiff, CHUNK_LIMIT_CHARS, parseDiff, renderChunk } from "../../packages/analyzer/src/review/diff.ts";
import { REVIEW_CTX_SYSTEM_PROMPT, reviewCtxUserMessage } from "../../packages/analyzer/src/review/prompt-ctx.ts";
import { REVIEW_SYSTEM_PROMPT, reviewUserMessage } from "../../packages/analyzer/src/review/prompt.ts";
import { reviewPullWithContext } from "../../packages/analyzer/src/review/review-ctx.ts";
import { DiffIndex, parseReviewReply, REASONING_OFF, REASONING_ON, reviewPull, type PullInput } from "../../packages/analyzer/src/review/review.ts";
import { mulberry32 } from "./dev-3-5.ts";
import { checkBench } from "./recovery-ab.ts";

/** Fisher–Yates with mulberry32 (dev-3-5.ts), deterministic per seed. */
export function mulberry32Shuffle<T>(xs: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const DECISION = "074";
/** main at the plan's start (073a's last commit); the review code must equal it. */
export const BASE_074 = "fef2fc2";
export const MODEL = "nvidia/Nemotron-3.5-Super-VL";
export const JOB_CAP_USD = 4;
export const DRAWS = 3;
export const SEED = 74;
/** Units (one chunk request × one draw) in flight at once. */
export const CONCURRENCY = 4;
/** The gate needs at least this many complete paired units (of 42). */
export const MIN_COMPLETE = 30;
export const SOURCE_RUNS = Object.freeze({ "7r": "run-7-nvidia-nemotron-3-5-super-vlr", "8": "run-8-nvidia-nemotron-3-5-super-vl", "9": "run-9-nvidia-nemotron-3-5-super-vl" });
export const DEV_REPOS = Object.freeze(["sentry", "grafana", "keycloak", "discourse"]);
export const outDir = (bench: string) => join(bench, "hard-chunks-074");
/** The review shape as JSON Schema (prompt.ts asks for {"findings":[{path,line,body}]}). */
export const FINDINGS_SCHEMA = Object.freeze({
  type: "object",
  properties: { findings: { type: "array", items: { type: "object", properties: { path: { type: "string" }, line: { type: "integer" }, body: { type: "string" } }, required: ["path", "line", "body"], additionalProperties: false } } },
  required: ["findings"],
  additionalProperties: false,
});
export const RESPONSE_FORMAT = Object.freeze({ type: "json_schema", json_schema: { name: "review_findings", schema: FINDINGS_SCHEMA, strict: true } });

const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
export type Stage = "diff" | "ctx";
export interface HardChunk { id: string; pull: string; stage: Stage; index: number; runs: string[] }

/** The failed reviewer chunks of the used attempts of runs 7r, 8, 9, by distinct (pull, stage, chunk). */
export function hardChunks(bench: string): HardChunk[] {
  const byId = new Map<string, HardChunk>();
  for (const [run, dir] of Object.entries(SOURCE_RUNS)) {
    const r = readJson<{ pulls: { repo: string; file: string; attempts: number }[] }>(join(bench, "reviews/dev-repeat", dir, "run.json"));
    for (const p of r.pulls) {
      // checked before any path is built from the record: a dev repo, files 0.json … 9.json, attempt 1 or 2
      if (!DEV_REPOS.includes(p.repo) || !/^\d\.json$/.test(p.file) || (p.attempts !== 1 && p.attempts !== 2)) throw new Error(`run ${run}: unexpected pull record ${JSON.stringify({ repo: p.repo, file: p.file, attempts: p.attempts })}`);
      const name = p.file.replace(/\.json$/, "");
      const a = readJson<Record<Stage, { review: { chunks: { index: number; status: string }[] } }>>(join(bench, "reviews/dev-repeat", dir, "attempts", p.repo, `${name}.attempt-${p.attempts}.json`));
      for (const stage of ["diff", "ctx"] as const)
        for (const c of a[stage].review.chunks)
          if (c.status === "CHUNK_FAILED") {
            const id = `${p.repo}/${name}#${stage}${c.index}`;
            const h = byId.get(id) ?? { id, pull: `${p.repo}/${name}`, stage, index: c.index, runs: [] };
            h.runs.push(run);
            byId.set(id, h);
          }
    }
  }
  const out = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const failures = out.reduce((t, h) => t + h.runs.length, 0);
  if (failures !== EXPECTED.failures || out.length !== EXPECTED.distinct) throw new Error(`hard-chunk set: ${failures} failures / ${out.length} distinct, expected ${EXPECTED.failures} / ${EXPECTED.distinct}`);
  return out;
}
/** Registered in 074 (from the 073a audit): 20 failed chunks in runs 7r/8/9, 14 distinct chunk requests. */
export const EXPECTED = Object.freeze({ failures: 20, distinct: 14 });

// ---- requests ----

export function firstRequest(stage: Stage, input: PullInput, text: string, part: number, parts: number, source: GitSource | null): ChatRequest {
  const renderedChunk = renderChunk(text);
  const user =
    stage === "diff"
      ? reviewUserMessage({ title: input.title, description: input.description, renderedChunk, part, parts })
      : reviewCtxUserMessage({ title: input.title, description: input.description, renderedChunk, part, parts, context: buildChunkContext(source!, text, CONTEXT_BUDGET_CHARS).text });
  return { model: MODEL, temperature: 0, max_tokens: 32_000, messages: [{ role: "system", content: stage === "diff" ? REVIEW_SYSTEM_PROMPT : REVIEW_CTX_SYSTEM_PROMPT }, { role: "user", content: user }], ...REASONING_ON };
}
/** review.ts's append retry after an invalid reply. */
export function appendRetry(first: ChatRequest, content: string, why: string): ChatRequest {
  return { ...first, messages: [...first.messages, { role: "assistant", content }, { role: "user", content: `Your reply was invalid: ${why}. Reply again with only the JSON object in the shape given.` }] };
}
export function schemaRetry(first: ChatRequest): ChatRequest & { response_format: typeof RESPONSE_FORMAT } {
  return { ...first, ...REASONING_OFF, response_format: RESPONSE_FORMAT };
}
/** Two halves: by files (balanced by size) when the chunk has ≥ 2 files, else by hunks of its one file; null if neither splits. */
export function splitHalves(text: string): [string, string] | null {
  const files = parseDiff(text);
  if (files.length >= 2) {
    const total = files.reduce((s, f) => s + f.text.length, 0);
    let acc = 0;
    let k = 0;
    while (k < files.length - 1 && acc + files[k]!.text.length <= total / 2) acc += files[k++]!.text.length;
    if (k === 0) k = 1;
    return [files.slice(0, k).map((f) => f.text).join(""), files.slice(k).map((f) => f.text).join("")];
  }
  const f = files[0];
  if (!f || f.hunks.length < 2) return null;
  const total = f.hunks.reduce((s, h) => s + h.text.length, 0);
  let acc = 0;
  let k = 0;
  while (k < f.hunks.length - 1 && acc + f.hunks[k]!.text.length <= total / 2) acc += f.hunks[k++]!.text.length;
  if (k === 0) k = 1;
  return [f.header + f.hunks.slice(0, k).map((h) => h.text).join(""), f.header + f.hunks.slice(k).map((h) => h.text).join("")];
}

/** The pipeline's own first requests for a pull request, captured with a fake model ($0), in chunk order per stage. */
export async function capturedFirsts(input: PullInput, repo: { source: GitSource; head: string }): Promise<Record<Stage, ChatRequest[]>> {
  const seen: Record<Stage, ChatRequest[]> = { diff: [], ctx: [] };
  const fake: ChatClient = {
    chat: async (r: ChatRequest): Promise<ChatResult> => {
      seen[r.messages[0]!.content === REVIEW_SYSTEM_PROMPT ? "diff" : "ctx"].push(r);
      return { content: '{"findings":[]}', cached: false, latencyMs: 0, costUSD: 0, finishReason: "stop" };
    },
  };
  await reviewPull(fake, input, { model: MODEL });
  await reviewPullWithContext(fake, input, repo, { model: MODEL });
  return seen;
}

export interface Plan {
  chunk: HardChunk;
  input: PullInput;
  first: ChatRequest;
  halves: [ChatRequest, ChatRequest] | null;
  key: string;
}

/** Builds and verifies every request: the builder's full-chunk request equals the pipeline's (key), and the key equals 073r's. */
export async function plans(bench: string, sourceFor: (gitDir: string, head: string) => GitSource = gitSource, keys073?: Map<string, string>): Promise<Plan[]> {
  const out: Plan[] = [];
  for (const c of hardChunks(bench)) {
    const [repo, name] = c.pull.split("/") as [string, string];
    if (!DEV_REPOS.includes(repo)) throw new Error(`not a dev repo: ${repo}`);
    const input = readJson<PullInput & { body?: string }>(join(bench, "prs", repo, `${name}.json`));
    const pin: PullInput = { title: input.title, description: input.description ?? input.body ?? "", diff: input.diff, ...(typeof input.number === "number" && { number: input.number }) };
    const head = readJson<Record<string, { head: string }>>(join(bench, "repos", `${repo}.heads.json`))[name]!.head;
    const source = sourceFor(join(bench, "repos", repo), head);
    const chunks = chunkDiff(parseDiff(pin.diff), CHUNK_LIMIT_CHARS);
    const text = chunks[c.index]!.text;
    const first = firstRequest(c.stage, pin, text, c.index + 1, chunks.length, source);
    const pipelineFirst = (await capturedFirsts(pin, { source, head }))[c.stage][c.index];
    const key = ResponseCache.key(MODEL, first);
    if (!pipelineFirst || ResponseCache.key(MODEL, pipelineFirst) !== key) throw new Error(`${c.id}: the rebuilt request differs from the pipeline's`);
    if (keys073 && keys073.get(c.id) !== key) throw new Error(`${c.id}: ${keys073.has(c.id) ? "the request differs from 073's" : "no 073r key for this chunk"}`);
    const h = splitHalves(text);
    if (out.some((o) => o.key === key)) throw new Error(`${c.id}: duplicate request key`);
    out.push({ chunk: c, input: pin, first, halves: h && [firstRequest(c.stage, pin, h[0], c.index + 1, chunks.length, source), firstRequest(c.stage, pin, h[1], c.index + 1, chunks.length, source)], key });
  }
  return out;
}

/** 073r's arm-A first-attempt keys by chunk id (the same requests as runs 7r/8/9, decision 073a). */
export function keysFrom073(bench: string): Map<string, string> {
  const f = join(bench, "recovery-073r/provenance.json");
  const m = new Map<string, string>();
  if (!existsSync(f)) throw new Error("recovery-073r/provenance.json is missing: 073's keys are required");
  for (const p of readJson<{ arm: string; pull: string; stage: string; kind: string; chunk?: number; attempt: number; key: string }[]>(f))
    if (p.arm === "A" && p.kind === "first" && p.attempt === 1 && (p.stage === "diff" || p.stage === "ctx")) m.set(`${p.pull}#${p.stage}${p.chunk}`, p.key);
  return m;
}

// ---- one call, one step, one unit ----

export interface Step {
  ok: boolean;
  error?: string;
  finishReason?: string;
  contentEmpty?: boolean;
  outputTokens?: number;
  reasoningTokens?: number;
  costUSD: number;
  latencyMs: number;
  valid: boolean;
  findings: number;
  kept: number;
}
export type ArmOutcome = { success: boolean; valid: boolean; kept: number; costUSD: number; wallMs: number; complete: boolean; note?: string };
export interface Unit {
  chunk: string;
  draw: number;
  path?: "valid" | "invalid" | "empty" | "error";
  first?: Step;
  shared?: Step; // A's append retry: used by every arm after a non-empty invalid reply, by A alone after an empty one
  halves?: Step[] | "unsplittable";
  schema?: Step | "dropped";
  arms?: Record<"A" | "D" | "E", ArmOutcome>;
  /** the unit met the job cap: what it received is kept above; it is incomplete */
  capStop?: string;
  complete: boolean;
}

export async function step(client: ChatClient, request: ChatRequest, index: DiffIndex, save: (body: { content: string }) => void): Promise<Step & { content: string }> {
  try {
    const r = await client.chat(request, { purpose: "review" });
    save({ content: r.content });
    const p = parseReviewReply(r.content, "lenient");
    const kept = p.ok ? p.findings.filter((f) => index.check(f).ok).length : 0;
    return { ok: true, content: r.content, ...(r.finishReason !== undefined && { finishReason: r.finishReason }), contentEmpty: !r.content.trim(), ...(r.outputTokens !== undefined && { outputTokens: r.outputTokens }), ...(r.reasoningTokens !== undefined && { reasoningTokens: r.reasoningTokens }), costUSD: r.costUSD, latencyMs: r.latencyMs, valid: p.ok, findings: p.ok ? p.findings.length : 0, kept };
  } catch (e) {
    if (e instanceof BudgetExceededError) throw e;
    return { ok: false, content: "", error: `${(e as Error).name}: ${(e as Error).message}`.slice(0, 300), costUSD: 0, latencyMs: 0, valid: false, findings: 0, kept: 0 };
  }
}
const strip = ({ content: _c, ...s }: Step & { content: string }): Step => s;

/** The endpoint refusing the feature itself: an HTTP 4xx whose message names response_format / json_schema / schema / guided decoding. */
export const schemaRefused = (s: Step) => !s.ok && /HTTP 4\d\d/.test(s.error ?? "") && /response_format|json_schema|schema|guided/i.test(s.error ?? "");

/** Shared across units: the first E request is a capability probe; later E requests wait for it, and none is sent after a refusal. */
export interface SchemaState {
  schemaDropped: boolean;
  /** set once an E request has returned a reply, or the feature was refused: no more probing */
  probeDone?: boolean;
  probe?: Promise<void> | undefined;
}

const findingKey = (f: unknown) => JSON.stringify(f);

/** A unit never throws: a cap refusal is recorded on the unit (`capStop`) with everything it already received. */
export async function runUnit(client: ChatClient, plan: Plan, draw: number, state: SchemaState, save: (name: string, body: unknown) => void): Promise<Unit> {
  const u: Unit = { chunk: plan.chunk.id, draw, complete: false };
  const index = new DiffIndex(parseDiff(plan.input.diff));
  const capped = (e: unknown) => {
    if (!(e instanceof BudgetExceededError)) throw e;
    u.capStop = `${e.name}: ${e.message}`;
    return u;
  };
  let s1: Step & { content: string };
  try {
    s1 = await step(client, plan.first, index, (b) => save("first", b));
  } catch (e) {
    return capped(e);
  }
  u.first = strip(s1);
  if (!s1.ok) return (u.path = "error"), u;
  const success = (s: Step) => s.ok && s.valid && s.kept > 0;
  if (s1.valid) {
    u.path = "valid";
    const o = { success: success(s1), valid: true, kept: s1.kept, costUSD: s1.costUSD, wallMs: s1.latencyMs, complete: true };
    u.arms = { A: o, D: o, E: o };
    return (u.complete = true), u;
  }
  const appendReq = appendRetry(plan.first, s1.content, (parseReviewReply(s1.content, "lenient") as { why: string }).why);
  if (!s1.contentEmpty) {
    u.path = "invalid";
    let s2: Step & { content: string };
    try {
      s2 = await step(client, appendReq, index, (b) => save("append", b));
    } catch (e) {
      return capped(e);
    }
    u.shared = strip(s2);
    const o = { success: success(s2), valid: s2.valid, kept: s2.kept, costUSD: s1.costUSD + s2.costUSD, wallMs: s1.latencyMs + s2.latencyMs, complete: s2.ok };
    u.arms = { A: o, D: o, E: o };
    return (u.complete = s2.ok), u;
  }
  u.path = "empty";
  // E: every E reply updates the shared decision at once; while a probe is out, others wait (re-checked in a loop)
  const sendSchema = () =>
    step(client, schemaRetry(plan.first), index, (b) => save("schema", b)).then((e) => {
      if (schemaRefused(e)) state.schemaDropped = true;
      else if (e.ok) state.probeDone = true;
      return e;
    });
  const schemaStep = async (): Promise<(Step & { content: string }) | null> => {
    while (state.probe) await state.probe;
    if (state.schemaDropped) return null;
    if (state.probeDone) return sendSchema();
    const mine = sendSchema();
    const probe: Promise<void> = mine.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      if (state.probe === probe) state.probe = undefined;
    });
    state.probe = probe;
    return mine;
  };
  const [ra, rd, re] = await Promise.allSettled([
    step(client, appendReq, index, (b) => save("append", b)),
    plan.halves ? Promise.allSettled(plan.halves.map((h, i) => step(client, h, index, (b) => save(`half-${i + 1}`, b)))) : Promise.resolve(null),
    schemaStep(),
  ]);
  // record everything that came back, then stop if any call met the cap
  const a = ra.status === "fulfilled" ? ra.value : null;
  const halves = rd.status === "fulfilled" ? rd.value : null;
  const d = halves && halves.every((h) => h.status === "fulfilled") ? halves.map((h) => (h as PromiseFulfilledResult<Step & { content: string }>).value) : null;
  const e = re.status === "fulfilled" ? re.value : null;
  if (a) u.shared = strip(a);
  if (halves) u.halves = halves.flatMap((h) => (h.status === "fulfilled" ? [strip(h.value)] : []));
  else if (!plan.halves) u.halves = "unsplittable";
  if (re.status === "fulfilled") u.schema = e ? strip(e) : "dropped";
  const rejected = [ra, rd, re, ...(halves ?? [])].find((x): x is PromiseRejectedResult => x.status === "rejected");
  if (rejected) return capped(rejected.reason);
  const A: ArmOutcome = { success: success(a!), valid: a!.valid, kept: a!.kept, costUSD: s1.costUSD + a!.costUSD, wallMs: s1.latencyMs + a!.latencyMs, complete: a!.ok };
  // D: success = at least one half valid with >= 1 kept finding ("any half"); valid = both halves valid; kept = distinct findings
  let D: ArmOutcome;
  if (d) {
    const kept = new Set<string>();
    for (const h of d) {
      const p = parseReviewReply(h.content, "lenient");
      if (p.ok) for (const f of p.findings) {
        const c = index.check(f);
        if (c.ok) kept.add(findingKey(c));
      }
    }
    const any = d.some((h) => success(h));
    D = { success: any, valid: d.every((h) => h.valid), kept: kept.size, costUSD: s1.costUSD + d.reduce((t, h) => t + h.costUSD, 0), wallMs: s1.latencyMs + Math.max(...d.map((h) => h.latencyMs)), complete: d.every((h) => h.ok), ...(any && !d.every((h) => h.valid) && { note: "one half" }) };
  } else D = { success: false, valid: false, kept: 0, costUSD: s1.costUSD, wallMs: s1.latencyMs, complete: true, note: "unsplittable" };
  const E: ArmOutcome = e
    ? schemaRefused(e)
      ? { success: false, valid: false, kept: 0, costUSD: s1.costUSD + e.costUSD, wallMs: s1.latencyMs + e.latencyMs, complete: true, note: "E unsupported" }
      : { success: success(e), valid: e.valid, kept: e.kept, costUSD: s1.costUSD + e.costUSD, wallMs: s1.latencyMs + e.latencyMs, complete: e.ok }
    : { success: false, valid: false, kept: 0, costUSD: s1.costUSD, wallMs: s1.latencyMs, complete: true, note: "E unsupported" };
  u.arms = { A, D, E };
  u.complete = A.complete && D.complete && E.complete;
  return u;
}

// ---- analysis and gate ----

export interface ArmRow { arm: "A" | "D" | "E"; units: number; success: number; share: number; valid: number; keptPerSuccess: number | null; costPerUnit: number; wallMsPerUnit: number }
export function analyze(units: Unit[], schemaDropped: boolean) {
  const done = units.filter((u) => u.complete && u.arms);
  const row = (arm: "A" | "D" | "E"): ArmRow => {
    const o = done.map((u) => u.arms![arm]);
    const s = o.filter((x) => x.success);
    return { arm, units: o.length, success: s.length, share: o.length ? s.length / o.length : 0, valid: o.filter((x) => x.valid).length, keptPerSuccess: s.length ? s.reduce((t, x) => t + x.kept, 0) / s.length : null, costPerUnit: o.length ? o.reduce((t, x) => t + x.costUSD, 0) / o.length : 0, wallMsPerUnit: o.length ? o.reduce((t, x) => t + x.wallMs, 0) / o.length : 0 };
  };
  const rows = { A: row("A"), D: row("D"), E: row("E") };
  const enough = done.length >= MIN_COMPLETE;
  const wins = (x: ArmRow) => x.success >= Math.max(1.5 * rows.A.success, rows.A.success + 1) && x.costPerUnit <= 1.5 * rows.A.costPerUnit + 1e-12;
  const gate = {
    D: !enough ? "INCONCLUSIVE" : wins(rows.D) ? "WIN" : "NO WIN",
    E: schemaDropped ? "DROPPED (unsupported)" : !enough ? "INCONCLUSIVE" : wins(rows.E) ? "WIN" : "NO WIN",
  };
  const paths = { valid: 0, invalid: 0, empty: 0, error: 0 } as Record<string, number>;
  for (const u of units) if (u.path) paths[u.path]!++;
  const empties = units.filter((u) => u.path === "empty" && u.first);
  return {
    units: units.length,
    complete: done.length,
    paths,
    emptyFirst: { n: empties.length, finishLength: empties.filter((u) => u.first!.finishReason === "length").length, reasoningAll: empties.filter((u) => u.first!.reasoningTokens !== undefined && u.first!.reasoningTokens === u.first!.outputTokens).length },
    unsplittable: units.filter((u) => u.halves === "unsplittable").length,
    rows,
    gate,
  };
}

// ---- the job ----

/** packages/analyzer/src and config equal BASE_074; scripts/bench may only add files; nothing uncommitted there. */
export function freezeCheck074(root = REPO_ROOT) {
  const git = (args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: cleanGitEnv() });
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const d = git(["diff", "--name-only", "--diff-filter=DMTUXB", BASE_074, "HEAD", "--", "packages/analyzer/src", "config", "scripts/bench"]);
  if (d.status !== 0) return { ok: false, why: "git diff failed", head };
  if (d.stdout.trim()) return { ok: false, why: `changed since ${BASE_074}: ${d.stdout.trim().split("\n").join(", ")}`, head };
  const st = git(["status", "--porcelain", "--untracked-files=all", "--", "packages/analyzer/src", "config", "scripts/bench"]);
  if (st.stdout.trim()) return { ok: false, why: "uncommitted files", head };
  return { ok: true, head };
}

export interface Deps { bench: string; stateDir: string; pricesFile: string; env: NodeJS.ProcessEnv; log: (l: string) => void; err: (l: string) => void; fetch?: typeof fetch; freezeCheck?: () => { ok: boolean; why?: string; head: string }; source?: (gitDir: string, head: string) => GitSource; repoRoot?: string; keys073?: Map<string, string> }

export async function runJob(mode: "check" | "run", deps: Deps): Promise<number> {
  const where = checkBench(deps.bench, deps.repoRoot ?? REPO_ROOT);
  if (!where.ok) return (deps.err(`[hard-chunks] refusing: ${where.why}`), 1);
  const bench = where.bench;
  let ps: Plan[];
  try {
    ps = await plans(bench, deps.source ?? gitSource, deps.keys073 ?? keysFrom073(bench));
  } catch (e) {
    return (deps.err(`[hard-chunks] refusing: ${(e as Error).message}`), 1);
  }
  const occurrences = ps.reduce((s, p) => s + p.chunk.runs.length, 0);
  deps.log(`hard chunks: ${ps.length} distinct requests (${occurrences} failures in runs 7r/8/9); splittable ${ps.filter((p) => p.halves).length}; every request equals the pipeline's and 073r's`);
  if (mode === "check") return 0;
  const freeze = (deps.freezeCheck ?? freezeCheck074)();
  if (!freeze.ok) return (deps.err(`[hard-chunks] refusing: ${freeze.why}`), 1);
  const caps = capsFromEnv(deps.env);
  if (caps.runUSD < JOB_CAP_USD) return (deps.err(`[hard-chunks] refusing: set TRACEHOUND_BUDGET_RUN_USD=${JOB_CAP_USD}`), 1);
  if (!deps.env.NEBIUS_API_KEY) return (deps.err("[hard-chunks] NEBIUS_API_KEY is not set"), 1);
  const dir = outDir(bench);
  try {
    mkdirSync(dir);
  } catch {
    return (deps.err(`[hard-chunks] refusing: ${dir} exists`), 1);
  }
  const ledger = new SpendLedger(join(deps.stateDir, "spend.jsonl"));
  const ledgerStartUSD = ledger.totalUSD();
  const budget = new Budget({ runUSD: JOB_CAP_USD, totalUSD: Math.min(caps.totalUSD, ledgerStartUSD + JOB_CAP_USD) }, ledgerStartUSD);
  // standing rule (073a): no response cache for the requests under test, neither read nor written
  const client = new TokenFactoryClient({ apiKey: deps.env.NEBIUS_API_KEY, baseUrl: deps.env.NEBIUS_BASE_URL, prices: loadPriceTable(deps.pricesFile), budget, ledger, timeoutMs: 600_000, ...(deps.fetch && { fetch: deps.fetch }) });
  // units: draw 1 of every chunk (seeded order), then draw 2, then draw 3
  const order: { plan: Plan; draw: number }[] = [];
  for (let d = 1; d <= DRAWS; d++) for (const p of mulberry32Shuffle(ps, SEED + d)) order.push({ plan: p, draw: d });
  const units: Unit[] = [];
  const state: SchemaState = { schemaDropped: false };
  const run = { decision: DECISION, head: freeze.head, plan: ps.map((p) => ({ id: p.chunk.id, key: p.key, runs: p.chunk.runs, splittable: !!p.halves })), order: order.map((o) => `${o.plan.chunk.id}@${o.draw}`), model: MODEL, draws: DRAWS, seed: SEED, concurrency: CONCURRENCY, ledgerStartUSD, caps: budget.caps, startedAt: new Date().toISOString(), finishedAt: null as string | null, status: "running", error: null as string | null, schemaDropped: false, spendUSD: 0 };
  const save = () => {
    run.schemaDropped = state.schemaDropped;
    run.spendUSD = budget.runSpent;
    writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 1) + "\n");
    writeFileSync(join(dir, "units.json"), JSON.stringify(units, null, 1) + "\n");
  };
  save();
  let next = 0;
  const stop: { err: Error | null } = { err: null };
  const worker = async () => {
    while (!stop.err && next < order.length) {
      const { plan, draw } = order[next++]!;
      try {
        const u = await runUnit(client, plan, draw, state, (name, body) => {
          mkdirSync(join(dir, "bodies"), { recursive: true });
          writeFileSync(join(dir, "bodies", `${plan.chunk.id.replace(/[/#]/g, "_")}-d${draw}-${name}.json`), JSON.stringify(body));
        });
        units.push(u);
        if (u.capStop) stop.err ??= new BudgetExceededError(u.capStop); // the cap: no new unit starts
      } catch (e) {
        stop.err ??= e as Error; // not a cap refusal (a bug): stop, keep what is recorded
        units.push({ chunk: plan.chunk.id, draw, complete: false });
      }
      save();
      deps.err(`[hard-chunks] unit ${units.length}/${order.length} · spend $${budget.runSpent.toFixed(4)}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const stopped = stop.err;
  run.status = stopped ? (stopped instanceof BudgetExceededError ? "stopped-at-cap" : "failed") : "complete";
  run.error = stopped ? `${stopped.name}: ${stopped.message}` : null;
  run.finishedAt = new Date().toISOString();
  save();
  for (const l of report(units, state.schemaDropped, ledger.totalUSD() - ledgerStartUSD, run.status)) deps.log(l);
  return stopped ? 2 : 0;
}

export function report(units: Unit[], schemaDropped: boolean, spendUSD: number, status: string): string[] {
  const r = analyze(units, schemaDropped);
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  const L = [
    `status ${status} · spend $${spendUSD.toFixed(4)} · units ${r.units} (complete ${r.complete}) · first reply: valid ${r.paths.valid}, invalid non-empty ${r.paths.invalid}, empty ${r.paths.empty}, request error ${r.paths.error}`,
    `empty first replies ${r.emptyFirst.n}: finish length ${r.emptyFirst.finishLength}, reasoning = all output tokens ${r.emptyFirst.reasoningAll} · unsplittable for D ${r.unsplittable}`,
    "",
    "| arm | complete units | success (valid, ≥1 kept finding) | share | valid replies | kept per success | cost per unit | wall per unit |",
    "|---|---|---|---|---|---|---|---|",
    ...(["A", "D", "E"] as const).map((a) => {
      const x = r.rows[a];
      return `| ${a} | ${x.units} | ${x.success} | ${pct(x.share)} | ${x.valid} | ${x.keptPerSuccess === null ? "n/a" : x.keptPerSuccess.toFixed(1)} | $${x.costPerUnit.toFixed(4)} | ${(x.wallMsPerUnit / 1000).toFixed(0)} s |`;
    }),
    "",
    `gate (≥ max(1.5 × A, A + 1) successes and ≤ 1.5 × A's cost per unit; ≥ ${MIN_COMPLETE} complete units): D ${r.gate.D} · E ${r.gate.E}`,
  ];
  return L;
}

if (import.meta.main) {
  const mode = process.argv[2];
  const i = process.argv.indexOf("--bench");
  const bench = i >= 0 ? process.argv[i + 1]! : join(homedir(), "Projects/tracehound-bench");
  const deps: Deps = { bench, stateDir: join(REPO_ROOT, ".tracehound"), pricesFile: join(REPO_ROOT, "config/prices.json"), env: process.env, log: (l) => console.log(l), err: (l) => console.error(l) };
  if (mode === "report") {
    const d = outDir(bench);
    const run = readJson<{ schemaDropped: boolean; ledgerStartUSD: number; status: string }>(join(d, "run.json"));
    for (const l of report(readJson<Unit[]>(join(d, "units.json")), run.schemaDropped, new SpendLedger(join(deps.stateDir, "spend.jsonl")).totalUSD() - run.ledgerStartUSD, run.status)) console.log(l);
  } else if (mode === "check" || mode === "run") {
    try {
      if (mode === "run" && !process.env.NEBIUS_API_KEY) process.loadEnvFile(join(REPO_ROOT, ".env"));
    } catch {
      // runJob reports the missing key
    }
    process.exitCode = await runJob(mode, deps);
  } else {
    console.error("usage: hard-chunks.ts check|run|report [--bench <dir>]");
    process.exitCode = 1;
  }
}
