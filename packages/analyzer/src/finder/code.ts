// Read-only ts-morph helpers for the finder's probes (decision 051): find the node a snapshot
// evidence record points at, resolve a callee to its function, and follow request values
// ("specs": which property paths under a value are tainted) through one function body.
import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { Workspace } from "../load/workspace.ts";
import { relPath } from "../load/workspace.ts";
import type { Excerpt } from "./hypothesis.ts";

export type FnLike = Node & { getParameters(): { getName(): string; getNameNode(): Node }[]; getBody(): Node | undefined };

export const MAX_EXCERPT_LINES = 20;

export function isFnLike(node: Node | undefined): node is FnLike {
  return !!node && (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node));
}

export function unwrap(node: Node | undefined): Node | undefined {
  while (node && (Node.isAwaitExpression(node) || Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isNonNullExpression(node) || Node.isSatisfiesExpression(node) || Node.isTypeAssertion(node)))
    node = node.getExpression();
  return node;
}

/** Source files of a workspace by repo-relative path. */
export class CodeIndex {
  readonly repoRoot: string;
  #files = new Map<string, SourceFile>();

  constructor(ws: Workspace) {
    this.repoRoot = ws.repoRoot;
    for (const sf of ws.sourceFiles) this.#files.set(relPath(ws.repoRoot, sf.getFilePath()), sf);
  }

  rel(node: Node): string {
    return relPath(this.repoRoot, node.getSourceFile().getFilePath());
  }

  /** True when a node lives in a repo source file (not node_modules, not a lib .d.ts). */
  inRepo(node: Node): boolean {
    return this.#files.has(this.rel(node));
  }

  files(): SourceFile[] {
    return [...this.#files.values()];
  }

  /** Nodes of `kind` spanning exactly lines start..end of file, outermost first. */
  nodesAt(file: string, kind: SyntaxKind, start: number, end: number): Node[] {
    const sf = this.#files.get(file);
    return (sf?.getDescendantsOfKind(kind) ?? []).filter((n: Node) => n.getStartLineNumber() === start && n.getEndLineNumber() === end);
  }

  /** Lines start..end of a node's file, capped at MAX_EXCERPT_LINES. */
  excerpt(node: Node, why: string, start = node.getStartLineNumber(), end = node.getEndLineNumber()): Excerpt {
    const lines = node.getSourceFile().getFullText().split(/\r?\n/);
    const last = Math.min(end, start + MAX_EXCERPT_LINES - 1);
    return { file: this.rel(node), startLine: start, endLine: last, truncated: last < end, why, lines: lines.slice(start - 1, last) };
  }
}

/** The repo function a callee names: a declaration, a variable holding a function, or a method. */
export function functionOf(callee: Node | undefined, code: CodeIndex): FnLike | undefined {
  if (!callee) return undefined;
  const target = Node.isPropertyAccessExpression(callee) ? callee.getNameNode() : callee;
  if (!Node.isIdentifier(target)) return undefined;
  let symbol = target.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (!code.inRepo(decl)) continue;
    if (Node.isFunctionDeclaration(decl) || Node.isMethodDeclaration(decl)) return decl.getBody() ? decl : undefined;
    const init = Node.isVariableDeclaration(decl) || Node.isPropertyAssignment(decl) ? decl.getInitializer() : undefined;
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
  }
  return undefined;
}

/** A handler argument as a function: inline, or a named repo function. */
export function handlerFunction(arg: Node | undefined, code: CodeIndex): FnLike | undefined {
  arg = unwrap(arg);
  if (!arg) return undefined;
  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) return arg;
  return functionOf(arg, code);
}

// ── specs: which property paths under a value carry a tainted (caller-controlled) value ──
// A spec is a list of paths; [] means the whole value is tainted.
export type Spec = string[][];

const startsWith = (a: string[], prefix: string[]) => prefix.every((p, i) => a[i] === p);

/** The spec of `base.p1.p2…` given the spec of base. */
export function narrow(spec: Spec, props: string[]): Spec {
  const out: Spec = [];
  for (const path of spec) {
    if (startsWith(props, path)) return [[]]; // reading inside a tainted part
    if (startsWith(path, props)) out.push(path.slice(props.length));
  }
  return out;
}

export const isWhole = (spec: Spec) => spec.some((p) => p.length === 0);

/** Descendants of `kind` in a function body, the body itself included (an arrow's expression body). */
export function within<K extends SyntaxKind>(body: Node | undefined, kind: K) {
  if (!body) return [];
  return body.isKind(kind) ? [body as never, ...body.getDescendantsOfKind(kind)] : body.getDescendantsOfKind(kind);
}

/** `a.b["c"]` → { root: a, props: ["b", "c"] }; undefined for anything else. */
export function chainOf(expr: Node): { root: Node; props: string[] } | undefined {
  const props: string[] = [];
  let node: Node | undefined = unwrap(expr);
  while (node) {
    if (Node.isPropertyAccessExpression(node)) {
      props.unshift(node.getName());
      node = unwrap(node.getExpression());
    } else if (Node.isElementAccessExpression(node)) {
      const arg = node.getArgumentExpression();
      if (!arg || !(Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))) return undefined;
      props.unshift(arg.getLiteralValue());
      node = unwrap(node.getExpression());
    } else if (Node.isIdentifier(node)) {
      return { root: node, props };
    } else {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Taint inside one function: names bound to tainted values, starting from the parameters'
 * specs. Flow-insensitive: two passes over the function's variable declarations and assignments.
 */
export class FunctionTaint {
  readonly names = new Map<string, Spec>();

  constructor(fn: FnLike, params: Map<number, Spec>) {
    fn.getParameters().forEach((p, i) => {
      const spec = params.get(i);
      if (!spec?.length) return;
      const nameNode = p.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) this.#bindPattern(nameNode, spec);
      else this.#merge(p.getName(), spec);
    });
    const body = fn.getBody();
    if (!body) return;
    for (let pass = 0; pass < 2; pass++) {
      for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const init = decl.getInitializer();
        if (!init) continue;
        const spec = this.specOf(init);
        if (!spec.length) continue;
        const name = decl.getNameNode();
        if (Node.isObjectBindingPattern(name)) this.#bindPattern(name, spec);
        else if (Node.isIdentifier(name)) this.#merge(name.getText(), spec);
        else this.#bindAll(name, [[]]); // array pattern: every element
      }
      for (const bin of body.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
        const left = bin.getLeft();
        if (!Node.isIdentifier(left)) continue;
        const spec = this.specOf(bin.getRight());
        if (spec.length) this.#merge(left.getText(), spec);
      }
    }
  }

  #merge(name: string, spec: Spec) {
    const prev = this.names.get(name) ?? [];
    const seen = new Set(prev.map((p) => p.join(".")));
    this.names.set(name, [...prev, ...spec.filter((p) => !seen.has(p.join(".")))]);
  }

  #bindPattern(pattern: Node, spec: Spec) {
    if (!Node.isObjectBindingPattern(pattern)) return;
    for (const el of pattern.getElements()) {
      if (el.getDotDotDotToken()) {
        this.#bindAll(el.getNameNode(), spec);
        continue;
      }
      const prop = el.getPropertyNameNode()?.getText() ?? el.getName();
      const inner = narrow(spec, [prop.replace(/^["']|["']$/g, "")]);
      if (!inner.length) continue;
      const nameNode = el.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) this.#bindPattern(nameNode, inner);
      else if (Node.isIdentifier(nameNode)) this.#merge(nameNode.getText(), inner);
    }
  }

  #bindAll(node: Node, spec: Spec) {
    for (const id of [node, ...node.getDescendantsOfKind(SyntaxKind.Identifier)]) if (Node.isIdentifier(id)) this.#merge(id.getText(), spec);
  }

  /** The spec of an expression: a chain off a tainted name, an object literal's tainted properties, or [[]] if any part of it is tainted. */
  specOf(expr: Node): Spec {
    const obj = unwrap(expr);
    if (obj && Node.isObjectLiteralExpression(obj)) {
      const out: Spec = [];
      for (const prop of obj.getProperties()) {
        if (Node.isSpreadAssignment(prop)) out.push(...this.specOf(prop.getExpression()));
        else if (Node.isShorthandPropertyAssignment(prop)) out.push(...(this.names.get(prop.getName()) ?? []).map((p) => [prop.getName(), ...p]));
        else if (Node.isPropertyAssignment(prop)) out.push(...this.specOf(prop.getInitializerOrThrow()).map((p) => [prop.getName().replace(/^["']|["']$/g, ""), ...p]));
      }
      return out;
    }
    const chain = chainOf(expr);
    if (chain) {
      const base = this.names.get(chain.root.getText());
      return base ? narrow(base, chain.props) : [];
    }
    return this.isTainted(expr) ? [[]] : [];
  }

  /** True when some chain inside the expression reads a wholly tainted value. */
  isTainted(expr: Node): boolean {
    const whole = (n: Node) => {
      const c = chainOf(n);
      const base = c && this.names.get(c.root.getText());
      return !!base && isWhole(narrow(base, c.props));
    };
    if (whole(expr)) return true;
    for (const id of expr.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (!this.names.has(id.getText())) continue;
      // the longest property chain this identifier roots
      let top: Node = id;
      for (let p = top.getParent(); p && ((Node.isPropertyAccessExpression(p) || Node.isElementAccessExpression(p)) && p.getExpression() === top); p = top.getParent()) top = p;
      // skip identifiers that are a property name, not a value (`x.req`, `{ req: 1 }`)
      const parent = id.getParent();
      if (parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
      if (parent && Node.isPropertyAssignment(parent) && parent.getNameNode() === id) continue;
      if (whole(top)) return true;
    }
    return false;
  }
}
