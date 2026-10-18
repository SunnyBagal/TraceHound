import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, CHANGESET_SCHEMA_VERSION, FileFacts, Snapshot, SnapshotManifest, type ChangeSet } from "../../analyzer/src/schema.ts";
import { upsertManifest } from "../../analyzer/src/manifest.ts";
import { applyUpdate, dataMain, parseReviewFooter, runData, type ChangeEntry, type DataDependencies, type DataEvent } from "../src/data.ts";

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
const save = (file: string, value: unknown) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };

/** A remote tree in memory. No subprocess, network, model, or real git is used. */
async function fake() {
  const workspace = await temp();
  const remote = new Map<string, string>();
  let present = false, rejects = 0, missingBase = 0;
  const capture = (dir: string, prefix = "") => {
    for (const item of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
      if (item.name === ".git") continue;
      const relative = path.join(prefix, item.name);
      if (item.isDirectory()) capture(dir, relative);
      else remote.set(relative, readFileSync(path.join(dir, relative), "utf8"));
    }
  };
  const deps: DataDependencies = {
    git: vi.fn((cwd, args) => {
      const ok = (stdout = "") => ({ code: 0, stdout });
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
    }),
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
    run: (name: string, event: DataEvent, extra: NodeJS.ProcessEnv = {}) => runData(name, event,
      { GITHUB_TOKEN: "fake-unused", TRACEHOUND_REPO_DIR: workspace, ...extra }, deps) };
}

it("creates an orphan branch and writes a viewer-valid snapshot manifest", async () => {
  const f = await fake();
  await writeFile(path.join(f.workspace, "tracehound.json"), "{}");
  expect(await f.run("push", push)).toBe(0);
  expect(f.deps.git).toHaveBeenCalledWith(expect.any(String), ["checkout", "--orphan", "tracehound-data"]);
  expect(f.deps.analyzer).toHaveBeenCalledWith(["cli.ts", "--repo", f.workspace, "--config", path.join(f.workspace, "tracehound.json"),
    "--naming", "heuristic", "--out", expect.any(String)]);
  const manifest = SnapshotManifest.parse(JSON.parse(f.remote.get("snapshots/index.json")!));
  expect(manifest.latest?.path).toBe(`${sha}/0.1.0.json`);
  expect(f.remote.has(`snapshots/${sha}/0.1.0.json`)).toBe(true);
  expect(f.deps.git).toHaveBeenCalledWith(expect.any(String), ["commit", "-m", "data: push aaaaaaa"]);
  expect(f.deps.git).toHaveBeenCalledWith(expect.any(String), ["push", "--porcelain", "origin", "HEAD:refs/heads/tracehound-data"]);
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

it("appends and updates PR entries without duplicating IDs; uses changes CLI and saves matching footer", async () => {
  const f = await fake();
  const footer = path.join(f.workspace, "footer");
  await writeFile(footer, `<!-- tracehound:v1 {"version":1,"headSha":"${sha}","posted":1} -->`);
  await f.run("pull_request", pull(), { TRACEHOUND_REVIEW_FILE: footer });
  await f.run("pull_request", { ...pull("synchronize"), pull_request: { ...pull().pull_request!, title: "Updated" } });
  const index = JSON.parse(f.remote.get("changesets/index.json")!);
  expect(index).toEqual([{ ...entry(), title: "Updated", reviewFooter: { version: 1, headSha: sha, posted: 1 } }]);
  expect(f.remote.has("changesets/pr-3-aaaaaaa.json")).toBe(true);
  expect(f.deps.analyzer).toHaveBeenCalledWith(["bin.ts", "changes", "--repo", f.workspace, "--diff", `${mergeBase}..${sha}`, "--json"]);
  expect(f.deps.git).toHaveBeenCalledWith(f.workspace, ["merge-base", base, sha]);
  expect(f.deps.git).toHaveBeenCalledWith(expect.any(String), ["checkout", "-B", "tracehound-data", "FETCH_HEAD"]);
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
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].state).toBe("open");
});

it("retries once after a concurrent push and preserves the fetched entry and file", async () => {
  const f = await fake(); f.reject();
  await f.run("pull_request", pull());
  expect(JSON.parse(f.remote.get("changesets/index.json")!).map((e: ChangeEntry) => e.pr)).toEqual([4, 3]);
  expect(f.remote.has("changesets/pr-4-ccccccc.json")).toBe(true);
  expect(vi.mocked(f.deps.git).mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(2);
  expect(f.deps.analyzer).toHaveBeenCalledTimes(1);
});

it("does not retry authentication failures and never exposes error output", async () => {
  const f = await fake(); const original = f.deps.git;
  f.deps.git = vi.fn((cwd, args) => args[0] === "push" ? { code: 128, stdout: "SECRET" } : original(cwd, args));
  expect(await f.run("push", push)).toBe(0);
  expect(vi.mocked(f.deps.git).mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(1);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("analyzer failure writes nothing, logs once and exits zero", async () => {
  const f = await fake(); vi.mocked(f.deps.analyzer).mockReturnValue({ code: 1, stdout: "SECRET" });
  expect(await f.run("push", push)).toBe(0);
  expect(f.remote.size).toBe(0);
  expect(vi.mocked(f.deps.git).mock.calls.every(([, args]) => ["rev-parse", "ls-files"].includes(args[0]!))).toBe(true);
  expect(f.deps.log).toHaveBeenCalledExactlyOnceWith("TraceHound data: analyzer or data write failed; skipped.");
});

it("stops after a second non-fast-forward rejection", async () => {
  const f = await fake(); const original = f.deps.git; f.reject();
  let pushes = 0;
  f.deps.git = vi.fn((cwd, args) => {
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
  expect(f.deps.analyzer).not.toHaveBeenCalled();
});

it("ignores malformed footers and mismatched head metadata", async () => {
  expect(parseReviewFooter("<!-- tracehound:v1 invalid -->")).toBeUndefined();
  const f = await fake(); const footer = path.join(f.workspace, "footer");
  await writeFile(footer, `<!-- tracehound:v1 {"version":1,"headSha":"${base}"} -->`);
  await f.run("pull_request", pull(), { TRACEHOUND_REVIEW_FILE: footer });
  expect(JSON.parse(f.remote.get("changesets/index.json")!)[0].reviewFooter).toBeUndefined();
});

it("CLI returns zero on an unreadable event", async () => {
  const f = await fake();
  expect(await dataMain({ GITHUB_EVENT_PATH: path.join(f.workspace, "missing") }, f.deps)).toBe(0);
  expect(f.deps.log).toHaveBeenCalledTimes(1);
});
