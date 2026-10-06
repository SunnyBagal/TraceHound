// Probes (decision 051): deterministic, read-only code facts gathered only at places the graph
// already names (route, mount, queue produce and consume evidence). The rules (rules.ts) are a
// pure function of the snapshot and these probes; nothing here decides whether a rule fires.
import { Node, SyntaxKind, type CallExpression } from "ts-morph";
import { importOrigin, resolveVariable, rootIdentifier } from "../extract/provenance.ts";
import type { Evidence, Snapshot } from "../schema.ts";
import { chainOf, type CodeIndex, type FnLike, FunctionTaint, functionOf, handlerFunction, isWhole, type Spec, unwrap, within } from "./code.ts";
import type { Excerpt } from "./hypothesis.ts";

/** Names that mark an auth check: middleware, guards, token checks. `author` is not auth. */
export const AUTH_NAME = /auth(?!or)|jwt|passport|clerk|bearer|verify_?token|require_?(user|login|session)|ensure_?(logged|auth)|is_?logged|logged_?in|protect|guard|current_?user|api_?key/i;
/** Request properties a handler reads when it checks who is calling. */
const AUTH_REQUEST_PROPS = new Set(["user", "session", "cookies", "signedCookies", "auth"]);
const AUTH_HEADER = /^(authorization|cookie|x-api-key)$/i;
/** Request parts a caller controls. */
export const REQUEST_SPEC: Spec = [["body"], ["query"], ["params"]];
const OUTBOUND_MODULES = new Set(["axios", "got", "ky", "node-fetch", "undici", "superagent", "cross-fetch", "http", "https", "node:http", "node:https"]);
const OUTBOUND_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "request", "fetch"]);
/** Function calls followed from a route handler or a worker processor (each side). */
export const MAX_HOPS = 2;

export interface Guard {
  where: "route-middleware" | "router-use" | "mount-use" | "handler-body";
  text: string;
  excerpt: Excerpt;
}

export interface MountChain {
  fullPath: string;
  mountEvidenceIds: string[];
  guards: Guard[];
}

export interface Sink {
  callee: string;
  excerpt: Excerpt; // the outbound call
  trail: Excerpt[]; // call sites crossed on the way, in order
  queue?: { name: string; produceEvidenceId: string; consumeEvidenceId: string; fields: string[] };
}

export interface RouteProbe {
  evidenceId: string;
  file: string;
  method: string;
  path: string;
  routeExcerpt: Excerpt;
  handlerExcerpt?: Excerpt;
  /** one per way the route is mounted; a route on an unmounted router has one chain */
  chains: MountChain[];
  /** guards on the route itself or in its handler: they hold on every chain */
  ownGuards: Guard[];
  requestFields: string[]; // "body.url", "query.q": request values the handler reads
  sinks: Sink[];
}

export interface ProducerProbe {
  evidenceId: string;
  queue: string;
  jobName?: string;
  keys: string[] | null; // payload keys from the argument's type; null = unknown (any, unknown, not an object)
  excerpt: Excerpt;
}

export interface FieldRead {
  field: string;
  guarded: boolean; // read with a fallback or as a condition (`?? x`, `|| x`, `!x`, a default)
  excerpt: Excerpt;
}

export interface ConsumerProbe {
  evidenceId: string;
  queue: string;
  handlerResolved: boolean;
  filtersJobName: boolean;
  reads: FieldRead[];
  excerpt: Excerpt;
}

export interface Probes {
  routes: RouteProbe[];
  producers: ProducerProbe[];
  consumers: ConsumerProbe[];
}

interface UseCall {
  receiver: string;
  file: string;
  line: number;
  children: string[];
  auth: Guard[];
}

const joinPath = (prefix: string | undefined, p: string) => ("/" + [prefix ?? "", p].join("/").split("/").filter(Boolean).join("/")).replace(/^\/$/, "/");

export function probe(snapshot: Snapshot, code: CodeIndex): Probes {
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const ev = (id: string) => evidence.get(id)!;
  // the call an evidence record spans, e.g. `router.get(...)` for a route
  const callAt = (e: Evidence, names: string[]) =>
    code.nodesAt(e.file, SyntaxKind.CallExpression, e.range.startLine, e.range.endLine).find((c): c is CallExpression => {
      const callee = Node.isCallExpression(c) ? c.getExpression() : undefined;
      return !!callee && Node.isPropertyAccessExpression(callee) && names.includes(callee.getName());
    });

  const routers = new Set(snapshot.files.flatMap((f) => [...f.routes.map((r) => r.router), ...f.mounts.flatMap((m) => [m.parent, m.router])]));
  const uses = useCalls(code, routers);
  const mounts = snapshot.files.flatMap((f) => f.mounts);

  const produces = snapshot.files.flatMap((f) => (f.queueOps ?? []).filter((o) => o.role === "produce" && o.queue?.value !== undefined));
  const consumes = snapshot.files.flatMap((f) => (f.queueOps ?? []).filter((o) => o.role === "consume" && o.queue?.value !== undefined));
  const workerOf = (op: (typeof consumes)[number]) => {
    const e = ev(op.evidenceId);
    const ne = code.nodesAt(e.file, SyntaxKind.NewExpression, e.range.startLine, e.range.endLine)[0];
    return ne && Node.isNewExpression(ne) ? { ne, fn: handlerFunction(ne.getArguments()[1], code) } : undefined;
  };

  // ── routes ──
  const routes: RouteProbe[] = [];
  for (const f of snapshot.files) {
    for (const r of f.routes) {
      const e = ev(r.evidenceId);
      const call = callAt(e, [r.method.toLowerCase(), "route"]);
      if (!call) continue;
      const args = call.getArguments();
      const first = args[0] && unwrap(args[0]);
      let handlerArgs = first && (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first) || Node.isTemplateExpression(first)) ? args.slice(1) : args;
      if (first && Node.isObjectLiteralExpression(first)) {
        // fastify.route({ ..., preHandler, handler })
        handlerArgs = ["onRequest", "preHandler", "handler"].flatMap((k): Node[] => {
          const p = first.getProperty(k);
          return p && Node.isPropertyAssignment(p) ? [p.getInitializerOrThrow()] : p && Node.isShorthandPropertyAssignment(p) ? [p.getNameNode()] : [];
        });
      }
      const handlerNode = handlerArgs.at(-1);
      const handler = handlerFunction(handlerNode, code);
      const ownGuards: Guard[] = handlerArgs
        .slice(0, -1)
        .filter((a) => AUTH_NAME.test(a.getText()))
        .map((a) => ({ where: "route-middleware" as const, text: a.getText().slice(0, 80), excerpt: code.excerpt(a, "middleware on the route") }));
      if (handler) ownGuards.push(...bodyGuards(handler, code, true));

      const chains = mountChains(r.router, e.file, e.range.startLine, r.path, uses, mounts, evidence);
      const sinks = handler ? flowSinks(handler, code, evidence, produces, consumes, workerOf) : [];
      routes.push({
        evidenceId: r.evidenceId,
        file: e.file,
        method: r.method,
        path: r.path,
        routeExcerpt: code.excerpt(call, "the route registration"),
        handlerExcerpt: handler && code.excerpt(handler, "the route handler"),
        chains,
        ownGuards,
        requestFields: handler ? requestFields(handler) : [],
        sinks,
      });
    }
  }

  // ── queues ──
  const producers: ProducerProbe[] = [];
  for (const op of produces) {
    const e = ev(op.evidenceId);
    const call = callAt(e, ["add"]);
    const payload = call?.getArguments()[1];
    producers.push({
      evidenceId: op.evidenceId,
      queue: op.queue!.value!,
      jobName: op.jobName?.value,
      keys: payload ? payloadKeys(payload) : null,
      excerpt: call ? code.excerpt(call, "the producer's add() call") : excerptOfEvidence(e),
    });
  }
  const consumers: ConsumerProbe[] = [];
  for (const op of consumes) {
    const e = ev(op.evidenceId);
    const w = workerOf(op);
    const filters = snapshot.files
      .find((f) => f.path === e.file)
      ?.queueOps?.some((o) => o.role === "unsupported" && (o.construct ?? "").startsWith(`job-name filtering in ${op.handler}`));
    consumers.push({
      evidenceId: op.evidenceId,
      queue: op.queue!.value!,
      handlerResolved: !!w?.fn,
      filtersJobName: !!filters,
      reads: w?.fn ? fieldReads(w.fn, new Map([[0, JOB_SPEC]]), code, 0, new Set()) : [],
      excerpt: w ? code.excerpt(w.ne, "the Worker construction") : excerptOfEvidence(e),
    });
  }
  return { routes, producers, consumers };
}

function excerptOfEvidence(e: Evidence): Excerpt {
  return { file: e.file, startLine: e.snippet.startLine, endLine: e.snippet.startLine + Math.max(0, e.snippet.lines.length - 1), truncated: false, why: e.detail, lines: e.snippet.lines };
}

/** The router key `.use()` is called on, in the http-routes extractor's "file#variable" form. */
function receiverKey(expr: Node, code: CodeIndex): string | undefined {
  const ident = rootIdentifier(expr);
  if (!ident) return undefined;
  const decl = resolveVariable(ident);
  return decl ? `${code.rel(decl)}#${decl.getName()}` : `${code.rel(ident)}#${ident.getText()}`;
}

/** Every `x.use(...)` / `x.register(...)` / `x.addHook(...)` with an auth-named argument or a router argument. */
function useCalls(code: CodeIndex, routers: Set<string>): UseCall[] {
  const out: UseCall[] = [];
  for (const sf of code.files()) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee) || !["use", "register", "addHook"].includes(callee.getName())) continue;
      const receiver = receiverKey(callee.getExpression(), code);
      if (!receiver || !routers.has(receiver)) continue;
      const children: string[] = [];
      const auth: Guard[] = [];
      for (const arg of call.getArguments()) {
        const key = Node.isIdentifier(arg) ? receiverKey(arg, code) : undefined;
        if (key && routers.has(key)) children.push(key);
        else if (AUTH_NAME.test(arg.getText())) auth.push({ where: "router-use", text: arg.getText().slice(0, 80), excerpt: code.excerpt(call, `${callee.getName()}() on the router`) });
      }
      if (children.length || auth.length) out.push({ receiver, file: code.rel(call), line: call.getStartLineNumber(), children, auth });
    }
  }
  return out;
}

/** Each chain of mounts from a router up to an unmounted one, with the guards that apply on it. */
function mountChains(router: string, file: string, line: number, path: string, uses: UseCall[], mounts: Snapshot["files"][number]["mounts"], evidence: Map<string, Evidence>): MountChain[] {
  // guards registered on `key` before (file, line): express applies use() to what is registered after it
  const before = (key: string, f: string, l: number) =>
    uses.filter((u) => u.receiver === key && u.auth.length && !u.children.length && (u.file !== f || u.line < l)).flatMap((u) => u.auth);
  const out: MountChain[] = [];
  const walk = (key: string, f: string, l: number, p: string, ids: string[], guards: Guard[], seen: Set<string>) => {
    const own = [...guards, ...before(key, f, l)];
    const parents = mounts.filter((m) => m.router === key && !seen.has(m.parent));
    if (!parents.length || seen.size > 6) {
      out.push({ fullPath: p, mountEvidenceIds: ids, guards: own });
      return;
    }
    for (const m of parents) {
      const e = evidence.get(m.evidenceId)!;
      // auth middleware in the mount call itself: parent.use("/x", requireAuth, router)
      const inCall = uses.filter((u) => u.receiver === m.parent && u.file === e.file && u.line === e.range.startLine && u.children.includes(key)).flatMap((u) => u.auth.map((g) => ({ ...g, where: "mount-use" as const })));
      walk(m.parent, e.file, e.range.startLine, joinPath(m.prefix, p), [...ids, m.evidenceId], [...own, ...inCall], new Set([...seen, key]));
    }
  };
  walk(router, file, line, joinPath(undefined, path), [], [], new Set());
  return out.slice(0, 8);
}

/** Auth signals in a handler body; with `hop`, also in a repo function the handler passes the request to. */
function bodyGuards(fn: FnLike, code: CodeIndex, hop: boolean): Guard[] {
  const body = fn.getBody();
  const req = fn.getParameters()[0]?.getName();
  if (!body) return [];
  const hits: Node[] = [];
  for (const id of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const parent = id.getParent();
    const isReqProp = req && parent && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id && parent.getExpression().getText() === req && AUTH_REQUEST_PROPS.has(id.getText());
    if (AUTH_NAME.test(id.getText()) || isReqProp) hits.push(id);
  }
  for (const s of body.getDescendantsOfKind(SyntaxKind.StringLiteral)) if (AUTH_HEADER.test(s.getLiteralValue())) hits.push(s);
  if (hop && req) {
    for (const call of within(body, SyntaxKind.CallExpression)) {
      if (!call.getArguments().some((a) => a.getText() === req)) continue;
      const callee = functionOf(call.getExpression(), code);
      if (callee && callee !== fn && bodyGuards(callee, code, false).length) hits.push(call);
    }
  }
  const first = hits.sort((a, b) => a.getStart() - b.getStart())[0];
  if (!first) return [];
  const stmt = first.getFirstAncestor((a) => Node.isStatement(a) && a.getParent() === body) ?? first;
  return [{ where: "handler-body", text: first.getText().slice(0, 80), excerpt: code.excerpt(stmt, "an auth signal in the handler") }];
}

/** Request values a handler reads: `req.body.url` → "body.url", `const { q } = req.query` → "query.q". */
function requestFields(fn: FnLike): string[] {
  const req = fn.getParameters()[0]?.getName();
  const body = fn.getBody();
  if (!req || !body) return [];
  const out = new Set<string>();
  for (const pa of within(body, SyntaxKind.PropertyAccessExpression)) {
    const c = chainOf(pa);
    if (c?.root.getText() === req && c.props.length >= 2 && ["body", "query", "params"].includes(c.props[0]!)) out.add(c.props.slice(0, 2).join("."));
  }
  for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const name = decl.getNameNode();
    const init = decl.getInitializer();
    const c = init && chainOf(init);
    if (!Node.isObjectBindingPattern(name) || c?.root.getText() !== req || c.props.length !== 1 || !["body", "query", "params"].includes(c.props[0]!)) continue;
    for (const el of name.getElements()) out.add(`${c.props[0]}.${el.getPropertyNameNode()?.getText() ?? el.getName()}`);
  }
  return [...out].sort();
}

/** The callee of an outbound HTTP call (global fetch, axios, got, http.request, …), else undefined. */
function outboundCallee(call: CallExpression, code: CodeIndex): string | undefined {
  const callee = call.getExpression();
  if (Node.isIdentifier(callee)) {
    if (callee.getText() === "fetch") return (callee.getSymbol()?.getDeclarations() ?? []).some((d) => code.inRepo(d)) ? undefined : "fetch";
    const origin = importOrigin(callee);
    return origin && OUTBOUND_MODULES.has(origin.module) ? `${origin.module}${origin.importedName === "default" ? "" : `.${origin.importedName}`}` : undefined;
  }
  if (Node.isPropertyAccessExpression(callee) && OUTBOUND_METHODS.has(callee.getName())) {
    const base = callee.getExpression();
    const origin = Node.isIdentifier(base) ? importOrigin(base) : undefined;
    return origin && OUTBOUND_MODULES.has(origin.module) ? `${callee.getText()}` : undefined;
  }
  return undefined;
}

/** Outbound calls whose first argument carries a request value, following calls and one queue. */
function flowSinks(
  handler: FnLike,
  code: CodeIndex,
  evidence: Map<string, Evidence>,
  produces: NonNullable<Snapshot["files"][number]["queueOps"]>,
  consumes: NonNullable<Snapshot["files"][number]["queueOps"]>,
  workerOf: (op: NonNullable<Snapshot["files"][number]["queueOps"]>[number]) => { ne: Node; fn: FnLike | undefined } | undefined,
): Sink[] {
  const sinks: Sink[] = [];
  const visit = (fn: FnLike, params: Map<number, Spec>, hops: number, trail: Excerpt[], seen: Set<Node>, queue: Sink["queue"] | undefined) => {
    seen.add(fn);
    const taint = new FunctionTaint(fn, params);
    for (const call of within(fn.getBody(), SyntaxKind.CallExpression)) {
      const args = call.getArguments();
      const outbound = outboundCallee(call, code);
      if (outbound) {
        if (args[0] && taint.isTainted(args[0])) sinks.push({ callee: outbound, excerpt: code.excerpt(call, "the outbound request"), trail, ...(queue && { queue }) });
        continue;
      }
      const produce = !queue && produces.find((o) => {
        const e = evidence.get(o.evidenceId)!;
        return e.file === code.rel(call) && e.range.startLine === call.getStartLineNumber() && e.range.endLine === call.getEndLineNumber();
      });
      if (produce && args[1]) {
        const spec = taint.specOf(args[1]);
        if (!spec.length) continue;
        const fields = isWhole(spec) ? ["*"] : [...new Set(spec.map((p) => p[0]!))];
        for (const c of consumes.filter((o) => o.queue!.value === produce.queue!.value)) {
          const w = workerOf(c);
          if (!w?.fn || seen.has(w.fn)) continue;
          const q = { name: produce.queue!.value!, produceEvidenceId: produce.evidenceId, consumeEvidenceId: c.evidenceId, fields };
          visit(w.fn, new Map([[0, spec.map((p) => ["data", ...p])]]), MAX_HOPS, [...trail, code.excerpt(call, "the request value is added to the queue"), code.excerpt(w.ne, "the queue's Worker")], new Set(seen), q);
        }
        continue;
      }
      if (hops <= 0) continue;
      const callee = functionOf(call.getExpression(), code);
      if (!callee || seen.has(callee)) continue;
      const next = new Map<number, Spec>();
      args.forEach((a, i) => {
        const s = taint.specOf(a);
        if (s.length) next.set(i, s);
      });
      if (next.size) visit(callee, next, hops - 1, [...trail, code.excerpt(call, "the request value is passed on")], seen, queue);
    }
  };
  visit(handler, new Map([[0, REQUEST_SPEC]]), MAX_HOPS, [], new Set(), undefined);
  return sinks;
}

/** Payload keys from the add() argument's type; null when the type says nothing (any, unknown, not an object). */
function payloadKeys(arg: Node): string[] | null {
  const type = arg.getType();
  const members = type.isUnion() ? type.getUnionTypes() : [type];
  const keys = new Set<string>();
  for (const t of members) {
    if (t.isAny() || t.isUnknown() || !t.isObject()) return null;
    if (t.getStringIndexType()) return null; // Record<string, …>: any key may be sent
    for (const p of t.getProperties()) keys.add(p.getName());
  }
  return [...keys].sort();
}

/**
 * Marks "this is job.data" in a spec: the job is [["data", DATA]], `const d = job.data` is [[DATA]].
 * A field of the data is not itself a spec, so `const url = job.data.url; url.trim()` is one read.
 */
const DATA = "#data";
const dataBase = (spec: Spec) => spec.filter((p) => p.at(-1) === DATA).map((p) => p.slice(0, -1));
export const JOB_SPEC: Spec = [["data", DATA]];

/** `job.data.<field>` reads in a processor (and in functions it passes the job or its data to). */
function fieldReads(fn: FnLike, params: Map<number, Spec>, code: CodeIndex, hops: number, seen: Set<Node>): FieldRead[] {
  seen.add(fn);
  const taint = new FunctionTaint(fn, params);
  const body = fn.getBody();
  if (!body) return [];
  const reads: FieldRead[] = [];
  const guardedRead = (node: Node) => {
    const p = node.getParent();
    if (!p) return false;
    if (Node.isBinaryExpression(p) && p.getLeft() === node && ["??", "||"].includes(p.getOperatorToken().getText())) return true;
    if (Node.isPrefixUnaryExpression(p) && p.getOperatorToken() === SyntaxKind.ExclamationToken) return true;
    if (Node.isTypeOfExpression(p)) return true;
    if (Node.isIfStatement(p) && p.getExpression() === node) return true;
    return Node.isConditionalExpression(p) && p.getCondition() === node;
  };
  for (const pa of [...within(body, SyntaxKind.PropertyAccessExpression), ...within(body, SyntaxKind.ElementAccessExpression)]) {
    const parent = pa.getParent();
    if (parent && (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === pa) continue; // outermost chains only
    const c = chainOf(pa);
    const base = c && taint.names.get(c.root.getText());
    if (!c || !base) continue;
    for (const path of dataBase(base)) {
      if (c.props.length <= path.length || !path.every((p, i) => c.props[i] === p)) continue;
      // the `data.field` part of a longer chain such as `data.field.trim`
      let node: Node = pa;
      for (let extra = c.props.length - path.length - 1; extra > 0; extra--) node = (node as Node & { getExpression(): Node }).getExpression();
      reads.push({ field: c.props[path.length]!, guarded: guardedRead(node), excerpt: code.excerpt(pa, `the processor reads data.${c.props[path.length]}`) });
    }
  }
  // const { a, b = 1 } = job.data
  for (const decl of body.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const name = decl.getNameNode();
    const init = decl.getInitializer();
    if (!Node.isObjectBindingPattern(name) || !init || !dataBase(taint.specOf(init)).some((p) => p.length === 0)) continue;
    for (const el of name.getElements()) {
      if (el.getDotDotDotToken()) continue;
      const field = el.getPropertyNameNode()?.getText() ?? el.getName();
      reads.push({ field, guarded: !!el.getInitializer(), excerpt: code.excerpt(decl, "the processor destructures job.data") });
    }
  }
  if (hops < MAX_HOPS) {
    for (const call of within(body, SyntaxKind.CallExpression)) {
      const callee = functionOf(call.getExpression(), code);
      if (!callee || seen.has(callee)) continue;
      const next = new Map<number, Spec>();
      call.getArguments().forEach((a, i) => {
        const s = taint.specOf(a).filter((p) => p.at(-1) === DATA);
        if (s.length) next.set(i, s);
      });
      if (next.size) reads.push(...fieldReads(callee, next, code, hops + 1, seen));
    }
  }
  return reads;
}
