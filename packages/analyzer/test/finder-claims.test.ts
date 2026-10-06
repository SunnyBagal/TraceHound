// Hypotheses → reproduce claims (decision 052), on the finder's own positive fixtures (never Recall):
// each family gives a Form A and a Form B claim that ClaimSpec and loadClaim accept, and the two
// differ only by `excerpts`.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { claimIdOf, hypothesisToClaim, writeClaims } from "../src/finder/claims.ts";
import { findHypotheses } from "../src/finder/index.ts";
import type { FinderReport, RuleFamily } from "../src/finder/hypothesis.ts";
import { ClaimSpec, claimText, loadClaim } from "../src/harness/reproduce.ts";
import { PAYLOAD_FIELD_MISSING, REQUEST_TO_FETCH, ROUTE_WITHOUT_AUTH } from "./finder-fixtures.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

function find(files: Record<string, string>): FinderReport {
  const made = makeFixtureRepo({ "package.json": JSON.stringify({ name: "app", private: true, scripts: { start: "bun run src/server.ts" } }), ...files });
  cleanups.push(made.cleanup);
  return findHypotheses(made.repo, { now: () => new Date(0) }).report;
}

const PROFILE = { id: "toy", test: "bun test", testReport: { format: "junit", command: "bun test --reporter=junit --reporter-outfile=$REPORT" } };
const GIT_URL = "https://example.invalid/app.git";
const FIXTURES: [RuleFamily, Record<string, string>][] = [
  ["route-without-auth", ROUTE_WITHOUT_AUTH],
  ["payload-field-missing", PAYLOAD_FIELD_MISSING],
  ["request-to-fetch", REQUEST_TO_FETCH],
];

describe.each(FIXTURES)("%s: one Form A and one Form B claim per hypothesis", (family, fixture) => {
  const report = find(fixture);
  const hs = report.hypotheses.filter((h) => h.family === family);
  const dir = mkdtempSync(path.join(tmpdir(), "th-claims-"));
  writeFileSync(path.join(dir, "profile.json"), JSON.stringify(PROFILE));
  const files = writeClaims({ ...report, hypotheses: hs }, path.join(dir, "claims"), { profile: path.join(dir, "profile.json"), gitUrl: GIT_URL });

  it("writes two files that parse with ClaimSpec and load with their profile, at the finder's commit", () => {
    expect(hs.length).toBeGreaterThan(0);
    expect(files.map((f) => path.relative(dir, f))).toEqual([...hs.map((h) => `claims/form-a/${claimIdOf(h)}.json`), ...hs.map((h) => `claims/form-b/${claimIdOf(h)}.json`)]);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(f, "utf8"));
      expect(() => ClaimSpec.parse(raw)).not.toThrow();
      const loaded = loadClaim(f);
      expect(loaded.spec).toMatchObject({ baseSha: report.repo.commitSha, profile: "../../profile.json", source: { gitUrl: GIT_URL } });
      expect(loaded.profile.id).toBe("toy");
      expect(loaded.spec.baseSha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("Form A is the question and stated input with file:line evidence; Form B differs only by the excerpts", () => {
    for (const h of hs) {
      const a = loadClaim(path.join(dir, "claims/form-a", `${claimIdOf(h)}.json`)).spec;
      const b = loadClaim(path.join(dir, "claims/form-b", `${claimIdOf(h)}.json`)).spec;
      expect(a.id).toMatch(new RegExp(`^${family}-[0-9a-f]{10}$`));
      expect(a.claim).toBe(`Question: ${h.question}\n\nInput: ${h.statedInput}`);
      expect(a.title).toBe(`Question from rule ${h.rule.id}`);
      expect(a.evidence).toEqual([...new Set(h.excerpts.map((e) => (e.startLine === e.endLine ? `${e.file}:${e.startLine}` : `${e.file}:${e.startLine}-${e.endLine}`)))]);
      expect("excerpts" in a).toBe(false);
      const { excerpts, ...bWithout } = b;
      expect(bWithout).toEqual(a);
      expect(excerpts).toEqual(h.excerpts.map(({ file, startLine, endLine, lines }) => ({ file, startLine, endLine, lines })));
      // the agent sees Form A's issue text, then the excerpts
      expect(claimText(b).startsWith(`${claimText(a)}\n\nCode excerpts:\n`)).toBe(true);
    }
  });
});

describe("claim ids and text", () => {
  it("ids are derived from the hypothesis id only, so a rerun on the same commit gives the same files", () => {
    const [h] = find(REQUEST_TO_FETCH).hypotheses;
    const [again] = find(REQUEST_TO_FETCH).hypotheses;
    expect(claimIdOf(h!)).toBe(claimIdOf(again!));
    expect(claimIdOf({ ...h!, id: `${h!.id}x` })).not.toBe(claimIdOf(h!));
  });
  it("the claim holds nothing the hypothesis doesn't say: no rule text, no graph ids, no excerpt notes", () => {
    const [h] = find(PAYLOAD_FIELD_MISSING).hypotheses;
    const c = hypothesisToClaim(h!, "b", "a".repeat(40), { profile: "p.json", gitUrl: GIT_URL });
    const text = JSON.stringify(c);
    for (const extra of [h!.rule.text, ...h!.excerpts.map((e) => e.why), ...h!.graph.evidenceIds]) expect(text).not.toContain(JSON.stringify(extra).slice(1, -1));
  });
});
