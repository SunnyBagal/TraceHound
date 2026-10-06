// Hypotheses → reproduce claims (decision 052). Each hypothesis gives two claims for the reproduce
// stage (048): Form A (question and stated input, file:line pointers as evidence) and Form B (the
// same plus the hypothesis's code excerpts). The text says only what the hypothesis says. No model.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ClaimSpec } from "../harness/reproduce.ts";
import type { FinderReport, Hypothesis } from "./hypothesis.ts";

export type ClaimForm = "a" | "b";
export const CLAIM_FORMS: ClaimForm[] = ["a", "b"];

export interface ClaimTarget {
  /** Repo profile file (absolute, or relative to the process's cwd); claims store it relative to their own folder. */
  profile: string;
  gitUrl: string;
}

/**
 * "<family>-<first 10 hex of sha256(hypothesis id)>": derived from the hypothesis id and valid as a claim id. Both forms
 * share it, so they differ only by `excerpts`; the form is the folder (form-a/, form-b/), which a run record keeps as its claimFile.
 */
export const claimIdOf = (h: Hypothesis) => `${h.family}-${createHash("sha256").update(h.id).digest("hex").slice(0, 10)}`;

const pointer = (e: { file: string; startLine: number; endLine: number }) => (e.startLine === e.endLine ? `${e.file}:${e.startLine}` : `${e.file}:${e.startLine}-${e.endLine}`);

/** One claim, parsed by ClaimSpec. `profile` is as it will be written (relative to the claim's folder). */
export function hypothesisToClaim(h: Hypothesis, form: ClaimForm, baseSha: string, target: { profile: string; gitUrl: string }): ClaimSpec {
  return ClaimSpec.parse({
    id: claimIdOf(h),
    profile: target.profile,
    source: { gitUrl: target.gitUrl },
    baseSha,
    title: `Question from rule ${h.rule.id}`,
    claim: `Question: ${h.question}\n\nInput: ${h.statedInput}`,
    evidence: [...new Set(h.excerpts.map(pointer))],
    ...(form === "b" && { excerpts: h.excerpts.map(({ file, startLine, endLine, lines }) => ({ file, startLine, endLine, lines })) }),
  });
}

/** Writes `<dir>/form-a/<id>.json` and `<dir>/form-b/<id>.json` per hypothesis; returns the files written. */
export function writeClaims(report: FinderReport, dir: string, target: ClaimTarget): string[] {
  const ids = report.hypotheses.map(claimIdOf);
  if (new Set(ids).size !== ids.length) throw new Error("two hypotheses map to the same claim id");
  const files: string[] = [];
  for (const form of CLAIM_FORMS) {
    const out = path.resolve(dir, `form-${form}`);
    mkdirSync(out, { recursive: true });
    const profile = path.relative(out, path.resolve(target.profile));
    for (const h of report.hypotheses) {
      const claim = hypothesisToClaim(h, form, report.repo.commitSha, { profile, gitUrl: target.gitUrl });
      const file = path.join(out, `${claim.id}.json`);
      writeFileSync(file, JSON.stringify(claim, null, 2) + "\n");
      files.push(file);
    }
  }
  return files;
}
