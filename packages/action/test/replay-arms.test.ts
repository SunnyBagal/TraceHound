// scripts/testset/replay-arms.ts (B1): arms rebuilt from a record's lineage, with no inclusion assumed between arms.
// Synthetic records only; no model, no network.
import { describe, expect, it } from "vitest";
import { replayArms, RefusalError } from "../../../scripts/testset/replay-arms.ts";

type F = { path: string; line: number | null; body: string };
const f = (i: number, file = "x.ts"): F => ({ path: file, line: 100 * i, body: `finding ${i}` });

/** A record as run-tracehound.ts writes it, with only the fields replay-arms reads. */
function record(o: { diff: F[]; ctx?: F[]; pool?: F[]; kept?: F[] | null; posted?: F[]; contracts?: F[]; prepared?: boolean; status?: string }) {
  const pool = o.pool ?? [...o.diff, ...(o.ctx ?? [])];
  const kept = o.kept === undefined ? pool : o.kept;
  const prepared = o.prepared ?? true;
  return {
    case: "case-999", pr_title: "Synthetic", pr_number: 5, status: o.status ?? "ok",
    comments: o.posted ?? (kept ?? []).slice(0, 15),
    review: prepared ? { contracts: { status: "ok", findings: o.contracts ?? [] } } : null,
    lineage: { v: 1, "review-diff-v1": { comments: o.diff }, "review-ctx-v1": { comments: o.ctx ?? [] },
      pool: { findings: pool, sources: pool.map(() => "diff") },
      ...(kept !== null && { "verify-ctx-v1": { verdicts: { comments: [] }, kept: { comments: kept } } }),
      ...(o.contracts && { contracts: { status: "ok", findings: o.contracts } }) },
  };
}

describe("replayArms", () => {
  it("does not assume A1 ⊇ A0: a pool of 20 whose first 15 the verifier drops", () => {
    const pool = Array.from({ length: 20 }, (_, i) => f(i + 1));
    const kept = pool.slice(15); // the verifier keeps only findings 16-20
    const r = replayArms(record({ diff: pool, kept }));
    expect(r.arms.A1.comments).toEqual(pool.slice(0, 15));
    expect(r.arms.A0.comments).toEqual(kept);
    expect(r.a0NotInA1).toBe(5); // none of A0 is in A1
    expect(r.a0MatchesPosted).toBe(true);
  });

  it("caps each arm at its own first 15, after the contract dedupe, in pool order", () => {
    const diff = Array.from({ length: 18 }, (_, i) => f(i + 1, "a.ts"));
    const ctx = [f(1, "b.ts"), f(2, "b.ts")];
    const contracts = [{ path: "a.ts", line: 202, body: "contract" }]; // removes a.ts line 200 (finding 2)
    const r = replayArms(record({ diff, ctx, contracts }));
    expect(r.arms.A2.candidates).toBe(18);
    expect(r.arms.A2.comments.map((c) => c.body)).toEqual([1, ...Array.from({ length: 14 }, (_, i) => i + 3)].map((i) => `finding ${i}`));
    expect(r.arms.A1.comments).toEqual(r.arms.A2.comments); // ctx-only findings fall past the cap here
    expect(r.arms.A0.comments).toHaveLength(15);
    expect(r.contractsSource).toBe("prepared");
  });

  it("reports a mismatch when the posted comments differ from the A0 replay", () => {
    const pool = [f(1), f(2)];
    expect(replayArms(record({ diff: pool, posted: [f(2), f(1)] })).a0MatchesPosted).toBe(false);
  });

  it("without a prepared review, uses the raw contracts result and compares nothing", () => {
    const pool = [f(1), f(2)];
    const r = replayArms(record({ diff: pool, kept: [], prepared: false, contracts: [{ path: "x.ts", line: 101, body: "c" }] }));
    expect(r.contractsSource).toBe("lineage");
    expect(r.arms.A1.comments).toEqual([f(2)]);
    expect(r.arms.A0.comments).toEqual([]);
    expect(r.a0MatchesPosted).toBeNull();
  });

  it("A0 is unavailable when the run failed (the Action posts nothing); the other arms still replay", () => {
    const r = replayArms(record({ diff: [f(1)], kept: null, prepared: false, status: "failed" }));
    expect(r.arms.A0.status).toBe("unavailable");
    expect(r.arms.A1.comments).toEqual([f(1)]);
    expect(r.arms.A2.comments).toEqual([f(1)]);
  });

  it("refuses a record without lineage or an invalid finding list", () => {
    expect(() => replayArms({ case: "case-1", comments: [] })).toThrow(RefusalError);
    const bad = record({ diff: [f(1)] });
    (bad.lineage.pool as { findings: unknown[] }).findings = [{ path: "", line: 1, body: "x" }];
    expect(replayArms(bad).arms.A1).toMatchObject({ status: "unavailable" });
  });
});
