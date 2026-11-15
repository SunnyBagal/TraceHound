// Narrow typed check (side track C; the frozen contract check in src/contracts is not changed).
// The same question as contracts' typed stage: which tsc diagnostics does a pull request add in
// files it did not edit? That stage compiles every tsconfig's whole program at base and at head and
// gives up above 5,000 root files; on the 40 dev cases it finished 3 times (32 over the file cap,
// 5 over 120 s). Here only the unedited files that the affected set says use a changed declaration
// are checked, at both commits, each with its nearest tsconfig. Their imports are followed for
// real, so types are real; nothing is installed, and what cannot be resolved fails the same way on
// both sides and cancels. No model.
import { existsSync } from "node:fs";
import path from "node:path";
import { Project, ts } from "ts-morph";
import { tscCandidate, type ContractCandidate } from "../contracts/findings.ts";
import { openTrees } from "../contracts/trees.ts";
import { findTsconfigs, newDiagnostics, type TypedDiagnostic } from "../contracts/typed.ts";
import { discoverPackages } from "../load/workspace.ts";
import { computeAffected } from "./affected.ts";

export const TYPED_NARROW_VERSION = "typed-narrow@0.1";
export const TYPED_NARROW_BUDGET_MS = 120_000;

const CHECK: ts.CompilerOptions = { noEmit: true, composite: false, incremental: false, declaration: false, skipLibCheck: true, allowImportingTsExtensions: true };
const FALLBACK: ts.CompilerOptions = { ...CHECK, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, strict: true };
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Raw {
  path: string;
  line: number;
  column: number;
  code: number;
  key: string;
  message: string;
  tsconfig: string;
}

export interface NarrowTypedReport {
  version: typeof TYPED_NARROW_VERSION;
  refs: { base: string; head: string; mergeBase: string };
  status: "complete" | "skipped-budget" | "nothing-to-check";
  /** unedited files that reference a changed declaration: the files checked at each side */
  checked: { files: number; missingAtBase: number; tsconfigs: number; changedDeclarations: number; declarationsNotResolved: number };
  diagnostics: { base: number; head: number; new: number };
  /** new diagnostics in the checked files, each with the changed declaration it sits next to */
  findings: ContractCandidate[];
  ms: { trees: number; affected: number; base: number; head: number; total: number };
}

class BudgetExceeded extends Error {}

/** Workspace package names → source directories under `root`, as src/affected does: no install is assumed. */
function aliases(root: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const pkg of discoverPackages(root)) {
    if (pkg.root === "." || !pkg.name) continue;
    const dir = path.join(root, pkg.root);
    const entry = ["src/index.ts", "src/index.tsx", "index.ts"].map((e) => path.join(dir, e)).find((e) => existsSync(e));
    if (entry) out[pkg.name] = [entry];
    out[`${pkg.name}/*`] = [path.join(dir, "src/*"), path.join(dir, "*")];
  }
  return out;
}

function checkSide(root: string, files: string[], deadline: number): { diagnostics: Raw[]; missing: number; tsconfigs: number } {
  const configs = findTsconfigs(root).sort((a, b) => path.dirname(b).length - path.dirname(a).length || cmp(a, b));
  const paths = aliases(root);
  const groups = new Map<string, string[]>();
  let missing = 0;
  for (const file of files) {
    const abs = path.join(root, file);
    if (!existsSync(abs)) {
      missing++;
      continue;
    }
    // the nearest tsconfig above the file (the one an editor would use), or none
    const owner = configs.find((c) => abs.startsWith(path.dirname(c) + path.sep)) ?? "";
    groups.set(owner, [...(groups.get(owner) ?? []), abs]);
  }
  const normalize = (text: string) => text.split(root + "/").join("").split(root).join("").replace(/\s+/g, " ").trim();
  const diagnostics: Raw[] = [];
  for (const [config, group] of [...groups.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    if (performance.now() > deadline) throw new BudgetExceeded();
    let project: Project;
    try {
      project = config ? new Project({ tsConfigFilePath: config, skipAddingFilesFromTsConfig: true, compilerOptions: CHECK }) : new Project({ compilerOptions: FALLBACK });
    } catch {
      project = new Project({ compilerOptions: FALLBACK }); // a tsconfig that extends a package not installed
    }
    project.compilerOptions.set({ paths: { ...paths, ...(project.compilerOptions.get().paths ?? {}) } });
    for (const abs of group.sort(cmp)) project.addSourceFileAtPath(abs);
    const program = project.getProgram().compilerObject;
    for (const abs of group) {
      if (performance.now() > deadline) throw new BudgetExceeded();
      const sf = program.getSourceFile(abs);
      if (!sf) continue;
      for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
        if (!d.file || d.start === undefined) continue;
        const pos = d.file.getLineAndCharacterOfPosition(d.start);
        const flat = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        diagnostics.push({
          path: path.relative(root, d.file.fileName),
          line: pos.line + 1,
          column: pos.character + 1,
          code: d.code,
          key: normalize(flat),
          message: normalize(flat.split("\n")[0]!),
          tsconfig: config ? path.relative(root, config) : "(no tsconfig)",
        });
      }
    }
  }
  return { diagnostics, missing, tsconfigs: groups.size };
}

export function computeNarrowTyped(input: { repo: string; base: string; head: string; budgetMs?: number }): NarrowTypedReport {
  const started = performance.now();
  const budgetMs = input.budgetMs ?? TYPED_NARROW_BUDGET_MS;
  const deadline = started + budgetMs;
  let mark = started;
  const lap = () => {
    const now = performance.now();
    const ms = Math.round(now - mark);
    mark = now;
    return ms;
  };
  const trees = openTrees(input.repo, input.base, input.head);
  try {
    const treesMs = lap();
    const refs = { base: input.base, head: trees.headSha, mergeBase: trees.baseSha };
    // every reference, not only the ones a reviewer is shown
    const affected = computeAffected({ repo: trees.head, diff: `${trees.baseSha}..${trees.headSha}`, maxRefs: 1_000_000, budgetMs });
    const affectedMs = lap();
    // unedited file → the changed declarations used in it, with the line of each use
    const uses = new Map<string, { line: number; declFile: string; declLine: number }[]>();
    for (const d of affected.declarations) {
      for (const ref of d.references) {
        if (ref.inDiff || trees.edited.has(ref.file)) continue;
        uses.set(ref.file, [...(uses.get(ref.file) ?? []), { line: ref.line, declFile: d.file, declLine: d.changedLines[0] ?? d.startLine }]);
      }
    }
    const files = [...uses.keys()].sort(cmp);
    const checkedBase = { files: files.length, missingAtBase: 0, tsconfigs: 0, changedDeclarations: affected.counts.declarations, declarationsNotResolved: affected.counts.declarations - affected.counts.resolved };
    const ms = (base: number, head: number) => ({ trees: treesMs, affected: affectedMs, base, head, total: Math.round(performance.now() - started) });
    if (files.length === 0) return { version: TYPED_NARROW_VERSION, refs, status: "nothing-to-check", checked: checkedBase, diagnostics: { base: 0, head: 0, new: 0 }, findings: [], ms: ms(0, 0) };
    let base: ReturnType<typeof checkSide>;
    let head: ReturnType<typeof checkSide>;
    let baseMs = 0;
    try {
      base = checkSide(trees.base, files.map((f) => [...trees.renames.entries()].find(([, to]) => to === f)?.[0] ?? f), deadline);
      baseMs = lap();
      head = checkSide(trees.head, files, deadline);
    } catch (error) {
      if (error instanceof BudgetExceeded) return { version: TYPED_NARROW_VERSION, refs, status: "skipped-budget", checked: checkedBase, diagnostics: { base: 0, head: 0, new: 0 }, findings: [], ms: ms(baseMs, 0) };
      throw error;
    }
    const headMs = lap();
    const fresh = newDiagnostics(trees, base.diagnostics, head.diagnostics).filter((d) => !trees.edited.has(d.path));
    const findings: ContractCandidate[] = [];
    for (const d of fresh.sort((a, b) => cmp(a.path, b.path) || a.line - b.line || a.column - b.column || a.code - b.code)) {
      const near = [...(uses.get(d.path) ?? [])].sort((a, b) => Math.abs(a.line - d.line) - Math.abs(b.line - d.line))[0];
      if (!near) continue;
      const typed: TypedDiagnostic = {
        path: d.path, line: d.line, column: d.column, code: d.code, message: d.message, text: trees.lineText("head", d.path, d.line), tsconfig: d.tsconfig,
        cause: { path: near.declFile, line: near.declLine, side: "head", text: trees.lineText("head", near.declFile, near.declLine), how: "changed declaration used nearest to the diagnostic in this file" },
      };
      const candidate = tscCandidate(typed);
      if (candidate) findings.push(candidate);
    }
    return {
      version: TYPED_NARROW_VERSION,
      refs,
      status: "complete",
      checked: { ...checkedBase, missingAtBase: base.missing, tsconfigs: head.tsconfigs },
      diagnostics: { base: base.diagnostics.length, head: head.diagnostics.length, new: fresh.length },
      findings,
      ms: ms(baseMs, headMs),
    };
  } finally {
    trees.close();
  }
}
