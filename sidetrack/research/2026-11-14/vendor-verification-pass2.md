Most of the vendor half does not hold up as documented: the vendor hosts are still blocked, so those claims drop to I (excerpt-only). The PR-Agent, Anthropic and repo claims hold, with corrections; one repo claim was my error.

**Network:** WebFetch reached only `claude.com`, `cloud.google.com` and `raw.githubusercontent.com`. Every other source host is still blocked.

**Repo:** fetched. The clone was at `580ede7`, main is `11f639e`, three commits ahead; they touch only `.agents/LOG.md`, `.agents/STATE.md` and `docs/budget.md`. Everything below is read from `origin/main`.

## A. Verification

PR-Agent lines are in `pr_agent/settings/configuration.toml` at `1b19ab2` unless named.

| Claim | Source | Verdict | Quote or corrected text |
|---|---|---|---|
| PR-Agent model, temperature, reasoning | `:9`, `:86`, `:119` | confirmed, D | `model="gpt-6.1-sol"`, `temperature=0.2`, `reasoning_effort = "medium"` |
| 32,000-token clip | `:58`, `:78` | corrected, D | A 32,000-token budget cap (`max_model_tokens = 32000`); oversize patches are clipped (`large_patch_policy = "clip"`) |
| Hunks +5 / +1, up to 10 more | `:71`, `:72`, `:70` | confirmed, D | Each is added to git's 3 default lines |
| 0–10 scoring, forced zeros | `code_suggestions/pr_code_suggestions_reflect_prompts.toml:58`, `:38–43`; `:298` | confirmed, D | Drop threshold defaults to 1, so only zeros are dropped |
| 3 suggestions per chunk; at most 6 inline issues | `:304`; `:218`, `:215` | confirmed, D | `num_code_suggestions_per_chunk=3`; `num_max_findings = 6` |
| Anthropic prompt: 4 reviewers, validation | prompt file lines 31–39, 56–58 | corrected, D | "Launch 4 agents in parallel"; validation sub-agents cover issues from the two bug agents |
| Anthropic 20 minutes, $15–25 | claude.com/blog/code-review | confirmed, I → D | "average review takes around 20 minutes"; "generally average $15–25" |
| Greptile on the Claude Agent SDK, ~90% cache | claude.com/customers/greptile | confirmed, D | "cache hit rates close to 90%". Model is stated: "Greptile runs on Opus 4.5." |
| CodeRabbit writes shell scripts | cloud.google.com post | confirmed, D | "creates shell scripts to navigate the code" |
| CodeRabbit 50+ linters | same | corrected | Page says "20+ linters and security scanners"; "50+" is excerpt-only, I |
| CodeRabbit verification agent drops comments | same | not found | Only "LLM-generated verification scripts"; I |
| CodeRabbit 5/8/10/12 an hour; OSS varies with popularity | docs.coderabbit.ai | blocked, D → I | Unchanged. `docs/live-setup.md:76` records OSS as 1–10 an hour |
| Greptile 34.8% → 59.2%; 19% → 55%; "nearly random" | greptile.com | blocked; M, I, I | The first is absent from the Anthropic page |
| Greptile credits | greptile.com docs | blocked, I, corrected | Base 1, Plus 3, Apex 10 credits; an Auto setting picks one per PR |
| Bugbot 52 → 70 → 78%, 0.4 → 0.7, ~40 experiments | cursor.com | blocked, D → I | Excerpts of the primary pages |
| Bugbot eight shuffled passes; usage billing since May 2026 | secondary sites only | blocked, I | Weakest |
| Augment GPT-5.2, ~$1.50, 65/55/59 | augmentcode.com | blocked, D → I | Recall appears as 55 and as 57 |
| Copilot 71%; CodeQL on by default | github.blog, docs.github.com | blocked, D → I | Unchanged |
| Copilot 5.1 comments | one secondary site | not found | Don't rule on it |
| Graphite source 23 | live page: graphite.com/blog/introducing-graphite-agent-and-pricing | blocked, I | $40 Team stays I |
| Martian: 50 PRs, 173 golden comments, 3 judges | README | confirmed, D | "golden comments (173 total)" |
| ReviewBench: 219 PRs, mean of 3 runs, one judge | `docs/METHODOLOGY.md:116`, `:671–674`, `:262` | confirmed, D | "187 repos" and "TypeScript largest" not in that file: I |
| Greptile, Augment, Qodo, Macroscope rows | vendor hosts | blocked, D → I | Macroscope's "118 bugs, 45 repos" came from a third party |
| Reviewer imports no graph code | `git grep -h -o -E "from ['\"][^'\"]+['\"]" origin/main -- packages/analyzer/src/review/` | confirmed | Only `../llm/*`, `../bench/types.ts`, `../naming/llm.ts`, node, zod, and a type-only `ChatClient` from `../agent/decider.ts` (`review.ts:8`) |
| 050; 0 of 80 | `docs/decisions.md:2327`, `:2337` | confirmed | "Graph tool calls: 0 in 80 graph-on runs" |
| 057; 058; 064 | `:2720`, `:2740`; `:2788`, `:2846`; `:3248` | confirmed | `git grep -n -w -F`; "kept 22 of the 32 TPs (dropped 10)"; heading "a loss" |
| levers-v2: 45→35, 46→34, F not raised | `docs/bench/levers-v2.md:45–46`, `:111–112` | corrected | Holds under judge v1 (F 52.3→50.7, 55.4→50.0). Under judge x1: 45→37, 47→38, F 53.6→54.4, 56.3→55.9. Every interval includes zero |
| C2; $2.20 | `docs/plan/after-heldout.md:23`, `:22` | corrected | "≈ $2.17" (C1), "≈ $2.2" (C2), from non-TypeScript unit costs |
| Change-set checks made 0 dev findings | `docs/decisions.md:3289`; `after-heldout.md:26` | corrected, my error | The 0 findings belong to `tracehound contracts`, a different stage, skipped in 37 of 40 cases. I found no record of change-set warnings scored as findings |

**Greptile budget:** 2 + 38 + 29–35 = 69–75 credits at Base, leaving 25–31. That holds only while the tier is fixed at Base (`docs/live-setup.md:58`: "Use base reviews only"). Under Auto one review can cost 3 or 10. Check the dashboard setting, and that the balance equals 100 minus completed reviews.

## B. Sections 6–8, changed parts

- **Technique 1 and the stop/go rule.** No collision with the registered rule: `docs/decisions.md:4213` judges frozen A0, and technique 1 comes later. For a later test, set the cap at or below 2 × CodeRabbit's mean inline comments per PR from P1. One PR with 6 is not a mean; S1 had 0 on both.
- **Technique 1's evidence.** Say "F unchanged within noise on both judges".
- **Technique 4's cost.** 2 × the $0.045 median = $0.09 for a typical PR. The mean is $2.82003 ÷ 40 = $0.0705, so a second draw is at most about $0.14 per PR, $5.64 per 40-case run. Budget on the mean.
- **Section 7, money.** `docs/budget.md:148` holds $6.05 unallocated, which needs a new line and funds H1's cap reset first; H1 is $3.15 (`:145`), the reserve $3.00. At R1's mean, 29 held-out cases cost about $2.04, so a ≈ $2.17 replay fits on paper. Rule on it only after R1's console reading and decision 077: the ledger has under-counted before (`:86`).
- **Section 8, cost.** "If the held-out run shows A0's catches close to CodeRabbit's, the price gap would be the claim. No CodeRabbit number exists yet."
- **Section 8, model-free warnings.** Drop "0 dev findings". The change-set warnings are untested as review comments.
- **Section 8, held-out.** Confirmed for ReviewBench ("not a separate public/private partition", `METHODOLOGY.md:121`) and Martian offline (all open-sourced). Martian online has no blind set; it samples fresh public PRs the bots already reviewed. Greptile, Augment and Qodo publish their sets (excerpt-only). Macroscope: not established. Reword to "none of the five I could check".

## C. From memory or guessed

- "Silent in 29%" was my subtraction from 71%.
- "$0.09" doubled the figure in your message; "$2.20" was rounded.
- The change-set claim conflated two modules.
- The first pass graded excerpt-only claims D; "50+ linters" and "model not stated" were wrong.
- The S1 and P1 comment counts come from `STATE.md`. R1's median is from your message; `run/out/bunny.r1.md` is not in this repo.
- Section 6's ranking is judgement, not measurement.

## D. Brain note draft for Holt (not pushed)

> Research pass on how other reviewers work (2026-11-14; read-only; leads, not rulings).
> The frozen reviewer does not read the component graph; its context is changed files plus grep references.
> Candidates for after the held-out result, by gain per effort: rank and cap in place of verify and drop (a $0 replay); compiler-resolved context for the generator (backlog C2); a verifier that looks things up before dropping; a second shuffled draw merged by union; an agent loop last.
> Each needs a pre-registered gate, and a claim needs cases nobody tuned on.
> Likely differences are cost on open weights and comments that cite a compiler-resolved edge; the second is a hypothesis until the reviewer uses the graph.
