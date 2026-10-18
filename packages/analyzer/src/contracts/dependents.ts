// contracts-v1, dependents: the exported declarations a pull request changes or removes, their
// signature at base and at head, and their use sites in files it didn't edit. Data for a later
// specialist: this stage makes no findings. TypeScript declarations come from changes/ (decision
// 038) and use sites are confirmed through symbols; other languages use a definition-line regex and
// `git grep -w` of the name, unconfirmed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { indexTree, type Decl } from "../changes/declarations.ts";
import { gitGrep, TreeProjects, TS_SOURCE } from "./projects.ts";
import { NOT_CODE, TEST_FILE } from "./shapes.ts";
import type { Trees } from "./trees.ts";

export const DEPENDENTS_LIMITS = { sitesPerDeclaration: 50, declarations: 200, signatureChars: 300 };

export interface Dependent {
  path: string;
  line: number;
  text: string;
  /** symbol: the identifier resolves to the declaration · import: it is imported from the declaration's file (the export is gone) · name: a whole-word match, not confirmed */
  resolution: "symbol" | "import" | "name";
}

export interface ChangedDeclaration {
  id: string; // "<file>#<qualified name>"
  name: string;
  file: string;
  kind: string;
  language: "ts" | "python" | "go" | "js" | "rust" | "ruby";
  status: "modified" | "removed";
  modifications: string[]; // TS: which parts changed (signature, returnType, body, typeAnnotation, shape); other languages: ["signature"]
  signature: { base: string; head?: string };
  dependents: Dependent[];
  truncated?: number; // sites past the per-declaration cap
  rejected: number; // whole-word matches in TS files that resolve to a different declaration
}

export interface DependentsResult {
  declarations: ChangedDeclaration[];
  counts: { declarations: number; dependents: number; notSearched: number };
  ms: number;
}

const PARTS = ["signature", "returnType", "body", "typeAnnotation", "shape"] as const;
const squash = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > DEPENDENTS_LIMITS.signatureChars ? t.slice(0, DEPENDENTS_LIMITS.signatureChars - 1) + "…" : t;
};

/** A declaration's signature as written: its text up to the body (a class: its header). */
function signatureOf(d: Decl, sf: SourceFile): string {
  const text = sf.getFullText().slice(d.start, d.end);
  if (d.kind === "class") return squash(text.slice(0, Math.max(0, text.indexOf("{")) || text.length));
  const body = d.parts.body;
  if (body && (d.kind === "function" || d.kind === "method" || d.kind === "react-component" || d.kind === "route-handler")) {
    const at = text.lastIndexOf(body);
    if (at > 0) return squash(text.slice(0, at));
  }
  return squash(text);
}

/** Members of an exported class are part of its exported surface. */
const isExported = (d: Decl, decls: Map<string, Decl>) => d.exported || (d.name.includes(".") && !!decls.get(`${d.file}#${d.name.split(".")[0]}`)?.exported);

// definition lines in other languages: [language, file pattern, regex with the name in group 1, exported?]
const DEFINITIONS: [ChangedDeclaration["language"], RegExp, RegExp, (name: string) => boolean][] = [
  ["python", /\.py$/, /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(|^\s*class\s+([A-Za-z_]\w*)/, (n) => !n.startsWith("_")],
  ["go", /\.go$/, /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[[(]|^type\s+([A-Za-z_]\w*)\s/, (n) => /^[A-Z]/.test(n)],
  ["js", /\.(?:js|jsx|mjs|cjs)$/, /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/, () => true],
  ["rust", /\.rs$/, /^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_]\w*)/, () => true],
  ["ruby", /\.rb$/, /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/, (n) => !n.startsWith("_")],
];
const defName = (re: RegExp, line: string) => {
  const m = re.exec(line);
  return m ? (m[1] ?? m[2]) : undefined;
};

export function computeDependents(trees: Trees, opts: { baseProjects?: TreeProjects; headProjects?: TreeProjects } = {}): DependentsResult {
  const started = performance.now();
  const baseProjects = opts.baseProjects ?? new TreeProjects(trees.base);
  const headProjects = opts.headProjects ?? new TreeProjects(trees.head);
  const edited = [...trees.files.values()].filter((f) => !f.binary && !NOT_CODE.test(f.path) && !TEST_FILE.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const changed: Omit<ChangedDeclaration, "dependents" | "rejected">[] = [];

  // TypeScript: changes/ declarations of the edited files at both sides
  const tsFiles = edited.filter((f) => TS_SOURCE.test(f.path));
  const baseSfs = tsFiles.flatMap((f) => baseProjects.sourceFile(f.path) ?? []);
  const headSfs = tsFiles.flatMap((f) => headProjects.sourceFile(f.path) ?? []);
  const base = indexTree(baseSfs, baseProjects.rel, []);
  const head = indexTree(headSfs, headProjects.rel, []);
  const sfOf = (sfs: SourceFile[], projects: TreeProjects, file: string) => sfs.find((sf) => projects.rel(sf.getFilePath()) === file)!;
  for (const [id, b] of base.decls) {
    if (b.kind === "module" || !isExported(b, base.decls)) continue;
    const h = head.decls.get(id);
    const modifications = h ? PARTS.filter((p) => b.norm[p] !== h.norm[p]) : [];
    if (h && !modifications.length && b.kind === h.kind) continue;
    changed.push({
      id,
      name: b.name.split(".").at(-1)!,
      file: b.file,
      kind: b.kind,
      language: "ts",
      status: h ? "modified" : "removed",
      modifications: h && !modifications.length ? ["signature"] : modifications,
      signature: { base: signatureOf(b, sfOf(baseSfs, baseProjects, b.file)), ...(h && { head: signatureOf(h, sfOf(headSfs, headProjects, h.file)) }) },
    });
  }

  // other languages: definition lines the diff removed or changed
  for (const f of edited) {
    const def = DEFINITIONS.find(([, file]) => file.test(f.path));
    if (!def) continue;
    const [language, , re, exported] = def;
    const headDefs = new Map<string, string>();
    const headLines = f.status === "deleted" ? [] : readHead(trees, f.path);
    headLines.forEach((l) => {
      const n = defName(re, l);
      if (n && !headDefs.has(n)) headDefs.set(n, l);
    });
    for (const h of f.hunks) {
      h.removed.forEach((line) => {
        const name = defName(re, line);
        if (!name || !exported(name) || changed.some((c) => c.file === f.path && c.name === name)) return;
        const now = headDefs.get(name);
        if (now !== undefined && squash(now) === squash(line)) return; // the same definition line, moved
        changed.push({ id: `${f.path}#${name}`, name, file: f.path, kind: "definition", language, status: now === undefined ? "removed" : "modified", modifications: ["signature"], signature: { base: squash(line), ...(now !== undefined && { head: squash(now) }) } });
      });
    }
  }

  // use sites at head in unedited files
  const declarations: ChangedDeclaration[] = [];
  let notSearched = 0;
  for (const c of changed.sort((a, b) => a.id.localeCompare(b.id))) {
    if (declarations.length >= DEPENDENTS_LIMITS.declarations) {
      notSearched++;
      continue;
    }
    let rejected = 0;
    const sites: Dependent[] = [];
    for (const hit of gitGrep(trees.repo, trees.headSha, c.name, true)) {
      if (trees.edited.has(hit.path) || NOT_CODE.test(hit.path)) continue;
      if (c.language === "ts" && TS_SOURCE.test(hit.path)) {
        const resolution = confirm(headProjects, hit.path, hit.line, c);
        if (!resolution) {
          rejected++;
          continue;
        }
        sites.push({ ...hit, resolution });
      } else sites.push({ ...hit, resolution: "name" });
    }
    declarations.push({
      ...c,
      dependents: sites.slice(0, DEPENDENTS_LIMITS.sitesPerDeclaration),
      ...(sites.length > DEPENDENTS_LIMITS.sitesPerDeclaration && { truncated: sites.length - DEPENDENTS_LIMITS.sitesPerDeclaration }),
      rejected,
    });
  }
  return {
    declarations,
    counts: { declarations: declarations.length, dependents: declarations.reduce((n, d) => n + d.dependents.length, 0), notSearched },
    ms: Math.round(performance.now() - started),
  };
}

function readHead(trees: Trees, file: string): string[] {
  try {
    return readFileSync(path.join(trees.head, file), "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
}

/** Does an identifier on this line resolve to the changed declaration (or import it from its file, once removed)? */
function confirm(projects: TreeProjects, file: string, line: number, c: Pick<ChangedDeclaration, "name" | "file">): Dependent["resolution"] | undefined {
  const sf = projects.sourceFile(file);
  if (!sf) return undefined;
  for (const ident of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (ident.getText() !== c.name || ident.getStartLineNumber() !== line) continue;
    const local = ident.getSymbol();
    const target = local?.isAlias() ? (local.getAliasedSymbol() ?? local) : local;
    if (target?.getDeclarations().some((d) => projects.rel(d.getSourceFile().getFilePath()) === c.file)) return "symbol";
    // the export is gone: the name still comes from an import of the declaration's file
    for (const d of local?.getDeclarations() ?? []) {
      const from = Node.isImportSpecifier(d) ? d.getImportDeclaration().getModuleSpecifierSourceFile() : undefined;
      if (from && projects.rel(from.getFilePath()) === c.file) return "import";
    }
  }
  return undefined;
}
