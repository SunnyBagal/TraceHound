import { describe, expect, it } from "vitest";
import { extractPrisma, extractPrismaSchema } from "../src/extract/prisma.ts";
import { memoryProject } from "./helpers.ts";

const schema = [`generator client {`, `  provider = "prisma-client"`, `}`, `model User {`, `  id String @id`, `}`, `model Order {`, `}`].join("\n");

describe("extractPrismaSchema", () => {
  it("lists models with line evidence", () => {
    const { ctx, evidence } = memoryProject({});
    evidence.setFileText("prisma/schema.prisma", schema);
    const models = extractPrismaSchema("prisma/schema.prisma", schema, ctx);
    expect(models.map((m) => m.name)).toEqual(["User", "Order"]);
    expect(evidence.get(models[0]!.evidenceId)!.range).toEqual({ startLine: 4, endLine: 4 });
  });
});

describe("extractPrisma", () => {
  const { ctx, evidence, sf } = memoryProject({
    // generated client is intentionally absent: the import is unresolved, like the demo repo
    "/src/db.ts": [
      `import { PrismaClient } from "./generated/prisma/client";`,
      `import { PrismaPg } from "@prisma/adapter-pg";`,
      `const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });`,
      `export const prisma = new PrismaClient({ adapter });`,
    ].join("\n"),
    "/src/auth.ts": [
      `import { prisma } from "./db.js";`,
      `const repo = { user: { create: (x: unknown) => x } };`,
      `export async function signup() {`,
      `  await prisma.user.create({ data: {} });`,
      `  await prisma.invoice.findMany();`,
      `  await prisma.$transaction([]);`,
      `  repo.user.create({});`,
      `}`,
    ].join("\n"),
  });
  const models = ["User", "Order"];

  it("detects PrismaClient construction even when the generated import is unresolved", () => {
    const facts = extractPrisma(sf("/src/db.ts"), ctx, models);
    expect(facts.clients).toEqual([expect.objectContaining({ variable: "prisma", exported: true, connection: "DATABASE_URL" })]);
  });

  it("finds model ops on the client across imports, ignoring lookalikes", () => {
    const facts = extractPrisma(sf("/src/auth.ts"), ctx, models);
    expect(facts.ops.map((o) => `${o.model}.${o.op}`)).toEqual(["User.create", "invoice.findMany", "$raw.$transaction"]);
  });

  it("gives lower confidence to models missing from the schema", () => {
    const [create, unknown] = extractPrisma(sf("/src/auth.ts"), ctx, models).ops;
    expect(evidence.get(create!.evidenceId)).toMatchObject({ confidence: 0.9, symbol: "signup", range: { startLine: 4 } });
    expect(evidence.get(unknown!.evidenceId)!.confidence).toBe(0.7);
  });
});
