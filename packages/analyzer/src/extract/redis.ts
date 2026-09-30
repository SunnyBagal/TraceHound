import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { ClientConstruction, RedisOpFact, RedisRole } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { calleeOrigin, resolveVariable, rootIdentifier } from "./provenance.ts";
import { resolveStatic } from "./values.ts";

const REDIS_MODULES = new Set(["redis", "@redis/client", "ioredis"]);
const CHAIN_METHODS = new Set(["on", "once", "duplicate"]);

const ROLES: Record<string, RedisRole> = {};
const role = (r: RedisRole, ops: string) => ops.split(" ").forEach((op) => (ROLES[op] = r));
role("produce", "lpush rpush lpushx rpushx publish spublish xadd");
role("consume", "brpop blpop lpop rpop brpoplpush blmove lmove subscribe psubscribe ssubscribe xread xreadgroup");
role("read", "get mget getex hget hmget hgetall hkeys hvals exists smembers sismember zrange zrangebyscore zscore llen lrange ttl scan keys");
role("write", "set setex setnx psetex mset del unlink incr incrby decr decrby hset hsetnx hdel hincrby expire pexpire sadd srem zadd zrem zincrby ltrim");
role("admin", "connect ping quit disconnect flushall flushdb");

interface ClientInfo {
  connection: string;
  confidence: number;
}

/** Follow `createClient(...).on(...)` style chains back to a redis client factory call. */
function clientFromInit(init: Node | undefined): { connection: string; confidence: number } | undefined {
  let node = init;
  while (node) {
    if (Node.isAwaitExpression(node) || Node.isParenthesizedExpression(node)) {
      node = node.getExpression();
      continue;
    }
    if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
      const callee = node.getExpression();
      const origin = calleeOrigin(callee);
      if (origin && REDIS_MODULES.has(origin.module)) return connectionOf(node.getArguments()[0]);
      if (Node.isPropertyAccessExpression(callee) && CHAIN_METHODS.has(callee.getName())) {
        node = callee.getExpression();
        continue;
      }
    }
    if (Node.isIdentifier(node)) {
      const decl = resolveVariable(node);
      node = decl?.getInitializer();
      continue;
    }
    return undefined;
  }
  return undefined;
}

/** `{ url: env.redisUrl }` → "REDIS_URL"; `"redis://…"` → the URL; nothing → "default". */
function connectionOf(arg: Node | undefined): { connection: string; confidence: number } {
  if (!arg) return { connection: "default", confidence: 0.9 };
  let urlExpr: Node | undefined = arg;
  if (Node.isObjectLiteralExpression(arg)) {
    const url = arg.getProperty("url");
    urlExpr = url && Node.isPropertyAssignment(url) ? url.getInitializer() : undefined;
    if (!urlExpr) return { connection: "default", confidence: 0.9 };
  }
  const value = resolveStatic(urlExpr);
  return { connection: value.env ?? value.value ?? value.raw, confidence: Math.min(0.9, value.confidence) };
}

/**
 * Redis connection behind an expression that names a redis client (`connection: redisConnection`),
 * for other detectors (BullMQ). undefined when it isn't a known redis client.
 */
export function redisConnectionOf(expr: Node): string | undefined {
  const ident = rootIdentifier(expr);
  const decl = ident && resolveVariable(ident);
  return decl ? clientFromInit(decl.getInitializer())?.connection : undefined;
}

function clientOfReceiver(expr: Node, cache: Map<Node, ClientInfo | null>): ClientInfo | undefined {
  const ident = rootIdentifier(expr);
  if (!ident) return undefined;
  const decl = resolveVariable(ident);
  if (!decl) return undefined;
  if (!cache.has(decl)) cache.set(decl, clientFromInit(decl.getInitializer()) ?? null);
  return cache.get(decl) ?? undefined;
}

export interface RedisFacts {
  clients: ClientConstruction[];
  ops: RedisOpFact[];
}

export function extractRedis(sf: SourceFile, ctx: ExtractContext): RedisFacts {
  const file = ctx.rel(sf.getFilePath());
  const facts: RedisFacts = { clients: [], ops: [] };
  const cache = new Map<Node, ClientInfo | null>();

  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init || !(Node.isCallExpression(init) || Node.isNewExpression(init) || Node.isAwaitExpression(init))) continue;
    const client = clientFromInit(init);
    if (!client) continue;
    cache.set(decl, client);
    const evidenceId = ctx.evidence.addNode(decl, file, {
      extractor: "redis",
      confidence: client.confidence,
      detail: `redis client ${decl.getName()} → connection ${client.connection}`,
      symbol: decl.getName(),
    });
    const exported = decl.getVariableStatement()?.isExported() ?? false;
    facts.clients.push({ tech: "redis", variable: decl.getName(), exported, connection: client.connection, evidenceId });
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const op = callee.getName();
    const opRole = ROLES[op.toLowerCase()];
    if (!opRole) continue;
    const client = clientOfReceiver(callee.getExpression(), cache);
    if (!client) continue;

    const keyArg = opRole === "admin" ? undefined : call.getArguments()[0];
    const key = keyArg ? resolveStatic(keyArg) : undefined;
    const confidence = Math.min(0.9, client.confidence, key?.confidence ?? 1);
    const keyLabel = key ? (key.value ?? `<dynamic: ${key.raw}>`) : undefined;
    const evidenceId = ctx.evidence.addNode(call, file, {
      extractor: "redis",
      confidence,
      resolution: key?.basis ?? "proven",
      detail: `${op}${keyLabel ? ` key=${keyLabel}` : ""} (${opRole}) via ${callee.getExpression().getText()}`,
      symbol: call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName(),
    });
    facts.ops.push({
      client: callee.getExpression().getText(),
      connection: client.connection,
      op,
      role: opRole,
      key: key ? { raw: key.raw, value: key.value } : undefined,
      evidenceId,
    });
  }
  return facts;
}
