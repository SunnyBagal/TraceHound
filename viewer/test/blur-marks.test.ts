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
