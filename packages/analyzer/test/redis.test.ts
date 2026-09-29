import { describe, expect, it } from "vitest";
import { extractRedis } from "../src/extract/redis.ts";
import { memoryProject } from "./helpers.ts";

describe("extractRedis", () => {
  const { ctx, evidence, sf } = memoryProject({
    "/src/env.ts": [
      `function readRequiredEnv(name: string): string {`,
      `  const value = process.env[name];`,
      `  if (!value) throw new Error(name);`,
      `  return value;`,
      `}`,
      `export const env = {`,
      `  redisUrl: readRequiredEnv("REDIS_URL"),`,
      `  incomingQueue: process.env.INCOMING_QUEUE ?? "backend-to-engine-broker",`,
      `  responseQueue: \`response-queue-\${process.env.QUEUE_ID ?? crypto.randomUUID()}\`,`,
      `};`,
    ].join("\n"),
    "/src/client.ts": [
      `import { createClient } from "redis";`,
      `import { env } from "./env.js";`,
      `const publisher = createClient({ url: env.redisUrl }).on("error", () => {});`,
      `export const subscriber = createClient({ url: env.redisUrl });`,
      `const cache = new Map<string, string>();`,
      `export async function send(msg: string, replyTo: string) {`,
      `  await publisher.lPush(env.incomingQueue, msg);`,
      `  await publisher.lPush(replyTo, msg);`,
      `  cache.get("not-redis");`,
      `  return subscriber.brPop(env.responseQueue, 0);`,
      `}`,
      `export const ping = () => publisher.ping();`,
    ].join("\n"),
  });
  const facts = extractRedis(sf("/src/client.ts"), ctx);

  it("finds clients built by redis factories, through .on() chains", () => {
    expect(facts.clients.map((c) => [c.variable, c.exported, c.connection])).toEqual([
      ["publisher", false, "REDIS_URL"],
      ["subscriber", true, "REDIS_URL"],
    ]);
  });

  it("classifies ops by role and ignores non-redis receivers", () => {
    expect(facts.ops.map((o) => [o.op, o.role])).toEqual([
      ["lPush", "produce"],
      ["lPush", "produce"],
      ["brPop", "consume"],
      ["ping", "admin"],
    ]);
  });

  it("resolves keys through const objects and ?? defaults with reduced confidence", () => {
    const [push] = facts.ops;
    expect(push!.key).toEqual({ raw: "env.incomingQueue", value: "backend-to-engine-broker" });
    expect(evidence.get(push!.evidenceId)).toMatchObject({ confidence: 0.7, range: { startLine: 7 }, symbol: "send" });
  });

  it("keeps template keys as patterns, labelled dynamic", () => {
    expect(facts.ops[2]!.key?.value).toBe("response-queue-*");
    expect(evidence.get(facts.ops[2]!.evidenceId)!.resolution).toBe("dynamic");
  });

  it("labels keys by how they were resolved", () => {
    const [fallback, param] = facts.ops;
    expect(evidence.get(fallback!.evidenceId)!.resolution).toBe("resolved-default"); // env ?? "backend-to-engine-broker"
    expect(evidence.get(param!.evidenceId)!.resolution).toBe("dynamic"); // function parameter
  });

  it("labels literal keys proven", () => {
    const { ctx: c2, evidence: ev2, sf: sf2 } = memoryProject({
      "/a.ts": [`import { createClient } from "redis";`, `const r = createClient();`, `const Q = "jobs";`, `r.lPush("jobs", "x");`, `r.lPush(Q, "x");`].join("\n"),
    });
    const ops = extractRedis(sf2("/a.ts"), c2).ops;
    expect(ops.map((o) => ev2.get(o.evidenceId)!.resolution)).toEqual(["proven", "proven"]);
  });

  it("records dynamic keys as unresolved with confidence 0.5", () => {
    const dynamic = facts.ops[1]!;
    expect(dynamic.key).toEqual({ raw: "replyTo", value: undefined });
    expect(evidence.get(dynamic.evidenceId)!.confidence).toBe(0.5);
  });
});
