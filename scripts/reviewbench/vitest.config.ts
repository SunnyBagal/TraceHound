import { defineConfig } from "vitest/config";

// The ReviewBench adapter's own tests: outside the workspace packages, so `pnpm test` does not pick
// them up; .github/workflows/reviewbench-image.yml runs them before every image build. Run:
//   pnpm exec vitest run --config scripts/reviewbench/vitest.config.ts
export default defineConfig({
  test: { root: import.meta.dirname, include: ["*.test.ts"], setupFiles: ["./test-setup.ts"] },
});
