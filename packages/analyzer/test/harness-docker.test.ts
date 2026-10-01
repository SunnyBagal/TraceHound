// Real containers (decision 026). Runs wherever `docker version` works (CI: GitHub runners);
// elsewhere the whole suite is skipped with a visible message.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA } from "../../../eval/fixtures/build-toy-repo.ts";
import { NoopAgent, OracleAgent, type Agent } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_DOCKERFILE, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { NETWORK_PROBES, runRepair, type RunRecord } from "../src/harness/run.ts";
import { loadTask } from "../src/harness/task.ts";

const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
const docker = dockerAvailable();
const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";

async function run(taskId: string, agent: "oracle" | "noop", patch?: string): Promise<RunRecord> {
  const task = loadTask(path.join(TASKS, taskId, "task.json"));
  const a = agent === "noop" ? new NoopAgent() : new OracleAgent(readFileSync(path.join(TASKS, taskId, patch!), "utf8"));
  const record = await runRepair({ task, agent: a, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
  expect(record.sandbox.destroyed).toBe(true);
  expect(containerExists(record.sandbox.id!)).toBe(false); // gone, not just stopped
  return record;
}

if (!docker.ok) {
  console.warn(`\n⚠ SKIPPED harness-docker tests: Docker is not available here (${docker.detail}). CI runs them.\n`);
  describe.skip(`harness on Docker (skipped: ${docker.detail})`, () => it("needs Docker", () => {}));
} else
  describe("repair harness on Docker (toy-cart fixture)", () => {
    beforeAll(async () => {
      expect(buildToyRepo()).toBe(TOY_BASE_SHA);
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    it("the sandbox has no host mounts, no host environment, and no network once disconnected", async () => {
      const provider = new LocalDockerProvider();
      const h = await provider.create({ image: SANDBOX_IMAGE, source: { localPath: path.resolve(TASKS, "../fixtures/.build/toy-cart") } });
      try {
        await provider.disableNetwork(h);
        const inspect = JSON.parse(spawnSync("docker", ["inspect", h.id], { encoding: "utf8" }).stdout)[0];
        expect(inspect.Mounts).toEqual([]);
        expect(inspect.HostConfig.Binds ?? []).toEqual([]); // no host paths, no docker.sock
        expect(inspect.NetworkSettings.Networks).toEqual({});
        expect(inspect.HostConfig.CapDrop).toEqual(["ALL"]);
        expect(inspect.HostConfig.SecurityOpt).toEqual(["no-new-privileges"]);
        expect(inspect.HostConfig.Privileged).toBe(false);
        // decision 036: resource limits, non-root, self-removal
        expect({ memory: inspect.HostConfig.Memory, nanoCpus: inspect.HostConfig.NanoCpus, pids: inspect.HostConfig.PidsLimit }).toEqual({ memory: 2 * 1024 ** 3, nanoCpus: 2e9, pids: 512 });
        expect(inspect.Config.User).toBe("1000:1000");
        expect(inspect.HostConfig.AutoRemove).toBe(true);
        expect(inspect.Config.Cmd[0]).toBe("sleep");
        expect(Number(inspect.Config.Cmd[1])).toBeGreaterThan(0); // bounded, never "infinity"
        const who = await provider.exec(h, "id -u; id -g; ls /var/run/docker.sock 2>&1; touch /etc/x 2>&1; touch /work/ok /scratch/ok && rm /work/ok /scratch/ok && echo writable", { timeoutMs: 10_000 });
        expect(who.stdout.trim().split("\n")).toEqual(["1000", "1000", "ls: cannot access '/var/run/docker.sock': No such file or directory", "touch: cannot touch '/etc/x': Permission denied", "writable"]);
        for (const probe of NETWORK_PROBES) expect((await provider.exec(h, probe, { timeoutMs: 20_000 })).exitCode).not.toBe(0);
        const env = await provider.exec(h, "env | cut -d= -f1 | sort", { timeoutMs: 10_000 });
        expect(env.stdout.trim().split("\n")).toEqual(["BUN_INSTALL", "HOME", "HOSTNAME", "PATH", "PWD"]);
        const head = await provider.exec(h, "git rev-parse HEAD && git status --porcelain", { timeoutMs: 10_000 });
        expect(head.stdout.trim()).toBe(TOY_BASE_SHA);
      } finally {
        await provider.destroy(h);
      }
      expect(containerExists(h.id)).toBe(false);
    }, 120_000);

    it("history leak closed: during PATCHING the repo has one base commit, no remotes, no reflog, and no trace of the task", async () => {
      const probes: Record<string, string> = {
        "git log --all --oneline": "git log --all --oneline",
        "git log --format=%an|%ae|%aI|%cI|%s": "git log --format='%an|%ae|%aI|%cI|%s'",
        "git remote -v": "git remote -v",
        "git branch -a": "git branch -a",
        "git tag": "git tag",
        "git reflog": "git reflog 2>&1",
        "git stash list": "git stash list",
        "git rev-list --all --count": "git rev-list --all --count",
        "git count-objects -v (packs)": "git count-objects -v | grep -E '^(count|in-pack|packs):'",
        "pre-squash SHA": `git cat-file -e ${TOY_BASE_SHA}^{commit} 2>/dev/null && echo "RESOLVES" || echo "does not resolve"`,
        "git fsck --lost-found (dangling)": "git fsck --no-reflogs --dangling 2>&1 | grep -c dangling || true",
        "ls -A .git": "ls -A .git",
        "ls -A /work": "ls -A",
        "git status --porcelain --ignored": "git status --porcelain --ignored",
        "files named like the task": "find / -xdev \\( -path /proc -o -path /sys -o -path /dev -o -path /usr \\) -prune -o \\( -iname '*repro*' -o -iname '*.patch' -o -iname 'task.json' -o -iname '*tracehound*' -o -iname '*.bundle' \\) -print 2>/dev/null",
        "repro test text on disk": "grep -rlsF 'a 10% discount takes 10% off' / --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev 2>/dev/null || true",
        "fixture commit message on disk": "grep -rlsF 'buggy applyDiscount' / --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev 2>/dev/null || true",
        "ls -A /tmp": "ls -A /tmp",
      };
      const seen: Record<string, string> = {};
      const probe: Agent = {
        name: "leak-probe",
        async run(ctx) {
          for (const [label, cmd] of Object.entries(probes)) seen[label] = (await ctx.exec(cmd, { timeoutMs: 60_000 })).stdout.trim();
        },
      };
      const task = loadTask(path.join(TASKS, "toy-discount", "task.json"));
      const r = await runRepair({ task, agent: probe, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
      console.log(`leak probe (PATCHING, toy-discount):\n${Object.entries(seen).map(([k, v]) => `$ ${k}\n${v || "(empty)"}`).join("\n")}`);
      expect(r.finalState).toBe("UNRESOLVED"); // the probe changes nothing
      expect(r.baseCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(r.baseCommit).not.toBe(TOY_BASE_SHA);
      expect(seen["git log --all --oneline"]).toBe(`${r.baseCommit!.slice(0, 7)} base`);
      expect(seen["git log --format=%an|%ae|%aI|%cI|%s"]).toBe("base|base@sandbox.invalid|2000-01-01T00:00:00+00:00|2000-01-01T00:00:00+00:00|base");
      expect(seen["git remote -v"]).toBe("");
      expect(seen["git branch -a"]).toBe("* work");
      expect(seen["git tag"]).toBe("");
      expect(seen["git reflog"]).toBe("");
      expect(seen["git stash list"]).toBe("");
      expect(seen["git rev-list --all --count"]).toBe("1");
      expect(seen["pre-squash SHA"]).toBe("does not resolve");
      expect(seen["git fsck --lost-found (dangling)"]).toBe("0");
      expect(seen["ls -A .git"]!.split("\n")).not.toContain("logs");
      expect(seen["ls -A .git"]!.split("\n")).not.toContain("hooks");
      expect(seen["ls -A /work"]!.split("\n")).toEqual([".git", "package.json", "src", "tests", "tsconfig.json"]);
      expect(seen["git status --porcelain --ignored"]).toBe("");
      expect(seen["files named like the task"]).toBe("");
      expect(seen["repro test text on disk"]).toBe("");
      expect(seen["fixture commit message on disk"]).toBe("");
      // /tmp holds only TypeScript's own compile cache, written by the baseline `tsc` (compiler bytecode, no repo content)
      expect(seen["ls -A /tmp"]).toMatch(/^(node-compile-cache)?$/);
      // the same base commit for the same tree: fixed author, committer, dates and message
      const again = await runRepair({ task, agent: new NoopAgent(), provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
      expect(again.baseCommit).toBe(r.baseCommit);
    }, 240_000);

    it("network is off during PATCHING: requests from inside the container fail (DNS name and raw IP)", async () => {
      const seen: { cmd: string; exitCode: number; out: string }[] = [];
      const probe: Agent = {
        name: "network-probe",
        async run(ctx) {
          for (const cmd of [...NETWORK_PROBES, "getent hosts registry.npmjs.org"]) {
            const r = await ctx.exec(cmd, { timeoutMs: 20_000 });
            seen.push({ cmd, exitCode: r.exitCode, out: (r.stdout + r.stderr).trim() });
          }
        },
      };
      const task = loadTask(path.join(TASKS, "toy-discount", "task.json"));
      const r = await runRepair({ task, agent: probe, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
      console.log(`network probes during PATCHING:\n${seen.map((s) => `$ ${s.cmd}\n  exit ${s.exitCode}: ${s.out || "(no output)"}`).join("\n")}`);
      expect(seen).toHaveLength(3);
      for (const s of seen) expect(s.exitCode).not.toBe(0);
      expect(r.commands.filter((c) => c.phase === "PATCHING" && c.actor === "agent")).toHaveLength(3);
    }, 120_000);

    it("a sandbox nobody destroys removes itself at its deadline (--rm + bounded sleep), e.g. after a harness crash", async () => {
      const provider = new LocalDockerProvider();
      const h = await provider.create({ image: SANDBOX_IMAGE, source: { localPath: path.resolve(TASKS, "../fixtures/.build/toy-cart") }, maxLifetimeMs: 4000 });
      expect(containerExists(h.id)).toBe(true);
      // no destroy(): simulate the harness dying
      const deadline = Date.now() + 30_000;
      while (containerExists(h.id) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
      expect(containerExists(h.id)).toBe(false);
    }, 60_000);

    it("untracked files on the host (e.g. .env) never enter the sandbox: only committed history goes in", async () => {
      const copy = mkdtempSync(path.join(tmpdir(), "tracehound-untracked-"));
      cpSync(path.resolve(TASKS, "../fixtures/.build/toy-cart"), copy, { recursive: true });
      writeFileSync(path.join(copy, ".env"), "SECRET=do-not-copy\n");
      writeFileSync(path.join(copy, "src", "untracked.ts"), "export const x = 1;\n");
      const provider = new LocalDockerProvider();
      const h = await provider.create({ image: SANDBOX_IMAGE, source: { localPath: copy } });
      try {
        const r = await provider.exec(h, "ls -A /work /work/src; grep -rl do-not-copy / --exclude-dir=proc --exclude-dir=sys 2>/dev/null || true", { timeoutMs: 60_000 });
        expect(r.stdout).not.toContain(".env");
        expect(r.stdout).not.toContain("untracked.ts");
        expect(r.stdout).not.toContain("do-not-copy");
      } finally {
        await provider.destroy(h);
        rmSync(copy, { recursive: true, force: true });
      }
    }, 120_000);

    it("the image's base layers are pinned by digest", () => {
      const froms = readFileSync(SANDBOX_DOCKERFILE, "utf8").split("\n").filter((l) => l.startsWith("FROM "));
      expect(froms).toHaveLength(2);
      for (const from of froms) expect(from).toMatch(/^FROM \S+@sha256:[0-9a-f]{64}( AS \w+)?$/);
    });

    it("1. oracle + correct patch → RESOLVED", async () => {
      const r = await run("toy-discount", "oracle", "fix.patch");
      expect(r).toMatchObject({ finalState: "RESOLVED", repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
      expect(r.commands.filter((c) => c.phase === "NETWORK_OFF").map((c) => c.exitCode === 0)).toEqual([false, false]); // proven off
      expect(r.commands.findIndex((c) => c.phase === "NETWORK_OFF")).toBeLessThan(r.commands.findIndex((c) => c.phase === "REPRODUCING"));
      expect(r.diff).toContain("+  return total * (1 - percent / 100);");
      expect(r.diff).not.toContain("repro"); // the repro test is never part of the agent's diff
      // decision 036: what the run ran in, recorded
      const imageId = spawnSync("docker", ["image", "inspect", "--format", "{{.Id}}", SANDBOX_IMAGE], { encoding: "utf8" }).stdout.trim();
      expect(r.sandboxEnv).toEqual({ provider: "docker", providerVersion: "docker-provider@2", engineVersion: expect.stringMatching(/^docker \d+\.\d+/), image: SANDBOX_IMAGE, imageId });
      expect(imageId).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(r.snapshot).toBe("none");
    }, 120_000);

    it("2. noop → UNRESOLVED (repro still fails)", async () => {
      const r = await run("toy-discount", "noop");
      expect(r).toMatchObject({ finalState: "UNRESOLVED", reason: "repro still fails (exit 1)", diff: "" });
    }, 120_000);

    it("3. oracle + bad patch → UNRESOLVED, naming the regression", async () => {
      const r = await run("toy-discount", "oracle", "bad-fix.patch");
      expect(r.finalState).toBe("UNRESOLVED");
      expect(r.reason).toBe('regression "bun test ./tests" now fails (exit 1; passed at baseline)');
      expect(r.repro.afterPatch!.exitCode).toBe(0); // the bug itself is fixed; the regression is what fails
    }, 120_000);

    it('4. repro already passes at baseSha → FAILED "repro does not reproduce"', async () => {
      const r = await run("toy-already-passes", "noop");
      expect(r).toMatchObject({ finalState: "FAILED", reason: "repro does not reproduce: the repro test passes at baseSha" });
    }, 120_000);

    it("5. a command past its timeout → FAILED, container removed", async () => {
      const r = await run("toy-timeout", "noop");
      expect(r).toMatchObject({ finalState: "FAILED", reason: "setup command timed out after 2000ms: sleep 30" });
      const sleep = r.commands.find((c) => c.cmd === "sleep 30")!;
      expect(sleep.timedOut).toBe(true);
      expect(sleep.durationMs).toBeLessThan(10_000);
    }, 120_000);
  });
