// agent-v6 amendment 1: every test file that starts a Docker sandbox is in the "docker" project,
// which runs after the others and one file at a time (vitest.config.ts).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config, { DOCKER_TEST_FILES } from "../vitest.config.ts";

describe("test config", () => {
  it("lists exactly the files that use the Docker provider; they run one at a time, after the unit project", () => {
    const dir = path.resolve(import.meta.dirname);
    const docker = readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts") && f !== path.basename(import.meta.filename) && /\b(LocalDockerProvider|dockerAvailable)\b/.test(readFileSync(path.join(dir, f), "utf8")))
      .map((f) => `test/${f}`)
      .sort();
    expect(docker).toEqual([...DOCKER_TEST_FILES].sort());
    const projects = (config as { test: { projects: { test: { name: string; fileParallelism?: boolean; sequence: { groupOrder: number } } }[] } }).test.projects.map((p) => p.test);
    expect(projects.map((p) => [p.name, p.fileParallelism ?? true, p.sequence.groupOrder])).toEqual([
      ["unit", true, 0],
      ["docker", false, 1],
    ]);
  });
});
