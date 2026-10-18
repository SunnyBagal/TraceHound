import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, CHANGESET_SCHEMA_VERSION, FileFacts, Snapshot, SnapshotManifest, type ChangeSet } from "../../analyzer/src/schema.ts";
import { upsertManifest } from "../../analyzer/src/manifest.ts";
import { applyUpdate, createDataDependencies, dataMain, parseReviewFooter, runData, workspaceEnv, type ChangeEntry,
  type DataDependencies, type DataEvent } from "../src/data.ts";

const sha = "a".repeat(40), base = "b".repeat(40), mergeBase = "d".repeat(40);
const repository = { full_name: "example/widget", default_branch: "main" };
const push: DataEvent = { repository, ref: "refs/heads/main", after: sha };
const pull = (action = "opened", merged = false): DataEvent => ({ repository, action,
  pull_request: { number: 3, title: "A change", merged, head: { sha, repo: { full_name: repository.full_name } }, base: { sha: base } } });
const snapshot = (commit = sha): Snapshot => Snapshot.parse({
  schemaVersion: SCHEMA_VERSION, analyzerVersion: "0.1.0", repo: { name: repository.full_name, commitSha: commit },
  generatedAt: "2026-01-01T00:00:00Z", components: [], edges: [], evidence: [], warnings: [], llmCalls: [],
  files: [FileFacts.parse({ path: "src/a.ts", package: ".", language: "ts", loc: 1, isEntry: false,
    imports: [], symbols: [], routes: [], mounts: [], listens: [], clients: [], redisOps: [], prismaOps: [], prismaModels: [], envReads: [] })],
});
const zero = { added: 0, removed: 0, modified: 0 };
const calls = { resolved: 0, external: 0, dynamic: 0 };
const changeset: ChangeSet = { schemaVersion: CHANGESET_SCHEMA_VERSION, analyzerVersion: "0.1.0",
  repo: { name: repository.full_name }, base: { ref: base, sha: base }, head: { ref: sha, sha },
  nodeModules: [], components: [], files: [], declarations: [], edges: [], warnings: [], limitations: [],
  stats: { declarations: { ...zero, formatting: 0, unchanged: 0 }, edges: { added: 0, removed: 0, unchanged: 0 },
    files: zero, calls: { base: calls, head: calls }, runtimeMs: 0 } };
const entry = (id = "pr-3-aaaaaaa"): ChangeEntry => ({ id, repo: repository.full_name, pr: 3, title: "A change", headSha: sha, baseSha: mergeBase, state: "open" });
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function temp() { const dir = await mkdtemp(path.join(tmpdir(), "tracehound-data-test-")); dirs.push(dir); return dir; }
const realpath = (file: string) => realpathSync(file);
const save = (file: string, value: unknown) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };

/** A remote tree in memory. No subprocess, network, model, or real git is used. */
async function fake() {
  const workspace = await temp();
  const remote = new Map<string, string>();
  let present = false, rejects = 0, missingBase = 0, ancestor = true, tip = sha;
  const capture = (dir: string, prefix = "") => {
    for (const item of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
      if (item.name === ".git") continue;
      const relative = path.join(prefix, item.name);
      if (item.isDirectory()) capture(dir, relative);
      else remote.set(relative, readFileSync(path.join(dir, relative), "utf8"));
    }
  };
  const impl: DataDependencies["git"] = (cwd, args) => {
      const ok = (stdout = "") => ({ code: 0, stdout });
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") return { code: ancestor ? 0 : 1, stdout: "" };
      if (args[0] === "ls-remote" && args.at(-1) === "refs/heads/main") return ok(`${tip}\trefs/heads/main\n`);
      if (args[0] === "merge-base") return missingBase-- > 0 ? { code: 1, stdout: "" } : ok(mergeBase + "\n");
      if (args[0] === "rev-parse") return ok(args[1] === "--is-shallow-repository" ? "true\n" : sha + "\n");
      if (args[0] === "ls-files") return ok("src/a.ts\0");
      if (args[0] === "ls-remote") return { code: present ? 0 : 2, stdout: "" };
      if (args[0] === "checkout" && args[1] === "-B") {
        for (const f of readdirSync(cwd)) rmSync(path.join(cwd, f), { force: true, recursive: true });
        for (const [file, body] of remote) { mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), body); }
      }
      if (args[0] === "diff") return { code: 1, stdout: "" };
      if (args[0] === "push") {
        if (rejects-- > 0) {
          present = true;
          remote.set("changesets/index.json", JSON.stringify([{ ...entry("pr-4-ccccccc"), pr: 4 }]));
          remote.set("changesets/pr-4-ccccccc.json", "{}");
          return { code: 1, stdout: "!\tHEAD:refs/heads/tracehound-data\t[rejected] (fetch first)\n" };
        }
        capture(cwd); present = true;
      }
      return ok();
  };
  const deps: DataDependencies = {
    git: vi.fn(impl), branchGit: vi.fn(impl),
    analyzer: vi.fn((args) => {
      if (args[0] === "bin.ts") return { code: 0, stdout: JSON.stringify(changeset) };
      const out = args[args.indexOf("--out") + 1]!;
      const s = snapshot();
      save(path.join(out, sha, "0.1.0.json"), s);
      save(path.join(out, "index.json"), upsertManifest(undefined, { repo: s.repo.name, sha, analyzerVersion: s.analyzerVersion,
        path: `${sha}/0.1.0.json`, createdAt: s.generatedAt }));
      return { code: 0, stdout: "" };
    }), log: vi.fn(),
  };
  return { deps, workspace, remote, reject: () => { rejects = 1; }, missBase: (n = 1) => { missingBase = n; },
    seed: (file: string, value: unknown) => { remote.set(file, JSON.stringify(value)); present = true; },
    history: (isAncestor: boolean, tipSha: string) => { ancestor = isAncestor; tip = tipSha; },
    run: (name: string, event: DataEvent, extra: NodeJS.ProcessEnv = {}) => runData(name, event,
      { GITHUB_TOKEN: "fake-unused", TRACEHOUND_REPO_DIR: workspace, ...extra }, deps) };
}

it("creates an orphan branch and writes a viewer-valid snapshot manifest", async () => {
  const f = await fake();
  await writeFile(path.join(f.workspace, "tracehound.json"), "{}");
  expect(await f.run("push", push)).toBe(0);
  expect(f.deps.branchGit).toHaveBeenCalledWith(expect.any(String), ["checkout", "--orphan", "tracehound-data"]);
  expect(f.deps.analyzer).toHaveBeenCalledWith(["cli.ts", "--repo", f.workspace, "--config", path.join(f.workspace, "tracehound.json"),
    "--naming", "heuristic", "--out", expect.any(String)]);
  const manifest = SnapshotManifest.parse(JSON.parse(f.remote.get("snapshots/index.json")!));
  expect(manifest.latest?.path).toBe(`${sha}/0.1.0.json`);
  expect(f.remote.has(`snapshots/${sha}/0.1.0.json`)).toBe(true);
  expect(f.deps.branchGit).toHaveBeenCalledWith(expect.any(String), ["commit", "-m", "data: push aaaaaaa"]);
  expect(f.deps.branchGit).toHaveBeenCalledWith(expect.any(String), ["push", "--porcelain", "origin", "HEAD:refs/heads/tracehound-data"]);
  // The token-bearing git never runs in the workspace, and the workspace git never touches the clone.
  expect(vi.mocked(f.deps.git).mock.calls.map(([cwd, args]) => [cwd, args[0]])).toEqual([[f.workspace, "rev-parse"], [f.workspace, "ls-files"]]);
  expect(vi.mocked(f.deps.branchGit).mock.calls.every(([cwd]) => cwd !== f.workspace)).toBe(true);
});

it("appends snapshots, replaces the same version, and retains old files", async () => {
  const dir = await temp();
  await applyUpdate(dir, { snapshot: snapshot() });
  await applyUpdate(dir, { snapshot: snapshot(base) });
  await applyUpdate(dir, { snapshot: { ...snapshot(), generatedAt: "2026-02-01T00:00:00Z" } });
  const m = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(dir, "snapshots/index.json"), "utf8")));
  expect(m.snapshots).toHaveLength(2);
  expect(m.latest?.sha).toBe(sha);
  expect(existsSync(path.join(dir, `snapshots/${base}/0.1.0.json`))).toBe(true);
});

it("writes a stale snapshot file but leaves the index when advance refuses", async () => {
  const dir = await temp();
  await applyUpdate(dir, { snapshot: { ...snapshot(base), generatedAt: "2026-01-01T00:00:00Z" } });
  const before = readFileSync(path.join(dir, "snapshots/index.json"), "utf8");
  const advance = vi.fn(() => false);
  expect(await applyUpdate(dir, { snapshot: { ...snapshot(), generatedAt: "2026-02-01T00:00:00Z" }, advance }))
    .toEqual([`snapshots/${sha}/0.1.0.json`]);
  expect(advance).toHaveBeenCalledWith(base);
  expect(readFileSync(path.join(dir, "snapshots/index.json"), "utf8")).toBe(before);
  expect(existsSync(path.join(dir, `snapshots/${sha}/0.1.0.json`))).toBe(true);
});

it.each([
  [false, "c".repeat(40), base],
  [true, "c".repeat(40), sha],
  [false, sha, sha],
])("a re-run push only moves latest forward (descendant=%s, tip=%s)", async (isAncestor, tipSha, latest) => {
  const f = await fake();
  f.seed("snapshots/index.json", upsertManifest(undefined, { repo: repository.full_name, sha: base,
    analyzerVersion: "0.1.0", path: `${base}/0.1.0.json`, createdAt: "2025-01-01T00:00:00Z" }));
  f.history(isAncestor, tipSha);
  await f.run("push", push);
  const manifest = SnapshotManifest.parse(JSON.parse(f.remote.get("snapshots/index.json")!));
  expect(manifest.latest?.sha).toBe(latest);
  expect(manifest.repos?.[0]?.defaultRef).toBe(latest);
  expect(f.remote.has(`snapshots/${sha}/0.1.0.json`)).toBe(true);
  expect(f.deps.git).toHaveBeenCalledWith(f.workspace, ["merge-base", "--is-ancestor", base, sha]);
});

it("never downgrades a change set entry: a stale open or closed event keeps merged", async () => {
  const f = await fake();
  await f.run("pull_request", pull());
  await f.run("pull_request", pull("closed", true));
  await f.run("pull_request", pull("synchronize"));
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("merged");
  await f.run("pull_request", pull("closed"));
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("merged");
  await f.run("pull_request", pull("reopened"));
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("merged");
});

it("a stale synchronize keeps closed, a later merge wins over closed", async () => {
  const f = await fake();
  await f.run("pull_request", pull());
  await f.run("pull_request", pull("closed"));
  await f.run("pull_request", pull("synchronize"));
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("closed");
  await f.run("pull_request", pull("closed", true));
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("merged");
});

it("appends and updates PR entries without duplicating IDs; uses changes CLI and saves matching footer", async () => {
  const f = await fake();
  const footer = path.join(f.workspace, "footer");
  await writeFile(footer, JSON.stringify({ version: 1, headSha: sha, posted: 1 }));
  await f.run("pull_request", pull(), { TRACEHOUND_REVIEW_FILE: footer });
  await f.run("pull_request", { ...pull("synchronize"), pull_request: { ...pull().pull_request!, title: "Updated" } });
  const index = JSON.parse(f.remote.get("changesets/index.json")!);
  expect(index).toEqual([{ ...entry(), title: "Updated", reviewFooter: { version: 1, headSha: sha, posted: 1 } }]);
  expect(f.remote.has("changesets/pr-3-aaaaaaa.json")).toBe(true);
  expect(f.deps.analyzer).toHaveBeenCalledWith(["bin.ts", "changes", "--repo", f.workspace, "--diff", `${mergeBase}..${sha}`, "--json"]);
  expect(f.deps.git).toHaveBeenCalledWith(f.workspace, ["merge-base", base, sha]);
  expect(f.deps.branchGit).toHaveBeenCalledWith(expect.any(String), ["checkout", "-B", "tracehound-data", "FETCH_HEAD"]);
});

it("diffs a PR from the merge base, not the base branch tip, fetching the base when it is missing", async () => {
  const f = await fake(); f.missBase();
  await f.run("pull_request", pull());
  expect(f.deps.git).toHaveBeenCalledWith(f.workspace, ["fetch", "--no-tags", "--unshallow", "origin", base]);
  expect(f.deps.analyzer).toHaveBeenCalledWith(["bin.ts", "changes", "--repo", f.workspace, "--diff", `${mergeBase}..${sha}`, "--json"]);
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].baseSha).toBe(mergeBase);
});

it("writes nothing when the merge base cannot be found", async () => {
  const f = await fake(); f.missBase(2);
  expect(await f.run("pull_request", pull())).toBe(0);
  expect(f.deps.analyzer).not.toHaveBeenCalled();
  expect(f.remote.size).toBe(0);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it.each([false, true])("updates all PR heads on closed (merged=%s), retains files, and reopens", async (merged) => {
  const f = await fake();
  await f.run("pull_request", pull());
  const old = { ...entry("pr-3-ccccccc"), headSha: "c".repeat(40) };
  f.remote.set("changesets/index.json", JSON.stringify([entry(), old]));
  f.remote.set("changesets/pr-3-ccccccc.json", "{}");
  vi.mocked(f.deps.analyzer).mockClear();
  await f.run("pull_request", pull("closed", merged));
  expect(JSON.parse(f.remote.get("changesets/index.json")!).map((e: ChangeEntry) => e.state)).toEqual([merged ? "merged" : "closed", merged ? "merged" : "closed"]);
  expect(f.remote.has("changesets/pr-3-aaaaaaa.json")).toBe(true);
  expect(f.remote.has("changesets/pr-3-ccccccc.json")).toBe(true);
  expect(f.deps.analyzer).not.toHaveBeenCalled();
  await f.run("pull_request", pull("reopened"));
  // GitHub cannot reopen a merged PR, so only a closed one returns to open.
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe(merged ? "merged" : "open");
});

it("retries once after a concurrent push and preserves the fetched entry and file", async () => {
  const f = await fake(); f.reject();
  await f.run("pull_request", pull());
  expect(JSON.parse(f.remote.get("changesets/index.json")!).map((e: ChangeEntry) => e.pr)).toEqual([4, 3]);
  expect(f.remote.has("changesets/pr-4-ccccccc.json")).toBe(true);
  expect(vi.mocked(f.deps.branchGit).mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(2);
  expect(f.deps.analyzer).toHaveBeenCalledTimes(1);
});

it.each([
  "!\tHEAD:refs/heads/tracehound-data\t[remote rejected] (cannot lock ref 'refs/heads/tracehound-data': is at 1 but expected 2)\n",
  "!\tHEAD:refs/heads/tracehound-data\t[remote rejected] (failed to update ref)\n",
])("retries once when the remote ref moved during the push: %s", async (stdout) => {
  const f = await fake(); const original = f.deps.branchGit;
  let pushes = 0;
  f.deps.branchGit = vi.fn((cwd, args) => {
    if (args[0] !== "push" || ++pushes > 1) return original(cwd, args);
    f.seed("changesets/index.json", [{ ...entry("pr-4-ccccccc"), pr: 4 }]); // the other writer's update
    return { code: 1, stdout };
  });
  await f.run("pull_request", pull());
  expect(pushes).toBe(2);
  expect(JSON.parse(f.remote.get("changesets/index.json")!).map((e: ChangeEntry) => e.pr)).toEqual([4, 3]);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: updated tracehound-data.");
});

it("does not retry a remote rejection for permissions", async () => {
  const f = await fake(); const original = f.deps.branchGit;
  f.deps.branchGit = vi.fn((cwd, args) => args[0] === "push"
    ? { code: 1, stdout: "!\tHEAD:refs/heads/tracehound-data\t[remote rejected] (permission denied)\n" } : original(cwd, args));
  await f.run("pull_request", pull());
  expect(vi.mocked(f.deps.branchGit).mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(1);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("does not retry authentication failures and never exposes error output", async () => {
  const f = await fake(); const original = f.deps.branchGit;
  f.deps.branchGit = vi.fn((cwd, args) => args[0] === "push" ? { code: 128, stdout: "SECRET" } : original(cwd, args));
  expect(await f.run("push", push)).toBe(0);
  expect(vi.mocked(f.deps.branchGit).mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(1);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("analyzer failure writes nothing, logs once and exits zero", async () => {
  const f = await fake(); vi.mocked(f.deps.analyzer).mockReturnValue({ code: 1, stdout: "SECRET" });
  expect(await f.run("push", push)).toBe(0);
  expect(f.remote.size).toBe(0);
  expect(vi.mocked(f.deps.git).mock.calls.every(([, args]) => ["rev-parse", "ls-files"].includes(args[0]!))).toBe(true);
  expect(f.deps.branchGit).not.toHaveBeenCalled();
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("stops after a second non-fast-forward rejection", async () => {
  const f = await fake(); const original = f.deps.branchGit; f.reject();
  let pushes = 0;
  f.deps.branchGit = vi.fn((cwd, args) => {
    if (args[0] === "push" && ++pushes === 2) return { code: 1, stdout: "[rejected] (non-fast-forward)" };
    return original(cwd, args);
  });
  expect(await f.run("pull_request", pull())).toBe(0);
  expect(pushes).toBe(2);
  expect(f.remote.has("changesets/pr-3-aaaaaaa.json")).toBe(false);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("refuses a checkout at the wrong head before analysis", async () => {
  const f = await fake(); vi.mocked(f.deps.git).mockReturnValue({ code: 0, stdout: base });
  expect(await f.run("push", push)).toBe(0);
  expect(f.deps.analyzer).not.toHaveBeenCalled();
  expect(f.remote.size).toBe(0);
});

it("skips repositories without TS before analysis or branch creation", async () => {
  const f = await fake(); const original = f.deps.git;
  f.deps.git = vi.fn((cwd, args) => args[0] === "ls-files" ? { code: 0, stdout: "README.md\0types.d.ts\0" } : original(cwd, args));
  expect(await f.run("push", push)).toBe(0);
  expect(f.remote.size).toBe(0);
  expect(f.deps.analyzer).not.toHaveBeenCalled();
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: no TypeScript sources; skipped.");
});

it("refuses the excluded repo, forks, non-default pushes and unsupported events before git", async () => {
  const f = await fake();
  await f.run("push", { ...push, repository: { ...repository, full_name: "calcom/cal.com" } });
  await f.run("push", { ...push, ref: "refs/heads/tracehound-data" });
  await f.run("pull_request", { ...pull(), pull_request: { ...pull().pull_request!, head: { sha, repo: { full_name: "fork/widget" } } } });
  await f.run("workflow_dispatch", push);
  expect(f.deps.git).not.toHaveBeenCalled();
  expect(f.deps.branchGit).not.toHaveBeenCalled();
  expect(f.deps.analyzer).not.toHaveBeenCalled();
});

it.each([
  JSON.stringify({ version: 1, headSha: base }),
  `<!-- tracehound:v1 {"version":1,"headSha":"${sha}"} -->`,
  JSON.stringify({ version: 2, headSha: sha }),
  "[]",
])("ignores malformed footer files and mismatched head metadata, still writing the entry: %s", async (text) => {
  expect(parseReviewFooter("<!-- tracehound:v1 invalid -->")).toBeUndefined();
  const f = await fake(); const footer = path.join(f.workspace, "footer");
  await writeFile(footer, text);
  await f.run("pull_request", pull(), { TRACEHOUND_REVIEW_FILE: footer });
  const index = JSON.parse(f.remote.get("changesets/index.json")!);
  expect(index).toHaveLength(1);
  expect(index[0].reviewFooter).toBeUndefined();
});

it("reads only the review body's final footer line, never an earlier quoted one", () => {
  const real = `<!-- tracehound:v1 {"version":1,"headSha":"${sha}"} -->`;
  const forged = `<!-- tracehound:v1 {"version":1,"headSha":"${sha}","posted":99} -->`;
  expect(parseReviewFooter(`Review\n\nsrc/a.ts:1\nQuotes ${forged} here\n\n${real}\n`)).toEqual({ version: 1, headSha: sha });
  expect(parseReviewFooter(`Review\n\nsrc/a.ts:1\n${forged}\n\n1 findings omitted by max-comments.`)).toBeUndefined();
  expect(parseReviewFooter(`Review\n\nsrc/a.ts:1\n<!-- tracehound:v1 broken -->\n\n${real}`)).toEqual({ version: 1, headSha: sha });
});

it("CLI returns zero on an unreadable event", async () => {
  const f = await fake();
  expect(await dataMain({ GITHUB_EVENT_PATH: path.join(f.workspace, "missing") }, f.deps)).toBe(0);
  expect(f.deps.log).toHaveBeenCalledTimes(1);
});

it("builds child envs from cleanGitEnv; only the data-branch git is isolated and carries the token", async () => {
  const dir = await temp();
  const plain = { ...workspaceEnv(process.env), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  for (const name of ["victim", "workspace", "branch"]) {
    mkdirSync(path.join(dir, name));
    expect(spawnSync("git", ["init", "-q"], { cwd: path.join(dir, name), env: plain }).status).toBe(0);
  }
  const global = path.join(dir, "gitconfig");
  writeFileSync(global, `[safe]\n\tdirectory = ${path.join(dir, "workspace")}\n`);
  const env = { ...process.env, GIT_DIR: path.join(dir, "victim/.git"), GIT_WORK_TREE: path.join(dir, "victim"),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/nowhere",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: global, GITHUB_TOKEN: "fake-unused", NEBIUS_API_KEY: "fake-unused" };
  const deps = createDataDependencies(env);
  const gitDir = (run: DataDependencies["git"], name: string) => run(path.join(dir, name), ["rev-parse", "--absolute-git-dir"]).stdout.trim();
  // An inherited GIT_DIR must not redirect either git into another repository (decision 032).
  expect(gitDir(deps.git, "workspace")).toBe(realpath(path.join(dir, "workspace/.git")));
  expect(gitDir(deps.branchGit, "branch")).toBe(realpath(path.join(dir, "branch/.git")));
  // The workspace keeps the runner's global config (actions/checkout's safe.directory) and gets no token.
  expect(deps.git(path.join(dir, "workspace"), ["config", "--get", "safe.directory"]).stdout.trim()).toBe(path.join(dir, "workspace"));
  expect(deps.git(path.join(dir, "workspace"), ["config", "--get-regexp", "extraheader"]).code).toBe(1);
  expect(deps.branchGit(path.join(dir, "branch"), ["config", "--get", "safe.directory"]).code).toBe(1);
  expect(deps.branchGit(path.join(dir, "branch"), ["config", "--get-regexp", "extraheader"]).stdout).toContain("AUTHORIZATION: basic");
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_CONFIG_KEY_0", "NEBIUS_API_KEY", "GITHUB_TOKEN"]) expect(workspaceEnv(env)[name]).toBeUndefined();
});
