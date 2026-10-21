import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("documents the current body-only checker, typed outcomes, termination grace and checkout requirement", async () => {
  const readme = await readFile(new URL("../../../docs/action/README.md", import.meta.url), "utf8");
  const section = readme.split("## Cross-file contracts\n")[1]!.split("\n## ")[0]!;
  expect(section).toContain("Contract findings are always body findings");
  expect(section).not.toContain("Findings on commentable diff lines");
  expect(section).toContain('typed: "complete" | "skipped-no-tsconfig" | "skipped-budget" | "skipped-error"');
  expect(section).toMatch(/SIGTERM[\s\S]*5-second[\s\S]*SIGKILL/);
  expect(section).toContain("contracts: skipped (no checkout)");
  expect(section).toContain("leaves the posted output byte-identical to `contracts: 'off'`");
});
