// contracts-v1, findings: every fixture break yields its candidates; every control yields none.
import { afterAll, describe, expect, it } from "vitest";
import { buildFindings, contractCandidates, tscCandidate, type ContractCandidate } from "../src/contracts/findings.ts";
import { computeKeyed } from "../src/contracts/keyed.ts";
import { openTrees } from "../src/contracts/trees.ts";
import { computeTyped } from "../src/contracts/typed.ts";
import { CASES, type ContractCase } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

function findings(c: Pick<ContractCase, "base" | "head">): ContractCandidate[] {
  const r = makeRepo(c.base, c.head);
  cleanups.push(r.cleanup);
  const trees = openTrees(r.repo, r.base, r.head);
  try {
    return buildFindings(computeTyped(trees), computeKeyed(trees));
  } finally {
    trees.close();
  }
}
/** Sentences outside code spans. */
const sentences = (body: string) => body.replace(/`[^`]*`/g, "CODE").split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
const lineOf = (files: Record<string, string | null>, file: string, line: number) => files[file]?.split("\n")[line - 1];

describe("contracts findings: fixture cases", () => {
  for (const c of CASES) {
    it(`${c.control ? "control" : "positive"}: ${c.name} → tsc ${c.expected.tsc}, contract ${c.expected.contract}`, () => {
      const f = findings(c);
      expect(f.filter((x) => x.source === "tsc").length).toBe(c.expected.tsc);
      expect(f.filter((x) => x.source === "contract").length).toBe(c.expected.contract);
      expect(f.map((x) => `${x.path}:${x.line}`).sort()).toEqual([...c.expected.paths].sort());
      if (c.control) expect(f).toEqual([]);
      for (const x of f) {
        expect(x).toMatchObject({ severity: "high", category: "contract" });
        expect(x.evidence).toHaveLength(2);
        const [change, use] = x.evidence;
        // quotes are the exact line text of the side they cite
        const headFiles = { ...c.base, ...c.head };
        expect(change.quote).toBe(lineOf(change.side === "base" ? c.base : headFiles, change.path, change.line));
        expect(use).toMatchObject({ path: x.path, line: x.line, side: "head", quote: lineOf(headFiles, x.path, x.line) });
        expect(c.head[change.path] !== undefined, "the change is in an edited file").toBe(true);
        expect(c.head[use.path], "the stale use is in an unedited file").toBeUndefined();
        // What breaks / Where / Evidence, under 4 sentences
        expect(x.body).toMatch(/^What breaks: .+ Where: .+ Evidence: .+\.$/);
        expect(sentences(x.body).length).toBeLessThan(4);
      }
    });
  }
});

describe("contracts findings: bodies", () => {
  it("tsc: the diagnostic, where, and both sides quoted", () => {
    const c = CASES.find((x) => x.name === "required parameter added")!;
    expect(findings(c)).toEqual([
      {
        path: "src/app.ts", line: 2, source: "tsc", severity: "high", category: "contract",
        body: 'What breaks: TS2554 Expected 2 arguments, but got 1. Where: src/app.ts:2, which this pull request did not edit. Evidence: the change at src/greet.ts:1 `export function greet(name: string, greeting: string) {`; the use at src/app.ts:2 `export const message = greet("a");`.',
        evidence: [
          { path: "src/greet.ts", line: 1, side: "head", quote: "export function greet(name: string, greeting: string) {" },
          { path: "src/app.ts", line: 2, side: "head", quote: 'export const message = greet("a");' },
        ],
      },
    ]);
  });

  it("tsc: a removed export cites the removed base line; a two-sentence compiler message stays one clause", () => {
    const c = CASES.find((x) => x.name === "export renamed, stale importer")!;
    const [f] = findings(c);
    expect(f!.body).toMatch(/^What breaks: TS2305 Module '"\.\/users"' has no exported member 'getUser'\. Where: src\/page\.ts:1, /);
    expect(f!.evidence[0]).toEqual({ path: "src/users.ts", line: 1, side: "base", quote: "export function getUser(id: string) {" });
    const cause = { path: "a.ts", line: 1, side: "head" as const, text: "x", how: "" };
    const two = tscCandidate({ path: "b.ts", line: 2, column: 1, code: 2724, message: "'\"./a\"' has no exported member named 'f'. Did you mean 'g'?", text: "y", tsconfig: "tsconfig.json", cause })!;
    expect(two.body).toMatch(/^What breaks: TS2724 '"\.\/a"' has no exported member named 'f'; Did you mean 'g'\. Where: /);
    expect(sentences(two.body)).toHaveLength(3);
  });

  it("contract: the key, what happened to it, and both sites", () => {
    const c = CASES.find((x) => x.name === "HTTP route path changed on the server only")!;
    expect(findings(c).map((f) => f.body)).toEqual([
      'What breaks: src/client.ts still uses the HTTP route "/api/users", which this pull request renamed to "/api/members" in src/server.ts. Where: src/client.ts:2, which this pull request did not edit. Evidence: the change at src/server.ts:3 (base) `app.get("/api/users", (_req, res) => {`; the stale use at src/client.ts:2 `return (await fetch("/api/users")).json();`.',
    ]);
  });

  it("removed keys, prefixes and long lines", () => {
    const long = "x".repeat(200);
    const [f] = contractCandidates({
      key: "redis-key:session:", kind: "redis-key", before: "session:", prefix: true, via: "extractor",
      changedAt: { path: "a.ts", line: 3, side: "base", text: `  get(\`session:\${id}\`) // ${long}` }, staleUses: [{ path: "b.ts", line: 9, text: "x" }],
    });
    expect(f!.body).toContain('still uses the Redis key prefix "session:", which this pull request removed in a.ts.');
    expect(f!.body).toContain("`get('session:${id}') // " + "x".repeat(95) + "…`");
    expect(f!.evidence[0]!.quote).toBe(`  get(\`session:\${id}\`) // ${long}`);
  });

  it("a diagnostic without a cause makes no candidate; a skipped typed stage makes none", () => {
    expect(tscCandidate({ path: "a.ts", line: 1, column: 1, code: 1, message: "m", text: "t", tsconfig: "tsconfig.json" })).toBeUndefined();
    expect(buildFindings({ skipped: "budget", reason: "r", ms: 0 }, { keys: [], counts: { files: { extractor: 0, literal: 0 }, removed: 0, renamed: 0, searched: 0, staleUses: 0, extractorErrors: 0 }, ms: 0 })).toEqual([]);
  });
});
