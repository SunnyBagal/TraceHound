// BullMQ queues (detector bullmq-queues@0.2, decisions 035 and 042). Facts only; edges come later
// from aggregation, through one broker node per queue name (the Redis queue model: produces →
// queue → consumes). Nothing is silently dropped: a queue name that isn't static, and BullMQ
// constructs this detector doesn't model, are recorded as facts and become warnings.
// 0.2: a producer's queue is also followed through a factory's return value and through ONE
// function parameter to that function's call sites (dependency injection).
import {
  Node,
  SyntaxKind,
  type ArrowFunction,
  type CallExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  type NewExpression,
  type ParameterDeclaration,
  type SourceFile,
  type Symbol as MorphSymbol,
} from "ts-morph";
import type { QueueOpFact, Resolution } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { calleeOrigin, importOrigin, rootIdentifier } from "./provenance.ts";
import { redisConnectionOf } from "./redis.ts";
import { resolveStatic } from "./values.ts";

export const BULLMQ_DETECTOR = "bullmq-queues@0.2";
const MODULE = "bullmq";
const PRODUCE_METHODS = new Set(["add", "addBulk"]);
// confidence numbers per the analyzer's scheme; the label is what the UI shows
const CONFIDENCE: Record<Resolution, number> = { proven: 0.9, "resolved-default": 0.7, dynamic: 0.5 };
const STRENGTH: Resolution[] = ["dynamic", "resolved-default", "proven"];
const weaker = (a: Resolution, b: Resolution): Resolution => STRENGTH[Math.min(STRENGTH.indexOf(a), STRENGTH.indexOf(b))]!;
/** Bounds on following a queue: variable/factory steps, and parameter hops when only probing for a warning. */
const MAX_DEPTH = 6;
const PROBE_HOPS = 3;

interface QueueName {
  raw: string;
  value?: string;
  resolution: Resolution;
}

/** Literal → proven; a const (or `?? "default"`) resolved statically → resolved-default; built at runtime → dynamic. */
export function queueName(arg: Node | undefined): QueueName {
  if (!arg) return { raw: "", resolution: "dynamic" };
  const raw = arg.getText();
  if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) return { raw, value: arg.getLiteralValue(), resolution: "proven" };
  const v = resolveStatic(arg);
  if (v.value !== undefined && !v.value.includes("*") && v.basis !== "dynamic") return { raw, value: v.value, resolution: "resolved-default" };
  // a template keeps its pattern ("emails-*"); an env var or anything else has no static value
  return { raw, value: v.value, resolution: "dynamic" };
}

/** `new X(...)` whose X is imported from "bullmq": the imported name, else undefined. */
function bullmqConstructor(node: Node): string | undefined {
  if (!Node.isNewExpression(node)) return undefined;
  const origin = calleeOrigin(node.getExpression());
  return origin?.module === MODULE ? origin.name : undefined;
}

function unwrap(node: Node | undefined): Node | undefined {
  while (node && (Node.isAwaitExpression(node) || Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isNonNullExpression(node) || Node.isSatisfiesExpression(node)))
    node = node.getExpression();
  return node;
}

type FnLike = FunctionDeclaration | ArrowFunction | FunctionExpression;
const isFnLike = (node: Node | undefined): node is FnLike => !!node && (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node));
const enclosingFunction = (node: Node) => node.getFirstAncestor((a) => isFnLike(a) || Node.isMethodDeclaration(a) || Node.isConstructorDeclaration(a) || Node.isGetAccessorDeclaration(a));

/** The function an identifier names: a declaration, or a variable holding an arrow/function expression. */
function functionOf(ident: Node | undefined): FnLike | undefined {
  if (!ident || !Node.isIdentifier(ident)) return undefined;
  let symbol = ident.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (Node.isFunctionDeclaration(decl)) return decl;
    const init = Node.isVariableDeclaration(decl) ? decl.getInitializer() : undefined;
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
  }
  return undefined;
}

/** A property's value in an object literal: the initializer, or the shorthand property itself. */
function propertyValue(object: Node | undefined, name: string): Node | undefined {
  if (!object || !Node.isObjectLiteralExpression(object)) return undefined;
  const prop = object.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) return prop.getInitializer();
  return prop && Node.isShorthandPropertyAssignment(prop) ? prop : undefined;
}

/**
 * The `new Queue(...)` an expression refers to WITHOUT crossing a parameter: through variables,
 * imports and re-exports, and through a factory function's return value (returned directly, or as
 * a property of a returned object literal that the caller destructures). Every return of the
 * factory must lead to the same construction.
 */
function queueDefinitionOf(node: Node | undefined, depth = 0): NewExpression | undefined {
  node = unwrap(node);
  if (!node || depth > MAX_DEPTH) return undefined;
  if (Node.isNewExpression(node)) return bullmqConstructor(node) === "Queue" ? node : undefined;
  if (Node.isCallExpression(node)) return factoryReturn(node, undefined, depth + 1);
  if (Node.isShorthandPropertyAssignment(node)) return fromSymbol(node.getValueSymbol(), depth);
  return Node.isIdentifier(node) ? fromSymbol(node.getSymbol(), depth) : undefined;
}

function fromSymbol(symbol: MorphSymbol | undefined, depth: number): NewExpression | undefined {
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (Node.isVariableDeclaration(decl)) return queueDefinitionOf(decl.getInitializer(), depth + 1);
    if (Node.isBindingElement(decl)) {
      // const { emails } = createQueues()
      const pattern = decl.getParent();
      const owner = pattern.getParent();
      const init = Node.isObjectBindingPattern(pattern) && Node.isVariableDeclaration(owner) ? unwrap(owner.getInitializer()) : undefined;
      if (init && Node.isCallExpression(init)) return factoryReturn(init, decl.getPropertyNameNode()?.getText() ?? decl.getName(), depth + 1);
    }
  }
  return undefined;
}

function factoryReturn(call: CallExpression, prop: string | undefined, depth: number): NewExpression | undefined {
  const fn = functionOf(call.getExpression());
  if (!fn || depth > MAX_DEPTH) return undefined;
  const body = fn.getBody();
  const returned = body && !Node.isBlock(body) ? [body] : fn.getDescendantsOfKind(SyntaxKind.ReturnStatement).filter((r) => enclosingFunction(r) === fn).map((r) => r.getExpression());
  if (returned.length === 0) return undefined;
  const defs = returned.map((expr) => queueDefinitionOf(prop === undefined ? expr : propertyValue(unwrap(expr), prop), depth));
  return defs.every((d) => d !== undefined && d === defs[0]) ? defs[0] : undefined;
}

/** A value that is a function parameter, or one property of a parameter (`deps.q`, `{ q }`, `const { q } = deps`). */
interface ParamSource {
  param: ParameterDeclaration;
  prop?: string;
}

function paramSourceOf(expr: Node | undefined, depth = 0): ParamSource | undefined {
  expr = unwrap(expr);
  if (!expr || depth > MAX_DEPTH) return undefined;
  if (Node.isPropertyAccessExpression(expr)) {
    const base = paramSourceOf(expr.getExpression(), depth + 1);
    return base && base.prop === undefined ? { param: base.param, prop: expr.getName() } : undefined;
  }
  if (!Node.isIdentifier(expr)) return undefined;
  for (const decl of expr.getSymbol()?.getDeclarations() ?? []) {
    if (Node.isParameterDeclaration(decl)) return { param: decl };
    if (Node.isVariableDeclaration(decl)) return paramSourceOf(decl.getInitializer(), depth + 1); // const q = deps.q
    if (Node.isBindingElement(decl)) {
      const pattern = decl.getParent();
      if (!Node.isObjectBindingPattern(pattern)) continue;
      const prop = decl.getPropertyNameNode()?.getText() ?? decl.getName();
      const owner = pattern.getParent();
      if (Node.isParameterDeclaration(owner)) return { param: owner, prop }; // function f({ q })
      const base = Node.isVariableDeclaration(owner) ? paramSourceOf(owner.getInitializer(), depth + 1) : undefined; // const { q } = deps
      if (base && base.prop === undefined) return { param: base.param, prop };
    }
  }
  return undefined;
}

interface Wiring {
  fnName: string;
  paramLabel: string; // "deps.mailer", "mailer", "{ mailer }"
  /** Every call of the function, with what it passes for the parameter (or its property). */
  sites: { call: CallExpression; value: Node | undefined }[];
}

/** The named function a parameter belongs to and its call sites across the project. */
function wiringOf(source: ParamSource): Wiring | undefined {
  const fn = source.param.getParent();
  if (!isFnLike(fn)) return undefined;
  const owner = fn.getParent();
  const nameNode = Node.isFunctionDeclaration(fn) ? fn.getNameNode() : Node.isVariableDeclaration(owner) ? owner.getNameNode() : undefined;
  if (!nameNode || !Node.isIdentifier(nameNode)) return undefined;
  const index = fn.getParameters().indexOf(source.param);
  const calls: CallExpression[] = [];
  for (const ref of nameNode.findReferencesAsNodes()) {
    const parent = ref.getParent();
    if (parent && Node.isCallExpression(parent) && parent.getExpression().compilerNode === ref.compilerNode) calls.push(parent);
  }
  calls.sort((a, b) => a.getSourceFile().getFilePath().localeCompare(b.getSourceFile().getFilePath()) || a.getStart() - b.getStart());
  const paramName = Node.isIdentifier(source.param.getNameNode()) ? source.param.getName() : undefined;
  return {
    fnName: nameNode.getText(),
    paramLabel: source.prop === undefined ? (paramName ?? "<destructured>") : paramName ? `${paramName}.${source.prop}` : `{ ${source.prop} }`,
    sites: calls.map((call) => {
      const arg = unwrap(call.getArguments()[index]);
      return { call, value: source.prop === undefined ? arg : propertyValue(arg, source.prop) };
    }),
  };
}

/** Probe only (never an edge): does a value reach a `new Queue` within `hops` parameter hops? */
function reachesQueue(value: Node | undefined, hops: number): boolean {
  if (queueDefinitionOf(value)) return true;
  const source = hops > 0 && value && !Node.isShorthandPropertyAssignment(value) ? paramSourceOf(value) : undefined;
  const wiring = source && wiringOf(source);
  return !!wiring && wiring.sites.some((s) => reachesQueue(s.value, hops - 1));
}

/** An inline processor that does nothing but call one named function: that function's identifier. */
function wrappedHandler(fn: Node | undefined): Identifier | undefined {
  if (!fn || !(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) return undefined;
  const body = fn.getBody();
  let expr: Node | undefined = body;
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const only = statements.length === 1 ? statements[0]! : undefined;
    expr = only && (Node.isExpressionStatement(only) || Node.isReturnStatement(only)) ? only.getExpression() : undefined;
  }
  expr = unwrap(expr);
  const callee = expr && Node.isCallExpression(expr) ? expr.getExpression() : undefined;
  return callee && Node.isIdentifier(callee) ? callee : undefined;
}

/** A receiver declared with type `Queue` from bullmq but no resolvable `new Queue(...)` (e.g. a parameter). */
function typedAsBullmqQueue(receiver: Node): boolean {
  const ident = rootIdentifier(receiver);
  for (const decl of ident?.getSymbol()?.getDeclarations() ?? []) {
    if (!(Node.isParameterDeclaration(decl) || Node.isVariableDeclaration(decl) || Node.isPropertyDeclaration(decl))) continue;
    const typeNode = decl.getTypeNode();
    if (typeNode && Node.isTypeReference(typeNode)) {
      const name = typeNode.getTypeName();
      if (Node.isIdentifier(name) && importOrigin(name)?.module === MODULE && importOrigin(name)?.importedName === "Queue") return true;
    }
  }
  return false;
}

function handlerFunction(arg: Node | undefined): FnLike | undefined {
  if (!arg) return undefined;
  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) return arg;
  if (!Node.isIdentifier(arg)) return undefined;
  let symbol = arg.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol();
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (Node.isFunctionDeclaration(decl)) return decl;
    const init = Node.isVariableDeclaration(decl) ? decl.getInitializer() : undefined;
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
  }
  return undefined;
}

/** `job.name` read inside the processor: the handler branches on job names, which isn't modeled. */
function readsJobName(fn: FnLike | undefined): Node | undefined {
  const job = fn?.getParameters()[0]?.getName();
  if (!fn || !job) return undefined;
  return fn.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((p) => p.getName() === "name" && p.getExpression().getText() === job);
}

const connectionOption = (options: Node | undefined): string | undefined => {
  if (!options || !Node.isObjectLiteralExpression(options)) return undefined;
  const prop = options.getProperty("connection");
  const value = prop && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return value ? redisConnectionOf(value) : undefined;
};

const where = (node: Node, file: string) => `${file}:${node.getStartLineNumber()}`;
const nameLabel = (q: QueueName) => (q.value !== undefined ? `"${q.value}"` : `<not static: ${q.raw || "missing"}>`);

export function extractBullmq(sf: SourceFile, ctx: ExtractContext): QueueOpFact[] {
  const file = ctx.rel(sf.getFilePath());
  const facts: QueueOpFact[] = [];
  const evidence = (node: Node, resolution: Resolution, detail: string, symbol?: string) =>
    ctx.evidence.addNode(node, file, { extractor: "bullmq-queues", confidence: CONFIDENCE[resolution], resolution, detail: `${detail} (${BULLMQ_DETECTOR})`, symbol });
  const enclosing = (node: Node) =>
    node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName() ?? node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();

  for (const ne of sf.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const ctor = bullmqConstructor(ne);
    if (!ctor) continue;
    const args = ne.getArguments();
    if (ctor === "Queue") {
      const q = queueName(args[0]);
      const variable = ne.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
      facts.push({
        lib: "bullmq", role: "define", queue: { raw: q.raw, value: q.value }, resolution: q.resolution, variable, connection: connectionOption(args[1]),
        evidenceId: evidence(ne, q.resolution, `new Queue(${q.raw}) defines queue ${nameLabel(q)}${variable ? ` as ${variable}` : ""}`, variable),
      });
    } else if (ctor === "Worker") {
      const q = queueName(args[0]);
      const handlerArg = args[1];
      const wrapped = wrappedHandler(handlerArg);
      const handler = !handlerArg ? "<none>" : Node.isIdentifier(handlerArg) ? handlerArg.getText() : wrapped ? wrapped.getText() : Node.isArrowFunction(handlerArg) || Node.isFunctionExpression(handlerArg) ? "<inline function>" : handlerArg.getText();
      facts.push({
        lib: "bullmq", role: "consume", queue: { raw: q.raw, value: q.value }, resolution: q.resolution, handler, connection: connectionOption(args[2]),
        evidenceId: evidence(ne, q.resolution, `new Worker(${q.raw}, ${handler}) consumes queue ${nameLabel(q)}${wrapped ? `; the processor is an inline function that only calls ${handler}` : ""}`, enclosing(ne)),
      });
      // job-name filtering in the inline processor, or in the one function it hands its job to
      const inline = handlerFunction(handlerArg);
      const passesJob = wrapped && inline && Node.isCallExpression(wrapped.getParent()) && (wrapped.getParent() as CallExpression).getArguments()[0]?.getText() === inline.getParameters()[0]?.getName();
      const filter = readsJobName(inline) ?? (passesJob ? readsJobName(handlerFunction(wrapped)) : undefined);
      if (filter) {
        facts.push({
          lib: "bullmq", role: "unsupported", resolution: "dynamic", construct: `job-name filtering in ${handler} (${filter.getText()})`,
          evidenceId: evidence(filter, "dynamic", `processor ${handler} reads ${filter.getText()}: job-name filtering is not modeled`, handler),
        });
      }
    } else {
      // QueueEvents, FlowProducer, QueueScheduler, Job, …: recorded, not modeled
      facts.push({
        lib: "bullmq", role: "unsupported", resolution: "dynamic", construct: `new ${ctor}(…)`,
        evidenceId: evidence(ne, "dynamic", `new ${ctor}(${args[0]?.getText() ?? ""}) is not modeled`, enclosing(ne)),
      });
    }
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || !PRODUCE_METHODS.has(callee.getName())) continue;
    const receiver = callee.getExpression();
    const definition = queueDefinitionOf(rootIdentifier(receiver));
    const method = callee.getName();
    const jobArg = call.getArguments()[0];
    const job = method === "addBulk" ? { raw: "<bulk>", value: undefined } : jobArg ? { raw: jobArg.getText(), value: resolveStatic(jobArg).value } : undefined;
    const jobLabel = job?.value ?? job?.raw ?? "";
    const call_ = `${receiver.getText()}.${method}(${jobLabel ? JSON.stringify(jobLabel) : ""})`;
    const source = definition ? undefined : paramSourceOf(receiver);
    const wiring = source && wiringOf(source);
    if (wiring) {
      // One parameter hop (decision 042): the queue is whatever the function's call sites pass in.
      const wired = wiring.sites.map((s) => ({ ...s, def: queueDefinitionOf(s.value) }));
      const real = wired.filter((s) => s.def);
      const defs = [...new Set(real.map((s) => s.def!))];
      const addAt = where(call, file);
      const fileOf = (n: Node) => ctx.rel(n.getSourceFile().getFilePath());
      if (defs.length === 0) {
        // nothing within one hop. Say so only when it is known to be a queue: a bullmq Queue type, or a Queue further up the call chain
        const deeper = wired.some((s) => reachesQueue(s.value, PROBE_HOPS - 1));
        if (deeper || typedAsBullmqQueue(receiver)) {
          const construct = `${receiver.getText()}.${method}(…) on parameter ${wiring.paramLabel} of ${wiring.fnName}, ${deeper ? "which reaches a Queue only through more than one parameter hop (one is followed)" : `which no call site of ${wiring.fnName} wires to a Queue`}`;
          facts.push({ lib: "bullmq", role: "produce", resolution: "dynamic", jobName: job, variable: receiver.getText(), construct, evidenceId: evidence(call, "dynamic", construct, enclosing(call)) });
        }
        continue;
      }
      const others = wired.filter((s) => !s.def).map((s) => where(s.call, fileOf(s.call)));
      const names = defs.map((d) => nameLabel(queueName(d.getArguments()[0])));
      for (const def of defs) {
        const q = queueName(def.getArguments()[0]);
        // through a parameter the add site doesn't name its queue: never stronger than resolved-default; several queues → dynamic
        const resolution = defs.length > 1 ? "dynamic" : weaker(q.resolution, "resolved-default");
        const definedAt = where(def, fileOf(def));
        const sites = real.filter((s) => s.def === def);
        const wiredAt = sites.map((s) => where(s.call, fileOf(s.call)));
        const tail =
          defs.length > 1
            ? `; one of ${defs.length} queues wired into ${wiring.fnName} (${names.join(", ")}); which one a call reaches is decided at runtime`
            : others.length
              ? `; ${others.length} other call site${others.length === 1 ? " passes" : "s pass"} something that is not a BullMQ Queue (${others.join(", ")})`
              : "";
        const support = [
          ...sites.map((s) =>
            ctx.evidence.addNode(s.call, fileOf(s.call), {
              extractor: "bullmq-queues", confidence: CONFIDENCE[resolution], resolution, symbol: wiring.fnName,
              detail: `${wiring.fnName}(…) passes ${(Node.isShorthandPropertyAssignment(s.value!) ? s.value!.getName() : s.value!.getText()).slice(0, 60)} as ${wiring.paramLabel}: the Queue ${nameLabel(q)} defined at ${definedAt}, which ${addAt} adds to (${BULLMQ_DETECTOR})`,
            }),
          ),
          ctx.evidence.addNode(def, fileOf(def), {
            extractor: "bullmq-queues", confidence: CONFIDENCE[resolution], resolution,
            detail: `new Queue(${q.raw}) is the queue passed to ${wiring.fnName} at ${wiredAt.join(", ")} and added to at ${addAt} (${BULLMQ_DETECTOR})`,
          }),
        ];
        facts.push({
          lib: "bullmq", role: "produce", queue: { raw: q.raw, value: q.value }, resolution, jobName: job, variable: receiver.getText(), definedAt, wiredAt, supportEvidenceIds: support,
          connection: connectionOption(def.getArguments()[1]),
          evidenceId: evidence(call, resolution, `${call_} produces job ${JSON.stringify(jobLabel)} on queue ${nameLabel(q)}: ${receiver.getText()} is parameter ${wiring.paramLabel} of ${wiring.fnName}, wired at ${wiredAt.join(", ")} to the Queue defined at ${definedAt}${tail}`, enclosing(call)),
        });
      }
    } else if (definition && Node.isNewExpression(definition)) {
      const q = queueName(definition.getArguments()[0]);
      const definedAt = where(definition, ctx.rel(definition.getSourceFile().getFilePath()));
      facts.push({
        lib: "bullmq", role: "produce", queue: { raw: q.raw, value: q.value }, resolution: q.resolution, jobName: job, variable: receiver.getText(), definedAt,
        connection: connectionOption(definition.getArguments()[1]),
        evidenceId: evidence(call, q.resolution, `${receiver.getText()}.${method}(${jobLabel ? JSON.stringify(jobLabel) : ""}) produces job ${JSON.stringify(jobLabel)} on queue ${nameLabel(q)} (defined at ${definedAt})`, enclosing(call)),
      });
    } else if (typedAsBullmqQueue(receiver)) {
      facts.push({
        lib: "bullmq", role: "produce", resolution: "dynamic", jobName: job, variable: receiver.getText(),
        evidenceId: evidence(call, "dynamic", `${receiver.getText()}.${method}(${jobLabel ? JSON.stringify(jobLabel) : ""}) on a bullmq Queue whose definition isn't resolvable here`, enclosing(call)),
      });
    }
  }
  return facts;
}
