// Affected set of a diff (side track C; not part of the frozen reviewer, decision 076g).
// Deterministic, no model: for every declaration whose lines a diff touches, the compiler-resolved
// references to it elsewhere in the repository at the head commit, each with file, line, enclosing
// declaration and the line's text. A reviewer reads this to see what a change can break outside
// the files it edits. Nothing is dropped silently: references over the per-declaration limit,
// names too common to resolve and declarations not reached inside the time budget are counted.
//
// Cost (affected@0.3): loading every file of a large monorepo took 88 s and 7 GB on one dev case
// and ran out of memory on another. A reference to a name has to contain that name, so the
// programs here hold only the changed files, the files `git grep -w` finds a changed name in, and
// the files with `export *` (re-export chains); every other import is left unresolved.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Node, Project, ts, type SourceFile } from "ts-morph";
import { indexTree, type Decl } from "../changes/declarations.ts";
import { ChangesError, git, parseZeroContextDiff, type FileHunks } from "../changes/git.ts";
import { discoverPackages, packageOf, relPath, type PackageInfo } from "../load/workspace.ts";

export const AFFECTED_VERSION = "affected@0.3";
export const DEFAULT_MAX_REFS = 12;
export const DEFAULT_BUDGET_MS = 120_000;
/** A changed name found in more files than this is not resolved: its candidate count is reported. */
export const DEFAULT_MAX_CANDIDATE_FILES = 300;

const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;
const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.mts", "*.cts"];
const TEST_PATH = /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.[cm]?tsx?$/;
const MODULE_DECL = "<module>";
/** Code-unit order: the same on every machine, whatever its locale. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Used when a package has no tsconfig, or its tsconfig cannot be read without an install.
const FALLBACK_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  allowJs: false,
  skipLibCheck: true,
};

export interface AffectedRef {
  file: string;
  line: number;
  /** "<file>#<name>" of the innermost named declaration that contains the reference */
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
  status: "resolved" | "skipped-budget" | "skipped-common" | "no-name-node" | "compiler-error";
  /** files (other than its own) in which `git grep -w` finds the declaration's name */
  candidateFiles: number;
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
  counts: {
    declarations: number;
    resolved: number;
    skippedBudget: number;
    skippedCommon: number;
    noNameNode: number;
    compilerError: number;
    referencesTotal: number;
    referencesShown: number;
    /** files loaded into the compiler: changed, candidate and `export *` files */
    filesLoaded: number;
  };
  /** workspace package names mapped to their source directories, so imports by package name resolve without an install */
  workspaceAliases: number;
  limits: { maxRefs: number; budgetMs: number; maxCandidateFiles: number };
  limitations: string[];
}

export const LIMITATIONS = [
  "TypeScript sources only (.ts, .tsx, .mts, .cts); other changed files are listed as not analyzed.",
  "References are what the TypeScript language service resolves at the head commit: dynamic access (obj[name]), string keys, reflection and code generated at build time are not found.",
  "Only files that contain a changed name as a word are searched, so a use under another name is missed: a default export imported under a different name, or `export { a as b }` used as `b`.",
  "A declaration removed by the diff has no node at head and is not listed; `tracehound changes` reports removed declarations that are still referenced.",
  "Whole-file <module> declarations are skipped: every import of the file would be a reference.",
  "Dependencies are not installed: an import of a workspace package by name is resolved to that package's source directory (src/index.ts, src/index.tsx or index.ts); a package that exposes other entry points, and anything reached only through node_modules, is not followed.",
];

export interface AffectedInput {
  /** a checkout whose working tree is the head commit of the diff */
  repo: string;
  /** "<base>..<head>" */
  diff: string;
  maxRefs?: number;
  budgetMs?: number;
  maxCandidateFiles?: number;
  now?: () => number;
}

export class AffectedError extends Error {
  override name = "AffectedError";
}

const simpleName = (decl: Decl) => decl.name.split(".").at(-1)!;

function nameNodeOf(sf: SourceFile, decl: Decl): Node | undefined {
  const simple = simpleName(decl);
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

/** The innermost named function, method, class or variable around a node, or <module>. */
function enclosingName(node: Node): string {
  for (let n: Node | undefined = node.getParent(); n; n = n.getParent()) {
    if (Node.isFunctionDeclaration(n) || Node.isMethodDeclaration(n) || Node.isClassDeclaration(n) || Node.isVariableDeclaration(n) || Node.isPropertyDeclaration(n) || Node.isInterfaceDeclaration(n) || Node.isTypeAliasDeclaration(n)) {
      const name = (n as { getName?: () => string | undefined }).getName?.();
      if (name) return name;
    }
  }
  return MODULE_DECL;
}

/** `git grep` over the tracked TypeScript files of the working tree; no match is not an error. */
function grep(repo: string, args: string[], input?: string): string {
  try {
    return git(repo, ["grep", "-I", ...args, "--", ...SOURCE_GLOBS], input);
  } catch (error) {
    if (error instanceof ChangesError && !/:\s*\S/.test(error.message.split(" failed in ")[1] ?? "")) return ""; // exit 1, empty stderr: no match
    throw error;
  }
}

export function computeAffected(input: AffectedInput): AffectedReport {
  const repo = path.resolve(input.repo);
  const maxRefs = input.maxRefs ?? DEFAULT_MAX_REFS;
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxCandidateFiles = input.maxCandidateFiles ?? DEFAULT_MAX_CANDIDATE_FILES;
  const now = input.now ?? Date.now;
  const range = /^(.+)\.\.(.+)$/.exec(input.diff);
  if (!range) throw new AffectedError(`--diff must be <base>..<head>, got "${input.diff}"`);
  const head = git(repo, ["rev-parse", range[2]!]).trim();
  const checkedOut = git(repo, ["rev-parse", "HEAD"]).trim();
  if (head !== checkedOut) throw new AffectedError(`the working tree is at ${checkedOut.slice(0, 7)}, not the diff's head ${head.slice(0, 7)}: check out the head first`);
  const hunks = parseZeroContextDiff(git(repo, ["diff", "-U0", "--no-renames", input.diff]));
  const started = now();

  const rel = (abs: string) => relPath(repo, abs);
  const abs = (file: string) => path.join(repo, file);
  const changedFiles = [...hunks.entries()]
    .map(([file, h]) => ({ path: file, status: h.status, analyzed: h.status !== "removed" && SOURCE_EXT.test(file) && existsSync(abs(file)) }))
    .sort((a, b) => cmp(a.path, b.path));
  const analyzed = changedFiles.filter((f) => f.analyzed).map((f) => f.path);

  // 1. The changed declarations, from the changed files alone (no import is followed here).
  const allow = new Set<string>(analyzed.map(abs));
  const prune = (host: ts.ModuleResolutionHost, getOptions: () => ts.CompilerOptions) => ({
    resolveModuleNames: (names: string[], containingFile: string) =>
      names.map((name) => {
        const resolved = ts.resolveModuleName(name, containingFile, getOptions(), host).resolvedModule;
        return resolved && allow.has(path.normalize(resolved.resolvedFileName)) ? resolved : undefined;
      }),
  });
  const scan = new Project({ compilerOptions: FALLBACK_OPTIONS, resolutionHost: () => ({ resolveModuleNames: (names: string[]) => names.map(() => undefined) }) });
  const scanIndex = indexTree(analyzed.map((file) => scan.addSourceFileAtPath(abs(file))), rel, []);
  const changed: { decl: Decl; changedLines: number[] }[] = [];
  for (const file of analyzed) {
    const added = hunks.get(file)!.added;
    for (const decl of scanIndex.byFile.get(file) ?? []) {
      if (decl.name === MODULE_DECL) continue;
      const changedLines = [...added].filter((l) => l >= decl.startLine && l <= decl.endLine).sort((a, b) => a - b);
      if (changedLines.length) changed.push({ decl, changedLines });
    }
  }

  // 2. Candidate files per name: one pass of `git grep -o -w` over the tracked sources.
  const names = [...new Set(changed.map((c) => simpleName(c.decl)))].filter((n) => n.length >= 3).sort(cmp);
  const candidates = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  if (names.length) {
    for (const line of grep(repo, ["-o", "-w", "-F", "-f", "-"], names.join("\n") + "\n").split("\n")) {
      const at = line.lastIndexOf(":");
      if (at > 0) candidates.get(line.slice(at + 1))?.add(line.slice(0, at));
    }
  }
  const resolvable = (name: string, ownFile: string) => {
    const files = candidates.get(name);
    if (!files) return { count: 0, ok: false };
    const count = files.size - (files.has(ownFile) ? 1 : 0);
    return { count, ok: count <= maxCandidateFiles };
  };
  for (const { decl } of changed) if (resolvable(simpleName(decl), decl.file).ok) for (const f of candidates.get(simpleName(decl))!) allow.add(abs(f));
  const nameFiles = allow.size;
  if (nameFiles > analyzed.length) for (const f of grep(repo, ["-l", "-E", "export \\*"]).split("\n")) if (f) allow.add(abs(f));

  // 3. One project per package (its own compiler options), holding only that package's allowed files.
  const packages: PackageInfo[] = discoverPackages(repo);
  if (packages.length === 0) packages.push({ root: ".", name: path.basename(repo), entryFiles: [] });
  // No install is assumed. Map each workspace package's name to its source, so `import … from "<package>"`
  // in another package resolves to the file that declares the symbol; a project's own `paths` win.
  const aliases: Record<string, string[]> = {};
  for (const pkg of packages) {
    if (pkg.root === "." || !pkg.name) continue;
    const root = path.join(repo, pkg.root);
    const entry = ["src/index.ts", "src/index.tsx", "index.ts"].map((e) => path.join(root, e)).find((e) => existsSync(e));
    if (entry) aliases[pkg.name] = [entry];
    aliases[`${pkg.name}/*`] = [path.join(root, "src/*"), path.join(root, "*")];
  }
  const byPackage = new Map<string, string[]>();
  for (const file of allow) {
    const pkg = packageOf(packages, rel(file));
    byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), file]);
  }
  const projects = new Map<string, Project>();
  const projectOf = (pkgRoot: string): Project | undefined => {
    if (projects.has(pkgRoot)) return projects.get(pkgRoot);
    const pkg = packages.find((p) => p.root === pkgRoot);
    let project: Project;
    try {
      project = pkg?.tsconfig
        ? new Project({ tsConfigFilePath: path.join(repo, pkg.tsconfig), skipAddingFilesFromTsConfig: true, resolutionHost: prune })
        : new Project({ compilerOptions: FALLBACK_OPTIONS, resolutionHost: prune });
    } catch {
      project = new Project({ compilerOptions: FALLBACK_OPTIONS, resolutionHost: prune }); // a tsconfig that extends a package not installed
    }
    // allowImportingTsExtensions: without it the checker asserts on a `.ts` import in some configurations
    project.compilerOptions.set({ allowImportingTsExtensions: true, noEmit: true, paths: { ...aliases, ...(project.compilerOptions.get().paths ?? {}) } });
    for (const file of (byPackage.get(pkgRoot) ?? []).sort(cmp)) project.addSourceFileAtPathIfExists(file);
    projects.set(pkgRoot, project);
    return project;
  };

  const lineCache = new Map<string, string[]>();
  const linesOf = (file: string) => {
    let lines = lineCache.get(file);
    if (!lines) lineCache.set(file, (lines = readFileSync(abs(file), "utf8").split("\n")));
    return lines;
  };

  // 4. References, declaration by declaration, inside the time budget.
  const declarations: AffectedDecl[] = [];
  for (const { decl, changedLines } of changed) {
    const simple = simpleName(decl);
    const { count: candidateFiles, ok } = resolvable(simple, decl.file);
    const base = { id: decl.id, name: decl.name, file: decl.file, kind: decl.kind, exported: decl.exported, startLine: decl.startLine, endLine: decl.endLine, changedLines, candidateFiles };
    const empty = { references: [], referencesTotal: 0, referencesOutsideDiff: 0, referenceFiles: 0 };
    if (!ok) {
      declarations.push({ ...base, status: "skipped-common", ...empty });
      continue;
    }
    if (now() - started > budgetMs) {
      declarations.push({ ...base, status: "skipped-budget", ...empty });
      continue;
    }
    const refs = new Map<string, AffectedRef>();
    let failed = false;
    let named = false;
    const ownPackage = packageOf(packages, decl.file);
    const packagesToAsk = [ownPackage, ...[...new Set([...candidates.get(simple)!].map((f) => packageOf(packages, f)))].filter((p) => p !== ownPackage).sort(cmp)];
    for (const pkgRoot of packagesToAsk) {
      if (pkgRoot !== ownPackage && !decl.exported) continue;
      try {
        const project = projectOf(pkgRoot)!;
        const sf = project.getSourceFile(abs(decl.file)) ?? project.addSourceFileAtPathIfExists(abs(decl.file));
        const nameNode = sf && nameNodeOf(sf, decl);
        if (!nameNode) continue;
        named = true;
        for (const ref of (nameNode as Node & { findReferencesAsNodes(): Node[] }).findReferencesAsNodes()) {
          const refFile = rel(ref.getSourceFile().getFilePath());
          if (refFile.startsWith("..") || refFile.includes("node_modules/")) continue;
          const pos = ref.getStart();
          if (refFile === decl.file && pos >= decl.start && pos <= decl.end) continue; // the declaration itself and recursion
          const line = ref.getStartLineNumber();
          if (/^\s*(import|export)\b.*\bfrom\b/.test(linesOf(refFile)[line - 1] ?? "")) continue; // an import line is not a use
          const key = `${refFile}:${line}`;
          if (refs.has(key)) continue;
          refs.set(key, {
            file: refFile,
            line,
            enclosing: `${refFile}#${enclosingName(ref)}`,
            text: (linesOf(refFile)[line - 1] ?? "").trim().slice(0, 200),
            inDiff: hunks.get(refFile)?.added.has(line) ?? false,
            test: TEST_PATH.test(refFile),
          });
        }
      } catch {
        failed = true; // a compiler assertion on this program: counted, the other packages still answer
      }
    }
    if (refs.size === 0 && (failed || !named)) {
      declarations.push({ ...base, status: failed ? "compiler-error" : "no-name-node", ...empty });
      continue;
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
      skippedCommon: count("skipped-common"),
      noNameNode: count("no-name-node"),
      compilerError: count("compiler-error"),
      referencesTotal: declarations.reduce((n, d) => n + d.referencesTotal, 0),
      referencesShown: declarations.reduce((n, d) => n + d.references.length, 0),
      filesLoaded: allow.size,
    },
    workspaceAliases: Object.keys(aliases).filter((k) => !k.endsWith("/*")).length,
    limits: { maxRefs, budgetMs, maxCandidateFiles },
    limitations: LIMITATIONS,
  };
}

/** The packet a reviewer reads: one block per changed declaration, references outside the diff first. */
export function formatAffected(r: AffectedReport): string {
  const out: string[] = [];
  const c = r.counts;
  out.push(`AFFECTED SET (${r.version}; compiler-resolved at ${r.head.slice(0, 7)}; no model)`);
  out.push(
    `${c.declarations} changed declarations: ${c.resolved} resolved, ${c.skippedCommon} with a name in more than ${r.limits.maxCandidateFiles} files, ${c.skippedBudget} skipped at the ${Math.round(r.limits.budgetMs / 1000)} s budget, ` +
      `${c.noNameNode} without a name node, ${c.compilerError} with a compiler error; ${c.referencesTotal} references, ${c.referencesShown} shown (at most ${r.limits.maxRefs} per declaration).`,
  );
  const skippedFiles = r.changedFiles.filter((f) => !f.analyzed);
  if (skippedFiles.length) out.push(`Not analyzed (${skippedFiles.length}): ${skippedFiles.map((f) => `${f.path} [${f.status}]`).join(", ")}`);
  for (const d of r.declarations) {
    out.push("");
    out.push(`## ${d.id} (${d.kind}${d.exported ? ", exported" : ""}) lines ${d.startLine}-${d.endLine}; changed lines ${d.changedLines.join(",")}`);
    if (d.status === "skipped-common") {
      out.push(`  references: not computed, the name appears in ${d.candidateFiles} other files (search for the uses that matter)`);
      continue;
    }
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
