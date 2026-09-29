import { Node, SyntaxKind, type FunctionDeclaration, type ArrowFunction, type FunctionExpression } from "ts-morph";
import { literalValue, rootIdentifier } from "./provenance.ts";

export interface StaticValue {
  raw: string;
  value?: string; // resolved string ("*" marks template holes)
  env?: string; // env var the value comes from, when known
  confidence: number; // 1 literal · 0.7 via fallback/indirection · 0.5 dynamic
}

const MAX_DEPTH = 6;
type FnLike = FunctionDeclaration | ArrowFunction | FunctionExpression;

/** `process.env.X` / `process.env["X"]` → "X". */
export function processEnvName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node) && node.getExpression().getText() === "process.env") return node.getName();
  if (Node.isElementAccessExpression(node) && node.getExpression().getText() === "process.env") {
    const arg = node.getArgumentExpression();
    return arg ? literalValue(arg) : undefined;
  }
  return undefined;
}

const envHelperCache = new WeakMap<Node, number | null>();

/** Index of the parameter a function uses as `process.env[param]`, e.g. `readRequiredEnv(name)`. */
function envHelperParamIndex(fn: FnLike): number | undefined {
  const cached = envHelperCache.get(fn);
  if (cached !== undefined) return cached ?? undefined;
  const params = fn.getParameters().map((p) => p.getName());
  let found: number | null = null;
  for (const access of fn.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = access.getArgumentExpression();
    if (access.getExpression().getText() === "process.env" && arg && Node.isIdentifier(arg) && params.includes(arg.getText())) {
      found = params.indexOf(arg.getText());
      break;
    }
  }
  envHelperCache.set(fn, found);
  return found ?? undefined;
}

function functionOf(callee: Node): FnLike | undefined {
  if (!Node.isIdentifier(callee)) return undefined;
  let symbol = callee.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (Node.isFunctionDeclaration(decl)) return decl;
    if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
    }
  }
  return undefined;
}

/** `readRequiredEnv("REDIS_URL")` → "REDIS_URL" when the callee reads `process.env[param]`. */
export function envHelperCallName(node: Node): string | undefined {
  if (!Node.isCallExpression(node)) return undefined;
  const fn = functionOf(node.getExpression());
  const index = fn ? envHelperParamIndex(fn) : undefined;
  const arg = index !== undefined ? node.getArguments()[index] : undefined;
  return arg ? literalValue(arg) : undefined;
}

/**
 * Best-effort static evaluation of a string-valued expression: literals, templates, const
 * variables (across imports), const object properties, `process.env.X ?? "default"`.
 */
export function resolveStatic(node: Node, depth = 0): StaticValue {
  const raw = node.getText();
  const dynamic: StaticValue = { raw, confidence: 0.5 };
  if (depth > MAX_DEPTH) return dynamic;

  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isNonNullExpression(node)) {
    return { ...resolveStatic(node.getExpression(), depth + 1), raw };
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return { raw, value: node.getLiteralValue(), confidence: 1 };
  }
  if (Node.isTemplateExpression(node)) {
    return { raw, value: literalValue(node), confidence: 0.7 };
  }
  const envName = processEnvName(node) ?? envHelperCallName(node);
  if (envName) return { raw, env: envName, confidence: 0.9 };

  if (Node.isBinaryExpression(node)) {
    const op = node.getOperatorToken().getKind();
    if (op === SyntaxKind.QuestionQuestionToken || op === SyntaxKind.BarBarToken) {
      const left = resolveStatic(node.getLeft(), depth + 1);
      const right = resolveStatic(node.getRight(), depth + 1);
      return { raw, value: left.value ?? right.value, env: left.env ?? right.env, confidence: Math.min(0.7, right.confidence) };
    }
  }
  if (Node.isIdentifier(node)) {
    let symbol = node.getSymbol();
    if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
    const decl = symbol?.getDeclarations().find(Node.isVariableDeclaration);
    const init = decl?.getInitializer();
    if (decl && init && decl.getVariableStatement()?.getDeclarationKind() === "const") {
      const inner = resolveStatic(init, depth + 1);
      return { ...inner, raw, confidence: Math.min(inner.confidence, 0.9) };
    }
    return dynamic;
  }
  if (Node.isPropertyAccessExpression(node)) {
    const base = rootIdentifier(node.getExpression());
    let symbol = base?.getSymbol();
    if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
    const decl = symbol?.getDeclarations().find(Node.isVariableDeclaration);
    const init = decl?.getInitializer();
    if (init && Node.isObjectLiteralExpression(init)) {
      const prop = init.getProperty(node.getName());
      if (prop && Node.isPropertyAssignment(prop)) {
        const inner = resolveStatic(prop.getInitializerOrThrow(), depth + 1);
        return { ...inner, raw, confidence: Math.min(inner.confidence, 0.9) };
      }
    }
    return dynamic;
  }
  return dynamic;
}
