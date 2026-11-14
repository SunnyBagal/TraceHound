// Affected set of a diff (side track C; not part of the frozen reviewer, decision 076g).
// Deterministic, no model: for every declaration whose lines a diff touches, the compiler-resolved
// references to it elsewhere in the repository at the head commit, each with file, line, enclosing
// declaration and the line's text. A reviewer reads this to see what a change can break outside
// the files it edits. Nothing is dropped silently: references over the per-declaration limit and
// declarations not reached inside the time budget are counted in the report.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Node, type SourceFile } from "ts-morph";
import { indexTree, type Decl } from "../changes/declarations.ts";
import { git, parseZeroContextDiff, type FileHunks } from "../changes/git.ts";
import { loadWorkspace, relPath } from "../load/workspace.ts";

export const AFFECTED_VERSION = "affected@0.1";
export const DEFAULT_MAX_REFS = 12;
export const DEFAULT_BUDGET_MS = 120_000;

const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;
const TEST_PATH = /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.[cm]?tsx?$/;
const MODULE_DECL = "<module>";
/** Code-unit order: the same on every machine, whatever its locale. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface AffectedRef {
  file: string;
  line: number;
  /** id of the innermost declaration that contains the reference */
  enclosing: string;
  text: string;
  /** the reference's own line is added or changed by the diff */
  inDiff: boolean;
  test: boolean;
}

export interface AffectedDecl {
  id: string;
  name: string;
  file: string;
  kind: string;
  exported: boolean;
  startLine: number;
  endLine: number;
  /** head line numbers inside the declaration that the diff added or changed */
  changedLines: number[];
  status: "resolved" | "skipped-budget" | "no-name-node";
  /** shown references, non-test and outside the diff first */
  references: AffectedRef[];
  referencesTotal: number;
  referencesOutsideDiff: number;
  referenceFiles: number;
}

export interface AffectedReport {
  version: typeof AFFECTED_VERSION;
  repo: string;
  diff: string;
  head: string;
  changedFiles: { path: string; status: FileHunks["status"]; analyzed: boolean }[];
  declarations: AffectedDecl[];
  counts: { declarations: number; resolved: number; skippedBudget: number; noNameNode: number; referencesTotal: number; referencesShown: number };
  limits: { maxRefs: number; budgetMs: number };
  limitations: string[];
}

export const LIMITATIONS = [
  "TypeScript sources only (.ts, .tsx, .mts, .cts); other changed files are listed as not analyzed.",
  "References are what the TypeScript language service resolves at the head commit: dynamic access (obj[name]), string keys, reflection and code generated at build time are not found.",
  "A declaration removed by the diff has no node at head and is not listed; `tracehound changes` reports removed declarations that are still referenced.",
  "Whole-file <module> declarations are skipped: every import of the file would be a reference.",
];

export interface AffectedInput {
  /** a checkout whose working tree is the head commit of the diff */
  repo: string;
  /** "<base>..<head>" */
  diff: string;
  maxRefs?: number;
  budgetMs?: number;
  now?: () => number;
}

export class AffectedError extends Error {
  override name = "AffectedError";
}

function nameNodeOf(sf: SourceFile, decl: Decl): Node | undefined {
  const simple = decl.name.split(".").at(-1)!;
  let node: Node | undefined = sf.getDescendantAtPos(decl.start);
  while (node && !(node.getStart() === decl.start && node.getEnd() >= decl.end)) node = node.getParent();
  const root = node ?? sf;
  const direct = (root as { getNameNode?: () => Node | undefined }).getNameNode?.();
  if (direct && Node.isIdentifier(direct) && direct.getText() === simple) return direct;
  for (const d of root.getDescendants()) {
    if (d.getStart() > decl.end) break;
    if (Node.isIdentifier(d) && d.getText() === simple) return d;
  }
  return undefined;
}

export function computeAffected(input: AffectedInput): AffectedReport {
  const repo = path.resolve(input.repo);
  const maxRefs = input.maxRefs ?? DEFAULT_MAX_REFS;
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const now = input.now ?? Date.now;
  const range = /^(.+)\.\.(.+)$/.exec(input.diff);
  if (!range) throw new AffectedError(`--diff must be <base>..<head>, got "${input.diff}"`);
  const head = git(repo, ["rev-parse", range[2]!]).trim();
  const checkedOut = git(repo, ["rev-parse", "HEAD"]).trim();
  if (head !== checkedOut) throw new AffectedError(`the working tree is at ${checkedOut.slice(0, 7)}, not the diff's head ${head.slice(0, 7)}: check out the head first`);
  const hunks = parseZeroContextDiff(git(repo, ["diff", "-U0", "--no-renames", input.diff]));

  const workspace = loadWorkspace(repo);
  const rel = (abs: string) => relPath(workspace.repoRoot, abs);
  const byRel = new Map<string, SourceFile[]>();
  for (const sf of workspace.sourceFiles) byRel.set(rel(sf.getFilePath()), [...(byRel.get(rel(sf.getFilePath())) ?? []), sf]);
  const projects = [...new Set(workspace.sourceFiles.map((sf) => sf.getProject()))];
  const index = indexTree(workspace.sourceFiles, rel, []);
  const lineCache = new Map<string, string[]>();
  const linesOf = (file: string) => {
    let lines = lineCache.get(file);
    if (!lines) lineCache.set(file, (lines = readFileSync(path.join(repo, file), "utf8").split("\n")));
    return lines;
  };

  const changedFiles = [...hunks.entries()]
    .map(([file, h]) => ({ path: file, status: h.status, analyzed: h.status !== "removed" && SOURCE_EXT.test(file) && byRel.has(file) }))
    .sort((a, b) => cmp(a.path, b.path));

  const started = now();
  const declarations: AffectedDecl[] = [];
  for (const { path: file, analyzed } of changedFiles) {
    if (!analyzed) continue;
    const added = hunks.get(file)!.added;
    const sf = byRel.get(file)![0]!;
    for (const decl of index.byFile.get(file) ?? []) {
      if (decl.name === MODULE_DECL) continue;
      const changedLines = [...added].filter((l) => l >= decl.startLine && l <= decl.endLine).sort((a, b) => a - b);
      if (changedLines.length === 0) continue;
      const base = { id: decl.id, name: decl.name, file, kind: decl.kind, exported: decl.exported, startLine: decl.startLine, endLine: decl.endLine, changedLines };
      const empty = { references: [], referencesTotal: 0, referencesOutsideDiff: 0, referenceFiles: 0 };
      if (now() - started > budgetMs) {
        declarations.push({ ...base, status: "skipped-budget", ...empty });
        continue;
      }
      const nameNode = nameNodeOf(sf, decl);
      if (!nameNode) {
        declarations.push({ ...base, status: "no-name-node", ...empty });
        continue;
      }
      const refs = new Map<string, AffectedRef>();
      const collect = (node: Node) => {
        for (const ref of (node as Node & { findReferencesAsNodes(): Node[] }).findReferencesAsNodes()) {
          const refFile = rel(ref.getSourceFile().getFilePath());
          if (refFile.startsWith("..") || refFile.includes("node_modules/")) continue;
          const pos = ref.getStart();
          if (refFile === file && pos >= decl.start && pos <= decl.end) continue; // the declaration itself and recursion
          const line = ref.getStartLineNumber();
          if (/^\s*(import|export)\b.*\bfrom\b/.test(linesOf(refFile)[line - 1] ?? "")) continue; // an import line is not a use
          const key = `${refFile}:${line}`;
          if (refs.has(key)) continue;
          refs.set(key, {
            file: refFile,
            line,
            enclosing: index.enclosing(refFile, pos),
            text: (linesOf(refFile)[line - 1] ?? "").trim().slice(0, 200),
            inDiff: hunks.get(refFile)?.added.has(line) ?? false,
            test: TEST_PATH.test(refFile),
          });
        }
      };
      // One ts-morph project per package: ask each project that holds this file, so a caller in
      // another package of the same workspace is found from that package's program.
      const abs = sf.getFilePath();
      const simple = decl.name.split(".").at(-1)!;
      for (const project of projects) {
        let node: Node | undefined;
        if (project === sf.getProject()) node = nameNode;
        else if (decl.exported && project.getSourceFiles().some((f) => f.getFullText().includes(simple))) {
          const twin = project.getSourceFile(abs) ?? project.addSourceFileAtPathIfExists(abs);
          const candidate = twin?.getDescendantAtPos(nameNode.getStart());
          if (candidate && Node.isIdentifier(candidate) && candidate.getText() === simple) node = candidate;
        }
        if (node) collect(node);
      }
      const all = [...refs.values()].sort((a, b) => Number(a.inDiff) - Number(b.inDiff) || Number(a.test) - Number(b.test) || cmp(a.file, b.file) || a.line - b.line);
      declarations.push({
        ...base,
        status: "resolved",
        references: all.slice(0, maxRefs),
        referencesTotal: all.length,
        referencesOutsideDiff: all.filter((r) => !r.inDiff).length,
        referenceFiles: new Set(all.map((r) => r.file)).size,
      });
    }
  }

  const count = (s: AffectedDecl["status"]) => declarations.filter((d) => d.status === s).length;
  return {
    version: AFFECTED_VERSION,
    repo,
    diff: input.diff,
    head,
    changedFiles,
    declarations,
    counts: {
      declarations: declarations.length,
      resolved: count("resolved"),
      skippedBudget: count("skipped-budget"),
      noNameNode: count("no-name-node"),
      referencesTotal: declarations.reduce((n, d) => n + d.referencesTotal, 0),
      referencesShown: declarations.reduce((n, d) => n + d.references.length, 0),
    },
    limits: { maxRefs, budgetMs },
    limitations: LIMITATIONS,
  };
}

/** The packet a reviewer reads: one block per changed declaration, references outside the diff first. */
export function formatAffected(r: AffectedReport): string {
  const out: string[] = [];
  out.push(`AFFECTED SET (${r.version}; compiler-resolved at ${r.head.slice(0, 7)}; no model)`);
  out.push(
    `${r.counts.declarations} changed declarations: ${r.counts.resolved} resolved, ${r.counts.skippedBudget} skipped at the ${Math.round(r.limits.budgetMs / 1000)} s budget, ${r.counts.noNameNode} without a name node; ` +
      `${r.counts.referencesTotal} references, ${r.counts.referencesShown} shown (at most ${r.limits.maxRefs} per declaration).`,
  );
  const skippedFiles = r.changedFiles.filter((f) => !f.analyzed);
  if (skippedFiles.length) out.push(`Not analyzed (${skippedFiles.length}): ${skippedFiles.map((f) => `${f.path} [${f.status}]`).join(", ")}`);
  for (const d of r.declarations) {
    out.push("");
    out.push(`## ${d.id} (${d.kind}${d.exported ? ", exported" : ""}) lines ${d.startLine}-${d.endLine}; changed lines ${d.changedLines.join(",")}`);
    if (d.status !== "resolved") {
      out.push(`  references: not computed (${d.status})`);
      continue;
    }
    if (d.referencesTotal === 0) {
      out.push("  references: none found outside the declaration");
      continue;
    }
    out.push(`  ${d.referencesTotal} references in ${d.referenceFiles} files, ${d.referencesOutsideDiff} on lines the diff did not touch:`);
    for (const ref of d.references) out.push(`  - ${ref.file}:${ref.line}${ref.inDiff ? " [in diff]" : ""}${ref.test ? " [test]" : ""} in ${ref.enclosing.split("#").at(-1)}: ${ref.text}`);
    if (d.referencesTotal > d.references.length) out.push(`  - (${d.referencesTotal - d.references.length} more not shown)`);
  }
  return out.join("\n");
}
