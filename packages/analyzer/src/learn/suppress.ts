import type { Candidate, Suppression } from "../gate/gate.ts";
import { fingerprint, similar, type Fingerprint } from "./fingerprint.ts";

export interface RejectedFingerprint extends Fingerprint {
  repo: string;
  pr: number;
  commentId: number;
  reason: string;
  url: string;
}

export class FeedbackSuppression implements Suppression {
  readonly rejected: readonly RejectedFingerprint[];

  constructor(rejected: readonly RejectedFingerprint[]) {
    // Own the array and word sets so callers cannot change matching after construction.
    this.rejected = rejected.map(item => ({ ...item, tokens: [...item.tokens], ids: [...item.ids] }));
  }

  explain(finding: Candidate): RejectedFingerprint | undefined {
    const candidate = fingerprint(finding);
    return this.rejected.find(rejected => similar(candidate, rejected));
  }

  matches(finding: Candidate): boolean { return this.explain(finding) !== undefined; }
}
