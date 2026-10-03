// Host-side metrics computed from a finished run's trace (decision 047). Observational only: nothing
// here feeds the verdict. "Time to fault file" = the step of the first successful read of a file the
// task's seed patch changed, and the model tokens used up to and including the call that made it.
import path from "node:path";
import type { LoopTrace, LoopTurn } from "./loop.ts";
import type { RunRecord } from "./run.ts";
import { WORKDIR } from "./tools.ts";

/**
 * Repo-relative paths a patch touches (both sides; /dev/null excluded), in patch order. Read from the
 * `diff --git` headers when there are any (a removed line like "-- comment" would look like a
 * `---` header), else from the `---` / `+++` lines of a plain unified diff.
 */
export function patchFiles(patch: string): string[] {
  const files: string[] = [];
  const add = (f: string) => f !== "/dev/null" && !files.includes(f) && files.push(f);
  const git = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  if (git.length) for (const m of git) (add(m[1]!), add(m[2]!));
  else for (const m of patch.matchAll(/^(?:---|\+\+\+) (?:[ab]\/)?(.+?)\t?$/gm)) add(m[1]!.trim());
  return files;
}

/** A read_file path as the model wrote it ("/work/x", "./x", "x") → repo-relative; undefined outside /work. */
export function repoRelative(p: unknown): string | undefined {
  if (typeof p !== "string" || !p) return undefined;
  const abs = path.posix.normalize(path.posix.isAbsolute(p) ? p : path.posix.join(WORKDIR, p));
  return abs.startsWith(`${WORKDIR}/`) ? abs.slice(WORKDIR.length + 1) : undefined;
}

/** The result the loop records when a second call follows finish in the same turn: not executed, no step. */
const NOT_EXECUTED = "not executed: finish was already called";

export interface FaultFileRead {
  /** the files the seed patch changed (repo-relative) */
  files: string[];
  /** null: the agent never read one of them */
  read: { step: number; turn: number; tokens: number; file: string } | null;
}

/**
 * Walks the turns the way the harness counts steps: a reply without a tool call is one step, every
 * executed tool call is one step. A read is a successful read_file call, or a call the loop ran as
 * read_file (`ranAs`, agent-v6 aliases).
 */
export function faultFileRead(trace: Pick<LoopTrace, "turns">, seedPatch: string): FaultFileRead {
  const files = patchFiles(seedPatch);
  let step = 0;
  let tokens = 0;
  for (const turn of trace.turns) {
    tokens += turn.inputTokens + turn.outputTokens;
    if (!turn.toolCalls.length) {
      step++;
      continue;
    }
    for (const call of turn.toolCalls) {
      const result = turn.toolResults.find((r) => r.id === call.id);
      if (!result || result.result.startsWith(NOT_EXECUTED)) continue;
      step++;
      const ranAs = (result as LoopTurn["toolResults"][number]).ranAs ?? call.name;
      if (ranAs !== "read_file" || !result.ok) continue;
      let args: { path?: unknown };
      try {
        args = JSON.parse(call.arguments) as { path?: unknown };
      } catch {
        continue;
      }
      const file = repoRelative(args.path);
      if (file && files.includes(file)) return { files, read: { step, turn: turn.turn, tokens, file } };
    }
  }
  return { files, read: null };
}

/** Per-run counts the runner's table shows next to the state (decision 047). */
export interface RunMetrics {
  /** "finish", "budget: <limit>", "stopped: <reason>", "error: <message>", or "—" without an agent run */
  endReason: string;
  /** edit_file / write_file calls (and calls run as one) whose result was an error */
  failedEdits: number;
  /** calls answered with the unknown-tool line */
  unknownToolCalls: number;
  /** agent-v6: str_replace_editor calls run as a real tool */
  aliasCalls: number;
}

export function runMetrics(record: Pick<RunRecord, "agentRun">): RunMetrics {
  const run = record.agentRun;
  const trace = run?.trace as Partial<LoopTrace> | undefined;
  const results = (trace?.turns ?? []).flatMap((t) => t.toolResults.map((r) => ({ ...r, tool: r.ranAs ?? r.name })));
  return {
    endReason: !run
      ? "—"
      : run.budgetExhausted
        ? `budget: ${run.budgetExhausted}`
        : run.stopped
          ? `stopped: ${run.stopped}`
          : run.error
            ? `error: ${run.error.slice(0, 80)}`
            : trace?.finishSummary !== undefined
              ? "finish"
              : "—",
    failedEdits: results.filter((r) => (r.tool === "edit_file" || r.tool === "write_file") && !r.ok && !r.result.startsWith(NOT_EXECUTED)).length,
    unknownToolCalls: results.filter((r) => r.result.startsWith('error: unknown tool "')).length,
    aliasCalls: results.filter((r) => r.ranAs !== undefined).length,
  };
}
