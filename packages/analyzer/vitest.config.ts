import { defineConfig } from "vitest/config";

/**
 * Test files that start Docker sandboxes (agent-v6 amendment 1, decision 047). They run after every
 * other file and one at a time: two Recall sandboxes, or a Recall sandbox beside the other Docker
 * files, can make Recall's own suite time out at baseline (decision 045). Timeouts are unchanged.
 */
export const DOCKER_TEST_FILES = [
  "test/harness-docker.test.ts",
  "test/harness-expiry.test.ts",
  "test/harness-infra.test.ts",
  "test/harness-loop.test.ts",
  "test/harness-recall.test.ts",
];

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    projects: [
      { extends: true, test: { name: "unit", include: ["test/**/*.test.ts"], exclude: DOCKER_TEST_FILES, sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: "docker", include: DOCKER_TEST_FILES, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
