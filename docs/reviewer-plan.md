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

## Schedule

Superseded on 15 October by "Schedule from 16 October" below. Done so far: 054 (scorer, 14 October), 055 (diff-only baseline, 15 October), 056 (diff-only verifier, 15 October: no gain, the pre-set rule kept every finding; not in the pipeline).

## Fallbacks

- Context does not beat diff-only on dev (057): ship whichever does better and report that the context did not help, as decision 050 did.
- The verifier lowers dev F (056): ship without it and say so.
- The proven tier (reproduce stage on findings) is cut from the benchmark run. Demonstrate it on Recall only if 26 October has time.

## Cut

More repair-agent work, Nebius sandboxes (Contree), and the three-bug comparison on Recall as a headline. Finder phase 2b folds into the verification stage.

## Hackathon rules that shape the plan (Devpost, checked 15 October)

- Deadline: 30 October 2026, 10:00 PDT (22:30 IST). Submit by 29 October.
- The project must call Nebius Token Factory (or run on Nebius AI Cloud) and use at least one NVIDIA open model. Nemotron on Nebius is the product's engine; other models can only be judges or comparison arms.
- Required: a working demo URL that judges can use free until 15 December; a public YouTube video under 3 minutes; a public repo with an open licence and a README that highlights the NVIDIA models and Token Factory; feedback on Nebius and NVIDIA tools; a summary of what changed since 26 August, because the repo predates the hackathon.
- Judging: a pass/fail viability stage, then four equally weighted criteria: technological implementation, design, potential impact, quality of the idea. Track: Coding and Agentic Engineering.
- Ten $100 prizes for the most valuable feedback: FEEDBACK.md is the source.

## Who does what (from 15 October)

- Chat (Claude): plans, writes every prompt, and checks every PR from GitHub before Sunny merges.
- Relay (Claude Code builder and reviewer, ~/Projects/TraceHound): the benchmark lane, one job at a time.
- Codex (ChatGPT Plus, ~/Projects/TraceHound-codex, a separate worktree): the product lane on disjoint paths: the GitHub Action, then the demo. Also reviews every PR on GitHub as an independent second model.
- Grok (Premium): no code. An independent audit of every results doc after it merges (arithmetic, method, overclaims, tuning leaks), X posts and the demo video's script. Grok never sees Cal.com data or the chat's discussion.
- Codex never touches the benchmark data, and relay never touches the action's paths. AGENTS.md holds the rules every non-Claude agent follows.

## Schedule from 16 October

| Date | Benchmark lane (relay) | Product lane (Codex) |
| --- | --- | --- |
| 16 Oct | 056 verification pass | GitHub Action posting line comments |
| 17–18 Oct | 057 context: full changed files plus repo search for changed names, all 40 dev PRs | Demo repo with the action installed and real review comments on open PRs |
| 19–20 Oct | 058 precision round, chosen by 057's result: a verifier that sees the context, or keeping only findings that repeated runs agree on; a second judge cross-checks the scorer | Landing page section linking the demo and the benchmark tables |
| 21–22 Oct | Spare round for the weakest stage | README for judges: setup, Token Factory use, licence |
| 23 Oct | Freeze (tag), then the one Cal.com run | |
| 24–25 Oct | Results document | |
| 26 Oct | Devpost write-up, FEEDBACK.md cleanup, "what changed since 26 August" | |
| 27–29 Oct | Video (under 3 minutes), submit on 29 October | |

## Open questions for the owner

1. Own-money cap for non-Nebius comparison models, if any are run.
