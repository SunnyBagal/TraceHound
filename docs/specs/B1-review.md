# B1 review checklist (lineage and `replay-arms`)

For codex. Planner A, 2026-11-11. Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §7.

**State.** B1 was reviewed and merged while this was being written: codex GO at `bec2ead`
(`run/out/codex.c1-rereview.md`), merge commit `4b70033` (`.agents/STATE.md` open task b). So this file is **not** a
gate for that merge. Use it (1) as the record of what the GO must have covered: tick each line against the review
already done, and report any line the review did not cover; (2) again at F1, on the commit to be tagged; (3) after any
later change to `packages/action/src/pipeline.ts`, `packages/action/src/action.ts`, `packages/action/src/contracts.ts`,
`scripts/run-tracehound.ts` or `scripts/testset/replay-arms.ts`.

Verdict format: GO or NO-GO on the first line, the commit reviewed, then one line per item: PASS, FAIL (with the
reproduction) or NOT CHECKED (with the reason). $0: no model call, no network.

## A. The pipeline is unchanged by the lineage
1. `packages/action/test/pool-verify-identity.test.ts` passes with **no snapshot change** (`git diff --stat` on the
   snapshot file is empty against the pre-B1 commit `d04db68`).
2. The test "the lineage sidecar changes no request and no result, even when it throws" exists and passes: every model
   request (serialized, sorted) and the pipeline result are equal with no sidecar, a sidecar, and a throwing sidecar.
3. `onLineage` is called after each stage file is read and before validation, so a later stage's failure keeps the
   earlier stages (test: a verifier failure keeps both reviewers' output and the pool).
4. No new environment variable, flag default or prompt text changed: `ACTION_DEFAULTS` (`scripts/run-tracehound.ts:69`)
   and the three prompt hashes in the record equal those of `d482d38`.

## B. The record holds what the experiments need
5. A record has `lineage` with `v: 1` and the keys `review-diff-v1`, `review-ctx-v1`, `pool`, `verify-ctx-v1`,
   `contracts` (`scripts/run-tracehound.ts:417-420, 460`).
6. Each reviewer entry has its findings and `review.chunks[]` with `index`, `files`, `diffChars`, `status`, `attempts`
   and `attemptsDetail` (`packages/analyzer/src/review/review.ts:38-50`): L2 selects `CHUNK_FAILED` chunks from these.
7. The pool entry keeps the order and each finding's source; the verifier entry keeps every verdict with its reason,
   and the kept file.
8. `usage.stages` and `usage.ledger.costUSD` are present per case; `diff.sha256` and `diff.chars` are present (E1 §2.2
   and §5 read them).
9. The record contains no request bytes, no API key, no environment dump. Model text (finding bodies, verdict reasons)
   is present by design, so records stay out of git (`runs/` is ignored; held-out records go to a private directory).

## C. `replay-arms.ts` rebuilds what was posted, and assumes nothing else
10. A0 replayed from the lineage equals the record's `comments` on the end-to-end fixture (real `runPipeline` over fake
    CLIs); a deliberate mismatch exits 1 and prints `MISMATCH`.
11. **No inclusion is assumed** (audit C073). There is a fixture in which A0 contains a finding that A1's first 15 do
    not (`a0NotInA1 ≥ 1`), and each arm is capped at 15 in its own order.
12. A2 keeps the successful chunks of a partially failed diff review (decision 068), and the test says so.
13. A0 is `unavailable` for a `failed` or `cap` record; A1 and A2 still replay.
14. Contract units: with contracts off (the protocol's setting) no arm carries one. With contracts on, every available
    arm ends with the emitted units and they are outside the 15-comment cap.
15. Case ids that are not plain file names (`../x`, `a/b`, `..`) are refused before any write; nothing appears outside
    `--out`.
16. Two records for one case are refused (`scripts/testset/replay-arms.ts:159`); a record without lineage is refused;
    an existing output file is never overwritten (exit 2).
17. stdout and `replay.json` hold counts only: no finding text, no path from a held-out case when run on one.

## D. Gates
18. In a plain shell, with the `GIT_*` check of `CLAUDE.md` printing nothing: `pnpm test` and `pnpm typecheck` exit 0.
    Record the three test counts.
19. `git grep -n "tracehound-bench\|\.tracehound/cache" scripts/testset/replay-arms.ts` prints nothing: the replay reads
    records only.

## E. Three things most likely to be wrong even after a GO
1. **The identity test passes because the sidecar is not wired in the runner's path.** Check item 5 on a real dry-run
   record shape (the fixture run of item 10), not only on the unit test.
2. **A0's check compares the wrong thing.** It must compare the replayed model findings with what the Action would
   post (after the contract dedupe and the cap), not with `all_findings`.
3. **A rerun record shadows the first.** With `<id>.json` and `<id>.r2.json` in one directory the script refuses; the
   specs copy the official record per case into `official/` first (R1 §3 step 1). If a later change makes the script
   pick one silently, that is a NO-GO.
