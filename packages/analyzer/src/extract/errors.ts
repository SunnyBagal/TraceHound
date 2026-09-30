import { Node, type Expression, type SourceFile } from "ts-morph";
import type { ErrorMessageFact } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";

/**
 * Error-message string literals — the only string literals the analyzer records as facts:
 * - `new <X>Error("msg")` (Error and any constructor whose name ends in "Error")
 * - `throw "msg"`
 * - promise rejections: `reject("msg")` / `Promise.reject("msg")` (and `reject(new Error("msg"))`)
 * - HTTP error responses: `<res>.status(<4xx|5xx>).json|send({ error: "msg" })`
 * Only literal text counts: a string literal or a template (holes become `*`). A conditional's
 * literal branches count (`cond ? e.message : "internal_error"`); anything else is skipped.
 */
export function extractErrorMessages(sf: SourceFile, ctx: ExtractContext): ErrorMessageFact[] {
  const file = ctx.rel(sf.getFilePath());
  const facts: ErrorMessageFact[] = [];
  const add = (node: Node, message: string, kind: ErrorMessageFact["kind"], how: string) => {
    const evidenceId = ctx.evidence.addNode(node, file, { extractor: "errors", confidence: 1, resolution: "proven", detail: `${how}: ${JSON.stringify(message)}` });
    facts.push({ message, kind, evidenceId });
  };

  sf.forEachDescendant((node) => {
    if (Node.isNewExpression(node)) {
      const ctor = node.getExpression().getText();
      if (!/(^|\.)\w*Error$/.test(ctor)) return;
      const message = literalText(node.getArguments()[0] as Expression | undefined);
      if (message === undefined) return;
      const parent = node.getParent();
      if (parent && Node.isThrowStatement(parent)) add(node, message, "throw", `throw new ${ctor}`);
      else if (parent && Node.isCallExpression(parent) && isReject(parent)) add(node, message, "reject", `${parent.getExpression().getText()}(new ${ctor})`);
      else add(node, message, "new-error", `new ${ctor}`);
      return;
    }
    if (Node.isThrowStatement(node)) {
      const message = literalText(node.getExpression());
      if (message !== undefined) add(node, message, "throw", "throw");
      return;
    }
    if (Node.isCallExpression(node) && isReject(node)) {
      const message = literalText(node.getArguments()[0] as Expression | undefined);
      if (message !== undefined) add(node, message, "reject", node.getExpression().getText());
      return;
    }
    if (Node.isCallExpression(node) && isHttpErrorResponse(node)) {
      const body = node.getArguments()[0];
      if (!body || !Node.isObjectLiteralExpression(body)) return;
      const prop = body.getProperty("error");
      if (!prop || !Node.isPropertyAssignment(prop)) return;
      for (const message of literalBranches(prop.getInitializer())) add(prop, message, "http-error", `${node.getExpression().getText()} { error }`);
    }
  });
  return facts;
}

function isReject(call: Node): boolean {
  if (!Node.isCallExpression(call)) return false;
  const callee = call.getExpression().getText();
  return callee === "reject" || callee === "Promise.reject";
}

/** `x.status(<n>).json(...)` / `.send(...)` where some literal status code is >= 400. */
function isHttpErrorResponse(call: Node): boolean {
  if (!Node.isCallExpression(call)) return false;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || !["json", "send"].includes(callee.getName())) return false;
  const receiver = callee.getExpression();
  if (!Node.isCallExpression(receiver)) return false;
  const statusCallee = receiver.getExpression();
  if (!Node.isPropertyAccessExpression(statusCallee) || statusCallee.getName() !== "status") return false;
  const statusArg = receiver.getArguments()[0];
  if (!statusArg) return false;
  const numbers = [statusArg, ...statusArg.getDescendants()].filter(Node.isNumericLiteral).map((n) => Number(n.getLiteralValue()));
  return numbers.some((n) => n >= 400 && n <= 599);
}

/** Literal text of a string literal or template (holes → `*`); undefined for anything else. */
function literalText(expr: Node | undefined): string | undefined {
  if (!expr) return undefined;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) return expr.getLiteralValue();
  if (Node.isTemplateExpression(expr)) return expr.getHead().getLiteralText() + expr.getTemplateSpans().map((s) => `*${s.getLiteral().getLiteralText()}`).join("");
  return undefined;
}

/** Literal text, or the literal branches of a (nested) conditional. */
function literalBranches(expr: Node | undefined): string[] {
  if (!expr) return [];
  if (Node.isConditionalExpression(expr)) return [...literalBranches(expr.getWhenTrue()), ...literalBranches(expr.getWhenFalse())];
  if (Node.isParenthesizedExpression(expr)) return literalBranches(expr.getExpression());
  const text = literalText(expr);
  return text === undefined ? [] : [text];
}
