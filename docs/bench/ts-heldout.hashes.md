# Held-out score hashes (H2)

Headline: the hand-check on the 20 held-out bug cases. Judge-only counts are labelled as such. One sitting.

## Hashes

```
window 44ab7dd3f21b3d75a841d000f84883ac20d2f4f27e86707cffba5ca2bb1ce932
blank-sheet+filled-sheet 1321859a2defab96f1c5ee93fa4d7b86ac9e363f61a723663e75fe6007bd0b73
score 7846bb2dfd4d7c5ff48081d65b33d2722faa48db48ea9bda90bade8efebcbbb5
```

`window` is the sha256 of the window hash list (654 files, verify 654 OK). `blank-sheet+filled-sheet` is the sha256 of the blank-sheet hash file, a newline, and the filled-sheet hash file. Sunny confirmed the filled decisions file sha256 `e9931b838ceeacfa4b430f9d6f5810789b6df187f61753042052c831c2608c78`. The blank-sheet hash file's own sha256 is `d80b4802514f7684e2db5e698ec20f61f6e47153a4206e172be8ae1ea7ce11b2`. `score` is the sha256 of the score-directory hash list, taken after the pooled file and the Haiku comparison file existed (2026-11-22T08:28:13Z). A second run of the final score compared equal to `ts-heldout.summary.json`.

`grep` of `ho-[0-9]` on the three summary files is 0. A p-value is present only for TraceHound–CodeRabbit and TraceHound–Greptile. The secondary summary's p-value list is empty.

## Primary tools (hand-check)

Completed 29 of 29 for each tool (bug 20, clean 9). No-review 0. Invalid-binding 0. Judge-failed 0. x1 judge-failed 0. Re-triggers posted 0.

| tool | hand-check | Wilson | v1 (not the headline) | x1 | 0 inline of 29 | comments | per attempted and completed | clean comments | location |
|---|---|---|---|---|---|---|---|---|---|
| TraceHound A0 `pool-verify-v1` | 4/20 | 8.1–41.6% | 6 | 9 | 16 | 22 | mean 0.76 median 0.00 | 2 | 7/20 |
| CodeRabbit | 10/20 | 29.9–70.1% | — | 15 | 3 | 82 | mean 2.83 median 2.00 | 15 | 13/20 |
| Greptile | 12/20 | 38.7–78.1% | — | 17 | 3 | 79 | mean 2.72 median 3.00 | 13 | 13/20 |

TraceHound cost from the records: total $1.7485, mean $0.0603, median $0.0487, max $0.1309. A0 records 29/29 ok. Failed chunks 3, in 3 records. Empty comment lists 16.

Exposure, copied as counts. Exposed bug cases: 0 of 0 (no exposed bug cases). Unexposed bug cases 20: TraceHound caught 4, completed 20; CodeRabbit caught 10, completed 20; Greptile caught 12, completed 20. E at first review from the frozen planning file: 0 of 20. Observed exposure at the snapshot: 0 bug cases. Cases added by a re-trigger or a late review: 0. Completed reviews on an exposed bug case: 0 for each primary tool. No test is made on either group.

## Pairs

Reviewed by both is 20 for every pair below, so the floor of 15 is met.

TraceHound vs CodeRabbit, registered: paired n 20, TraceHound only 2, CodeRabbit only 8, both 2, neither 8, exact two-sided p 0.109375. Level 0.05, uncorrected, one of two registered tests. The comparison does not reject.

TraceHound vs Greptile, registered: paired n 20, TraceHound only 0, Greptile only 8, both 4, neither 8, exact two-sided p 0.0078125. Level 0.05, uncorrected, one of two registered tests. The comparison rejects. The gap is those 8 discordant cases on n 20.

CodeRabbit vs Greptile: paired n 20, CodeRabbit only 1, Greptile only 3, both 9, neither 7. Counts only. No p.

## Hand-check

One sitting. Sunny stated the length as 3 hours 7 minutes. No start or end clock was recorded. Before the sitting he answered: "No i haven't opened the dashboard and any of the github mail. Started". The question named the vendor dashboard, the fork pull requests, and GitHub mail.

Sheet items 61. `same-bug` 27. `not` 34. Judge-matched items Sunny rejected: 24. Location-only items Sunny accepted: 0.

hand-check guess: right 25 of 61 guessed (0 unsure, 61 items, 3 tools; uniform chance 1/3; always naming the commonest tool: 25 of 61)

## Judging

Step 0, one uncached request each, both HTTP 200, inside L0. L0 after step 0: $49.84683 at 2026-11-22T04:49:26Z. Judging 2026-11-22T04:50:03Z–04:54:52Z: 14 processes, each exit 0, JUDGE_FAILED 0. Ledger: 163 `bench-judge` calls (v1 83, x1 80), all ok, provider Nebius, $0.076046, 0 failures. Ledger after judging $49.92287. No x1 fallback.

## Haiku (secondary, registered, judges only, not hand-checked, Sunny's own money)

Each draw: official records 29/29 ok, reruns 0, misses 0, failed chunks 0, JUDGE_FAILED 0.

| draw | v1 | x1 | 0 inline of 29 | comments | per PR | clean comments | location | cost |
|---|---|---|---|---|---|---|---|---|
| haiku1 | 6/20 | 6 | 19 | 21 | mean 0.72 median 0.00 | 4 | 7/20 | $0.1864 (mean $0.0064, median $0.0058, max $0.0124) |
| haiku2 | 7/20 | 8 | 14 | 24 | mean 0.83 median 1.00 | 3 | 6/20 | $0.1864 (mean $0.0064, median $0.0060, max $0.0141) |

v1 matrix against A0's v1 count of 6, n 20, missing 0, judge-failed 0. Haiku draw 1: both 3, A0 only 3, Haiku only 3, neither 11, K 6. Haiku draw 2: both 3, A0 only 3, Haiku only 4, neither 10, K 7. Mean of the two draws 6.5. Difference from A0's v1 count: +0.5. The mean of Haiku's two draws under v1 is not more than 2 behind A0's v1 count.

x1 beside it, which changes nothing. A0 x1 K 9. Draw 1: both 4, A0 only 5, Haiku only 2, neither 9, K 6. Draw 2: both 5, A0 only 4, Haiku only 3, neither 8, K 8.

The two Haiku ledger totals sum to $0.3727592 of the $1.00.

## Secondary rows (judges only, not hand-checked)

| row | v1 | x1 | Wilson of v1 | comments | location |
|---|---|---|---|---|---|
| pool-raw (A1) | 6/20 | 10 | 14.5–51.9% | 38 | 8/20 |
| review-diff-v1 (A2) | 5/20 | 11 | 11.2–46.9% | 29 | 7/20 |

All six secondary pairs are counts only. The secondary policy registers no test.

Pooled secondary (31 dev bugs + 20 held-out bugs, nominal 51). Dev exposure beside it: 10 of 31. Held-out catches in the pool are the hand-check. A0 16/51, CodeRabbit 29/51, Greptile 30/51. A0 vs CodeRabbit: only A 3, only B 16, p 0.004425048828125. A0 vs Greptile: only A 1, only B 15, p 0.000518798828125. Floor met on the held-out pair (20 ≥ 15). This pool is not the headline.
