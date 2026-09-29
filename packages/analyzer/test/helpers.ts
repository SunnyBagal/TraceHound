import { Project, ts, type SourceFile } from "ts-morph";
import { EvidenceStore, type ExtractContext } from "../src/extract/evidence.ts";

/** In-memory project rooted at "/" with bundler resolution, like the demo repo's tsconfig. */
export function memoryProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
    },
  });
  const evidence = new EvidenceStore();
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(path, text);
    evidence.setFileText(path.replace(/^\//, ""), text);
  }
  const ctx: ExtractContext = { rel: (abs) => abs.replace(/^\//, ""), evidence };
  const sf = (path: string): SourceFile => project.getSourceFileOrThrow(path);
  return { project, ctx, evidence, sf };
}
