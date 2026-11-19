# How the leading AI reviewers find bugs

**Read this first**
- **Evidence quality.** This session's network blocks the vendor sites, so vendor pages were read as search excerpts, not whole pages. Read in full: PR-Agent's code, Anthropic's review prompt, Martian's README.
- **Labels.** **D** = documented in the numbered source. **I** = inferred or from a secondary source. **M** = vendor's number with no published method.
- **One premise doesn't match the repo.** The frozen reviewer (pool-verify-v1) never reads the component graph: nothing under `packages/analyzer/src/review/` imports it. Its context is the changed files plus `git grep -w` references (decision 057). Sections 6–8 assume that.
- **Firewall.** Benchmark methodology only; no dataset files opened.

## The tools

**CodeRabbit**
1. Context: clones the repo into a sandbox per review and builds a dependency graph there (D1); maps symbol definitions and references (D4); past reviews in a vector store (D5); 50+ linters and security tools, plus ast-grep (D2).
2. Finding: multi-stage. The agent writes shell scripts (cat, grep, ast-grep) and runs them in the sandbox instead of calling fixed tools (D2, D3). A verification agent then checks each comment and drops low-value ones (D1, D2).
3. Posts: inline comments plus a summary. On your S1 probe it posted a summary and no inline comments.
4. Models: not disclosed. "7–8 model ensemble" (I).
5. Limits: per developer, refilling hourly: Essentials 5 PR reviews an hour, Team 8, Advanced 10, Enterprise 12. Open source is a separate tier that varies with the project's popularity (D4), which fits your 1 an hour. Essentials $24–30 a month (I).

**Greptile**
1. Context: indexes the repo into a graph of files, functions and calls, with a model-written docstring per element. For a changed function it looks up callers, callees and similar code (D6).
2. Finding: v3 replaced a fixed flowchart with an agent loop and tools on the Claude Agent SDK, with sub-agents and about 90% cache hits (D7, D8). Action rate 34.8% → 59.2% (M7).
3. Staying quiet: prompting failed and LLM severity scores were "nearly random". What worked was embedding past comments per team and dropping new ones that resemble down-voted or ignored ones; address rate went from 19% to 55% (D9, self-reported).
4. Models: Anthropic (D8); version and cost not stated.
5. Pricing: now $1 per credit, 1, 3 or 10 credits per review by tier; before, $30 a seat with 50 credits (I31).

**Augment**
1. Context: a semantic index ("Context Engine") that pulls call sites, type definitions, tests and history (D12).
2. Finding: an agent with repo-navigation tools; it says tools that grep around the diff miss context (D11). I could not read how it filters.
3. Posts: Precise and Thorough modes; "Thorough catches 50% more" (M).
4. Models: GPT-5.2; "the GPT series has performed best" (D11, D12). About $1.50 per review (D12).
5. Pricing: credit plans (I).

**Cursor Bugbot**
1. Context: first the diff only; now an agent that fetches context itself (D14).
2. Finding: first, parallel passes over the diff with a majority vote (D14); eight passes with files shuffled each time (I). Then fully agentic. About 40 experiments were scored online by resolution rate (flagged bugs fixed by merge, judged by an LLM) and offline on a human-annotated set. Resolution went 52% → 70% → 78%, bugs flagged per run 0.4 → 0.7 (D14, D15).
3. Posts: bugs only, inline; rules learned from PR feedback (D15).
4. Models: not named.
5. Pricing: was $40 a user with 200 PRs a month; usage-billed since May 2026, about $1–1.50 a run (I31).

**PR-Agent** (code read at `1b19ab2`; all D16)
1. Context: the diff only. Hunks grow by 5 lines before and 1 after, plus up to 10 more to reach the enclosing function. One repo instruction file. No code index.
2. Finding: `/review` is one call on the whole diff, clipped to 32,000 tokens; chunking is opt-in. `/improve` asks for 3 suggestions per chunk, then a mandatory second call scores each 0–10, with forced zeros for docstrings, unused imports and doubts about code outside the diff.
3. Posts: a summary plus at most 6 inline issues; an empty list is allowed. An optional confidence floor has a written rubric (off by default).
4. Models: default `gpt-6.1-sol`, temperature 0.2, medium reasoning.
5. Pricing: free; you pay the model. Qodo's hosted product adds specialised agents and a judge agent that de-duplicates and filters (D17).

**GitHub Copilot**
1. Context: agentic tool calls for code, directory tree and references, run on Actions (D20); instruction files; CodeQL by default, ESLint and PMD optional (D21).
2. Finding: the agent explores the repo (D19). No verification step is described.
3. Posts: comments in 71% of reviews (D19), so silent in 29%; 5.1 comments per review (I).
4. Models: not named.
5. Pricing: one premium request per review (D21).

**Graphite Agent**
"Codebase-aware", "under 5% negative comments" (M23). The only method detail is that it is tuned on acceptance, up-vote and down-vote rates (D22). It caught 6% and 18% on two rivals' benchmarks (D10, D28), so it is quiet by design. Team plan $40 a seat (I23).

**Others with real detail**
- **Anthropic's open-source review prompt** (D24): a cheap model checks the PR needs review → 4 parallel reviewers (2 for rule compliance, 2 bug hunters with different scopes) → one validation sub-agent per issue → only validated issues are posted, against an explicit do-not-flag list. The managed product takes about 20 minutes and $15–25 per review (I25).
- **ByteDance BitsAI-CR** (D26): one fine-tuned model proposes from 219 review rules, a second filters. 75% precision. It tracks whether flagged lines later changed.

## Benchmarks

| Benchmark | Set | Scoring | Result and limit |
|---|---|---|---|
| Greptile, vendor (D10) | 50 PRs, 5 repos, one re-introduced real bug each | Catch rate of that one bug; defaults; false positives ignored | Greptile 82%, Cursor 58, Copilot 54, CodeRabbit 44, Graphite 6 |
| Augment, vendor (D13) | Same 50 PRs, golden comments it expanded | Precision, recall, F | Augment about 65 / 55 / 59 |
| Martian, independent (D27) | Offline: those 50 PRs, 173 golden comments, three judge models. Online: fresh PRs | Online credit when the developer fixed what the bot flagged | Says the static set may be in training data |
| Qodo, vendor (D18) | 100 merged PRs, 580 injected issues | LLM judge | Qodo F 60.1%; bugs are synthetic (D30) |
| Macroscope, vendor (D28) | 118 self-contained runtime bugs, 45 repos | Detection rate | Macroscope 48%, CodeRabbit 46, Bugbot 42, Greptile 24, Graphite 18 |
| GitHub ReviewBench (D29) | 219 PRs, 187 repos, TypeScript the largest share | One LLM judge, mean of 3 runs | Everything public, no held-out set |

Every vendor wins its own benchmark. Greptile scores 82% on its own and 24% on Macroscope's.

## 6. Five techniques, by gain per effort

First, at $0: count how many of the 19 missed bugs sat in a chunk that returned nothing. No technique recovers those.

1. **Rank and cap instead of verify and drop.** Order findings by agreement between your two reviewers and post the top few per PR. This is Bugbot's vote and PR-Agent's cap used for ordering, not deletion. On your old dev set the verifier cut true positives from 45 to 35 and from 46 to 34 on Nemotron 3.5 without raising F (`docs/bench/levers-v2.md`). It is a replay of saved records. Comments per PR rise to the cap.
2. **Compiler-resolved context.** Give the generator the callers, callees and types of each changed declaration from ts-morph, not grep hits. Greptile, CodeRabbit and Augment all do this, and you already own the resolver. This is C2 in your backlog.
3. **A verifier that looks things up.** Let it request a few deterministic lookups (definition, callers, a file range) before it drops a finding, and use it only where the two reviewers disagree. Anthropic's prompt and CodeRabbit's scripts work this way. Your fixed-context verifier dropped 10 of 32 true positives (decision 058).
4. **A second draw with files shuffled, then union, rank and cap.** Bugbot's first design. It doubles cost to about $0.09. It differs from your lost vote (064) because the union keeps findings.
5. **A tool-using agent loop.** The largest documented gains come from this (Greptile, Bugbot, Copilot). It is last because it is a rebuild, and Nemotron made 0 graph-tool calls in 80 repair runs.

Not ranked: a stronger model. Every vendor above runs frontier models, and your 076j rows will measure the gap.

## 7. After the held-out test

All five wait; the frozen pipeline is what runs.
- **Fits at once, $0:** technique 1 as a replay on dev and the opened held-out records, and the coverage count for 2.
- **Fits the money once:** one paid replay, about $2.20 by your backlog's estimate. Spend it on 2.
- **Needs new labelled cases:** 3 and 4. The held-out set becomes a dev set once scored, so a gain there is "dev only".
- **Does not fit:** 5.

## 8. Where TraceHound can differ

**It can't:**
- **Raw bug-finding.** The model and the agent loop set it, and vendors spend $1–25 per review.
- **Repo graph as a feature.** Greptile, CodeRabbit, Augment and Macroscope all claim one.
- **Learned suppression.** It needs users' feedback.

**It could:**
- **Cost and openness.** About $0.045 against $1–1.50 (Bugbot, Augment) and $15–25 (Anthropic), on open weights that can run in-house. Catching within a few bugs of CodeRabbit at that price is a real claim.
- **Checkable comments.** A cross-file finding that cites the compiler-resolved edge (file, symbol, line) can be verified by the reader; vendors' graphs are not shown. Today this is a hypothesis: the reviewer doesn't use the graph, and the graph did not help repair (decision 050).
- **Model-free warnings.** Your change-set checks (payload type changed, removed declaration still referenced) cannot hallucinate, though they made 0 dev findings so far.
- **Measurement.** None of the benchmarks above has a blind held-out set. Yours does, which earns credibility, not catches.

## Sources
1. https://coderabbit.ai/blog/context-engineering-ai-code-reviews
2. https://coderabbit.ai/blog/how-coderabbits-agentic-code-validation-helps-with-code-reviews
3. https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run
4. https://docs.coderabbit.ai/integrations/code-graph-analysis · https://docs.coderabbit.ai/management/plans · https://docs.coderabbit.ai/management/rate-limits
5. https://lancedb.com/blog/case-study-coderabbit
6. https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context
7. https://greptile.com/blog/greptile-v3-agentic-code-review
8. https://claude.com/customers/greptile
9. https://www.greptile.com/blog/make-llms-shut-up
10. https://greptile.com/benchmarks
11. https://www.augmentcode.com/blog/how-we-built-high-quality-ai-code-review-agent
12. https://www.augmentcode.com/blog/introducing-augment-code-review
13. https://www.augmentcode.com/blog/we-benchmarked-7-ai-code-review-tools-on-real-world-prs-here-are-the-results
14. https://cursor.com/blog/building-bugbot
15. https://cursor.com/blog/bugbot-learning
16. https://github.com/qodo-ai/pr-agent
17. https://www.qodo.ai/blog/introducing-qodo-2-0/
18. https://qodo.ai/blog/how-we-built-a-real-world-benchmark-for-ai-code-review
19. https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/
20. https://github.blog/changelog/2026-03-05-copilot-code-review-now-runs-on-an-agentic-architecture/
21. https://docs.github.com/en/copilot/concepts/agents/code-review
22. https://www.braintrust.dev/blog/graphite
23. https://staging-graphite-splash.vercel.app/blog/introducing-graphite-agent-and-pricing
24. https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md
25. https://techcrunch.com/2026/03/09/anthropic-launches-code-review-tool-to-check-flood-of-ai-generated-code/
26. https://arxiv.org/abs/2501.15134
27. https://github.com/withmartian/code-review-benchmark
28. https://blog.macroscope.com/blog/code-review-benchmark
29. https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/
30. https://deepsource.com/blog/ai-code-review-benchmarks
31. https://macroscope.com/content/greptile-pricing-2026 · https://repowise.dev/blog/comparisons/cursor-bugbot-pricing-alternatives
