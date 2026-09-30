// BullMQ queues (detector bullmq-queues@0.1, decision 035). Facts only; edges come later from
// aggregation, through one broker node per queue name (the Redis queue model: produces → queue
// → consumes). Nothing is silently dropped: a queue name that isn't static, and BullMQ constructs
// this detector doesn't model, are recorded as facts and become warnings.
import { Node, SyntaxKind, type ArrowFunction, type FunctionDeclaration, type FunctionExpression, type SourceFile } from "ts-morph";
import type { QueueOpFact, Resolution } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { calleeOrigin, importOrigin, resolveVariable, rootIdentifier } from "./provenance.ts";
import { redisConnectionOf } from "./redis.ts";
import { resolveStatic } from "./values.ts";

export const BULLMQ_DETECTOR = "bullmq-queues@0.1";
const MODULE = "bullmq";
const PRODUCE_METHODS = new Set(["add", "addBulk"]);
// confidence numbers per the analyzer's scheme; the label is what the UI shows
const CONFIDENCE: Record<Resolution, number> = { proven: 0.9, "resolved-default": 0.7, dynamic: 0.5 };

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

/** The `new Queue(...)` a receiver expression refers to, following variables and imports. */
function queueDefinitionOf(receiver: Node): Node | undefined {
  const ident = rootIdentifier(receiver);
  const decl = ident && resolveVariable(ident);
  let init = decl?.getInitializer();
  while (init && (Node.isAwaitExpression(init) || Node.isParenthesizedExpression(init) || Node.isAsExpression(init))) init = init.getExpression();
  return init && bullmqConstructor(init) === "Queue" ? init : undefined;
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

type FnLike = FunctionDeclaration | ArrowFunction | FunctionExpression;
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
      const handler = !handlerArg ? "<none>" : Node.isIdentifier(handlerArg) ? handlerArg.getText() : Node.isArrowFunction(handlerArg) || Node.isFunctionExpression(handlerArg) ? "<inline function>" : handlerArg.getText();
      facts.push({
        lib: "bullmq", role: "consume", queue: { raw: q.raw, value: q.value }, resolution: q.resolution, handler, connection: connectionOption(args[2]),
        evidenceId: evidence(ne, q.resolution, `new Worker(${q.raw}, ${handler}) consumes queue ${nameLabel(q)}`, enclosing(ne)),
      });
      const filter = readsJobName(handlerFunction(handlerArg));
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
    const definition = queueDefinitionOf(receiver);
    const method = callee.getName();
    const jobArg = call.getArguments()[0];
    const job = method === "addBulk" ? { raw: "<bulk>", value: undefined } : jobArg ? { raw: jobArg.getText(), value: resolveStatic(jobArg).value } : undefined;
    const jobLabel = job?.value ?? job?.raw ?? "";
    if (definition && Node.isNewExpression(definition)) {
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
