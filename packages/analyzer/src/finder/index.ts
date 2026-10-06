// The finder, phase 1 (decision 051): snapshot + probes → rules → hypotheses. No model call.
import { analyzeRepo } from "../analyze.ts";
import { loadWorkspace } from "../load/workspace.ts";
import type { Snapshot } from "../schema.ts";
import { CodeIndex } from "./code.ts";
import { FinderReport } from "./hypothesis.ts";
import { probe } from "./probe.ts";
import { applyRules } from "./rules.ts";

export interface FindOptions {
  configPath?: string;
  now?: () => Date;
}

/** Analyze a checkout (heuristic names, no model), probe the code at the graph's anchors, apply the rules. */
export function findHypotheses(repoPath: string, options: FindOptions = {}): { snapshot: Snapshot; report: FinderReport } {
  const workspace = loadWorkspace(repoPath);
  const snapshot = analyzeRepo(repoPath, { configPath: options.configPath, workspace, now: options.now });
  const probes = probe(snapshot, new CodeIndex(workspace));
  const report = FinderReport.parse(applyRules(snapshot, probes, { generatedAt: (options.now?.() ?? new Date()).toISOString(), config: options.configPath }));
  return { snapshot, report };
}
