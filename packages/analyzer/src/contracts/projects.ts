// ts-morph projects over one worktree, one per package (its tsconfig, else bundler-style defaults),
// created on first use. Only the files asked for are added; their imports resolve from disk.
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Project, ts, type SourceFile } from "ts-morph";
import { discoverPackages, packageOf, relPath, type PackageInfo } from "../load/workspace.ts";
import { cleanGitEnv } from "../git-env.ts";

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
};

export const TS_SOURCE = /\.(?:ts|tsx|mts|cts)$/;

export class TreeProjects {
  readonly root: string;
  #packages: PackageInfo[] | undefined;
  #projects = new Map<string, Project>();

  constructor(root: string) {
    this.root = root;
  }

  rel = (abs: string): string => relPath(this.root, abs);

  /** The file as a ts-morph source file, or undefined when it doesn't exist at this tree or isn't TypeScript. */
  sourceFile(rel: string): SourceFile | undefined {
    const abs = path.join(this.root, rel);
    if (!TS_SOURCE.test(rel) || !existsSync(abs)) return undefined;
    if (!this.#packages) {
      try {
        this.#packages = discoverPackages(this.root);
      } catch {
        this.#packages = []; // an unparseable package.json: one project for the whole tree
      }
    }
    const pkg = packageOf(this.#packages, rel);
    let project = this.#projects.get(pkg);
    if (!project) {
      const tsconfig = this.#packages.find((p) => p.root === pkg)?.tsconfig;
      project = tsconfig ? new Project({ tsConfigFilePath: path.join(this.root, tsconfig), skipAddingFilesFromTsConfig: true }) : new Project({ compilerOptions: DEFAULT_OPTIONS });
      this.#projects.set(pkg, project);
    }
    return project.getSourceFile(abs) ?? project.addSourceFileAtPath(abs);
  }
}

export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

/**
 * `git grep -F` of one literal over the tracked files of a worktree (`-w` for whole words); no match
 * is an empty list. Run in the head worktree, this is the head commit's tree: much faster than
 * `git grep <sha>`, and the node_modules links are untracked, so never searched.
 */
export function gitGrep(worktree: string, literal: string, word = false): GrepHit[] {
  const args = ["-C", worktree, "-c", "core.quotePath=false", "grep", "-n", "-z", "-I", "--no-color", "-F", ...(word ? ["-w"] : []), "-e", literal, "--"];
  const r = spawnSync("git", args, { encoding: "utf8", env: cleanGitEnv(), maxBuffer: 256 * 1024 * 1024 });
  if (r.status === 1) return [];
  if (r.status !== 0) throw new Error(`git grep failed in ${worktree}: ${r.stderr.trim()}`);
  const hits: GrepHit[] = [];
  for (const record of r.stdout.split("\n")) {
    const [file, line, ...text] = record.split("\0");
    if (!file || !line) continue;
    hits.push({ path: file, line: Number(line), text: text.join("\0") });
  }
  return hits;
}
