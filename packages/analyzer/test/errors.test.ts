import { describe, expect, it } from "vitest";
import { extractErrorMessages } from "../src/extract/errors.ts";
import { memoryProject } from "./helpers.ts";

describe("extractErrorMessages", () => {
  const { ctx, evidence, sf } = memoryProject({
    "/src/a.ts": [
      `export function wait(ms: number) {`, // 1
      `  return new Promise((resolve, reject) => {`, // 2
      `    setTimeout(() => reject(new Error("Engine response timed out")), ms);`, // 3
      `  });`, // 4
      `}`, // 5
      "export function env(name: string) { throw new Error(`Missing env: ${name}`); }", // 6
      `export const bad = () => { throw "plain string"; };`, // 7
      `export const rej = () => Promise.reject("nope");`, // 8
      `export const typed = new TypeError("wrong type");`, // 9
      `export function h(res: any, err: unknown) {`, // 10
      `  res.status(401).json({ error: "Invalid auth token" });`, // 11
      `  res.status(500).json({ error: err instanceof Error ? err.message : "internal_server_error" });`, // 12
      `  res.status(201).json({ error: "not an error status" });`, // 13
      `  res.status(400).json({ message: "not the error field" });`, // 14
      `  res.status(400).json({ error: err });`, // 15
      `  console.log("just a log line");`, // 16
      `  throw new Error(String(err));`, // 17
      `}`, // 18
    ].join("\n"),
  });
  const facts = extractErrorMessages(sf("/src/a.ts"), ctx);

  it("records only error-message literals, with how each was used", () => {
    expect(facts.map((f) => [f.kind, f.message])).toEqual([
      ["reject", "Engine response timed out"],
      ["throw", "Missing env: *"],
      ["throw", "plain string"],
      ["reject", "nope"],
      ["new-error", "wrong type"],
      ["http-error", "Invalid auth token"],
      ["http-error", "internal_server_error"],
    ]);
  });

  it("backs each fact with file:line evidence from the errors extractor", () => {
    const ev = evidence.all().find((e) => e.id === facts[0]!.evidenceId)!;
    expect(ev).toMatchObject({ file: "src/a.ts", range: { startLine: 3, endLine: 3 }, extractor: "errors", resolution: "proven" });
    expect(facts.map((f) => evidence.all().find((e) => e.id === f.evidenceId)!.range.startLine)).toEqual([3, 6, 7, 8, 9, 11, 12]);
  });
});
