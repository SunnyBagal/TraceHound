import { Node, SyntaxKind, type Identifier, type VariableDeclaration } from "ts-morph";

/** Module an identifier was imported from, following it to its import declaration. */
export function importOrigin(ident: Identifier): { module: string; importedName: string } | undefined {
  for (const decl of ident.getSymbol()?.getDeclarations() ?? []) {
    if (Node.isImportSpecifier(decl)) {
      return { module: decl.getImportDeclaration().getModuleSpecifierValue(), importedName: decl.getName() };
    }
    const importDecl = decl.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (importDecl && Node.isImportClause(decl)) return { module: importDecl.getModuleSpecifierValue(), importedName: "default" };
    if (importDecl && Node.isNamespaceImport(decl)) return { module: importDecl.getModuleSpecifierValue(), importedName: "*" };
  }
  return undefined;
}

/**
 * Module a call's callee comes from: `createClient()` → "redis", `express.Router()` → "express",
 * `new PrismaClient()` → the specifier PrismaClient was imported from.
 */
export function calleeOrigin(callee: Node): { module: string; name: string } | undefined {
  if (Node.isIdentifier(callee)) {
    const origin = importOrigin(callee);
    return origin && { module: origin.module, name: origin.importedName === "default" ? callee.getText() : origin.importedName };
  }
  if (Node.isPropertyAccessExpression(callee)) {
    const base = callee.getExpression();
    if (Node.isIdentifier(base)) {
      const origin = importOrigin(base);
      return origin && { module: origin.module, name: callee.getName() };
    }
  }
  return undefined;
}

/** Variable declaration an identifier refers to, following imports/re-exports across files. */
export function resolveVariable(ident: Identifier): VariableDeclaration | undefined {
  let symbol = ident.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (Node.isVariableDeclaration(decl)) return decl;
  }
  return undefined;
}

/** Innermost identifier of `a`, `a.b`, `this.a`, `(a as X)` expressions. */
export function rootIdentifier(expr: Node): Identifier | undefined {
  let current: Node = expr;
  for (;;) {
    if (Node.isIdentifier(current)) return current;
    if (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isNonNullExpression(current)) {
      current = current.getExpression();
      continue;
    }
    return undefined;
  }
}

/** Static string value of a literal / no-substitution template; `*` for template holes. */
export function literalValue(node: Node): string | undefined {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  if (Node.isTemplateExpression(node)) {
    return node.getHead().getLiteralText() + node.getTemplateSpans().map((s) => "*" + s.getLiteral().getLiteralText()).join("");
  }
  return undefined;
}
