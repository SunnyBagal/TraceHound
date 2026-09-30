// Agents act only through AgentContext: provider operations scoped to one sandbox, the issue text,
// the limits and (optionally) graph tools. They never see the handle, the task dir or the repro test.
import type { ChatRequest, ChatResult } from "../llm/client.ts";
import type { ExecResult } from "./provider.ts";
import type { TaskSpec } from "./task.ts";

export interface AgentContext {
  issue: string;
  limits: TaskSpec["limits"];
  exec(cmd: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  /**
   * Model calls go through the harness's shared client (cache → budget → request → ledger). The
   * harness counts tokens and cost from the API responses' usage fields; agents can't report their
   * own. Absent when the run has no client (scripted agents).
   */
  llm?: { chat(request: ChatRequest): Promise<ChatResult> };
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
