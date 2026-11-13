# Runbook H2: scoring the held-out window and the blind hand-check

For codex (operator), Sunny (the hand-check, one sitting of 2–3 hours), artu1 (receives counts; lifts the firewall at
the end). Planner A, 2026-11-11; brought to decision 076d and to decision 076e (item 4, the tag-worktree citation) on 2026-11-13. Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md`
§4, §10 (it wins over this runbook). Budget line: **H2, cap $0.40**. Starts after H1's snapshot is hashed.

**Order fixed by decision 076a §13.7:** sheet hashed → unblind → score files hashed and committed → the firewall lifts.
Nothing in a later step may be seen before the earlier one is done.

```sh
TH=~/Projects/th-h1; HO=~/Projects/tracehound-ho-window; S=$HO/score; mkdir -p $S
export TH_MAIN=~/Projects/TraceHound TH_TAG=$TH      # names used by docs/eval/tag-worktree.md (codex, 775c3d6)
ledger() { ( cd $TH && node --env-file=.env packages/analyzer/src/spend.ts ) | sed -n 's/^Total est. spend: \$\([0-9.]*\).*/\1/p'; }
POLICY=$TH/scripts/testset/policy.076c.json      # the 076a choices plus registered_tests (two pairs, 0.05, floor 15)
POLICY2=$TH/scripts/testset/policy.076a.json     # for the secondary rows only: no registered test, so no p-value
G=$HO/goldens                                    # goldens built and hashed at F1 §4.3
ARM=<candidate arm directory name, from decision 077>
SEED=<the hand-check seed in docs/bench/ts-freeze.md>
```
Every kit command below carries `--side heldout --heldout-ok` (written once here, omitted in the lines for length).

## 1. Assemble the rows (no model call)
0. **Nothing changed since the freeze (premortem gap G9).** From the directory where F1 wrote it:
   `shasum -a 256 -c $HO/hashes.freeze.txt` prints `OK` for the manifest, the label files, the overlay and every file
   of `$HO/goldens`. `shasum -a 256 docs/runbooks/H1-window.md docs/runbooks/H2-scoring.md` in `$TH` equals the two
   values in `docs/bench/ts-freeze.md`. Any `FAILED` or difference: stop and tell Sunny; do not score.
   **The records are the frozen run (gap G8):** H1 §4's record check printed one line equal to the freeze, by codex and
   by grok. **No unlisted Bot login (gap G6):** H1 §6's count is zero, or Sunny's ruling on it is recorded. Otherwise stop.
   **The ledger H2 judges against is the main one (decision 076c item 9):** the verifier block of
   `docs/eval/tag-worktree.md` (codex, `775c3d6`, on `main` since merge `64a23a4`) exits 0 before the first judge
   process, with `samePhysicalLedger: true`
   and equal totals. The worktree's ledger is the main checkout's file, so H1's spend is already in it; nothing is
   copied or merged (`F1-freeze.md` §4.2). No other paid process runs during §2 (076c item 1).
1. Official TraceHound records: `mkdir $S/official`; per case copy `<id>.r2.json` where a rerun exists, else `<id>.json`,
   from `$HO/th`. A case with no record stays absent (it is a miss by policy `unstarted_case: miss`).
2. `node scripts/testset/replay-arms.ts --records $S/official --out $S/arms` → exit 0. Exit 1 (A0 differs from the
   posted comments): stop and tell Sunny; do not score.
3. External tools: merge the per-repository collections of H1 §6 (for each repository the last complete one, and
   the `-untriggered` directory if H1 made one with `--bound window-start`; decision 076d item 4) into one directory and one status file per tool:
   `mkdir -p $S/coderabbit $S/greptile; cp $HO/tools-*/coderabbit/*.json $S/coderabbit/; jq -s add $HO/tools-*/coderabbit.status.json > $S/coderabbit.status.json`
   (and the same for greptile).
4. Rows. **Primary (these three make the claim):** `tracehound` = `$S/arms/$ARM`, `coderabbit`, `greptile`.
   **Secondary (report only, judges only, not hand-checked):** the two TraceHound arms that are not the candidate.
   **Registered pairs (decision 076c item 4): TraceHound vs CodeRabbit and TraceHound vs Greptile**, each an exact
   two-sided sign test at 0.05, uncorrected, exact p reported. CodeRabbit vs Greptile is counts only. A secondary row
   is never tested.
5. **The exposed set (decision 076d item 1d and addendum e; decision 076e item 4: one set for every tool, the union
   over CodeRabbit's and Greptile's reviews, no scorer change). codex makes it on the held-out side; only counts leave
   `$HO`.** A bug case is *exposed for a review* if, when that review was made, the case's starting fix could be
   reached from a case branch on the same fork other than the case's own two (`git merge-base --is-ancestor <fix> <tip>`,
   the method of `run/out/grok.ancestry.md`). **Exposure is judged per review at its actual time, from the
   scheduler's branch log, not from the planned slot order** (addendum e).
   - *Which review:* per external tool and bug case, the completed review the collection counts (after a re-trigger,
     the re-triggered one). *Its time:* the latest timestamp among that tool's objects on the PR that the collector
     counted or used for completion (raw files).
   - *What was on the fork then:* the case branches in the `fork-branches` records of that fork up to that time
     (`$HO/sched/scheduler.log.jsonl`: every branch and tip, logged right before each trigger and each re-trigger
     command), together with any case whose `pushed` record in the resume file is at or before that time (a push is
     logged before the next branch read). The records must show no `cases/` branch that is not on the case list; if
     one does (a dev branch that was not deleted), stop and tell Sunny in counts.
   - *Flags:* exposed yes / no per (tool, bug case) with a completed review → `$HO/exposure.reviews.json` (private).
   - *The one set for the scorer:* `$S/exposure.json` = `{"v": 1, "exposed": [<bug case ids>]}`: a bug case is in it
     if **either** external tool's review of it was exposed. One set means the exposed and the unexposed group hold
     the same cases in all three rows (the protocol's common denominators, §4). TraceHound reads no fork; it is split
     on the same cases only so the rows can be read side by side. A bug case no external tool reviewed is unexposed.
   - *Against the frozen first-review file:* codex's exposure file frozen before T0 says which cases are exposed at
     their first review under the push order (expected none: 0 of 20, decision 076d's correction). `$S/exposure.json`
     can only add cases to it (a re-trigger made after later branches were pushed, a review that arrived late).
     Report both sizes and the number added.
   - grok derives the flags on its own from the same hashed inputs; the two files are equal (`cmp`), or stop.
   Both files are hashed with the rest in §6 step 5 and are made **before** §2, so no judged number is known when the
   set is fixed.

## 2. Judging (the only paid step)
`L0=$(ledger); echo "H2 L0=$L0 $(date -u +%FT%TZ)" >> $S/job.md` (the job-start value lives in the job file; every
later judge process reads it back with `L0=$(sed -n 's/^H2 L0=\([0-9.]*\) .*/\1/p' $S/job.md | head -1)` and never
measures it again; gap G19, decision 076c item 1). `$L0 + 0.40` must not exceed the main `.env`'s hard stop. **Order (gap G13): the three primary rows first** (tracehound,
coderabbit, greptile), each with bench-judge-v1 and then bench-judge-x1; **then** the two secondary rows the same way.
One process after the other:
```sh
E="TRACEHOUND_BUDGET_RUN_USD=0.40 TRACEHOUND_BUDGET_TOTAL_USD=$(echo "$L0 + 0.40" | bc)"
env $E node $TH/packages/analyzer/src/bin.ts bench score --golden $G/bench-golden.json --reviews <row dir> --detail $S/judge/<row>.v1.json --concurrency 1
env $E node $TH/packages/analyzer/src/bin.ts bench score --golden $G/bench-golden.json --reviews <row dir> --detail $S/judge/<row>.x1.json --concurrency 1 \
  --model Qwen/Qwen3-235B-A22B-Instruct-2507 --reasoning off
```
At most 5 rows × 20 bug cases × 2 judges = 200 calls (a clean case or an empty review makes none,
`packages/analyzer/src/bench/score.ts:125-126`). A refused call (cap) or a `JUDGE_FAILED` entry: note the count; rerun
that one process once into a new detail file name (`…v1.b.json`) if money is left under the $0.40; never edit a detail
file. At most one re-run per judge process (question U9 of `run/comms/planner.b.d1-review.md`, adopted by 076c item 5). **When a row has two detail files for one judge, the later one is the official one** and is the one passed to
`score-testset.ts` and `handcheck-sheet.ts`; the earlier one is kept and hashed (gap G13). If the cap is reached with rows unjudged, the secondary rows are the ones left unjudged, and the report says so.

## 3. Pre-check tables (private; nobody but codex reads them)
```sh
node scripts/testset/location-hit.ts --goldens $G/goldens.json --tool tracehound=$S/arms/$ARM --tool coderabbit=$S/coderabbit --tool greptile=$S/greptile --out $S/location.json
node scripts/testset/score-testset.ts --goldens $G/goldens.json --policy $POLICY \
  --tool tracehound=$S/arms/$ARM --tool coderabbit=$S/coderabbit --tool greptile=$S/greptile \
  --judge tracehound=$S/judge/tracehound.v1.json --judge coderabbit=… --judge greptile=… \
  --judge-x1 tracehound=$S/judge/tracehound.x1.json --judge-x1 coderabbit=… --judge-x1 greptile=… \
  --records tracehound=$HO/th --status coderabbit=$S/coderabbit.status.json --status greptile=$S/greptile.status.json \
  --exposure $S/exposure.json --out $S/summary.judges.json
```
`--exposure` (`82b65e4`) adds, per tool, the counts on the exposed and on the unexposed bug cases; an id in the file
that is not a bug case of the goldens refuses.
This is the judges-only result. It is **not** the headline and is not shown to Sunny before his sitting.

## 4. The blind sheet
```sh
node scripts/testset/handcheck-sheet.ts build --goldens $G/goldens.json --policy $POLICY \
  --tool tracehound=$S/arms/$ARM --tool coderabbit=$S/coderabbit --tool greptile=$S/greptile \
  --judge … (the three v1 details) --judge-x1 … (the three x1 details) --seed $SEED --strip scripts/testset/strip.json --out $S/sheet
grep -i -c 'coderabbit\|greptile\|tracehound' $S/sheet/sheet.md        # must print 0
shasum -a 256 $S/sheet/sheet.md $S/sheet/decisions.json $S/sheet/mapping.json $S/sheet/hashes.json > $S/sheet.blank.sha256
```
- Candidates on the sheet (protocol §10): every comment either judge matched, and every comment within ±10 lines of
  any target. So every judge disagreement is on it. Everything else stays unmatched; say so in the write-up.
- If the `grep` prints anything but 0: do **not** edit `strip.json` (it is frozen). Tell Sunny the count; he decides
  whether to proceed with a known cue or to void the sheet. Record the decision.
- codex gives Sunny `sheet.md` and `decisions.json` only. `mapping.json` never leaves `$HO`.
- **The guess column (premortem gap G3; decision 076c item 7).** Every item of `decisions.json` has three fields to
  fill: `decision`, `reason` and `guess` (`buildSheet` in `scripts/testset/handcheck-sheet.ts`, `595707f`, on `main` since
  merge `2e971c5`; it writes `guess: null`). The sheet itself still names no tool, so the `grep` above stays at 0; the
  allowed guesses are given in §5, not on the sheet.

## 5. Sunny's sitting (one sitting; nobody helps; no tool output open elsewhere)
The two definitions below are the hand-check's rule for "same bug". They are frozen twice: this file's sha256 is in
`docs/bench/ts-freeze.md`, and the protocol's §10 carries the same definitions (question U10, 076c item 5); if the two
texts differ, the protocol's is used and the difference is reported before the sitting.
For each item the sheet shows the labelled bug (description and locations) and one comment. Write in `decisions.json`:
- **`same-bug`** if the comment points at the labelled defect: the same faulty behaviour, at the labelled place or at a
  place the label lists. Different words are fine. A correct fix suggestion is not required.
- **`not`** if it is about something else in the same file or nearby, is too vague to tell which defect it means, or
  only restates what the code does. When unsure, write `not` and the reason "unsure".
- A reason of a few words for every item.
- **Then, as a second pass, the guess (gap G3):** when every decision is written, and before sending the file, go
  through the items once more and write in `guess` which tool you think wrote the comment: `tracehound`, `coderabbit`,
  `greptile`, or `unsure`. Guess from the comment as it stands on the sheet. Do not change any `decision` or `reason`
  during this pass. `unsure` is a full answer; a blank is not (the resolve step refuses it). The guess never changes a
  catch: it measures whether the sheet left cues, and the report gives the hit rate in one line.
Rules: decide every item (the resolve step refuses a blank). Do not look up the PR, the fix or any tool's page. Since
T0 Sunny has opened no vendor dashboard, no fork PR and no GitHub mail from the four forks (`F1-freeze.md` §1 row 13,
gap G2); if he did, he says so before the sitting and it is written into the report. Do not
go back and change earlier items after seeing later ones, except for a slip noticed at once. Note the start and end time.
When done, Sunny sends `decisions.json` back and says "final".

## 6. Hash, unblind, final score
1. `shasum -a 256 $S/sheet/decisions.json > $S/sheet.filled.sha256`; codex sends Sunny that hash; Sunny confirms it
   matches his file. The decisions and the guesses are in that one file, so one hash freezes both. **Only then:**
2. `node scripts/testset/handcheck-sheet.ts resolve --mapping $S/sheet/mapping.json --decisions $S/sheet/decisions.json --out $S/handcheck.json`
   It refuses (exit 2, nothing written) an item with no decision or with no guess, and a guess that is neither a
   `--tool` name nor `unsure` (`resolve` in `handcheck-sheet.ts` as of `595707f`). If it refuses for a guess, Sunny
   fills the missing guesses **before anything is unblinded**, the file is hashed again (both hashes are kept), and
   step 1 is repeated. `handcheck.json` gets counts only: `guess: {items, guessed, unsure, right, tools, commonestToolItems}`.
3. Final tables: the §3 `score-testset.ts` line again (same `--exposure` file) with `--handcheck $S/handcheck.json --out $S/summary.final.json`.
   Per tool it prints `exposed bug cases E: caught K, completed C · unexposed bug cases U: caught K, completed C`
   (`main` in `scripts/testset/score-testset.ts`, `82b65e4`), and the summary records the exposure file's sha256.
   It prints one line, `hand-check guess: right R of G guessed (U unsure, N items, K tools; uniform chance 1/K; always
   naming the commonest tool: M of N)`, and writes the same counts as `handcheckGuess` into the summary (`main` in
   `scripts/testset/score-testset.ts` as of `595707f`).
4. Secondary rows: one more `score-testset.ts` run with the two other arms, their v1 and x1 details, no `--handcheck`,
   `--policy $POLICY2` (a policy that registers a tool which is not a `--tool` refuses, and a secondary row is never
   tested), `--out $S/summary.secondary.json`.
5. `( cd $S && find . -type f | sort | xargs shasum -a 256 > ../hashes.score.txt ); shasum -a 256 $HO/hashes.score.txt`
5b. **A second run of the final score (gap G7).** grok, from the same hashed inputs and the same command line, runs
   step 3's `score-testset.ts` into its own directory (`$HO/score-grok/summary.final.json`). `cmp` of the two
   `summary.final.json` files prints nothing. A difference: stop; nothing is committed until codex and grok have found
   it and Sunny has been told.
6. codex checks `summary.final.json` and `summary.secondary.json` contain **no case id, title, path or comment text**
   (`grep -c 'ho-[0-9]' …` prints 0; the kit writes counts only). If they do, strip nothing by hand: report it and stop.
   Also (076c items 4 and 6): a p-value appears only for the two registered pairs, and only where at least 15 bug
   cases were reviewed by both (the kit does this since `82b65e4`: `registered_tests` in the policy; every other pair
   has `p: null`). Check: `jq '[.pairs[]|select(.p!=null)|[.a,.b]]' $S/summary.final.json` lists at most the two
   registered pairs, and the same on `summary.secondary.json` prints `[]`. Anything else: report it and stop.
7. codex commits to `TraceHound/docs/bench/`: `ts-heldout.summary.json` (a copy of `summary.final.json`),
   `ts-heldout.secondary.json`, and `ts-heldout.hashes.md` with the three single-line hashes (window, blank sheet +
   filled sheet, score) and the counts of §7. Push.
8. **The firewall lifts** for artu1 and bunny when that commit is on `main`. artu1 records the time in STATE. The lift
   does not allow changing the frozen reviewer or the scored protocol (protocol §10).

## 7. Report: `run/out/codex.ho-score.md` (counts only)
Per primary tool: completed of 29 (bug n, clean m); caught K of 20 by v1, by x1, by the hand-check; Wilson interval of
the hand-check K; comments per attempted and per completed PR (mean, median); comments on clean cases; location hits.
Pairs: for the two registered pairs (TraceHound–CodeRabbit, TraceHound–Greptile) paired n, only-A, only-B and the
exact p; for CodeRabbit–Greptile paired n, only-A, only-B and **no p** (076c item 4); and per
pair **m = bug cases reviewed by both** (both statuses `completed`; the kit prints it as "reviewed by both",
`82b65e4`). 076c item 6: below m = 15 the pair is counts only, and the kit prints no p for it.
**Exposure (decision 076d item 1d; addendum e), per primary tool, two lines copied from the kit:** exposed bug cases
E: caught K, completed C; unexposed bug cases 20 − E: caught K, completed C. With E = 0 the first line is written
"0 of 0 (no exposed bug cases)", never as a rate. Beside them: E at first review from the frozen file (expected 0),
the number of cases added by a re-trigger or a late review, and per external tool how many of its own completed
reviews were exposed. No test is made on either group. Hand-check:
items on the sheet, `same-bug` count, judge-matched items Sunny rejected, location-only items Sunny accepted, sitting
length. **Guess (gap G3), one line, copied from the kit's output:** "hand-check guess: right R of G guessed (U unsure, N
items, 3 tools; uniform chance 1/3; always naming the commonest tool: M of N)". No adjective is added to it. Judging: calls, `JUDGE_FAILED`, spend. TraceHound cost per PR (mean, median, max, total) from the records.

## 8. Failures and rules
| failure | rule |
|---|---|
| A detail file does not cover a completed bug case | `score-testset.ts` refuses (exit 2). Re-judge that row once; never mark the case a miss by hand. |
| A status file holds `read-failed` | `score-testset.ts` refuses (exit 2, no output; `main` → `toStatus` at `6fd4568`). It is not a result: H1 §6's repeat collection was skipped. Go back to it (window end unchanged), hash the new directory, then score. Never edit a status file. |
| The exposed set cannot be derived (a `fork-branches` record is missing for a trigger that posted, or codex's and grok's flags differ) | Do not judge. Find the cause from the scheduler's log and the resume files. A post with no branch record before it should not exist (the scheduler posts nothing when the list cannot be read); if one does, that review is marked exposed (the conservative side), the count is reported, and Sunny is told. |
| A status file holds `invalid-binding` | Nothing to do by hand: the scorer counts the case as `no-review` for that tool, leaves it out of that tool's pairs and prints "no-review N (invalid-binding k)". The count goes into the report. |
| Sunny cannot finish in one sitting | He stops, the partial file is hashed and kept, and he finishes in a second sitting without seeing anything else in between; the report says "two sittings". |
| Sunny's file hash does not match | Use his file; hash again together; never the operator's copy. |
| Sunny wants to change a decision after unblinding | Not allowed. It is recorded as a note next to the result. |
| Sunny sent the file with guesses left blank | `resolve` refuses. He fills them before unblinding (§6 step 2). If anything was unblinded first, the guesses are not collected afterwards: the report line says "guess not collected" and why. |
| The two judges disagree on many items | Nothing to do: the hand-check decides, and the disagreement count is reported. |
| A label looks wrong to Sunny during the sitting | He writes it in the reason. No relabelling, no dropped case (protocol §9). It is listed under limits in the write-up. |

## 9. The three most likely ways to get this wrong
1. **Unblinding early.** Running `resolve`, or showing any per-tool table to Sunny, before his filled sheet's hash is
   confirmed, makes the hand-check an interested party's check again (plan v1 M10).
2. **Scoring a different arm than the frozen candidate.** `$ARM` comes from decision 077, not from whichever arm looks
   best in `summary.judges.json`. The other two arms are secondary rows whatever they score.
3. **Committing private content.** Only the three files of step 6.7 go to the repo, and only after the check of step
   6.6. Records, details, the sheet and the mapping stay in `$HO`.
