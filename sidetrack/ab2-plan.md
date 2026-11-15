# A/B 2: no affected-set packet against the short packet (side track C)

Written 2026-11-16, before any run of either arm with this runner. Dev cases only (the 40-case dev export,
31 bug and 9 clean); a selection set, not a test. Nothing here touches the frozen reviewer, the held-out run
or `main`. Runs use Sunny's Claude subscription through Claude Code; the only paid step is judging.

**Question.** Every scored Sonnet draw so far had an affected-set packet, so nothing shows that the lookup adds
catches. Does the skill reviewer catch fewer bugs when it gets no packet and has to search for the uses itself?

**Arms.** One model, `claude-sonnet-5-5`, on headless Claude Code with the tools Read, Grep and Glob. Same cases,
same diffs (`base_sha..head_sha` of the export), same cap of 6 comments, no contract facts in either arm.

- **N, no packet:** `scripts/track-c/review-case.ts --packet none`. The lookup is not run and `affected.txt` is not
  written. The skill's text is the packet arms' text with its two passages about the affected set replaced
  (`skillBody("none")`): step 1 gives the diff command alone and says to search the repository for the uses of each
  changed declaration; step 2 says to search for the reference sites instead of opening the listed ones. Steps 3
  and 4 and everything before step 1 are byte-identical. sha256 of that text: `5ee39c8996c57c86…`.
- **S, short packet:** `--packet capped`, the adopted form of A/B 1. Skill file
  `.claude/skills/tracehound-review/SKILL.md`, sha256 `9b5e37576228e0f7…`, unchanged since A/B 1.

Runner `track-c-runner@0.3` and lookup `affected@0.5`, both at the commit that follows this file on
`claude/upbeat-lamport-b280zm`; `packages/analyzer/test/track-c-runner.test.ts` pins the hashes above. The lookup
changed since A/B 1 (`affected@0.4`): a declaration the diff only removes lines from is now listed. So the two
short-packet draws of 15 Nov (17 and 17 catches) are not arm S; they are printed beside the result as context.

**Runs.** Two draws per arm, 40 cases each: 160 reviews. Within a draw the cases go in id order and both arms
review a case back to back on the same checkout (the second with `--skip-checkout`). Which arm goes first
alternates by case, starting with N on the first case of draw 1 and with S on the first case of draw 2. The model
id, `claude --version` and the runner commit go into the run folder's README before the first review.

**Failures.** The runner retries an invalid reply once. A case that ends with no review (the account's usage
limit, a timeout) is run once more after the cause has cleared and is flagged in the report. A case with no review
after that counts as a review with no comments.

**Measures, per draw.** Judged catches of 31 by bench-judge-v1, the scorer of record, one judge process at a time,
with bench-judge-x1 beside it if Holt approves the spend; model-free location hits of 31; comments on the 9 clean
cases; comments per case; cases with no comment; turns, input and output tokens, list-price cost and wall time per
case from the run records; for arm S the lookup's time and its counts. Paired counts between arms (caught by N
only, by S only) with an exact two-sided sign test, report only.

**Rule.** Compare the mean judged catches (bench-judge-v1) of the two draws of each arm.

- A difference under 4 catches of 31 is reported as **no detectable change**.
- **The packet is kept as shown to help** only if S's mean is 4 or more above N's and S's mean number of comments on
  the 9 clean cases is not higher than N's.
- **The no-packet arm is kept as better** only if N's mean is 4 or more above S's and N's mean number of comments on
  the 9 clean cases is not higher than S's.
- A gap of 4 or more with more clean-case comments is reported as it is; neither arm is kept on it.

With no detectable change the result reads: the affected-set packet is not shown to add catches on dev. Whether
the packet stays in the reviewer is then Sunny's ruling, with the cost columns beside it; this file decides nothing
further.

**Prediction, recorded before the runs (the author's):** no detectable change.

**Training exposure, counted on 2026-11-16 from the export's fix shas and the dev clones (no model).** Of the 31
bug cases, the fix commit is dated before 1 July 2026 in 0 and after it in 31 (the cutoff classifications agree for 31 of 31 fixes; the exact calendar dates agree for 30 of 31);
the earliest fix is 1 day after that date and the latest 126 days after. The bug-introducing commit is dated
before 1 July 2026 in 24 of 31. Claude Sonnet 5.5's training-data cutoff is published as June 2026, to the month.
So no fix commit predates the published cutoff, the margin is one day for the earliest, and the buggy code itself
predates it in 24 cases. Bug reports and discussion of these bugs before their fixes were not checked.

**Limits.** Dev already has nine or more scored rows; one judge of record; two draws; 31 bug cases, on which
only a gap of about 7 or more is statistically clear; 9 clean cases; 3 of the 31 bugs span more than one file, so
this says little about cross-file bugs in particular. The arms differ in the packet and in the two passages of
text that mention it, and in nothing else.
