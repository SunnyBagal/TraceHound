# A/B 1: a short affected-set packet (side track C)

Written 2026-11-15, before any arm B run. Dev cases only (the 40-case dev export); a selection set, not a test.

**Question.** Does a shorter packet (only declarations referenced outside the diff, at most 30, at most 5
references each, each tagged with its relation) change what the skill reviewer catches, against the full packet?

**Arms.** Same skill text in both (`.claude/skills/tracehound-review/SKILL.md`, sha256 `9b5e37576228e0f7…`), same tools
(Read, Grep, Glob), same cases, same diffs, no contract facts (the contract check returned none).
- A: full packet, `formatAffected` of `affected@0.3`, runner at `ba8de49`.
- B: short packet, `formatAffectedCapped` of `affected@0.4`, runner at the commit that adds this file, `--packet capped`.

**Runs.** Two draws per arm per model (Haiku, Sonnet), 40 cases each. A: the draw of 14–15 Nov
(`sidetrack/runs/2026-11-15/`) and a second draw started today before this file was committed, not yet scored.
B: two draws started after this commit. Each model is its own A/B; the models are not pooled.

**Measures, per run.** Judged catches of 31 (proxy judge: bench-judge-v1's prompt and reply check on Claude
Sonnet, one run judged at a time; not the scorer of record), model-free location hits of 31, comments on the 9
clean cases, comments per case, cases with no comment, list-price cost and wall time per case, and the packet's
size in lines.

**Rule.** Per model, compare the mean judged catches of the two draws of each arm. A difference under 4 catches
of 31 is reported as no detectable change. B replaces A only if, on both models, it shows no detectable loss
of catches, its mean clean-case comments are not higher, and its median list-price cost per case is not higher.
A loss of 4 or more on either model kills B. Anything else: A stays and the numbers are reported.

**Limits.** One proxy judge; two draws; each case reviewed as base..original commit, whose tree is not verified
equal to the case head; training-data exposure of these pull requests is not checked. The labels are read only
by the scoring script.
