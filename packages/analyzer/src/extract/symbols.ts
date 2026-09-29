import { Node, type SourceFile } from "ts-morph";
import type { SymbolFact } from "../schema.ts";

const range = (node: Node) => ({ startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber() });

/** Top-level declarations: functions (incl. arrow-function consts), classes, variables, types. */
export function extractSymbols(sf: SourceFile): SymbolFact[] {
  const facts: SymbolFact[] = [];

  for (const fn of sf.getFunctions()) {
    facts.push({ name: fn.getName() ?? "default", kind: "function", exported: fn.isExported(), range: range(fn) });
  }
  for (const cls of sf.getClasses()) {
    facts.push({ name: cls.getName() ?? "default", kind: "class", exported: cls.isExported(), range: range(cls) });
  }
  for (const stmt of sf.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      const isFn = init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
      facts.push({ name: decl.getName(), kind: isFn ? "function" : "variable", exported: stmt.isExported(), range: range(stmt) });
    }
  }
  for (const iface of sf.getInterfaces()) {
    facts.push({ name: iface.getName(), kind: "interface", exported: iface.isExported(), range: range(iface) });
  }
  for (const alias of sf.getTypeAliases()) {
    facts.push({ name: alias.getName(), kind: "type", exported: alias.isExported(), range: range(alias) });
  }
  return facts.sort((a, b) => a.range.startLine - b.range.startLine);
}
