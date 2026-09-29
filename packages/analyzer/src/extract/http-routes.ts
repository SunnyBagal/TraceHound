import { Node, SyntaxKind, type CallExpression, type SourceFile } from "ts-morph";
import type { FileFacts, RouteFact } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { calleeOrigin, literalValue, resolveVariable, rootIdentifier } from "./provenance.ts";

const FRAMEWORKS = new Set(["express", "fastify"]);
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);
// Parameter/receiver types we accept when the variable can't be traced to a factory call.
const FRAMEWORK_TYPE = /\b(FastifyInstance|Router|Express|Application)\b/;

type Receiver = { key: string; framework: string; confidence: number };

export interface HttpFacts {
  routes: RouteFact[];
  mounts: FileFacts["mounts"];
  listens: FileFacts["listens"];
}

/**
 * Resolve the object a route is registered on to a router/app created by an express/fastify
 * factory (`express()`, `Router()`, `express.Router()`, `Fastify()`), possibly in another file.
 */
function resolveReceiver(expr: Node, ctx: ExtractContext): Receiver | undefined {
  const ident = rootIdentifier(expr);
  if (!ident) return undefined;
  const decl = resolveVariable(ident);
  const init = decl?.getInitializer();
  if (decl && init && Node.isCallExpression(init)) {
    const origin = calleeOrigin(init.getExpression());
    if (origin && FRAMEWORKS.has(origin.module)) {
      return { key: `${ctx.rel(decl.getSourceFile().getFilePath())}#${decl.getName()}`, framework: origin.module, confidence: 1 };
    }
  }
  const typeText = ident.getType().getText(ident);
  if (FRAMEWORK_TYPE.test(typeText)) {
    const framework = typeText.includes("Fastify") ? "fastify" : "express";
    return { key: `${ctx.rel(ident.getSourceFile().getFilePath())}#${ident.getText()}`, framework, confidence: 0.9 };
  }
  return undefined;
}

function handlerLabel(arg: Node): string {
  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) return "<inline handler>";
  const text = arg.getText().replace(/\s+/g, " ");
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

export function extractHttp(sf: SourceFile, ctx: ExtractContext): HttpFacts {
  const file = ctx.rel(sf.getFilePath());
  const facts: HttpFacts = { routes: [], mounts: [], listens: [] };

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const method = callee.getName();
    const target = callee.getExpression();

    // router.route("/x").get(handler)
    if (ROUTE_METHODS.has(method) && Node.isCallExpression(target) && isRouteChain(target)) {
      const chainCallee = target.getExpression() as Node;
      const receiver = Node.isPropertyAccessExpression(chainCallee) ? resolveReceiver(chainCallee.getExpression(), ctx) : undefined;
      const pathArg = target.getArguments()[0];
      if (receiver && pathArg) addRoute(call, method, pathArg, call.getArguments(), receiver);
      continue;
    }

    const receiver = ROUTE_METHODS.has(method) || method === "use" || method === "listen" || method === "route" || method === "register"
      ? resolveReceiver(target, ctx)
      : undefined;
    if (!receiver) continue;
    const args = call.getArguments();

    if (ROUTE_METHODS.has(method) && args[0] && literalValue(args[0]) !== undefined && args.length >= 2) {
      addRoute(call, method, args[0], args.slice(1), receiver);
    } else if (method === "route" && receiver.framework === "fastify" && args[0] && Node.isObjectLiteralExpression(args[0])) {
      // fastify.route({ method: "GET", url: "/x", handler })
      const opts = args[0];
      const m = opts.getProperty("method");
      const u = opts.getProperty("url");
      const methodValue = m && Node.isPropertyAssignment(m) ? literalValue(m.getInitializerOrThrow()) : undefined;
      if (methodValue && u && Node.isPropertyAssignment(u)) addRoute(call, methodValue.toLowerCase(), u.getInitializerOrThrow(), [], receiver);
    } else if (method === "use" || method === "register") {
      const prefixArg = args.length > 1 && literalValue(args[0]!) !== undefined ? literalValue(args[0]!) : undefined;
      for (const arg of args) {
        const child = Node.isIdentifier(arg) ? resolveReceiver(arg, ctx) : undefined;
        if (!child) continue;
        const evidenceId = ctx.evidence.addNode(call, file, {
          extractor: "http-routes",
          confidence: Math.min(receiver.confidence, child.confidence),
          detail: `mount ${child.key}${prefixArg ? ` at ${prefixArg}` : ""} on ${receiver.key}`,
          symbol: arg.getText(),
        });
        facts.mounts.push({ parent: receiver.key, router: child.key, prefix: prefixArg, evidenceId });
      }
    } else if (method === "listen") {
      const evidenceId = ctx.evidence.addNode(call, file, {
        extractor: "http-routes",
        confidence: receiver.confidence,
        detail: `${receiver.framework} server listen() on ${receiver.key}`,
        symbol: target.getText(),
      });
      facts.listens.push({ evidenceId });
    }
  }
  return facts;

  function addRoute(call: CallExpression, method: string, pathArg: Node, handlers: Node[], receiver: Receiver) {
    const literal = literalValue(pathArg);
    const path = literal ?? pathArg.getText();
    const httpMethod = method.toUpperCase() as RouteFact["method"];
    const handlerNames = handlers.map(handlerLabel);
    const evidenceId = ctx.evidence.addNode(call, file, {
      extractor: "http-routes",
      confidence: literal !== undefined ? receiver.confidence : Math.min(receiver.confidence, 0.7),
      detail: `${httpMethod} ${path} → ${handlerNames.join(", ") || "handler"}`,
      symbol: handlerNames.at(-1),
    });
    facts.routes.push({ method: httpMethod, path, router: receiver.key, handlers: handlerNames, evidenceId });
  }
}

function isRouteChain(call: CallExpression): boolean {
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) && callee.getName() === "route";
}
