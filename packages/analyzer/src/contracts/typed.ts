// contracts-v1, typed: the tsc diagnostics a pull request adds. Each repo tsconfig.json (and the
// configs it references) is compiled at the merge base and at head with the TypeScript that ts-morph
// bundles; nothing is installed. Diagnostics match on file, code and normalized message (a line
// shift is not a new error), so failures that are the same on both sides, such as an external
// module that isn't installed, cancel out. Either the whole comparison finishes inside the budget
// or the result is { skipped }: never a partial result labelled complete.
import { readdirSync } from "node:fs";
import path from "node:path";
import { Project, ts } from "ts-morph";
import { mapBaseLine, type Trees } from "./trees.ts";

export const TYPED_DEFAULTS = { budgetMs: 120_000, maxFiles: 5_000 };

/** Where a change sits: a head line, or a base line the diff removed. */
export interface ChangeSite {
  path: string;
  line: number;
  side: "base" | "head";
  text: string; // the exact line text
  how: string; // how the site was found
}

export interface TypedDiagnostic {
  path: string; // head path
  line: number;
  column: number;
  code: number;
  message: string; // first line of the message chain, repo paths made relative
  text: string; // the exact head line text
  tsconfig: string; // repo-relative config that reported it
  /** Unedited files only: the edited code the diagnostic points back to. */
  cause?: ChangeSite;
}

export type TypedResult =
  | {
      complete: true;
      tsconfigs: { base: string[]; head: string[] };
      files: { base: number; head: number }; // root files checked per side
      diagnostics: { base: number; head: number; new: number };
      editedFiles: TypedDiagnostic[];
      uneditedFiles: TypedDiagnostic[];
      ms: number;
    }
  | { skipped: "budget" | "no-tsconfig" | "error"; reason: string; ms: number };

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage"]);

/** Every tsconfig.json under root (outside dependency and output folders), plus the configs they reference. */
export function findTsconfigs(root: string): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory() && !IGNORED_DIRS.has(e.name)) walk(abs);
      else if (e.isFile() && e.name === "tsconfig.json") found.add(abs);
    }
  };
  walk(root);
  const queue = [...found];
  while (queue.length) {
    const file = queue.shift()!;
    const config = ts.readConfigFile(file, ts.sys.readFile).config as { references?: { path?: string }[] } | undefined;
    for (const ref of config?.references ?? []) {
      if (typeof ref.path !== "string") continue;
      let target = path.resolve(path.dirname(file), ref.path);
      if (!target.endsWith(".json")) target = path.join(target, "tsconfig.json");
      if (!found.has(target) && ts.sys.fileExists(target) && !path.relative(root, target).startsWith("..")) {
        found.add(target);
        queue.push(target);
      }
    }
  }
  return [...found].sort();
}

interface RawDiagnostic {
  path: string; // repo-relative at this side
  line: number;
  column: number;
  code: number;
  key: string; // normalized message (full chain)
  message: string;
  tsconfig: string;
  diagnostic: ts.Diagnostic;
  program?: ts.Program;
}

interface Side {
  tsconfigs: string[];
  files: number;
  diagnostics: RawDiagnostic[];
}

class BudgetExceeded extends Error {}

const insideRepo = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return !rel.startsWith("..") && !path.isAbsolute(rel) && !rel.split(path.sep).includes("node_modules");
};
const toRel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

// Type checking only: no emit, and no project references, so an import of a referenced project
// resolves to its source instead of a build output that doesn't exist in a fresh worktree.
const CHECK_ONLY: ts.CompilerOptions = { noEmit: true, composite: false, incremental: false, emitDeclarationOnly: undefined, tsBuildInfoFile: undefined, outDir: undefined, declarationDir: undefined, outFile: undefined };

function parseConfig(file: string) {
  const read = ts.readConfigFile(file, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, ts.sys, path.dirname(file), undefined, file);
  return { rootNames: parsed.fileNames, errors: [...(read.error ? [read.error] : []), ...parsed.errors] };
}

function normalize(root: string, text: string): string {
  let out = text;
  for (const prefix of new Set([root, ts.sys.realpath?.(root) ?? root])) out = out.split(prefix + "/").join("").split(prefix).join("");
  return out.replace(/\s+/g, " ").trim();
}

function checkSide(root: string, configs: string[], deadline: number, keepPrograms: boolean): Side {
  const tick = () => {
    if (performance.now() > deadline) throw new BudgetExceeded();
  };
  const parsed = configs.map((file) => ({ file, ...parseConfig(file) }));
  // each root file is checked once, by its nearest config (the one an editor would use)
  const owner = new Map<string, string>();
  for (const p of parsed) {
    for (const f of p.rootNames) {
      const current = owner.get(f);
      if (!current || path.dirname(p.file).length > path.dirname(current).length) owner.set(f, p.file);
    }
  }
  const diagnostics: RawDiagnostic[] = [];
  const checked = new Set<string>();
  const push = (d: ts.Diagnostic, tsconfig: string, program?: ts.Program) => {
    const file = d.file?.fileName ?? tsconfig;
    if (!insideRepo(root, file)) return;
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
    const flat = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    diagnostics.push({
      path: toRel(root, file),
      line: pos.line + 1,
      column: pos.character + 1,
      code: d.code,
      key: normalize(root, flat),
      message: normalize(root, flat.split("\n")[0]!),
      tsconfig: toRel(root, tsconfig),
      diagnostic: d,
      ...(keepPrograms && program && { program }),
    });
  };
  for (const p of parsed) {
    tick();
    for (const e of p.errors) push(e, p.file);
    const owned = p.rootNames.filter((f) => owner.get(f) === p.file);
    // a ts-morph project serves the TypeScript lib files it bundles; the repo's files come from disk
    const program = new Project({ tsConfigFilePath: p.file, compilerOptions: CHECK_ONLY }).getProgram().compilerObject;
    for (const d of [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()]) push(d, p.file, program);
    const ownedSet = new Set(owned);
    for (const sf of program.getSourceFiles()) {
      // a root file belongs to its nearest config; a file pulled in by an import, to the first program that sees it
      if (!insideRepo(root, sf.fileName) || checked.has(sf.fileName)) continue;
      if (owner.has(sf.fileName) && !ownedSet.has(sf.fileName)) continue;
      tick();
      checked.add(sf.fileName);
      for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) push(d, p.file, program);
    }
  }
  return { tsconfigs: configs.map((c) => toRel(root, c)), files: owner.size, diagnostics };
}

export interface TypedOptions {
  budgetMs?: number;
  maxFiles?: number;
}

export function computeTyped(trees: Trees, opts: TypedOptions = {}): TypedResult {
  const started = performance.now();
  const budgetMs = opts.budgetMs ?? TYPED_DEFAULTS.budgetMs;
  const maxFiles = opts.maxFiles ?? TYPED_DEFAULTS.maxFiles;
  const deadline = started + budgetMs;
  const ms = () => Math.round(performance.now() - started);
  const baseConfigs = findTsconfigs(trees.base);
  const headConfigs = findTsconfigs(trees.head);
  if (!baseConfigs.length && !headConfigs.length) return { skipped: "no-tsconfig", reason: "no tsconfig.json at base or head", ms: ms() };
  // the file cap is checked before any program is built
  for (const [side, configs] of [["base", baseConfigs], ["head", headConfigs]] as const) {
    const roots = new Set(configs.flatMap((c) => parseConfig(c).rootNames));
    if (roots.size > maxFiles) return { skipped: "budget", reason: `${roots.size} root files at ${side} exceed the file cap of ${maxFiles}`, ms: ms() };
  }
  let base: Side;
  let head: Side;
  try {
    base = checkSide(trees.base, baseConfigs, deadline, false);
    head = checkSide(trees.head, headConfigs, deadline, true);
  } catch (error) {
    if (error instanceof BudgetExceeded) return { skipped: "budget", reason: `wall-clock limit of ${Math.round(budgetMs / 1000)} s exceeded`, ms: ms() };
    return { skipped: "error", reason: (error as Error).message, ms: ms() };
  }
  const fresh = newDiagnostics(trees, base.diagnostics, head.diagnostics);
  const editedFiles: TypedDiagnostic[] = [];
  const uneditedFiles: TypedDiagnostic[] = [];
  for (const d of fresh) {
    const out: TypedDiagnostic = { path: d.path, line: d.line, column: d.column, code: d.code, message: d.message, text: trees.lineText("head", d.path, d.line), tsconfig: d.tsconfig };
    if (trees.edited.has(d.path)) editedFiles.push(out);
    else uneditedFiles.push({ ...out, cause: causeOf(trees, d) });
  }
  if (performance.now() > deadline) return { skipped: "budget", reason: `wall-clock limit of ${Math.round(budgetMs / 1000)} s exceeded`, ms: ms() };
  const order = (a: TypedDiagnostic, b: TypedDiagnostic) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column || a.code - b.code;
  return {
    complete: true,
    tsconfigs: { base: base.tsconfigs, head: head.tsconfigs },
    files: { base: base.files, head: head.files },
    diagnostics: { base: base.diagnostics.length, head: head.diagnostics.length, new: fresh.length },
    editedFiles: editedFiles.sort(order),
    uneditedFiles: uneditedFiles.sort(order),
    ms: ms(),
  };
}

/**
 * Head diagnostics with no base counterpart. Two passes over (file, code, normalized message):
 * first at the base line shifted through the diff, then at any line, so a moved line still matches.
 * A renamed file is compared under its head path.
 */
export function newDiagnostics<T extends { path: string; line: number; code: number; key: string }>(trees: Pick<Trees, "renames" | "files">, base: T[], head: T[]): T[] {
  const key = (d: { path: string; code: number; key: string }) => `${d.path}\u0000${d.code}\u0000${d.key}`;
  const pool = new Map<string, number[]>(); // key → mapped base lines still unmatched (NaN when the line was edited)
  const seenBase = new Set<string>();
  for (const d of base) {
    const headPath = trees.renames.get(d.path) ?? d.path;
    const exact = `${key({ ...d, path: headPath })}\u0000${d.line}`;
    if (seenBase.has(exact)) continue; // the same diagnostic reported by two configs
    seenBase.add(exact);
    const mapped = trees.renames.has(d.path) ? Number.NaN : (mapBaseLine(trees.files.get(d.path), d.line) ?? Number.NaN);
    const k = key({ ...d, path: headPath });
    pool.set(k, [...(pool.get(k) ?? []), mapped]);
  }
  const seenHead = new Set<string>();
  const unique = head.filter((d) => {
    const exact = `${key(d)}\u0000${d.line}`;
    if (seenHead.has(exact)) return false;
    seenHead.add(exact);
    return true;
  });
  const unmatched: T[] = [];
  for (const d of unique) {
    const lines = pool.get(key(d));
    const i = lines?.indexOf(d.line) ?? -1;
    if (i >= 0) lines!.splice(i, 1);
    else unmatched.push(d);
  }
  return unmatched.filter((d) => {
    const lines = pool.get(key(d));
    if (!lines?.length) return true;
    lines.shift();
    return false;
  });
}

// ── cause: the edited code an unedited file's new diagnostic points back to ───────────────────
function nodeAt(sf: ts.SourceFile, pos: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (pos >= n.getStart(sf) && pos < n.getEnd()) {
      found = n;
      ts.forEachChild(n, visit);
    }
  };
  ts.forEachChild(sf, visit);
  return found;
}

function causeOf(trees: Trees, d: RawDiagnostic): ChangeSite | undefined {
  const head = (file: string, line: number, how: string): ChangeSite => ({ path: file, line, side: "head", text: trees.lineText("head", file, line), how });
  const program = d.program;
  const sf = d.diagnostic.file;
  // 1. related information that points into an edited file
  for (const r of d.diagnostic.relatedInformation ?? []) {
    if (!r.file || r.start === undefined || !insideRepo(trees.head, r.file.fileName)) continue;
    const rel = toRel(trees.head, r.file.fileName);
    if (trees.edited.has(rel)) return head(rel, r.file.getLineAndCharacterOfPosition(r.start).line + 1, "related information");
  }
  const node = sf && d.diagnostic.start !== undefined ? nodeAt(sf, d.diagnostic.start) : undefined;
  const imports = new Set<string>();
  if (program && sf) {
    const checker = program.getTypeChecker();
    // 2. the symbol at the diagnostic, declared in an edited file
    if (node) {
      let symbol = checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        try {
          symbol = checker.getAliasedSymbol(symbol);
        } catch {}
      }
      for (const decl of symbol?.declarations ?? []) {
        const file = decl.getSourceFile();
        if (!insideRepo(trees.head, file.fileName)) continue;
        const rel = toRel(trees.head, file.fileName);
        if (trees.edited.has(rel)) return head(rel, file.getLineAndCharacterOfPosition(decl.getStart(file)).line + 1, "declaration of the symbol at the diagnostic");
      }
    }
    for (const stmt of sf.statements) {
      const spec = (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier ? stmt.moduleSpecifier : undefined;
      const target = spec ? checker.getSymbolAtLocation(spec)?.valueDeclaration : undefined;
      if (target && ts.isSourceFile(target) && insideRepo(trees.head, target.fileName)) imports.add(toRel(trees.head, target.fileName));
    }
  }
  // 3. a removed line in an edited file that names the word at the diagnostic (a removed export, field or module)
  const word = node && (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) ? node.text : node && ts.isStringLiteral(node) ? node.text : undefined;
  const ranked = [...trees.files.values()].sort((a, b) => Number(imports.has(b.path)) - Number(imports.has(a.path)) || a.path.localeCompare(b.path));
  if (word) {
    const stem = word.replace(/^(\.\.?\/)+/, "").replace(/\.[cm]?[jt]sx?$/, "");
    for (const f of ranked) {
      if (f.status === "deleted" && stem && f.path.replace(/\.[cm]?[jt]sx?$/, "").endsWith(stem)) return { path: f.path, line: 1, side: "base", text: trees.lineText("base", f.path, 1), how: "deleted file named by the diagnostic" };
    }
    const re = new RegExp(`(^|[^\\w$])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w$]|$)`);
    for (const f of ranked) {
      for (const h of f.hunks) {
        const i = h.removed.findIndex((t) => re.test(t));
        if (i >= 0) return { path: f.path, line: h.oldStart + i, side: "base", text: h.removed[i]!, how: `removed line naming ${word}` };
      }
    }
  }
  // 4. the first change in an edited file this file imports, else the first change in the diff
  for (const f of ranked) {
    const h = f.hunks[0];
    if (!h) continue;
    const how = imports.has(f.path) ? "first change in an imported edited file" : "first change in the diff";
    return h.added.length ? head(f.path, h.newStart, how) : { path: f.path, line: h.oldStart, side: "base", text: h.removed[0] ?? "", how };
  }
  return undefined;
}
