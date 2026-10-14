# TraceHound reviewer plan (written 7 October 2026)

Owner's decision, 7 October: TraceHound becomes a pull-request reviewer, measured on a public benchmark. Deadline 30 October; the last three days are for submission and video.

## Target

- Dataset: the 50-PR code review set first published by Greptile, with the corrected golden comments from `github.com/ai-code-review-evaluations/golden_comments`, pinned at `3f2c8ab794b4ed71c099cbf0a7670555e90906dc` (21 November 2025).
- Test set: the Cal.com PRs (TypeScript). 10 PRs, 31 golden comments in the JSON file, 23 of them Medium or above. The dataset's README says 32.
- Dev set: everything else in the dataset, Grafana first. Nothing is tuned on Cal.com.
- Goal: on our own scorer, a higher F-score on the Cal.com PRs than Greptile's and CodeRabbit's recorded reviews of the same PRs. Their recorded review comments are in that organisation's per-tool forks (`greptile-cal_dot_com`, `coderabbit-cal_dot_com`, 10 PRs each).
- Why our own scorer: the published numbers disagree. On the same 50 PRs Greptile reports 82% catch rate for itself and 44% for CodeRabbit; Tenki reports recall 36% and 29%; Augment reports F-score 45% and 39%. Scoring every tool with one judge is the only comparison we can stand behind.

## Limits, stated first

- n = 10 PRs. Whatever the result, the interval is wide.
- The PRs have been public since 2025. Models may have seen them. This applies to every tool.
- This is not parity with either product. They cover many languages, integrations, learned preferences and scale. The claim is one benchmark slice.
- Cal.com is about 710,000 lines and 6,900 files. The analyzer has only been shaped on two small repos, and study S1 found the graph weak on unseen repos.
- Decision 050 stands: the graph did not help the repair agent, and the agent made 0 graph tool calls in 80 runs. So context is injected deterministically here, never offered as an optional tool, and graph-on against diff-only is measured on the dev set before anything else is built on it.

## Pipeline (PR in, line comments out)

1. Deterministic, no model: declaration-level diff (change sets), callers and usage sites of each changed declaration, related tests, finder rules on the diff.
2. One context packet per changed declaration, inside a token budget.
3. Candidate findings: one model call per packet, in parallel. Each finding has a file, a line, a claim and an input.
4. Verification: a refuter pass drops weak candidates. Where the repo has a checked test profile, the top candidates go to the reproduce stage (decision 048) for a failing test checked independently of the agent.
5. Output: line comments in tiers (proven by a test, likely) and a per-PR graph view with findings pinned to nodes.

Models: Nemotron on Nebius is the product's engine. Other models are judges and comparison arms, reported beside it, never in place of it.

## Blindness

- Sessions and chats that build or tune the reviewer never read Cal.com's golden comments, the recorded tool comments on the Cal.com forks, or per-comment score detail for Cal.com. They see counts.
- Benchmark data lives outside the repo, in `~/Projects/tracehound-bench`. The dataset has no licence file, and Cal.com is AGPL, so neither is copied into this repo.
- The reviewer is frozen (tag) before its one run on the Cal.com PRs.

## Schedule (working days from 8 October)

| Days | Work | Gate |
| --- | --- | --- |
| 1 | Benchmark data and scorer; score the recorded reviews of five tools | Our numbers are reported beside the published ones; the judge prompt is not tuned to close the gap |
| 2 | Diff-only baseline reviewer on the dev set | A first precision and recall for Nemotron with no graph |
| 3–5 | Analyzer on Cal.com and Grafana's TypeScript: symbol-level index, usage lookup | Indexes the monorepo; 20 sampled lookups correct |
| 6–9 | Review pipeline v1 on the dev set | Context-on beats diff-only on dev |
| 10–12 | Refuter pass and the proven tier | Precision up without recall collapsing |
| 13–14 | GitHub Action, PR comments, per-PR graph view | Works on a fresh fork |
| 15–17 | Freeze, one run on the Cal.com PRs, results document | None: whatever it scores is reported |
| 18–20 | Buffer, landing page, README | |

## Fallbacks

- Day 5 gate fails: drop the full graph for large repos and use on-demand TypeScript lookups (definitions, references) per changed declaration.
- Day 9 gate fails: ship diff plus on-demand lookups and report that the graph did not help, as decision 050 did.
- The proven tier cannot install and test Cal.com offline in the sandbox: demonstrate it on Recall and say so.

## Cut

More repair-agent work, Nebius sandboxes (Contree), and the three-bug comparison on Recall as a headline. Finder phase 2b folds into the verification stage.

## Open questions for the owner

1. Do the hackathon rules require Nemotron as the product's engine?
2. Own-money cap for non-Nebius judge and comparison models.
