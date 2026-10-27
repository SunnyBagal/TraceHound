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
it("v2's headline reads its tables by title: no undefined, NaN or 'th of 6', and the band follows table 2's sentences", () => {
  render(<BenchmarkPage />);
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/undefined|NaN|th of 6/);
  const gaps = BENCHMARK_TABLES.find((t) => t.title.startsWith("Cal.com: v2 minus each reviewer"))!;
  const sentence = (gaps.headers as readonly string[]).indexOf("sentence the rule allows");
  const rows = screen.getAllByTestId("bench-row");
  const band = (name: string) => rows.find((r) => r.querySelector(".bench-name")!.getAttribute("title")!.toLowerCase() === name.toLowerCase())?.dataset.band;
  for (const g of gaps.rows) {
    if (g[0].startsWith("3 Super")) continue; // v1, drawn as history
    expect(band(g[0]), g[0]).toBe(g[sentence]!.startsWith("statistically tied with") ? "tied" : "outside");
  }
  expect(rows.find((r) => r.dataset.kind === "history")!.dataset.band).toBe(gaps.rows.find((g) => g[0].startsWith("3 Super"))![sentence]!.startsWith("statistically tied") ? "tied" : "outside");
  expect(band("coderabbit")).toBe("outside");
  // the tiles: v2's blind F, its pre-registered all-50 rank, v1's spread, each a cell of a table
  const blind = BENCHMARK_TABLES.find((t) => t.title.startsWith("Blind test: Cal.com, v2"))!;
  expect(screen.getByTestId("tile-blind").textContent).toContain(blind.rows.find((r) => r[0].startsWith("TraceHound v2"))![(blind.headers as readonly string[]).indexOf("F (v1)")]!);
  expect(screen.getByTestId("tile-blind").textContent).toContain("10 blind pull requests, n = 23");
  expect(blind.note).toContain("10 blind pull requests, n = 23");
  expect(screen.getByTestId("tile-rank").textContent).toMatch(/^rank \d of 6/);
  expect(screen.getByTestId("bench-caption").textContent).not.toMatch(/no gap to another tool is outside/i);
});
