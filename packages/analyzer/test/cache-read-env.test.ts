// TRACEHOUND_CACHE_READ (scripts/run-tracehound.ts --cache off): unset or "on" keeps today's cache reads.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cacheReadFromEnv } from "../src/llm/cache.ts";

describe("cacheReadFromEnv", () => {
  it("reads the cache unless the env says off", () => {
    expect(cacheReadFromEnv({})).toBe(true);
    expect(cacheReadFromEnv({ TRACEHOUND_CACHE_READ: "" })).toBe(true);
    expect(cacheReadFromEnv({ TRACEHOUND_CACHE_READ: "on" })).toBe(true);
    expect(cacheReadFromEnv({ TRACEHOUND_CACHE_READ: "off" })).toBe(false);
    expect(() => cacheReadFromEnv({ TRACEHOUND_CACHE_READ: "0" })).toThrow(/on or off/);
  });

  it("is what the three pool-verify-v1 CLIs pass as readCache", () => {
    for (const f of ["review/cli.ts", "review/ctx-cli.ts", "review/verify-ctx-cli.ts"]) {
      expect(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).toContain("readCache: cacheReadFromEnv(),");
    }
  });
});
