// SandboxProvider: the only way the harness and agents touch a sandbox (decision 026).
export type SandboxSource = { gitUrl: string; sha: string } | { localPath: string };

export interface SandboxHandle {
  id: string;
  provider: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface SandboxProvider {
  readonly name: string;
  /** Start a sandbox (network ON, for clone and setup) with the repo at /work. Cleans up after itself if it fails. */
  create(opts: { image: string; source: SandboxSource }): Promise<SandboxHandle>;
  /** Cut the sandbox off from every network; the harness then proves it with outbound requests. */
  disableNetwork(handle: SandboxHandle): Promise<void>;
  /** Run a shell command in /work. Never throws for a non-zero exit or a timeout. */
  exec(handle: SandboxHandle, cmd: string, opts: { timeoutMs: number }): Promise<ExecResult>;
  /** Relative paths are inside /work. */
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;
  readFile(handle: SandboxHandle, path: string): Promise<string>;
  /** Idempotent; the harness calls it on every exit path. */
  destroy(handle: SandboxHandle): Promise<void>;
}
