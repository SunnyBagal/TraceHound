import { Node, type SourceFile } from "ts-morph";
import type { ImportFact } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";

const isRelative = (specifier: string) => specifier.startsWith(".") || specifier.startsWith("/");

/** Import and re-export declarations, resolved by the compiler to repo files where possible. */
export function extractImports(sf: SourceFile, ctx: ExtractContext): ImportFact[] {
  const file = ctx.rel(sf.getFilePath());
  const facts: ImportFact[] = [];

  const declarations = [...sf.getImportDeclarations(), ...sf.getExportDeclarations().filter((d) => d.hasModuleSpecifier())];
  for (const decl of declarations) {
    const specifier = decl.getModuleSpecifierValue();
    if (specifier === undefined) continue;

    const resolvedAbs = decl.getModuleSpecifierSourceFile()?.getFilePath();
    const resolvedRel = resolvedAbs ? ctx.rel(resolvedAbs) : undefined;
    const inRepo = resolvedRel !== undefined && !resolvedRel.startsWith("../") && !resolvedRel.includes("node_modules/");
    const target = inRepo ? resolvedRel : undefined;
    const external = !inRepo && !isRelative(specifier);

    let names: string[] = [];
    let typeOnly = decl.isTypeOnly();
    if (Node.isImportDeclaration(decl)) {
      const named = decl.getNamedImports();
      names = [
        ...(decl.getDefaultImport() ? [decl.getDefaultImport()!.getText()] : []),
        ...(decl.getNamespaceImport() ? [`* as ${decl.getNamespaceImport()!.getText()}`] : []),
        ...named.map((n) => n.getName()),
      ];
      if (!typeOnly && named.length > 0 && !decl.getDefaultImport() && !decl.getNamespaceImport()) {
        typeOnly = named.every((n) => n.isTypeOnly());
      }
    } else {
      names = decl.getNamedExports().map((n) => n.getName());
      if (names.length === 0) names = ["*"];
    }

    const kind = Node.isImportDeclaration(decl) ? "import" : "re-export";
    const detail = target
      ? `${kind} ${specifier} → ${target}`
      : external
        ? `${kind} external package ${specifier}`
        : `${kind} ${specifier} (unresolved: no such file in repo)`;
    const evidenceId = ctx.evidence.addNode(decl, file, {
      extractor: "imports",
      confidence: target || external ? 1 : 0.5,
      resolution: target || external ? "proven" : undefined,
      detail,
      symbol: names.join(", ") || undefined,
    });

    facts.push({ specifier, target, external, typeOnly, names, evidenceId });
  }
  return facts;
}
