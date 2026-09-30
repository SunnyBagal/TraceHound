import { Node, type SourceFile } from "ts-morph";
import type { ExtractContext } from "./evidence.ts";

export interface StartupCall {
  callee: string; // "connectRedis", "app.listen"
  evidenceId: string;
}

const IGNORED = /^(console|process)\./;

/** Calls made at module top level (`await x()`, `void y()`, `z()`): what a module does when loaded. */
export function extractStartupCalls(sf: SourceFile, ctx: ExtractContext): StartupCall[] {
  const file = ctx.rel(sf.getFilePath());
  const calls: StartupCall[] = [];
  for (const stmt of sf.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue;
    let expr: Node = stmt.getExpression();
    while (Node.isAwaitExpression(expr) || Node.isVoidExpression(expr) || Node.isParenthesizedExpression(expr)) expr = expr.getExpression();
    if (!Node.isCallExpression(expr)) continue;
    const callee = expr.getExpression().getText().replace(/\s+/g, "");
    if (IGNORED.test(callee) || callee.length > 60) continue;
    const evidenceId = ctx.evidence.addNode(stmt, file, {
      extractor: "startup",
      confidence: 1,
      resolution: "proven",
      detail: `top-level call ${callee}()`,
      symbol: callee,
    });
    calls.push({ callee, evidenceId });
  }
  return calls;
}
