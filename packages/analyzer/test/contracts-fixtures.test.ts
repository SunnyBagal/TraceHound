// contracts-v1, end to end: every fixture pull request through computeContracts (the CLI's path).
// Positives yield exactly their expected findings; controls yield zero; dependents never add findings.
import { afterAll, describe, expect, it } from "vitest";
import { computeContracts } from "../src/contracts/contracts.ts";
import { CASES } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

describe("contracts end to end: fixture pull requests", () => {
  it("every break has a control", () => {
    const positives = CASES.filter((c) => !c.control);
    expect(CASES.filter((c) => c.control)).toHaveLength(positives.length);
    for (const c of positives) expect(c.expected.tsc + c.expected.contract, c.name).toBeGreaterThan(0);
  });

  for (const c of CASES) {
    it(`${c.control ? "control" : "positive"}: ${c.name}`, () => {
      const r = makeRepo(c.base, c.head);
      cleanups.push(r.cleanup);
      const report = computeContracts({ repo: r.repo, base: r.base, head: r.head });
      const got = { tsc: report.findings.filter((f) => f.source === "tsc").length, contract: report.findings.filter((f) => f.source === "contract").length, paths: report.findings.map((f) => `${f.path}:${f.line}`).sort() };
      expect(got).toEqual({ ...c.expected, paths: [...c.expected.paths].sort() });
      // typed is complete for TS fixtures and skipped (no tsconfig) for the others: never partial
      expect("tsconfig.json" in c.base ? "complete" in report.typed : "skipped" in report.typed && report.typed.skipped === "no-tsconfig").toBe(true);
      expect(report.timings.totalMs).toBeGreaterThanOrEqual(report.timings.typedMs);
    });
  }
});
