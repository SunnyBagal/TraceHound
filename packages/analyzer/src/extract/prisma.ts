import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { ClientConstruction, PrismaOpFact } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { calleeOrigin, resolveVariable, rootIdentifier } from "./provenance.ts";
import { resolveStatic } from "./values.ts";

const MODEL_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn",
  "upsert", "delete", "deleteMany", "count", "aggregate", "groupBy",
]);
const RAW_OPS = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe", "$transaction"]);
const CONNECTION_PROPS = new Set(["url", "connectionString", "datasourceUrl"]);

/** `model User {` declarations and the datasource provider in a .prisma schema. */
export function extractPrismaSchema(file: string, text: string, ctx: ExtractContext) {
  const models: { name: string; evidenceId: string }[] = [];
  let datasource: { provider: string; evidenceId: string } | undefined;
  let block = "";
  text.split(/\r?\n/).forEach((line, i) => {
    const open = /^\s*(\w+)\s+\w+\s*\{/.exec(line);
    if (open) block = open[1]!;
    const provider = /^\s*provider\s*=\s*"([^"]+)"/.exec(line);
    if (block === "datasource" && provider && !datasource) {
      datasource = {
        provider: provider[1]!,
        evidenceId: ctx.evidence.add({
          file, startLine: i + 1, endLine: i + 1, extractor: "prisma", confidence: 1, detail: `prisma datasource provider ${provider[1]}`,
        }),
      };
    }
    const match = /^\s*model\s+(\w+)\s*\{/.exec(line);
    if (!match) return;
    const evidenceId = ctx.evidence.add({
      file, startLine: i + 1, endLine: i + 1, extractor: "prisma", confidence: 1,
      detail: `prisma model ${match[1]}`, symbol: match[1],
    });
    models.push({ name: match[1]!, evidenceId });
  });
  return { models, datasource };
}

function isPrismaModule(module: string): boolean {
  return module === "@prisma/client" || /(^|\/)prisma(\/|$)/.test(module);
}

/** `new PrismaClient({ adapter })` where `adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })`. */
function connectionOf(expr: Node): { connection: string; confidence: number } {
  const scopes: Node[] = [expr];
  if (Node.isNewExpression(expr)) {
    for (const ident of expr.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const parent = ident.getParent();
      // `{ adapter }` shorthand: the identifier's own symbol is the property, not the variable
      const decl = Node.isShorthandPropertyAssignment(parent)
        ? parent.getValueSymbol()?.getDeclarations().find(Node.isVariableDeclaration)
        : resolveVariable(ident);
      const init = decl?.getInitializer();
      if (init) scopes.push(init);
    }
  }
  for (const scope of scopes) {
    for (const prop of scope.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      if (!CONNECTION_PROPS.has(prop.getName())) continue;
      const value = resolveStatic(prop.getInitializerOrThrow());
      return { connection: value.env ?? value.value ?? value.raw, confidence: Math.min(0.9, value.confidence) };
    }
  }
  return { connection: "default", confidence: 0.9 };
}

function isPrismaClientInit(init: Node | undefined): boolean {
  if (!init || !Node.isNewExpression(init)) return false;
  const origin = calleeOrigin(init.getExpression());
  return origin !== undefined && origin.name === "PrismaClient" && isPrismaModule(origin.module);
}

export interface PrismaFacts {
  clients: ClientConstruction[];
  ops: PrismaOpFact[];
}

export function extractPrisma(sf: SourceFile, ctx: ExtractContext, schemaModels: string[]): PrismaFacts {
  const file = ctx.rel(sf.getFilePath());
  const facts: PrismaFacts = { clients: [], ops: [] };
  const modelByAccessor = new Map(schemaModels.map((m) => [m.charAt(0).toLowerCase() + m.slice(1), m]));

  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init || !isPrismaClientInit(init)) continue;
    const { connection, confidence } = connectionOf(init);
    const evidenceId = ctx.evidence.addNode(decl, file, {
      extractor: "prisma", confidence, detail: `prisma client ${decl.getName()} → connection ${connection}`, symbol: decl.getName(),
    });
    facts.clients.push({
      tech: "prisma", variable: decl.getName(), exported: decl.getVariableStatement()?.isExported() ?? false, connection, evidenceId,
    });
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const op = callee.getName();
    const target = callee.getExpression();

    let clientExpr: Node | undefined;
    let accessor: string | undefined;
    if (MODEL_OPS.has(op) && Node.isPropertyAccessExpression(target)) {
      clientExpr = target.getExpression(); // prisma.user.create → prisma
      accessor = target.getName();
    } else if (RAW_OPS.has(op)) {
      clientExpr = target;
    }
    const ident = clientExpr && rootIdentifier(clientExpr);
    const clientVar = ident && resolveVariable(ident);
    if (!ident || !clientVar || !isPrismaClientInit(clientVar.getInitializer())) continue;
    const clientDecl = `${ctx.rel(clientVar.getSourceFile().getFilePath())}#${clientVar.getName()}`;

    const model = accessor ? (modelByAccessor.get(accessor) ?? accessor) : "$raw";
    const inSchema = accessor ? modelByAccessor.has(accessor) : false;
    const evidenceId = ctx.evidence.addNode(call, file, {
      extractor: "prisma",
      confidence: inSchema ? 0.9 : 0.7,
      resolution: "proven", // model and op are literal member names in the call
      detail: `${model}.${op}${accessor && !inSchema ? " (model not found in schema.prisma)" : ""}`,
      symbol: call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName(),
    });
    facts.ops.push({ client: ident.getText(), clientDecl, model, op, evidenceId });
  }
  return facts;
}
