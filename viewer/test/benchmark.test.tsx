import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import BenchmarkPage from "@/app/benchmark/page";
import { BENCHMARK_SOURCE, BENCHMARK_TABLES } from "@/lib/benchmark";
import { bandFor, blindRanked, blindRows, reviewerOf, tiedNames } from "@/lib/benchmark-view";
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
it("the cost tile is the cost table's 3.5 Super median, and figure 1 draws bars from 0%", () => {
  render(<BenchmarkPage />);
  const cost = BENCHMARK_TABLES.find((t) => t.title.startsWith("Dev cost per pull request"))!;
  const median = cost.rows.find((r) => r[0].startsWith("3.5 Super"))![(cost.headers as readonly string[]).indexOf("cost median")]!;
  expect(screen.getByTestId("tile-cost").textContent).toContain(median);
  expect(screen.getByTestId("bench-dots").textContent).toContain("0%");
});
it("ranks figure 1 and table 1 by F, so v2 sits where its F puts it, and the x1 band follows table 2", () => {
  render(<BenchmarkPage />);
  const blind = BENCHMARK_TABLES.find((t) => t.title.startsWith("Blind test: Cal.com, v2"))!;
  const f = (blind.headers as readonly string[]).indexOf("F (v1)");
  const ranked = blind.rows.filter((r) => !r[0].includes("secondary")).sort((a, b) => Number.parseFloat(b[f]!) - Number.parseFloat(a[f]!)).map((r) => r[0]);
  expect(screen.getAllByTestId("bench-row").map((r) => r.querySelector(".bench-name")!.getAttribute("title"))).toEqual(ranked);
  const table = screen.getAllByRole("table").find((t) => t.querySelector("caption")?.textContent === blind.title)!;
  const names = [...table.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("th")!.textContent);
  expect(names.slice(0, ranked.length)).toEqual(ranked);
  expect(names.slice(ranked.length).every((n) => n!.includes("secondary"))).toBe(true);
  expect(ranked[0]).not.toMatch(/^TraceHound v2/);
  // under x1 the order and the band are recomputed from the x1 column
  const x1 = (blind.headers as readonly string[]).indexOf("F (x1)");
  expect(bandFor("x1").max).toBe(Math.max(...blindRows.filter((r) => r.kind === "ours" || tiedNames.has(r.name)).map((r) => Number.parseFloat(blind.rows.find((b) => b[0] === r.name)![x1]!))));
  expect(blindRanked("x1").map((r) => r.by.x1.f)).toEqual([...blindRows.map((r) => r.by.x1.f)].sort((a, b) => b - a));
});
it("every reviewer row in the figures and tables carries its logo", () => {
  render(<BenchmarkPage />);
  for (const row of screen.getAllByTestId("bench-row")) expect(row.querySelector(".bench-mark"), row.textContent!).toBeTruthy();
  const reviewerCells = screen.getAllByRole("rowheader").filter((th) => reviewerOf(th.textContent!));
  expect(reviewerCells.length).toBeGreaterThan(20);
  for (const th of reviewerCells) expect(th.querySelector(".bench-mark")?.getAttribute("data-reviewer"), th.textContent!).toBe(reviewerOf(th.textContent!));
});
