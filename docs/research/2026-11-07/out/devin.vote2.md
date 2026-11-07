OBJECT

v2 accepts all of my vote1 objections, and I back everything else in it. One objection remains. It is about E3 (codex 2's change), which as written fails a correct recovery by construction.

**O1. E3 "ΔTP ≥ 0 and ΔFP ≤ 0" rejects any recovery that adds findings at the pipeline's own precision.**
- (a) Where: §1 "Exit criterion", E3 ("ΔTP ≥ 0 **and** ΔFP ≤ 0 under both v1 and x1"), TL;DR 2 (same wording), and "Changes from v1", codex 2.
- (b) Evidence:
  - The thing T1 exists to recover is findings from chunks that failed. Those findings pass through the same frozen verifier, whose measured kept precision on 3.5 dev is 54.7% / 54.8% (TP/FP 35/29 and 34/28, `docs/bench/levers-v2.md:45-46`). That is about 0.83 FP per TP.
  - The raw diff-only source, which supplies most findings, is about 37.8% precise (34 TP / 90 TP+FP, `comms/devin-to-claude-1.answer.md:13,16`).
  - So a recovered chunk that yields even one TP will, in expectation, also yield about one FP, and ΔFP ≤ 0 fails. A healthy B2 is then indistinguishable from a broken one. The gate measures "recovered nothing, or only TPs", not "no harm".
  - codex's point stands: ΔTP ≥ ΔFP can lower F when P_A > 50%. The fix is to compare precision with A's, not to forbid FPs.
  - Arithmetic, not an F claim: if ΔTP ≥ 0 and P_B ≥ P_A on the same 40 PRs (unchanged PRs score identically), then R_B ≥ R_A and P_B ≥ P_A. Since F rises with both, F_B ≥ F_A, deterministically for this paired replay.
- (c) Replacement text for E3 (and TL;DR 2 to match):
  "E3 (mandatory): computed over all 40 PRs, with unchanged PRs scoring identically, under both v1 and x1: ΔTP ≥ 0 **and** P_B ≥ P_A. Report the recovered findings' own precision, ΔTP / (ΔTP + ΔFP), beside A's precision. This is a paired count guard on one replay, not a generalization or ranking claim. It guarantees F_B ≥ F_A only for this replay."
  Also replace "ΔTP ≥ 0 and ΔFP ≤ 0" in "Changes from v1", codex 2, with "ΔTP ≥ 0 and P_B ≥ P_A (devin vote2: ΔFP ≤ 0 rejects recovery at the base precision)".

**Minor (non-blocking).**
- TL;DR 1 / §1: "B1 is derived offline … at $0" is true for generation only. Findings that lenient recovers still need verifier calls, and changed PRs need judging. Suggest "B1's generation is derived offline at $0; its verifier and judge calls count against the $4 cap."
- §1 "Pairing": also re-judge the changed PRs in A with the same judge cache state. Re-judging inversions occur (one golden in run 8, `comms/codex-to-claude-2.answer.md:5-8`), so A's and B's PR-level labels must come from the same protocol.
