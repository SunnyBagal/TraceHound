// Agents act only through AgentContext: provider operations scoped to one sandbox, the issue text,
// the limits and (optionally) graph tools. They never see the handle, the task dir or the repro test.
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import type { ExecResult } from "./provider.ts";
import type { TaskSpec } from "./task.ts";

/**
 * An agent may end its own run with a stop reason (e.g. "stuck"). The harness still verifies, and
 * records the run as UNRESOLVED with exactly that reason - like an exhausted budget, never RESOLVED.
 */
export class AgentStopped extends Error {
  override name = "AgentStopped";
}

export interface AgentContext {
  issue: string;
  limits: TaskSpec["limits"];
  /** The task's own check commands (regression + typecheck), run from /work. Never the repro. */
  testCommands: string[];
  /**
   * The repo's state relative to the sandbox's base commit: a hash over the diff (untracked files
   * included) and whether that diff is empty. A harness probe: not a step, not the agent's exec.
   */
  repoState(): Promise<{ hash: string; empty: boolean }>;
  exec(cmd: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  /**
   * Model calls go through the harness's shared client (cache → budget → request → ledger). The
   * harness counts tokens and cost from the API responses' usage fields; agents can't report their
   * own. Absent when the run has no client (scripted agents).
   */
  llm?: { chat(request: ChatRequest, meta?: { purpose: string }): Promise<ChatResult> };
  /**
   * Count one step for an agent action that makes no provider call (finish, a graph tool, a
   * rejected or malformed tool call). Provider operations count themselves.
   */
  step(label: string): void;
  /** Steps counted so far (the harness's count, the same one the step limit uses). */
  stepsUsed(): number;
  /** Read-only graph tools over the target's snapshot, when the harness has one. */
  graph?: {
    searchComponents(query: string): unknown;
    getNeighbors(componentId: string): unknown;
    getEdgeEvidence(edgeId: string): unknown;
    getRelatedTests(componentId: string): unknown;
  };
}

export interface Agent {
  readonly name: string;
  run(ctx: AgentContext): Promise<void>;
  /** Observational record of what the agent did (transcript etc.). Never used for verification. */
  readonly trace?: unknown;
}

/** Scripted: applies a known patch with `git apply`. Proves the harness can reach RESOLVED. */
export class OracleAgent implements Agent {
  readonly name = "oracle";
  readonly #patch: string;
  constructor(patch: string) {
    this.#patch = patch;
  }
  async run(ctx: AgentContext): Promise<void> {
    await ctx.writeFile("/tmp/oracle.patch", this.#patch); // outside /work: not part of the diff
    const r = await ctx.exec("git apply --whitespace=nowarn /tmp/oracle.patch && rm /tmp/oracle.patch");
    if (r.exitCode !== 0) throw new Error(`git apply failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
}

/** Scripted: does nothing. Proves an untouched repo stays UNRESOLVED. */
export class NoopAgent implements Agent {
  readonly name = "noop";
  async run(): Promise<void> {}
}
