# A/B 3: Sonnet pooled with a second model against Sonnet alone (side track C)

Written 2026-11-16, before any run. Dev cases only (the 40-case dev export, 31 bug and 9 clean); a selection set,
not a test. Nothing here touches the frozen reviewer, the held-out run or `main`. Runs use Sunny's Claude
subscription through Claude Code; the only paid step is judging.

**Question.** Does a second model's review of the same pull request, merged into Sonnet's and de-duplicated,
catch more bugs than Sonnet's review alone, without more comments on clean pull requests?

**Second model.** `claude-opus-5-5` (Sunny, 16 Nov). It runs through the same runner on the subscription, so there
is no API spend and no second harness. Haiku was not chosen: on the 15 Nov draw it caught nothing that Sonnet
missed.

**Arms.** Same cases, same diffs (`base_sha..head_sha` of the export), same skill file
(`.claude/skills/tracehound-review/SKILL.md`, sha256 `9b5e37576228e0f7…`), same tools (Read, Grep, Glob), the short
packet (`--packet capped`, `affected@0.5`), no contract facts, runner `track-c-runner@0.3`.

- **A, Sonnet alone:** `claude-sonnet-5-5`, at most 6 comments per case.
- **P, pooled:** the same Sonnet review merged with a `claude-opus-5-5` review of the same case by
  `scripts/track-c/pool-reviews.ts` (`track-c-pool@0.1`), with Sonnet as the primary.

**Pooling rule, fixed here and in the script's header and tests; no model.** Two comments are the same finding
under decision 058's agreement rule: the same path after normalising, both lines present, lines within 3 of each
other. An Opus comment that is the same finding as any Sonnet comment is dropped and Sonnet's wording stands. The
pooled review lists the Sonnet comments Opus also made, then Sonnet's other comments, then Opus's remaining
comments, and keeps at most 6: the cap of one reviewer alone. No comment text is rewritten or merged.

**Runs.** Two draws. Draw d of arm P pools Sonnet's draw d with Opus's draw d. Arm A's two draws are the two
short-packet Sonnet draws of A/B 2 (`sidetrack/ab2-plan.md`, arm S): the same review files, not new runs, so the
two tests share data and are not independent. New runs for this plan: two Opus draws, 80 reviews. If A/B 2 is not
run, arm A gets its own two Sonnet draws under this plan's settings. The Opus review of a case follows the Sonnet
reviews of that case on the same checkout (`--skip-checkout`). The model ids, `claude --version` and the runner
commit go into the run folder's README before the first review.

**Failures.** As in A/B 2: one more run after the cause has cleared, flagged; after that a missing review counts
as a review with no comments, for the pool too.

**Measures, per draw.** For A, for P and for Opus alone: judged catches of 31 by bench-judge-v1, the scorer of
record, one judge process at a time; location hits of 31; comments on the 9 clean cases; comments per case; cases
with no comment. From `pool-counts.json`: comments of each model, findings both made, comments Opus added,
comments cut by the cap. Cost per case: for P the sum of the two reviews' list-price cost, tokens and wall time.
Paired counts A against P with an exact two-sided sign test, report only.

**Rule.** Compare the mean judged catches (bench-judge-v1) of the two draws of each arm.

- A difference under 4 catches of 31 is reported as **no detectable change**.
- **Pooling is kept** only if P's mean is 4 or more above A's and P's mean number of comments on the 9 clean cases
  is not higher than A's.

Pooling can only add comments to Sonnet's, so the second condition means in practice that Opus adds no comment on
a clean case in either draw (or the cap removes it). That is strict on purpose: a second review that buys catches
with new comments on clean pull requests is not kept by this plan.

**Control, report only.** The two Sonnet draws pooled with each other by the same script (draw 1 as primary, draw
2 as second), judged the same way. On 15 Nov two Sonnet draws had a union of 19 catches against 17 each. If P is
not 4 or more above this control, a gain is not shown to come from the second model and not from a second draw.
This line does not change the rule above; it is printed beside it.

**Relation to a lever that lost.** Decision 064 (a vote over five runs of the pipeline) lost. This differs in three
ways: it is a union with de-duplication, not a vote; the second review comes from a different model; and the
reviewer is the agentic skill, not the pipeline. That is the reason to test it, not a reason to expect it to win.

**Prediction, recorded before the runs (the author's):** P's mean is fewer than 4 above A's, and Opus adds at
least one clean-case comment, so pooling is not kept.

**Training exposure.** As counted in `sidetrack/ab2-plan.md` on 2026-11-16: 0 of the 31 fix commits are dated
before 1 July 2026 (the earliest is 1 day after); Claude Opus 5.5's training-data cutoff is published as June
2026, the same as Sonnet 5.5's.

**Limits.** Those of A/B 2. Also: the two models are from one family, so their misses may overlap more than two
unrelated models' would; arm P costs the sum of two reviews and the plan sets no cost condition, so the cost
columns are for Sunny's reading; Opus's usage counts against the same subscription limit as Sonnet's.
