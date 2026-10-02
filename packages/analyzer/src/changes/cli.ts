// tracehound changes --repo <path> --diff <base>..<head> [--config <tracehound.json>] [--out <file>] [--json]
// tracehound changes --run <run record> [--config <tracehound.json>] [--out <file>] [--json]
// A declaration-level change set with an architectural rollup (decision 038). No model, no network
// (except cloning a gitUrl task source for --run).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadTask } from "../harness/task.ts";
import type { ChangeSet } from "../schema.ts";
import { ChangesError, computeChangeSet, resolveConfig } from "./changeset.ts";
import { git } from "./git.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
export const CHANGES_USAGE =
  "usage: tracehound changes --repo <path> --diff <base>..<head> [--config <tracehound.json>] [--out <file>] [--json]\n" +
  "       tracehound changes --run <run record> [--config <tracehound.json>] [--out <file>] [--json]";

export function runChanges(argv: string[]): { changeSet: ChangeSet; text: string } {
  const { values } = parseArgs({
    args: argv,
    options: { repo: { type: "string" }, diff: { type: "string" }, run: { type: "string" }, config: { type: "string" }, out: { type: "string" }, json: { type: "boolean", default: false } },
  });
  let changeSet: ChangeSet;
  if (values.run) {
    const record = JSON.parse(readFileSync(values.run, "utf8")) as { runId: string; taskId: string; baseSha: string; diff?: string };
    if (typeof record.diff !== "string") throw new ChangesError(`${values.run} has no recorded diff`);
    const task = loadTask(path.join(WORKSPACE_ROOT, "eval/tasks", record.taskId, "task.json"));
    let repo = task.localPath;
    let cleanup = () => {};
    if (!repo && "gitUrl" in task.spec.source) {
      const dir = mkdtempSync(path.join(tmpdir(), "tracehound-changes-clone-"));
      git(dir, ["clone", "-q", task.spec.source.gitUrl, "."]);
      repo = dir;
      cleanup = () => rmSync(dir, { recursive: true, force: true });
    }
    try {
      changeSet = computeChangeSet({ repo: repo!, base: record.baseSha, run: { runId: record.runId, taskId: record.taskId, patch: record.diff }, configPath: resolveConfig(repo!, values.config, WORKSPACE_ROOT) });
    } finally {
      cleanup();
    }
  } else {
    const range = /^([^.]+)\.\.([^.]+)$/.exec(values.diff ?? "");
    if (!values.repo || !range) throw new ChangesError(CHANGES_USAGE);
    changeSet = computeChangeSet({ repo: values.repo, base: range[1]!, head: range[2]!, configPath: resolveConfig(values.repo, values.config, WORKSPACE_ROOT) });
  }
  if (values.out) {
    mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
    writeFileSync(values.out, JSON.stringify(changeSet, null, 2) + "\n");
  }
  return { changeSet, text: values.json ? JSON.stringify(changeSet, null, 2) : formatChangeSet(changeSet) + (values.out ? `\n→ ${values.out}` : "") };
}

export function formatChangeSet(c: ChangeSet): string {
  const head = "run" in c.head ? `run ${c.head.run.runId}` : c.head.sha.slice(0, 7);
  const s = c.stats;
  const out = [
    `tracehound changes · ${c.repo.name} · ${c.base.sha.slice(0, 7)}..${head} · analyzer ${c.analyzerVersion} · ${s.runtimeMs} ms`,
    `files: +${s.files.added} −${s.files.removed} ~${s.files.modified} · declarations: +${s.declarations.added} −${s.declarations.removed} ~${s.declarations.modified} (${s.declarations.formatting} formatting only, ${s.declarations.unchanged} unchanged) · edges: +${s.edges.added} −${s.edges.removed}`,
    `calls (head): ${s.calls.head.resolved} resolved, ${s.calls.head.external} external, ${s.calls.head.dynamic} dynamic`,
    "",
    "Components",
    ...c.components.map((x) => `  ${x.id}  +${x.declarations.added} −${x.declarations.removed} ~${x.declarations.modified} decl · cross-component edges +${x.edges.crossComponentAdded} −${x.edges.crossComponentRemoved} · cross-process +${x.edges.crossProcessAdded} −${x.edges.crossProcessRemoved}${x.componentEdges.added.length || x.componentEdges.removed.length ? ` · component edges +[${x.componentEdges.added.join(", ")}] −[${x.componentEdges.removed.join(", ")}]` : ""}`),
    "",
    "Declarations",
    ...c.declarations.filter((d) => d.status !== "unchanged").map((d) => `  ${d.status.padEnd(8)} ${d.kind.padEnd(15)} ${d.id}${d.modifications.length ? ` [${d.modifications.join(", ")}]` : ""} +${d.lines.added}/−${d.lines.removed}`),
    "",
    "Edges",
    ...c.edges.filter((e) => e.status !== "unchanged").map((e) => `  ${e.status.padEnd(8)} ${e.kind.padEnd(8)} ${e.from} → ${e.to}  (${e.evidence.map((v) => `${v.side} ${v.file}:${v.line}`).slice(0, 3).join(", ")})`),
    "",
    `Warnings (${c.warnings.length})`,
    ...c.warnings.flatMap((w) => [`  [${w.kind}] ${w.message}`, `    rule: ${w.rule}`, ...w.evidence.map((e) => `    ${e.side} ${e.file}:${e.line}  ${e.detail}`)]),
  ];
  return out.join("\n");
}

export function main(argv: string[]): void {
  try {
    console.log(runChanges(argv).text);
  } catch (error) {
    const badArgs = typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code.startsWith("ERR_PARSE_ARGS");
    if (!(error instanceof ChangesError) && !badArgs) throw error;
    console.error(`✖ ${(error as Error).message}${badArgs ? `\n${CHANGES_USAGE}` : ""}`);
    process.exit(1);
  }
}
