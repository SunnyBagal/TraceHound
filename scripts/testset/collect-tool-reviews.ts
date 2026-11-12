#!/usr/bin/env node
/**
 * collect-tool-reviews.ts (B2): one review tool's comments on the fork case PRs, as neutral review files.
 *
 *   node scripts/testset/collect-tool-reviews.ts --side dev --tool <name> --config <json> --repo SunnyBagal/<fork>
 *     --manifest <cases manifest> --pr-map <json {case: PR number}> --window-start <ISO> --window-end <ISO>
 *     --out <dir> [--resume-file <open-prs resume.jsonl>] [--ids a,b] [--gh-bin gh] [--heldout-ok]
 *
 * Counting rule (docs/eval/ts-protocol.md §3, the rule of bench/convert.ts): top-level line-level review comments by
 * the tool's own accounts. The accounts are a config value (`{v: 1, tools: {<name>: {logins: [...]}}}`), never
 * hard-coded, because they are frozen only after S1 reads real logins. A comment counts when: its author's login is in
 * the list (GitHub logins compare case-insensitively), it is not a reply, it was created inside the window, and it was
 * made on the case head (commit_id or original_commit_id). Each comment counts once, by id. Replies, review bodies,
 * summaries, issue comments and other accounts are excluded (and counted).
 * Completion (decision 076c item 2, Planner B's U1): `completed` if a listed login posted any review object, inline
 * review comment or issue comment on the PR after the trigger and inside the window, except a message that matches one
 * of the tool's `notCompletion` patterns (rate-limit or error messages; config value, frozen with the logins,
 * case-insensitive regular expressions, an explicit [] allowed). "After the trigger" is the tool's first
 * `triggered:<tool>` record for the case in --resume-file (tracehound-testset scripts/open-prs.ts); without
 * --resume-file it is the window start, and the collection file says which bound applied. Issue comments are read for
 * completion only: counted comments stay inline only. Otherwise the case is `no-review`. A PR whose base or head is not
 * the case's pair is `invalid-binding` (the attempt is invalid; nothing is substituted).
 * Reads only, with exact `gh api --method GET repos/SunnyBagal/<fork>/pulls/<n>[/comments|/reviews]` and
 * `.../issues/<n>/comments` argv, gh's own auth from an allowlisted env, cwd a temp dir; gh's stderr is never echoed.
 * Output: <out>/<tool>/<case>.json (neutral reviews, completed cases), <out>/raw/<tool>/<case>.json (every API object
 * read), <out>/<tool>.status.json ({case: completed | no-review | invalid-binding}), <out>/<tool>.collection.json
 * (window, logins, notCompletion patterns, completion bound, counts, sha256 of every file). stdout: counts only. Never
 * overwrites.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, readJson, RefusalError, sha256, writeNew, type Comment } from "./kit.ts";

const FORK_RE = /^SunnyBagal\/[A-Za-z0-9._-]+$/;
const ENV_ALLOW = ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR", "XDG_CONFIG_HOME"];
const PER_PAGE = 100;
const MAX_PAGES = 50;

export function assertGhRead(argv: string[], repo: string): void {
  const p = argv[3] ?? "";
  const ok = argv.length === 4 && argv[0] === "api" && argv[1] === "--method" && argv[2] === "GET" && FORK_RE.test(repo)
    && new RegExp(`^repos/${repo.replace(/[.]/g, "\\.")}/(?:pulls/\\d+(?:/(?:comments|reviews)\\?per_page=${PER_PAGE}&page=\\d+)?|issues/\\d+/comments\\?per_page=${PER_PAGE}&page=\\d+)$`).test(p);
  if (!ok) throw new RefusalError("internal: a gh call outside the read-only allowlist was refused");
}

type Gh = (argv: string[]) => { ok: boolean; json: unknown };
interface ManifestCase { id: string; title: string; base_sha: string; case_head_sha: string }
interface ApiComment { id?: unknown; user?: { login?: unknown; type?: unknown } | null; in_reply_to_id?: unknown; created_at?: unknown;
  commit_id?: unknown; original_commit_id?: unknown; path?: unknown; line?: unknown; original_line?: unknown; body?: unknown }
interface ApiReview { id?: unknown; user?: { login?: unknown } | null; submitted_at?: unknown; commit_id?: unknown; state?: unknown; body?: unknown }
interface ApiIssueComment { id?: unknown; user?: { login?: unknown } | null; created_at?: unknown; body?: unknown }

function pages(gh: Gh, repo: string, n: number, kind: "comments" | "reviews" | "issue-comments"): unknown[] | null {
  const all: unknown[] = [];
  const base = kind === "issue-comments" ? `repos/${repo}/issues/${n}/comments` : `repos/${repo}/pulls/${n}/${kind}`;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = gh(["api", "--method", "GET", `${base}?per_page=${PER_PAGE}&page=${page}`]);
    if (!r.ok || !Array.isArray(r.json)) return null;
    all.push(...r.json);
    if (r.json.length < PER_PAGE) return all;
  }
  return null; // more than MAX_PAGES pages: refuse rather than truncate
}

export interface CaseCollection {
  status: "completed" | "no-review" | "invalid-binding" | "read-failed";
  comments: Comment[];
  excluded: { otherAuthor: number; reply: number; outsideWindow: number; otherCommit: number; duplicate: number };
  /** what made the case completed (each object by a listed login after the bound), and the messages left out by pattern */
  completion: { review: number; inline: number; issueComment: number; notCompletion: number };
  raw: { pr: unknown; comments: unknown[]; reviews: unknown[]; issueComments: unknown[] } | null;
}

/**
 * `from`: the completion bound ("after the trigger"), at or after `start`; `notCompletion`: the tool's frozen patterns.
 * Counting is unchanged: inline comments only, inside the window, on the case head.
 */
export function collectCase(gh: Gh, repo: string, n: number, c: ManifestCase, logins: string[], start: number, end: number,
  completion: { from: number; notCompletion: RegExp[] } = { from: start, notCompletion: [] }): CaseCollection {
  const excluded = { otherAuthor: 0, reply: 0, outsideWindow: 0, otherCommit: 0, duplicate: 0 };
  const done = { review: 0, inline: 0, issueComment: 0, notCompletion: 0 };
  const pr = gh(["api", "--method", "GET", `repos/${repo}/pulls/${n}`]);
  if (!pr.ok) return { status: "read-failed", comments: [], excluded, completion: done, raw: null };
  const p = pr.json as { base?: { sha?: unknown }; head?: { sha?: unknown } };
  if (p?.base?.sha !== c.base_sha || p?.head?.sha !== c.case_head_sha) {
    return { status: "invalid-binding", comments: [], excluded, completion: done, raw: { pr: pr.json, comments: [], reviews: [], issueComments: [] } };
  }
  const comments = pages(gh, repo, n, "comments");
  const reviews = pages(gh, repo, n, "reviews");
  const issueComments = pages(gh, repo, n, "issue-comments");
  if (!comments || !reviews || !issueComments) return { status: "read-failed", comments: [], excluded, completion: done, raw: null };
  const allowed = new Set(logins.map((l) => l.toLowerCase()));
  const inWindow = (t: unknown) => { const ms = typeof t === "string" ? Date.parse(t) : NaN; return Number.isFinite(ms) && ms >= start && ms <= end; };
  const seen = new Set<unknown>();
  const out: Comment[] = [];
  for (const raw of comments as ApiComment[]) {
    if (seen.has(raw.id)) { excluded.duplicate++; continue; }
    seen.add(raw.id);
    if (typeof raw.user?.login !== "string" || !allowed.has(raw.user.login.toLowerCase())) { excluded.otherAuthor++; continue; }
    if (raw.in_reply_to_id !== undefined && raw.in_reply_to_id !== null) { excluded.reply++; continue; }
    if (!inWindow(raw.created_at)) { excluded.outsideWindow++; continue; }
    if (raw.commit_id !== c.case_head_sha && raw.original_commit_id !== c.case_head_sha) { excluded.otherCommit++; continue; }
    if (typeof raw.path !== "string" || typeof raw.body !== "string") { excluded.otherAuthor++; continue; }
    const line = typeof raw.line === "number" ? raw.line : typeof raw.original_line === "number" ? raw.original_line : null;
    out.push({ path: raw.path, line, body: raw.body });
  }
  // completion: any object by a listed login, after the bound and inside the window, that is not a rate-limit/error message
  const listed = (u: { login?: unknown } | null | undefined) => typeof u?.login === "string" && allowed.has(u.login.toLowerCase());
  const afterTrigger = (t: unknown) => inWindow(t) && Date.parse(t as string) >= completion.from;
  const marks = (body: unknown) => {
    if (typeof body === "string" && completion.notCompletion.some((re) => re.test(body))) { done.notCompletion++; return false; }
    return true;
  };
  for (const r of reviews as ApiReview[]) if (listed(r.user) && afterTrigger(r.submitted_at) && r.commit_id === c.case_head_sha && marks(r.body)) done.review++;
  for (const r of comments as ApiComment[]) if (listed(r.user) && afterTrigger(r.created_at) && marks(r.body)) done.inline++;
  for (const r of issueComments as ApiIssueComment[]) if (listed(r.user) && afterTrigger(r.created_at) && marks(r.body)) done.issueComment++;
  const completed = done.review + done.inline + done.issueComment > 0;
  return { status: completed ? "completed" : "no-review", comments: out, excluded, completion: done, raw: { pr: pr.json, comments, reviews, issueComments } };
}

/** The tool's first `triggered:<tool>` time per case from an open-prs.ts resume file (JSONL; other records ignored). */
export function triggerTimes(file: string, repo: string, tool: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let r: { fork?: unknown; id?: unknown; step?: unknown; at?: unknown };
    try { r = JSON.parse(line); } catch { if (i === lines.length - 1) return; throw new RefusalError(`--resume-file line ${i + 1} is not JSON`); }
    if (r.step !== `triggered:${tool}`) return;
    if (r.fork !== repo) throw new RefusalError(`--resume-file line ${i + 1} is for ${String(r.fork)}, not ${repo}`);
    const at = typeof r.at === "string" ? Date.parse(r.at) : NaN;
    if (typeof r.id !== "string" || !Number.isFinite(at)) throw new RefusalError(`--resume-file line ${i + 1}: a trigger record needs id and at`);
    if (!out.has(r.id) || at < out.get(r.id)!) out.set(r.id, at);
  });
  return out;
}

export function main(argv: string[], deps: { log?: (l: string) => void; env?: NodeJS.ProcessEnv } = {}): number {
  const log = deps.log ?? console.log;
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, tool: { type: "string" }, config: { type: "string" },
      repo: { type: "string" }, manifest: { type: "string" }, "pr-map": { type: "string" }, ids: { type: "string" },
      "window-start": { type: "string" }, "window-end": { type: "string" }, out: { type: "string" }, "gh-bin": { type: "string", default: "gh" },
      "resume-file": { type: "string" },
    } });
    const side = checkSide(values.side, values["heldout-ok"]!, [values.config, values.manifest, values["pr-map"], values.out, values["resume-file"]]);
    if (!values.tool || !values.config || !values.repo || !values.manifest || !values["pr-map"] || !values.out || !values["window-start"] || !values["window-end"]) {
      throw new RefusalError("usage: collect-tool-reviews.ts --side dev --tool <name> --config <json> --repo SunnyBagal/<fork> --manifest <f> --pr-map <f> --window-start <ISO> --window-end <ISO> --out <dir>");
    }
    if (!FORK_RE.test(values.repo)) throw new RefusalError("--repo must be SunnyBagal/<fork>");
    if (!/^[a-z0-9-]+$/.test(values.tool)) throw new RefusalError("--tool must be a lower-case name");
    const start = Date.parse(values["window-start"]), end = Date.parse(values["window-end"]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !/Z$/.test(values["window-start"]) || !/Z$/.test(values["window-end"])) {
      throw new RefusalError("--window-start/--window-end must be UTC ISO instants (…Z), start before end");
    }
    const config = readJson(values.config) as { v?: number; tools?: Record<string, { logins?: unknown; notCompletion?: unknown }> };
    const logins = config?.v === 1 ? config.tools?.[values.tool]?.logins : undefined;
    if (!Array.isArray(logins) || !logins.length || logins.some((l) => typeof l !== "string" || !l.trim())) {
      throw new RefusalError(`--config has no login list for ${values.tool} (it is frozen after S1 reads real logins)`);
    }
    const patterns = config.tools?.[values.tool]?.notCompletion;
    if (!Array.isArray(patterns) || patterns.some((x) => typeof x !== "string" || !x.trim())) {
      throw new RefusalError(`--config has no notCompletion list for ${values.tool} (rate-limit and error message patterns, decision 076c item 2; [] only if none is known)`);
    }
    const notCompletion = (patterns as string[]).map((x) => {
      try { return new RegExp(x, "i"); } catch { throw new RefusalError(`--config: notCompletion pattern ${JSON.stringify(x)} is not a regular expression`); }
    });
    const triggers = values["resume-file"] ? triggerTimes(values["resume-file"], values.repo, values.tool) : null;
    const manifest = readJson(values.manifest) as ManifestCase[];
    const prMap = readJson(values["pr-map"]) as Record<string, number>;
    const ids = values.ids ? values.ids.split(",").filter(Boolean) : manifest.map((c) => c.id);
    for (const id of ids) {
      if (!manifest.some((c) => c.id === id)) throw new RefusalError(`${id} is not in the manifest`);
      if (!Number.isSafeInteger(prMap[id]) || prMap[id]! <= 0) throw new RefusalError(`${id} has no PR number in --pr-map`);
      if (triggers && !triggers.has(id)) throw new RefusalError(`${id} has no triggered:${values.tool} record in --resume-file`);
      for (const f of [path.join(values.out, values.tool, `${id}.json`), path.join(values.out, "raw", values.tool, `${id}.json`)]) {
        if (fs.existsSync(f)) throw new RefusalError(`${f} exists; never overwritten`);
      }
    }
    for (const f of [`${values.tool}.status.json`, `${values.tool}.collection.json`]) if (fs.existsSync(path.join(values.out, f))) throw new RefusalError(`${path.join(values.out, f)} exists; never overwritten`);
    const src = deps.env ?? process.env;
    const env: NodeJS.ProcessEnv = { ...Object.fromEntries(ENV_ALLOW.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])),
      GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", LC_ALL: "C" };
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "collect-tool-reviews-"));
    const gh: Gh = (a) => {
      assertGhRead(a, values.repo!);
      const r = spawnSync(values["gh-bin"]!, a, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) return { ok: false, json: null };
      try { return { ok: true, json: JSON.parse(r.stdout) }; } catch { return { ok: false, json: null }; }
    };
    const status: Record<string, string> = {};
    const hashes: Record<string, string> = {};
    const totals = { completed: 0, "no-review": 0, "invalid-binding": 0, "read-failed": 0, comments: 0,
      excluded: { otherAuthor: 0, reply: 0, outsideWindow: 0, otherCommit: 0, duplicate: 0 },
      completion: { review: 0, inline: 0, issueComment: 0, notCompletion: 0 } };
    for (const id of ids) {
      const c = manifest.find((x) => x.id === id)!;
      const from = Math.max(start, triggers?.get(id) ?? start);
      const r = collectCase(gh, values.repo, prMap[id]!, c, logins as string[], start, end, { from, notCompletion });
      status[id] = r.status;
      totals[r.status]++;
      totals.comments += r.comments.length;
      for (const k of Object.keys(r.excluded) as (keyof CaseCollection["excluded"])[]) totals.excluded[k] += r.excluded[k];
      for (const k of Object.keys(r.completion) as (keyof CaseCollection["completion"])[]) totals.completion[k] += r.completion[k];
      if (r.raw) {
        const text = JSON.stringify(r.raw, null, 1) + "\n";
        writeNew(path.join(values.out, "raw", values.tool, `${id}.json`), text);
        hashes[`raw/${values.tool}/${id}.json`] = sha256(text);
      }
      if (r.status === "completed") {
        const text = JSON.stringify({ pr_title: c.title, pr_number: prMap[id], comments: r.comments }, null, 1) + "\n";
        writeNew(path.join(values.out, values.tool, `${id}.json`), text);
        hashes[`${values.tool}/${id}.json`] = sha256(text);
      }
    }
    fs.rmSync(cwd, { recursive: true, force: true });
    const statusText = JSON.stringify(status, null, 1) + "\n";
    writeNew(path.join(values.out, `${values.tool}.status.json`), statusText);
    writeNew(path.join(values.out, `${values.tool}.collection.json`), JSON.stringify({ v: 1, side, tool: values.tool, repo: values.repo,
      window: { start: values["window-start"], end: values["window-end"] }, logins, notCompletion: patterns,
      completionFrom: triggers ? "first trigger (--resume-file)" : "window start", collectedAt: new Date().toISOString(), totals,
      files: { ...hashes, [`${values.tool}.status.json`]: sha256(statusText) } }, null, 1) + "\n");
    log(`${values.tool}: ${ids.length} case(s): completed ${totals.completed}, no-review ${totals["no-review"]}, invalid-binding ${totals["invalid-binding"]}, read-failed ${totals["read-failed"]}; `
      + `${totals.comments} counted comment(s); excluded: other author ${totals.excluded.otherAuthor}, reply ${totals.excluded.reply}, outside window ${totals.excluded.outsideWindow}, other commit ${totals.excluded.otherCommit}, duplicate ${totals.excluded.duplicate}`);
    log(`${values.tool}: completion objects after ${triggers ? "the first trigger" : "the window start"}: review ${totals.completion.review}, inline ${totals.completion.inline}, issue comment ${totals.completion.issueComment}; not completion (pattern) ${totals.completion.notCompletion}`);
    return totals["read-failed"] ? 1 : 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
