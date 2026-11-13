/**
 * Delete the dev case branches from the four forks (decision 076d item 1b, 076e item 5; docs/specs/P1.md §3b).
 *
 *   node scripts/testset/delete-dev-branches.ts --cases <tracehound-testset/cases/dev/manifest.json>
 *     --clones <tracehound-testset/repos> --out <new dir> [--execute] [--gh-bin gh] [--git-bin git]
 *
 * Input is the dev case list (an array of {id, repo}, as in cases/dev/manifest.json). The only branches it ever deletes
 * are `cases/<id>` and `cases/<id>-base` for an id in that list, on SunnyBagal/<that case's repo>. Every check below runs
 * on all four forks (SunnyBagal/{medusa,payload,twenty,bullmq}) before anything is deleted, and any failed check deletes
 * nothing anywhere (exit 2):
 *   - a path argument naming held-out (a `heldout` / `held-out` segment, as given, resolved or behind symlinks), or an id
 *     that is not `case-NNN`, is refused before anything is read; there is no flag that lifts this;
 *   - each fork: `gh api --method GET repos/SunnyBagal/<r>` must be a fork of its upstream, owned by SunnyBagal; its
 *     default branch must equal `git ls-remote --symref <url> HEAD`, and is never deleted (a listed ref equal to it
 *     refuses);
 *   - a `refs/heads/cases/*` branch on a fork that is not one of the listed cases' two refs for that fork (another
 *     fork's case, an unknown id, bullmq's any) refuses: the script never deletes "all case branches", only the list;
 *   - every branch to delete must have the same sha in the local clone (`<clones>/<repo>`), so a push from the clone
 *     can undo the deletion; `branches.before.<repo>.txt` (sha <tab> ref, P1 §3b's format) is written first;
 *   - no `url.*.insteadOf` / `pushInsteadOf` may rewrite the fork's URL, and `git ls-remote --get-url` must return it.
 *
 * Without --execute this is a dry run: the reads above plus `git push --dry-run` of the same delete refspecs. With
 * --execute, one atomic push per fork (`--atomic`, a `--force-with-lease=<ref>:<listed sha>` per ref, so a branch that
 * moved since the listing fails the whole fork's push), forks in the order medusa, payload, twenty, bullmq; a failed
 * push stops before the next fork. The push runs from an empty bare repository under --out (no clone config, hooks or
 * objects involved); the clones are only read and keep every ref.
 *
 * Every action (each command, with its argv and exit) is a line with its UTC time in <out>/delete-dev-branches.log.jsonl
 * and on stdout. The run ends with one line per fork: case branches left (`refs/heads/cases/*`), open PRs, and
 * `refs/pull/*` refs (with how many are `refs/pull/<n>/head`), also in <out>/summary.json.
 * Every one of those counts is required, in dry run and execute: a read that fails, or prints anything that is not a
 * well-formed line (a `refs/pull/*` line must be `<sha> <tab> refs/pull/<n>/<name>`; an open-PR page must be an array of
 * PR objects with a number), makes that count unknown, and an unknown count fails the run (codex NO-GO on 74f6c78,
 * P2-1). A valid empty listing is 0.
 * Exit: 0 dry run passed with every count known, or --execute deleted everything and every fork ends with 0 case
 * branches and 0 open PRs, every count known; 1 a push failed, a count is unknown, or a fork does not end clean;
 * 2 refused (nothing deleted).
 *
 * Firewall: the open-PR count is a `gh` read of the forks' pulls, so this runs before T0 only (P1 §3b), never in the
 * window. No network in tests (fixtures inject the runner).
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { RefusalError, resolveLinks } from "./kit.ts";

export const OWNER = "SunnyBagal";
/** The four forks, in the order they are checked and deleted. */
export const FORKS = ["medusa", "payload", "twenty", "bullmq"] as const;
export const UPSTREAM: Readonly<Record<string, string>> = {
  medusa: "medusajs/medusa", payload: "payloadcms/payload", twenty: "twentyhq/twenty", bullmq: "taskforcesh/bullmq",
};
const SHA_RE = /^[0-9a-f]{40}$/;
const ID_RE = /^case-\d{3}$/;
const CMD_TIMEOUT_MS = 180_000;
const PUSH_TIMEOUT_MS = 300_000;
const ENV_ALLOW = ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"];
const GH_ENV_ALLOW = ["GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR", "XDG_CONFIG_HOME"];

export interface RunResult { status: number | null; stdout: string; stderr: string }
export type Runner = (bin: string, argv: string[], o: { cwd: string; env: Record<string, string>; timeoutMs: number }) => RunResult;
export interface Deps {
  run?: Runner;
  now?: () => number;
  say?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  /** The fork's URL; tests point it at a local bare repository. Never set from the command line. */
  url?: (repo: string) => string;
}
interface Opts { cases: string; clones: string; out: string; execute: boolean; gh: string; git: string }
interface Branch { ref: string; sha: string }
interface ForkPlan { repo: string; url: string; defaultBranch: string; before: Branch[]; del: Branch[] }
export interface ForkCounts { caseBranches: number | null; openPrs: number | null; pullRefs: number | null; pullHeadRefs: number | null }

const realRun: Runner = (bin, argv, o) => {
  const r = spawnSync(bin, argv, { cwd: o.cwd, env: o.env, encoding: "utf8", timeout: o.timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** A path names held-out if any segment (as given, resolved, or behind symlinks) says so. */
function namesHeldout(p: string): boolean {
  const hit = (x: string) => x.split(path.sep).some((s) => /held-?out/i.test(s) || /^tracehound-ho(-|$)/i.test(s));
  return hit(p) || hit(path.resolve(p)) || hit(resolveLinks(p));
}

export function parseCli(argv: string[]): Opts {
  const { values } = parseArgs({
    args: argv, strict: true, allowPositionals: false,
    options: {
      cases: { type: "string" }, clones: { type: "string" }, out: { type: "string" }, execute: { type: "boolean", default: false },
      "gh-bin": { type: "string", default: "gh" }, "git-bin": { type: "string", default: "git" },
    },
  });
  for (const k of ["cases", "clones", "out"] as const) if (!values[k]) throw new RefusalError(`--${k} is required`);
  for (const p of [values.cases!, values.clones!, values.out!]) if (namesHeldout(p)) throw new RefusalError(`refused: a held-out path: ${p}`);
  return { cases: values.cases!, clones: values.clones!, out: values.out!, execute: values.execute!, gh: values["gh-bin"]!, git: values["git-bin"]! };
}

/** The dev case list: ids `case-NNN`, unique, each on one of the four forks. Returns the allowed refs per fork. */
export function readCaseList(file: string): Map<string, Set<string>> {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new RefusalError(`--cases ${file}: ${(e as Error).message}`); }
  if (!Array.isArray(raw) || raw.length === 0) throw new RefusalError("--cases must be a non-empty array of {id, repo}");
  const allowed = new Map<string, Set<string>>(FORKS.map((r) => [r, new Set<string>()]));
  const seen = new Set<string>();
  for (const c of raw) {
    const id = (c as { id?: unknown })?.id, repo = (c as { repo?: unknown })?.repo;
    if (typeof id !== "string" || !ID_RE.test(id)) throw new RefusalError(`refused: case id ${JSON.stringify(id)} is not case-NNN (dev cases only)`);
    if (typeof repo !== "string" || !allowed.has(repo)) throw new RefusalError(`${id}: repo ${JSON.stringify(repo)} is not one of ${FORKS.join(", ")}`);
    if (seen.has(id)) throw new RefusalError(`${id} is listed twice`);
    seen.add(id);
    allowed.get(repo)!.add(`refs/heads/cases/${id}`).add(`refs/heads/cases/${id}-base`);
  }
  return allowed;
}

export function main(argv: string[], deps: Deps = {}): number {
  const say = deps.say ?? ((l: string) => process.stdout.write(l + "\n"));
  try {
    return run(parseCli(argv), deps, say);
  } catch (e) {
    if (e instanceof RefusalError) { say(`refused: ${e.message.replace(/^refused: /, "")}`); return 2; }
    throw e;
  }
}

function run(o: Opts, deps: Deps, say: (l: string) => void): number {
  const allowed = readCaseList(o.cases);
  if (fs.existsSync(o.out) && fs.readdirSync(o.out).length) throw new RefusalError(`--out ${o.out} is not empty; never overwritten`);
  if (!fs.statSync(o.clones, { throwIfNoEntry: false })?.isDirectory()) throw new RefusalError(`--clones ${o.clones} is not a directory`);
  fs.mkdirSync(o.out, { recursive: true });
  const now = deps.now ?? Date.now;
  const runner = deps.run ?? realRun;
  const src = deps.env ?? process.env;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]!]));
  const gitEnv = { ...pick(ENV_ALLOW), LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" };
  const ghEnv = { ...pick([...ENV_ALLOW, ...GH_ENV_ALLOW]), LC_ALL: "C", GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" };
  const logFile = path.join(o.out, "delete-dev-branches.log.jsonl");
  const log = (event: string, rec: Record<string, unknown> = {}) => {
    const at = new Date(now()).toISOString();
    const fd = fs.openSync(logFile, "a");
    try { fs.writeSync(fd, JSON.stringify({ at, event, ...rec }) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    say(`${at} ${event}${event === "cmd" ? " " + rec.tool + " " + (rec.argv as string[]).join(" ") : ""}${rec.exit !== undefined ? ` -> exit ${rec.exit}` : ""}${rec.note ? ` ${rec.note}` : ""}`);
  };
  const pushRepo = path.resolve(o.out, "push.git");
  const cmd = (tool: "gh" | "git", argv: string[], timeoutMs = CMD_TIMEOUT_MS, cwd = pushRepo): RunResult => {
    log("cmd", { tool, argv });
    const r = runner(tool === "gh" ? o.gh : o.git, argv, { cwd, env: tool === "gh" ? ghEnv : gitEnv, timeoutMs });
    log("cmd-end", { tool, argv, exit: r.status });
    return r;
  };
  const urlOf = deps.url ?? ((repo: string) => `https://github.com/${OWNER}/${repo}.git`);

  log("start", { mode: o.execute ? "execute" : "dry-run", cases: path.resolve(o.cases), listed: [...allowed.values()].reduce((n, s) => n + s.size / 2, 0) });
  fs.mkdirSync(pushRepo);
  if (cmd("git", ["init", "--bare", "--quiet", pushRepo], CMD_TIMEOUT_MS, o.out).status !== 0) throw new RefusalError("git init of the empty push repository failed");

  // ---- every check on every fork before anything is deleted ----
  const plans: ForkPlan[] = [];
  for (const repo of FORKS) {
    const fork = `${OWNER}/${repo}`, url = urlOf(repo);
    const v = cmd("gh", ["api", "--method", "GET", `repos/${fork}`]);
    let meta: { full_name?: unknown; fork?: unknown; owner?: { login?: unknown }; parent?: { full_name?: unknown }; default_branch?: unknown };
    try { meta = JSON.parse(v.stdout); } catch { meta = {}; }
    if (v.status !== 0) throw new RefusalError(`${fork}: gh api repos/${fork} failed (exit ${v.status})`);
    if (meta.full_name !== fork || meta.fork !== true || meta.owner?.login !== OWNER || meta.parent?.full_name !== UPSTREAM[repo]) {
      throw new RefusalError(`${fork} is not ${OWNER}'s fork of ${UPSTREAM[repo]}`);
    }
    const defaultBranch = meta.default_branch;
    if (typeof defaultBranch !== "string" || !defaultBranch) throw new RefusalError(`${fork}: no default branch in gh api`);

    const rw = cmd("git", ["config", "--get-regexp", "^url\\."]);
    if (rw.status !== 0 && rw.status !== 1) throw new RefusalError(`git config --get-regexp ^url\\. failed (exit ${rw.status})`);
    for (const line of rw.stdout.split("\n").filter(Boolean)) {
      const [key, ...rest] = line.split(" ");
      const prefix = rest.join(" ");
      if (/\.(push)?insteadof$/i.test(key!) && prefix && url.startsWith(prefix)) throw new RefusalError(`${fork}: git config ${key} rewrites ${url}`);
    }
    const gu = cmd("git", ["ls-remote", "--get-url", url]);
    if (gu.status !== 0 || gu.stdout.trim() !== url) throw new RefusalError(`${fork}: git ls-remote --get-url does not return ${url} unchanged`);

    const head = cmd("git", ["ls-remote", "--symref", url, "HEAD"]);
    const sym = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(head.stdout)?.[1];
    if (head.status !== 0 || !sym) throw new RefusalError(`${fork}: git ls-remote --symref HEAD gave no default branch (exit ${head.status})`);
    if (sym !== defaultBranch) throw new RefusalError(`${fork}: default branch differs (gh ${defaultBranch}, git ${sym})`);

    const before = listCaseBranches(cmd("git", ["ls-remote", "--heads", url]), fork);
    const ok = allowed.get(repo)!;
    const foreign = before.filter((b) => !ok.has(b.ref));
    if (foreign.length) {
      throw new RefusalError(`${fork}: ${foreign.length} case branch(es) not in the list for ${repo} (first ${foreign[0]!.ref}); nothing deleted`);
    }
    const del = before.filter((b) => ok.has(b.ref));
    for (const b of del) if (b.ref === `refs/heads/${defaultBranch}`) throw new RefusalError(`${fork}: ${b.ref} is the default branch; never deleted`);
    if (del.length) {
      const clone = path.join(o.clones, repo);
      if (namesHeldout(clone)) throw new RefusalError(`refused: a held-out path: ${clone}`);
      if (!fs.statSync(clone, { throwIfNoEntry: false })?.isDirectory()) throw new RefusalError(`${fork}: clone ${clone} is not a directory`);
      for (const b of del) {
        const rp = cmd("git", ["-C", clone, "rev-parse", "--verify", "--quiet", `${b.ref}^{commit}`]);
        const local = rp.stdout.trim();
        if (rp.status !== 0 || local !== b.sha) throw new RefusalError(`${fork}: ${b.ref} differs from the clone (fork ${b.sha}, clone ${local || "missing"}); nothing deleted`);
      }
    }
    fs.writeFileSync(path.join(o.out, `branches.before.${repo}.txt`), before.map((b) => `${b.sha}\t${b.ref}\n`).join(""));
    log("planned", { fork, defaultBranch, caseBranches: before.length, toDelete: del.length, refs: del.map((b) => b.ref) });
    plans.push({ repo, url, defaultBranch, before, del });
  }

  // ---- push: dry run, or one atomic lease-checked push per fork ----
  let failed = false;
  for (const p of plans) {
    if (!p.del.length) { log("nothing-to-delete", { fork: `${OWNER}/${p.repo}` }); continue; }
    const argv = ["-c", "core.hooksPath=/dev/null", "push", "--atomic", "--porcelain", "--no-verify", ...(o.execute ? [] : ["--dry-run"]),
      ...p.del.map((b) => `--force-with-lease=${b.ref}:${b.sha}`), p.url, ...p.del.map((b) => `:${b.ref}`)];
    const r = cmd("git", argv, PUSH_TIMEOUT_MS);
    const deleted = p.del.filter((b) => new RegExp(`^-\\t:${escapeRe(b.ref)}\\t\\[deleted\\]$`, "m").test(r.stdout)).length;
    log(o.execute ? "deleted" : "would-delete", { fork: `${OWNER}/${p.repo}`, ok: r.status === 0, count: deleted, of: p.del.length });
    if (r.status !== 0 || deleted !== p.del.length) {
      failed = true;
      log("stop", { note: `push to ${OWNER}/${p.repo} did not ${o.execute ? "delete" : "plan"} all ${p.del.length} refs; later forks untouched` });
      break;
    }
  }

  // ---- end: per-fork counts ----
  const counts: Record<string, ForkCounts> = {};
  for (const p of plans) {
    const fork = `${OWNER}/${p.repo}`;
    const heads = cmd("git", ["ls-remote", "--heads", p.url]);
    let left: Branch[] | null = null;
    try { if (heads.status === 0) left = listCaseBranches(heads, fork); } catch { left = null; }
    if (left) fs.writeFileSync(path.join(o.out, `branches.after.${p.repo}.txt`), left.map((b) => `${b.sha}\t${b.ref}\n`).join(""));
    const pullRefs = listPullRefs(cmd("git", ["ls-remote", p.url, "refs/pull/*"]));
    counts[p.repo] = {
      caseBranches: left ? left.length : null,
      openPrs: openPrCount((page) => cmd("gh", ["api", "--method", "GET", `repos/${fork}/pulls?state=open&per_page=100&page=${page}`])),
      pullRefs: pullRefs ? pullRefs.length : null,
      pullHeadRefs: pullRefs ? pullRefs.filter((ref) => /^refs\/pull\/\d+\/head$/.test(ref)).length : null,
    };
  }
  // every count is required in both modes (076e item 5): a failed or unreadable read is "unknown", and unknown is a failure
  const unknown = plans.flatMap((p) => Object.entries(counts[p.repo]!).filter(([, v]) => v === null).map(([k]) => `${p.repo}.${k}`));
  const clean = Object.values(counts).every((c) => c.caseBranches === 0 && c.openPrs === 0);
  const exit = failed || unknown.length || (o.execute && !clean) ? 1 : 0;
  const summary = { v: 1, at: new Date(now()).toISOString(), mode: o.execute ? "execute" : "dry-run", exit, failed, unknown, counts };
  fs.writeFileSync(path.join(o.out, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  for (const p of plans) {
    const c = counts[p.repo]!;
    log("count", { fork: `${OWNER}/${p.repo}`, ...c, note: `${p.repo} case-branches=${c.caseBranches ?? "unknown"} open-prs=${c.openPrs ?? "unknown"} refs-pull=${c.pullRefs ?? "unknown"} (head ${c.pullHeadRefs ?? "unknown"})` });
  }
  const note = failed ? "FAILED: a push did not complete"
    : unknown.length ? `FAILED: count unknown (${unknown.join(", ")})`
    : o.execute ? (clean ? "every fork: 0 case branches, 0 open PRs" : "FAILED: not clean")
    : "dry run passed: nothing deleted";
  log("end", { exit, unknown, note });
  return exit;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** `sha <tab> refs/heads/cases/...` lines of an ls-remote; a failed listing or a malformed line refuses. */
function listCaseBranches(r: RunResult, fork: string): Branch[] {
  if (r.status !== 0) throw new RefusalError(`${fork}: git ls-remote --heads failed (exit ${r.status})`);
  const out: Branch[] = [];
  for (const line of r.stdout.split("\n").filter(Boolean)) {
    const [sha, ref, extra] = line.split("\t");
    if (!sha || !SHA_RE.test(sha) || !ref || extra !== undefined) throw new RefusalError(`${fork}: unreadable ls-remote line ${JSON.stringify(line)}`);
    if (ref.startsWith("refs/heads/cases/")) out.push({ ref, sha });
  }
  return out;
}

/** The refs of `git ls-remote <url> refs/pull/*`; null if it failed or any line is not `<sha> <tab> refs/pull/<n>/<name>`. */
function listPullRefs(r: RunResult): string[] | null {
  if (r.status !== 0) return null;
  const refs: string[] = [];
  for (const line of r.stdout.split("\n").filter(Boolean)) {
    const [sha, ref, extra] = line.split("\t");
    if (!sha || !SHA_RE.test(sha) || !ref || !/^refs\/pull\/\d+\/[A-Za-z0-9._-]+$/.test(ref) || extra !== undefined) return null;
    refs.push(ref);
  }
  return refs;
}

/** Open PRs over every page; null if a page cannot be read or an entry is not a PR object with a number. */
function openPrCount(page: (n: number) => RunResult): number | null {
  let n = 0;
  for (let i = 1; i <= 100; i++) {
    const r = page(i);
    if (r.status !== 0) return null;
    let a: unknown;
    try { a = JSON.parse(r.stdout); } catch { return null; }
    if (!Array.isArray(a) || a.some((x) => !Number.isSafeInteger((x as { number?: unknown })?.number))) return null;
    n += a.length;
    if (a.length < 100) return n;
  }
  return null;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
