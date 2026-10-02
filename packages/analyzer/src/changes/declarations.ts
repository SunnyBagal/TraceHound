// Declarations and call sites of one tree (decision 038). Deterministic: ts-morph symbols only.
// Every call expression lands in exactly one bucket - resolved (to a declaration in the analyzed
// files), external (a package or the TS lib), or dynamic (not resolvable statically) - none is dropped.
import { Node, SyntaxKind, ts, type SourceFile } from "ts-morph";
import type { CallCounts, DeclarationKind } from "../schema.ts";
import { importOrigin } from "../extract/provenance.ts";

export interface Decl {
  id: string; // "<file>#<qualified name>"
  name: string;
  file: string;
  kind: DeclarationKind;
  exported: boolean;
  startLine: number;
  endLine: number;
  start: number; // character positions of the declaration's node
  end: number;
  parts: { signature: string; returnType?: string; body?: string; typeAnnotation?: string; shape?: string };
  /** the same parts with whitespace and comments normalized away (formatting-insensitive) */
  norm: { signature: string; returnType?: string; body?: string; typeAnnotation?: string; shape?: string };
  topLevel: boolean; // a direct child of the module (classes, functions, variables, inline route handlers at module scope)
}

export interface CallSite {
  file: string;
  line: number;
  from: string; // enclosing declaration id
  bucket: keyof CallCounts;
  to?: string; // resolved declaration id
  detail: string; // callee text
}

export interface RouteSpan {
  file: string;
  startLine: number;
  label: string; // "POST /api/v1/content"
}

export interface TreeIndex {
  decls: Map<string, Decl>;
  byFile: Map<string, Decl[]>;
  calls: CallSite[];
  callCounts: Map<string, CallCounts>;
  /** route node id → handler declaration id (or the registering declaration when the handler isn't resolvable) */
  routes: { route: string; handler: string; file: string; line: number; resolved: boolean }[];
  /** the declaration whose node starts at this position, if any */
  idAt(file: string, start: number): string | undefined;
  /** innermost declaration containing a position (falls back to the file's module declaration) */
  enclosing(file: string, pos: number): string;
  enclosingLine(file: string, line: number): string;
}

const MODULE = "<module>";
const isFnLike = (n: Node | undefined) => !!n && (Node.isArrowFunction(n) || Node.isFunctionExpression(n));
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const returnsJsx = (n: Node) => n.getDescendants().some((d) => Node.isJsxElement(d) || Node.isJsxSelfClosingElement(d) || Node.isJsxFragment(d));
const modifiersText = (n: Node) => (Node.isModifierable(n) ? n.getModifiers().map((m) => m.getText()).join(" ") : "");

const bodyOf = (fn: Node): Node | undefined => ("getBody" in fn && typeof fn.getBody === "function" ? (fn.getBody() as Node | undefined) : undefined);

// ── parts: each part is a list of pieces, from which the exact text and a formatting-insensitive
// form are both derived (0.9.0). The normalized form is the node's leaf tokens joined by single
// spaces: whitespace, comments and JSDoc are trivia and drop out, JSX text has its whitespace
// collapsed, and every other token (strings, templates, regexes) is kept exactly.
type Marked = { node: Node; markers: { node: Node; marker: string }[] };
type Piece = string | Node | Marked;
type PartPieces = { signature: Piece[]; returnType?: Piece[]; body?: Piece[]; typeAnnotation?: Piece[]; shape?: Piece[] };

function tokens(node: Node, markers: Marked["markers"] = []): string {
  const sf = node.getSourceFile().compilerNode;
  const replace = new Map(markers.map((m) => [m.node.compilerNode, m.marker]));
  const out: string[] = [];
  const walk = (c: ts.Node) => {
    const marker = replace.get(c);
    if (marker !== undefined) return void out.push(marker);
    if (c.kind === ts.SyntaxKind.JSDoc) return;
    if (c.kind === ts.SyntaxKind.JsxText) {
      const t = c.getText(sf).replace(/\s+/g, " ").trim();
      if (t) out.push(t);
      return;
    }
    const kids = c.getChildren(sf);
    if (!kids.length) {
      const t = c.getText(sf);
      if (t) out.push(t);
      return;
    }
    kids.forEach(walk);
  };
  walk(node.compilerNode);
  return out.join(" ");
}
function exactText(m: Marked): string {
  let text = m.node.getText();
  const base = m.node.getStart();
  for (const { node, marker } of [...m.markers].sort((a, b) => b.node.getStart() - a.node.getStart())) text = text.slice(0, node.getStart() - base) + marker + text.slice(node.getEnd() - base);
  return text;
}
const pieceExact = (p: Piece) => (typeof p === "string" ? p : "markers" in p ? exactText(p) : p.getText());
const pieceNorm = (p: Piece) => (typeof p === "string" ? p.replace(/\s+/g, " ").trim() : "markers" in p ? tokens(p.node, p.markers) : tokens(p));
function render(pp: PartPieces): { parts: Decl["parts"]; norm: Decl["parts"] } {
  const parts: Record<string, string> = {};
  const norm: Record<string, string> = {};
  for (const [k, pieces] of Object.entries(pp) as [string, Piece[] | undefined][]) {
    if (!pieces) continue;
    parts[k] = pieces.map(pieceExact).join("\u0001");
    norm[k] = pieces.map(pieceNorm).join("\u0001");
  }
  return { parts: parts as Decl["parts"], norm: norm as Decl["parts"] };
}

function fnParts(prefix: Piece[], fn: Node): PartPieces {
  if (!(Node.isFunctionLikeDeclaration(fn) || Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) return { signature: prefix };
  const typeParams = Node.isTypeParametered(fn) ? fn.getTypeParameters() : [];
  const asyncKw = Node.isAsyncable(fn) && fn.isAsync() ? "async" : "";
  const ret = fn.getReturnTypeNode();
  const body = bodyOf(fn);
  return {
    signature: [asyncKw, ...prefix, "<", ...typeParams, ">(", ...fn.getParameters(), ")"],
    ...(ret && { returnType: [ret] }),
    ...(body && { body: [body] }),
  };
}

export function indexTree(sourceFiles: SourceFile[], rel: (abs: string) => string, routeSpans: RouteSpan[]): TreeIndex {
  const decls = new Map<string, Decl>();
  const byFile = new Map<string, Decl[]>();
  const byPos = new Map<string, string>(); // "<file>:<start>" of a declaration node → id
  const files = new Set(sourceFiles.map((sf) => rel(sf.getFilePath())));
  const add = (d: Omit<Decl, "id" | "parts" | "norm"> & { id?: string; pieces: PartPieces }, node: Node) => {
    let id = d.id ?? `${d.file}#${d.name}`;
    for (let n = 2; decls.has(id); n++) id = `${d.file}#${d.name} (${n})`;
    const { pieces, ...rest } = d;
    const decl: Decl = { ...rest, id, ...render(pieces) };
    decls.set(id, decl);
    byFile.set(d.file, [...(byFile.get(d.file) ?? []), decl]);
    if (d.kind !== "module") byPos.set(`${d.file}:${node.getStart()}`, id); // the module starts at 0, like the first declaration
    return decl;
  };
  const span = (n: Node) => ({ startLine: n.getStartLineNumber(), endLine: n.getEndLineNumber(), start: n.getStart(), end: n.getEnd() });

  for (const sf of sourceFiles) {
    const file = rel(sf.getFilePath());
    const tsx = file.endsWith(".tsx");
    const fnKind = (name: string, body: Node): DeclarationKind => (tsx && PASCAL.test(name) && returnsJsx(body) ? "react-component" : "function");
    const topNodes: Node[] = [];

    for (const stmt of sf.getStatements()) {
      if (Node.isFunctionDeclaration(stmt) && stmt.getName()) {
        const name = stmt.getName()!;
        const impl = stmt.getImplementation() ?? stmt;
        if (stmt !== impl && stmt.getBody() === undefined) continue; // an overload: folded into the implementation below
        const parts = fnParts([modifiersText(impl), "function", name], impl);
        add({ name, file, kind: fnKind(name, impl), exported: impl.isExported(), ...span(impl), pieces: { ...parts, signature: [...impl.getOverloads(), ...parts.signature] }, topLevel: true }, impl);
        topNodes.push(impl, ...impl.getOverloads());
      } else if (Node.isClassDeclaration(stmt)) {
        const name = stmt.getName() ?? "default";
        const header: Piece[] = [...stmt.getDecorators(), modifiersText(stmt), "class", name, "<", ...stmt.getTypeParameters(), ">", ...stmt.getHeritageClauses()];
        const members: { node: Node; marker: string }[] = [];
        for (const m of stmt.getMembers()) {
          const memberName = Node.isConstructorDeclaration(m) ? "constructor" : Node.isGetAccessorDeclaration(m) ? `get ${m.getName()}` : Node.isSetAccessorDeclaration(m) ? `set ${m.getName()}` : "getName" in m ? String((m as { getName(): string }).getName()) : undefined;
          if (!memberName) continue;
          if (Node.isPropertyDeclaration(m)) {
            const init = m.getInitializer();
            if (init && isFnLike(init)) {
              const d = add({ name: `${name}.${memberName}`, file, kind: "method", exported: false, ...span(m), pieces: fnParts([modifiersText(m), memberName], init), topLevel: false }, m);
              members.push({ node: m, marker: `⟨${d.id}⟩` });
            } else {
              const typeNode = m.getTypeNode();
              const d = add({ name: `${name}.${memberName}`, file, kind: "property", exported: false, ...span(m), pieces: { signature: [modifiersText(m), memberName, m.hasQuestionToken() ? "?" : ""], ...(typeNode && { typeAnnotation: [typeNode] }), ...(init && { body: [init] }) }, topLevel: false }, m);
              members.push({ node: m, marker: `⟨${d.id}⟩` });
            }
          } else if (Node.isMethodDeclaration(m) || Node.isConstructorDeclaration(m) || Node.isGetAccessorDeclaration(m) || Node.isSetAccessorDeclaration(m)) {
            if (Node.isMethodDeclaration(m) && !m.getBody()) continue; // overload / abstract signature: part of the class's own text below
            const d = add({ name: `${name}.${memberName}`, file, kind: "method", exported: false, ...span(m), pieces: fnParts([modifiersText(m), memberName], m), topLevel: false }, m);
            members.push({ node: m, marker: `⟨${d.id}⟩` });
          }
        }
        // the class's own body: its text with each member replaced by a marker (members are compared on their own)
        add({ name, file, kind: "class", exported: stmt.isExported(), ...span(stmt), pieces: { signature: header, body: [{ node: stmt, markers: members }] }, topLevel: true }, stmt);
        topNodes.push(stmt);
      } else if (Node.isVariableStatement(stmt)) {
        for (const v of stmt.getDeclarations()) {
          const name = v.getName();
          let init: Node | undefined = v.getInitializer();
          // `memo(() => …)` / `forwardRef(function …)`: the wrapped function is the declaration's body
          if (init && Node.isCallExpression(init) && isFnLike(init.getArguments()[0])) init = init.getArguments()[0];
          const typeNode = v.getTypeNode();
          const prefix: Piece[] = [stmt.isExported() ? "export" : "", stmt.getDeclarationKind(), name, ...(typeNode ? [":", typeNode] : []), "="];
          if (init && isFnLike(init)) {
            add({ name, file, kind: fnKind(name, init), exported: stmt.isExported(), ...span(v), pieces: fnParts(prefix, init), topLevel: true }, v);
            topNodes.push(v);
          } else if (stmt.isExported()) {
            const value = v.getInitializer();
            add({ name, file, kind: "variable", exported: true, ...span(v), pieces: { signature: [stmt.getDeclarationKind(), name], ...(typeNode && { typeAnnotation: [typeNode] }), ...(value && { body: [value] }) }, topLevel: true }, v);
            topNodes.push(v);
          }
        }
      } else if (Node.isInterfaceDeclaration(stmt) || Node.isTypeAliasDeclaration(stmt) || Node.isEnumDeclaration(stmt)) {
        // types are declarations of their own (0.9.0): the definition is their "shape"
        const name = stmt.getName();
        const keyword = Node.isInterfaceDeclaration(stmt) ? "interface" : Node.isTypeAliasDeclaration(stmt) ? "type" : stmt.isConstEnum() ? "const enum" : "enum";
        const typeParams = Node.isEnumDeclaration(stmt) ? [] : stmt.getTypeParameters();
        const shape: Piece[] = Node.isInterfaceDeclaration(stmt) ? [...stmt.getHeritageClauses(), "{", ...stmt.getMembers(), "}"] : Node.isTypeAliasDeclaration(stmt) ? [stmt.getTypeNodeOrThrow()] : ["{", ...stmt.getMembers(), "}"];
        add({ name, file, kind: "type", exported: stmt.isExported(), ...span(stmt), pieces: { signature: [modifiersText(stmt), keyword, name, "<", ...typeParams, ">"], shape }, topLevel: true }, stmt);
        topNodes.push(stmt);
      } else if (Node.isExportAssignment(stmt) && !stmt.isExportEquals()) {
        const expr = stmt.getExpression();
        if (isFnLike(expr)) add({ name: "default", file, kind: fnKind("Default", expr), exported: true, ...span(stmt), pieces: fnParts(["export default"], expr), topLevel: true }, stmt);
        else add({ name: "default", file, kind: "variable", exported: true, ...span(stmt), pieces: { signature: ["export default"], body: [expr] }, topLevel: true }, stmt);
        topNodes.push(stmt);
      }
    }

    // inline route handlers: the last function argument of a route registration call (http-routes facts)
    for (const r of routeSpans.filter((x) => x.file === file)) {
      const call = sf.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => c.getStartLineNumber() === r.startLine && Node.isPropertyAccessExpression(c.getExpression()));
      const handler = call?.getArguments().at(-1);
      if (call && handler && isFnLike(handler)) {
        add({ name: `route:${r.label}`, file, kind: "route-handler", exported: false, ...span(handler), pieces: fnParts([`route:${r.label}`], handler), topLevel: !handler.getFirstAncestor((a) => topNodes.includes(a)) }, handler);
      }
    }

    // the module: its own top-level statements (imports, top-level code, non-exported values),
    // joined; declarations are left out entirely, except an inline route handler, which keeps a
    // marker inside its registration call. Adding or removing a function doesn't change the module.
    const own = [...(byFile.get(file) ?? [])].filter((d) => d.topLevel);
    const handlerDecls = own.filter((d) => d.kind === "route-handler");
    const statements: Piece[] = sf
      .getStatements()
      .filter((st) => !own.some((d) => d.kind !== "route-handler" && st.getStart() <= d.start && d.end <= st.getEnd() && (st.getStart() === d.start || Node.isVariableStatement(st))))
      .map((st) => {
        const inside = handlerDecls.filter((h) => h.start >= st.getStart() && h.end <= st.getEnd());
        const markers = inside.flatMap((h) => {
          const node = st.getDescendants().find((n) => n.getStart() === h.start && n.getEnd() === h.end && (Node.isArrowFunction(n) || Node.isFunctionExpression(n)));
          return node ? [{ node, marker: `⟨${h.id}⟩` }] : [];
        });
        return { node: st, markers };
      });
    add({ id: `${file}#${MODULE}`, name: MODULE, file, kind: "module", exported: false, startLine: 1, endLine: sf.getEndLineNumber(), start: 0, end: sf.getEnd(), pieces: { signature: [], body: statements }, topLevel: false }, sf);
  }

  const enclosing = (file: string, pos: number): string => {
    let best: Decl | undefined;
    for (const d of byFile.get(file) ?? []) {
      if (d.kind === "module" || pos < d.start || pos >= d.end) continue;
      if (!best || d.end - d.start < best.end - best.start) best = d;
    }
    return best?.id ?? `${file}#${MODULE}`;
  };
  const enclosingLine = (file: string, line: number): string => {
    let best: Decl | undefined;
    for (const d of byFile.get(file) ?? []) {
      if (d.kind === "module" || line < d.startLine || line > d.endLine) continue;
      if (!best || d.end - d.start < best.end - best.start) best = d;
    }
    return best?.id ?? `${file}#${MODULE}`;
  };

  /** The declaration a resolved symbol declaration belongs to, or why it isn't one of ours. */
  const owner = (d: Node): { bucket: keyof CallCounts; to?: string } => {
    const sf = d.getSourceFile();
    const f = rel(sf.getFilePath());
    if (sf.isDeclarationFile() || sf.isInNodeModules() || !files.has(f)) return { bucket: "external" };
    const direct = byPos.get(`${f}:${d.getStart()}`);
    if (direct) return { bucket: "resolved", to: direct };
    // a local (a parameter, a variable inside a function): its value is only known at runtime
    if (Node.isParameterDeclaration(d) || (Node.isVariableDeclaration(d) && d.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a)))) return { bucket: "dynamic" };
    // a member of a module-level value (an object literal's method, …): the declaration that holds it
    return { bucket: "resolved", to: enclosing(f, d.getStart()) };
  };

  const calls: CallSite[] = [];
  const callCounts = new Map<string, CallCounts>();
  for (const sf of sourceFiles) {
    const file = rel(sf.getFilePath());
    const counts: CallCounts = { resolved: 0, external: 0, dynamic: 0 };
    for (const c of sf.getDescendants().filter((n) => Node.isCallExpression(n) || Node.isNewExpression(n))) {
      const expr = (c as unknown as { getExpression(): Node }).getExpression();
      const target = resolveCallee(expr, owner);
      counts[target.bucket]++;
      calls.push({ file, line: c.getStartLineNumber(), from: enclosing(file, c.getStart()), bucket: target.bucket, ...(target.to && { to: target.to }), detail: expr.getText().slice(0, 80) });
    }
    callCounts.set(file, counts);
  }

  const routes: TreeIndex["routes"] = [];
  for (const r of routeSpans) {
    const sf = sourceFiles.find((s) => rel(s.getFilePath()) === r.file);
    const call = sf?.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => c.getStartLineNumber() === r.startLine && Node.isPropertyAccessExpression(c.getExpression()));
    if (!sf || !call) continue;
    const handler = call.getArguments().at(-1);
    let to: string | undefined;
    if (handler && isFnLike(handler)) to = byPos.get(`${r.file}:${handler.getStart()}`);
    else if (handler) {
      // `createOrder` or a wrapper like `asyncHandler(createOrder)`: the first identifier that resolves to one of ours
      for (const ident of [handler, ...handler.getDescendantsOfKind(SyntaxKind.Identifier)].filter(Node.isIdentifier)) {
        const t = resolveCallee(ident, owner);
        if (t.bucket === "resolved" && t.to) {
          to = t.to;
          break;
        }
      }
    }
    routes.push({ route: `route:${r.label}`, handler: to ?? enclosing(r.file, call.getStart()), file: r.file, line: r.startLine, resolved: to !== undefined });
  }

  return { decls, byFile, calls, callCounts, routes, idAt: (file, start) => byPos.get(`${file}:${start}`), enclosing, enclosingLine };
}

/** Resolve what a call's callee refers to. */
function resolveCallee(expr: Node, owner: (d: Node) => { bucket: keyof CallCounts; to?: string }): { bucket: keyof CallCounts; to?: string } {
  let target = expr;
  while (Node.isParenthesizedExpression(target) || Node.isNonNullExpression(target) || Node.isAsExpression(target)) target = target.getExpression();
  const nameNode = Node.isIdentifier(target) ? target : Node.isPropertyAccessExpression(target) ? target.getNameNode() : undefined;
  if (!nameNode) return { bucket: "dynamic" }; // obj[key](), f()(), super(), …
  let symbol = nameNode.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  const decl = symbol?.getDeclarations()[0];
  if (decl) return owner(decl);
  // no declaration (a package whose types aren't installed, an `any`): external when the chain's root
  // is imported from a package, typed with a package type, or built by a package call; else dynamic
  return fromPackage(chainRoot(target)) ? { bucket: "external" } : { bucket: "dynamic" };
}

/** `a.b.c` / `a().b` / `a[k].b` → `a` */
function chainRoot(n: Node): Node {
  let cur = n;
  for (;;) {
    if (Node.isPropertyAccessExpression(cur) || Node.isElementAccessExpression(cur) || Node.isCallExpression(cur) || Node.isNonNullExpression(cur) || Node.isParenthesizedExpression(cur) || Node.isAsExpression(cur)) cur = cur.getExpression();
    else return cur;
  }
}

/** Globals every JS runtime the analyzer targets provides (ECMAScript, web platform, Node, Bun). */
const RUNTIME_GLOBALS = new Set(
  ("console crypto process globalThis Bun Deno require module setTimeout clearTimeout setInterval clearInterval setImmediate queueMicrotask " +
    "structuredClone fetch Response Request Headers URL URLSearchParams AbortController TextEncoder TextDecoder Blob FormData atob btoa performance " +
    "JSON Math Date Promise Object Array Number String Boolean Symbol BigInt Error TypeError RangeError Map Set WeakMap WeakSet Reflect Proxy Intl " +
    "RegExp Buffer parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI window document localStorage sessionStorage navigator alert").split(" "),
);
const isPackage = (module: string | undefined) => module !== undefined && !module.startsWith(".") && !module.startsWith("/");
function fromPackage(root: Node): boolean {
  if (!Node.isIdentifier(root)) return false;
  if (isPackage(importOrigin(root)?.module)) return true;
  let symbol = root.getSymbol();
  // undeclared, but a runtime global (console, crypto, setTimeout, … without the runtime's types
  // installed); any other free identifier (a typo, a removed function) stays dynamic
  if (!symbol) return RUNTIME_GLOBALS.has(root.getText());
  if (symbol.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  const decl = symbol.getDeclarations()[0];
  if (!decl || !(Node.isParameterDeclaration(decl) || Node.isVariableDeclaration(decl))) return false;
  const typeNode = decl.getTypeNode();
  if (typeNode && Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const first = Node.isQualifiedName(typeName) ? typeName.getLeft() : typeName;
    if (Node.isIdentifier(first) && isPackage(importOrigin(first)?.module)) return true;
  }
  const init = Node.isVariableDeclaration(decl) ? decl.getInitializer() : undefined;
  if (init && (Node.isNewExpression(init) || Node.isCallExpression(init) || Node.isAwaitExpression(init))) {
    const inner = Node.isAwaitExpression(init) ? init.getExpression() : init;
    const callee = Node.isNewExpression(inner) || Node.isCallExpression(inner) ? chainRoot(inner.getExpression()) : undefined;
    return !!callee && Node.isIdentifier(callee) && callee !== root && isPackage(importOrigin(callee)?.module);
  }
  return false;
}
