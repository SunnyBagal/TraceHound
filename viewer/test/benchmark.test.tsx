import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import BenchmarkPage from "@/app/benchmark/page";
import { BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";
afterEach(cleanup);
it("copies every aggregate table exactly from the report", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "../../docs/bench/results.md"), "utf8");
  const tables = [...source.matchAll(/(?:^\|[^\n]*\n)+/gm)].map(([table]) => table.trim().split("\n").filter((line) => !/^\|[-| ]+\|$/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/\*/g, ""))));
  expect(BENCHMARK_TABLES.map((table) => [table.headers, ...table.rows])).toEqual(tables);
});
it("renders sourced tables and the small-sample limitations", () => {
  render(<BenchmarkPage />);
  expect(screen.getAllByRole("table")).toHaveLength(BENCHMARK_TABLES.length);
  expect(screen.getByRole("link", { name: "docs/bench/results.md" }).getAttribute("href")).toBe(BENCHMARK_SOURCE);
  expect(screen.getByText(/Differences of a few points are within noise/)).toBeTruthy();
});
it("says all 50 PRs only in the all-50 tables' own headings and captions", () => {
  render(<BenchmarkPage />);
  const mentions = screen.queryAllByText(/all 50 PRs/i);
  expect(mentions.map((node) => node.tagName).sort()).toEqual(["CAPTION", "CAPTION", "H2", "H2"]);
  expect(document.body.textContent?.match(/all 50 PRs/gi)).toHaveLength(mentions.length);
});
it("never states 3rd of six as a ranking", () => {
  render(<BenchmarkPage />);
  expect(document.body.textContent).not.toMatch(/3rd of (6|six)/i);
});
