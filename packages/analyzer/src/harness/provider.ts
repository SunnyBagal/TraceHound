// SandboxProvider: the only way the harness and agents touch a sandbox (decision 026).
export type SandboxSource = { gitUrl: string; sha: string } | { localPath: string };

export interface SandboxHandle {
  id: string;
  provider: string;
  /** decision 037: when the sandbox removes itself (epoch ms), and the lifetime that was set */
  expiresAt?: number;
  lifetimeMs?: number;
}

/**
 * The sandbox is gone (removed, or no longer running) - an infrastructure fault, never a tool
 * error for the agent and never a test result (decision 037).
 */
export class SandboxGoneError extends Error {
  override name = "SandboxGoneError";
}

export type SandboxStatus = "running" | "stopped" | "gone" | "unknown";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/** What a run record says about the sandbox it ran in (decision 036: reproducibility). */
export interface SandboxDescription {
  provider: string;
  providerVersion: string;
  engineVersion?: string; // e.g. the Docker server version
  image: string;
  imageId?: string; // content-addressed id of the image actually used
}

export interface SandboxProvider {
  readonly name: string;
  /**
   * Start a sandbox (network ON, for clone and setup) with the repo at /work. Cleans up after
   * itself if it fails. `maxLifetimeMs`: the sandbox removes itself after this long even if the
   * harness dies without calling destroy.
   */
  create(opts: { image: string; source: SandboxSource; maxLifetimeMs?: number }): Promise<SandboxHandle>;
  /** Versions and the image id, for the run record. */
  describe?(image: string): Promise<SandboxDescription>;
  /** Is the sandbox still there and running? "unknown" when the check itself failed. */
  status?(handle: SandboxHandle): Promise<SandboxStatus>;
  /** Did this provider's destroy() remove it (vs. it disappearing on its own)? */
  removedByHarness?(handle: SandboxHandle): boolean;
  /** Cut the sandbox off from every network; the harness then proves it with outbound requests. */
  disableNetwork(handle: SandboxHandle): Promise<void>;
  /** Run a shell command in /work. Never throws for a non-zero exit or a timeout; throws SandboxGoneError when the sandbox is gone. */
  exec(handle: SandboxHandle, cmd: string, opts: { timeoutMs: number }): Promise<ExecResult>;
  /** Relative paths are inside /work. */
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;
  readFile(handle: SandboxHandle, path: string): Promise<string>;
  /** Idempotent; the harness calls it on every exit path. */
  destroy(handle: SandboxHandle): Promise<void>;
}
