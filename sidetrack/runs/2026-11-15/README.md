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
