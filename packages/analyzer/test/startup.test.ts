import { describe, expect, it } from "vitest";
import { extractStartupCalls } from "../src/extract/startup.ts";
import { memoryProject } from "./helpers.ts";

describe("extractStartupCalls", () => {
  it("lists top-level calls (await/void unwrapped), skipping console/process and nested calls", () => {
    const { ctx, evidence, sf } = memoryProject({
      "/index.ts": [
        `import { connectRedis, listen } from "./redis.js";`,
        `await connectRedis();`,
        `void listen();`,
        `console.log("hi");`,
        `function later() { nested(); }`,
        `app.listen(3000, () => {});`,
      ].join("\n"),
    });
    const calls = extractStartupCalls(sf("/index.ts"), ctx);
    expect(calls.map((c) => c.callee)).toEqual(["connectRedis", "listen", "app.listen"]);
    expect(evidence.get(calls[0]!.evidenceId)).toMatchObject({ extractor: "startup", range: { startLine: 2 }, resolution: "proven" });
  });
});
