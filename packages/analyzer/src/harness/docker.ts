// LocalDockerProvider (decisions 026, 036: Docker is the sandbox of record). Security rules:
// - nothing from the host is mounted; the repo goes in as a `git bundle` of committed history
//   (untracked files such as .env can't be in it), copied with `docker cp`
// - no -e/--env-file: the container sees only the image's own environment
// - network only while preparing (clone + setup); the harness then disconnects it and proves it's
//   off before REPRODUCING; no capabilities; memory/cpu/pid limits
// - the container runs as the unprivileged image user (uid 1000), never root
// - `--rm` plus a bounded `sleep` as PID 1: a container whose harness died without destroy()
//   stops by itself at its deadline and Docker removes it (and any anonymous volumes)
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanGitEnv } from "../git-env.ts";
import { SandboxGoneError, type ExecResult, type SandboxDescription, type SandboxHandle, type SandboxProvider, type SandboxSource, type SandboxStatus } from "./provider.ts";

export const SANDBOX_IMAGE = "tracehound-sandbox:bun1.4.2-ts5.9.3-2";
/** Bumped when the provider's isolation or record behavior changes. */
export const DOCKER_PROVIDER_VERSION = "docker-provider@2";
export const SANDBOX_UID = "1000:1000";
/**
 * Timeouts for the docker CLI calls that had none (decision 037). create/start are metadata
 * operations; cp moves the repo's git bundle (CEX: ~200 KB; a large repo's bundle is tens of MB).
 */
export const DOCKER_TIMEOUTS: Readonly<{ create: number; start: number; cp: number }> = { create: 60_000, start: 60_000, cp: 120_000 };
const GONE = /No such container|is not running/i;
/** Default self-removal deadline for a sandbox nobody destroys (overridden by the run's own limit). */
const DEFAULT_MAX_LIFETIME_MS = 2 * 60 * 60_000;
export const SANDBOX_DOCKERFILE = path.resolve(import.meta.dirname, "../../../../harness/sandbox.Dockerfile");
const WORKDIR = "/work";
const MAX_OUTPUT = 1_000_000; // bytes kept per stream

export class DockerUnavailableError extends Error {
  override name = "DockerUnavailableError";
}

/** `docker version` succeeds (client and daemon). */
export function dockerAvailable(): { ok: boolean; detail: string } {
  const r = spawnSync("docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"], { encoding: "utf8", timeout: 15_000 });
  if (r.error) return { ok: false, detail: `docker not found: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, detail: (r.stderr || r.stdout).trim() || `docker version exited ${r.status}` };
  return { ok: true, detail: r.stdout.trim() };
}

export function run(cmd: string, args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: cleanGitEnv() }); // git clone/bundle on the host (decision 032)
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d: Buffer) => (stdout = (stdout + d.toString()).slice(-MAX_OUTPUT)));
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-MAX_OUTPUT)));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.on("error", (error) => (stderr += `\n${error.message}`));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code ?? (timedOut ? 124 : 1), stdout, stderr, durationMs: Math.round(performance.now() - started), timedOut });
    });
    child.stdin.end(opts.input ?? "");
  });
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export class LocalDockerProvider implements SandboxProvider {
  readonly name = "docker";
  readonly #live = new Set<string>();
  readonly #destroyed = new Set<string>();
  readonly #docker: string;
  readonly #timeouts: { create: number; start: number; cp: number };

  /** `docker`: the CLI to run (tests substitute a wrapper); `timeouts`: overrides of DOCKER_TIMEOUTS. */
  constructor(opts: { docker?: string; timeouts?: Partial<typeof DOCKER_TIMEOUTS> } = {}) {
    this.#docker = opts.docker ?? "docker";
    this.#timeouts = { ...DOCKER_TIMEOUTS, ...opts.timeouts };
  }

  #run(args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<ExecResult> {
    return run(this.#docker, args, opts);
  }

  /** A docker CLI step that must succeed: a timeout or failure names the step. */
  async #must(step: string, args: string[], timeoutMs: number): Promise<ExecResult> {
    const r = await this.#run(args, { timeoutMs });
    if (r.timedOut) throw new Error(`${step} timed out after ${Math.round(timeoutMs / 1000)} s`);
    if (r.exitCode !== 0) throw new Error(`${step} failed: ${r.stderr.trim()}`);
    return r;
  }

  /** Throw SandboxGoneError when a docker exec failed because the container is gone. */
  async #checkGone(handle: SandboxHandle, r: ExecResult, what: string): Promise<void> {
    if (r.exitCode === 0) return;
    if (GONE.test(r.stderr) || (await this.status(handle)) === "gone" || (await this.status(handle)) === "stopped") {
      throw new SandboxGoneError(`${what}: sandbox ${handle.id} is gone (${r.stderr.trim().split("\n")[0] || `exit ${r.exitCode}`})`);
    }
  }

  /** Stop and report if Docker isn't usable here (decision 026). */
  static assertAvailable(): string {
    const v = dockerAvailable();
    if (!v.ok) throw new DockerUnavailableError(`Docker is not available: ${v.detail}`);
    return v.detail;
  }

  /** Build the pinned sandbox image if this machine doesn't have it (needs registry access once). */
  static async ensureImage(image = SANDBOX_IMAGE): Promise<void> {
    if ((await run("docker", ["image", "inspect", image])).exitCode === 0) return;
    if (image !== SANDBOX_IMAGE) throw new Error(`image ${image} not found locally`);
    const r = await run("docker", ["build", "-q", "-f", SANDBOX_DOCKERFILE, "-t", image, path.dirname(SANDBOX_DOCKERFILE)], { timeoutMs: 15 * 60_000 });
    if (r.exitCode !== 0) throw new Error(`docker build ${image} failed: ${r.stderr.slice(-2000)}`);
  }

  async create(opts: { image: string; source: SandboxSource; maxLifetimeMs?: number }): Promise<SandboxHandle> {
    const name = `th-${randomUUID().slice(0, 12)}`;
    const handle: SandboxHandle = { id: name, provider: this.name };
    const scratch = mkdtempSync(path.join(tmpdir(), "tracehound-src-"));
    try {
      const bundle = path.join(scratch, "src.bundle");
      await this.#bundle(opts.source, scratch, bundle);
      this.#live.add(name);
      const lifetimeMs = opts.maxLifetimeMs ?? DEFAULT_MAX_LIFETIME_MS;
      await this.#must("docker create", [
        "create", "--name", name, "--label", "tracehound.sandbox=1",
        "--network", "bridge",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--memory", "2g", "--cpus", "2", "--pids-limit", "512",
        "--user", SANDBOX_UID, "--rm",
        "--workdir", WORKDIR, opts.image, "sleep", String(Math.ceil(lifetimeMs / 1000)),
      ], this.#timeouts.create);
      // the lifetime runs from start: set expiresAt just before, so it's never later than the real end
      handle.lifetimeMs = lifetimeMs;
      handle.expiresAt = Date.now() + lifetimeMs;
      await this.#must("docker start", ["start", name], this.#timeouts.start);
      await this.#must("docker cp of the repo bundle", ["cp", bundle, `${name}:/tmp/src.bundle`], this.#timeouts.cp);
      const clone = await this.exec(handle, "git clone -q /tmp/src.bundle .", { timeoutMs: 120_000 });
      if (clone.exitCode !== 0) throw new Error(`git clone in sandbox failed: ${clone.stderr.trim()}`);
      // docker cp leaves the bundle owned by root in sticky /tmp: only root may delete it
      const rmBundle = await this.#run(["exec", "-u", "0", name, "rm", "-f", "/tmp/src.bundle"], { timeoutMs: 30_000 });
      if (rmBundle.exitCode !== 0) throw new Error(`removing the clone bundle failed: ${rmBundle.stderr.trim()}`);
      return handle;
    } catch (error) {
      await this.destroy(handle);
      throw error;
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  /** Committed history only: a bundle of every ref. gitUrl sources are cloned on the host first. */
  async #bundle(source: SandboxSource, scratch: string, bundle: string): Promise<void> {
    let repo: string;
    if ("localPath" in source) {
      repo = source.localPath;
      if (!existsSync(path.join(repo, ".git"))) throw new Error(`localPath ${repo} is not a git repository`);
    } else {
      repo = path.join(scratch, "clone");
      const clone = await run("git", ["clone", "-q", "--no-checkout", source.gitUrl, repo], { timeoutMs: 10 * 60_000 });
      if (clone.exitCode !== 0) throw new Error(`git clone ${source.gitUrl} failed: ${clone.stderr.trim()}`);
      const has = await run("git", ["-C", repo, "cat-file", "-e", `${source.sha}^{commit}`]);
      if (has.exitCode !== 0) throw new Error(`${source.gitUrl} has no commit ${source.sha}`);
    }
    const b = await run("git", ["-C", repo, "bundle", "create", bundle, "--all"], { timeoutMs: 10 * 60_000 });
    if (b.exitCode !== 0) throw new Error(`git bundle failed: ${b.stderr.trim()}`);
  }

  async describe(image: string): Promise<SandboxDescription> {
    const engine = await this.#run(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 });
    const id = await this.#run(["image", "inspect", "--format", "{{.Id}}", image], { timeoutMs: 15_000 });
    return {
      provider: this.name,
      providerVersion: DOCKER_PROVIDER_VERSION,
      ...(engine.exitCode === 0 && { engineVersion: `docker ${engine.stdout.trim()}` }),
      image,
      ...(id.exitCode === 0 && { imageId: id.stdout.trim() }),
    };
  }

  async exec(handle: SandboxHandle, cmd: string, opts: { timeoutMs: number }): Promise<ExecResult> {
    const secs = Math.max(1, Math.ceil(opts.timeoutMs / 1000));
    // inside: coreutils timeout (exit 124, KILL 2s later); outside: kill the docker client as a backstop
    const r = await this.#run(["exec", "-w", WORKDIR, handle.id, "timeout", "-k", "2", String(secs), "sh", "-c", cmd], { timeoutMs: opts.timeoutMs + 10_000 });
    // only the daemon's own error text is trusted here: a command may print anything
    if (r.exitCode !== 0 && GONE.test(r.stderr) && (await this.status(handle)) !== "running") throw new SandboxGoneError(`docker exec: sandbox ${handle.id} is gone (${r.stderr.trim().split("\n")[0]})`);
    const hitLimit = (r.exitCode === 124 || r.exitCode === 137) && r.durationMs >= secs * 1000 - 250;
    return { ...r, timedOut: r.timedOut || hitLimit };
  }

  async disableNetwork(handle: SandboxHandle): Promise<void> {
    const r = await this.#run(["network", "disconnect", "--force", "bridge", handle.id], { timeoutMs: 60_000 });
    await this.#checkGone(handle, r, "docker network disconnect");
    if (r.exitCode !== 0) throw new Error(`docker network disconnect failed: ${r.stderr.trim()}`);
  }

  async writeFile(handle: SandboxHandle, file: string, content: string): Promise<void> {
    const target = path.posix.isAbsolute(file) ? file : path.posix.join(WORKDIR, file);
    const r = await this.#run(["exec", "-i", handle.id, "sh", "-c", `mkdir -p ${shellQuote(path.posix.dirname(target))} && cat > ${shellQuote(target)}`], { input: content, timeoutMs: 60_000 });
    await this.#checkGone(handle, r, `writeFile ${target}`);
    if (r.exitCode !== 0) throw new Error(`writeFile ${target} failed: ${r.stderr.trim()}`);
  }

  async readFile(handle: SandboxHandle, file: string): Promise<string> {
    const target = path.posix.isAbsolute(file) ? file : path.posix.join(WORKDIR, file);
    const r = await this.#run(["exec", handle.id, "cat", target], { timeoutMs: 60_000 });
    await this.#checkGone(handle, r, `readFile ${target}`);
    if (r.exitCode !== 0) throw new Error(`readFile ${target} failed: ${r.stderr.trim()}`);
    return r.stdout;
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    // `docker rm -f` exits 0 for a container that's already gone, so ask first: only a container
    // that still existed counts as removed by the harness
    const before = await this.status(handle);
    const r = await this.#run(["rm", "-f", handle.id], { timeoutMs: 60_000 });
    if (r.exitCode === 0 && (before === "running" || before === "stopped")) this.#destroyed.add(handle.id);
    this.#live.delete(handle.id);
  }

  async status(handle: SandboxHandle): Promise<SandboxStatus> {
    const r = await this.#run(["inspect", "--format", "{{.State.Running}}", handle.id], { timeoutMs: 15_000 });
    if (r.timedOut) return "unknown";
    if (r.exitCode !== 0) return GONE.test(r.stderr) || /No such object/i.test(r.stderr) ? "gone" : "unknown";
    return r.stdout.trim() === "true" ? "running" : "stopped";
  }

  removedByHarness(handle: SandboxHandle): boolean {
    return this.#destroyed.has(handle.id);
  }

  /** Containers this provider created and hasn't destroyed yet (for signal handlers). */
  live(): SandboxHandle[] {
    return [...this.#live].map((id) => ({ id, provider: this.name }));
  }
}
