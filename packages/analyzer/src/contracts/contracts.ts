// contracts-v1: the cross-file stage of a pull request review, in one call. Worktrees at the merge
// base and at head, then typed (tsc), keyed (string keys) and dependents, then deterministic
// findings. No model, no network.
import { computeDependents, type DependentsResult } from "./dependents.ts";
import { buildFindings, type ContractCandidate } from "./findings.ts";
import { computeKeyed, type KeyedResult } from "./keyed.ts";
import { TreeProjects } from "./projects.ts";
import { openTrees } from "./trees.ts";
import { computeTyped, type TypedOptions, type TypedResult } from "./typed.ts";

export interface ContractsReport {
  refs: { base: string; head: string; mergeBase: string };
  typed: TypedResult;
  keyed: KeyedResult;
  dependents: DependentsResult;
  findings: ContractCandidate[];
  timings: { worktreesMs: number; typedMs: number; keyedMs: number; dependentsMs: number; findingsMs: number; totalMs: number };
}

export function computeContracts(input: { repo: string; base: string; head: string } & TypedOptions): ContractsReport {
  const started = performance.now();
  let mark = started;
  const lap = () => {
    const now = performance.now();
    const ms = Math.round(now - mark);
    mark = now;
    return ms;
  };
  const trees = openTrees(input.repo, input.base, input.head);
  try {
    const worktreesMs = lap();
    const typed = computeTyped(trees, input);
    const typedMs = lap();
    // keyed and dependents share one set of ts-morph projects per side
    const projects = { baseProjects: new TreeProjects(trees.base), headProjects: new TreeProjects(trees.head) };
    const keyed = computeKeyed(trees, projects);
    const keyedMs = lap();
    const dependents = computeDependents(trees, projects);
    const dependentsMs = lap();
    const findings = buildFindings(typed, keyed);
    const findingsMs = lap();
    return {
      refs: { base: input.base, head: trees.headSha, mergeBase: trees.baseSha },
      typed,
      keyed,
      dependents,
      findings,
      timings: { worktreesMs, typedMs, keyedMs, dependentsMs, findingsMs, totalMs: Math.round(performance.now() - started) },
    };
  } finally {
    trees.close();
  }
}
