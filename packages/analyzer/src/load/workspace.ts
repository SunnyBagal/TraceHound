import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Project, ts, type SourceFile } from "ts-morph";

export interface PackageInfo {
  root: string; // repo-relative ("." for the repo root)
  name: string;
  tsconfig?: string; // repo-relative
  entryFiles: { path: string; reason: string }[];
}

export interface Workspace {
  repoRoot: string;
  packages: PackageInfo[];
  sourceFiles: SourceFile[];
  prismaSchemas: { path: string; package: string; text: string }[];
}

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "generated"]);
const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;
// `bun run src/index.ts`, `node dist/main.js`, `tsx watch src/server.ts`, ...
const SCRIPT_ENTRY = /\b(?:bun|node|tsx|ts-node|nodemon)\b(?:\s+(?:run|watch|--\S+))*\s+([\w./-]+\.(?:[cm]?[jt]sx?))/g;

// Fallback when a package has no tsconfig: modern bundler-style resolution.
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
};

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function relPath(repoRoot: string, abs: string): string {
  return toPosix(path.relative(repoRoot, abs)) || ".";
}

function walk(dir: string, visit: (abs: string, isDir: boolean) => boolean | void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (visit(abs, true) !== false) walk(abs, visit);
    } else if (entry.isFile()) {
      visit(abs, false);
    }
  }
}

function readEntryFiles(pkgRootAbs: string, pkgJson: Record<string, unknown>, repoRoot: string) {
  const entries: { path: string; reason: string }[] = [];
  const add = (candidate: string, reason: string) => {
    const abs = path.resolve(pkgRootAbs, candidate);
    const rel = relPath(repoRoot, abs);
    if (existsSync(abs) && statSync(abs).isFile() && !entries.some((e) => e.path === rel)) entries.push({ path: rel, reason });
  };
  const scripts = (pkgJson.scripts ?? {}) as Record<string, string>;
  for (const [name, cmd] of Object.entries(scripts)) {
    for (const match of cmd.matchAll(SCRIPT_ENTRY)) add(match[1]!, `package.json script "${name}": ${cmd}`);
  }
  for (const field of ["main", "module"] as const) {
    const value = pkgJson[field];
    if (typeof value === "string") add(value, `package.json "${field}"`);
  }
  return entries;
}

export function discoverPackages(repoRoot: string): PackageInfo[] {
  const roots: string[] = [];
  if (existsSync(path.join(repoRoot, "package.json"))) roots.push(repoRoot);
  walk(repoRoot, (abs, isDir) => {
    if (isDir && existsSync(path.join(abs, "package.json"))) roots.push(abs);
  });
  return roots.map((abs) => {
    const pkgJson = JSON.parse(readFileSync(path.join(abs, "package.json"), "utf8")) as Record<string, unknown>;
    const tsconfig = path.join(abs, "tsconfig.json");
    return {
      root: relPath(repoRoot, abs),
      name: typeof pkgJson.name === "string" ? pkgJson.name : path.basename(abs),
      tsconfig: existsSync(tsconfig) ? relPath(repoRoot, tsconfig) : undefined,
      entryFiles: readEntryFiles(abs, pkgJson, repoRoot),
    };
  });
}

/** Nearest enclosing package root for a repo-relative path. */
export function packageOf(packages: PackageInfo[], file: string): string {
  let best = ".";
  for (const pkg of packages) {
    const prefix = pkg.root === "." ? "" : pkg.root + "/";
    if ((pkg.root === "." || file.startsWith(prefix)) && pkg.root.length >= best.length) best = pkg.root;
  }
  return best;
}

export function loadWorkspace(repoRootInput: string): Workspace {
  const repoRoot = path.resolve(repoRootInput);
  const packages = discoverPackages(repoRoot);
  if (packages.length === 0) packages.push({ root: ".", name: path.basename(repoRoot), entryFiles: [] });

  const filesByPackage = new Map<string, string[]>();
  const prismaSchemas: Workspace["prismaSchemas"] = [];
  walk(repoRoot, (abs, isDir) => {
    if (isDir) return;
    const rel = relPath(repoRoot, abs);
    const pkg = packageOf(packages, rel);
    if (SOURCE_EXT.test(abs)) {
      filesByPackage.set(pkg, [...(filesByPackage.get(pkg) ?? []), abs]);
    } else if (abs.endsWith(".prisma")) {
      prismaSchemas.push({ path: rel, package: pkg, text: readFileSync(abs, "utf8") });
    }
  });

  // One ts-morph project per package so each resolves imports with its own compiler options.
  const sourceFiles: SourceFile[] = [];
  for (const pkg of packages) {
    const files = filesByPackage.get(pkg.root);
    if (!files?.length) continue;
    const project = pkg.tsconfig
      ? new Project({ tsConfigFilePath: path.join(repoRoot, pkg.tsconfig), skipAddingFilesFromTsConfig: true })
      : new Project({ compilerOptions: DEFAULT_OPTIONS });
    for (const file of files) sourceFiles.push(project.addSourceFileAtPath(file));
  }
  sourceFiles.sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));
  return { repoRoot, packages, sourceFiles, prismaSchemas };
}
