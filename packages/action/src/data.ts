import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import { readManifest, repoIdOf, reposOf, upsertManifest } from "../../analyzer/src/manifest.ts";
import { ChangeSet, Snapshot, SnapshotManifest } from "../../analyzer/src/schema.ts";

const BRANCH = "tracehound-data";
const SHA = /^[a-f0-9]{40}$/;
export interface DataEvent {
  ref?: string;
  after?: string;
  action?: string;
  repository: { full_name: string; default_branch: string };
  pull_request?: {
    number: number; title: string; merged?: boolean;
    head: { sha: string; repo: { full_name: string } | null };
    base: { sha: string };
  };
}
export interface ChangeEntry {
  id: string; repo: string; pr: number; title: string;
  headSha: string; baseSha: string; state: "open" | "merged" | "closed";
  reviewFooter?: Record<string, unknown>;
}
interface Result { code: number; stdout: string }
export interface DataDependencies {
  /** git in the checked-out workspace: the runner's own config, no credentials. */
  git: (cwd: string, args: string[]) => Result;
  /** git in the temporary data-branch clone: isolated config and the token's auth header. */
  branchGit: (cwd: string, args: string[]) => Result;
  analyzer: (args: string[]) => Result;
  log: (message: string) => void;
}
interface Update {
  snapshot?: Snapshot; changeset?: ChangeSet; entry?: ChangeEntry;
  /** Whether a snapshot may replace the repo's recorded latest SHA; absent always advances. */
  advance?: (recorded: string) => boolean;
  /** A reopened event is the one open event that may replace `closed`. */
  reopened?: boolean;
}
// A re-run of an older event must never move a change set entry back to an earlier state.
const RANK: Record<ChangeEntry["state"], number> = { open: 0, closed: 1, merged: 2 };

export function parseReviewFooter(body: string): Record<string, unknown> | undefined {
  try {
    const match = /<!-- tracehound:v1 (.+?) -->/.exec(body);
    const value: unknown = match && JSON.parse(match[1]!);
    if (value && typeof value === "object" && !Array.isArray(value)
      && (value as Record<string, unknown>).version === 1) return value as Record<string, unknown>;
  } catch { /* An absent or malformed footer is optional. */ }
  return undefined;
}

async function json(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

/** Re-read indexes on every attempt so concurrent events retain each other's entries. */
export async function applyUpdate(dir: string, update: Update): Promise<string[]> {
  if (update.snapshot) {
    const s = update.snapshot;
    const relative = `${s.repo.commitSha}/${s.analyzerVersion}.json`;
    const files = [`snapshots/${relative}`, "snapshots/index.json"];
    await json(path.join(dir, files[0]!), s);
    const manifest = readManifest(path.join(dir, "snapshots"));
    const recorded = manifest && reposOf(manifest).repos.find((r) => r.id === repoIdOf(s.repo.name))?.latest.sha;
    // A re-run or late event keeps its snapshot file but never moves latest backwards.
    if (recorded && recorded !== s.repo.commitSha && update.advance && !update.advance(recorded)) return [files[0]!];
    await json(path.join(dir, files[1]!), upsertManifest(manifest, {
      repo: s.repo.name, sha: s.repo.commitSha, analyzerVersion: s.analyzerVersion,
      path: relative, createdAt: s.generatedAt,
    }, { repoUrl: s.repo.url }));
    return files;
  }
  const entry = update.entry!;
  const file = path.join(dir, "changesets/index.json");
  const entries = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) as ChangeEntry[] : [];
  if (!Array.isArray(entries)) throw new Error("Invalid changeset index");
  // A close applies to every recorded head of this PR, including heads since superseded.
  if (entry.state !== "open") {
    let changed = false;
    for (const previous of entries) {
      if (previous.repo === entry.repo && previous.pr === entry.pr && RANK[entry.state] > RANK[previous.state]) {
        previous.state = entry.state;
        changed = true;
      }
    }
    if (!changed) return [];
    await json(file, entries);
    return ["changesets/index.json"];
  }
  const previous = entries.findIndex((e) => e.id === entry.id && e.repo === entry.repo);
  const kept = previous >= 0 ? entries[previous]! : undefined;
  const state = !kept || kept.state === "open" || (kept.state === "closed" && update.reopened) ? entry.state : kept.state;
  const merged = { ...kept, ...entry, state };
  if (previous < 0) entries.push(merged);
  else entries[previous] = merged;
  const relative = `changesets/${entry.id}.json`;
  await json(path.join(dir, relative), update.changeset);
  await json(file, entries);
  return [relative, "changesets/index.json"];
}

function checked(result: Result): string {
  if (result.code) throw new Error("Command failed");
  return result.stdout;
}

export async function runData(
  eventName: string, event: DataEvent, env: NodeJS.ProcessEnv, deps: DataDependencies,
): Promise<number> {
  let temp: string | undefined;
  try {
    const repo = event.repository.full_name;
    // The benchmark test set must never be analyzed by product automation.
    if (repo.toLowerCase() === "calcom/cal.com") {
      deps.log("TraceHound data: repository excluded; skipped.");
      return 0;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid repository");
    const pr = event.pull_request;
    if (eventName === "push") {
      if (event.ref !== `refs/heads/${event.repository.default_branch}`) return 0;
    } else if (eventName === "pull_request") {
      if (!pr || pr.head.repo?.full_name !== repo) return 0;
    } else return 0;
    const sha = eventName === "push" ? event.after! : pr!.head.sha;
    if (!SHA.test(sha) || (pr && (!SHA.test(pr.base.sha) || !Number.isSafeInteger(pr.number) || pr.number < 1))) {
      throw new Error("Invalid event");
    }
    const workspace = env.TRACEHOUND_REPO_DIR || env.GITHUB_WORKSPACE;
    if (!workspace || !env.GITHUB_TOKEN) throw new Error("Missing environment");
    const update: Update = {};
    if (pr) {
      update.entry = {
        id: `pr-${pr.number}-${sha.slice(0, 7)}`, repo, pr: pr.number, title: pr.title,
        headSha: sha, baseSha: pr.base.sha,
        state: event.action === "closed" ? (pr.merged ? "merged" : "closed") : "open",
      };
      update.reopened = event.action === "reopened";
    }
    temp = await mkdtemp(path.join(tmpdir(), "tracehound-data-"));
    if (!pr || event.action !== "closed") {
      if (checked(deps.git(workspace, ["rev-parse", "HEAD"])).trim() !== sha) throw new Error("Wrong checkout");
      const files = checked(deps.git(workspace, ["ls-files", "-z"])).split("\0");
      if (!files.some((f) => /\.(?:[cm]?ts|tsx)$/.test(f) && !/\.d\.[cm]?ts$/.test(f))) {
        deps.log("TraceHound data: no TypeScript sources; skipped.");
        return 0;
      }
      const config = path.join(workspace, "tracehound.json");
      const args = ["--repo", workspace, ...(existsSync(config) ? ["--config", config] : [])];
      if (!pr) {
        checked(deps.analyzer(["cli.ts", ...args, "--naming", "heuristic", "--out", path.join(temp, "analysis")]));
        const manifest = SnapshotManifest.parse(readManifest(path.join(temp, "analysis")));
        if (!manifest.latest || manifest.latest.sha !== sha
          || !/^[\w.-]+$/.test(manifest.latest.analyzerVersion)) throw new Error("Invalid snapshot output");
        update.snapshot = Snapshot.parse(JSON.parse(await readFile(path.join(temp, "analysis", sha,
          `${manifest.latest.analyzerVersion}.json`), "utf8")));
        if (!update.snapshot.files.some((file) => file.language === "ts")) {
          deps.log("TraceHound data: no TypeScript sources; skipped.");
          return 0;
        }
        // Use the installing repo identity, even if its local remote has a different spelling.
        update.snapshot.repo.name = repo;
      } else {
        // base.sha is the base branch tip when the event fired; diff from the merge base so commits
        // merged into the base after the branch point are not recorded as removed by this PR.
        const mergeBase = () => {
          const result = deps.git(workspace, ["merge-base", pr.base.sha, sha]);
          return result.code === 0 && SHA.test(result.stdout.trim()) ? result.stdout.trim() : undefined;
        };
        let baseSha = mergeBase();
        if (!baseSha) {
          const shallow = checked(deps.git(workspace, ["rev-parse", "--is-shallow-repository"])).trim() === "true";
          checked(deps.git(workspace, ["fetch", "--no-tags", ...(shallow ? ["--unshallow"] : []), "origin", pr.base.sha]));
          baseSha = mergeBase();
        }
        if (!baseSha) throw new Error("No merge base");
        update.entry!.baseSha = baseSha;
        update.changeset = ChangeSet.parse(JSON.parse(checked(deps.analyzer([
          "bin.ts", "changes", ...args, "--diff", `${baseSha}..${sha}`, "--json",
        ]))));
        if (env.TRACEHOUND_REVIEW_FILE && existsSync(env.TRACEHOUND_REVIEW_FILE)) {
          const footer = parseReviewFooter(await readFile(env.TRACEHOUND_REVIEW_FILE, "utf8"));
          if (footer?.headSha === sha) update.entry!.reviewFooter = footer;
        }
      }
    }
    const dir = path.join(temp, "branch");
    await mkdir(dir);
    const git = (args: string[]) => checked(deps.branchGit(dir, args));
    const server = new URL(env.GITHUB_SERVER_URL || "https://github.com");
    if (server.protocol !== "https:" || server.username || server.password || server.pathname !== "/") {
      throw new Error("Invalid server URL");
    }
    git(["init", "-q"]);
    git(["remote", "add", "origin", `${server.origin}/${repo}.git`]);
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    if (!pr) {
      // Move latest only to a descendant of the recorded latest or to the current default-branch tip.
      update.advance = (recorded) => (SHA.test(recorded)
        && deps.git(workspace, ["merge-base", "--is-ancestor", recorded, sha]).code === 0)
        || checked(deps.branchGit(dir, ["ls-remote", "origin", `refs/heads/${event.repository.default_branch}`])).split("\t")[0] === sha;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = deps.branchGit(dir, ["ls-remote", "--exit-code", "origin", `refs/heads/${BRANCH}`]);
      if (remote.code === 0) {
        git(["fetch", "--depth=1", "origin", `refs/heads/${BRANCH}`]);
        git(["checkout", "-B", BRANCH, "FETCH_HEAD"]);
      } else if (remote.code === 2 && attempt === 0) git(["checkout", "--orphan", BRANCH]);
      else throw new Error("Cannot load data branch");
      const files = await applyUpdate(dir, update);
      if (!files.length) return 0;
      git(["add", "--", ...files]);
      const diff = deps.branchGit(dir, ["diff", "--cached", "--quiet"]);
      if (diff.code === 0) return 0;
      if (diff.code !== 1) throw new Error("Cannot inspect staged data");
      git(["commit", "-m", `data: ${eventName} ${sha.slice(0, 7)}`]);
      const pushed = deps.branchGit(dir, ["push", "--porcelain", "origin", `HEAD:refs/heads/${BRANCH}`]);
      if (!pushed.code) {
        deps.log("TraceHound data: updated tracehound-data.");
        return 0;
      }
      // Only retry a concurrent update, not authentication or other push failures. A writer whose
      // ref update lands while ours is in flight shows as a remote ref-lock rejection.
      if (attempt || !/\[rejected\].*\((?:fetch first|non-fast-forward)\)|\[remote rejected\].*\((?:cannot lock ref|failed to update ref)\b/
        .test(pushed.stdout)) {
        throw new Error("Cannot push data");
      }
    }
  } catch {
    // Never echo subprocess output: it can contain credentials or repository content.
    deps.log("TraceHound data: analyzer or data write failed; skipped.");
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
  }
  return 0;
}

/** The workspace git and analyzer env: no repo-selecting git variables (decision 032), no secrets. */
export function workspaceEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = cleanGitEnv(env);
  delete clean.NEBIUS_API_KEY;
  delete clean.GITHUB_TOKEN;
  return clean;
}

export function createDataDependencies(env: NodeJS.ProcessEnv): DataDependencies {
  const run = (command: string, args: string[], cwd: string, childEnv: NodeJS.ProcessEnv): Result => {
    const result = spawnSync(command, args, { cwd, env: childEnv, encoding: "utf8", timeout: 600_000,
      maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { code: result.status ?? 1, stdout: result.stdout ?? "" };
  };
  const clean = workspaceEnv(env);
  // Credentials exist only in the data-branch git's environment, never a URL or config file.
  // Its config is isolated; the workspace git keeps the runner's (e.g. actions/checkout's safe.directory).
  const auth = Buffer.from(`x-access-token:${env.GITHUB_TOKEN ?? ""}`).toString("base64");
  return {
    git: (cwd, args) => run("git", args, cwd, { ...clean, GIT_TERMINAL_PROMPT: "0" }),
    branchGit: (cwd, args) => run("git", args, cwd, { ...clean, GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.${env.GITHUB_SERVER_URL || "https://github.com"}/.extraheader`,
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }),
    analyzer: ([script, ...args]) => run(process.execPath,
      [path.resolve(import.meta.dirname, "../../analyzer/src", script!), ...args],
      path.resolve(import.meta.dirname, "../../.."), clean),
    log: console.log,
  };
}

export async function dataMain(env: NodeJS.ProcessEnv, deps = createDataDependencies(env)): Promise<number> {
  try {
    if (!env.GITHUB_EVENT_PATH) throw new Error("Missing event");
    return await runData(env.GITHUB_EVENT_NAME ?? "", JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")), env, deps);
  } catch {
    deps.log("TraceHound data: invalid event; skipped.");
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await dataMain(process.env);
}
