import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { BLUR_THIRD_PARTY_MARKS } from "@/lib/marks";

const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");
const layout = readFileSync(path.resolve(import.meta.dirname, "../app/layout.tsx"), "utf8");

it("blurs third-party marks behind one flag, and never NVIDIA's or the wolf", () => {
  expect(typeof BLUR_THIRD_PARTY_MARKS).toBe("boolean");
  expect(layout).toContain("data-blur-marks={BLUR_THIRD_PARTY_MARKS");
  const rules = css.split("\n").filter((line) => line.startsWith("html[data-blur-marks]"));
  expect(rules).toHaveLength(3);
  expect(rules[0]).toContain(':not([data-mark="nvidia"])');
  expect(rules[1]).toContain(".bench-mark-wrap");
  expect(rules[2]).toContain(':not([data-logo^="nvidia"])');
});

it("hides the five reviewers' names behind the same flag, numbers unchanged", async () => {
  const { BENCHMARK_TABLES: shownTables, HIDE_REVIEWER_NAMES, anonymize } = await import("@/lib/benchmark-display");
  const { BENCHMARK_TABLES: source } = await import("@/lib/benchmark");
  expect(HIDE_REVIEWER_NAMES).toBe(BLUR_THIRD_PARTY_MARKS);
  const text = JSON.stringify(shownTables);
  if (HIDE_REVIEWER_NAMES) expect(text).not.toMatch(/\b(augment|cursor|greptile|copilot|coderabbit)\b/i); // "augmented F1" is ReviewBench's metric
  expect(text).toBe(HIDE_REVIEWER_NAMES ? anonymize(JSON.stringify(source)) : JSON.stringify(source));
  expect(anonymize("augment, Cursor, greptile, copilot, CodeRabbit")).toBe("Reviewer A, Reviewer B, Reviewer C, Reviewer D, Reviewer E");
});
