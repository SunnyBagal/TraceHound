import { describe, expect, it } from "vitest";
import { extractEnv } from "../src/extract/env.ts";
import { memoryProject } from "./helpers.ts";

describe("extractEnv", () => {
  const { ctx, evidence, sf } = memoryProject({
    "/src/env.ts": [
      `function readRequiredEnv(name: string): string {`,
      `  const value = process.env[name];`,
      `  if (!value) throw new Error(name);`,
      `  return value;`,
      `}`,
      `const { JWT_SECRET, PORT: port } = process.env;`,
      `export const env = {`,
      `  redisUrl: readRequiredEnv("REDIS_URL"),`,
      `  queue: process.env.INCOMING_QUEUE ?? "q",`,
      `  db: process.env["DATABASE_URL"],`,
      `};`,
      `const notEnv = config.env.FOO;`,
    ].join("\n"),
  });
  const facts = extractEnv(sf("/src/env.ts"), ctx);

  it("finds direct, bracket, destructured and helper-based reads in source order", () => {
    expect(facts.map((f) => f.name)).toEqual(["JWT_SECRET", "PORT", "REDIS_URL", "INCOMING_QUEUE", "DATABASE_URL"]);
  });

  it("does not treat the helper's own process.env[param] as a read", () => {
    expect(facts.some((f) => f.name === "name")).toBe(false);
  });

  it("gives helper-based reads 0.9 confidence and direct reads 1.0", () => {
    const byName = Object.fromEntries(facts.map((f) => [f.name, evidence.get(f.evidenceId)!]));
    expect(byName.REDIS_URL).toMatchObject({ confidence: 0.9, range: { startLine: 8 } });
    expect(byName.INCOMING_QUEUE).toMatchObject({ confidence: 1, range: { startLine: 9 } });
  });
});
