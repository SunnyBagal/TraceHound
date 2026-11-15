# Side track C: skill reviewer on the 40 dev cases, draw 1 (2026-11-15)

Reviews only, in the neutral format of decision 054 (`<case>.json`: `pr_title`, `comments[path, line, body]`).
No labels, no judge output.

- `haiku-skill/`: `claude -p --model haiku`; `sonnet-skill/`: `claude -p --model sonnet`. One draw each, 40 of 40 completed, no retry.
- Runner `scripts/track-c/review-case.ts` at `ba8de49` (`track-c-runner@0.1`), skill `.claude/skills/tracehound-review/SKILL.md`,
  lookup `affected@0.3`. Tools: Read, Grep, Glob. At most 6 comments per case.
- Each case was reviewed as `base_sha..head_sha` of the dev export (the original commit; its parent is `base_sha`
  in 40 of 40). The case-head commits were not fetchable, so equality of that tree with the case head is not verified.
- Contract findings given to the reviewer: 0 in every case (the contract check returned none).
- Line numbers are head-side lines of that diff.

To score with the scorer of record, point `tracehound bench score --reviews` (and `scripts/testset/score-testset.ts --tool`)
at one of the two directories.

## Added later on 15 Nov

- `sonnet-skill-draw2/`: a second draw of `sonnet-skill`, same code (`ba8de49`), same inputs. 32 cases completed before the
  account's usage limit was reached; the other 8 (cases 023, 025, 027, 028, 032, 037, 039, 040) failed at the limit with no
  review and were run once after it reset. 40 of 40 reviews, each from a single completed attempt.
- `proxy-judge-caught.json`: the case ids the proxy judge (bench-judge-v1's prompt on Claude Sonnet) counted as caught in
  the two draw-1 folders. Not the scorer of record; kept so the proxy can be compared with the real judge.

## Typed facts (narrow typed check)

`src/affected/typed-narrow.ts` (`typed-narrow@0.2`) completed on 40 of 40 cases and produced one finding, in one case
(case-025). Only that case's input changed, so only that case was reviewed again, twice, with the finding given as a fact:

- `sonnet-skill-typed-facts-draw1/` = `sonnet-skill/` with `case-025.json` replaced by the review made with the fact;
- `sonnet-skill-typed-facts-draw2/` = `sonnet-skill-draw2/` with `case-025.json` replaced the same way.

The other 39 files in each folder are byte-identical copies. Compare the pairs on case-025 only.
